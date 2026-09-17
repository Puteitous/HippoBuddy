package com.example.agent.web.handler;

import com.example.agent.config.Config;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.mcp.McpServiceManager;
import com.example.agent.mcp.config.McpConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * MCP 热刷新 — 让插件市场安装/卸载 MCP 插件后即时建立/断开连接,无需重启应用。
 *
 * <pre>
 * POST /api/mcp/refresh
 * body: { "action": "connect" | "disconnect", "serverId": "..." }
 * - connect    从当前 config.mcp.servers 找到该 server 并异步建立连接、注册工具
 * - disconnect 断开该 server 连接,并注销其已注册到 ToolRegistry 的工具
 * </pre>
 */
public class McpRefreshApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(McpRefreshApiHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "POST, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, error("Method not allowed"));
            return;
        }

        try {
            byte[] reqBytes = exchange.getRequestBody().readAllBytes();
            JsonNode json = MAPPER.readTree(reqBytes);
            String action = json.has("action") ? json.get("action").asText() : null;
            String serverId = json.has("serverId") ? json.get("serverId").asText() : null;
            if (action == null || serverId == null || serverId.isBlank()) {
                sendJson(exchange, 400, error("action 和 serverId 不能为空"));
                return;
            }

            McpServiceManager manager = ServiceLocator.get(McpServiceManager.class);
            switch (action) {
                case "connect" -> {
                    McpConfig.McpServerConfig cfg = findServerConfig(serverId);
                    if (cfg == null) {
                        sendJson(exchange, 404, error("未找到 MCP server: " + serverId));
                        return;
                    }
                    manager.connectServer(cfg);
                    logger.info("已触发 MCP server 连接: {}", serverId);
                    sendJson(exchange, 200, success("正在连接 MCP server: " + serverId));
                }
                case "disconnect" -> {
                    manager.disconnectServer(serverId);
                    logger.info("已断开 MCP server: {}", serverId);
                    sendJson(exchange, 200, success("已断开 MCP server: " + serverId));
                }
                default -> sendJson(exchange, 400, error("未知 action: " + action));
            }
        } catch (Exception e) {
            logger.error("MCP 热刷新失败", e);
            sendJson(exchange, 500, error(e.getMessage()));
        }
    }

    private McpConfig.McpServerConfig findServerConfig(String serverId) {
        return Config.getInstance().getMcp().getServers().stream()
                .filter(s -> serverId.equals(s.getId()))
                .findFirst()
                .orElse(null);
    }

    private static String success(String message) throws IOException {
        return MAPPER.writeValueAsString(Map.of("success", true, "message", message));
    }

    private static String error(String message) throws IOException {
        return MAPPER.writeValueAsString(Map.of("success", false, "message", message));
    }

    private void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}