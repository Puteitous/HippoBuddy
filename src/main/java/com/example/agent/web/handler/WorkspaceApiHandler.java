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
import java.util.HashMap;
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
        // 切换前逐会话快照 system prompt，切换后对比内容以检测是否被本次切换意外改写
        Map<String, String> beforePrompts = snapshotSessionPrompts();
        WorkspaceContext.setCurrentFolder(folder);
        WorkspaceContext.save();
        // 监控：切换后逐会话检查 prompt 是否仍保持切换前的固化内容（预期：未改变）
        inspectCachedSessionPromptsAfterSwitch(oldFolder, folder, beforePrompts);
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
        // 重置前逐会话快照 system prompt，重置后对比内容以检测是否被本次重置意外改写
        Map<String, String> beforePrompts = snapshotSessionPrompts();
        WorkspaceContext.clear();
        WorkspaceContext.save();
        // 监控：重置后逐会话检查 prompt 是否仍保持重置前的固化内容（预期：未改变）
        inspectCachedSessionPromptsAfterSwitch(oldFolder, newFolder, beforePrompts);
        ObjectNode node = MAPPER.createObjectNode();
        // 返回重置后的真实默认工作区路径（而非空字符串），便于前端直接回填 UI，
        // 避免把「已回到默认工作区」误显示成「未设置工作区」。
        node.put("path", WorkspaceContext.getCurrentFolder());
        sendJson(exchange, 200, node);
    }

    /**
     * 快照当前缓存会话的 system prompt。
     * <p>
     * 工作区切换/重置是全局状态变更，会话的 prompt 在创建时已固化工作区路径快照，
     * 切换不应触碰任何已有会话。切换前快照、切换后对比内容，才能可靠区分
     * 「会话创建时本就固化该路径」（如切回原工作区，prompt 未变，合法）与
     * 「prompt 被本次切换改写」（内容变化，违规）。
     */
    private static Map<String, String> snapshotSessionPrompts() {
        Map<String, String> snapshots = new HashMap<>();
        for (Map.Entry<String, Conversation> entry : WebSessionManager.getInstance().getSessions().entrySet()) {
            snapshots.put(entry.getKey(), entry.getValue().getSystemPrompt());
        }
        return snapshots;
    }

    /**
     * 监控：工作区切换/重置后，检查缓存中每个会话的 system prompt 是否被本次切换意外改写。
     * <p>
     * 会话创建时按当时工作区状态固化 prompt 快照，切换是全局状态变更，不应触碰任何已有会话
     * （只有新会话才拼入新路径）。违规判定依据是「切换前后 prompt 内容是否发生变化」：
     * 仅当快照存在且内容被改写时才判定为违规。切回会话创建时的原工作区时，prompt 虽包含
     * 新路径（即原路径），但内容未变，属于合法固化，不构成违规。
     *
     * @param oldPath      切换前的工作区路径
     * @param newPath      切换后的工作区路径
     * @param beforePrompts 切换前逐会话的 system prompt 快照（sessionId → prompt）
     * @return 被意外改写的会话数（0 = 全部会话未被本次切换改写）
     */
    int inspectCachedSessionPromptsAfterSwitch(String oldPath, String newPath, Map<String, String> beforePrompts) {
        int violated = 0;
        try {
            Map<String, Conversation> sessions = WebSessionManager.getInstance().getSessions();
            if (sessions.isEmpty()) {
                logger.info("工作区切换后无缓存会话，跳过 prompt 快照检查: {} -> {}", oldPath, newPath);
                return 0;
            }
            for (Map.Entry<String, Conversation> entry : sessions.entrySet()) {
                String sessionId = entry.getKey();
                String promptBefore = beforePrompts != null ? beforePrompts.get(sessionId) : null;
                String promptAfter = entry.getValue().getSystemPrompt();
                boolean changed = promptBefore != null && !promptBefore.equals(promptAfter);
                if (changed) {
                    // 真违规：本次切换将已有会话的 prompt 内容改写了
                    violated++;
                    logger.warn("⚠️ 工作区切换后会话 prompt 快照被意外改写: sessionId={}, oldPath={}, newPath={}",
                        sessionId, oldPath, newPath);
                } else {
                    logger.debug("工作区切换后会话 prompt 快照检查通过: sessionId={}, prompt 未变化（含新路径={}，符合契约：切换不改变已有会话 prompt）",
                        sessionId, newPath != null && promptAfter != null && promptAfter.contains(newPath));
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
