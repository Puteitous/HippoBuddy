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
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

public class FileChangeTracker {

    private static final Logger logger = LoggerFactory.getLogger(FileChangeTracker.class);

    private static final Map<String, List<FileChange>> changesByPath = new ConcurrentHashMap<>();
    private static final int MAX_CHANGES_PER_FILE = 20;
    private static final int MAX_TOTAL_CHANGES = 500;
    private static final String STORAGE_FILE = "changes.jsonl";

    private static final AtomicBoolean initialized = new AtomicBoolean(false);
    private static Path storageFile;

    private FileChangeTracker() {}

    public static synchronized void init() {
        if (initialized.get()) return;
        try {
            Path changesDir = WorkspaceManager.getCurrentProjectDir().resolve("changes");
            Files.createDirectories(changesDir);
            storageFile = changesDir.resolve(STORAGE_FILE);

            if (Files.exists(storageFile)) {
                List<String> lines = Files.readAllLines(storageFile, StandardCharsets.UTF_8);
                for (String line : lines) {
                    if (line.isBlank()) continue;
                    try {
                        FileChange change = FileChange.fromJson(line);
                        changesByPath
                            .computeIfAbsent(change.filePath, k -> new CopyOnWriteArrayList<>())
                            .add(change);
                    } catch (Exception e) {
                        logger.warn("跳过损坏的变更记录: {}", e.getMessage());
                    }
                }
                logger.info("✅ 已从文件恢复 {} 条文件变更记录", lines.size());
            } else {
                logger.info("无持久化的文件变更记录，从空白开始");
            }
            initialized.set(true);
        } catch (Exception e) {
            logger.error("❌ 初始化文件变更持久化失败", e);
            initialized.set(true);
        }
    }

    private static Path resolveStorageFile() {
        if (storageFile == null) {
            init();
        }
        return storageFile;
    }

    public static void recordChange(String filePath, String originalContent, String newContent, String toolName) {
        ensureInitialized();
        FileChange change = new FileChange(filePath, originalContent, newContent, toolName, System.currentTimeMillis());

        List<FileChange> list = changesByPath.computeIfAbsent(filePath, k -> new CopyOnWriteArrayList<>());
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
        for (List<FileChange> list : changesByPath.values()) {
            all.addAll(list);
        }
        all.sort((a, b) -> Long.compare(b.timestamp, a.timestamp));
        int end = Math.min(limit, all.size());
        return all.subList(0, end);
    }

    public static FileChange getLastChange(String filePath) {
        ensureInitialized();
        List<FileChange> list = changesByPath.get(filePath);
        if (list != null && !list.isEmpty()) {
            return list.get(list.size() - 1);
        }

        String normalizedPath = normalizePath(filePath);
        for (Map.Entry<String, List<FileChange>> entry : changesByPath.entrySet()) {
            if (normalizePath(entry.getKey()).equals(normalizedPath)) {
                list = entry.getValue();
                if (!list.isEmpty()) {
                    return list.get(list.size() - 1);
                }
            }
        }

        return null;
    }

    public static List<FileChange> getAllChanges(String filePath) {
        ensureInitialized();
        List<FileChange> list = changesByPath.get(filePath);
        if (list != null && !list.isEmpty()) {
            return new ArrayList<>(list);
        }
        String normalizedPath = normalizePath(filePath);
        for (Map.Entry<String, List<FileChange>> entry : changesByPath.entrySet()) {
            if (normalizePath(entry.getKey()).equals(normalizedPath)) {
                return new ArrayList<>(entry.getValue());
            }
        }
        return new ArrayList<>();
    }

