package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.web.logging.SessionLogger;
import com.example.agent.web.orchestrator.WebAgentOrchestrator;
import com.example.agent.web.server.WebInitializer;
import com.example.agent.web.session.PendingToolCall;
import com.example.agent.web.session.SessionManager;
import com.example.agent.web.session.SessionTokenStats;
import com.example.agent.web.session.WebSessionManager;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

public class ChatApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ChatApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SessionManager sessionManager;
    private final WebAgentOrchestrator orchestrator;

    public ChatApiHandler() {
        this.sessionManager = WebSessionManager.getInstance();
        this.orchestrator = new WebAgentOrchestrator(sessionManager);
    }

    ChatApiHandler(SessionManager sessionManager, WebAgentOrchestrator orchestrator) {
        this.sessionManager = sessionManager;
        this.orchestrator = orchestrator;
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

        PrintWriter printWriter = new PrintWriter(new BufferedWriter(new OutputStreamWriter(exchange.getResponseBody(), StandardCharsets.UTF_8)), true);
        SseWriter sseWriter = new SseWriter(printWriter);

        String sessionId = null;
        boolean lockAcquired = false;

        try {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonNode json = objectMapper.readTree(requestBody);

            sessionId = json.has("sessionId") ? json.get("sessionId").asText() :
                       (json.has("session") ? json.get("session").asText() : "default");
            String userMessage = json.has("message") ? json.get("message").asText() : "";
            String systemPromptOverride = json.has("systemPrompt") ? json.get("systemPrompt").asText() : null;
            String editMessageId = json.has("editMessageId") ? json.get("editMessageId").asText() : null;

            if (userMessage.isEmpty()) {
                sseWriter.sendSseEvent("error", "{\"message\":\"消息不能为空\"}");
                return;
            }

            try {
                sessionManager.tryAcquireSessionLock(sessionId, 30, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                sseWriter.sendSseEvent("error", "{\"message\":\"请求被中断\"}");
                return;
            }
            lockAcquired = true;

            SseWriter.resetClientDisconnected();

            logger.info("Web Chat 收到消息：session={}, message={}, edit={}, hasPendingTool={}",
                sessionId, userMessage, editMessageId != null, sessionManager.hasPendingToolCall(sessionId));

            int estimatedTokens = TokenEstimatorFactory.getDefault().estimateTextTokens(userMessage);
            SessionLogger.logUserMessage(sessionId, Message.user(userMessage), estimatedTokens);

            WebInitializer.ensureMemoryInitialized();

            Conversation conversation = sessionManager.getOrCreateConversation(sessionId, systemPromptOverride);
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);

            PendingToolCall pendingTool = sessionManager.pollPendingToolCall(sessionId);
            if (pendingTool != null) {
                String toolResult = "用户回答：" + userMessage;
                conversationService.addToolResult(conversation, pendingTool.toolCallId, pendingTool.toolName, toolResult, true);
                SessionLogger.logToolCall(sessionId, pendingTool.toolName, pendingTool.question, toolResult, true);
                SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                stats.addToolCall();

                Message userMsg = conversationService.addUserMessage(conversation, userMessage);
                sseWriter.sendSseEvent("message_id", "{\"id\":\"" + userMsg.getId() + "\"}");
            } else if (editMessageId != null && !editMessageId.isEmpty()) {
                Message userMsg = conversationService.editUserMessage(conversation, editMessageId, userMessage);
                if (userMsg != null) {
                    sseWriter.sendSseEvent("message_id", "{\"id\":\"" + userMsg.getId() + "\"}");
                }
            } else {
                Message userMsg = conversationService.addUserMessage(conversation, userMessage);
                sseWriter.sendSseEvent("message_id", "{\"id\":\"" + userMsg.getId() + "\"}");
            }

            orchestrator.execute(sessionId, conversation, sseWriter);

        } catch (LlmException e) {
            logger.error("LLM 调用失败", e);
            sseWriter.sendSseEvent("error", "{\"message\":\"" + SseWriter.escapeJson(e.getMessage()) + "\"}");
        } catch (Exception e) {
            logger.error("处理聊天请求失败", e);
            sseWriter.sendSseEvent("error", "{\"message\":\"" + SseWriter.escapeJson(e.getMessage()) + "\"}");
        } finally {
            if (lockAcquired && sessionId != null) {
                sessionManager.releaseSessionLock(sessionId);
            }
            SseWriter.removeClientDisconnected();
            sseWriter.sendSseEvent("complete", "[DONE]");
            printWriter.close();
            exchange.close();
        }
    }
}
