package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.config.Config;
import com.example.agent.context.ManualCompactor;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimatorFactory;
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

    private static final Map<String, Path> sessionIdToFileCache = new HashMap<>();

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
            com.example.agent.web.handler.ChatApiHandler.initializeMemoryCache();
            
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
        Map<String, Conversation> activeSessions = ChatApiHandler.getSessions();
        Set<String> seenIds = new HashSet<>();
        List<Map<String, Object>> sessionList = new ArrayList<>();

        for (Map.Entry<String, Conversation> entry : activeSessions.entrySet()) {
            Map<String, Object> sessionInfo = new HashMap<>();
            sessionInfo.put("id", entry.getKey());
            sessionInfo.put("messageCount", entry.getValue().getMessageCount());
            sessionInfo.put("createdAt", extractTimestamp(entry.getKey()));
            sessionInfo.put("active", true);

            String firstUserMsg = entry.getValue().getMessages().stream()
                .filter(m -> "user".equals(m.getRole()))
                .map(Message::getContent)
                .filter(c -> c != null && !c.isBlank())
                .findFirst()
                .orElse(null);
            if (firstUserMsg != null) {
                sessionInfo.put("title", firstUserMsg.length() > 30 ? firstUserMsg.substring(0, 30) + "..." : firstUserMsg);
            }

            sessionList.add(sessionInfo);
            seenIds.add(entry.getKey());
        }

        refreshFileCache();
        for (Map.Entry<String, Path> entry : sessionIdToFileCache.entrySet()) {
            String sessionId = entry.getKey();
            if (seenIds.contains(sessionId)) continue;

            Map<String, Object> sessionInfo = new HashMap<>();
            sessionInfo.put("id", sessionId);
            sessionInfo.put("createdAt", extractTimestamp(sessionId));
            sessionInfo.put("active", false);

            Path jsonl = entry.getValue();
            try {
                int msgCount = (int) Files.lines(jsonl).count();
                sessionInfo.put("messageCount", msgCount);
            } catch (IOException e) {
                sessionInfo.put("messageCount", 0);
            }

            String title = extractFirstUserMessage(jsonl);
            if (title != null && !title.isBlank()) {
                sessionInfo.put("title", title.length() > 30 ? title.substring(0, 30) + "..." : title);
            }

            sessionList.add(sessionInfo);
        }

        sessionList.sort((a, b) -> {
            long ta = parseTimestamp((String) a.getOrDefault("createdAt", "0"));
            long tb = parseTimestamp((String) b.getOrDefault("createdAt", "0"));
            
            int cmp = Long.compare(tb, ta);
            if (cmp != 0) {
                return cmp;
            }
            
            String idA = (String) a.get("id");
            String idB = (String) b.get("id");
            if (idA != null && idB != null) {
                return idB.compareTo(idA);
            }
            
            return 0;
        });

        String response = objectMapper.writeValueAsString(sessionList);
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private void refreshFileCache() {
        sessionIdToFileCache.clear();
        Path sessionsDir = WorkspaceManager.getCurrentProjectDir().resolve("sessions");
        if (!Files.exists(sessionsDir)) return;

        try (Stream<Path> dateDirs = Files.list(sessionsDir)) {
            dateDirs.filter(Files::isDirectory).forEach(dateDir -> {
                try (Stream<Path> sessionDirs = Files.list(dateDir)) {
                    sessionDirs.filter(Files::isDirectory).forEach(sessionDir -> {
                        Path jsonl = sessionDir.resolve("conversation.jsonl");
                        if (Files.exists(jsonl)) {
                            sessionIdToFileCache.put(sessionDir.getFileName().toString(), jsonl);
                        }
                    });
                } catch (IOException e) {
                    logger.debug("扫描日期目录失败: {}", dateDir, e);
                }
            });
        } catch (IOException e) {
            logger.error("扫描会话目录失败", e);
        }
    }

    private void handleGetMessages(HttpExchange exchange, String sessionId) throws IOException {
        Map<String, Conversation> activeSessions = ChatApiHandler.getSessions();
        Conversation conversation = activeSessions.get(sessionId);

        if (conversation != null) {
            List<Map<String, Object>> messages = extractMessages(conversation.getMessages());
            sendJson(exchange, messages);
            return;
        }

        Path jsonl = findJsonlFile(sessionId);
        if (jsonl != null) {
            List<Map<String, Object>> messages = readMessagesFromJsonl(jsonl);
            sendJson(exchange, messages);
            return;
        }

        sendError(exchange, 404, "Session not found");
    }

    private Path findJsonlFile(String sessionId) {
        if (sessionIdToFileCache.containsKey(sessionId)) {
            return sessionIdToFileCache.get(sessionId);
        }
        refreshFileCache();
        return sessionIdToFileCache.get(sessionId);
    }

    private List<Map<String, Object>> readMessagesFromJsonl(Path jsonl) {
        List<Map<String, Object>> messages = new ArrayList<>();
        try (Stream<String> lines = Files.lines(jsonl)) {
            lines.forEach(line -> {
                try {
                    JsonNode node = objectMapper.readTree(line);
                    String type = node.path("type").asText("");
                    JsonNode msgNode = node.path("message");
                    String role = msgNode.path("role").asText("");
                    String content = msgNode.path("content").asText("");

                    if ("system".equals(role) || "system".equals(type)) return;
                    if (!"user".equals(role) && !"assistant".equals(role) && !"tool".equals(role) && !"tool-result".equals(type)) return;
                    
                    boolean hasToolCalls = "assistant".equals(role) && msgNode.has("tool_calls");
                    if (content.isBlank() && !"tool-result".equals(type) && !hasToolCalls) return;

                    Map<String, Object> msgMap = new HashMap<>();
                    msgMap.put("id", msgNode.path("id").asText(""));
                    msgMap.put("role", role.isEmpty() ? type : role);
                    msgMap.put("content", content);

                    if ("assistant".equals(role) && msgNode.has("tool_calls")) {
                        JsonNode toolCalls = msgNode.path("tool_calls");
                        List<Map<String, Object>> calls = new ArrayList<>();
                        for (JsonNode tc : toolCalls) {
                            Map<String, Object> call = new HashMap<>();
                            call.put("id", tc.path("id").asText(""));
                            call.put("name", tc.path("function").path("name").asText(""));
                            call.put("arguments", tc.path("function").path("arguments").asText(""));
                            calls.add(call);
                        }
                        msgMap.put("tool_calls", calls);
                    }

                    if ("tool".equals(role) || "tool-result".equals(type)) {
                        msgMap.put("toolName", msgNode.path("name").asText(""));
                        msgMap.put("toolCallId", msgNode.path("tool_call_id").asText(""));
                        
                        boolean success = true;
                        
                        // 先检查内容是否包含错误关键词
                        boolean hasErrorKeywords = false;
                        if (content != null && !content.isBlank()) {
                            String lowerContent = content.toLowerCase();
                            hasErrorKeywords = lowerContent.contains("错误:") || 
                                lowerContent.contains("error:") || 
                                lowerContent.contains("失败") ||
                                lowerContent.contains("cancelled") || 
                                lowerContent.contains("user_cancelled") ||
                                lowerContent.contains("权限受限") ||
                                lowerContent.contains("权限拒绝");
                        }
                        
                        // 优先使用保存的真实状态（仅当没有错误关键词时）
                        // 注意：旧数据中 toolSuccess 总是 true，所以如果有错误关键词，以关键词为准
                        if (!hasErrorKeywords) {
                            if (node.has("toolSuccess")) {
                                success = node.path("toolSuccess").asBoolean(true);
                            }
                            else if (msgNode.has("isError")) {
                                success = !msgNode.path("isError").asBoolean();
                            }
                        } else {
                            success = false;
                        }
                        
                        msgMap.put("success", success);
                    }

                    messages.add(msgMap);
                } catch (Exception e) {
                    // skip malformed lines
                }
            });
        } catch (IOException e) {
            logger.warn("读取 JSONL 失败: {}", jsonl, e);
        }
        return messages;
    }

    private List<Map<String, Object>> extractMessages(List<Message> msgList) {
        List<Map<String, Object>> messages = new ArrayList<>();
        for (Message msg : msgList) {
            String role = msg.getRole();
            if ("system".equals(role)) continue;
            
            boolean hasToolCalls = "assistant".equals(role) && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty();
            if ((msg.getContent() == null || msg.getContent().isBlank()) && !hasToolCalls) continue;

            Map<String, Object> msgMap = new HashMap<>();
            msgMap.put("id", msg.getId());
            msgMap.put("role", role);
            msgMap.put("content", msg.getContent());
            
            if (hasToolCalls) {
                List<Map<String, Object>> calls = new ArrayList<>();
                for (ToolCall tc : msg.getToolCalls()) {
                    Map<String, Object> call = new HashMap<>();
                    call.put("id", tc.getId());
                    call.put("name", tc.getFunction().getName());
                    call.put("arguments", tc.getFunction().getArguments());
                    calls.add(call);
                }
                msgMap.put("tool_calls", calls);
            }
            
            // 处理 tool-result 消息，提取 success 状态
            if ("tool".equals(role)) {
                msgMap.put("toolName", msg.getName() != null ? msg.getName() : "");
                msgMap.put("toolCallId", msg.getToolCallId() != null ? msg.getToolCallId() : "");
                
                // 从内容中推断 success 状态（因为 Message 对象没有 success 字段）
                boolean success = true;
                String content = msg.getContent();
                if (content != null && !content.isBlank()) {
                    String lowerContent = content.toLowerCase();
                    if (lowerContent.contains("错误:") || 
                        lowerContent.contains("error:") || 
                        lowerContent.contains("失败") ||
                        lowerContent.contains("cancelled") || 
                        lowerContent.contains("user_cancelled") ||
                        lowerContent.contains("权限受限") ||
                        lowerContent.contains("权限拒绝")) {
                        success = false;
                    }
                }
                msgMap.put("success", success);
            }
            
            messages.add(msgMap);
        }
        return messages;
    }

    private String extractFirstUserMessage(Path jsonl) {
        try (Stream<String> lines = Files.lines(jsonl)) {
            java.util.Optional<String> customTitle = lines
                .map(line -> {
                    try {
                        JsonNode node = objectMapper.readTree(line);
                        if ("custom-title".equals(node.path("type").asText())) {
                            return node.path("title").asText(null);
                        }
                        return null;
                    } catch (Exception e) {
                        return null;
                    }
                })
                .filter(t -> t != null && !t.isBlank())
                .findFirst();
            
            if (customTitle.isPresent()) {
                return customTitle.get();
            }
            
            return Files.lines(jsonl)
                .limit(50)
                .map(line -> {
                    try {
                        JsonNode node = objectMapper.readTree(line);
                        if ("user".equals(node.path("type").asText()) ||
                            "user".equals(node.path("message").path("role").asText())) {
                            return node.path("message").path("content").asText("");
                        }
                        return null;
                    } catch (Exception e) {
                        return null;
                    }
                })
                .filter(c -> c != null && !c.isBlank())
                .findFirst()
                .orElse(null);
        } catch (IOException e) {
            return null;
        }
    }

    private void handleDeleteSession(HttpExchange exchange, String sessionId) throws IOException {
        Map<String, Conversation> sessions = ChatApiHandler.getSessions();
        Conversation conversation = sessions.remove(sessionId);
        sessionIdToFileCache.remove(sessionId);

        // 调用 ConversationService.destroy 清理组件（参照 CLI 实现）
        if (conversation != null) {
            ConversationService conversationService = com.example.agent.core.di.ServiceLocator.getOrNull(ConversationService.class);
            if (conversationService != null) {
                conversationService.destroy(conversation);
                logger.info("已清理会话组件：sessionId={}", sessionId);
            }
        }

        boolean deleted = false;

        Path jsonl = findJsonlFile(sessionId);
        if (jsonl != null && Files.exists(jsonl)) {
            try {
                Files.delete(jsonl);
                logger.info("删除会话文件：sessionId={}, file={}", sessionId, jsonl);
                deleted = true;
                
                Path sessionDir = jsonl.getParent();
                if (Files.exists(sessionDir) && Files.list(sessionDir).findAny().isEmpty()) {
                    try {
                        Files.delete(sessionDir);
                        logger.debug("删除空会话目录：{}", sessionDir);
                    } catch (IOException e) {
                        logger.debug("删除空目录失败：{}", sessionDir, e);
                    }
                }
            } catch (IOException e) {
                logger.warn("删除会话文件失败：sessionId={}", sessionId, e);
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

        Path jsonl = findJsonlFile(sessionId);
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
        Conversation conversation = ChatApiHandler.getSessions().get(sessionId);
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
     * 获取会话 Token 统计信息（参照 CLI 的 tokens 命令）
     * GET /api/sessions/{id}/tokens
     */
    private void handleGetTokens(HttpExchange exchange, String sessionId) throws IOException {
        Conversation conversation = ChatApiHandler.getSessions().get(sessionId);
        
        // 如果会话不存在（新会话还未发送消息），返回默认值
        if (conversation == null) {
            int maxTokens = Config.getInstance().getContext().getMaxTokens();
            Map<String, Object> response = new HashMap<>();
            response.put("currentTokens", 0);
            response.put("maxTokens", maxTokens);
            response.put("usagePercent", 0.0);
            response.put("messageCount", 0);
            response.put("hasKnownUsage", false);
            response.put("sessionTotalInput", 0);
            response.put("sessionTotalOutput", 0);
            response.put("sessionTotalTokens", 0);
            response.put("sessionLlmCalls", 0);
            response.put("sessionToolCalls", 0);
            
            String json = objectMapper.writeValueAsString(response);
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
            return;
        }

        int maxTokens = Config.getInstance().getContext().getMaxTokens();
        int currentTokens;
        boolean hasKnownUsage = conversation.hasKnownUsage();
        
        if (hasKnownUsage) {
            // 使用真实的 LLM 返回数据
            currentTokens = conversation.getLastKnownTotalTokens();
        } else {
            // 估算值：消息 tokens + 2400（首轮回退模式）
            List<Message> fullContext = conversation.getMessages();
            int messageTokens = TokenEstimatorFactory.getDefault().estimateConversationTokens(fullContext);
            currentTokens = messageTokens + 2400;
        }
        
        double usageRatio = currentTokens * 100.0 / maxTokens;

        Map<String, Object> response = new HashMap<>();
        response.put("currentTokens", currentTokens);
        response.put("maxTokens", maxTokens);
        response.put("usagePercent", Math.round(usageRatio * 10.0) / 10.0);
        response.put("messageCount", conversation.getMessages().size());
        response.put("hasKnownUsage", hasKnownUsage);

        if (hasKnownUsage) {
            var usage = conversation.getLastKnownUsage();
            response.put("promptTokens", usage.getPromptTokens());
            response.put("completionTokens", usage.getCompletionTokens());
            response.put("totalTokens", conversation.getLastKnownTotalTokens());
        }

        // 添加总 Token 消耗统计（从内存缓存中读取）
        try {
            ChatApiHandler.SessionTokenStats stats = ChatApiHandler.getSessionTokenStats(sessionId);
            if (stats != null) {
                response.put("sessionTotalInput", stats.totalInputTokens);
                response.put("sessionTotalOutput", stats.totalOutputTokens);
                response.put("sessionTotalTokens", stats.totalTokens);
                response.put("sessionLlmCalls", stats.llmCalls);
                response.put("sessionToolCalls", stats.toolCalls);
            } else {
                // 如果内存中没有，尝试从日志文件读取（兼容旧数据）
                var sessionStats = com.example.agent.web.logging.SessionLogger.getTokenStats(sessionId);
                if (sessionStats != null) {
                    response.put("sessionTotalInput", sessionStats.totalInputTokens);
                    response.put("sessionTotalOutput", sessionStats.totalOutputTokens);
                    response.put("sessionTotalTokens", sessionStats.totalTokens);
                    response.put("sessionLlmCalls", sessionStats.llmCalls);
                    response.put("sessionToolCalls", sessionStats.toolCalls);
                }
            }
        } catch (Exception e) {
            logger.debug("读取会话总 Token 统计失败：sessionId={}", sessionId);
        }

        sendJson(exchange, response);
    }

    private String extractTimestamp(String sessionId) {
        if (sessionId == null) {
            return "0";
        }
        
        if (sessionId.startsWith("web-")) {
            return sessionId.substring(4);
        }
        
        if (sessionId.startsWith("test-session-")) {
            return sessionId.substring("test-session-".length());
        }
        
        int lastDash = sessionId.lastIndexOf('-');
        if (lastDash > 0 && lastDash < sessionId.length() - 1) {
            String lastPart = sessionId.substring(lastDash + 1);
            if (lastPart.matches("\\d+")) {
                return lastPart;
            }
        }
        
        if (sessionId.matches("\\d+")) {
            return sessionId;
        }
        
        return "0";
    }

    private long parseTimestamp(String timestamp) {
        try {
            return Long.parseLong(timestamp);
        } catch (NumberFormatException e) {
            return 0;
        }
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
