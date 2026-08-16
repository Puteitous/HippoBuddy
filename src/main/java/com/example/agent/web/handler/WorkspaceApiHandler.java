package com.example.agent.web.handler;

import com.example.agent.config.Config;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.web.session.WebSessionManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 工作区 API — 替代桌面桥中原本由 ConfigHandler 负责的工作区路径操作。
 * <p>
 * 挂载路径：/api/workspace
 * <p>
 * 端点：
 *   GET    /api/workspace           → 当前工作区 { path, isDefault }
 *   PUT    /api/workspace           → 设置当前工作区 { path }
 *   DELETE /api/workspace           → 重置为默认工作区
 *   GET    /api/workspace/default   → 默认工作区配置 { path, isDefault }
 *   PUT    /api/workspace/default   → 设置默认工作区路径 { path, switched }
 * </p>
 */
public class WorkspaceApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceApiHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        try {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();

            // 路由：/api/workspace (根路径)
            if ("/api/workspace".equals(path) || "/api/workspace/".equals(path)) {
                switch (method) {
                    case "GET" -> handleGetCurrent(exchange);
                    case "PUT" -> handleSetCurrent(exchange);
                    case "DELETE" -> handleClearCurrent(exchange);
                    default -> sendError(exchange, 405, "Method Not Allowed");
                }
                return;
            }

            // 路由：/api/workspace/default
            if ("/api/workspace/default".equals(path)) {
                switch (method) {
                    case "GET" -> handleGetDefault(exchange);
                    case "PUT" -> handleSetDefault(exchange);
                    default -> sendError(exchange, 405, "Method Not Allowed");
                }
                return;
            }

