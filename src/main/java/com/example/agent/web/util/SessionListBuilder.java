package com.example.agent.web.util;

import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.Message;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class SessionListBuilder {

    private final ConversationJsonlReader jsonlReader;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    public SessionListBuilder(ConversationJsonlReader jsonlReader) {
        this.jsonlReader = jsonlReader;
    }

    public List<Map<String, Object>> buildSessionList(Map<String, Conversation> activeSessions) {
        Set<String> seenIds = new HashSet<>();
        List<Map<String, Object>> sessionList = new ArrayList<>();

        for (Map.Entry<String, Conversation> entry : activeSessions.entrySet()) {
            Map<String, Object> sessionInfo = new HashMap<>();
            sessionInfo.put("id", entry.getKey());
            sessionInfo.put("messageCount", entry.getValue().getMessageCount());
            sessionInfo.put("createdAt", extractTimestamp(entry.getKey()));
            sessionInfo.put("active", true);

            String title = resolveTitle(entry.getKey(), entry.getValue());
            if (title != null) {
                sessionInfo.put("title", title);
            }

            // 优先从 session.json 读取 projectPath，回退到当前工作区
            String projectPath = resolveProjectPath(entry.getKey(), null);
            if (projectPath != null) {
                sessionInfo.put("projectPath", projectPath);
            } else {
                String currentFolder = WorkspaceContext.getCurrentFolder();
                if (currentFolder != null && !currentFolder.isBlank()) {
                    sessionInfo.put("projectPath", currentFolder);
                }
            }

            sessionList.add(sessionInfo);
            seenIds.add(entry.getKey());
        }

        jsonlReader.refreshFileCache();
        for (Map.Entry<String, Path> entry : jsonlReader.getFileCache().entrySet()) {
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

            String title = jsonlReader.extractFirstUserMessage(jsonl);
            if (title != null) {
                sessionInfo.put("title", title);
            }

            // 从 session.json 读取 projectPath
            String projectPath = resolveProjectPath(sessionId, jsonl);
            if (projectPath != null) {
                sessionInfo.put("projectPath", projectPath);
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

        return sessionList;
    }

    /**
     * 解析会话所属的工作区路径。
     *
     * @param sessionId 会话 ID
     * @param jsonlPath 会话的 JSONL 文件路径，为 null 时自动计算
     * @return 工作区路径，没有则返回 null
     */
    private String resolveProjectPath(String sessionId, Path jsonlPath) {
        Path sessionDir;
        if (jsonlPath != null) {
            sessionDir = jsonlPath.getParent();
        } else {
            sessionDir = com.example.agent.logging.WorkspaceManager.getSessionDir(sessionId);
        }
        Path metadataFile = sessionDir.resolve("session.json");
        if (Files.exists(metadataFile)) {
            try {
                byte[] bytes = Files.readAllBytes(metadataFile);
                if (bytes.length > 0) {
                    com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(bytes);
                    com.fasterxml.jackson.databind.JsonNode wp = node.get("workspacePath");
                    if (wp != null && !wp.asText().isBlank()) {
                        return wp.asText();
                    }
                }
            } catch (IOException e) {
                // ignore
            }
        }
        return null;
    }

    private String resolveTitle(String sessionId, Conversation conversation) {
        Path jsonl = jsonlReader.getFileCache().get(sessionId);
        String title = null;
        if (jsonl != null && Files.exists(jsonl)) {
            title = jsonlReader.extractFirstUserMessage(jsonl);
        }

        if (title == null || title.isBlank()) {
            title = conversation.getMessages().stream()
                .filter(m -> "user".equals(m.getRole()))
                .map(Message::getContent)
                .filter(c -> c != null && !c.isBlank())
                .findFirst()
                .orElse(null);
        }

        if (title != null && !title.isBlank()) {
            return title.length() > 30 ? title.substring(0, 30) + "..." : title;
        }

        return null;
    }

    public static String extractTimestamp(String sessionId) {
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

    public static long parseTimestamp(String timestamp) {
        try {
            return Long.parseLong(timestamp);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
