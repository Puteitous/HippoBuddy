package com.example.agent.session;

import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Usage;
import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class TranscriptLoader {

    private static final Logger logger = LoggerFactory.getLogger(TranscriptLoader.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final long FAST_LOAD_THRESHOLD_BYTES = 30 * 1024 * 1024;

    static {
        objectMapper.findAndRegisterModules();
    }

    public static class LoadResult {
        private final List<Message> messages = new ArrayList<>();
        private final List<TranscriptEntry> allEntries = new ArrayList<>();
        private String customTitle;
        private final Set<String> tags = new HashSet<>();
        private String lastCompactBoundary;
        private int truncatedLines = 0;
        private boolean recoveredFromCrash = false;
        private LocalDateTime lastActivityTime;
        private Usage lastKnownUsage;

        public SessionData toSessionData(String sessionId) {
            SessionData session = SessionData.create(
                sessionId,
                new ArrayList<>(messages),
                SessionData.Status.INTERRUPTED
            );
            if (lastActivityTime != null) {
                session.setLastActiveAt(lastActivityTime);
            }
            return session;
        }

        public void applyToConversation(com.example.agent.domain.conversation.Conversation conversation,
                                         com.example.agent.application.ConversationService service) {
            conversation.clear();
            conversation.addMessages(messages);
        }



        public List<Message> getMessages() {
            return messages;
        }

        public List<TranscriptEntry> getAllEntries() {
            return allEntries;
        }

        public String getCustomTitle() {
            return customTitle;
        }

        public Set<String> getTags() {
            return tags;
        }

        public String getLastCompactBoundary() {
            return lastCompactBoundary;
        }

        public int getTruncatedLines() {
            return truncatedLines;
        }

        public boolean isRecoveredFromCrash() {
            return recoveredFromCrash;
        }

        public LocalDateTime getLastActivityTime() {
            return lastActivityTime;
        }

        public int getMessageCount() {
            return messages.size();
        }

        public Usage getLastKnownUsage() {
            return lastKnownUsage;
        }

        public boolean isEmpty() {
            return messages.isEmpty() && allEntries.isEmpty();
        }
    }

    public static LoadResult load(String sessionId) {
        String safeSessionId = SessionStorage.sanitizeSessionId(sessionId);
        String projectKey = WorkspaceManager.getCurrentProjectKey();
        Path transcriptFile = WorkspaceManager.getSessionMessagesFile(projectKey, safeSessionId);
        
        logger.info("TranscriptLoader.load: sessionId={}, safeSessionId={}, projectKey={}, filePath={}", 
            sessionId, safeSessionId, projectKey, transcriptFile);
        
        return load(transcriptFile);
    }

    public static LoadResult load(Path transcriptFile) {
        LoadResult result = new LoadResult();

        if (!Files.exists(transcriptFile)) {
            logger.warn("Transcript 文件不存在：{}", transcriptFile);
            return result;
        }

        try {
            long fileSize = Files.size(transcriptFile);
            logger.info("加载 Transcript: {} ({} bytes, {} KB)", transcriptFile, fileSize, fileSize / 1024);

            if (fileSize > FAST_LOAD_THRESHOLD_BYTES) {
                logger.info("文件超过阈值 {} MB，使用大文件加载", FAST_LOAD_THRESHOLD_BYTES / 1024 / 1024);
                return loadLargeFile(transcriptFile, result);
            }

            return loadFull(transcriptFile, result);
        } catch (IOException e) {
            logger.error("加载 Transcript 失败：{}", transcriptFile, e);
            return result;
        }
    }

    private static LoadResult loadFull(Path transcriptFile, LoadResult result) throws IOException {
        try (BufferedReader reader = Files.newBufferedReader(transcriptFile, StandardCharsets.UTF_8)) {
            String line;
            long lineNumber = 0;
            int successCount = 0;
            int failCount = 0;

            while ((line = reader.readLine()) != null) {
                lineNumber++;
                boolean success = processLine(line, lineNumber, result);
                if (success) {
                    successCount++;
                } else {
                    failCount++;
                }
            }
            
            logger.info("Transcript 解析完成：总行数={}, 成功={}, 失败={}", lineNumber, successCount, failCount);
        }

        if (result.truncatedLines > 0) {
            logger.warn("Transcript 恢复时截断了 {} 行损坏数据", result.truncatedLines);
        }

        return result;
    }

    private static LoadResult loadLargeFile(Path transcriptFile, LoadResult result) throws IOException {
        logger.info("大文件优化加载：{}", transcriptFile);

        List<String> allLines = Files.readAllLines(transcriptFile, StandardCharsets.UTF_8);
        String lastBoundary = findLastCompactBoundary(allLines);
        int startLine = 0;

        if (lastBoundary != null) {
            startLine = findLineNumber(allLines, lastBoundary);
            logger.info("找到压缩边界，从第 {} 行开始加载", startLine);
        }

        scanMetadataOnly(allLines, startLine, result);

        for (int i = startLine; i < allLines.size(); i++) {
            processLine(allLines.get(i), i + 1, result);
        }

        return result;
    }

    private static String findLastCompactBoundary(List<String> lines) {
        for (int i = lines.size() - 1; i >= 0; i--) {
            try {
                TranscriptEntry entry = objectMapper.readValue(lines.get(i), TranscriptEntry.class);
                if (TranscriptType.COMPACT_BOUNDARY.getValue().equals(entry.getType())) {
                    return entry.getBoundaryUuid();
                }
            } catch (Exception e) {
                logger.warn("解析边界 UUID 失败", e);
            }
        }
        return null;
    }

    private static int findLineNumber(List<String> lines, String boundaryUuid) {
        for (int i = lines.size() - 1; i >= 0; i--) {
            try {
                TranscriptEntry entry = objectMapper.readValue(lines.get(i), TranscriptEntry.class);
                if (boundaryUuid.equals(entry.getBoundaryUuid())) {
                    return i + 1;
                }
            } catch (Exception e) {
                logger.warn("解析条目索引失败", e);
            }
        }
        return 0;
    }

    private static void scanMetadataOnly(List<String> lines, int endLine, LoadResult result) {
        for (int i = 0; i < endLine; i++) {
            try {
                TranscriptEntry entry = objectMapper.readValue(lines.get(i), TranscriptEntry.class);
                if (TranscriptType.CUSTOM_TITLE.getValue().equals(entry.getType())) {
                    result.customTitle = entry.getTitle();
                } else if (TranscriptType.TAG.getValue().equals(entry.getType())) {
                    result.tags.add(entry.getTag());
                }
            } catch (Exception e) {
                logger.warn("解析标签失败", e);
            }
        }
    }

    private static boolean processLine(String line, long lineNumber, LoadResult result) {
        if (line == null || line.trim().isEmpty()) {
            return false;
        }

        try {
            TranscriptEntry entry = objectMapper.readValue(line, TranscriptEntry.class);
            result.allEntries.add(entry);
            processEntry(entry, result);
            return true;
        } catch (Exception e) {
            if (isProbablyTruncatedJson(line)) {
                result.truncatedLines++;
                result.recoveredFromCrash = true;
                logger.warn("第 {} 行可能是截断的 JSON", lineNumber);
            } else {
                logger.warn("跳过损坏的第 {} 行：{}", lineNumber, e.getMessage());
            }
            return false;
        }
    }

    private static boolean isProbablyTruncatedJson(String line) {
        long openBraces = line.chars().filter(c -> c == '{').count();
        long closeBraces = line.chars().filter(c -> c == '}').count();
        return openBraces > closeBraces;
    }

    private static void processEntry(TranscriptEntry entry, LoadResult result) {
        if (entry.getTimestamp() != null) {
            try {
                result.lastActivityTime = LocalDateTime.ofInstant(
                    Instant.parse(entry.getTimestamp()),
                    ZoneId.systemDefault()
                );
            } catch (Exception e) {
                logger.warn("解析时间戳失败：{}", e.getMessage());
            }
        }

        Message msg = entry.getMessage();

        if (msg != null) {
            String role = msg.getRole();
            if ("user".equals(role) || "assistant".equals(role) || "system".equals(role) || "tool".equals(role)) {
                if ("tool".equals(role) && entry.getToolSuccess() != null) {
                    msg.setToolSuccess(entry.getToolSuccess());
                }
                result.messages.add(msg);
                // 记录最后一条 assistant 的 usage，用于重启后恢复上下文统计
                if ("assistant".equals(role) && entry.getUsage() != null) {
                    result.lastKnownUsage = entry.getUsage();
                }
                logger.debug("添加消息 [{}]: role={}, contentLength={}", 
                    result.messages.size(), role, msg.getContent() != null ? msg.getContent().length() : 0);
                return;
            } else {
                logger.debug("消息 role 不匹配：{}", role);
            }
        } else {
            logger.debug("entry.getMessage() 为 null");
        }

        TranscriptType type = entry.getTypeEnum();
        logger.debug("使用 TranscriptType 判断：type={}, typeEnum={}", entry.getType(), type);
        switch (type) {
            case USER:
            case ASSISTANT:
            case TOOL_RESULT:
            case SYSTEM:
                if (msg != null) {
                    if ("tool".equals(msg.getRole()) && entry.getToolSuccess() != null) {
                        msg.setToolSuccess(entry.getToolSuccess());
                    }
                    result.messages.add(msg);
                    logger.debug("通过 TranscriptType 添加消息 [{}]", result.messages.size());
                }
                break;
            case COMPACT_BOUNDARY:
                result.lastCompactBoundary = entry.getBoundaryUuid();
                break;
            case CUSTOM_TITLE:
                result.customTitle = entry.getTitle();
                break;
            case TAG:
                result.tags.add(entry.getTag());
                break;
            default:
                logger.debug("未知 TranscriptType：{}", type);
                break;
        }
    }

    public static boolean exists(String sessionId) {
        String safeSessionId = SessionStorage.sanitizeSessionId(sessionId);
        String projectKey = WorkspaceManager.getCurrentProjectKey();
        Path transcriptFile = WorkspaceManager.getSessionMessagesFile(projectKey, safeSessionId);
        return Files.exists(transcriptFile);
    }

    public static SessionData loadToSessionData(String sessionId) {
        String safeSessionId = SessionStorage.sanitizeSessionId(sessionId);
        LoadResult result = load(safeSessionId);
        if (result.isEmpty()) {
            return null;
        }
        return result.toSessionData(safeSessionId);
    }

    public static boolean loadToConversation(String sessionId, 
                                              com.example.agent.domain.conversation.Conversation conversation,
                                              com.example.agent.application.ConversationService service) {
        String safeSessionId = SessionStorage.sanitizeSessionId(sessionId);
        LoadResult result = load(safeSessionId);
        if (result.isEmpty()) {
            return false;
        }
        result.applyToConversation(conversation, service);
        if (result.isRecoveredFromCrash()) {
            logger.info("会话 {} 从崩溃中恢复，截断了 {} 行损坏数据", 
                sessionId, result.getTruncatedLines());
        }
        return true;
    }



    public static int repairAndCompact(Path transcriptFile) throws IOException {
        if (!Files.exists(transcriptFile)) {
            return 0;
        }

        LoadResult result = load(transcriptFile);
        if (!result.isRecoveredFromCrash()) {
            return 0;
        }

        Path tempFile = transcriptFile.resolveSibling(transcriptFile.getFileName() + ".tmp");
        
        try (BufferedWriter writer = Files.newBufferedWriter(
            tempFile, StandardCharsets.UTF_8,
            StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
            
            ObjectMapper mapper = new ObjectMapper();
            for (TranscriptEntry entry : result.getAllEntries()) {
                writer.write(mapper.writeValueAsString(entry));
                writer.newLine();
            }

            Files.move(tempFile, transcriptFile, StandardCopyOption.REPLACE_EXISTING);
            logger.info("Transcript 修复完成，截断了 {} 行", result.truncatedLines);
            return result.truncatedLines;
        } finally {
            Files.deleteIfExists(tempFile);
        }
    }
}
