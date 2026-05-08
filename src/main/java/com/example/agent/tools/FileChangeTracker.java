package com.example.agent.tools;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public class FileChangeTracker {

    private static final Map<String, List<FileChange>> changesByPath = new ConcurrentHashMap<>();
    private static final int MAX_CHANGES_PER_FILE = 20;

    private FileChangeTracker() {}

    public static void recordChange(String filePath, String originalContent, String newContent, String toolName) {
        List<FileChange> list = changesByPath.computeIfAbsent(filePath, k -> new CopyOnWriteArrayList<>());
        list.add(new FileChange(filePath, originalContent, newContent, toolName, System.currentTimeMillis()));
        while (list.size() > MAX_CHANGES_PER_FILE) {
            list.remove(0);
        }
    }

    public static List<FileChange> getRecentChanges(int limit) {
        List<FileChange> all = new ArrayList<>();
        for (List<FileChange> list : changesByPath.values()) {
            all.addAll(list);
        }
        all.sort((a, b) -> Long.compare(b.timestamp, a.timestamp));
        int end = Math.min(limit, all.size());
        return all.subList(0, end);
    }

    public static FileChange getLastChange(String filePath) {
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
        FileChange change = getLastChange(filePath);
        if (change == null) return false;
        try {
            Files.writeString(Path.of(change.filePath), change.originalContent, StandardCharsets.UTF_8);
            List<FileChange> list = changesByPath.get(change.filePath);
            if (list != null && !list.isEmpty()) {
                list.remove(list.size() - 1);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 获取指定时间范围内的所有文件变更（按时间正序）
     */
    public static List<FileChange> getChangesInRange(long startTime, long endTime) {
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

    /**
     * 回滚指定时间范围内的所有文件变更（按时间倒序回滚，确保每个文件只回滚到最早的状态）
     * @return 成功回滚的文件数量
     */
    public static int rollbackRange(long startTime, long endTime) {
        List<FileChange> changes = getChangesInRange(startTime, endTime);
        if (changes.isEmpty()) return 0;

        // 按文件分组，每组按时间倒序回滚
        Map<String, List<FileChange>> grouped = new java.util.LinkedHashMap<>();
        for (FileChange change : changes) {
            grouped.computeIfAbsent(change.filePath, k -> new ArrayList<>()).add(change);
        }

        int rolledBack = 0;
        for (Map.Entry<String, List<FileChange>> entry : grouped.entrySet()) {
            String filePath = entry.getKey();
            List<FileChange> fileChanges = entry.getValue();
            // 取最早的 originalContent（即该时间范围内第一次修改前的状态）
            String originalContent = fileChanges.get(0).originalContent;
            try {
                Files.writeString(Path.of(filePath), originalContent, StandardCharsets.UTF_8);
                // 从追踪器中移除这些变更记录
                List<FileChange> tracked = changesByPath.get(filePath);
                if (tracked != null) {
                    tracked.removeAll(fileChanges);
                }
                rolledBack++;
            } catch (Exception e) {
                // 跳过失败的文件
            }
        }
        return rolledBack;
    }

    private static String normalizePath(String path) {
        try {
            return Path.of(path).toAbsolutePath().normalize().toString().toLowerCase();
        } catch (Exception e) {
            return path.toLowerCase();
        }
    }

    public static void clear() {
        changesByPath.clear();
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
    }
}
