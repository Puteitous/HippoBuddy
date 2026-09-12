package com.example.agent.web.handler;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

public class GitStatusHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(GitStatusHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        String query = exchange.getRequestURI().getQuery();
        String workspacePath = null;

        if (query != null) {
            String[] params = query.split("&");
            for (String param : params) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2 && "path".equals(kv[0])) {
                    workspacePath = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                }
            }
        }

        if (workspacePath == null || workspacePath.isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing path parameter")));
            return;
        }

        try {
            Map<String, Object> result = getGitStatus(workspacePath);
            sendJson(exchange, 200, objectMapper.writeValueAsString(result));
        } catch (Exception e) {
            logger.error("Git status error for path: {}", workspacePath, e);
            sendJson(exchange, 500, objectMapper.writeValueAsString(Map.of("error", e.getMessage())));
        }
    }

    static Map<String, Object> getGitStatus(String workspacePath) throws IOException, InterruptedException {
        Map<String, Object> result = new HashMap<>();
        Path path = Paths.get(workspacePath).normalize();

        // 检查目录是否存在以及是否为 git 仓库
        if (!Files.exists(path) || !Files.isDirectory(path)) {
            result.put("available", false);
            result.put("error", "目录不存在");
            return result;
        }

        Path gitDir = path.resolve(".git");
        if (!Files.exists(gitDir) || !Files.isDirectory(gitDir)) {
            result.put("available", false);
            result.put("error", "不是 Git 仓库");
            return result;
        }

        ProcessBuilder pb = new ProcessBuilder("git", "status", "--porcelain", "-u");
        pb.directory(path.toFile());
        pb.redirectErrorStream(false);
        // 禁止分页器
        pb.environment().put("GIT_PAGER", "cat");
        pb.environment().put("PAGER", "cat");

        Process process = pb.start();
        boolean completed = process.waitFor(10, java.util.concurrent.TimeUnit.SECONDS);

        if (!completed) {
            process.destroyForcibly();
            result.put("available", false);
            result.put("error", "git status 超时");
            return result;
        }

        // 读取标准输出
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (output.length() > 0) output.append("\n");
                output.append(line);
            }
        }

        // 读取标准错误
        StringBuilder errorOutput = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (errorOutput.length() > 0) errorOutput.append("\n");
                errorOutput.append(line);
            }
        }

        if (process.exitValue() != 0) {
            result.put("available", false);
            result.put("error", "git status 执行失败: " + errorOutput);
            return result;
        }

        // 解析 git status --porcelain 输出
        // 格式: XY filepath 或 XY filepath -> filepath (重命名)
        // 结构化条目:保留原始 XY 状态段,供源码管理面板与文件树徽章共用以区分已暂存/未暂存
        List<Map<String, Object>> entries = new ArrayList<>();
        String[] lines = output.toString().split("\n");
        for (String line : lines) {
            if (line.trim().isEmpty()) continue;

            // 原始两字母 XY 段(X = 暂存区 index,Y = 工作区 worktree)
            String rawXy = line.substring(0, 2);
            char x = rawXy.charAt(0);
            char y = rawXy.charAt(1);

            String filePath = line.substring(2).trim();

            // 处理重命名: "R  oldname -> newname"
            if (filePath.contains(" -> ")) {
                filePath = filePath.split(" -> ")[1].trim();
            }

            // 转换成使用正斜杠
            filePath = filePath.replace('\\', '/');

            Map<String, Object> entry = new HashMap<>();
            entry.put("path", filePath);
            entry.put("xy", rawXy);
            entry.put("staged", x != ' ' && x != '?');
            entry.put("unstaged", y != ' ' || rawXy.equals("??"));
            entry.put("untracked", rawXy.equals("??"));
            entries.add(entry);
        }

        result.put("available", true);
        result.put("entries", entries);
        return result;
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
