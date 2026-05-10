package com.example.agent.web.handler;

import com.example.agent.tools.FileChangeTracker;
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
import java.util.List;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class FileApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(FileApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

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
            } else if ("POST".equals(method) && path.endsWith("/rollback-range")) {
                handleRollbackRange(exchange);
            } else if ("POST".equals(method) && path.endsWith("/rollback")) {
                handleRollback(exchange);
            } else {
                logger.warn("FileApiHandler: no matching route for method={}, path={}", method, path);
                sendJson(exchange, 404, "{\"error\":\"Not found: " + escapeJson(path) + "\"}");
            }
        } catch (Exception e) {
            logger.error("FileApiHandler error", e);
            sendJson(exchange, 500, "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    private void handleGetChanges(HttpExchange exchange) throws IOException {
        List<FileChangeTracker.FileChange> changes = FileChangeTracker.getRecentChanges(50);
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < changes.size(); i++) {
            FileChangeTracker.FileChange c = changes.get(i);
            if (i > 0) json.append(",");
            json.append("{")
                .append("\"filePath\":\"").append(escapeJson(c.filePath)).append("\",")
                .append("\"toolName\":\"").append(escapeJson(c.toolName)).append("\",")
                .append("\"timestamp\":").append(c.timestamp)
                .append("}");
        }
        json.append("]");
        sendJson(exchange, 200, json.toString());
    }

    private void handleGetDiff(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String filePath = null;
        int changeIndex = -1;
        boolean allChanges = false;

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
                    }
                }
            }
        }

        if (filePath == null || filePath.trim().isEmpty()) {
            sendJson(exchange, 400, "{\"error\":\"Missing filePath\"}");
            return;
        }

        List<FileChangeTracker.FileChange> changes = FileChangeTracker.getAllChanges(filePath);
        if (changes.isEmpty()) {
            sendJson(exchange, 200, "{\"changes\":[]}");
            return;
        }

        if (allChanges) {
            StringBuilder json = new StringBuilder("{");
            json.append("\"filePath\":\"").append(escapeJson(filePath)).append("\",");
            json.append("\"allChanges\":[");
            for (int ci = 0; ci < changes.size(); ci++) {
                FileChangeTracker.FileChange c = changes.get(ci);
                if (ci > 0) json.append(",");
                String original = c.originalContent != null ? c.originalContent : "";
                String modified = c.newContent != null ? c.newContent : "";
                List<String[]> diffLines = computeDiff(original, modified);
                json.append("{")
                    .append("\"toolName\":\"").append(escapeJson(c.toolName)).append("\",")
                    .append("\"timestamp\":").append(c.timestamp).append(",")
                    .append("\"index\":").append(ci).append(",")
                    .append("\"changes\":[");
                for (int i = 0; i < diffLines.size(); i++) {
                    String[] line = diffLines.get(i);
                    if (i > 0) json.append(",");
                    json.append("{")
                        .append("\"type\":\"").append(line[0]).append("\",")
                        .append("\"content\":\"").append(escapeJson(line[1])).append("\"")
                        .append("}");
                }
                json.append("]");
                json.append("}");
            }
            json.append("]}");
            sendJson(exchange, 200, json.toString());
            return;
        }

        FileChangeTracker.FileChange targetChange;
        if (changeIndex >= 0 && changeIndex < changes.size()) {
            targetChange = changes.get(changeIndex);
        } else {
            targetChange = changes.get(changes.size() - 1);
        }

        String original = targetChange.originalContent != null ? targetChange.originalContent : "";
        String modified = targetChange.newContent != null ? targetChange.newContent : "";

        List<String[]> diffLines = computeDiff(original, modified);

        StringBuilder json = new StringBuilder("{");
        json.append("\"filePath\":\"").append(escapeJson(targetChange.filePath)).append("\",");
        json.append("\"toolName\":\"").append(escapeJson(targetChange.toolName)).append("\",");
        json.append("\"timestamp\":").append(targetChange.timestamp).append(",");
        json.append("\"changes\":[");
        for (int i = 0; i < diffLines.size(); i++) {
            String[] line = diffLines.get(i);
            if (i > 0) json.append(",");
            json.append("{")
                .append("\"type\":\"").append(line[0]).append("\",")
                .append("\"content\":\"").append(escapeJson(line[1])).append("\"")
                .append("}");
        }
        json.append("]}");
        sendJson(exchange, 200, json.toString());
    }

    private static List<String[]> computeDiff(String original, String modified) {
        String[] origLines = original.split("\n", -1);
        String[] modLines = modified.split("\n", -1);

        int m = origLines.length;
        int n = modLines.length;

        int[][] dp = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (origLines[i - 1].equals(modLines[j - 1])) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        List<String[]> result = new ArrayList<>();
        int i = m, j = n;
        List<String[]> reversed = new ArrayList<>();

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && origLines[i - 1].equals(modLines[j - 1])) {
                reversed.add(new String[]{"same", origLines[i - 1]});
                i--;
                j--;
            } else if (j > 0 && (i == 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                reversed.add(new String[]{"added", modLines[j - 1]});
                j--;
            } else if (i > 0) {
                reversed.add(new String[]{"removed", origLines[i - 1]});
                i--;
            }
        }

        for (int k = reversed.size() - 1; k >= 0; k--) {
            result.add(reversed.get(k));
        }

        return result;
    }

    private void handleRollback(HttpExchange exchange) throws IOException {
        String body = new BufferedReader(
            new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))
            .lines().collect(Collectors.joining());

        logger.debug("Rollback request body: {}", body);

        JsonNode json = objectMapper.readTree(body);
        String filePath = json.has("filePath") ? json.get("filePath").asText() : null;
        if (filePath == null || filePath.trim().isEmpty()) {
            sendJson(exchange, 400, "{\"error\":\"Missing or invalid filePath\"}");
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
            sendJson(exchange, 200, "{\"success\":true,\"message\":\"文件已恢复\"}");
        } else {
            logger.warn("文件回滚失败: filePath={}", filePath);
            sendJson(exchange, 404, "{\"success\":false,\"error\":\"未找到可恢复的版本\"}");
        }
    }

    private void handleRollbackRange(HttpExchange exchange) throws IOException {
        String body = new BufferedReader(
            new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))
            .lines().collect(Collectors.joining());

        logger.debug("Rollback-range request body: {}", body);

        JsonNode json = objectMapper.readTree(body);
        long startTime = json.has("startTime") ? json.get("startTime").asLong() : 0;
        long endTime = json.has("endTime") ? json.get("endTime").asLong() : System.currentTimeMillis();

        if (startTime <= 0 || endTime <= 0 || startTime >= endTime) {
            sendJson(exchange, 400, "{\"error\":\"无效的时间范围\"}");
            return;
        }

        logger.info("执行批量回滚: startTime={}, endTime={}", startTime, endTime);
        int count = FileChangeTracker.rollbackRange(startTime, endTime);

        if (count > 0) {
            logger.info("批量回滚成功: 回滚了 {} 个文件", count);
            sendJson(exchange, 200, "{\"success\":true,\"message\":\"已回滚 " + count + " 个文件\"}");
        } else {
            sendJson(exchange, 200, "{\"success\":true,\"message\":\"没有需要回滚的文件变更\"}");
        }
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
