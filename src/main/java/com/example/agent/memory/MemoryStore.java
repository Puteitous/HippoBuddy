package com.example.agent.memory;

import com.example.agent.memory.consolidation.MemoryConsolidator;
import com.example.agent.web.server.DashboardServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * 多文件记忆存储
 * 
 * 核心特性：
 * - 一条记忆一个文件（UUID.md）
 * - 内存索引加速检索
 * - 原子写入（临时文件 → fsync → 重命名）
 * - 文件锁保护并发写入
 * - 沙箱权限检查
 */
public class MemoryStore {

    private static final Logger logger = LoggerFactory.getLogger(MemoryStore.class);

    private static final String MEMORY_DIR = ".hippo/memory";
    private static final String INDEX_FILE = "MEMORY.md";
    private static final String TEMP_SUFFIX = ".tmp";

    // 内存索引（只存元数据，不存内容）
    private final ConcurrentHashMap<String, MemoryEntryMeta> index = new ConcurrentHashMap<>();
    
    // 文件级锁（用于 JVM 内并发控制）
    private final ConcurrentHashMap<String, Object> fileLocks = new ConcurrentHashMap<>();
    
    // 沙箱
    private final MemoryToolSandbox sandbox;
    
    // 记忆整合器（用于触发 AutoDream）
    private MemoryConsolidator consolidator;
    
    // 存储目录
    private final Path memoryDir;
    
    // 索引文件路径
    private final Path indexPath;
    
    // 后台刷新线程（低负载时全量重建索引）
    private final ExecutorService backgroundExecutor = Executors.newSingleThreadExecutor();

    /**
     * 记忆条目元数据（轻量级，用于索引）
     */
    public static class MemoryEntryMeta {
        public final String id;
        public String title;
        public MemoryEntry.MemoryType type;
        public Set<String> tags;
        public Instant lastUpdated;
        public Instant lastAccessed;
        public String fileName;

        public MemoryEntryMeta(MemoryEntry entry) {
            this.id = entry.getId();
            this.title = extractTitle(entry.getContent());
            this.type = entry.getType();
            this.tags = new HashSet<>(entry.getTags());
            this.lastUpdated = entry.getLastUpdated();
            this.lastAccessed = entry.getLastAccessed();
            this.fileName = null;
        }

        public MemoryEntryMeta(String id, String title, MemoryEntry.MemoryType type) {
            this.id = id;
            this.title = title;
            this.type = type;
            this.tags = new HashSet<>();
            this.lastUpdated = Instant.now();
            this.lastAccessed = Instant.now();
            this.fileName = null;
        }

        private String extractTitle(String content) {
            if (content == null || content.isEmpty()) {
                return "Untitled";
            }
            String[] lines = content.split("\n");
            for (String line : lines) {
                line = line.trim();
                if (line.startsWith("# ")) {
                    return line.substring(2).trim();
                }
                if (!line.isEmpty()) {
                    return line.length() > 50 ? line.substring(0, 50) + "..." : line;
                }
            }
            return "Untitled";
        }

        public MemoryEntry.MemoryType getType() {
            return type;
        }

        public String getId() {
            return id;
        }

        public Instant getLastUpdated() {
            return lastUpdated;
        }

        public Instant getLastAccessed() {
            return lastAccessed;
        }

        public Set<String> getTags() {
            return tags;
        }

        public String getTitle() {
            return title;
        }
    }

    public MemoryStore(MemoryToolSandbox sandbox) {
        this.sandbox = sandbox;
        this.memoryDir = sandbox.getMemoryRoot();
        this.indexPath = memoryDir.resolve(INDEX_FILE);
        ensureDirectory();
        loadIndex();
    }

    /**
     * 确保存储目录存在
     */
    private void ensureDirectory() {
        try {
            if (!Files.exists(memoryDir)) {
                Files.createDirectories(memoryDir);
            }
        } catch (IOException e) {
            throw new MemoryAccessException("创建记忆目录失败", e);
        }
    }

