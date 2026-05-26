package com.example.agent.snapshot;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class FileSnapshotManager {

    private static final Logger logger = LoggerFactory.getLogger(FileSnapshotManager.class);

    private static final String SNAPSHOTS_FILE = "snapshots.jsonl";
    private static final String FILE_HISTORY_DIR = "file-history";
    private static final long MAX_FILE_SIZE_BYTES = 10L * 1024 * 1024;
    private static final int DEFAULT_MAX_SNAPSHOTS = 100;

    private static final Map<String, Set<String>> trackedFilesBySession = new ConcurrentHashMap<>();
    private static final Map<String, Map<String, Boolean>> trackedFileCreatedBySession = new ConcurrentHashMap<>();
    private static final ThreadLocal<String> currentSessionId = new ThreadLocal<>();

    private static Path testBaseDir;

    private FileSnapshotManager() {}

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

    public static void setStorageDirForTest(Path dir) {
        testBaseDir = dir;
    }

    public static void resetForTest() {
        trackedFilesBySession.clear();
        trackedFileCreatedBySession.clear();
        testBaseDir = null;
        currentSessionId.remove();
    }

    // ===== Phase 1: track =====

    public static void trackFile(String sessionId, String filePath) {
        trackFile(sessionId, filePath, false);
    }

    public static void trackFile(String sessionId, String filePath, boolean created) {
        if (sessionId == null || sessionId.isEmpty() || filePath == null || filePath.isEmpty()) {
            return;
        }
        trackedFilesBySession
            .computeIfAbsent(sessionId, k -> ConcurrentHashMap.newKeySet())
            .add(filePath);
        if (created) {
            trackedFileCreatedBySession
                .computeIfAbsent(sessionId, k -> new ConcurrentHashMap<>())
                .put(filePath, true);
        }
        logger.debug("跟踪文件: sessionId={}, filePath={}, created={}", sessionId, filePath, created);
    }

    public static void trackCurrentSessionFile(String filePath) {
        trackCurrentSessionFile(filePath, false);
    }

    public static void trackCurrentSessionFile(String filePath, boolean created) {
        trackFile(getCurrentSessionId(), filePath, created);
    }

    // ===== Phase 2 + 3: makeSnapshot (three-phase commit) =====

    public static Snapshot makeSnapshot(String sessionId, String messageId) {
        if (sessionId == null || sessionId.isEmpty()) {
            logger.warn("makeSnapshot 跳过: sessionId 为空");
            return null;
        }
        if (messageId == null || messageId.isEmpty()) {
            logger.warn("makeSnapshot 跳过: messageId 为空");
            return null;
        }

        Snapshot lastSnapshot = getLastSnapshot(sessionId);
        Map<String, Integer> latestVersionMap = buildLatestVersionMap(lastSnapshot);
        Set<String> tracked = trackedFilesBySession.get(sessionId);
        Map<String, Boolean> createdMap = trackedFileCreatedBySession.get(sessionId);
        if (createdMap == null) {
            createdMap = Collections.emptyMap();
        }

        // Phase 1: capture - 构建累积文件列表
        Set<String> allFilesToProcess = new LinkedHashSet<>();
        if (lastSnapshot != null) {
            for (Snapshot.TrackedFile tf : lastSnapshot.getTrackedFiles()) {
                allFilesToProcess.add(tf.getPath());
            }
        }
        if (tracked != null && !tracked.isEmpty()) {
            allFilesToProcess.addAll(tracked);
        }

        if (allFilesToProcess.isEmpty()) {
            logger.debug("makeSnapshot 跳过: 无文件需要记录 sessionId={}", sessionId);
            return null;
        }

        List<String> filePaths = new ArrayList<>(allFilesToProcess);
        List<Snapshot.TrackedFile> newTrackedFiles = new ArrayList<>();

        // Phase 2: async IO - 所有磁盘操作
        boolean allSucceeded = true;
        for (String filePath : filePaths) {
            try {
                boolean isCreated;
                if (tracked != null && tracked.contains(filePath)) {
                    isCreated = createdMap.getOrDefault(filePath, false);
                } else {
                    isCreated = false;
                }

                Snapshot.TrackedFile tf = createBackupIfNeeded(sessionId, filePath, latestVersionMap, lastSnapshot, isCreated);
                if (tf != null) {
                    newTrackedFiles.add(tf);
                }
            } catch (Exception e) {
                logger.error("备份文件失败: sessionId={}, filePath={}", sessionId, filePath, e);
                allSucceeded = false;
            }
        }

        // Phase 3: commit
        if (!allSucceeded) {
            logger.warn("makeSnapshot 因部分文件备份失败而中止: sessionId={}, messageId={}", sessionId, messageId);
            return null;
        }

        Snapshot snapshot = new Snapshot(messageId, System.currentTimeMillis(), newTrackedFiles);
        appendSnapshot(sessionId, snapshot);
        trackedFilesBySession.remove(sessionId);
        trackedFileCreatedBySession.remove(sessionId);

        gc(sessionId);
        logger.info("快照已创建: sessionId={}, messageId={}, files={}", sessionId, messageId, newTrackedFiles.size());
        return snapshot;
    }

    private static Snapshot.TrackedFile createBackupIfNeeded(
            String sessionId, String filePath,
            Map<String, Integer> latestVersionMap,
            Snapshot lastSnapshot,
            boolean created) {

        Path diskPath = Path.of(filePath);
        String hash = computeFileHash(filePath);
        int nextVersion = latestVersionMap.getOrDefault(hash, 0) + 1;
        String backupFileName = hash + "@v" + nextVersion;

        if (!Files.exists(diskPath)) {
            logger.debug("文件已不存在，记录 null 备份: filePath={}", filePath);
            return new Snapshot.TrackedFile(filePath, hash, null, created);
        }

        // 大文件跳过
        try {
            if (Files.size(diskPath) > MAX_FILE_SIZE_BYTES) {
                logger.warn("文件超过大小限制(>10MB)，跳过快照: filePath={}", filePath);
                Snapshot.TrackedFile existing = findTrackedFile(lastSnapshot, filePath);
                return existing != null ? new Snapshot.TrackedFile(filePath, existing.getHash(), existing.getBackup(), created) : new Snapshot.TrackedFile(filePath, hash, null, created);
            }
        } catch (IOException e) {
            logger.warn("读取文件大小失败: filePath={}", filePath, e);
        }

        // 检查文件是否真的变了（复用上一版本备份）
        Snapshot.TrackedFile previousTf = findTrackedFile(lastSnapshot, filePath);
        if (previousTf != null && previousTf.getBackup() != null) {
            Path prevBackupPath = resolveBackupPath(sessionId, previousTf.getBackup());
            if (Files.exists(prevBackupPath) && !checkOriginFileChanged(diskPath, prevBackupPath)) {
                logger.debug("文件未变化，复用上一版本备份: filePath={}, backup={}", filePath, previousTf.getBackup());
                return new Snapshot.TrackedFile(filePath, previousTf.getHash(), previousTf.getBackup(), created);
            }
        }

        // 创建备份
        try {
            Path backupDir = resolveFileHistoryDir(sessionId);
            Files.createDirectories(backupDir);
            Path backupPath = backupDir.resolve(backupFileName);
            Files.copy(diskPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
            logger.debug("备份已创建: sessionId={}, filePath={}, backup={}", sessionId, filePath, backupFileName);
            return new Snapshot.TrackedFile(filePath, hash, backupFileName, created);
        } catch (IOException e) {
            logger.error("创建备份文件失败: filePath={}, backupPath={}", filePath, backupFileName, e);
            throw new RuntimeException("创建备份失败: " + filePath, e);
        }
    }

    // ===== rewindToSnapshot =====

    public static RewindResult rewindToSnapshot(String sessionId, String messageId) {
        if (sessionId == null || messageId == null) {
            return RewindResult.failure("sessionId 和 messageId 不能为空");
        }

        Snapshot target = findSnapshot(sessionId, messageId);
        if (target == null) {
            return RewindResult.failure("未找到目标快照: messageId=" + messageId);
        }

        Snapshot previousSnapshot = findPreviousSnapshot(sessionId, messageId);

        List<String> restoredFiles = new ArrayList<>();
        Set<String> targetFilePaths = new HashSet<>();

        for (Snapshot.TrackedFile tf : target.getTrackedFiles()) {
            targetFilePaths.add(tf.getPath());
            try {
                Path filePath = Path.of(tf.getPath());

                if (tf.isCreated()) {
                    if (Files.exists(filePath)) {
                        Files.deleteIfExists(filePath);
                        restoredFiles.add(tf.getPath() + " (deleted)");
                        logger.debug("删除本轮新创建的文件: filePath={}", tf.getPath());
                        continue;
                    }
                }

                String backupToRestore = null;
                if (previousSnapshot != null) {
                    Snapshot.TrackedFile prevTf = findTrackedFile(previousSnapshot, tf.getPath());
                    if (prevTf != null && prevTf.getBackup() != null) {
                        backupToRestore = prevTf.getBackup();
                    } else if (prevTf != null && prevTf.getBackup() == null) {
                        Files.deleteIfExists(filePath);
                        restoredFiles.add(tf.getPath() + " (deleted)");
                        continue;
                    }
                } else if (tf.getBackup() != null) {
                    backupToRestore = tf.getBackup();
                }

                if (backupToRestore != null) {
                    Path restorePath = resolveBackupPath(sessionId, backupToRestore);
                    if (Files.exists(restorePath)) {
                        if (Files.exists(filePath) && !checkOriginFileChanged(filePath, restorePath)) {
                            restoredFiles.add(tf.getPath() + " (unchanged)");
                            logger.debug("文件未变化，跳过恢复: filePath={}", tf.getPath());
                        } else {
                            Files.createDirectories(filePath.getParent());
                            Files.copy(restorePath, filePath, StandardCopyOption.REPLACE_EXISTING);
                            restoredFiles.add(tf.getPath());
                            logger.debug("文件已恢复: filePath={}, backup={}", tf.getPath(), backupToRestore);
                        }
                    } else {
                        logger.warn("备份文件不存在，跳过: backupPath={}", restorePath);
                    }
                } else {
                    Files.deleteIfExists(filePath);
                    restoredFiles.add(tf.getPath() + " (deleted)");
                }

            } catch (Exception e) {
                logger.error("恢复文件失败: filePath={}", tf.getPath(), e);
            }
        }

        List<Snapshot> allSnapshots = loadAllSnapshots(sessionId);
        boolean foundTarget = false;
        for (Snapshot s : allSnapshots) {
            if (s.getMessageId().equals(messageId)) {
                foundTarget = true;
                continue;
            }
            if (foundTarget) {
                for (Snapshot.TrackedFile f : s.getTrackedFiles()) {
                    if (!targetFilePaths.contains(f.getPath())) {
                        try {
                            Files.deleteIfExists(Path.of(f.getPath()));
                            logger.debug("删除后续轮次创建的文件: filePath={}", f.getPath());
                        } catch (IOException e) {
                            logger.warn("删除后续轮次文件失败: filePath={}", f.getPath(), e);
                        }
                    }
                }
            }
        }

        return RewindResult.success(restoredFiles);
    }

    private static Snapshot findPreviousSnapshot(String sessionId, String messageId) {
        List<Snapshot> allSnapshots = loadAllSnapshots(sessionId);
        for (int i = 0; i < allSnapshots.size(); i++) {
            if (allSnapshots.get(i).getMessageId().equals(messageId)) {
                if (i > 0) {
                    return allSnapshots.get(i - 1);
                }
                return null;
            }
        }
        return null;
    }

    // ===== preview =====

    public static PreviewResult getPreview(String sessionId, String messageId) {
        Snapshot target = findSnapshot(sessionId, messageId);
        if (target == null) {
            return null;
        }

        Snapshot previousSnapshot = findPreviousSnapshot(sessionId, messageId);
        List<PreviewFile> previewFiles = new ArrayList<>();

        for (Snapshot.TrackedFile tf : target.getTrackedFiles()) {
            boolean exists = Files.exists(Path.of(tf.getPath()));

            String action;
            if (tf.isCreated()) {
                action = exists ? "delete" : "restore";
            } else if (tf.getBackup() == null) {
                if (exists) {
                    action = "delete";
                } else {
                    Snapshot.TrackedFile prevTf = previousSnapshot != null ? findTrackedFile(previousSnapshot, tf.getPath()) : null;
                    action = (prevTf != null && prevTf.getBackup() != null) ? "restore" : "unchanged";
                }
            } else {
                action = "restore";
            }

            previewFiles.add(new PreviewFile(tf.getPath(), action));
        }

        return new PreviewResult(previewFiles);
    }

    // ===== snapshots.jsonl operations =====

    public static List<Snapshot> loadAllSnapshots(String sessionId) {
        Path file = resolveSnapshotsFile(sessionId);
        if (file == null || !Files.exists(file)) {
            return List.of();
        }

        List<Snapshot> snapshots = new ArrayList<>();
        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                try {
                    snapshots.add(Snapshot.fromJson(line));
                } catch (Exception e) {
                    logger.warn("跳过损坏的快照记录: {}", e.getMessage());
                }
            }
        } catch (IOException e) {
            logger.warn("加载快照文件失败: sessionId={}", sessionId, e);
        }
        return snapshots;
    }

    private static Snapshot getLastSnapshot(String sessionId) {
        List<Snapshot> snapshots = loadAllSnapshots(sessionId);
        if (snapshots.isEmpty()) return null;
        return snapshots.get(snapshots.size() - 1);
    }

    public static Snapshot findSnapshot(String sessionId, String messageId) {
        for (Snapshot s : loadAllSnapshots(sessionId)) {
            if (s.getMessageId().equals(messageId)) {
                return s;
            }
        }
        return null;
    }

    private static void appendSnapshot(String sessionId, Snapshot snapshot) {
        Path file = resolveSnapshotsFile(sessionId);
        if (file == null) return;
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, snapshot.toJson() + System.lineSeparator(),
                StandardCharsets.UTF_8,
                java.nio.file.StandardOpenOption.CREATE,
                java.nio.file.StandardOpenOption.APPEND);
        } catch (IOException e) {
            logger.error("追加快照记录失败: sessionId={}", sessionId, e);
        }
    }

    public static void truncateSnapshotsAfter(String sessionId, String messageId) {
        List<Snapshot> allSnapshots = loadAllSnapshots(sessionId);
        int targetIndex = -1;
        for (int i = 0; i < allSnapshots.size(); i++) {
            if (allSnapshots.get(i).getMessageId().equals(messageId)) {
                targetIndex = i;
                break;
            }
        }
        if (targetIndex == -1) return;

        List<Snapshot> retained = allSnapshots.subList(0, targetIndex);
        rewriteSnapshotsFile(sessionId, retained);
    }

    public static void retainSnapshots(String sessionId, Set<String> retainedMessageIds) {
        List<Snapshot> allSnapshots = loadAllSnapshots(sessionId);
        List<Snapshot> retained = new ArrayList<>();
        int removedCount = 0;
        for (Snapshot s : allSnapshots) {
            if (retainedMessageIds.contains(s.getMessageId())) {
                retained.add(s);
            } else {
                removedCount++;
                logger.debug("移除快照: messageId={}, 原因: 对话已被截断", s.getMessageId());
            }
        }
        Set<String> retainedBackups = retained.stream()
            .flatMap(s -> s.getTrackedFiles().stream())
            .map(Snapshot.TrackedFile::getBackup)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        for (Snapshot s : allSnapshots) {
            if (!retainedMessageIds.contains(s.getMessageId())) {
                for (Snapshot.TrackedFile tf : s.getTrackedFiles()) {
                    if (tf.getBackup() != null && !retainedBackups.contains(tf.getBackup())) {
                        try {
                            Files.deleteIfExists(resolveBackupPath(sessionId, tf.getBackup()));
                        } catch (IOException e) {
                            logger.warn("清理备份文件失败: backupPath={}", tf.getBackup(), e);
                        }
                    }
                }
            }
        }
        rewriteSnapshotsFile(sessionId, retained);
        logger.debug("快照清理完成: sessionId={}, 保留 {} 个, 移除 {} 个", sessionId, retained.size(), removedCount);
        cleanupEmptyDateDir(sessionId);
    }

    private static void rewriteSnapshotsFile(String sessionId, List<Snapshot> snapshots) {
        Path file = resolveSnapshotsFile(sessionId);
        if (file == null) return;
        if (snapshots.isEmpty()) {
            try {
                Files.deleteIfExists(file);
            } catch (IOException e) {
                logger.warn("删除快照文件失败: sessionId={}", sessionId, e);
            }
            return;
        }

        Path tempFile = file.resolveSibling(SNAPSHOTS_FILE + ".tmp");
        try (BufferedWriter writer = Files.newBufferedWriter(tempFile, StandardCharsets.UTF_8)) {
            for (Snapshot s : snapshots) {
                writer.write(s.toJson());
                writer.newLine();
            }
            writer.flush();
        } catch (IOException e) {
            logger.error("写入临时快照文件失败: sessionId={}", sessionId, e);
            return;
        }

        try {
            Files.move(tempFile, file, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            try {
                Files.move(tempFile, file, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ex) {
                logger.error("替换快照文件失败: sessionId={}", sessionId, ex);
            }
        } catch (IOException e) {
            logger.error("移动快照文件失败: sessionId={}", sessionId, e);
        }
    }

    // ===== GC =====

    public static void gc(String sessionId) {
        gc(sessionId, DEFAULT_MAX_SNAPSHOTS);
    }

    public static void gc(String sessionId, int maxSnapshots) {
        List<Snapshot> snapshots = loadAllSnapshots(sessionId);
        if (snapshots.size() <= maxSnapshots) return;

        List<Snapshot> evicted = new ArrayList<>(snapshots.subList(0, snapshots.size() - maxSnapshots));
        List<Snapshot> retained = new ArrayList<>(snapshots.subList(snapshots.size() - maxSnapshots, snapshots.size()));

        Set<String> retainedBackups = retained.stream()
            .flatMap(s -> s.getTrackedFiles().stream())
            .map(Snapshot.TrackedFile::getBackup)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());

        for (Snapshot s : evicted) {
            for (Snapshot.TrackedFile tf : s.getTrackedFiles()) {
                if (tf.getBackup() != null && !retainedBackups.contains(tf.getBackup())) {
                    Path backupPath = resolveBackupPath(sessionId, tf.getBackup());
                    try {
                        Files.deleteIfExists(backupPath);
                    } catch (IOException e) {
                        logger.warn("GC: 无法删除备份文件: backupPath={}", backupPath, e);
                    }
                }
            }
        }

        rewriteSnapshotsFile(sessionId, retained);
        logger.info("快照 GC 完成: sessionId={}, 保留 {} 个, 删除 {} 个, 清理备份文件",
            sessionId, retained.size(), evicted.size());

        cleanupEmptyDateDir(sessionId);
    }

    // ===== helpers =====

    private static Snapshot.TrackedFile findTrackedFile(Snapshot snapshot, String filePath) {
        if (snapshot == null) return null;
        for (Snapshot.TrackedFile tf : snapshot.getTrackedFiles()) {
            if (tf.getPath().equals(filePath)) {
                return tf;
            }
        }
        return null;
    }

    private static Map<String, Integer> buildLatestVersionMap(Snapshot lastSnapshot) {
        Map<String, Integer> versionMap = new HashMap<>();
        if (lastSnapshot == null) return versionMap;
        for (Snapshot.TrackedFile tf : lastSnapshot.getTrackedFiles()) {
            if (tf.getBackup() != null) {
                String hash = tf.getHash();
                int version = extractVersion(tf.getBackup());
                versionMap.merge(hash, version, Math::max);
            }
        }
        return versionMap;
    }

    private static int extractVersion(String backupFileName) {
        int atIndex = backupFileName.indexOf('@');
        if (atIndex < 0) return 0;
        try {
            return Integer.parseInt(backupFileName.substring(atIndex + 2));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static boolean checkOriginFileChanged(Path filePath, Path backupPath) {
        try {
            if (!Files.exists(filePath) && !Files.exists(backupPath)) return false;
            if (!Files.exists(filePath) || !Files.exists(backupPath)) return true;

            BasicFileAttributes fileAttr = Files.readAttributes(filePath, BasicFileAttributes.class);
            BasicFileAttributes backupAttr = Files.readAttributes(backupPath, BasicFileAttributes.class);

            if (fileAttr.size() != backupAttr.size()) return true;
            if (fileAttr.lastModifiedTime().toMillis() < backupAttr.lastModifiedTime().toMillis()) {
                return false;
            }

            return !Files.readString(filePath, StandardCharsets.UTF_8)
                .equals(Files.readString(backupPath, StandardCharsets.UTF_8));
        } catch (IOException e) {
            return true;
        }
    }

    static String computeFileHash(String filePath) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(filePath.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes).substring(0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 不可用", e);
        }
    }

    private static void cleanupEmptyDateDir(String sessionId) {
        if (testBaseDir != null) return;
        Path sessionDir = resolveSessionDir(sessionId);
        if (sessionDir == null) return;
        Path dateDir = sessionDir.getParent();
        if (dateDir == null || !Files.exists(dateDir)) return;
        try (Stream<Path> entries = Files.list(dateDir)) {
            if (entries.findAny().isEmpty()) {
                Files.delete(dateDir);
                logger.debug("已清理空的日期目录: {}", dateDir.getFileName());
            }
        } catch (IOException e) {
            logger.warn("清理空日期目录失败: dateDir={}", dateDir, e);
        }
    }

    // ===== path resolution =====

    private static Path resolveSnapshotsFile(String sessionId) {
        Path sessionDir = resolveSessionDir(sessionId);
        return sessionDir != null ? sessionDir.resolve(SNAPSHOTS_FILE) : null;
    }

    private static Path resolveBackupPath(String sessionId, String backupFileName) {
        return resolveFileHistoryDir(sessionId).resolve(backupFileName);
    }

    private static Path resolveFileHistoryDir(String sessionId) {
        Path sessionDir = resolveSessionDir(sessionId);
        return sessionDir.resolve(FILE_HISTORY_DIR);
    }

    private static Path resolveSessionDir(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return null;
        if (testBaseDir != null) {
            return testBaseDir.resolve(sessionId);
        }
        try {
            String projectKey = WorkspaceManager.getCurrentProjectKey();
            return WorkspaceManager.getSessionDir(projectKey, sessionId);
        } catch (Exception e) {
            logger.warn("解析会话目录失败: sessionId={}", sessionId, e);
            return null;
        }
    }

    // ===== result types =====

    public static class RewindResult {
        private final boolean success;
        private final String error;
        private final List<String> restoredFiles;

        private RewindResult(boolean success, String error, List<String> restoredFiles) {
            this.success = success;
            this.error = error;
            this.restoredFiles = restoredFiles;
        }

        static RewindResult success(List<String> restoredFiles) {
            return new RewindResult(true, null, restoredFiles);
        }

        static RewindResult failure(String error) {
            return new RewindResult(false, error, List.of());
        }

        public boolean isSuccess() { return success; }
        public String getError() { return error; }
        public List<String> getRestoredFiles() { return restoredFiles; }
    }

    public static class PreviewFile {
        private final String filePath;
        private final String action;

        PreviewFile(String filePath, String action) {
            this.filePath = filePath;
            this.action = action;
        }

        public String getFilePath() { return filePath; }
        public String getAction() { return action; }
    }

    public static class PreviewResult {
        private final List<PreviewFile> files;

        PreviewResult(List<PreviewFile> files) {
            this.files = files;
        }

        public List<PreviewFile> getFiles() { return files; }
    }
}
