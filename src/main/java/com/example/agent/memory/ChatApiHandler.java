package com.example.agent.memory;

import com.example.agent.application.ConversationService;
import com.example.agent.core.blocker.RequestContext;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.tools.ToolRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Web Chat API Handler
 * 
 * 处理 POST /api/chat 请求，返回 SSE 流式响应
 * 完整复用 CLI 的 Agent 循环：LLM 流式调用 → 工具执行 → 继续循环
 */
public class ChatApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ChatApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final int MAX_TURNS = 10;

    // 会话缓存：sessionId -> Conversation
    private static final Map<String, Conversation> sessions = new ConcurrentHashMap<>();

    public static Map<String, Conversation> getSessions() {
        return sessions;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            String response = "{\"error\":\"Method not allowed\"}";
            exchange.sendResponseHeaders(405, response.getBytes(StandardCharsets.UTF_8).length);
            exchange.getResponseBody().write(response.getBytes(StandardCharsets.UTF_8));
            exchange.close();
            return;
        }

        exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache");
        exchange.getResponseHeaders().set("Connection", "keep-alive");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, 0);

        PrintWriter writer = new PrintWriter(exchange.getResponseBody(), true);

        try {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonNode json = objectMapper.readTree(requestBody);
            
            String sessionId = json.has("session") ? json.get("session").asText() : "default";
            String userMessage = json.has("message") ? json.get("message").asText() : "";

            if (userMessage.isEmpty()) {
                sendSseEvent(writer, "error", "{\"message\":\"消息不能为空\"}");
                return;
            }

            logger.info("Web Chat 收到消息: session={}, message={}", sessionId, userMessage);

            Conversation conversation = getOrCreateConversation(sessionId);
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            conversationService.addUserMessage(conversation, userMessage);

            executeAgentLoop(sessionId, conversation, conversationService, writer);

        } catch (LlmException e) {
            logger.error("LLM 调用失败", e);
            sendSseEvent(writer, "error", "{\"message\":\"" + escapeJson(e.getMessage()) + "\"}");
        } catch (Exception e) {
            logger.error("处理聊天请求失败", e);
            sendSseEvent(writer, "error", "{\"message\":\"" + escapeJson(e.getMessage()) + "\"}");
        } finally {
            writer.flush();
            writer.close();
            exchange.close();
        }
    }

    /**
     * 执行 Agent 循环：LLM → 工具调用 → 继续，直到没有工具调用
     */
    private void executeAgentLoop(String sessionId, Conversation conversation, ConversationService conversationService, PrintWriter writer) throws LlmException {
        LlmClient llmClient = ServiceLocator.get(LlmClient.class);
        ToolRegistry toolRegistry = ServiceLocator.get(ToolRegistry.class);
        List<Tool> tools = toolRegistry.toTools();

        for (int turn = 0; turn < MAX_TURNS; turn++) {
            List<Message> messages = new ArrayList<>(conversationService.getContextForInference(conversation));
            
            // 确保 system message 在开头（去重）
            messages = ensureSystemMessageFirst(messages);
            
            StringBuilder contentBuilder = new StringBuilder();
            List<Map<String, Object>> pendingToolCalls = new ArrayList<>();

            sendSseEvent(writer, "thinking", "{\"turn\":" + (turn + 1) + "}");

            ChatResponse response = llmClient.chatStream(messages, tools, (StreamChunk chunk) -> {
                if (chunk.getContent() != null && !chunk.getContent().isEmpty()) {
                    contentBuilder.append(chunk.getContent());
                    sendSseEvent(writer, "content", "{\"content\":\"" + escapeJson(chunk.getContent()) + "\"}");
                }
                
                // 实时处理 tool call delta
                if (chunk.isToolCall() && chunk.getToolCallDeltas() != null) {
                    for (var delta : chunk.getToolCallDeltas()) {
                        String toolName = delta.getFunction().getName();
                        String arguments = delta.getFunction().getArguments();
                        
                        // 检查是否已发送过这个 tool_start
                        boolean alreadySent = pendingToolCalls.stream()
                            .anyMatch(tc -> tc.get("name").equals(toolName));
                        
                        if (!alreadySent) {
                            Map<String, Object> toolCall = new HashMap<>();
                            toolCall.put("name", toolName);
                            toolCall.put("args", arguments);
                            pendingToolCalls.add(toolCall);
                            
                            sendSseEvent(writer, "tool_start", "{\"name\":\"" + escapeJson(toolName) + "\",\"args\":" + escapeJsonForValue(arguments) + "}");
                        }
                    }
                }
            });

            Message assistantMessage = response.getFirstMessage();
            if (assistantMessage == null) {
                sendSseEvent(writer, "error", "{\"message\":\"未收到有效响应\"}");
                return;
            }

            // 保存助手消息
            if (contentBuilder.length() > 0 && (assistantMessage.getContent() == null || assistantMessage.getContent().isBlank())) {
                assistantMessage.setContent(contentBuilder.toString());
            }
            
            // 诊断日志：检测空内容返回
            String finalContent = assistantMessage.getContent();
            boolean hasContent = finalContent != null && !finalContent.isBlank();
            boolean hasToolCalls = assistantMessage.getToolCalls() != null && !assistantMessage.getToolCalls().isEmpty();
            
            if (!hasContent && !hasToolCalls) {
                String finishReason = (response.getChoices() != null && !response.getChoices().isEmpty()) 
                    ? response.getChoices().get(0).getFinishReason() : "unknown";
                logger.warn("⚠️ LLM 返回空内容：sessionId={}, turn={}, finishReason={}, contentChunks={}, model={}", 
                    sessionId, turn + 1, finishReason, contentBuilder.length(), response.getModel());
                logger.debug("📊 响应详情：usage={}, messageCount={}", 
                    response.getUsage(), response.getChoices() != null ? response.getChoices().size() : 0);
            } else {
                logger.info("✅ LLM 响应正常：sessionId={}, turn={}, contentLength={}, hasToolCalls={}", 
                    sessionId, turn + 1, hasContent ? finalContent.length() : 0, hasToolCalls);
            }
            
            conversationService.addAssistantMessage(conversation, assistantMessage, response.getUsage());

            // 检查是否有工具调用
            List<ToolCall> toolCalls = assistantMessage.getToolCalls();
            if (toolCalls == null || toolCalls.isEmpty()) {
                // 没有工具调用，对话结束
                sendSseEvent(writer, "done", "{}");
                return;
            }

            // 执行工具调用（tool_start 已在流式处理时发送）
            executeToolCalls(toolCalls, toolRegistry, conversation, conversationService, writer);
        }

        sendSseEvent(writer, "done", "{}");
    }

    /**
     * 执行工具调用并将结果添加到对话
     */
    private void executeToolCalls(List<ToolCall> toolCalls, ToolRegistry toolRegistry, 
                                   Conversation conversation, ConversationService conversationService, PrintWriter writer) {
        for (ToolCall toolCall : toolCalls) {
            String toolName = toolCall.getFunction().getName();
            String arguments = toolCall.getFunction().getArguments();
            
            sendSseEvent(writer, "tool_start", "{\"name\":\"" + escapeJson(toolName) + "\",\"args\":" + escapeJsonForValue(arguments) + "}");

            try {
                RequestContext.set(RequestContext.ContextType.WEB);
                String result = toolRegistry.execute(toolName, arguments);
                conversationService.addToolResult(conversation, toolCall.getId(), toolName, result);
                String truncatedResult = result.length() > 2000 ? result.substring(0, 2000) + "..." : result;
                sendSseEvent(writer, "tool_result", "{\"name\":\"" + escapeJson(toolName) + "\",\"success\":true,\"result\":\"" + escapeJson(truncatedResult) + "\"}");
            } catch (Exception e) {
                String errorMsg = e.getMessage();
                conversationService.addToolResult(conversation, toolCall.getId(), toolName, "错误: " + errorMsg);
                sendSseEvent(writer, "tool_result", "{\"name\":\"" + escapeJson(toolName) + "\",\"success\":false,\"error\":\"" + escapeJson(errorMsg) + "\"}");
            } finally {
                RequestContext.clear();
            }
        }
    }

    private Conversation getOrCreateConversation(String sessionId) {
        return sessions.computeIfAbsent(sessionId, id -> {
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            String systemPrompt = "You are Hippo, a helpful AI assistant with access to various tools including file operations, code search, and bash commands. Always respond in the same language as the user's message.";
            return conversationService.create(systemPrompt, 4096, id);
        });
    }

    /**
     * 确保消息列表第一个是 system message，并去重
     */
    private List<Message> ensureSystemMessageFirst(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return messages;
        }
        
        // 移除所有 system message
        List<Message> nonSystemMessages = new ArrayList<>();
        Message firstSystem = null;
        for (Message msg : messages) {
            if ("system".equals(msg.getRole())) {
                if (firstSystem == null) {
                    firstSystem = msg;
                }
            } else {
                nonSystemMessages.add(msg);
            }
        }
        
        // 重新组装：system 在前，其他在后
        if (firstSystem != null) {
            List<Message> result = new ArrayList<>();
            result.add(firstSystem);
            result.addAll(nonSystemMessages);
            return result;
        }
        
        return nonSystemMessages;
    }

    private void sendSseEvent(PrintWriter writer, String event, String data) {
        writer.write("event: " + event + "\n");
        writer.write("data: " + data + "\n\n");
        writer.flush();
    }

    private String escapeJson(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t");
    }

    private String escapeJsonForValue(String input) {
        if (input == null) return "null";
        try {
            return input;
        } catch (Exception e) {
            return "\"" + escapeJson(input) + "\"";
        }
    }
}
