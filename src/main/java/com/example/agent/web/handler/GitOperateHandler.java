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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * GitOperateHandler - 源码管理面板写操作
 *
 * <p>POST /api/git/operate,body {@code {action, path, file?, message?, branch?}}:
 * <ul>
 *   <li>add:      {@code git add [file]}(无 file 全部)</li>
 *   <li>reset:    {@code git reset [file]}(取消暂存)</li>
 *   <li>commit:   {@code git commit -m message}</li>
 *   <li>checkout: {@code git checkout branch}</li>
 * </ul>
 * 成功后返回 {@code {success:true}},失败 {@code {success:false, error:...}}。
 */
public class GitOperateHandler implements HttpHandler {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        JsonNode body = objectMapper.readTree(exchange.getRequestBody());
        String action = body.path("action").asText("");
        String workspacePath = body.path("path").asText("");
        String file = GitRunner.normalizeRelPath(body.path("file").asText("").isEmpty() ? null : body.path("file").asText());
        String message = body.path("message").asText("");
        String branch = body.path("branch").asText("");

        if (action.isEmpty() || workspacePath.isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("success", false, "error", "Missing action/path")));
            return;
        }

        Path workDir = Paths.get(workspacePath).normalize();

        GitRunner.Result r;
        switch (action) {
            case "add" -> {
                r = file == null ? GitRunner.run(workDir, "add", "--", ".") : GitRunner.run(workDir, "add", "--", file);
            }
            case "reset" -> {
                r = file == null ? GitRunner.run(workDir, "reset") : GitRunner.run(workDir, "reset", "--", file);
            }
            case "commit" -> {
                if (message.isEmpty()) {
                    sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", false, "error", "Empty commit message")));
                    return;
                }
                r = GitRunner.run(workDir, "commit", "-m", message);
            }
            case "checkout" -> {
                if (branch.isEmpty()) {
                    sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", false, "error", "Empty branch")));
                    return;
                }
                r = GitRunner.run(workDir, "checkout", branch);
            }
            default -> {
                sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("success", false, "error", "Unknown action: " + action)));
                return;
            }
        }

        if (r.ok()) {
            sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", true)));
        } else {
            String err = r.stderr();
            if (err == null || err.isEmpty()) err = r.stdout();
            sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", false, "error", err)));
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