    /**
     * 加载索引（从 MEMORY.md 或扫描目录）
     */
    private void loadIndex() {
        // 优先从索引文件加载
        if (Files.exists(indexPath)) {
            try {
                loadIndexFromFile();
                
                // 一致性校验：索引数 vs 文件数
                int indexCount = index.size();
                int fileCount = countMemoryFiles();
                
                if (indexCount != fileCount) {
                    logger.warn(
                        "索引与文件数不一致（索引：{}，文件：{}），全量重建索引",
                        indexCount, fileCount
                    );
                    index.clear();
                    scanDirectory();
                }
                
                return;
            } catch (IOException e) {
                logger.warn("从索引文件加载失败，尝试扫描目录", e);
            }
        }
        
        // 回退：扫描目录
        scanDirectory();
    }

    /**
     * 快速统计记忆文件数量（不解析内容）
     */
    private int countMemoryFiles() {
        if (!Files.exists(memoryDir)) {
            return 0;
        }
        
        try (var stream = Files.list(memoryDir)) {
            return (int) stream
                .filter(Files::isRegularFile)
                .filter(p -> p.getFileName().toString().endsWith(".md"))
                .filter(p -> !p.getFileName().toString().equals(INDEX_FILE))
                .filter(p -> !p.getFileName().toString().endsWith(TEMP_SUFFIX))
                .count();
        } catch (IOException e) {
            logger.warn("统计文件数失败", e);
            return 0;
        }
    }

    /**
     * 从索引文件加载（快速）
     */
    private void loadIndexFromFile() throws IOException {
        String content = Files.readString(indexPath);
        String[] lines = content.split("\n");
        
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            
            // 格式1：Markdown 链接 — - [标题](文件名.md) — 描述
            if (line.startsWith("- [") && line.contains("](")) {
                MemoryEntryMeta meta = parseMarkdownIndexLine(line);
                if (meta != null) {
                    index.put(meta.id, meta);
                }
                continue;
            }
            
            // 格式2：表格行 — | UUID | Title | Type | Tags | LastUpdated |
            if (line.startsWith("|") && line.endsWith("|")) {
                // 跳过表头分隔符行（如 |----|-------|...）
                if (line.matches("\\|[-\\s|]+\\|")) {
                    continue;
                }
                MemoryEntryMeta meta = parseIndexLine(line);
                if (meta != null) {
                    index.put(meta.id, meta);
                }
            }
        }
        
