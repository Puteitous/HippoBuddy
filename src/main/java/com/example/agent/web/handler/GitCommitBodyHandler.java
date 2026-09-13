package com.example.agent.web.handler;

import com.example.agent.web.util.GitRunner;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * GitCommitBodyHandler - 单个提交的标题与正文
 *
 * <p>GET /api/git/commit-body?path=&amp;hash=<br>
 * 基于 {@code git log -1 --pretty=format:%s%x1f%b <hash>},一次调用同时取标题与正文,
 * 字段以 \x1f 分隔。只取单个提交,故正文中的换行不影响解析(不按行切分记录)。
 *
 * <p>存在的意义:{@link GitLogHandler} 列表接口只取 {@code %s}(标题),不含正文;
 * 正文天生多行,若塞进列表接口会破坏"一行一提交"的按行解析。故单独开接口按需取,
 * 供提交历史悬浮卡片展示正文。
 */
public class GitCommitBodyHandler implements HttpHandler {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 允许的提交 hash:十六进制 4-40 位。
     * 下限取 4 是因 git 缩写长度自适应(大仓库可能长于 7),上限为完整 SHA-1 长度。
     * 校验同时可防止 {@code --all} 这类以 {@code -} 开头的串被 git 当作选项解析。
     */
    private static final String HASH_PATTERN = "[0-9a-fA-F]{4,40}";

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        Map<String, String> params = GitRunner.parseQuery(exchange.getRequestURI().getQuery());
        String workspacePath = params.get("path");
        String hash = params.get("hash");
        if (workspacePath == null || workspacePath.isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing path parameter")));
            return;
        }
        if (hash == null || !hash.matches(HASH_PATTERN)) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing or invalid hash parameter")));
            return;
        }

        Path workDir = Paths.get(workspacePath).normalize();
        GitRunner.Result r = GitRunner.run(workDir, "log", "-1", "--pretty=format:%s%x1f%b", hash);
        if (!r.ok()) {
            // 提交不存在等:返回空标题/正文 + error,前端按"无正文"展示,不打断悬浮卡片
            Map<String, Object> fail = new HashMap<>();
            fail.put("subject", "");
            fail.put("body", "");
            fail.put("error", r.stderr().trim());
            sendJson(exchange, 200, objectMapper.writeValueAsString(fail));
            return;
        }

        String[] f = r.stdout().split("\u001f", 2);
        Map<String, Object> result = new HashMap<>();
        // 提交信息首尾的空白(末尾换行、缩进)对展示无意义,统一去除
        result.put("subject", f.length > 0 ? f[0].trim() : "");
        result.put("body", f.length > 1 ? f[1].trim() : "");
        sendJson(exchange, 200, objectMapper.writeValueAsString(result));
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
