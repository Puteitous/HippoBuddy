package com.example.agent.web.handler;

import com.example.agent.config.Config;
import com.example.agent.desktop.WorkspaceContext;
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
        WorkspaceContext.setCurrentFolder(folder);
        WorkspaceContext.save();
        ObjectNode node = MAPPER.createObjectNode();
        node.put("path", WorkspaceContext.getCurrentFolder());
        sendJson(exchange, 200, node);
    }

    /** DELETE /api/workspace — 重置为默认工作区 */
    private void handleClearCurrent(HttpExchange exchange) throws IOException {
        WorkspaceContext.clear();
        WorkspaceContext.save();
        ObjectNode node = MAPPER.createObjectNode();
        node.put("path", "");
        sendJson(exchange, 200, node);
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
