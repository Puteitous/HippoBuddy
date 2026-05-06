package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.core.blocker.RequestContext;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.truncation.TruncationService;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.prompt.PromptLibrary;
import com.example.agent.prompt.PromptService;
import com.example.agent.service.TokenEstimatorFactory;
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
    private static final int MAX_TURNS = 50;

    // 会话缓存：sessionId -> Conversation
    private static final Map<String, Conversation> sessions = new ConcurrentHashMap<>();
    // 会话文件最后修改时间缓存：sessionId -> lastModifiedTime
    private static final Map<String, Long> sessionFileLastModified = new ConcurrentHashMap<>();
    // 会话加载指标缓存：sessionId -> SessionLoadMetrics
    private static final Map<String, SessionLoadMetrics> sessionLoadMetrics = new ConcurrentHashMap<>();
    private static volatile boolean memoryInitialized = false;
    
    /**
     * 会话加载指标
     */
    private static class SessionLoadMetrics {
        long loadTimeMs;          // 加载耗时
        int messageCount;         // 消息数量
        long fileSizeBytes;       // 文件大小
        boolean fromCache;        // 是否命中缓存（文件无变化）
        long lastModifiedTime;    // 文件最后修改时间
        long timestamp;           // 加载时间戳
        
        SessionLoadMetrics() {
            this.timestamp = System.currentTimeMillis();
        }
        
        @Override
        public String toString() {
            return String.format("SessionLoadMetrics{loadTimeMs=%dms, messages=%d, fileSize=%dKB, fromCache=%b}",
                loadTimeMs, messageCount, fileSizeBytes / 1024, fromCache);
        }
    }

    // 工具输出截断服务（参照 CLI 实现）
    private static final TruncationService truncationService = new TruncationService(TokenEstimatorFactory.getDefault());

    public static Map<String, Conversation> getSessions() {
        return sessions;
    }

    /**
     * 确保 Memory 模块已初始化（Web 端独立启动时调用）
     */
    private static void ensureMemoryInitialized() {
        if (memoryInitialized) {
            return;
        }
        synchronized (ChatApiHandler.class) {
            if (memoryInitialized) {
                return;
            }
            try {
                com.example.agent.core.di.ServiceLocator.get(com.example.agent.memory.MemoryRetriever.class);
                memoryInitialized = true;
                logger.info("✅ Web 端 Memory 模块已就绪（由 CLI 初始化）");
            } catch (Exception e) {
                // DI 容器中没有 MemoryRetriever，说明 Web 端独立启动
                logger.info("Web 端独立启动，初始化 Memory 模块...");
                try {
                    com.example.agent.config.Config config = com.example.agent.config.Config.getInstance();
                    java.nio.file.Path memoryRoot = com.example.agent.logging.WorkspaceManager.getUserMemoryDir();
                    com.example.agent.memory.MemoryModule.initialize(config, memoryRoot);
                    
                    // Web 端独立启动时，还需要创建 ConversationService
                    try {
                        com.example.agent.core.di.ServiceLocator.get(com.example.agent.application.ConversationService.class);
                    } catch (Exception ex) {
                        logger.info("DI 容器中未找到 ConversationService，创建新实例...");
                        com.example.agent.service.TokenEstimator tokenEstimator = 
                            com.example.agent.service.TokenEstimatorFactory.getDefault();
                        com.example.agent.llm.client.LlmClient llmClient = 
                            com.example.agent.core.di.ServiceLocator.get(com.example.agent.llm.client.LlmClient.class);
                        com.example.agent.application.ConversationService conversationService = 
                            new com.example.agent.application.ConversationService(
                                tokenEstimator, 
                                llmClient, 
                                config.getContext()
                            );
                        com.example.agent.core.di.ServiceLocator.registerSingleton(
                            com.example.agent.application.ConversationService.class, 
                            conversationService
                        );
                        logger.info("✅ ConversationService 已创建并注册到 DI 容器");
                    }
                    
                    memoryInitialized = true;
                    logger.info("✅ Web 端 Memory 模块初始化完成");
                } catch (Exception initEx) {
                    logger.error("Web 端 Memory 模块初始化失败", initEx);
                }
            }
        }
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
            String systemPromptOverride = json.has("systemPrompt") ? json.get("systemPrompt").asText() : null;
            String editMessageId = json.has("editMessageId") ? json.get("editMessageId").asText() : null;

            if (userMessage.isEmpty()) {
                sendSseEvent(writer, "error", "{\"message\":\"消息不能为空\"}");
                return;
            }

            logger.info("Web Chat 收到消息: session={}, message={}, edit={}", sessionId, userMessage, editMessageId != null);

            ensureMemoryInitialized();

            Conversation conversation = getOrCreateConversation(sessionId, systemPromptOverride);
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);

            if (editMessageId != null && !editMessageId.isEmpty()) {
                conversationService.editUserMessage(conversation, editMessageId, userMessage);
            } else {
                conversationService.addUserMessage(conversation, userMessage);
            }

            executeAgentLoop(sessionId, conversation, conversationService, writer);

        } catch (LlmException e) {
            logger.error("LLM 调用失败", e);
            sendSseEvent(writer, "error", "{\"message\":\"" + escapeJson(e.getMessage()) + "\"}");
        } catch (Exception e) {
            logger.error("处理聊天请求失败", e);
            sendSseEvent(writer, "error", "{\"message\":\"" + escapeJson(e.getMessage()) + "\"}");
        } finally {
            // 发送结束标记，确保前端能正确识别流结束
            try {
                writer.write("data: [DONE]\n\n");
                writer.flush();
            } catch (Exception e) {
                logger.debug("发送结束标记失败", e);
            }
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
                
                // 发送错误事件给前端
                String errorMessage = switch (finishReason) {
                    case "length" -> "响应长度达到限制，请减少上下文或增加 max_tokens";
                    case "content_filter" -> "内容被安全过滤器阻止";
                    default -> "LLM 未返回有效内容，请重试";
                };
                sendSseEvent(writer, "error", "{\"message\":\"" + escapeJson(errorMessage) + "\"}");
                return;
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
                String rawResult = toolRegistry.execute(toolName, arguments);
                
                // 参照 CLI：使用 TruncationService 智能截断工具输出
                String truncatedResult = truncationService.truncateToolOutput(toolName, rawResult);
                
                conversationService.addToolResult(conversation, toolCall.getId(), toolName, truncatedResult);
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

    private Conversation getOrCreateConversation(String sessionId, String systemPromptOverride) {
        Conversation existing = sessions.get(sessionId);
        if (existing != null) {
            logger.info("使用缓存的会话：sessionId={}, 当前消息数={}", sessionId, existing.getMessages().size());
            if (!existing.getMessages().isEmpty()) {
                logger.info("缓存会话的第一条消息：role={}", existing.getMessages().get(0).getRole());
            }
            
            // 优化：只在文件有变化时才重新加载
            if (shouldReloadSession(sessionId)) {
                logger.info("检测到会话文件有变化，重新加载：sessionId={}", sessionId);
                
                // 记录加载指标
                long startTime = System.currentTimeMillis();
                SessionLoadMetrics metrics = new SessionLoadMetrics();
                
                ConversationService conversationService = ServiceLocator.get(ConversationService.class);
                ConversationService.ResumeResult resumeResult = conversationService.resumeConversation(existing, sessionId);
                
                long loadTime = System.currentTimeMillis() - startTime;
                metrics.loadTimeMs = loadTime;
                metrics.messageCount = resumeResult.getTotalMessages();
                metrics.fromCache = false;
                
                // 获取文件大小
                try {
                    java.nio.file.Path jsonlFile = getSessionJsonlPath(sessionId);
                    if (java.nio.file.Files.exists(jsonlFile)) {
                        metrics.fileSizeBytes = java.nio.file.Files.size(jsonlFile);
                    }
                } catch (IOException e) {
                    logger.debug("获取文件大小失败：sessionId={}", sessionId, e);
                }
                
                sessionLoadMetrics.put(sessionId, metrics);
                
                if (resumeResult.isResumed()) {
                    logger.info("Web 会话刷新：sessionId={}, mode={}, messages={}/{}, 耗时={}ms, 指标：{}",
                        sessionId, resumeResult.getStatus(), resumeResult.getLoadedMessages(), 
                        resumeResult.getTotalMessages(), loadTime, metrics);
                }
            } else {
                logger.debug("会话文件无变化，使用缓存：sessionId={}", sessionId);
                
                // 记录缓存命中指标
                SessionLoadMetrics metrics = sessionLoadMetrics.get(sessionId);
                if (metrics != null) {
                    metrics.fromCache = true;
                    metrics.timestamp = System.currentTimeMillis();
                    logger.debug("缓存命中：sessionId={}, 上次加载指标：{}", sessionId, metrics);
                }
            }
            
            return existing;
        }
        
        logger.info("缓存中不存在会话：{}，开始创建和恢复", sessionId);
        return sessions.computeIfAbsent(sessionId, id -> {
            // 记录加载指标
            long startTime = System.currentTimeMillis();
            SessionLoadMetrics metrics = new SessionLoadMetrics();
            
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            String systemPrompt;
            if (systemPromptOverride != null && !systemPromptOverride.isBlank()) {
                systemPrompt = systemPromptOverride;
            } else {
                systemPrompt = getDefaultSystemPrompt();
            }
            int maxTokens = com.example.agent.config.Config.getInstance().getContext().getMaxTokens();
            Conversation conversation = conversationService.create(systemPrompt, maxTokens, id);

            ConversationService.ResumeResult resumeResult = conversationService.resumeConversation(conversation, id);
            
            long loadTime = System.currentTimeMillis() - startTime;
            metrics.loadTimeMs = loadTime;
            metrics.messageCount = resumeResult.getTotalMessages();
            metrics.fromCache = false;
            
            // 获取文件大小
            try {
                java.nio.file.Path jsonlFile = getSessionJsonlPath(id);
                if (java.nio.file.Files.exists(jsonlFile)) {
                    metrics.fileSizeBytes = java.nio.file.Files.size(jsonlFile);
                }
            } catch (IOException e) {
                logger.debug("获取文件大小失败：sessionId={}", id, e);
            }
            
            sessionLoadMetrics.put(id, metrics);
            
            if (resumeResult.isResumed()) {
                logger.info("Web 会话恢复：sessionId={}, mode={}, messages={}/{}, 耗时={}ms, 指标：{}",
                    id, resumeResult.getStatus(), resumeResult.getLoadedMessages(), 
                    resumeResult.getTotalMessages(), loadTime, metrics);
            } else {
                logger.info("Web 新会话创建：sessionId={}, 无历史记录", id);
            }

            return conversation;
        });
    }

    /**
     * 检查会话文件是否有变化（通过最后修改时间判断）
     * 
     * @param sessionId 会话 ID
     * @return true 表示文件有变化或首次访问，需要重新加载；false 表示文件无变化，可使用缓存
     */
    private boolean shouldReloadSession(String sessionId) {
        try {
            // 获取会话文件路径
            java.nio.file.Path jsonlFile = getSessionJsonlPath(sessionId);
            if (!java.nio.file.Files.exists(jsonlFile)) {
                logger.debug("会话文件不存在：sessionId={}, path={}", sessionId, jsonlFile);
                return false; // 文件不存在，无需重新加载
            }
            
            // 获取当前文件的最后修改时间
            long currentLastModified = java.nio.file.Files.getLastModifiedTime(jsonlFile).toMillis();
            Long cachedLastModified = sessionFileLastModified.get(sessionId);
            
            // 如果是首次访问或文件有变化，返回 true
            if (cachedLastModified == null || currentLastModified > cachedLastModified) {
                logger.debug("会话文件有变化：sessionId={}, 当前修改时间={}, 缓存修改时间={}", 
                    sessionId, currentLastModified, cachedLastModified);
                sessionFileLastModified.put(sessionId, currentLastModified);
                return true;
            }
            
            logger.debug("会话文件无变化，使用缓存：sessionId={}, 修改时间={}", sessionId, currentLastModified);
            return false;
        } catch (IOException e) {
            logger.warn("检查会话文件修改时间失败：sessionId={}, 错误：{}", sessionId, e.getMessage());
            // 出错时保守处理，重新加载
            return true;
        }
    }
    
    /**
     * 获取会话 JSONL 文件路径
     */
    private java.nio.file.Path getSessionJsonlPath(String sessionId) {
        // 从 sessionId 中提取日期部分（格式：web-1778046645398）
        String dateStr = java.time.LocalDate.now().toString(); // 使用当前日期
        return com.example.agent.logging.WorkspaceManager.getUserMemoryDir()
            .resolve("sessions")
            .resolve(dateStr)
            .resolve(sessionId)
            .resolve("conversation.jsonl");
    }

    private String getDefaultSystemPrompt() {
        try {
            PromptLibrary library = ServiceLocator.getOrNull(PromptLibrary.class);
            if (library == null) {
                library = PromptLibrary.getInstance();
                library.initialize();
            }
            PromptService promptService = new PromptService();
            return promptService.getSystemPrompt(PromptService.TaskContext.defaultContext());
        } catch (Exception e) {
            logger.warn("加载默认 System Prompt 失败，使用 fallback", e);
            return "You are Hippo, a helpful AI assistant with access to various tools including file operations, code search, and bash commands. Always respond in the same language as the user's message.";
        }
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
        return input;
    }
}
