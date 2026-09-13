package com.example.agent.web.handler;

import com.example.agent.config.Config;
import com.example.agent.config.UiConfig;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.stream.StreamChunk;
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
import java.util.function.Consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * GitCommitMessageHandler - 让 LLM 依据当前 git 变更流式生成提交信息
 *
 * <p>POST /api/git/commit-message,body {@code {path}}:<br>
 * 收集工作区与暂存区的变更(文件列表 + diff 摘要,超长截断),构造 prompt 调用
 * {@link LlmClient#chatStream} 流式生成,输出 SSE 事件:
 * {@code event: delta / data: {"d":"..."}}、结束 {@code event: complete / data:[DONE]}。
 * 无变更或启动失败返回普通 JSON {@code {error}}。
 */
public class GitCommitMessageHandler implements HttpHandler {

    private static final ObjectMapper objectMapper = new ObjectMapper();
    /** diff 摘要最大字符数,超出截断避免 prompt 过长 */
    private static final int MAX_DIFF_CHARS = 6000;
    /** 最多展示的变更文件数(超出折叠统计),避免 prompt 过长 */
    private static final int MAX_FILES = 50;

    /** 默认 system prompt;用户未通过配置覆盖时(ui.git_commit_prompt 为空)使用 */
    private static final String DEFAULT_SYSTEM_PROMPT = """
        你是一位资深开发者的 git commit message 生成器。根据给定的代码变更，编写一条简洁、规范的中文提交信息。
        要求：
        1. 第一行为标题，格式「type(scope): 简述」，type 取自 feat/fix/refactor/style/docs/test/chore，scope 为该次改动的模块名（尽量短）
        2. 标题后空一行，然后用带序号的分点列出主要改动，每条以「N. 」开头
        3. 只输出提交信息本身（含换行），不要任何解释或额外文字
        """;

    /** 默认 user 模板;用户未通过配置覆盖时(ui.git_commit_template 为空)使用 */
    private static final String DEFAULT_PROMPT_TEMPLATE = """
        以下是本次代码变更：

        %s

        请为它生成一条 commit message。
        """;

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");

        // GET /api/git/commit-message/defaults - 返回内置默认生成提示词(供设置页展示与恢复默认)
        if ("GET".equals(exchange.getRequestMethod())) {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/api/git/commit-message/defaults")) {
                sendJson(exchange, 200, Map.of("systemPrompt", DEFAULT_SYSTEM_PROMPT));
                return;
            }
            sendJson(exchange, 404, Map.of("error", "Not Found"));
            return;
        }

        JsonNode body;
        try {
            body = objectMapper.readTree(exchange.getRequestBody());
        } catch (IOException e) {
            sendJson(exchange, 400, Map.of("error", "Invalid JSON body"));
            return;
        }
        String workspacePath = body.path("path").asText("");
        if (workspacePath.isEmpty()) {
            sendJson(exchange, 400, Map.of("error", "Missing path parameter"));
            return;
        }

        Path workDir = Paths.get(workspacePath).normalize();
        String changeSummary = collectChanges(workDir);
        if (changeSummary.isEmpty()) {
            sendJson(exchange, 200, Map.of("error", "没有可提交的变更"));
            return;
        }

        exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache");
        exchange.sendResponseHeaders(200, 0);

        List<Message> messages = new ArrayList<>();
        UiConfig ui = Config.getInstance().getUi();
        String systemPrompt = blankToDefault(ui.getGitCommitPrompt(), DEFAULT_SYSTEM_PROMPT);
        messages.add(Message.system(systemPrompt));
        // 用户模板固定使用内置默认,仅暴露 System 提示词供自定义
        messages.add(Message.user(DEFAULT_PROMPT_TEMPLATE.formatted(changeSummary)));

        try (OutputStream out = exchange.getResponseBody()) {
            Consumer<StreamChunk> onChunk = chunk -> {
                if (chunk.hasContent()) {
                    writeSseQuietly(out, "delta", "{\"d\":" + objectMapperQuote(chunk.getContent()) + "}");
                }
            };
            LlmClient llmClient = ServiceLocator.get(LlmClient.class);
            llmClient.chatStream(messages, onChunk);
            writeSseQuietly(out, "complete", "[DONE]");
            out.flush();
        } catch (Exception e) {
            // 已进入流式阶段,错误通过 delta 携带一条文案兜底(尽力而为)
        }
    }

    /** 用户配置值为空白时回退到内置默认 */
    private static String blankToDefault(String configured, String defaultVal) {
        return (configured == null || configured.isBlank()) ? defaultVal : configured;
    }

    /** 把文本安全的 JSON 字符串转义后包裹引号 */
    private String objectMapperQuote(String s) {
        try {
            return objectMapper.writeValueAsString(s);
        } catch (Exception e) {
            return "\"\"";
        }
    }

    private void writeSseQuietly(OutputStream out, String event, String data) {
        try {
            out.write(("event: " + event + "\ndata: " + data + "\n\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (IOException ignored) {
            // 客户端断开时忽略
        }
    }

    /** 收集变更摘要:文件清单 + 真实行级 diff(带 2 行上下文),按「有暂存取暂存、否则取未暂存」;超长截断 */
    private String collectChanges(Path workDir) {
        GitRunner.Result porcelain = GitRunner.run(workDir, "status", "--porcelain");
        if (!porcelain.ok() || porcelain.stdout().isBlank()) return "";

        StringBuilder sb = new StringBuilder();
        sb.append("变更文件:\n");
        List<String> files = new ArrayList<>();
        for (String line : porcelain.stdout().split("\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            String path = trimmed.length() > 3 ? trimmed.substring(3).trim() : trimmed;
            if (!path.isEmpty() && !files.contains(path)) files.add(path);
        }
        for (String f : files) sb.append("- ").append(f).append("\n");

        // 优先总结暂存区(commit 真正提交的内容);无暂存时回退到未暂存
        boolean hasStaged = !GitRunner.run(workDir, "diff", "--cached", "--name-only").stdout().isBlank();
        String diff = hasStaged
                ? diffOf(workDir, true)
                : diffOf(workDir, false);

        sb.append("\n差异摘要").append(hasStaged ? "(已暂存区):\n" : "(未暂存区):\n");
        if (diff.isBlank()) sb.append("(仅新增/删除未跟踪文件，无可对比差异)");
        else sb.append(truncateDiff(diff));

        if (files.size() > MAX_FILES) {
            sb.append("\n…共 ").append(files.size()).append(" 个文件，其余略");
        }
        return sb.toString();
    }

    /** diff 超长时优先保留每个文件块的开头(按文件均衡分配预算),而非整段切断尾部 */
    private String truncateDiff(String diff) {
        if (diff.length() <= MAX_DIFF_CHARS) return diff;
        List<String> blocks = splitBlocks(diff);
        int shownCap = Math.min(blocks.size(), MAX_FILES);
        // 给每个文件块分配预算,避免某个文件独占全部长度
        int budget = Math.max(200, MAX_DIFF_CHARS / shownCap);
        StringBuilder sb = new StringBuilder();
        int shown = 0;
        for (String blk : blocks) {
            if (shown >= shownCap) {
                sb.append("…后续 ").append(blocks.size() - shown).append(" 个文件 diff 略");
                break;
            }
            String part = truncateLines(blk, budget);
            if (part.length() < blk.length()) part += "\n…(该文件 diff 截断)";
            sb.append(part).append("\n");
            shown++;
        }
        return sb.toString();
    }

    /** 按 {@code diff --git } 开头把整个 diff 拆分为多个文件块 */
    private List<String> splitBlocks(String diff) {
        List<String> blocks = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String line : diff.split("\n", -1)) {
            // 每新出现 "diff --git a/xx b/xx" 即开始下一个文件块
            if (line.startsWith("diff --git ") && cur.length() > 0) {
                blocks.add(cur.toString());
                cur.setLength(0);
            }
            cur.append(line).append("\n");
        }
        if (cur.length() > 0) blocks.add(cur.toString());
        return blocks;
    }

    /** 按整行截断到 limit,不切碎单行 */
    private String truncateLines(String text, int limit) {
        if (text.length() <= limit) return text;
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\n", -1)) {
            if (sb.length() + line.length() + 1 > limit) break;
            sb.append(line).append("\n");
        }
        return sb.toString();
    }

    /** 取 staged(--cached) 或 unstaged 的真实行级 diff(带 2 行上下文),失败返回空串 */
    private String diffOf(Path workDir, boolean staged) {
        GitRunner.Result r = staged
                ? GitRunner.run(workDir, "diff", "--cached", "--unified=2")
                : GitRunner.run(workDir, "diff", "--unified=2");
        return r.ok() ? r.stdout() : "";
    }

    private void sendJson(HttpExchange exchange, int status, Map<String, String> payload) throws IOException {
        byte[] bytes = objectMapper.writeValueAsBytes(payload);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}