package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.tools.FileChangeTracker;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.orchestrator.WebAgentOrchestrator;
import com.example.agent.web.util.ConversationJsonlReader;
import com.example.agent.web.util.DiffComputer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.example.agent.logging.WorkspaceManager.getSessionDir;

/**
 * 对话级回滚处理器。
 * <p>
 * 负责回滚预览和回滚执行两条 API：
 * <ul>
 *   <li>POST /api/sessions/{id}/rewind-check — 回滚预览</li>
 *   <li>POST /api/sessions/{id}/rewind — 回滚执行</li>
 * </ul>
 * <p>
 * 从 {@link SessionApiHandler} 拆分独立，职责内聚。
 * <p>
 * 此外还提供会话分叉（fork）API：
 * <ul>
 *   <li>POST /api/sessions/{id}/fork — 从指定消息处分叉为新会话</li>
 * </ul>
 */
public class SessionRewindHandler {

    private static final Logger logger = LoggerFactory.getLogger(SessionRewindHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final ConversationJsonlReader jsonlReader = new ConversationJsonlReader(objectMapper);

    /**
     * 回滚预览：收集目标消息之后的所有文件操作变更。
     * POST /api/sessions/{id}/rewind-check
     */
    public void handleRewindCheck(HttpExchange exchange, String sessionId) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = objectMapper.readTree(requestBody);
        String messageId = json.has("messageId") ? json.get("messageId").asText() : "";

        logger.info("handleRewindCheck: sessionId={}, messageId={}", sessionId, messageId);

        if (messageId.isBlank()) {
            sendJson(exchange, Map.of("files", List.of()));
            return;
        }

        List<Map<String, Object>> previewFiles = collectFileChangesAfterMessage(sessionId, messageId);
        logger.info("handleRewindCheck: 返回 {} 个文件", previewFiles.size());
        sendJson(exchange, Map.of("files", previewFiles));
    }

    /**
     * 对话级回滚执行。
     * POST /api/sessions/{id}/rewind
     * <p>
     * 流程：
     * 1. 从 conversation.jsonl 提取目标消息后的文件操作 toolCallId，逆序回滚
     * 2. 截断内存中的 Conversation 消息
     * 3. 事务性重写 JSONL 文件
     */
    /**
     * 对话级回滚执行。
     * POST /api/sessions/{id}/rewind
     * <p>
     * 流程：
     * 1. 从 conversation.jsonl 提取目标消息后的文件操作 toolCallId，逆序回滚
     * 2. 截断内存中的 Conversation 消息
     * 3. 事务性重写 JSONL 文件
     * <p>
     * 请求体支持 mode 参数：
     * <ul>
     *   <li>{@code "all"}（默认）— 回滚文件 + 截断会话</li>
     *   <li>{@code "files"} — 仅回滚文件，保留会话记录</li>
     * </ul>
     */
    public void handleRewindSession(HttpExchange exchange, String sessionId) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = objectMapper.readTree(requestBody);
        String messageId = json.has("messageId") ? json.get("messageId").asText("") : "";
        String mode = json.has("mode") ? json.get("mode").asText("") : "all";

        logger.info("handleRewindSession: sessionId={}, messageId={}, mode={}", sessionId, messageId, mode);

        if (messageId.isBlank()) {
            sendError(exchange, 400, "messageId is required");
            return;
        }

        Conversation conversation = com.example.agent.web.session.WebSessionManager.getInstance().getSessions().get(sessionId);
        boolean isActiveSession = conversation != null;
        ConversationService conversationService = null;
        Path jsonlPath;

        if (isActiveSession) {
            conversationService = ServiceLocator.get(ConversationService.class);
            jsonlPath = conversationService.flushTranscript(sessionId);
        } else {
            jsonlPath = jsonlReader.findJsonlFile(sessionId);
        }

        if (jsonlPath == null || !Files.exists(jsonlPath)) {
            logger.warn("handleRewindSession: JSONL 文件不存在 sessionId={}", sessionId);
            sendError(exchange, 404, "Session not found");
            return;
        }

        try {
            boolean foundMessageInJsonl = false;
            String userMessageContent = null;
            for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
                if (line.isBlank()) continue;
                try {
                    JsonNode lineNode = objectMapper.readTree(line);
                    String uuid = lineNode.has("uuid") ? lineNode.get("uuid").asText() : "";
                    if (messageId.equals(uuid)) {
                        foundMessageInJsonl = true;
                        JsonNode msgNode = lineNode.get("message");
                        if (msgNode != null && msgNode.has("content")) {
                            userMessageContent = msgNode.get("content").asText();
                        }
                        break;
                    }
                } catch (Exception ignored) {}
            }
            if (!foundMessageInJsonl) {
                sendError(exchange, 404, "Message not found in session file");
                return;
            }

