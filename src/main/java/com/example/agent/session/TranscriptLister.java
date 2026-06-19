package com.example.agent.session;

import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

public class TranscriptLister {

    private static final Logger logger = LoggerFactory.getLogger(TranscriptLister.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final int TAIL_SCAN_BYTES = 16 * 1024;

    public static class SessionSummary {
        private String sessionId;
        private String title;
        private LocalDateTime lastActive;
        private int messageCount;
        private boolean hasCrashMarker;
        private long fileSizeBytes;

        public String getSessionId() {
            return sessionId;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }

        public String getTitle() {
            return title;
        }

        public String getCustomTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public LocalDateTime getLastActive() {
            return lastActive;
        }

        public void setLastActive(LocalDateTime lastActive) {
            this.lastActive = lastActive;
        }

        public int getMessageCount() {
            return messageCount;
        }

        public void setMessageCount(int messageCount) {
            this.messageCount = messageCount;
        }

        public boolean isHasCrashMarker() {
            return hasCrashMarker;
        }

        public void setHasCrashMarker(boolean hasCrashMarker) {
            this.hasCrashMarker = hasCrashMarker;
        }

        public long getFileSizeBytes() {
            return fileSizeBytes;
        }

        public void setFileSizeBytes(long fileSizeBytes) {
            this.fileSizeBytes = fileSizeBytes;
        }
    }

    public static List<SessionSummary> listSessions() {
        List<SessionSummary> sessions = new ArrayList<>();
        Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");

        if (!Files.exists(sessionsDir)) {
            return sessions;
        }

        try (Stream<Path> files = Files.list(sessionsDir)) {
            files
                .filter(path -> path.getFileName().toString().endsWith(".jsonl"))
                .sorted(Comparator.comparing((Path p) -> {
                    try {
                        return Files.getLastModifiedTime(p).toInstant();
                    } catch (IOException e) {
                        return Instant.EPOCH;
                    }
                }).reversed())
                .forEach(path -> {
                    try {
                        SessionSummary summary = scanSessionSummary(path);
                        if (summary != null) {
                            sessions.add(summary);
                        }
                    } catch (Exception e) {
                        logger.debug("扫描会话失败: {}", path, e);
                    }
                });
        } catch (IOException e) {
            logger.error("列出会话失败", e);
        }

        return sessions;
    }

    public static SessionSummary scanSessionSummary(Path transcriptFile) throws IOException {
        SessionSummary summary = new SessionSummary();

        String filename = transcriptFile.getFileName().toString();
        summary.setSessionId(filename.substring(0, filename.length() - 6));
        summary.setFileSizeBytes(Files.size(transcriptFile));

        String tail = readTail(transcriptFile, TAIL_SCAN_BYTES);
        String[] lines = tail.split("\n");

        int lineCount = countLines(transcriptFile);
        summary.setMessageCount(lineCount);

        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i].trim();
            if (line.isEmpty()) {
                continue;
            }

            if (!line.startsWith("{")) {
                summary.setHasCrashMarker(true);
                continue;
            }

            try {
                JsonNode node = objectMapper.readTree(line);
                String type = node.path("type").asText();
                String timestamp = node.path("timestamp").asText(null);

                if (timestamp != null && summary.getLastActive() == null) {
                    try {
                        summary.setLastActive(LocalDateTime.ofInstant(
                            Instant.parse(timestamp),
                            ZoneId.systemDefault()
                        ));
                    } catch (Exception e) {
                        logger.warn("解析条目时间失败", e);
                    }
                }

                if ("custom-title".equals(type)) {
                    String title = node.path("title").asText(null);
                    if (title != null) {
                        summary.setTitle(title);
                        break;
                    }
                }

            } catch (Exception e) {
                summary.setHasCrashMarker(true);
            }
        }

        return summary;
    }

    private static String readTail(Path file, int bytes) throws IOException {
        long fileSize = Files.size(file);
        long startPos = Math.max(0, fileSize - bytes);

        try (RandomAccessFile raf = new RandomAccessFile(file.toFile(), "r")) {
            raf.seek(startPos);
            byte[] buffer = new byte[(int) (fileSize - startPos)];
            raf.readFully(buffer);
            return new String(buffer, StandardCharsets.UTF_8);
        }
    }

    private static int countLines(Path file) throws IOException {
        try (Stream<String> lines = Files.lines(file, StandardCharsets.UTF_8)) {
            return (int) lines.filter(l -> !l.trim().startsWith("{")).count();
        }
    }

    public static boolean hasAnyCrashedSessions() {
        return listSessions().stream()
            .anyMatch(SessionSummary::isHasCrashMarker);
    }

    public static void repairAllSessions() throws IOException {
        Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");

        if (!Files.exists(sessionsDir)) {
            return;
        }

        try (Stream<Path> files = Files.list(sessionsDir)) {
            files
                .filter(path -> path.getFileName().toString().endsWith(".jsonl"))
                .forEach(path -> {
                    try {
                        int repaired = TranscriptLoader.repairAndCompact(path);
                        if (repaired > 0) {
                            logger.info("修复会话 {}: 移除了 {} 损坏行", 
                                path.getFileName(), repaired);
                        }
                    } catch (Exception e) {
                        logger.warn("修复会话失败: {}", path, e);
                    }
                });
        }
    }
}
