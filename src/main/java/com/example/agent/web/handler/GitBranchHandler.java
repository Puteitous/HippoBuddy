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
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * GitBranchHandler - 分支列表与当前分支
 *
 * <p>GET /api/git/branch?path=<br>
 * 基于 {@code git branch --format='%(HEAD)\x1f%(refname:short)'},HEAD 标记的行
 * 为当前分支(带 <code>*</code>),其余为分支名列表。
 */
public class GitBranchHandler implements HttpHandler {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        String workspacePath = GitRunner.parseQuery(exchange.getRequestURI().getQuery()).get("path");
        if (workspacePath == null || workspacePath.isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing path parameter")));
            return;
        }

        Path workDir = Paths.get(workspacePath).normalize();
        GitRunner.Result r = GitRunner.run(workDir, "branch", "--format=%(HEAD)%x1f%(refname:short)");
        if (!r.ok()) {
            sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("current", "", "names", List.of())));
            return;
        }

        String current = "";
        List<String> names = new ArrayList<>();
        for (String line : r.stdout().split("\n")) {
            if (line.trim().isEmpty()) continue;
            int sep = line.indexOf('\u001f');
            String head = sep >= 0 ? line.substring(0, sep).trim() : "";
            String name = sep >= 0 ? line.substring(sep + 1).trim() : line.trim();
            if (name.isEmpty()) continue;
            if ("*".equals(head)) {
                current = name;
            } else {
                names.add(name);
            }
        }

        sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("current", current, "names", names)));
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}