            // 回滚文件变更（mode == "files" || mode == "all"）
            boolean rollbackFiles = "files".equals(mode) || "all".equals(mode);
            int filesChanged = 0;
            if (rollbackFiles) {
                filesChanged = executeRewindRollback(jsonlPath, messageId);
            }

            // 截断会话（仅 mode == "all"）
            if ("all".equals(mode)) {
                truncateConversationJsonl(jsonlPath, sessionId, messageId);

                if (isActiveSession) {
                    int removed = conversationService.truncateMessagesAfter(conversation, messageId);
                    logger.debug("内存截断完成: sessionId={}, 删除{}条消息", sessionId, removed);
                    conversationService.destroyTranscript(sessionId);
                    conversationService.ensureSessionComponents(conversation);
                }
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "all".equals(mode) ? "已回滚到指定轮次" : "文件已回滚");
            response.put("filesChanged", filesChanged);
            response.put("mode", mode);
            if (userMessageContent != null) {
                response.put("lastUserMessage", userMessageContent);
            }
            sendJson(exchange, response);

        } catch (Exception e) {
            logger.error("回滚失败: sessionId={}", sessionId, e);
            sendError(exchange, 500, "回滚失败: " + e.getMessage());
        }
    }

    /**
     * 会话分叉：从指定消息处复制历史记录到新会话。
     * POST /api/sessions/{id}/fork
     * <p>
     * 新会话包含目标消息之前的所有历史（含系统消息），
     * 并继承源会话的 session.json 元数据（如 workspacePath）。
     * 分叉后前端应切换到新会话 ID 继续对话。
     */
    public void handleForkSession(HttpExchange exchange, String sessionId) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = objectMapper.readTree(requestBody);
        String messageId = json.has("messageId") ? json.get("messageId").asText("") : "";

        logger.info("handleForkSession: sessionId={}, messageId={}", sessionId, messageId);

        if (messageId.isBlank()) {
            sendError(exchange, 400, "messageId is required");
            return;
        }

        Path jsonlPath = findJsonlPathForSession(sessionId);
        if (jsonlPath == null || !Files.exists(jsonlPath)) {
            sendError(exchange, 404, "Session not found");
            return;
        }

        try {
            // 逐行读取，保留到当前轮次（含目标用户消息 + 后续助理回复，不含下一条用户消息）
            List<String> keptLines = new ArrayList<>();
            boolean found = false;
            for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
                if (line.isBlank()) continue;
                try {
                    JsonNode lineNode = objectMapper.readTree(line);
                    String uuid = lineNode.has("uuid") ? lineNode.get("uuid").asText() : "";
                    String type = lineNode.has("type") ? lineNode.get("type").asText("") : "";

                    if (!found) {
                        if (messageId.equals(uuid)) {
                            found = true;
                            keptLines.add(line); // 包含目标用户消息
                            continue;
                        }
                        keptLines.add(line);
                    } else {
                        // 找到目标后，遇到下一条用户消息则停止
                        if ("user".equals(type) && !uuid.equals(messageId)) {
                            break;
                        }
                        keptLines.add(line); // 包含助理回复
                    }
                } catch (Exception e) {
                    if (!found) keptLines.add(line);
                }
            }

            if (!found) {
                sendError(exchange, 404, "Message not found in session file");
                return;
            }

            // 剥离 _fork_ 链找到根 sessionId，新分叉始终使用 rootId + _fork_ + timestamp
            String rootSessionId = sessionId.indexOf("_fork_") > 0 ? sessionId.substring(0, sessionId.indexOf("_fork_")) : sessionId;
            String newSessionId = rootSessionId + "_fork_" + System.currentTimeMillis();

            // 继承源会话的缓存命中率历史，使分叉首轮能感知"上次正常→突降"的异常
            WebAgentOrchestrator.getInstance().propagateCacheHitRate(sessionId, newSessionId);

            // 创建新会话目录
            Path newSessionDir = getSessionDir(newSessionId);
            Files.createDirectories(newSessionDir);
            Path newJsonlPath = newSessionDir.resolve("conversation.jsonl");

            // 继承源会话的元数据（workspacePath 等）
            Path sourceMetadata = jsonlPath.getParent().resolve("session.json");
            if (Files.exists(sourceMetadata)) {
                Files.copy(sourceMetadata, newSessionDir.resolve("session.json"));
            }

            // 从源会话提取标题，生成可区分的分叉名称
            String sourceTitle = extractSessionTitle(jsonlPath);
            // 保底：如果标题为空或不是有效标题，使用"会话"+" " + sessionId 后缀
            if (sourceTitle == null || sourceTitle.isBlank()) {
                sourceTitle = "会话";
            }
            int parentNum = extractTrailingNumber(sourceTitle);
            String cleanTitle = parentNum > 0 ? sourceTitle.replaceAll(" \\(\\d+\\)$", "") : sourceTitle;
            logger.debug("分叉命名: sessionId={}, rootSessionId={}, sourceTitle={}, cleanTitle={}", sessionId, rootSessionId, sourceTitle, cleanTitle);
            // 找出该 cleanTitle 已用的最大编号（源自身算 1），新分叉 = max + 1
            int forkNum = findNextForkNumber(rootSessionId, jsonlPath, cleanTitle, parentNum > 0 ? parentNum : 1);
            String forkTitle = cleanTitle + " (" + forkNum + ")";

            // 构造 custom-title 条目
            ObjectNode titleEntry = objectMapper.createObjectNode();
            titleEntry.put("type", "custom-title");
            titleEntry.put("uuid", UUID.randomUUID().toString());
            titleEntry.put("sessionId", newSessionId);
            titleEntry.put("timestamp", java.time.Instant.now().toString());
            titleEntry.put("version", "1.0.0");
            titleEntry.put("cwd", System.getProperty("user.dir"));
            titleEntry.put("title", forkTitle);

            // 插入到 JSONL 开头，再写入
            keptLines.add(0, objectMapper.writeValueAsString(titleEntry));
            Files.write(newJsonlPath, keptLines, StandardCharsets.UTF_8);

            // 注册到 JSONL reader 缓存，使其立即可见
            jsonlReader.getFileCache().put(newSessionId, newJsonlPath);

            logger.info("分叉会话完成: source={}, newSessionId={}, 消息数={}", sessionId, newSessionId, keptLines.size());

            Map<String, Object> response = new HashMap<>();
            response.put("newSessionId", newSessionId);
            response.put("messageCount", keptLines.size());
            sendJson(exchange, response);

        } catch (Exception e) {
            logger.error("分叉会话失败: sessionId={}", sessionId, e);
            sendError(exchange, 500, "分叉失败: " + e.getMessage());
        }
    }

    /**
     * 从 conversation.jsonl 中提取目标消息后的所有文件操作 tool_call，
     * 提取 (filePath, toolCallId) 对，逆序执行 rollbackByToolCallId。
     */
    private int executeRewindRollback(Path jsonlPath, String messageId) throws IOException {
        List<Map.Entry<String, String>> rollbackEntries = new ArrayList<>();
        boolean foundTarget = false;

        for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                JsonNode lineNode = objectMapper.readTree(line);
                String uuid = lineNode.has("uuid") ? lineNode.get("uuid").asText("") : "";

                if (!foundTarget) {
                    if (uuid.equals(messageId)) {
                        foundTarget = true;
                    }
                    continue;
                }

                if (!"assistant".equals(lineNode.has("type") ? lineNode.get("type").asText("") : "")) continue;

                JsonNode msgNode = lineNode.get("message");
                if (msgNode == null) continue;
                JsonNode toolCalls = msgNode.get("tool_calls");
                if (toolCalls == null || !toolCalls.isArray()) continue;

                for (JsonNode tc : toolCalls) {
                    String toolCallId = tc.has("id") ? tc.get("id").asText("") : "";
                    if (toolCallId.isEmpty()) continue;

                    String toolName = tc.path("function").path("name").asText("");
                    ToolExecutor executor = ServiceLocator.get(ToolRegistry.class).getExecutor(toolName);
                    if (executor == null) continue;

                    JsonNode args;
                    try {
                        String argsStr = tc.path("function").path("arguments").asText("");
                        args = objectMapper.readTree(argsStr);
                    } catch (Exception e) {
                        continue;
                    }

                    for (String filePath : executor.getFilePaths(args)) {
                        rollbackEntries.add(Map.entry(filePath, toolCallId));
                    }
                }
            } catch (Exception ignored) {}
        }

        logger.debug("executeRewindRollback: 共收集到 {} 个回滚条目", rollbackEntries.size());

        int count = 0;
        for (int i = rollbackEntries.size() - 1; i >= 0; i--) {
            Map.Entry<String, String> entry = rollbackEntries.get(i);
            if (FileChangeTracker.rollbackByToolCallId(entry.getKey(), entry.getValue())) {
                count++;
            }
        }

        logger.info("executeRewindRollback: session 回滚完成, 成功 {} / 总共 {}", count, rollbackEntries.size());
        return count;
    }

    /**
     * 事务性重写 JSONL 文件：删除从 messageId 开始及之后的所有行。
     */
    private void truncateConversationJsonl(Path jsonlPath, String sessionId, String messageId) throws IOException {
        List<String> keptLines = new ArrayList<>();
        boolean passedTarget = false;

        for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                JsonNode lineNode = objectMapper.readTree(line);
                String uuid = lineNode.has("uuid") ? lineNode.get("uuid").asText() : "";
                if (messageId.equals(uuid)) {
                    passedTarget = true;
                    continue;
                }
                if (!passedTarget) {
                    keptLines.add(line);
                }
            } catch (Exception e) {
                if (!passedTarget) {
                    keptLines.add(line);
                }
            }
        }

        Path tempFile = jsonlPath.resolveSibling("conversation.jsonl.tmp");
        Files.write(tempFile, keptLines, StandardCharsets.UTF_8);
        Files.move(tempFile, jsonlPath, StandardCopyOption.REPLACE_EXISTING);
        jsonlReader.removeFromCache(sessionId);
        logger.debug("JSONL 文件截断完成: sessionId={}, 保留{}行", sessionId, keptLines.size());
    }

    /**
     * 回滚预览：从 conversation.jsonl 中收集目标消息之后的所有文件操作变更。
     */
    private List<Map<String, Object>> collectFileChangesAfterMessage(String sessionId, String messageId) throws IOException {
        Path jsonlPath = findJsonlPathForSession(sessionId);
        if (jsonlPath == null || !Files.exists(jsonlPath)) return List.of();

        DiffComputer diffComputer = DiffComputer.DEFAULT;
        // 不跳过重复文件，收集每个文件的完整操作链
        Map<String, List<FileChangeTracker.FileChange>> allFileChanges = new LinkedHashMap<>();
        boolean foundTarget = false;

        for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                JsonNode lineNode = objectMapper.readTree(line);
                String uuid = lineNode.has("uuid") ? lineNode.get("uuid").asText("") : "";

                if (!foundTarget) {
                    if (uuid.equals(messageId)) {
                        foundTarget = true;
                    }
                    continue;
                }

                if (!"assistant".equals(lineNode.has("type") ? lineNode.get("type").asText("") : "")) continue;

                JsonNode msgNode = lineNode.get("message");
                if (msgNode == null) continue;
                JsonNode toolCalls = msgNode.get("tool_calls");
                if (toolCalls == null || !toolCalls.isArray()) continue;

                for (JsonNode tc : toolCalls) {
                    String toolName = tc.path("function").path("name").asText("");
                    ToolExecutor executor = ServiceLocator.get(ToolRegistry.class).getExecutor(toolName);
                    if (executor == null) continue;

                    String toolCallId = tc.has("id") ? tc.get("id").asText("") : "";
                    if (toolCallId.isEmpty()) continue;

                    JsonNode args;
                    try {
                        String argsStr = tc.path("function").path("arguments").asText("");
                        args = objectMapper.readTree(argsStr);
                    } catch (Exception e) {
                        continue;
                    }

                    for (String filePath : executor.getFilePaths(args)) {
                        FileChangeTracker.FileChange change = FileChangeTracker.getChangeByToolCallId(toolCallId);
                        if (change != null) {
                            allFileChanges.computeIfAbsent(filePath, k -> new ArrayList<>()).add(change);
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        // 根据完整操作链推导每个文件的净效果
        List<Map<String, Object>> previewFiles = new ArrayList<>();
        for (Map.Entry<String, List<FileChangeTracker.FileChange>> entry : allFileChanges.entrySet()) {
            String filePath = entry.getKey();
            List<FileChangeTracker.FileChange> changes = entry.getValue();

            FileChangeTracker.FileChange first = changes.get(0);
            FileChangeTracker.FileChange last = changes.get(changes.size() - 1);

            // 第一次操作前文件是否存在
            boolean existedBefore = !first.newFile;
            // 最后一次操作后文件是否存在（当前工作区状态）
            boolean existsNow = !"delete_file".equals(last.toolName);

            // 无净变化 → 跳过（如新建后又删除了）
            if (!existedBefore && !existsNow) continue;

            String action;
            int insertions = 0;
            int deletions = 0;

            if (!existedBefore && existsNow) {
                // 之前不存在 → 现在存在 → 回滚后消失
                action = "delete";
            } else if (existedBefore && !existsNow) {
                // 之前存在 → 现在不存在 → 回滚后还原
                action = "add";
                int[] stats = diffComputer.countDiffStats(
                    first.originalContent != null ? first.originalContent : "",
                    "");
                insertions = stats[0];
                deletions = stats[1];
            } else {
                // 之前存在 → 现在存在 → 内容被修改，回滚后恢复
                action = "restore";
                int[] stats = diffComputer.countDiffStats(
                    first.originalContent != null ? first.originalContent : "",
                    last.newContent != null ? last.newContent : "");
                insertions = stats[0];
                deletions = stats[1];
            }

            Map<String, Object> item = new HashMap<>();
            item.put("filePath", filePath);
            item.put("action", action);
            item.put("insertions", insertions);
            item.put("deletions", deletions);
            previewFiles.add(item);
        }

        return previewFiles;
    }

    private Path findJsonlPathForSession(String sessionId) {
        Conversation conversation = com.example.agent.web.session.WebSessionManager.getInstance().getSessions().get(sessionId);
        if (conversation != null) {
            return ServiceLocator.get(ConversationService.class).flushTranscript(sessionId);
        }
        return jsonlReader.findJsonlFile(sessionId);
    }

    /**
     * 从 JSONL 中提取会话标题：优先 custom-title，回退到首条用户消息。
     */
    private String extractSessionTitle(Path jsonlPath) throws IOException {
        // 先找 custom-title（用户手动重命名）
        for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                JsonNode node = objectMapper.readTree(line);
                if ("custom-title".equals(node.path("type").asText())) {
                    String title = node.path("title").asText(null);
                    if (title != null && !title.isBlank()) return title;
                }
            } catch (Exception ignored) {}
        }
        // 回退到首条用户消息
        for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                JsonNode node = objectMapper.readTree(line);
                if ("user".equals(node.path("type").asText()) ||
                    "user".equals(node.path("message").path("role").asText())) {
                    String content = node.path("message").path("content").asText("");
                    if (!content.isBlank()) return content;
                }
            } catch (Exception ignored) {}
        }
        return "会话";
    }

    /**
     * 找出该 cleanTitle 在所有同源分叉中已用的最大编号，新分叉用 max + 1。
     * 使用 rootSessionId 作为前缀（剥离了 _fork_ 链），确保扫描所有同源分叉链。
     *
     * @param rootSessionId 根会话 ID（不含 _fork_ 后缀）
     * @param baseNum 源会话自身的编号（无后缀时为 1，有 (N) 时取 N）
     */
    private int findNextForkNumber(String rootSessionId, Path sourceJsonlPath, String cleanTitle, int baseNum) throws IOException {
        int maxUsed = baseNum;
        Path dateDir = sourceJsonlPath.getParent().getParent();
        if (dateDir == null || !Files.isDirectory(dateDir)) return maxUsed + 1;
        String prefix = rootSessionId + "_fork_";
        try (var stream = Files.list(dateDir)) {
            List<Path> forkDirs = stream
                .filter(Files::isDirectory)
                .map(p -> p.getFileName().toString())
                .filter(name -> name.startsWith(prefix))
                .map(name -> dateDir.resolve(name))
                .collect(java.util.stream.Collectors.toList());
            for (Path forkDir : forkDirs) {
                Path forkJsonl = forkDir.resolve("conversation.jsonl");
                if (Files.exists(forkJsonl)) {
                    String title = extractSessionTitle(forkJsonl);
                    int num = extractTrailingNumber(title);
                    if (num > 0) {
                        String base = title.replaceAll(" \\(\\d+\\)$", "");
                        if (cleanTitle.equals(base) && num > maxUsed) {
                            maxUsed = num;
                        }
                    }
                }
            }
        }
        logger.debug("findNextForkNumber: rootSessionId={}, cleanTitle={}, baseNum={}, maxUsed={}", rootSessionId, cleanTitle, baseNum, maxUsed);
        return maxUsed + 1;
    }

    /**
     * 提取标题末尾的括号数字，如"帮我写个函数 (2)" → 2。
     * 无匹配时返回 0。
     */
    private int extractTrailingNumber(String title) {
        if (title == null) return 0;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(" \\((\\d+)\\)$").matcher(title);
        if (m.find()) {
            try {
                return Integer.parseInt(m.group(1));
            } catch (NumberFormatException ignored) {}
        }
        return 0;
    }

    private static void sendJson(HttpExchange exchange, Object data) throws IOException {
        String response = objectMapper.writeValueAsString(data);
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void sendError(HttpExchange exchange, int code, String message) throws IOException {
        String response = "{\"error\":\"" + message.replace("\"", "\\\"") + "\"}";
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(code, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
