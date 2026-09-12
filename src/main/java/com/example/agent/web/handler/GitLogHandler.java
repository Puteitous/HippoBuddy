package com.example.agent.web.handler;

import com.example.agent.web.util.GitRunner;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * GitLogHandler - 提交历史(分页)
 *
 * <p>GET /api/git/log?path=&amp;limit=&amp;offset=<br>
 * 基于 {@code git log --pretty=format:<hash|%h|%H|%s|%an|%aI|%D>},字段以 \x1f 分隔,
 * 提交间换行分隔,懒加载分页(limit/offset)。
 */
public class GitLogHandler implements HttpHandler {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        Map<String, String> params = GitRunner.parseQuery(exchange.getRequestURI().getQuery());
        String workspacePath = params.get("path");
        if (workspacePath == null || workspacePath.isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing path parameter")));
            return;
        }

        int limit, offset;
        try {
            limit = parseInt(params.get("limit"), 20);
            offset = parseInt(params.get("offset"), 0);
        } catch (NumberFormatException e) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Invalid limit/offset")));
            return;
        }

        Path workDir = Paths.get(workspacePath).normalize();
        GitRunner.Result r = GitRunner.run(
                workDir,
                "log",
                "--pretty=format:%h%x1f%H%x1f%s%x1f%an%x1f%aI%x1f%D",
                "--max-count=" + limit,
                "--skip=" + offset);
        if (!r.ok()) {
            sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("entries", List.of(), "error", r.stderr())));
            return;
        }

        List<Map<String, Object>> entries = new ArrayList<>();
        for (String line : r.stdout().split("\n")) {
            if (line.trim().isEmpty()) continue;
            String[] f = line.split("\u001f", -1);
            Map<String, Object> entry = new HashMap<>();
            entry.put("hash", f.length > 0 ? f[0] : "");
            entry.put("hashFull", f.length > 1 ? f[1] : "");
            entry.put("subject", f.length > 2 ? f[2] : "");
            entry.put("author", f.length > 3 ? f[3] : "");
            entry.put("date", f.length > 4 ? f[4] : "");
            entry.put("refs", f.length > 5 ? f[5] : "");
            entries.add(entry);
        }

        sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("entries", entries)));
    }

    private static int parseInt(String v, int def) {
        if (v == null || v.isEmpty()) return def;
        return Integer.parseInt(v);
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}