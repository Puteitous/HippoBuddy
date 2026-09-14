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
 * 本地分支基于 {@code git branch --format='%(HEAD)%1f%(refname:short)'}(HEAD 标记为当前分支),
 * 远端分支基于 {@code git branch -r --format='%(refname:short)'}(过滤 origin/HEAD 符号引用)。
 * 返回 {@code {current, names, remotes}}。
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

        // 本地分支
        GitRunner.Result local = GitRunner.run(workDir, "branch", "--format=%(HEAD)%1f%(refname:short)");
        String current = "";
        List<String> names = new ArrayList<>();
        if (local.ok()) {
            for (String line : local.stdout().split("\n")) {
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
        }

        // 远端分支(origin/* 等),过滤 origin/HEAD 符号引用与已存在同名本地分支
        List<String> remotes = new ArrayList<>();
        GitRunner.Result rr = GitRunner.run(workDir, "branch", "-r", "--format=%(refname:short)");
        if (rr.ok()) {
            for (String line : rr.stdout().split("\n")) {
                String name = line.trim();
                if (name.isEmpty()) continue;
                String shortName = name;
                int slash = name.indexOf('/');
                if (slash > 0) shortName = name.substring(slash + 1);
                if (name.contains("HEAD") || names.contains(shortName)) continue;
                remotes.add(name);
            }
        }

        sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("current", current, "names", names, "remotes", remotes)));
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}