            sendError(exchange, 404, "Not Found");
        } catch (Exception e) {
            logger.error("WorkspaceApiHandler 处理失败", e);
            sendError(exchange, 500, e.getMessage());
        }
    }

    /** GET /api/workspace — 返回当前工作区路径和是否默认 */
    private void handleGetCurrent(HttpExchange exchange) throws IOException {
        String folder = WorkspaceContext.getCurrentFolder();
        ObjectNode node = MAPPER.createObjectNode();
        node.put("path", folder != null ? folder : "");
        node.put("isDefault", WorkspaceContext.isDefaultWorkspace());
        sendJson(exchange, 200, node);
    }

    /** PUT /api/workspace — 设置并持久化当前工作区 */
    private void handleSetCurrent(HttpExchange exchange) throws IOException {
        JsonNode body = MAPPER.readTree(exchange.getRequestBody());
        String folder = body.has("path") ? body.get("path").asText() : null;
        String oldFolder = WorkspaceContext.getCurrentFolder();
        int cachedSessions = WebSessionManager.getInstance().getSessions().size();
        logger.info("收到工作区切换请求: path={}, 当前缓存会话数={}（这些会话的 prompt 在创建时按当时工作区状态固化快照，切换后保持不变）",
            folder, cachedSessions);
        WorkspaceContext.setCurrentFolder(folder);
        WorkspaceContext.save();
        // 监控：切换后逐会话检查 prompt 快照是否仍固化旧工作区路径（预期：未改变）
        inspectCachedSessionPromptsAfterSwitch(oldFolder, folder);
        ObjectNode node = MAPPER.createObjectNode();
        node.put("path", WorkspaceContext.getCurrentFolder());
        sendJson(exchange, 200, node);
    }

    /** DELETE /api/workspace — 重置为默认工作区 */
    private void handleClearCurrent(HttpExchange exchange) throws IOException {
        String oldFolder = WorkspaceContext.getCurrentFolder();
        String newFolder = WorkspaceManager.getDefaultWorkspaceDir().toString();
        int cachedSessions = WebSessionManager.getInstance().getSessions().size();
        logger.info("收到工作区重置请求: oldPath={}, 当前缓存会话数={}（这些会话的 prompt 在创建时按当时工作区状态固化快照，重置后保持不变）",
            oldFolder, cachedSessions);
        WorkspaceContext.clear();
        WorkspaceContext.save();
        // 监控：重置后逐会话检查 prompt 快照是否仍固化旧工作区路径（预期：未改变）
        inspectCachedSessionPromptsAfterSwitch(oldFolder, newFolder);
        ObjectNode node = MAPPER.createObjectNode();
        node.put("path", "");
        sendJson(exchange, 200, node);
    }

    /**
     * 监控：工作区切换/重置后，检查缓存中每个会话的 system prompt 是否被本次切换意外改写。
     * <p>
     * 会话创建时按当时工作区状态固化 prompt 快照，切换是全局状态变更，不应触碰任何已有会话
     * （只有新会话才拼入新路径）。唯一可靠的违规信号：prompt 中混入了本次切换的新路径。
     *
     * @return 被意外改写的会话数（0 = 全部会话未被本次切换改写）
     */
    int inspectCachedSessionPromptsAfterSwitch(String oldPath, String newPath) {
        int violated = 0;
        try {
            Map<String, Conversation> sessions = WebSessionManager.getInstance().getSessions();
            if (sessions.isEmpty()) {
                logger.info("工作区切换后无缓存会话，跳过 prompt 快照检查: {} -> {}", oldPath, newPath);
                return 0;
            }
            for (Map.Entry<String, Conversation> entry : sessions.entrySet()) {
                String sessionId = entry.getKey();
                String prompt = entry.getValue().getSystemPrompt();
                boolean hasNew = newPath != null && prompt != null && prompt.contains(newPath);
                if (hasNew) {
                    // 真违规：本次切换意外将新路径写入了已有会话的 prompt
                    violated++;
                    logger.warn("⚠️ 工作区切换后会话 prompt 快照被意外改写: sessionId={}, oldPath={}, newPath={}",
                        sessionId, oldPath, newPath);
                } else {
                    logger.debug("工作区切换后会话 prompt 快照检查通过: sessionId={}, 仍含旧路径={}（符合契约：切换不改变已有会话 prompt）",
                        sessionId, oldPath != null && prompt != null && prompt.contains(oldPath));
                }
            }
            if (violated > 0) {
                logger.warn("工作区切换后共有 {} 个会话的 prompt 快照被意外改写（固化机制疑似被破坏，需排查回归）: {} -> {}",
                    violated, oldPath, newPath);
            }
        } catch (Exception e) {
            logger.warn("检查缓存会话 prompt 快照失败", e);
        }
        return violated;
    }

    /** GET /api/workspace/default — 返回默认工作区配置 */
    private void handleGetDefault(HttpExchange exchange) throws IOException {
        String path = Config.getInstance().getWorkspace().getDefaultWorkspacePath();
        ObjectNode node = MAPPER.createObjectNode();
        node.put("path", path != null ? path : "");
        node.put("isDefault", WorkspaceContext.isDefaultWorkspace());
        sendJson(exchange, 200, node);
    }

    /** PUT /api/workspace/default — 设置默认工作区路径 */
    private void handleSetDefault(HttpExchange exchange) throws IOException {
        JsonNode body = MAPPER.readTree(exchange.getRequestBody());
        String folder = body.has("path") ? body.get("path").asText() : "";
        Config.getInstance().getWorkspace().setDefaultWorkspacePath(folder);
        Config.getInstance().save();

        boolean switched = false;
        if (WorkspaceContext.isDefaultWorkspace()) {
            WorkspaceContext.clear();
            WorkspaceContext.save();
            switched = true;
        }

        ObjectNode node = MAPPER.createObjectNode();
        node.put("path", folder);
        node.put("switched", switched);
        sendJson(exchange, 200, node);
    }

    // ===== 工具方法 =====

    private static void sendJson(HttpExchange exchange, int status, ObjectNode node) throws IOException {
        byte[] bytes = MAPPER.writeValueAsBytes(node);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static void sendError(HttpExchange exchange, int status, String msg) throws IOException {
        ObjectNode err = MAPPER.createObjectNode();
        err.put("error", msg);
        sendJson(exchange, status, err);
    }
}
