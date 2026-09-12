package com.example.agent.web.handler;

import com.example.agent.web.util.DiffComputer;
import com.example.agent.web.util.GitRunner;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
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

/**
 * GitDiffHandler - 单个文件的 git diff
 *
 * <p>GET /api/git/diff?path=&amp;side=worktree|staged|commit&amp;file=&amp;hash=<br>
 * 两种模式:
 * <ul>
 *   <li>文件级(file 必填):取两个版本文本后用 {@link DiffComputer} 计算行级 + 词级 diff,
 *       对齐文件变更面板 /api/files/diff 的 changes/wordDiff,前端复用 FilePreviewDiff。</li>
 *   <li>提交全量(side=commit 且无 file):解析 {@code git show --no-color --unified} 的统一
 *       diff 输出为 changes(无词级),用于历史面板查看某次提交的完整改动。</li>
 * </ul>
 * 对比语义:
 *   worktree = HEAD 版本 vs 工作区磁盘(未跟踪 HEAD 缺失 → 整文件新增)
 *   staged   = HEAD 版本 vs 暂存区(git show :file)
 *   commit   = 父版本 vs 该提交版本
 */
public class GitDiffHandler implements HttpHandler {

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final DiffComputer diffComputer = DiffComputer.DEFAULT;

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        Map<String, String> params = GitRunner.parseQuery(exchange.getRequestURI().getQuery());
        String workspacePath = params.get("path");
        String side = params.getOrDefault("side", "worktree");
        String file = GitRunner.normalizeRelPath(params.get("file"));
        String hash = params.get("hash");

        if (workspacePath == null || workspacePath.isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing path parameter")));
            return;
        }
        if ("commit".equals(side) && (hash == null || hash.isEmpty())) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing hash for commit diff")));
            return;
        }

        Path workDir = Paths.get(workspacePath).normalize();

        // 提交全量 diff:无 file 时解析 git show 的统一 diff
        if ("commit".equals(side) && file == null) {
            GitRunner.Result shown = GitRunner.run(workDir, "show", "--pretty=", "--no-color", "--unified=3", hash);
            Map<String, Object> wide = new HashMap<>();
            if (shown.stdout().contains("Binary files")) {
                wide.put("filePath", "");
                wide.put("side", side);
                wide.put("binary", true);
                wide.put("changes", List.of());
                wide.put("wordDiff", Map.of("old", List.of(), "new", List.of()));
            } else {
                wide.put("filePath", "");
                wide.put("side", side);
                wide.put("binary", false);
                wide.put("changes", parseUnified(shown.stdout()));
                wide.put("wordDiff", Map.of("old", List.of(), "new", List.of()));
            }
            sendJson(exchange, 200, objectMapper.writeValueAsString(wide));
            return;
        }

        if (file == null) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing file parameter")));
            return;
        }

        String original;
        String modified = "";
        boolean binary = false;

        switch (side) {
            case "staged" -> {
                original = GitRunner.showFile(workDir, "HEAD", file);
                if (original == null) original = "";
                modified = GitRunner.showIndex(workDir, file);
                if (modified == null) modified = "";
            }
            case "commit" -> {
                original = GitRunner.showFile(workDir, hash + "^", file);
                if (original == null) original = "";
                modified = GitRunner.showFile(workDir, hash, file);
                if (modified == null) modified = "";
            }
            default -> { // worktree
                original = GitRunner.showFile(workDir, "HEAD", file);
                if (original == null) original = "";
                Path target = workDir.resolve(file);
                if (Files.exists(target) && Files.isRegularFile(target)) {
                    try {
                        byte[] raw = Files.readAllBytes(target);
                        if (GitRunner.containsNul(raw)) {
                            binary = true;
                        } else {
                            modified = new String(raw, StandardCharsets.UTF_8);
                        }
                    } catch (IOException e) {
                        modified = "";
                    }
                } else {
                    modified = ""; // 已删除
                }
            }
        }
        if (modified == null) modified = "";
        if (binary) modified = "";

        Map<String, Object> response = new HashMap<>();
        response.put("filePath", file);
        response.put("side", side);
        response.put("binary", binary);
        if (binary) {
            response.put("changes", List.of());
            response.put("wordDiff", Map.of("old", List.of(), "new", List.of()));
        } else {
            response.put("changes", diffComputer.computeDiffAsMap(original, modified));
            response.put("wordDiff", diffComputer.computeWordDiffLines(original, modified));
        }

        sendJson(exchange, 200, objectMapper.writeValueAsString(response));
    }

    /**
     * 解析 git unified diff 输出为 DiffLine({type, content})。
     * 跳过 diff/index/---/+++/new file 等文件头;@@ 与上下文归为 same,+/- 归为 added/removed。
     * 注意:置于独立的文件头行以 +++++ 等 '+'/'-' 开头,已在 skip 中排除,避免误判。
     */
    static List<Map<String, String>> parseUnified(String out) {
        List<Map<String, String>> changes = new ArrayList<>();
        if (out == null || out.isEmpty()) return changes;
        for (String line : out.split("\n")) {
            if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("new file mode")
                    || line.startsWith("deleted file mode") || line.startsWith("--- ") || line.startsWith("+++ ")
                    || line.startsWith("similarity index") || line.startsWith("rename from") || line.startsWith("rename to")
                    || line.startsWith("old mode") || line.startsWith("new mode")) {
                continue;
            }
            String type;
            String content;
            if (line.startsWith("@@")) {
                type = "same";
                content = line;
            } else if (line.startsWith("+")) {
                type = "added";
                content = line.substring(1);
            } else if (line.startsWith("-")) {
                type = "removed";
                content = line.substring(1);
            } else {
                type = "same";
                content = line;
            }
            // 上下文行统一去前缀空格(与 readLine 一致的无头上下文)
            if ("same".equals(type) && content.startsWith(" ")) {
                content = content.substring(1);
            }
            changes.add(Map.of("type", type, "content", content));
        }
        return changes;
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}