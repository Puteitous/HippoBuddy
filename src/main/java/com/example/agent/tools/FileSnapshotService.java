package com.example.agent.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 文件系统快照服务 — 检测「外部程序」对工作区文件的修改（简化 A 方案）。
 *
 * <p>原理：每次调用 {@link #detectExternalChanges(String)} 时递归扫描工作区，
 * 与上次快照对比文件 lastModified / 存在性差异，返回新增、删除、修改三类变更。
 * 前端每 15 秒轮询一次该服务，感知延迟 ≤ 15 秒。</p>
 *
 * <p>AI 工具自身的写入通过 {@link FileChangeTracker#recordChange} 统一挂钩
 * {@link #markAiWrite(String)} 记录写入时刻，对比时跳过 —— 因为 AI 写入已有
 * 即时的 tool_result → file:changes-updated 链路刷新，避免双重触发。</p>
 *
 * <p>线程安全：前端单会话轮询，detectExternalChanges 用 synchronized 保证
 * 快照读改写原子性（并发调用时后调用者基于最新快照对比）。</p>
 */
public class FileSnapshotService {

    private static final Logger logger = LoggerFactory.getLogger(FileSnapshotService.class);

    /** 上次快照：normalizedPath -> lastModified(ms)。null 表示尚未初始化。 */
    private static volatile Map<String, Long> lastSnapshot = null;

    /** AI 工具写入记录：normalizedPath -> 写入时刻(ms)，用于与外部变更去重 */
    private static final ConcurrentHashMap<String, Long> aiWriteTimes = new ConcurrentHashMap<>();

    /** 忽略的目录名（任意层级命中即跳过整个子树） */
    private static final Set<String> IGNORED_DIR_NAMES = Set.of(
        ".git", ".hg", ".svn",
        "node_modules", ".gradle", "target", "build", "dist", "out", "bin", "obj",
        ".idea", ".vscode", ".settings",
        "__pycache__", ".next", ".nuxt", "coverage", ".venv", "venv", "vendor", "tmp"
    );

    /** 忽略的文件扩展名 */
    private static final Set<String> IGNORED_EXTENSIONS = Set.of(
        ".class", ".pyc", ".pyo", ".o", ".obj", ".exe", ".dll", ".so", ".dylib",
        ".log", ".tmp", ".lock", ".cache"
    );

    /** AI 写入去重宽容窗口（ms）：磁盘 lastModified 与 AI 写入时刻之差在此范围内视为 AI 写入 */
    private static final long AI_WRITE_GRACE_MS = 1500;

    /** AI 写入记录保留时长（ms），超过即清理，防止无限增长 */
    private static final long AI_WRITE_TTL_MS = 5 * 60 * 1000L;

    /** 单次扫描文件数上限，防超大目录卡死 */
    private static final int MAX_SCAN_FILES = 20000;

    /** 变更类型 */
    public enum ChangeType { ADDED, MODIFIED, DELETED }

    /** 外部变更条目 */
    public static class ExternalChange {
        public final ChangeType type;
        public final String path;

        public ExternalChange(ChangeType type, String path) {
            this.type = type;
            this.path = path;
        }
    }

    private FileSnapshotService() {}

    /** 仅测试用：重置快照与 AI 写入记录，保证用例间隔离 */
    static void resetForTest() {
        lastSnapshot = null;
        aiWriteTimes.clear();
    }

    /**
     * AI 工具写入/删除文件时调用（由 {@link FileChangeTracker#recordChange} 统一挂钩）。
     * @param filePath 工具写入的文件路径（原始大小写）
     */
    public static void markAiWrite(String filePath) {
        if (filePath == null || filePath.isEmpty()) return;
        aiWriteTimes.put(normalizePath(filePath), System.currentTimeMillis());
    }

    /**
     * 检测自上次调用以来的外部变更。
     * <ul>
     *   <li>首次调用：仅初始化快照，返回空列表（避免把存量文件误报为「新增」）</li>
     *   <li>根路径不存在 / 不可读：返回空列表并重置快照（下次重建）</li>
     * </ul>
     *
     * @param rootPath 工作区根路径
     * @return 外部变更列表；无变更或首次调用时为空列表
     */
    public static synchronized List<ExternalChange> detectExternalChanges(String rootPath) {
        if (rootPath == null || rootPath.isEmpty()) {
            return List.of();
        }

        Path root;
        try {
            root = Path.of(rootPath).toAbsolutePath().normalize();
        } catch (Exception e) {
            logger.warn("FileSnapshotService: 无效根路径 {}, err={}", rootPath, e.getMessage());
            return List.of();
        }

        // 根目录不存在：重置快照（可能正在切换工作区），下次重建
        if (!Files.isDirectory(root)) {
            if (lastSnapshot != null) {
                lastSnapshot = null;
                logger.debug("FileSnapshotService: 根目录不存在，已重置快照 root={}", rootPath);
            }
            return List.of();
        }

        // 1. 扫描当前磁盘状态
        Map<String, Long> current = new HashMap<>();
        Map<String, String> originalPaths = new HashMap<>();
        int scanCount = scanTree(root, current, originalPaths);

        // 2. 首次调用：初始化快照，不返回任何变更
        Map<String, Long> previous = lastSnapshot;
        if (previous == null) {
            lastSnapshot = current;
            logger.debug("FileSnapshotService: 首次快照已初始化, {} 个文件, root={}", scanCount, rootPath);
            return List.of();
        }

        // 3. 对比差异
        long now = System.currentTimeMillis();
        List<ExternalChange> changes = new ArrayList<>();
        for (Map.Entry<String, Long> e : current.entrySet()) {
            String key = e.getKey();
            Long prevMtime = previous.get(key);
            String displayPath = originalPaths.get(key);
            if (prevMtime == null) {
                // 新增文件 —— AI 新建的跳过
                if (!isAiWrite(key, now, 0)) {
                    changes.add(new ExternalChange(ChangeType.ADDED, displayPath != null ? displayPath : key));
                }
            } else if (!prevMtime.equals(e.getValue())) {
                // 修改文件 —— AI 写入的跳过
                if (!isAiWrite(key, now, e.getValue())) {
                    changes.add(new ExternalChange(ChangeType.MODIFIED, displayPath != null ? displayPath : key));
                }
            }
        }
        for (String key : previous.keySet()) {
            if (!current.containsKey(key)) {
                // 删除 —— AI 删除的跳过
                if (!isAiWrite(key, now, 0)) {
                    changes.add(new ExternalChange(ChangeType.DELETED, key));
                }
            }
        }

        // 4. 更新快照
        lastSnapshot = current;

        // 5. 清理过期的 AI 写入记录
        cleanupAiWriteTimes(now);

        if (!changes.isEmpty()) {
            logger.info("FileSnapshotService: 检测到 {} 个外部变更 (扫描 {} 个文件)", changes.size(), scanCount);
        }
        return changes;
    }

    /**
     * 判断某文件的磁盘状态变化是否为 AI 自身写入所致。
     * @param diskMtime 磁盘 lastModified(ms)；0 表示文件已不存在（删除场景）
     */
    private static boolean isAiWrite(String normalizedPath, long now, long diskMtime) {
        Long aiTime = aiWriteTimes.get(normalizedPath);
        if (aiTime == null) return false;
        if (diskMtime > 0) {
            return Math.abs(diskMtime - aiTime) < AI_WRITE_GRACE_MS;
        }
        // 删除/新增场景：AI 写入记录在最近窗口内
        return (now - aiTime) < AI_WRITE_GRACE_MS;
    }

    private static void cleanupAiWriteTimes(long now) {
        aiWriteTimes.entrySet().removeIf(e -> (now - e.getValue()) > AI_WRITE_TTL_MS);
    }

    /**
     * 递归扫描目录（忽略黑名单），写入快照。
     * @param snapshot normalizedPath -> lastModified
     * @param originalPaths normalizedPath -> 原始大小写路径（供展示）
     * @return 实际扫描的文件数
     */
    private static int scanTree(Path root, Map<String, Long> snapshot, Map<String, String> originalPaths) {
        final int[] count = { 0 };
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    if (!dir.equals(root) && isIgnoredDir(dir.getFileName().toString())) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (count[0] >= MAX_SCAN_FILES) {
                        return FileVisitResult.TERMINATE;
                    }
                    if (isIgnoredFile(file.getFileName().toString())) {
                        return FileVisitResult.CONTINUE;
                    }
                    try {
                        String abs = file.toAbsolutePath().toString();
                        String key = normalizePath(abs);
                        snapshot.put(key, Files.getLastModifiedTime(file).toMillis());
                        originalPaths.put(key, abs);
                        count[0]++;
                    } catch (IOException ignored) {
                        // 文件可能在扫描期间被删除/锁定，跳过
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    // 权限不足 / 文件被占用等：跳过，不中断整个扫描
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            logger.warn("FileSnapshotService: 扫描失败 root={}, err={}", root, e.getMessage());
        }
        return count[0];
    }

    private static boolean isIgnoredDir(String name) {
        return IGNORED_DIR_NAMES.contains(name);
    }

    private static boolean isIgnoredFile(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0) return false;
        return IGNORED_EXTENSIONS.contains(name.substring(dot).toLowerCase());
    }

    /** 与 FileChangeTracker.normalizePath 保持一致：绝对路径 + 小写（Windows 大小写不敏感） */
    private static String normalizePath(String path) {
        try {
            return Path.of(path).toAbsolutePath().normalize().toString().toLowerCase();
        } catch (Exception e) {
            return path.toLowerCase();
        }
    }
}
