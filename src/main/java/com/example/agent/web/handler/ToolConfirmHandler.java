package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.truncation.TruncationService;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.tools.BashProcessManager;
import com.example.agent.tools.BashTool;
import com.example.agent.tools.DeleteFileTool;
import com.example.agent.tools.FileChangeTracker;
import com.example.agent.tools.ToolExecutionException;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.orchestrator.WebAgentOrchestrator;
import com.example.agent.web.session.PendingBashConfirmation;
import com.example.agent.web.session.PendingCompactConfirmation;
import com.example.agent.web.session.PendingDeleteConfirmation;
import com.example.agent.web.session.SessionManager;
import com.example.agent.web.session.WebSessionManager;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
    private static final long CONFIRM_TIMEOUT_MS = 180_000;
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

            if (sessionId == null || sessionId.isEmpty()) {
                sendJsonError(exchange, 400, "缺少 sessionId");
                return;
            }

            // 拉取待确认的操作（依次尝试 compact_context、bash、delete_file）
            PendingCompactConfirmation compactPending = sessionManager.pollPendingCompactConfirmation(sessionId);
            PendingBashConfirmation bashPending = null;
            PendingDeleteConfirmation deletePending = null;

            if (compactPending == null) {
                bashPending = sessionManager.pollPendingBashConfirmation(sessionId);
            }
            if (compactPending == null && bashPending == null) {
                deletePending = sessionManager.pollPendingDeleteConfirmation(sessionId);
            }

            if (compactPending == null && bashPending == null && deletePending == null) {
                sendJsonError(exchange, 404, "未找到待确认的命令，可能已超时或被清理");
                return;
            }

            // 设为 SSE 响应
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.getResponseHeaders().set("Connection", "keep-alive");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, 0);

            OutputStreamWriter outputStreamWriter = new OutputStreamWriter(
                exchange.getResponseBody(), StandardCharsets.UTF_8);
            SseWriter sseWriter = new SseWriter(outputStreamWriter);

            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            ToolRegistry toolRegistry = ServiceLocator.get(ToolRegistry.class);
            Conversation conversation = sessionManager.getOrCreateConversation(sessionId, null);

            if (compactPending != null) {
                handleCompactConfirmation(compactPending, sessionId, confirmId, decision,
                    sseWriter, conversationService, conversation);
            } else if (bashPending != null) {
                handleBashConfirmation(bashPending, sessionId, confirmId, decision,
                    sseWriter, conversationService, toolRegistry, conversation, objectMapper);
            } else {
                handleDeleteConfirmation(deletePending, sessionId, confirmId, decision,
                    sseWriter, conversationService, toolRegistry, conversation);
            }

            // 先排空 SSE 事件队列，再关闭底层流
            sseWriter.close();
            outputStreamWriter.close();
            exchange.close();

        } catch (LlmException e) {
            logger.error("LLM 调用失败", e);
            sendJsonError(exchange, 500, "LLM 调用失败: " + e.getMessage());
        } catch (Exception e) {
            logger.error("处理确认请求失败", e);
            if (sessionId != null) {
                sessionManager.clearPendingBashConfirmation(sessionId);
                sessionManager.clearPendingDeleteConfirmation(sessionId);
                sessionManager.clearPendingCompactConfirmation(sessionId);
            }
            try {
                sendJsonError(exchange, 500, "处理失败: " + e.getMessage());
            } catch (IOException ignored) {
            }
        }
    }

    private void handleBashConfirmation(PendingBashConfirmation pending, String sessionId,
                                         String confirmId, String decision,
                                         SseWriter sseWriter, ConversationService conversationService,
                                         ToolRegistry toolRegistry, Conversation conversation,
                                         ObjectMapper objectMapper) throws LlmException {
        // 惰性超时检查
        if (pending.isExpired(CONFIRM_TIMEOUT_MS)) {
            logger.warn("bash 确认超时：confirmId={}, command={}", confirmId, pending.command);
            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: 确认已超时", false);
            sseWriter.sendSseEvent("tool_result",
                buildToolResultJson(pending.toolCallId, pending.toolName, false, null, "确认已超时",
                    safeArgs(pending.arguments, pending.toolCallId)));
            orchestrator.continueAfterConfirmation(sessionId, conversation, sseWriter);
            return;
        }

        // 校验 confirmId
        if (!pending.confirmId.equals(confirmId)) {
            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: confirmId 不匹配", false);
            return;
        }

        if ("allow".equals(decision)) {
            logger.info("用户确认执行命令：confirmId={}, command={}", confirmId, pending.command);

            try {
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
                            buildProgressJson(pending.toolCallId, line));
                    }
                };
                String result;
                try (var _ctx = FileChangeTracker.withContext(sessionId, pending.toolCallId)) {
                    BashTool.setCurrentToolCallId(pending.toolCallId);
                    BashProcessManager.getInstance().bindSession(pending.toolCallId, sessionId);
                    result = executor.execute(arguments, progressCallback);
                } finally {
                    BashTool.clearCurrentToolCallId();
                }

                String truncatedResult = truncationService.truncateToolOutput(pending.toolName, result);

                conversationService.addToolResult(
                    conversation, pending.toolCallId, pending.toolName, truncatedResult, true);

                sseWriter.sendSseEvent("tool_result",
                    buildToolResultJson(pending.toolCallId, pending.toolName, true, truncatedResult, null,
                        safeArgs(pending.arguments, pending.toolCallId)));
            } catch (Exception e) {
                String errorMsg = e.getMessage();
                if (errorMsg == null || errorMsg.isEmpty()) {
                    errorMsg = e.getClass().getSimpleName() + " (无详细信息)";
                }
                conversationService.addToolResult(
                    conversation, pending.toolCallId, pending.toolName, "错误: " + errorMsg, false);

                sseWriter.sendSseEvent("tool_result",
                    buildToolResultJson(pending.toolCallId, pending.toolName, false, null, errorMsg,
                        safeArgs(pending.arguments, pending.toolCallId)));
            }
        } else {
            logger.info("用户拒绝执行命令：confirmId={}, command={}", confirmId, pending.command);

            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: 用户拒绝了执行该命令", false);

            sseWriter.sendSseEvent("tool_result",
                buildToolResultJson(pending.toolCallId, pending.toolName, false, null, "用户拒绝了执行该命令",
                    safeArgs(pending.arguments, pending.toolCallId)));
        }

        // 先执行剩余工具调用，再继续 Agent 循环
        orchestrator.continueAfterConfirmation(sessionId, conversation, sseWriter);
    }

    private void handleDeleteConfirmation(PendingDeleteConfirmation pending, String sessionId,
                                           String confirmId, String decision,
                                           SseWriter sseWriter, ConversationService conversationService,
                                           ToolRegistry toolRegistry, Conversation conversation) {
        // 惰性超时检查
        if (pending.isExpired(CONFIRM_TIMEOUT_MS)) {
            logger.warn("delete_file 确认超时：confirmId={}", confirmId);
            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: 确认已超时", false);
            sseWriter.sendSseEvent("tool_result",
                buildToolResultJson(pending.toolCallId, pending.toolName, false, null, "确认已超时",
                    pending.arguments));
            try {
                orchestrator.continueAfterConfirmation(sessionId, conversation, sseWriter);
            } catch (LlmException e) {
                logger.error("继续 Agent 循环失败", e);
            }
            return;
        }

        // 校验 confirmId
        if (!pending.confirmId.equals(confirmId)) {
            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: confirmId 不匹配", false);
            return;
        }

        if ("allow".equals(decision)) {
            logger.info("用户确认删除文件：confirmId={}, fileCount={}", confirmId, pending.totalFileCount);

            try {
                ToolExecutor executor = toolRegistry.getExecutor(pending.toolName);
                if (executor == null) {
                    throw new ToolExecutionException("未知的工具: " + pending.toolName);
                }

                String result;
                try (var _ctx = FileChangeTracker.withContext(sessionId, pending.toolCallId)) {
                    result = executor.execute(pending.arguments);
                }

                conversationService.addToolResult(
                    conversation, pending.toolCallId, pending.toolName, result, true);

                sseWriter.sendSseEvent("tool_result",
                    buildToolResultJson(pending.toolCallId, pending.toolName, true, result, null,
                        pending.arguments));
            } catch (Exception e) {
                String errorMsg = e.getMessage();
                if (errorMsg == null || errorMsg.isEmpty()) {
                    errorMsg = e.getClass().getSimpleName() + " (无详细信息)";
                }
                conversationService.addToolResult(
                    conversation, pending.toolCallId, pending.toolName, "错误: " + errorMsg, false);

                sseWriter.sendSseEvent("tool_result",
                    buildToolResultJson(pending.toolCallId, pending.toolName, false, null, errorMsg,
                        pending.arguments));
            }
        } else {
            logger.info("用户拒绝删除文件：confirmId={}, fileCount={}", confirmId, pending.totalFileCount);

            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: 用户拒绝了删除操作", false);

            sseWriter.sendSseEvent("tool_result",
                buildToolResultJson(pending.toolCallId, pending.toolName, false, null, "用户拒绝了删除操作",
                    pending.arguments));
        }

        // delete_file 不需要继续剩余工具队列（单个工具调用）
        // 但要继续 Agent 循环
        try {
            orchestrator.continueAfterConfirmation(sessionId, conversation, sseWriter);
        } catch (LlmException e) {
            logger.error("继续 Agent 循环失败", e);
        }
    }

    private void handleCompactConfirmation(PendingCompactConfirmation pending, String sessionId,
                                           String confirmId, String decision,
                                           SseWriter sseWriter, ConversationService conversationService,
                                           Conversation conversation) throws LlmException {
        if (pending.isExpired(CONFIRM_TIMEOUT_MS)) {
            logger.warn("compact_context 确认超时：confirmId={}", confirmId);
            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: 确认已超时", false);
            sseWriter.sendSseEvent("tool_result",
                buildToolResultJson(pending.toolCallId, pending.toolName, false, null, "确认已超时",
                    safeArgs(pending.arguments, pending.toolCallId)));
            orchestrator.continueAfterConfirmation(sessionId, conversation, sseWriter);
            return;
        }

        if (!pending.confirmId.equals(confirmId)) {
            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: confirmId 不匹配", false);
            return;
        }

        if ("allow".equals(decision)) {
            logger.info("用户确认压缩上下文：confirmId={}, currentTokens={}, summaryTokens={}",
                confirmId, pending.currentTokens, pending.summaryTokens);

            // 先补一条 tool 结果到旧 transcript，保证历史结构完整；随后写入压缩边界。
            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "上下文已压缩", true);
            Message handoff = conversationService.appendCompactionBoundary(
                conversation, buildHandoffContent(pending.summary));

            // 通知前端插入「上下文已压缩」分隔标识（重载后由历史消息内容自行识别）
            ObjectNode compactEvent = objectMapper.createObjectNode();
            compactEvent.put("messageId", handoff.getId());
            compactEvent.put("summary", pending.summary);
            sseWriter.sendSseEvent("compact_complete", compactEvent.toString());

            sseWriter.sendSseEvent("tool_result",
                buildToolResultJson(pending.toolCallId, pending.toolName, true,
                    "上下文已压缩，后续将从交接笔记继续", null,
                    safeArgs(pending.arguments, pending.toolCallId)));
        } else {
            logger.info("用户取消压缩上下文：confirmId={}", confirmId);
            conversationService.addToolResult(
                conversation, pending.toolCallId, pending.toolName, "错误: 用户取消了上下文压缩", false);
            sseWriter.sendSseEvent("tool_result",
                buildToolResultJson(pending.toolCallId, pending.toolName, false, null,
                    "用户取消了上下文压缩", safeArgs(pending.arguments, pending.toolCallId)));
        }

        orchestrator.continueAfterConfirmation(sessionId, conversation, sseWriter);
    }

    private static String buildHandoffContent(String summary) {
        return "## 上下文压缩交接笔记\n\n" +
            summary +
            "\n\n---\n" +
            "以上是你压缩后的上下文。原始对话已不在当前上下文中，请基于这份笔记继续未完成的任务。";
    }

    private void sendJsonError(HttpExchange exchange, int statusCode, String message) throws IOException {
        String json = "{\"error\":\"" + SseWriter.escapeJson(message) + "\"}";
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(statusCode, json.getBytes(StandardCharsets.UTF_8).length);
        exchange.getResponseBody().write(json.getBytes(StandardCharsets.UTF_8));
        exchange.close();
    }

    // ========== JSON 构建辅助（使用 ObjectMapper，杜绝手拼） ==========

    private static String buildToolResultJson(String id, String name, boolean success,
                                               String resultContent, String errorContent,
                                               JsonNode argsNode) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("name", name);
        node.put("success", success);
        if (resultContent != null) {
            node.put("result", resultContent);
        }
        if (errorContent != null) {
            node.put("error", errorContent);
        }
        if (argsNode != null) {
            node.set("args", argsNode);
        }
        return node.toString();
    }

    private static JsonNode safeArgs(String json, String toolCallId) {
        try {
            if (json != null && !json.trim().isEmpty()) {
                JsonNode node = objectMapper.readTree(json);
                if (node != null && !node.isMissingNode()) return node;
            }
        } catch (Exception e) {
            logger.warn("arguments 非合法 JSON, toolCallId={}, 已转为字符串兜底", toolCallId);
        }
        return objectMapper.getNodeFactory().textNode(json != null ? json : "");
    }

    private static String buildProgressJson(String id, String line) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("line", line);
        return node.toString();
    }

}