    public static boolean rollback(String filePath) {
        ensureInitialized();
        FileChange change = getLastChange(filePath);
        if (change == null) return false;
        try {
            Files.writeString(Path.of(change.filePath), change.originalContent, StandardCharsets.UTF_8);
            List<FileChange> list = changesByPath.get(change.filePath);
            if (list != null && !list.isEmpty()) {
                list.remove(list.size() - 1);
            }
            flushToFile();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static List<FileChange> getChangesInRange(long startTime, long endTime) {
        ensureInitialized();
        List<FileChange> result = new ArrayList<>();
        for (List<FileChange> list : changesByPath.values()) {
            for (FileChange change : list) {
                if (change.timestamp >= startTime && change.timestamp <= endTime) {
                    result.add(change);
                }
            }
        }
        result.sort((a, b) -> Long.compare(a.timestamp, b.timestamp));
        return result;
    }

    public static int rollbackRange(long startTime, long endTime) {
        ensureInitialized();
        List<FileChange> changes = getChangesInRange(startTime, endTime);
        if (changes.isEmpty()) return 0;

        Map<String, List<FileChange>> grouped = new java.util.LinkedHashMap<>();
        for (FileChange change : changes) {
            grouped.computeIfAbsent(change.filePath, k -> new ArrayList<>()).add(change);
        }

        int rolledBack = 0;
        for (Map.Entry<String, List<FileChange>> entry : grouped.entrySet()) {
            String filePath = entry.getKey();
            List<FileChange> fileChanges = entry.getValue();
            String originalContent = fileChanges.get(0).originalContent;
            try {
                Files.writeString(Path.of(filePath), originalContent, StandardCharsets.UTF_8);
                List<FileChange> tracked = changesByPath.get(filePath);
                if (tracked != null) {
                    tracked.removeAll(fileChanges);
                }
                rolledBack++;
            } catch (Exception e) {
                // skip failed files
            }
        }

        if (rolledBack > 0) {
            flushToFile();
        }
        return rolledBack;
    }

    public static synchronized void clear() {
        changesByPath.clear();
        if (storageFile != null) {
            try {
                Files.deleteIfExists(storageFile);
            } catch (IOException e) {
                logger.warn("清除变更记录文件失败: {}", e.getMessage());
            }
        }
    }

    /** package-private: 用于测试中重置全部状态 */
    static synchronized void resetForTest() {
        changesByPath.clear();
        storageFile = null;
        initialized.set(false);
    }

    /** package-private: 设置测试用存储目录，绕过 WorkspaceManager */
    static synchronized void setStorageDirForTest(Path dir) {
        changesByPath.clear();
        try {
            Files.createDirectories(dir);
            storageFile = dir.resolve(STORAGE_FILE);
            initialized.set(true);
            // 如果文件存在，加载已有记录
            if (Files.exists(storageFile)) {
                List<String> lines = Files.readAllLines(storageFile, StandardCharsets.UTF_8);
                for (String line : lines) {
                    if (line.isBlank()) continue;
                    try {
                        FileChange change = FileChange.fromJson(line);
                        changesByPath
                            .computeIfAbsent(change.filePath, k -> new CopyOnWriteArrayList<>())
                            .add(change);
                    } catch (Exception e) {
                        logger.warn("跳过损坏的变更记录: {}", e.getMessage());
                    }
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("设置测试存储目录失败", e);
        }
    }

    private static synchronized void appendToFile(FileChange change) {
        Path file = resolveStorageFile();
        if (file == null) {
            logger.debug("持久化文件未初始化，跳过写入");
            return;
        }
        try {
            Files.write(file, List.of(change.toJson()), StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            logger.warn("写入文件变更记录失败: {}", e.getMessage());
        }
    }

    private static synchronized void flushToFile() {
        Path file = resolveStorageFile();
        if (file == null) return;
        try {
            List<String> lines = new ArrayList<>();
            for (List<FileChange> list : changesByPath.values()) {
                for (FileChange change : list) {
                    lines.add(change.toJson());
                }
            }
            Files.write(file, lines, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            logger.warn("刷新文件变更记录失败: {}", e.getMessage());
        }
    }

    private static void trimTotalIfNeeded() {
        int total = 0;
        for (List<FileChange> list : changesByPath.values()) {
            total += list.size();
        }
        if (total <= MAX_TOTAL_CHANGES) return;

        List<FileChange> all = new ArrayList<>();
        for (List<FileChange> list : changesByPath.values()) {
            all.addAll(list);
        }
        all.sort((a, b) -> Long.compare(a.timestamp, b.timestamp));

        int toRemove = total - MAX_TOTAL_CHANGES;
        for (int i = 0; i < toRemove && i < all.size(); i++) {
            FileChange oldest = all.get(i);
            List<FileChange> list = changesByPath.get(oldest.filePath);
            if (list != null) {
                list.remove(oldest);
            }
        }

        flushToFile();
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
        public final String newContent;
        public final String toolName;
        public final long timestamp;

        public FileChange(String filePath, String originalContent, String newContent, String toolName, long timestamp) {
            this.filePath = filePath;
            this.originalContent = originalContent;
            this.newContent = newContent;
            this.toolName = toolName;
            this.timestamp = timestamp;
        }

        public String toJson() {
            return "{\"filePath\":\"" + escapeJson(filePath) +
                "\",\"originalContent\":\"" + escapeJson(originalContent) +
                "\",\"newContent\":\"" + escapeJson(newContent) +
                "\",\"toolName\":\"" + escapeJson(toolName) +
                "\",\"timestamp\":" + timestamp + "}";
        }

        public static FileChange fromJson(String json) {
            String filePath = extractJsonString(json, "filePath");
            String originalContent = extractJsonString(json, "originalContent");
            String newContent = extractJsonString(json, "newContent");
            String toolName = extractJsonString(json, "toolName");
            long timestamp = extractJsonLong(json, "timestamp");
            return new FileChange(filePath, originalContent, newContent, toolName, timestamp);
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
