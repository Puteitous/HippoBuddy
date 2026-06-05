package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.truncation.TruncationService;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.tools.BashTool;
import com.example.agent.tools.ToolExecutionException;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.orchestrator.WebAgentOrchestrator;
import com.example.agent.web.session.PendingBashConfirmation;
import com.example.agent.web.session.SessionManager;
import com.example.agent.web.session.WebSessionManager;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.function.Consumer;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

public class ToolConfirmHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ToolConfirmHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final long CONFIRM_TIMEOUT_MS = 60_000;
    private static final TruncationService truncationService =
        new TruncationService(TokenEstimatorFactory.getDefault());

    private final SessionManager sessionManager;
    private final WebAgentOrchestrator orchestrator;

    public ToolConfirmHandler() {
        this.sessionManager = WebSessionManager.getInstance();
        this.orchestrator = WebAgentOrchestrator.getInstance();
    }

    ToolConfirmHandler(SessionManager sessionManager, WebAgentOrchestrator orchestrator) {
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

        String sessionId = null;

        try {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonNode json = objectMapper.readTree(requestBody);

            sessionId = json.has("sessionId") ? json.get("sessionId").asText() : null;
            String confirmId = json.has("confirmId") ? json.get("confirmId").asText() : "";
            String decision = json.has("decision") ? json.get("decision").asText() : "deny";
            boolean autoAllowSimilar = json.has("autoAllowSimilar") && json.get("autoAllowSimilar").asBoolean();

            if (sessionId == null || sessionId.isEmpty()) {
                sendJsonError(exchange, 400, "缺少 sessionId");
                return;
            }

            // 拉取待确认的 bash 命令
            PendingBashConfirmation pending = sessionManager.pollPendingBashConfirmation(sessionId);

            if (pending == null) {
                sendJsonError(exchange, 404, "未找到待确认的命令，可能已超时或被清理");
                return;
            }

            // 惰性超时检查
            if (pending.isExpired(CONFIRM_TIMEOUT_MS)) {
                logger.warn("bash 确认超时：confirmId={}, command={}", confirmId, pending.command);
                sendJsonError(exchange, 408, "确认已超时（60 秒），命令自动拒绝");
                return;
            }

            // 校验 confirmId
            if (!pending.confirmId.equals(confirmId)) {
                sendJsonError(exchange, 400, "confirmId 不匹配");
                return;
            }

            // 设为 SSE 响应
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.getResponseHeaders().set("Connection", "keep-alive");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, 0);

            // 直接使用 OutputStreamWriter，不包装 BufferedWriter。
            // SSE 事件每次 write 后立即 flush，无需缓冲层。
            // BufferedWriter 的缓冲在 SSE 场景下从不被利用。
            OutputStreamWriter outputStreamWriter = new OutputStreamWriter(
                exchange.getResponseBody(), StandardCharsets.UTF_8);
            SseWriter sseWriter = new SseWriter(outputStreamWriter);

            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            ToolRegistry toolRegistry = ServiceLocator.get(ToolRegistry.class);
            Conversation conversation = sessionManager.getOrCreateConversation(sessionId, null);

            if ("allow".equals(decision)) {
                logger.info("用户确认执行命令：confirmId={}, command={}", confirmId, pending.command);

                try {
                    // 直接调用 executor.execute() 绕过 blocker（用户已确认）
                    ToolExecutor executor = toolRegistry.getExecutor(pending.toolName);
                    if (executor == null) {
                        throw new ToolExecutionException("未知的工具: " + pending.toolName);
                    }
                    JsonNode arguments = objectMapper.readTree(pending.arguments);

                    long[] lastProgressTime = {0};
                    Consumer<String> progressCallback = line -> {
                        long now = System.currentTimeMillis();
                        if (now - lastProgressTime[0] > 200) {
                            lastProgressTime[0] = now;
                            sseWriter.sendSseEvent("tool_progress",
                                "{\"id\":\"" + SseWriter.escapeJson(pending.toolCallId)
                                + "\",\"line\":\"" + SseWriter.escapeJson(line) + "\"}");
                        }
                    };
                    BashTool.setCurrentToolCallId(pending.toolCallId);
                    String result;
                    try {
                        result = executor.execute(arguments, progressCallback);
                    } finally {
                        BashTool.clearCurrentToolCallId();
                    }

                    String truncatedResult = truncationService.truncateToolOutput(pending.toolName, result);

                    conversationService.addToolResult(
                        conversation, pending.toolCallId, pending.toolName, truncatedResult, true);

                    String cleanArgs = pending.arguments.replace("\r", "").replace("\n", "");
                    sseWriter.sendSseEvent("tool_result", "{\"id\":\"" + SseWriter.escapeJson(pending.toolCallId)
                        + "\",\"name\":\"" + SseWriter.escapeJson(pending.toolName)
                        + "\",\"success\":true,\"result\":\"" + SseWriter.escapeJson(truncatedResult)
                        + "\",\"args\":" + cleanArgs + "}");
                } catch (Exception e) {
                    String errorMsg = e.getMessage();
                    if (errorMsg == null || errorMsg.isEmpty()) {
                        errorMsg = e.getClass().getSimpleName() + " (无详细信息)";
                    }
                    conversationService.addToolResult(
                        conversation, pending.toolCallId, pending.toolName, "错误: " + errorMsg, false);

                    String cleanArgs = pending.arguments.replace("\r", "").replace("\n", "");
                    sseWriter.sendSseEvent("tool_result", "{\"id\":\"" + SseWriter.escapeJson(pending.toolCallId)
                        + "\",\"name\":\"" + SseWriter.escapeJson(pending.toolName)
                        + "\",\"success\":false,\"error\":\"" + SseWriter.escapeJson(errorMsg)
                        + "\",\"args\":" + cleanArgs + "}");
                }

                // session 级 auto-allow 存储
                if (autoAllowSimilar) {
                    String commandName = extractCommandName(pending.command);
                    sessionManager.addAutoAllowRule(sessionId, commandName);
                    logger.info("已存储 auto-allow 规则: sessionId={}, command={}", sessionId, commandName);
                }
            } else {
                logger.info("用户拒绝执行命令：confirmId={}, command={}", confirmId, pending.command);

                conversationService.addToolResult(
                    conversation, pending.toolCallId, pending.toolName, "错误: 用户拒绝了执行该命令", false);

                String denyArgs = pending.arguments.replace("\r", "").replace("\n", "");
                sseWriter.sendSseEvent("tool_result", "{\"id\":\"" + SseWriter.escapeJson(pending.toolCallId)
                    + "\",\"name\":\"" + SseWriter.escapeJson(pending.toolName)
                    + "\",\"success\":false,\"error\":\"用户拒绝了执行该命令"
                    + "\",\"args\":" + denyArgs + "}");
            }

            // 先执行剩余工具调用，再继续 Agent 循环
            orchestrator.continueAfterConfirmation(sessionId, conversation, sseWriter);

            outputStreamWriter.close();
            exchange.close();

        } catch (LlmException e) {
            logger.error("LLM 调用失败", e);
            sendJsonError(exchange, 500, "LLM 调用失败: " + e.getMessage());
        } catch (Exception e) {
            logger.error("处理确认请求失败", e);
            if (sessionId != null) {
                sessionManager.clearPendingBashConfirmation(sessionId);
            }
            try {
                sendJsonError(exchange, 500, "处理失败: " + e.getMessage());
            } catch (IOException ignored) {
            }
        }
    }

    private void sendJsonError(HttpExchange exchange, int statusCode, String message) throws IOException {
        String json = "{\"error\":\"" + SseWriter.escapeJson(message) + "\"}";
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(statusCode, json.getBytes(StandardCharsets.UTF_8).length);
        exchange.getResponseBody().write(json.getBytes(StandardCharsets.UTF_8));
        exchange.close();
    }

    private static String extractCommandName(String command) {
        if (command == null || command.isEmpty()) return "";
        String firstPart = command.split("\\|")[0].trim();
        firstPart = firstPart.split(">")[0].trim();
        firstPart = firstPart.split(">>")[0].trim();
        String[] parts = firstPart.split("\\s+");
        if (parts.length > 0) {
            String cmd = parts[0];
            int lastSlash = cmd.lastIndexOf('/');
            if (lastSlash >= 0 && lastSlash < cmd.length() - 1) {
                return cmd.substring(lastSlash + 1).toLowerCase();
            }
            return cmd.toLowerCase();
        }
        return command.toLowerCase();
    }
}
