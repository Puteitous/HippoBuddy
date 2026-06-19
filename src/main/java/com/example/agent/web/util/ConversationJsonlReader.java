package com.example.agent.web.util;

import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

public class ConversationJsonlReader {

    private static final Logger logger = LoggerFactory.getLogger(ConversationJsonlReader.class);

    private final ObjectMapper objectMapper;
    private final Map<String, Path> sessionIdToFileCache = new HashMap<>();

    public ConversationJsonlReader(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void refreshFileCache() {
        sessionIdToFileCache.clear();
        Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");
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

    public Path findJsonlFile(String sessionId) {
        if (sessionIdToFileCache.containsKey(sessionId)) {
            return sessionIdToFileCache.get(sessionId);
        }
        refreshFileCache();
        return sessionIdToFileCache.get(sessionId);
    }

    public Map<String, Path> getFileCache() {
        return sessionIdToFileCache;
    }

    public void removeFromCache(String sessionId) {
        sessionIdToFileCache.remove(sessionId);
    }

    public List<Map<String, Object>> readMessages(Path jsonl) {
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
                    boolean hasReasoning = msgNode.has("reasoning_content") && !msgNode.path("reasoning_content").asText().isBlank();
                    if (content.isBlank() && !"tool-result".equals(type) && !hasToolCalls && !hasReasoning) return;

                    Map<String, Object> msgMap = new HashMap<>();
                    msgMap.put("id", msgNode.path("id").asText(""));
                    msgMap.put("role", role.isEmpty() ? type : role);
                    msgMap.put("content", content);

                    if (msgNode.has("reasoning_content")) {
                        msgMap.put("reasoning_content", msgNode.path("reasoning_content").asText());
                    }

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
                        if (node.has("toolSuccess")) {
                            success = node.path("toolSuccess").asBoolean(true);
                        } else if (msgNode.has("tool_success")) {
                            success = msgNode.path("tool_success").asBoolean(true);
                        } else if (msgNode.has("isError")) {
                            success = !msgNode.path("isError").asBoolean();
                        } else if (content != null && !content.isBlank()) {
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
                } catch (Exception e) {
                }
            });
        } catch (IOException e) {
            logger.warn("读取 JSONL 失败: {}", jsonl, e);
        }
        return messages;
    }

    public String extractFirstUserMessage(Path jsonl) {
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
}
