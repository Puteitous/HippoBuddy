package com.example.agent.tools;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

public class FileChangeTracker {

    private static final Logger logger = LoggerFactory.getLogger(FileChangeTracker.class);

    private static final Map<String, Map<String, List<FileChange>>> changesBySession = new ConcurrentHashMap<>();
    private static final int MAX_CHANGES_PER_FILE = 20;
    private static final int MAX_TOTAL_CHANGES = 500;
    private static final String STORAGE_FILE = "changes.jsonl";

    private static final AtomicBoolean initialized = new AtomicBoolean(false);
    private static Path testBaseDir;

    private static final ThreadLocal<String> currentSessionId = new ThreadLocal<>();
    private static final ThreadLocal<String> currentToolCallId = new ThreadLocal<>();

    private FileChangeTracker() {}

    public static void setCurrentToolCallId(String toolCallId) {
        currentToolCallId.set(toolCallId);
    }

    public static void clearCurrentToolCallId() {
        currentToolCallId.remove();
    }

    public static String getCurrentToolCallId() {
        String id = currentToolCallId.get();
        return id != null ? id : "";
    }

    public static void setCurrentSessionId(String sessionId) {
        currentSessionId.set(sessionId);
    }

    public static void clearCurrentSessionId() {
        currentSessionId.remove();
    }

    public static String getCurrentSessionId() {
        String id = currentSessionId.get();
        return id != null ? id : "";
    }

    public static synchronized void init() {
        if (initialized.get()) return;
        initialized.set(true);

        // 一次性清理旧全局 changes/changes.jsonl（不再使用的全局共享文件）
        try {
            Path oldGlobalFile = WorkspaceManager.getCurrentProjectDir().resolve("changes").resolve("changes.jsonl");
            if (Files.exists(oldGlobalFile)) {
                Files.delete(oldGlobalFile);
                logger.info("已删除旧全局 changes.jsonl（迁移到会话级存储）");

                Path oldChangesDir = oldGlobalFile.getParent();
                if (Files.exists(oldChangesDir) && Files.list(oldChangesDir).findAny().isEmpty()) {
                    Files.delete(oldChangesDir);
                    logger.debug("已删除空 changes 目录");
                }
            }
        } catch (Exception e) {
            logger.debug("清理旧全局 changes.jsonl 失败（可忽略）: {}", e.getMessage());
        }

        logger.info("FileChangeTracker 已初始化（会话级存储）");
    }

    public static void loadSessionChanges(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return;
        if (changesBySession.containsKey(sessionId)) return;

        Path sessionFile = resolveSessionStorageFile(sessionId);
        if (sessionFile == null || !Files.exists(sessionFile)) return;

        try {
            List<String> lines = Files.readAllLines(sessionFile, StandardCharsets.UTF_8);
            Map<String, List<FileChange>> sessionChanges = new ConcurrentHashMap<>();
            for (String line : lines) {
                if (line.isBlank()) continue;
                try {
                    FileChange change = FileChange.fromJson(line);
                    sessionChanges
                        .computeIfAbsent(change.filePath, k -> new CopyOnWriteArrayList<>())
                        .add(change);
                } catch (Exception e) {
                    logger.warn("跳过损坏的变更记录: {}", e.getMessage());
                }
            }
            changesBySession.put(sessionId, sessionChanges);
            logger.info("已加载会话变更记录: sessionId={}, {}条", sessionId, lines.size());
        } catch (IOException e) {
            logger.warn("加载会话变更记录失败: sessionId={}", sessionId, e);
        }
    }

