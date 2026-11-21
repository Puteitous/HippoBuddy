package com.example.agent.web.handler;

import com.example.agent.tools.BashProcessManager;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 把正在前台执行的 bash 进程转入后台托管。
 * <p>
 * 请求体：{@code {"toolCallId":"..."}}。仅做标记，不杀进程；
 * {@link com.example.agent.tools.BashTool} 的等待循环轮询到标记后停止等待，
 * 立即返回 tool_result 并释放回合锁，进程继续运行，输出由后台读线程累积。
 */
public class ToolBackgroundHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ToolBackgroundHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        if ("GET".equals(method)) {
            if (exchange.getRequestURI().getPath().endsWith("/log")) {
                handleLog(exchange);
            } else {
                handleStatus(exchange);
            }
            return;
        }
        if (!"POST".equals(method)) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        try {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonNode json = objectMapper.readTree(requestBody);
            String toolCallId = json.has("toolCallId") ? json.get("toolCallId").asText() : null;

            if (toolCallId == null || toolCallId.isEmpty()) {
                sendJson(exchange, 400, "{\"error\":\"缺少参数: toolCallId\"}");
                return;
            }

            long pid = BashProcessManager.getInstance().requestDetach(toolCallId);
            if (pid > 0) {
                logger.info("已请求转入后台: toolCallId={}, pid={}", toolCallId, pid);
                sendJson(exchange, 200, "{\"success\":true,\"pid\":" + pid
                    + ",\"message\":\"已转为后台运行\"}");
            } else {
                logger.info("未找到运行中的进程: toolCallId={}", toolCallId);
                sendJson(exchange, 200, "{\"success\":false,\"pid\":-1"
                    + ",\"message\":\"未找到运行中的进程\"}");
            }
        } catch (Exception e) {
            logger.error("处理转后台请求失败", e);
            sendJson(exchange, 500, "{\"error\":\"" + SseWriter.escapeJson(e.getMessage()) + "\"}");
        }
    }

    /**
     * GET /api/tool/background?toolCallId=xxx
     * <p>
     * 查询后台进程是否仍在运行，供前端移除"已结束"进程的停止按钮。
     */
    private void handleStatus(HttpExchange exchange) throws IOException {
        String toolCallId = queryParam(exchange.getRequestURI().getQuery(), "toolCallId");
        if (toolCallId == null || toolCallId.isEmpty()) {
            sendJson(exchange, 400, "{\"error\":\"缺少参数: toolCallId\"}");
            return;
        }
        BashProcessManager.BackgroundRecord record = BashProcessManager.getInstance().getBackground(toolCallId);
        boolean running = record != null && record.isAlive();
        int pid = running ? record.pid() : -1;
        sendJson(exchange, 200, "{\"running\":" + running + ",\"pid\":" + pid + "}");
    }

    /**
     * GET /api/tool/background/log?toolCallId=xxx
     * <p>
     * 返回后台进程当前累积的 stdout/stderr 快照；进程已结束但记录仍在暂存区时也能取到最终输出。
     */
    private void handleLog(HttpExchange exchange) throws IOException {
        String toolCallId = queryParam(exchange.getRequestURI().getQuery(), "toolCallId");
        if (toolCallId == null || toolCallId.isEmpty()) {
            sendJson(exchange, 400, "{\"error\":\"缺少参数: toolCallId\"}");
            return;
        }
        BashProcessManager.BackgroundRecord record =
            BashProcessManager.getInstance().getBackgroundForLog(toolCallId);
        ObjectNode node = objectMapper.createObjectNode();
        node.put("running", record != null && record.isAlive());
        node.put("pid", record != null ? record.pid() : -1);
        node.put("output", record != null ? record.getOutputSnapshot() : "");
        node.put("error", record != null ? record.getErrorSnapshot() : "");
        sendJson(exchange, 200, node.toString());
    }

    /** 解析查询串中的单个参数（值做 URL 解码）。 */
    private String queryParam(String query, String key) {
        if (query == null || query.isEmpty()) {
            return null;
        }
        for (String pair : query.split("&")) {
            int idx = pair.indexOf('=');
            if (idx <= 0) {
                continue;
            }
            if (key.equals(pair.substring(0, idx))) {
                return java.net.URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
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
