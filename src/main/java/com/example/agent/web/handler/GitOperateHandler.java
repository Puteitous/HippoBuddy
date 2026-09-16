package com.example.agent.web.handler;

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
 *   <li>checkout: {@code git checkout branch}(remote 分支本地化为跟踪分支)</li>
 *   <li>fetch:    {@code git fetch --all --prune}</li>
 *   <li>pull:     {@code git pull}</li>
 *   <li>push:     {@code git push -u origin branch}(无 branch 时 {@code git push})</li>
 *   <li>createBranch: {@code git branch newName [branch]}(branch 为可选起始点)</li>
 *   <li>renameBranch: {@code git branch -m branch newName}</li>
 *   <li>deleteBranch: {@code git branch -d branch}(仅删已合并分支)</li>
 *   <li>init:      {@code git init}(将当前目录初始化为 git 仓库)</li>
 * </ul>
 * 成功后返回 {@code {success:true}},失败 {@code {success:false, error:...}}。
 */
public class GitOperateHandler implements HttpHandler {

    private static final ObjectMapper objectMapper = new ObjectMapper();
    /** 远端网络操作(fetch/pull/push)超时:上传/认证/服务端处理较慢,放宽到 30s */
    private static final long REMOTE_TIMEOUT_SECONDS = 30;

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
        String newName = body.path("newName").asText("");
        String hash = body.path("hash").asText();

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
                // 远端分支(origin/xxx)切换到本地跟踪分支: git checkout -b <local> --track <remote>
                if (branch.startsWith("origin/") || branch.contains("/")) {
                    int slash = branch.indexOf('/');
                    String local = branch.substring(slash + 1);
                    r = GitRunner.run(workDir, "checkout", "-b", local, "--track", branch);
                } else {
                    r = GitRunner.run(workDir, "checkout", branch);
                }
            }
            case "discard" -> {
                if (file == null) {
                    r = GitRunner.run(workDir, "restore", ".");
                } else {
                    // 已跟踪文件 → git restore 丢弃工作区改动;未跟踪文件 restore 会失败,回退直接删除
                    GitRunner.Result tracked = GitRunner.run(workDir, "ls-files", "--error-unmatch", "--", file);
                    if (tracked.ok()) {
                        r = GitRunner.run(workDir, "restore", "--", file);
                    } else {
                        Path target = workDir.resolve(file).normalize();
                        if (Files.exists(target)) {
                            Files.delete(target);
                            r = new GitRunner.Result(0, "", "");
                        } else {
                            r = new GitRunner.Result(1, "", "该文件不存在");
                        }
                    }
                }
            }
            case "revert" -> {
                if (hash.isEmpty()) {
                    sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", false, "error", "Empty hash")));
                    return;
                }
                r = GitRunner.run(workDir, "revert", "--no-edit", hash);
            }
            case "cherryPick" -> {
                if (hash.isEmpty()) {
                    sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", false, "error", "Empty hash")));
                    return;
                }
                r = GitRunner.run(workDir, "cherry-pick", hash);
            }
            case "fetch" -> {
                r = GitRunner.run(workDir, REMOTE_TIMEOUT_SECONDS, "fetch", "--all", "--prune");
            }
            case "pull" -> {
                r = GitRunner.run(workDir, REMOTE_TIMEOUT_SECONDS, "pull");
            }
            case "push" -> {
                // 用 -u 自动设置/确认上游分支,避免无上游时 git push 报错
                r = branch.isEmpty() ? GitRunner.run(workDir, REMOTE_TIMEOUT_SECONDS, "push") : GitRunner.run(workDir, REMOTE_TIMEOUT_SECONDS, "push", "-u", "origin", branch);
            }
            case "createBranch" -> {
                if (newName.isEmpty()) {
                    sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", false, "error", "Empty branch name")));
                    return;
                }
                // 可选 start-point(branch 字段):默认基于当前 HEAD
                r = branch.isEmpty() ? GitRunner.run(workDir, "branch", newName) : GitRunner.run(workDir, "branch", newName, branch);
            }
            case "renameBranch" -> {
                if (branch.isEmpty() || newName.isEmpty()) {
                    sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", false, "error", "Empty branch/newName")));
                    return;
                }
                r = GitRunner.run(workDir, "branch", "-m", branch, newName);
            }
            case "deleteBranch" -> {
                if (branch.isEmpty()) {
                    sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", false, "error", "Empty branch")));
                    return;
                }
                // -d 仅删已合并分支;未合并会报错并给出提示
                r = GitRunner.run(workDir, "branch", "-d", branch);
            }
            case "init" -> {
                r = GitRunner.run(workDir, "init");
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