    private static Path resolveSessionStorageFile(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            if (testBaseDir != null) {
                return testBaseDir.resolve(STORAGE_FILE);
            }
            return null;
        }
        try {
            if (testBaseDir != null) {
                Path sessionDir = testBaseDir.resolve(sessionId);
                return sessionDir.resolve(STORAGE_FILE);
            }
            String projectKey = WorkspaceManager.getCurrentProjectKey();
            return WorkspaceManager.getSessionDir(projectKey, sessionId).resolve(STORAGE_FILE);
        } catch (Exception e) {
            logger.warn("解析会话存储路径失败: sessionId={}", sessionId, e);
            return null;
        }
    }

    private static Map<String, List<FileChange>> getOrCreateSessionChanges(String sessionId) {
        String sid = (sessionId != null && !sessionId.isEmpty()) ? sessionId : "";
        return changesBySession.computeIfAbsent(sid, k -> new ConcurrentHashMap<>());
    }

    public static void recordChange(String filePath, String originalContent, String newContent, String toolName) {
        recordChange(filePath, originalContent, newContent, toolName, false);
    }

    public static void recordChange(String filePath, String originalContent, String newContent, String toolName, boolean newFile) {
        recordChange(filePath, originalContent, null, newContent, toolName, newFile);
    }

    /**
     * 记录文件变更，附带原始字节（用于非 UTF-8 文件的精确回滚）。
     * @param originalBytes 非 null 时表示原始字节，回滚时直接写回；null 表示回滚时用 originalContent UTF-8 写入。
     */
    public static void recordChange(String filePath, String originalContent, byte[] originalBytes, String newContent, String toolName, boolean newFile) {
        ensureInitialized();
        String sessionId = getCurrentSessionId();
        String toolCallId = getCurrentToolCallId();
        FileChange change = new FileChange(filePath, originalContent, newContent, toolName, System.currentTimeMillis(), newFile, sessionId, originalBytes, toolCallId);

        Map<String, List<FileChange>> sessionChanges = getOrCreateSessionChanges(sessionId);
        List<FileChange> list = sessionChanges.computeIfAbsent(filePath, k -> new CopyOnWriteArrayList<>());
        list.add(change);
        while (list.size() > MAX_CHANGES_PER_FILE) {
            list.remove(0);
        }

        appendToFile(change);

        trimTotalIfNeeded();
    }

    public static List<FileChange> getRecentChanges(int limit) {
        ensureInitialized();
        List<FileChange> all = new ArrayList<>();
        for (Map<String, List<FileChange>> sessionChanges : changesBySession.values()) {
            for (List<FileChange> list : sessionChanges.values()) {
                all.addAll(list);
            }
        }
        all.sort((a, b) -> Long.compare(b.timestamp, a.timestamp));
        int end = Math.min(limit, all.size());
        return all.subList(0, end);
    }

    public static FileChange getLastChange(String filePath) {
        ensureInitialized();
        String normalizedPath = normalizePath(filePath);
        FileChange latest = null;
        for (Map<String, List<FileChange>> sessionChanges : changesBySession.values()) {
            for (Map.Entry<String, List<FileChange>> entry : sessionChanges.entrySet()) {
                if (normalizePath(entry.getKey()).equals(normalizedPath)) {
                    List<FileChange> list = entry.getValue();
                    if (!list.isEmpty()) {
                        FileChange last = list.get(list.size() - 1);
                        if (latest == null || last.timestamp > latest.timestamp) {
                            latest = last;
                        }
                    }
                }
            }
        }
        return latest;
    }

    public static List<FileChange> getAllChanges(String filePath) {
        ensureInitialized();
        List<FileChange> result = new ArrayList<>();
        String normalizedPath = normalizePath(filePath);
        for (Map<String, List<FileChange>> sessionChanges : changesBySession.values()) {
            for (Map.Entry<String, List<FileChange>> entry : sessionChanges.entrySet()) {
                if (normalizePath(entry.getKey()).equals(normalizedPath)) {
                    result.addAll(entry.getValue());
                }
            }
        }
        result.sort((a, b) -> Long.compare(a.timestamp, b.timestamp));
        return result;
    }

    /**
     * 根据 toolCallId 回滚到指定变更，移除该变更及其之后的所有变更。
     * 如果 toolCallId 为空，回滚最后一次变更。
     */
    public static boolean rollbackByToolCallId(String filePath, String toolCallId) {
        ensureInitialized();
        if (toolCallId == null || toolCallId.isEmpty()) {
            return rollback(filePath);
        }

        List<FileChange> allChanges = getAllChanges(filePath);
        FileChange target = null;
        for (FileChange c : allChanges) {
            if (toolCallId.equals(c.toolCallId)) {
                target = c;
                break;
            }
        }
        if (target == null) return false;

        try {
            if (target.newFile) {
                Files.deleteIfExists(Path.of(target.filePath));
            } else if (target.originalBytes != null) {
                Files.write(Path.of(target.filePath), target.originalBytes,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            } else {
                Files.writeString(Path.of(target.filePath), target.originalContent, StandardCharsets.UTF_8);
            }

            String sessionId = target.sessionId;
            Map<String, List<FileChange>> sessionChanges = changesBySession.get(sessionId);
            if (sessionChanges != null) {
                List<FileChange> fileChanges = sessionChanges.get(target.filePath);
                if (fileChanges != null) {
                    int listIndex = -1;
                    for (int i = 0; i < fileChanges.size(); i++) {
                        if (toolCallId.equals(fileChanges.get(i).toolCallId)) {
                            listIndex = i;
                            break;
                        }
                    }
                    if (listIndex >= 0) {
                        fileChanges.subList(listIndex, fileChanges.size()).clear();
                    }
                }
                flushSessionToFile(sessionId, sessionChanges);
            }
            return true;
        } catch (Exception e) {
            logger.error("回滚失败: filePath={}, toolCallId={}", filePath, toolCallId, e);
            return false;
        }
    }

    public static boolean rollback(String filePath) {
        ensureInitialized();
        FileChange change = getLastChange(filePath);
        if (change == null) return false;

        String sessionId = change.sessionId;
        Map<String, List<FileChange>> sessionChanges = changesBySession.get(sessionId);
        if (sessionChanges == null) return false;

        try {
            if (change.newFile) {
                Files.deleteIfExists(Path.of(change.filePath));
            } else if (change.originalBytes != null) {
                // 非 UTF-8 文件：写回原始字节，确保高字节不被篡改
                Files.write(Path.of(change.filePath), change.originalBytes,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            } else {
                Files.writeString(Path.of(change.filePath), change.originalContent, StandardCharsets.UTF_8);
            }
            List<FileChange> list = sessionChanges.get(change.filePath);
            if (list != null && !list.isEmpty()) {
                list.remove(list.size() - 1);
            }
            flushSessionToFile(sessionId, sessionChanges);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 清除所有会话的变更记录（内存），切换会话时调用。
     * 不清除磁盘文件，重新加载即可恢复。
     */
    public static synchronized void clearSessionChanges() {
        changesBySession.clear();
    }

    public static synchronized void clear() {
        clearSessionChanges();
        if (testBaseDir != null) {
            try {
                Files.walk(testBaseDir)
                    .filter(p -> p.getFileName().toString().equals(STORAGE_FILE))
                    .forEach(p -> {
                        try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                    });
            } catch (IOException e) {
                logger.warn("清除变更记录文件失败: {}", e.getMessage());
            }
            testBaseDir = null;
        }
    }

    static synchronized void resetForTest() {
        changesBySession.clear();
        testBaseDir = null;
        initialized.set(false);
        currentSessionId.remove();
    }

    static synchronized void setStorageDirForTest(Path dir) {
        changesBySession.clear();
        testBaseDir = dir;
        initialized.set(true);
        currentSessionId.remove();

        // 从测试目录加载已有记录（兼容旧版本测试）
        try {
            Path rootFile = dir.resolve(STORAGE_FILE);
            if (Files.exists(rootFile)) {
                Map<String, List<FileChange>> rootChanges = new ConcurrentHashMap<>();
                List<String> lines = Files.readAllLines(rootFile, StandardCharsets.UTF_8);
                for (String line : lines) {
                    if (line.isBlank()) continue;
                    try {
                        FileChange change = FileChange.fromJson(line);
                        rootChanges
                            .computeIfAbsent(change.filePath, k -> new CopyOnWriteArrayList<>())
                            .add(change);
                    } catch (Exception e) {
                        logger.warn("跳过损坏的变更记录: {}", e.getMessage());
                    }
                }
                if (!rootChanges.isEmpty()) {
                    changesBySession.put("", rootChanges);
                }
            }

            try (var stream = Files.list(dir)) {
                stream.filter(Files::isDirectory).forEach(sessionDir -> {
                    Path sessionFile = sessionDir.resolve(STORAGE_FILE);
                    if (Files.exists(sessionFile)) {
                        try {
                            String sessionId = sessionDir.getFileName().toString();
                            Map<String, List<FileChange>> sessionChanges = new ConcurrentHashMap<>();
                            List<String> lines = Files.readAllLines(sessionFile, StandardCharsets.UTF_8);
                            for (String line : lines) {
                                if (line.isBlank()) continue;
                                try {
                                    FileChange change = FileChange.fromJson(line);
                                    sessionChanges
                                        .computeIfAbsent(change.filePath, k -> new CopyOnWriteArrayList<>())
                                        .add(change);
                                } catch (Exception e) {
                                    logger.warn("跳过损坏的变更记录: {}", e.getMessage());
                                }
                            }
                            changesBySession.put(sessionId, sessionChanges);
                        } catch (IOException e) {
                            logger.warn("加载测试会话变更记录失败: {}", e.getMessage());
                        }
                    }
                });
            }
        } catch (IOException e) {
            logger.warn("加载测试变更记录失败: {}", e.getMessage());
        }
    }

    private static void appendToFile(FileChange change) {
        String sessionId = change.sessionId;
        if (sessionId == null) sessionId = "";
        Path file = resolveSessionStorageFile(sessionId);
        if (file == null) {
            logger.debug("持久化文件未初始化，跳过写入");
            return;
        }
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, change.toJson() + System.lineSeparator(), StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            logger.warn("写入会话变更记录失败: sessionId={}", sessionId, e);
        }
    }

    private static void flushSessionToFile(String sessionId, Map<String, List<FileChange>> sessionChanges) {
        if (sessionChanges == null) return;
        Path file = resolveSessionStorageFile(sessionId);
        if (file == null) return;
        try {
            Files.createDirectories(file.getParent());
            List<String> lines = new ArrayList<>();
            for (List<FileChange> list : sessionChanges.values()) {
                for (FileChange change : list) {
                    lines.add(change.toJson());
                }
            }
            Files.write(file, lines, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            logger.warn("刷新会话变更记录失败: sessionId={}", sessionId, e);
        }
    }

    private static void trimTotalIfNeeded() {
        for (Map.Entry<String, Map<String, List<FileChange>>> sessionEntry : changesBySession.entrySet()) {
            String sessionId = sessionEntry.getKey();
            Map<String, List<FileChange>> sessionChanges = sessionEntry.getValue();

            int total = 0;
            for (List<FileChange> list : sessionChanges.values()) {
                total += list.size();
            }
            if (total <= MAX_TOTAL_CHANGES) continue;

            List<FileChange> all = new ArrayList<>();
            for (List<FileChange> list : sessionChanges.values()) {
                all.addAll(list);
            }
            all.sort((a, b) -> Long.compare(a.timestamp, b.timestamp));

            int toRemove = total - MAX_TOTAL_CHANGES;
            for (int i = 0; i < toRemove && i < all.size(); i++) {
                FileChange oldest = all.get(i);
                List<FileChange> list = sessionChanges.get(oldest.filePath);
                if (list != null) {
                    list.remove(oldest);
                }
            }

            flushSessionToFile(sessionId, sessionChanges);
        }
    }

    private static void ensureInitialized() {
        if (!initialized.get()) {
            init();
        }
    }

    private static String normalizePath(String path) {
        try {
            return Path.of(path).toAbsolutePath().normalize().toString().toLowerCase();
        } catch (Exception e) {
            return path.toLowerCase();
        }
    }

    public static class FileChange {
        public final String filePath;
        public final String originalContent;
        public final byte[] originalBytes;  // null = UTF-8 内容，非 null = 原始字节（非 UTF-8 fallback）
        public final String newContent;
        public final String toolName;
        public final long timestamp;
        public final boolean newFile;
        public final String sessionId;
        public final String toolCallId;

        public FileChange(String filePath, String originalContent, String newContent, String toolName, long timestamp, boolean newFile) {
            this(filePath, originalContent, newContent, toolName, timestamp, newFile, "", null);
        }

        public FileChange(String filePath, String originalContent, String newContent, String toolName, long timestamp, boolean newFile, String sessionId) {
            this(filePath, originalContent, newContent, toolName, timestamp, newFile, sessionId, null);
        }

        public FileChange(String filePath, String originalContent, String newContent, String toolName, long timestamp, boolean newFile, String sessionId, byte[] originalBytes) {
            this(filePath, originalContent, newContent, toolName, timestamp, newFile, sessionId, originalBytes, "");
        }

        public FileChange(String filePath, String originalContent, String newContent, String toolName, long timestamp, boolean newFile, String sessionId, byte[] originalBytes, String toolCallId) {
            this.filePath = filePath;
            this.originalContent = originalContent;
            this.originalBytes = originalBytes;
            this.newContent = newContent;
            this.toolName = toolName;
            this.timestamp = timestamp;
            this.newFile = newFile;
            this.sessionId = sessionId != null ? sessionId : "";
            this.toolCallId = toolCallId != null ? toolCallId : "";
        }

        public String toJson() {
            String bytesField = "";
            if (originalBytes != null) {
                bytesField = ",\"originalBytes\":\"" + Base64.getEncoder().encodeToString(originalBytes) + "\"";
            }
            return "{\"filePath\":\"" + escapeJson(filePath) +
                "\",\"originalContent\":\"" + escapeJson(originalContent) +
                "\",\"newContent\":\"" + escapeJson(newContent) +
                "\",\"toolName\":\"" + escapeJson(toolName) +
                "\",\"timestamp\":" + timestamp +
                ",\"newFile\":" + newFile +
                ",\"sessionId\":\"" + escapeJson(sessionId) + "\"" +
                ",\"toolCallId\":\"" + escapeJson(toolCallId) + "\""
                + bytesField + "}";
        }

        public static FileChange fromJson(String json) {
            String filePath = extractJsonString(json, "filePath");
            String originalContent = extractJsonString(json, "originalContent");
            String newContent = extractJsonString(json, "newContent");
            String toolName = extractJsonString(json, "toolName");
            long timestamp = extractJsonLong(json, "timestamp");
            boolean newFile = extractJsonBoolean(json, "newFile");
            String sessionId = extractJsonString(json, "sessionId");
            String toolCallId = extractJsonString(json, "toolCallId");
            byte[] originalBytes = null;
            String bytesStr = extractJsonString(json, "originalBytes");
            if (bytesStr != null && !bytesStr.isEmpty()) {
                try {
                    originalBytes = Base64.getDecoder().decode(bytesStr);
                } catch (IllegalArgumentException e) {
                    logger.warn("跳过损坏的 originalBytes: {}", e.getMessage());
                }
            }
            return new FileChange(filePath, originalContent, newContent, toolName, timestamp, newFile, sessionId, originalBytes, toolCallId);
        }

        private static String extractJsonString(String json, String key) {
            String search = "\"" + key + "\":\"";
            int start = json.indexOf(search);
            if (start < 0) return "";
            start += search.length();
            StringBuilder sb = new StringBuilder();
            for (int i = start; i < json.length(); i++) {
                char c = json.charAt(i);
                if (c == '\\' && i + 1 < json.length()) {
                    char next = json.charAt(i + 1);
                    switch (next) {
                        case 'n': sb.append('\n'); i++; break;
                        case 'r': sb.append('\r'); i++; break;
                        case 't': sb.append('\t'); i++; break;
                        case '"': sb.append('"'); i++; break;
                        case '\\': sb.append('\\'); i++; break;
                        default: sb.append(c);
                    }
                } else if (c == '"') {
                    break;
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }

        private static long extractJsonLong(String json, String key) {
            String search = "\"" + key + "\":";
            int start = json.indexOf(search);
            if (start < 0) return 0;
            start += search.length();
            StringBuilder sb = new StringBuilder();
            for (int i = start; i < json.length(); i++) {
                char c = json.charAt(i);
                if (Character.isDigit(c) || c == '-') {
                    sb.append(c);
                } else {
                    break;
                }
            }
            try {
                return Long.parseLong(sb.toString());
            } catch (NumberFormatException e) {
                return 0;
            }
        }

        private static boolean extractJsonBoolean(String json, String key) {
            String search = "\"" + key + "\":";
            int start = json.indexOf(search);
            if (start < 0) return false;
            start += search.length();
            while (start < json.length() && json.charAt(start) == ' ') start++;
            return start < json.length() && json.charAt(start) == 't';
        }

        private static String escapeJson(String s) {
            if (s == null) return "";
            return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
        }
    }
}
