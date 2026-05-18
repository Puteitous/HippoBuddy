package com.example.agent.web.handler;

import com.example.agent.tools.BashProcessManager;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class ToolAbortHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ToolAbortHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        try {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonNode json = objectMapper.readTree(requestBody);

            String toolCallId = json.has("toolCallId") ? json.get("toolCallId").asText() : null;

            if (toolCallId == null || toolCallId.isEmpty()) {
                sendJson(exchange, 400, "{\"error\":\"缺少 toolCallId\"}");
                return;
            }

            boolean killed = BashProcessManager.getInstance().cancel(toolCallId);

            if (killed) {
                logger.info("已中止进程: toolCallId={}", toolCallId);
                sendJson(exchange, 200, "{\"success\":true,\"message\":\"进程已终止\"}");
            } else {
                logger.info("未找到运行中的进程: toolCallId={}", toolCallId);
                sendJson(exchange, 200, "{\"success\":true,\"message\":\"未找到运行中的进程\"}");
            }
        } catch (Exception e) {
            logger.error("处理中止请求失败", e);
            sendJson(exchange, 500, "{\"error\":\"" + SseWriter.escapeJson(e.getMessage()) + "\"}");
        }
    }

    private void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
