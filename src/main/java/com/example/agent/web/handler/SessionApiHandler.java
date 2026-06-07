package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.config.Config;
import com.example.agent.context.ManualCompactor;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.snapshot.FileSnapshotManager;
import com.example.agent.snapshot.Snapshot;
import com.example.agent.web.util.ConversationJsonlReader;
import com.example.agent.web.util.MessageConverter;
import com.example.agent.web.util.SessionListBuilder;
import com.example.agent.web.util.TokenStatsResponseBuilder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

public class SessionApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(SessionApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final ConversationJsonlReader jsonlReader = new ConversationJsonlReader(objectMapper);
    private static final SessionListBuilder sessionListBuilder = new SessionListBuilder(jsonlReader);
    private static final MessageConverter messageConverter = new MessageConverter();
    private static final TokenStatsResponseBuilder tokenStatsResponseBuilder = new TokenStatsResponseBuilder();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, DELETE, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();

        try {
            // 初始化内存缓存（从日志文件恢复 Token 统计）
            com.example.agent.web.server.WebInitializer.initializeTokenCache(
                com.example.agent.web.session.WebSessionManager.getInstance());
            
            if ("GET".equals(method) && path.equals("/api/sessions")) {
                handleListSessions(exchange);
            } else if ("GET".equals(method) && path.matches("/api/sessions/[^/]+/messages$")) {
                String sessionId = path.substring("/api/sessions/".length(), path.lastIndexOf("/messages"));
                handleGetMessages(exchange, sessionId);
            } else if ("GET".equals(method) && path.matches("/api/sessions/[^/]+/tokens$")) {
                String sessionId = path.substring("/api/sessions/".length(), path.lastIndexOf("/tokens"));
                handleGetTokens(exchange, sessionId);
            } else if ("POST".equals(method) && path.matches("/api/sessions/[^/]+/compact$")) {
                String sessionId = path.substring("/api/sessions/".length(), path.lastIndexOf("/compact"));
                handleCompactSession(exchange, sessionId);
            } else if ("POST".equals(method) && path.matches("/api/sessions/[^/]+/rewind-check$")) {
                String sessionId = path.substring("/api/sessions/".length(), path.lastIndexOf("/rewind-check"));
                handleRewindCheck(exchange, sessionId);
            } else if ("POST".equals(method) && path.matches("/api/sessions/[^/]+/rewind$")) {
                String sessionId = path.substring("/api/sessions/".length(), path.lastIndexOf("/rewind"));
                handleRewindSession(exchange, sessionId);
            } else if ("GET".equals(method) && path.matches("/api/sessions/[^/]+/snapshots$")) {
                String sessionId = path.substring("/api/sessions/".length(), path.lastIndexOf("/snapshots"));
                handleListSnapshots(exchange, sessionId);
            } else if ("DELETE".equals(method) && path.matches("/api/sessions/[^/]+$")) {
                String sessionId = path.substring("/api/sessions/".length());
                handleDeleteSession(exchange, sessionId);
            } else if ("POST".equals(method) && path.matches("/api/sessions/[^/]+/rename$")) {
                String sessionId = path.substring("/api/sessions/".length(), path.lastIndexOf("/rename"));
                handleRenameSession(exchange, sessionId);
            } else {
                sendError(exchange, 404, "Not found");
            }
        } catch (Exception e) {
            logger.error("Session API 错误: {}", e.getMessage());
            sendError(exchange, 500, e.getMessage());
        }
    }

    private void handleListSessions(HttpExchange exchange) throws IOException {
        Map<String, Conversation> activeSessions = com.example.agent.web.session.WebSessionManager.getInstance().getSessions();
        List<Map<String, Object>> sessionList = sessionListBuilder.buildSessionList(activeSessions);

        String response = objectMapper.writeValueAsString(sessionList);
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private void handleGetMessages(HttpExchange exchange, String sessionId) throws IOException {
        Map<String, Conversation> activeSessions = com.example.agent.web.session.WebSessionManager.getInstance().getSessions();
        Conversation conversation = activeSessions.get(sessionId);

        if (conversation != null) {
            List<Map<String, Object>> messages = extractMessages(conversation.getMessages());
            sendJson(exchange, messages);
            return;
        }

        Path jsonl = jsonlReader.findJsonlFile(sessionId);
        if (jsonl != null) {
            List<Map<String, Object>> messages = jsonlReader.readMessages(jsonl);
            sendJson(exchange, messages);
            return;
        }

        sendError(exchange, 404, "Session not found");
    }

    private List<Map<String, Object>> extractMessages(List<Message> msgList) {
        return messageConverter.convertMessages(msgList);
    }

    private void handleDeleteSession(HttpExchange exchange, String sessionId) throws IOException {
        Map<String, Conversation> sessions = com.example.agent.web.session.WebSessionManager.getInstance().getSessions();
        Conversation conversation = sessions.remove(sessionId);
        jsonlReader.removeFromCache(sessionId);

        // 调用 ConversationService.destroy 清理组件（参照 CLI 实现）
        if (conversation != null) {
            ConversationService conversationService = com.example.agent.core.di.ServiceLocator.getOrNull(ConversationService.class);
            if (conversationService != null) {
                conversationService.destroy(conversation);
                logger.info("已清理会话组件：sessionId={}", sessionId);
            }
        }

        boolean deleted = false;

        Path jsonl = jsonlReader.findJsonlFile(sessionId);
        if (jsonl != null && Files.exists(jsonl)) {
            try {
                Path sessionDir = jsonl.getParent();
                if (Files.exists(sessionDir)) {
                    try (Stream<Path> walk = Files.walk(sessionDir)) {
                        walk.sorted((a, b) -> b.compareTo(a))
                            .forEach(path -> {
                                try {
                                    Files.delete(path);
                                } catch (IOException e) {
                                    logger.warn("删除会话文件失败: {}", path);
                                }
                            });
                    }
                    deleted = true;
                    logger.info("已删除会话目录: sessionId={}, dir={}", sessionId, sessionDir);
                }
            } catch (IOException e) {
                logger.warn("删除会话目录失败：sessionId={}", sessionId, e);
            }
        }

        if (conversation != null) {
            deleted = true;
            logger.info("从内存中删除会话：sessionId={}", sessionId);
        }

        if (deleted) {
            String response = "{\"success\":true,\"message\":\"Session deleted\"}";
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
        } else {
            sendError(exchange, 404, "Session not found");
        }
        exchange.close();
    }

    private void handleRenameSession(HttpExchange exchange, String sessionId) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = objectMapper.readTree(requestBody);
        String newName = json.has("name") ? json.get("name").asText() : "";

        if (newName.isBlank()) {
            sendError(exchange, 400, "Name cannot be empty");
            exchange.close();
            return;
        }

        Path jsonl = jsonlReader.findJsonlFile(sessionId);
        if (jsonl != null && Files.exists(jsonl)) {
            try {
                List<String> lines = Files.readAllLines(jsonl);
                
                String timestamp = java.time.Instant.now().toString();
                String uuid = java.util.UUID.randomUUID().toString();
                
                com.fasterxml.jackson.databind.node.ObjectNode titleEntry = objectMapper.createObjectNode();
                titleEntry.put("type", "custom-title");
                titleEntry.put("uuid", uuid);
                titleEntry.put("sessionId", sessionId);
                titleEntry.put("timestamp", timestamp);
                titleEntry.put("version", "1.0.0");
                titleEntry.put("cwd", System.getProperty("user.dir"));
                titleEntry.put("title", newName);
                
                lines.add(0, objectMapper.writeValueAsString(titleEntry));
                
                Files.write(jsonl, lines, StandardCharsets.UTF_8);
                
                logger.info("重命名会话：sessionId={}, newName={}", sessionId, newName);
                
                String response = "{\"success\":true,\"message\":\"Session renamed\"}";
                byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
            } catch (IOException e) {
                logger.error("重命名会话失败：sessionId={}", sessionId, e);
                sendError(exchange, 500, "Failed to rename session: " + e.getMessage());
            }
        } else {
            sendError(exchange, 404, "Session not found");
        }
        exchange.close();
    }

    /**
     * 手动压缩会话上下文（参照 CLI 的 /compact 命令）
     * POST /api/sessions/{id}/compact
     * 请求体: {"instruction": "可选的自定义压缩指令"}
     */
    private void handleCompactSession(HttpExchange exchange, String sessionId) throws IOException {
        Conversation conversation = com.example.agent.web.session.WebSessionManager.getInstance().getSessions().get(sessionId);
        if (conversation == null) {
            sendError(exchange, 404, "Session not found");
            exchange.close();
            return;
        }

        String userInstruction = null;
        try {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (!requestBody.isBlank()) {
                JsonNode json = objectMapper.readTree(requestBody);
                if (json.has("instruction")) {
                    userInstruction = json.get("instruction").asText();
                }
            }
        } catch (Exception e) {
            logger.debug("解析压缩请求体失败", e);
        }

        try {
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            LlmClient llmClient = ServiceLocator.get(LlmClient.class);
            int maxTokens = Config.getInstance().getContext().getMaxTokens();

            ManualCompactor compactor = new ManualCompactor(
                TokenEstimatorFactory.getDefault(),
                llmClient
            );

            var originalMessages = conversation.getMessages();
            int originalCount = originalMessages.size();
            int originalTokens = TokenEstimatorFactory.getDefault().estimateConversationTokens(originalMessages);

            var result = compactor.compact(originalMessages, userInstruction, maxTokens);

            conversation.replaceMessages(result.getMessages());

            int compactedCount = result.getMessages().size();
            int savedTokens = result.getSavedTokens();
            double savedPercent = savedTokens * 100.0 / Math.max(1, originalTokens);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("method", result.getMethod().getDisplayName());
            response.put("originalCount", originalCount);
            response.put("compactedCount", compactedCount);
            response.put("reducedCount", originalCount - compactedCount);
            response.put("savedTokens", savedTokens);
            response.put("savedPercent", Math.round(savedPercent * 10.0) / 10.0);
            response.put("summary", result.getSummary());

            logger.info("手动压缩完成：sessionId={}, 原{}条/{}tokens → 压缩后{}条, 节省{}tokens({}%)",
                sessionId, originalCount, originalTokens, compactedCount, savedTokens, savedPercent);

            sendJson(exchange, response);
        } catch (Exception e) {
            logger.error("压缩会话失败：sessionId={}", sessionId, e);
            sendError(exchange, 500, "Failed to compact session: " + e.getMessage());
        }
        exchange.close();
    }

    /**
     * 快照回滚预览（基于快照方案）
     * POST /api/sessions/{id}/rewind-check
     * 请求体: {"messageId": "uuid"}
     */
    private void handleRewindCheck(HttpExchange exchange, String sessionId) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = objectMapper.readTree(requestBody);
        String messageId = json.has("messageId") ? json.get("messageId").asText() : "";

        logger.info("handleRewindCheck: sessionId={}, messageId={}", sessionId, messageId);

        if (messageId.isBlank()) {
            sendJson(exchange, Map.of("files", List.of()));
            return;
        }

        FileSnapshotManager.PreviewResult preview = FileSnapshotManager.getPreview(sessionId, messageId);
        if (preview == null) {
            logger.info("handleRewindCheck: getPreview 返回 null，尝试 fallback");
            // 与 handleRewindSession 保持一致的 fallback：没有精确快照时找上一个
            Conversation conversation = com.example.agent.web.session.WebSessionManager.getInstance().getSessions().get(sessionId);
            ConversationService conversationService = null;
            Path jsonlPath = null;

            if (conversation != null) {
                conversationService = ServiceLocator.get(ConversationService.class);
                jsonlPath = conversationService.flushTranscript(sessionId);
            } else {
                jsonlPath = jsonlReader.findJsonlFile(sessionId);
            }

            if (jsonlPath != null && Files.exists(jsonlPath)) {
                Snapshot fallback = findLastSnapshot(jsonlPath, sessionId, messageId);
                if (fallback != null) {
                    logger.info("handleRewindCheck: fallback 找到快照 messageId={}", fallback.getMessageId());
                    preview = FileSnapshotManager.getPreview(sessionId, fallback.getMessageId());
                } else {
                    logger.info("handleRewindCheck: fallback 未找到快照");
                }
            } else {
                logger.info("handleRewindCheck: JSONL 文件不存在, jsonlPath={}", jsonlPath);
            }
        }

        if (preview == null) {
            logger.info("handleRewindCheck: 最终预览为 null，返回空文件列表");
            sendJson(exchange, Map.of("files", List.of()));
            return;
        }

        logger.info("handleRewindCheck: 返回 {} 个文件", preview.getFiles().size());

        Map<String, Object> response = new HashMap<>();
        response.put("files", preview.getFiles().stream().map(f -> {
            Map<String, Object> item = new HashMap<>();
            item.put("filePath", f.getFilePath());
            item.put("action", f.getAction());
            item.put("insertions", f.getInsertions());
            item.put("deletions", f.getDeletions());
            return item;
        }).collect(java.util.stream.Collectors.toList()));
        sendJson(exchange, response);
    }

    /**
     * 快照回滚（基于快照方案）
     * POST /api/sessions/{id}/rewind
     * 请求体: {"messageId": "uuid"}
     *
     * 此操作会：
     * 1. 根据快照恢复文件
     * 2. 截断内存中的 Conversation 消息
     * 3. 事务性重写 JSONL 文件
     * 4. 截断 snapshots.jsonl
     */
    private void handleRewindSession(HttpExchange exchange, String sessionId) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = objectMapper.readTree(requestBody);
        String messageId = json.has("messageId") ? json.get("messageId").asText("") : "";

        logger.info("handleRewindSession: sessionId={}, messageId={}", sessionId, messageId);

        if (messageId.isBlank()) {
            sendError(exchange, 400, "messageId is required");
            return;
        }

        Conversation conversation = com.example.agent.web.session.WebSessionManager.getInstance().getSessions().get(sessionId);
        boolean isActiveSession = conversation != null;
        ConversationService conversationService = null;
        Path jsonlPath = null;

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
            List<String> lines = Files.readAllLines(jsonlPath, StandardCharsets.UTF_8);
            for (String line : lines) {
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

            int filesChanged = 0;
            Snapshot targetSnapshot = FileSnapshotManager.findSnapshot(sessionId, messageId);
            if (targetSnapshot == null) {
                logger.info("handleRewindSession: 未找到精确快照，尝试 fallback");
                targetSnapshot = findLastSnapshot(jsonlPath, sessionId, messageId);
                if (targetSnapshot != null) {
                    logger.info("handleRewindSession: fallback 找到快照 messageId={}, files={}",
                        targetSnapshot.getMessageId(), targetSnapshot.getTrackedFiles().size());
                }
            } else {
                logger.info("handleRewindSession: 找到精确快照 messageId={}, files={}",
                    targetSnapshot.getMessageId(), targetSnapshot.getTrackedFiles().size());
            }
            if (targetSnapshot != null) {
                FileSnapshotManager.RewindResult rewindResult = FileSnapshotManager.rewindToSnapshot(sessionId, targetSnapshot.getMessageId());
                if (!rewindResult.isSuccess()) {
                    sendError(exchange, 500, rewindResult.getError());
                    return;
                }
                filesChanged = rewindResult.getRestoredFiles().size();
            }

            truncateConversationJsonl(jsonlPath, sessionId, messageId);

            Set<String> retainedIds = extractAllMessageIds(jsonlPath);
            FileSnapshotManager.retainSnapshots(sessionId, retainedIds);

            if (isActiveSession) {
                int removed = conversationService.truncateMessagesAfter(conversation, messageId);
                logger.debug("内存截断完成: sessionId={}, 删除{}条消息", sessionId, removed);

                conversationService.destroyTranscript(sessionId);
                conversationService.ensureSessionComponents(conversation);
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "已回滚到指定轮次");
            response.put("filesChanged", filesChanged);
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
     * 事务性重写 JSONL 文件：删除从 messageId 开始及之后的所有行。
     * 使用临时文件 + ATOMIC_MOVE（Windows 回退到 REPLACE_EXISTING）。
     */
    private void truncateConversationJsonl(Path jsonlPath, String sessionId, String messageId) throws IOException {
        List<String> lines = Files.readAllLines(jsonlPath, StandardCharsets.UTF_8);
        List<String> keptLines = new ArrayList<>();
        boolean passedTarget = false;
        for (String line : lines) {
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
     * 获取快照列表
     * GET /api/sessions/{id}/snapshots
     */
    private void handleListSnapshots(HttpExchange exchange, String sessionId) throws IOException {
        List<Snapshot> snapshots = FileSnapshotManager.loadAllSnapshots(sessionId);
        List<Map<String, Object>> snapshotList = new ArrayList<>();
        for (Snapshot s : snapshots) {
            Map<String, Object> item = new HashMap<>();
            item.put("messageId", s.getMessageId());
            item.put("timestamp", s.getTimestamp());
            item.put("fileCount", s.getTrackedFiles().size());
            snapshotList.add(item);
        }
        Map<String, Object> response = new HashMap<>();
        response.put("snapshots", snapshotList);
        sendJson(exchange, response);
    }

    /**
     * 获取会话 Token 统计信息（参照 CLI 的 tokens 命令）
     * GET /api/sessions/{id}/tokens
     */
    private void handleGetTokens(HttpExchange exchange, String sessionId) throws IOException {
        Conversation conversation = com.example.agent.web.session.WebSessionManager.getInstance().getSessions().get(sessionId);

        int maxTokens = Config.getInstance().getContext().getMaxTokens();

        com.example.agent.web.session.SessionTokenStats stats = null;
        com.example.agent.web.logging.SessionLogger.SessionTokenStats legacyStats = null;
        if (conversation != null) {
            try {
                stats = com.example.agent.web.session.WebSessionManager.getInstance().getSessionTokenStats(sessionId);
                if (stats == null) {
                    legacyStats = com.example.agent.web.logging.SessionLogger.getTokenStats(sessionId);
                }
            } catch (Exception e) {
                logger.debug("读取会话 Token 统计失败：sessionId={}", sessionId);
            }
        }

        Map<String, Object> response = tokenStatsResponseBuilder.build(conversation, maxTokens, stats, legacyStats);

        sendJson(exchange, response);
    }

    private Snapshot findLastSnapshot(Path jsonlPath, String sessionId, String targetMessageId) throws IOException {
        Set<String> snapshotMsgIds = new HashSet<>();
        for (Snapshot s : FileSnapshotManager.loadAllSnapshots(sessionId)) {
            snapshotMsgIds.add(s.getMessageId());
        }
        String lastFoundId = null;
        boolean foundTarget = false;
        for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                JsonNode node = objectMapper.readTree(line);
                String type = node.has("type") ? node.get("type").asText() : "";
                String uuid = node.has("uuid") ? node.get("uuid").asText() : "";
                if (uuid.equals(targetMessageId)) {
                    foundTarget = true;
                    break;
                }
                if ("user".equals(type) && snapshotMsgIds.contains(uuid)) {
                    lastFoundId = uuid;
                }
            } catch (Exception ignored) {}
        }
        if (lastFoundId != null) {
            return FileSnapshotManager.findSnapshot(sessionId, lastFoundId);
        }
        // 目标消息之前没有快照（如第一轮对话），取第一个快照作为兜底
        // 回滚到第一轮会撤销所有后续轮次的文件操作
        String firstFoundId = null;
        for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                JsonNode node = objectMapper.readTree(line);
                String type = node.has("type") ? node.get("type").asText() : "";
                String uuid = node.has("uuid") ? node.get("uuid").asText() : "";
                if ("user".equals(type) && snapshotMsgIds.contains(uuid)) {
                    firstFoundId = uuid;
                    break;
                }
            } catch (Exception ignored) {}
        }
        return firstFoundId != null ? FileSnapshotManager.findSnapshot(sessionId, firstFoundId) : null;
    }

    private Set<String> extractAllMessageIds(Path jsonlPath) throws IOException {
        Set<String> ids = new HashSet<>();
        for (String line : Files.readAllLines(jsonlPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                JsonNode node = objectMapper.readTree(line);
                String uuid = node.has("uuid") ? node.get("uuid").asText() : "";
                if (!uuid.isEmpty()) ids.add(uuid);
            } catch (Exception ignored) {}
        }
        return ids;
    }

    private void sendJson(HttpExchange exchange, Object data) throws IOException {
        String response = objectMapper.writeValueAsString(data);
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private void sendError(HttpExchange exchange, int code, String message) throws IOException {
        String response = "{\"error\":\"" + message.replace("\"", "\\\"") + "\"}";
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(code, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