        logger.info("从索引文件加载了 {} 条记忆", index.size());
    }
    
    /**
     * 解析 Markdown 链接格式的索引行
     * 格式：- [标题](文件名.md) — 描述
     */
    private MemoryEntryMeta parseMarkdownIndexLine(String line) {
        // 提取标题和文件名
        int titleStart = line.indexOf("[") + 1;
        int titleEnd = line.indexOf("]");
        int fileStart = line.indexOf("(") + 1;
        int fileEnd = line.indexOf(")");
        
        if (titleStart <= 0 || titleEnd <= titleStart || fileStart <= 0 || fileEnd <= fileStart) {
            return null;
        }
        
        String title = line.substring(titleStart, titleEnd).trim();
        String fileName = line.substring(fileStart, fileEnd).trim();
        
        // 从文件名推断类型
        MemoryEntry.MemoryType type = MemoryEntry.MemoryType.USER_PREFERENCE;
        if (fileName.startsWith("project_context_")) {
            type = MemoryEntry.MemoryType.PROJECT_CONTEXT;
        } else if (fileName.startsWith("feedback_")) {
            type = MemoryEntry.MemoryType.FEEDBACK;
        } else if (fileName.startsWith("reference_")) {
            type = MemoryEntry.MemoryType.REFERENCE;
        }
        
        // 尝试从文件中读取完整 frontmatter 获取 id
        Path filePath = memoryDir.resolve(fileName);
        if (Files.exists(filePath)) {
            try {
                Map<String, Object> frontmatter = FrontmatterParser.parse(filePath);
                String id = (String) frontmatter.get("id");
                if (id != null) {
                    MemoryEntryMeta meta = new MemoryEntryMeta(id, title, type);
                    meta.fileName = fileName;
                    return meta;
                }
            } catch (IOException e) {
                logger.debug("解析索引行引用的文件失败：{}", fileName);
            }
        }
        
        // 如果无法从文件获取 id，使用文件名（去掉 .md）作为 id
        String id = fileName.endsWith(".md") ? fileName.substring(0, fileName.length() - 3) : fileName;
        MemoryEntryMeta meta = new MemoryEntryMeta(id, title, type);
        meta.fileName = fileName;
        return meta;
    }

    /**
     * 扫描目录重建索引（较慢，作为备用）
     */
    private void scanDirectory() {
        if (!Files.exists(memoryDir)) {
            logger.debug("记忆目录不存在：{}", memoryDir);
            return;
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(memoryDir, "*.md")) {
            int fileCount = 0;
            for (Path file : stream) {
                String fileName = file.getFileName().toString();
                if (fileName.equals(INDEX_FILE) || fileName.endsWith(TEMP_SUFFIX)) {
                    continue;
                }
                fileCount++;

                try {
                    // 只解析 frontmatter，不解析 body
                    Map<String, Object> frontmatter = FrontmatterParser.parse(file);
                    if (frontmatter.containsKey("id")) {
                        String id = (String) frontmatter.get("id");
                        logger.trace("扫描到记忆文件：{}", id);
                        // 读取完整 entry 构建 meta
                        MemoryEntry entry = FrontmatterParser.parseEntry(file);
                        MemoryEntryMeta meta = new MemoryEntryMeta(entry);
                        meta.fileName = fileName;
                        index.put(id, meta);
                    } else {
                        logger.warn("文件 {} 没有 id 字段", fileName);
                    }
                } catch (IOException e) {
                    logger.warn("解析文件失败：{}", fileName, e);
                }
            }
            
            logger.info("扫描目录加载了 {} 条记忆（共 {} 个文件）", index.size(), fileCount);
        } catch (IOException e) {
            logger.error("扫描记忆目录失败", e);
        }
    }

    /**
     * 解析索引行
     */
    private MemoryEntryMeta parseIndexLine(String line) {
        // 移除首尾的 | 和空格
        line = line.trim();
        if (line.startsWith("|")) line = line.substring(1);
        if (line.endsWith("|")) line = line.substring(0, line.length() - 1);
        
        String[] parts = line.split("\\|");
        if (parts.length < 4) {
            return null;
        }
        
        try {
            String id = parts[0].trim();
            String title = parts[1].trim();
            MemoryEntry.MemoryType type = MemoryEntry.MemoryType.valueOf(parts[2].trim());
            
            MemoryEntryMeta meta = new MemoryEntryMeta(id, title, type);
            
            // 解析 tags
            String[] tagParts = parts[3].trim().split(",");
            for (String tag : tagParts) {
                meta.tags.add(tag.trim());
            }
            
            return meta;
        } catch (Exception e) {
            logger.warn("解析索引行失败：{}", line, e);
            return null;
        }
    }

    // 构造器辅助方法
    private MemoryEntryMeta createMeta(MemoryEntry entry) {
        return new MemoryEntryMeta(entry);
    }

    /**
     * 添加记忆条目
     */
    public void add(MemoryEntry entry) {
        // 1. 沙箱权限检查
        assertCanWrite(entry.getId());
        
        // 2. 写入文件
        writeMemoryFile(entry);
        
        // 3. 更新索引
        MemoryEntryMeta meta = createMeta(entry);
        meta.fileName = entry.getId() + ".md";
        index.put(entry.getId(), meta);
        
        // 4. 异步更新索引文件
        scheduleIndexUpdate();
        
        // 5. 广播 SSE 事件
        DashboardServer.broadcast("memory_saved",
            "{\"id\":\"" + entry.getId() + "\",\"type\":\"" + entry.getType() + "\",\"tags\":" + tagsToJson(entry.getTags()) + "}");
        
        logger.debug("添加记忆：{}", entry.getId());
    }

    /**
     * 更新记忆条目
     */
    public void update(String id, java.util.function.Consumer<MemoryEntry> updater) {
        // 1. 沙箱权限检查
        assertCanWrite(id);
        
        // 2. 获取文件锁
        Object lock = getFileLock(id);
        synchronized (lock) {
            try {
                // 3. 读取现有内容
                MemoryEntry entry = findById(id);
                if (entry == null) {
                    throw new MemoryAccessException("记忆不存在：" + id);
                }
                
                // 4. 应用更新
                updater.accept(entry);
                
                // 5. 写回文件
                writeMemoryFile(entry);
                
                // 6. 更新索引
                MemoryEntryMeta updateMeta = createMeta(entry);
                MemoryEntryMeta oldMeta = index.get(id);
                if (oldMeta != null && oldMeta.fileName != null) {
                    updateMeta.fileName = oldMeta.fileName;
                } else {
                    updateMeta.fileName = id + ".md";
                }
                index.put(id, updateMeta);
                
                // 7. 异步更新索引文件
                scheduleIndexUpdate();
                
                logger.debug("更新记忆：{}", id);
            } catch (Exception e) {
                throw new MemoryAccessException("更新记忆失败：" + id, e);
            }
        }
    }

    /**
     * 删除记忆条目
     */
    public void delete(String id) {
        // 1. 沙箱权限检查
        assertCanWrite(id);
        
        // 2. 获取文件锁
        Object lock = getFileLock(id);
        synchronized (lock) {
            try {
                Path file = getMemoryFilePath(id);
                if (Files.exists(file)) {
                    Files.delete(file);
                    index.remove(id);
                    scheduleIndexUpdate();
                    logger.debug("删除记忆：{}", id);
                }
            } catch (IOException e) {
                throw new MemoryAccessException("删除记忆失败：" + id, e);
            }
        }
    }

    /**
     * 根据 ID 查找记忆（按需加载完整内容）
     */
    public MemoryEntry findById(String id) {
        MemoryEntryMeta meta = index.get(id);
        if (meta == null) {
            return null;
        }
        
        // 沙箱权限检查（只读操作）
        assertCanRead(id);
        
        // 记录访问
        meta.lastAccessed = Instant.now();
        
        // 从磁盘读取完整内容
        try {
            Path file = getMemoryFilePath(id);
            if (Files.exists(file)) {
                return FrontmatterParser.parseEntry(file);
            }
        } catch (IOException e) {
            logger.warn("读取记忆文件失败：{}", id, e);
        }
        
        return null;
    }

    /**
     * 根据 ID 查找元数据（快速，不读文件）
     */
    public MemoryEntryMeta findMetaById(String id) {
        return index.get(id);
    }

    /**
     * 搜索记忆（基于索引）
     */
    public List<MemoryEntry> search(String query) {
        List<MemoryEntry> results = new ArrayList<>();
        
        for (MemoryEntryMeta meta : index.values()) {
            if (matchesQuery(meta, query)) {
                MemoryEntry entry = findById(meta.id);
                if (entry != null) {
                    results.add(entry);
                }
            }
        }
        
        // 按相关性排序
        results.sort((e1, e2) -> Double.compare(
            RelevanceScorer.calculateRelevance(e2, query),
            RelevanceScorer.calculateRelevance(e1, query)
        ));
        
        return results;
    }

    /**
     * 向量检索（已废弃，保留用于向后兼容）
     * 
     * @deprecated 文件系统即记忆，不再使用向量检索
     */
    @Deprecated
    public List<MemoryEntry> searchSimilar(float[] queryEmbedding, int topK, double minScore) {
        logger.debug("searchSimilar 已废弃，返回空列表");
        return List.of();
    }

    /**
     * 判断元数据是否匹配查询
     */
    private boolean matchesQuery(MemoryEntryMeta meta, String query) {
        if (query == null || query.isBlank()) {
            return true;
        }
        
        String queryLower = query.toLowerCase();
        String[] queryTokens = queryLower.split("[\\s\\p{Punct}]+");
        
        // 检查标题是否包含任何查询词
        String titleLower = meta.title.toLowerCase();
        for (String token : queryTokens) {
            if (!token.isEmpty() && titleLower.contains(token)) {
                return true;
            }
        }
        
        // 检查标签是否包含任何查询词
        for (String tag : meta.tags) {
            String tagLower = tag.toLowerCase();
            for (String token : queryTokens) {
                if (!token.isEmpty() && (tagLower.contains(token) || token.contains(tagLower))) {
                    return true;
                }
            }
        }
        
        // 检查类型
        String typeLower = meta.type.name().toLowerCase();
        for (String token : queryTokens) {
            if (!token.isEmpty() && typeLower.contains(token)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 获取所有记忆的元数据列表
     */
    public Collection<MemoryEntryMeta> getAllMetas() {
        return Collections.unmodifiableCollection(index.values());
    }

    /**
     * 获取索引大小
     */
    public int getIndexSize() {
        return index.size();
    }

    /**
     * 获取索引文本（用于 LLM 读取现有记忆）
     */
    public String getIndexText() {
        if (!Files.exists(indexPath)) {
            return "";
        }
        try {
            return Files.readString(indexPath);
        } catch (IOException e) {
            logger.warn("读取索引文件失败", e);
            return "";
        }
    }

    /**
     * 获取索引文本（限制条数，按重要性排序）
     * 
     * @param maxEntries 最大注入条数（防止上下文膨胀）
     * @return 格式化后的索引文本
     */
    public String getIndexText(int maxEntries) {
        if (index.isEmpty()) {
            return "";
        }

        // 按最后更新时间排序，取前 N 条
        List<MemoryEntryMeta> sortedEntries = index.values().stream()
            .sorted((a, b) -> b.lastUpdated.compareTo(a.lastUpdated))
            .limit(maxEntries)
            .toList();

        StringBuilder sb = new StringBuilder();
        sb.append("# 🧠 长期记忆索引\n\n");
        sb.append("> 共 ").append(index.size()).append(" 条记忆，以下展示最近的 ").append(sortedEntries.size()).append(" 条\n\n");

        for (MemoryEntryMeta meta : sortedEntries) {
            String title = meta.title != null ? meta.title : "Untitled";
            String typeIcon = getTypeIcon(meta.type);
            
            sb.append(String.format("- %s [%s](%s.md)\n",
                typeIcon, title, meta.id));
        }

        return sb.toString();
    }

    private String getTypeIcon(MemoryEntry.MemoryType type) {
        return switch (type) {
            case USER_PREFERENCE -> "👤";
            case FEEDBACK -> "✅";
            case PROJECT_CONTEXT -> "📝";
            case REFERENCE -> "🔗";
            default -> "📝";
        };
    }

    /**
     * 获取实际文件数量
     */
    public int getFileCount() {
        try (Stream<Path> stream = Files.list(memoryDir)) {
            return (int) stream
                .filter(Files::isRegularFile)
                .filter(p -> p.getFileName().toString().endsWith(".md"))
                .filter(p -> !p.getFileName().toString().equals(INDEX_FILE))
                .filter(p -> !p.getFileName().toString().endsWith(TEMP_SUFFIX))
                .count();
        } catch (IOException e) {
            logger.warn("统计文件数失败", e);
            return 0;
        }
    }

    /**
     * 写入记忆文件（原子操作 + 文件锁）
     */
    private void writeMemoryFile(MemoryEntry entry) {
        Path file = getMemoryFilePath(entry.getId());
        Path tempFile = file.resolveSibling(file.getFileName() + TEMP_SUFFIX);
        
        // 获取 JVM 内文件锁
        Object lock = getFileLock(entry.getId());
        synchronized (lock) {
            try {
                // 1. 生成带 frontmatter 的完整内容
                String frontmatter = FrontmatterParser.generate(entry);
                String content = frontmatter + entry.getContent();
                
                // 2. 写入临时文件
                try (FileChannel channel = FileChannel.open(tempFile,
                        StandardOpenOption.CREATE,
                        StandardOpenOption.WRITE,
                        StandardOpenOption.TRUNCATE_EXISTING)) {
                    
                    channel.write(java.nio.ByteBuffer.wrap(content.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                    channel.force(true); // fsync：确保数据和元数据都刷到磁盘
                }
                
                // 3. 沙箱检查（写操作前最后一次检查）
                assertCanWrite(entry.getId());
                
                // 4. 原子重命名
                Files.move(tempFile, file,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
                
                logger.trace("原子写入记忆文件：{}", entry.getId());
            } catch (IOException e) {
                // 清理临时文件
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException ex) {
                    logger.warn("清理临时文件失败", ex);
                }
                throw new MemoryAccessException("写入记忆文件失败：" + entry.getId(), e);
            }
        }
    }

    /**
     * 获取文件路径
     */
    private Path getMemoryFilePath(String id) {
        MemoryEntryMeta meta = index.get(id);
        if (meta != null && meta.fileName != null) {
            return memoryDir.resolve(meta.fileName);
        }
        return memoryDir.resolve(id + ".md");
    }

    /**
     * 获取文件锁（JVM 内）
     */
    private Object getFileLock(String id) {
        return fileLocks.computeIfAbsent(id, k -> new Object());
    }

    /**
     * 沙箱权限检查（只读操作）
     */
    private void assertCanRead(String id) {
        if (sandbox == null) {
            return;
        }
        
        Path targetPath = getMemoryFilePath(id).toAbsolutePath();
        Map<String, Object> input = new HashMap<>();
        input.put("file_path", targetPath.toString());
        
        MemoryPermissionResult result = sandbox.check("read_file", input);
        if (!result.isAllowed()) {
            throw new MemoryAccessException("读取权限被拒绝：" + result.getMessage());
        }
    }

    /**
     * 沙箱权限检查（写操作）
     */
    private void assertCanWrite(String id) {
        if (sandbox == null) {
            return; // 测试模式可能没有沙箱
        }
        
        Path targetPath = getMemoryFilePath(id).toAbsolutePath();
        Map<String, Object> input = new HashMap<>();
        input.put("file_path", targetPath.toString());
        
        MemoryPermissionResult result = sandbox.check("write_file", input);
        if (!result.isAllowed()) {
            throw new MemoryAccessException("写入权限被拒绝：" + result.getMessage());
        }
    }

    /**
     * 异步更新索引文件
     */
    private void scheduleIndexUpdate() {
        backgroundExecutor.submit(() -> {
            try {
                // 延迟一点时间，合并多次更新
                TimeUnit.MILLISECONDS.sleep(100);
                updateIndexFile();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (IOException e) {
                logger.warn("更新索引文件失败", e);
            }
        });
    }

    // 索引文件限制
    private static final int MAX_INDEX_LINES = 200;
    private static final int MAX_INDEX_SIZE_BYTES = 25 * 1024; // 25KB
    
    /**
     * 更新索引文件（增量或全量）
     * 
     * 格式遵循 Claude Code 规范：
     * - [标题](文件名.md) — 一句话描述
     * 每行 ≤ 150 字符，总共 ≤ 200 行，总大小 ≤ 25KB
     */
    private void updateIndexFile() throws IOException {
        // 简单实现：全量重写索引文件
        // 优化：可以只更新变化的行
        
        StringBuilder sb = new StringBuilder();
        int lineCount = 0;
        
        for (MemoryEntryMeta meta : index.values()) {
            // 检查行数限制
            if (lineCount >= MAX_INDEX_LINES) {
                logger.warn("索引文件达到行数限制 ({} 行)，跳过剩余 {} 条记忆", 
                    MAX_INDEX_LINES, index.size() - lineCount);
                break;
            }
            
            // 格式：- [标题](文件名.md) — 一句话描述
            String fileName = meta.fileName != null ? meta.fileName : meta.id + ".md";
            String description = generateDescription(meta);
            
            // 截断描述到 150 字符以内
            if (description.length() > 150) {
                description = description.substring(0, 147) + "...";
            }
            
            String line = String.format("- [%s](%s) — %s\n",
                meta.title,
                fileName,
                description
            );
            
            // 检查大小限制
            if (sb.length() + line.length() > MAX_INDEX_SIZE_BYTES) {
                logger.warn("索引文件达到大小限制 ({} KB)，跳过剩余 {} 条记忆", 
                    MAX_INDEX_SIZE_BYTES / 1024, index.size() - lineCount);
                break;
            }
            
            sb.append(line);
            lineCount++;
        }
        
        // 原子写入索引文件
        Path tempIndex = indexPath.resolveSibling(indexPath.getFileName() + TEMP_SUFFIX);
        Files.writeString(tempIndex, sb.toString());
        Files.move(tempIndex, indexPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        
        logger.trace("更新索引文件，共 {} 条 ({} 行, {} 字节)", 
            index.size(), lineCount, sb.length());
    }
    
    /**
     * 为记忆条目生成一句话描述
     */
    private String generateDescription(MemoryEntryMeta meta) {
        // 从内容中提取第一句作为描述
        String content = meta.title; // 使用标题作为基础描述
        
        // 如果有标签，可以附加到描述中
        if (!meta.tags.isEmpty()) {
            String tags = String.join(", ", meta.tags);
            if (tags.length() < 50) {
                content += " [" + tags + "]";
            }
        }
        
        return content;
    }

    /**
     * 关闭存储（清理资源）
     */
    public void close() {
        try {
            // 等待后台任务完成
            backgroundExecutor.shutdown();
            if (!backgroundExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                backgroundExecutor.shutdownNow();
            }
            
            // 确保索引文件已更新
            updateIndexFile();
        } catch (Exception e) {
            logger.error("关闭 MemoryStore 失败", e);
        }
    }

    // ========== Phase 3: 记忆注入实现 ==========
    
    /**
     * 获取相关记忆作为提示（每轮对话前预取）
     * 
     * @param context 当前对话上下文（用于关键词匹配）
     * @return 格式化的相关记忆文本
     */
    public String getRelevantMemoriesAsPrompt(String context) {
        if (context == null || context.isBlank() || index.isEmpty()) {
            return "";
        }

        // 从上下文中提取关键词
        Set<String> keywords = extractKeywords(context);
        if (keywords.isEmpty()) {
            return "";
        }

        // 搜索相关记忆（按相关性评分）
        List<ScoredMemory> scoredMemories = index.values().stream()
            .map(meta -> {
                double score = calculateRelevanceScore(meta, keywords);
                return new ScoredMemory(meta, score);
            })
            .filter(s -> s.score > RELEVANCE_THRESHOLD)
            .sorted((a, b) -> Double.compare(b.score, a.score))
            .limit(MAX_RELEVANT_MEMORIES)
            .toList();

        if (scoredMemories.isEmpty()) {
            return "";
        }

        // 构建提示文本
        StringBuilder sb = new StringBuilder();
        sb.append("## 📚 相关历史记忆\n\n");
        sb.append("以下是从过去会话中检索到的相关记忆，可能对你有帮助：\n\n");

        for (ScoredMemory scored : scoredMemories) {
            MemoryEntry entry = findById(scored.meta.id);
            if (entry != null) {
                sb.append(String.format("### %s (相关性: %.0f%%)\n", scored.meta.title, scored.score * 100));
                sb.append(entry.getContent()).append("\n\n");
            }
        }

        return sb.toString();
    }

    private static final int MAX_RELEVANT_MEMORIES = 5;
    private static final double RELEVANCE_THRESHOLD = 0.15;

    private Set<String> extractKeywords(String context) {
        Set<String> keywords = new HashSet<>();
        String[] words = context.toLowerCase().split("[\\s\\p{Punct}]+");
        for (String word : words) {
            if (word.length() > 2) {
                keywords.add(word);
            }
        }
        return keywords;
    }

    private double calculateRelevanceScore(MemoryEntryMeta meta, Set<String> keywords) {
        double score = 0.0;

        // 标题匹配（权重高）
        if (meta.title != null) {
            String titleLower = meta.title.toLowerCase();
            for (String keyword : keywords) {
                if (titleLower.contains(keyword)) {
                    score += 0.4;
                }
            }
        }

        // 标签匹配（权重最高）
        for (String tag : meta.tags) {
            String tagLower = tag.toLowerCase();
            for (String keyword : keywords) {
                if (tagLower.contains(keyword) || keyword.contains(tagLower)) {
                    score += 0.5;
                }
            }
        }

        // 最近访问权重
        long daysSinceAccess = java.time.Duration.between(meta.lastAccessed, Instant.now()).toDays();
        if (daysSinceAccess < 7) {
            score += 0.1;
        }

        return Math.min(1.0, score);
    }

    private static class ScoredMemory {
        final MemoryEntryMeta meta;
        final double score;

        ScoredMemory(MemoryEntryMeta meta, double score) {
            this.meta = meta;
            this.score = score;
        }
    }

    private static volatile boolean autoDreamEnabled = false;

    /**
     * 触发自动梦境（Phase 2 实现）
     * 调用 MemoryConsolidator 检查并执行整合（三重门会自动判断）
     */
    public void triggerAutoDream() {
        if (!autoDreamEnabled) {
            return;
        }
        if (consolidator != null) {
            consolidator.checkAndConsolidate(null);
        }
    }

    /**
     * 设置记忆整合器
     */
    public void setConsolidator(MemoryConsolidator consolidator) {
        this.consolidator = consolidator;
    }

    public static void setAutoDreamEnabled(boolean enabled) {
        autoDreamEnabled = enabled;
    }

    public static boolean isAutoDreamEnabled() {
        return autoDreamEnabled;
    }

    /**
     * 添加待处理记忆（Phase 2 实现）
     * 当前为空操作
     */
    public void addPendingMemory(String candidate) {
        // TODO: Phase 2 实现待处理记忆队列
        logger.debug("待处理记忆：{}", candidate);
    }

    /**
     * 将 tags 集合转换为 JSON 数组字符串
     */
    private String tagsToJson(Set<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return "[]";
        }
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (String tag : tags) {
            if (!first) sb.append(",");
            sb.append("\"").append(tag.replace("\"", "\\\"")).append("\"");
            first = false;
        }
        sb.append("]");
        return sb.toString();
    }
}
