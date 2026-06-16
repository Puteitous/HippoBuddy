package com.example.agent.web.handler;

import com.example.agent.tools.FileChangeTracker;
import com.example.agent.web.util.DiffComputer;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class FileApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(FileApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final DiffComputer diffComputer = DiffComputer.DEFAULT;

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        logger.debug("FileApiHandler received request: method={}, path={}", method, path);

        try {
            if ("GET".equals(method) && (path.endsWith("/changes") || path.equals("/api/files") || path.equals("/api/files/"))) {
                handleGetChanges(exchange);
            } else if ("GET".equals(method) && path.endsWith("/diff")) {
                handleGetDiff(exchange);
            } else if ("POST".equals(method) && path.endsWith("/rollback")) {
                handleRollback(exchange);
            } else {
                logger.warn("FileApiHandler: no matching route for method={}, path={}", method, path);
                sendJson(exchange, 404, objectMapper.writeValueAsString(Map.of("error", "Not found: " + path)));
            }
        } catch (Exception e) {
            logger.error("FileApiHandler error", e);
            sendJson(exchange, 500, objectMapper.writeValueAsString(Map.of("error", e.getMessage())));
        }
    }

    private void handleGetChanges(HttpExchange exchange) throws IOException {
        List<FileChangeTracker.FileChange> changes = FileChangeTracker.getRecentChanges(50);
        List<Map<String, Object>> jsonList = new ArrayList<>();
        for (FileChangeTracker.FileChange c : changes) {
            Map<String, Object> item = new HashMap<>();
            item.put("filePath", c.filePath);
            item.put("toolName", c.toolName);
            item.put("timestamp", c.timestamp);
            jsonList.add(item);
        }
        sendJson(exchange, 200, objectMapper.writeValueAsString(jsonList));
    }

    private void handleGetDiff(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String filePath = null;
        int changeIndex = -1;
        boolean allChanges = false;
        String toolCallId = null;

        if (query != null) {
            String[] params = query.split("&");
            for (String param : params) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2) {
                    if ("path".equals(kv[0])) {
                        filePath = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                    } else if ("index".equals(kv[0])) {
                        try {
                            changeIndex = Integer.parseInt(kv[1]);
                        } catch (NumberFormatException ignored) {
                        }
                    } else if ("all".equals(kv[0])) {
                        allChanges = "true".equals(kv[1]);
                    } else if ("toolCallId".equals(kv[0])) {
                        toolCallId = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                    }
                }
            }
        }

        if (filePath == null || filePath.trim().isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing filePath")));
            return;
        }

        List<FileChangeTracker.FileChange> changes = FileChangeTracker.getAllChanges(filePath);
        if (changes.isEmpty()) {
            sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("changes", List.of())));
            return;
        }

        if (allChanges) {
            List<Map<String, Object>> allChangesList = new ArrayList<>();
            int targetIndex = changes.size() - 1;
            for (int ci = 0; ci < changes.size(); ci++) {
                FileChangeTracker.FileChange c = changes.get(ci);
                Map<String, Object> changeItem = new HashMap<>();
                changeItem.put("toolName", c.toolName);
                changeItem.put("timestamp", c.timestamp);
                changeItem.put("index", ci);
                String original = c.originalContent != null ? c.originalContent : "";
                String modified = c.newContent != null ? c.newContent : "";
                changeItem.put("changes", buildDiffList(original, modified));
                changeItem.put("wordDiff", buildWordDiffList(original, modified));
                if (toolCallId != null && !toolCallId.isEmpty() && toolCallId.equals(c.toolCallId)) {
                    targetIndex = ci;
                }
                allChangesList.add(changeItem);
            }
            Map<String, Object> response = new HashMap<>();
            response.put("filePath", filePath);
            response.put("allChanges", allChangesList);
            response.put("targetIndex", targetIndex);
            sendJson(exchange, 200, objectMapper.writeValueAsString(response));
            return;
        }

        FileChangeTracker.FileChange targetChange;
        if (changeIndex >= 0 && changeIndex < changes.size()) {
            targetChange = changes.get(changeIndex);
        } else {
            targetChange = changes.get(changes.size() - 1);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("filePath", targetChange.filePath);
        response.put("toolName", targetChange.toolName);
        response.put("timestamp", targetChange.timestamp);
        String original = targetChange.originalContent != null ? targetChange.originalContent : "";
        String modified = targetChange.newContent != null ? targetChange.newContent : "";
        response.put("changes", buildDiffList(original, modified));
        response.put("wordDiff", buildWordDiffList(original, modified));

        sendJson(exchange, 200, objectMapper.writeValueAsString(response));
    }

    private static List<Map<String, String>> buildDiffList(String original, String modified) {
        return diffComputer.computeDiffAsMap(original, modified);
    }

    private static List<Map<String, Object>> buildWordDiffList(String original, String modified) {
        return diffComputer.computeWordDiff(original, modified);
    }

    private void handleRollback(HttpExchange exchange) throws IOException {
        String body = new BufferedReader(
            new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))
            .lines().collect(Collectors.joining());

        logger.debug("Rollback request body: {}", body);

        JsonNode json = objectMapper.readTree(body);
        String filePath = json.has("filePath") ? json.get("filePath").asText() : null;
        if (filePath == null || filePath.trim().isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing or invalid filePath")));
            return;
        }

        logger.info("执行文件回滚: filePath={}", filePath);
        
        boolean success = FileChangeTracker.rollback(filePath);
        
        if (!success) {
            String absolutePath = Path.of(filePath).toAbsolutePath().normalize().toString();
            if (!absolutePath.equals(filePath)) {
                logger.info("尝试使用绝对路径回滚: absolutePath={}", absolutePath);
                success = FileChangeTracker.rollback(absolutePath);
            }
        }
        
        if (success) {
            logger.info("文件回滚成功: filePath={}", filePath);
            sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", true, "message", "文件已恢复")));
        } else {
            logger.warn("文件回滚失败: filePath={}", filePath);
            sendJson(exchange, 404, objectMapper.writeValueAsString(Map.of("success", false, "error", "未找到可恢复的版本")));
        }
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
