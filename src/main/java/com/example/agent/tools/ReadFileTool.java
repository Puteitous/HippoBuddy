package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

public class ReadFileTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(ReadFileTool.class);
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;
    private static final int MAX_LINES_TO_READ = 2000;
    private static final long EDIT_FAILURE_WINDOW_MS = 30000;
    private static final int MAX_CACHE_SIZE = 100;
    private static final long CACHE_TTL_MS = 300_000;

    private static final Map<String, Instant> recentEditFailures = new ConcurrentHashMap<>();

    private final Map<String, FileCacheEntry> fileCache = new ConcurrentHashMap<>();

    private static class FileCacheEntry {
        private final String content;
        private final long lastModified;
        private final long readTime;
        private final int contentLength;
        private volatile int accessCount;

        FileCacheEntry(String content, long lastModified, long readTime) {
            this.content = content;
            this.lastModified = lastModified;
            this.readTime = readTime;
            this.contentLength = content.length();
            this.accessCount = 1;
        }

        boolean isExpired() {
            return System.currentTimeMillis() - readTime > CACHE_TTL_MS;
        }

        boolean isFileModified(Path path) {
            try {
                long currentModified = Files.getLastModifiedTime(path).toMillis();
                return currentModified != this.lastModified;
            } catch (IOException e) {
                logger.warn("检查文件修改时间失败: {}", path, e);
                return true;
            }
        }

        String generateCacheHitMessage(String filePath, Path path) {
            this.accessCount++;
            long timeSinceRead = System.currentTimeMillis() - readTime;
            String timeDesc;
            if (timeSinceRead < 1000) {
                timeDesc = "刚刚";
            } else if (timeSinceRead < 60000) {
                timeDesc = (timeSinceRead / 1000) + " 秒前";
            } else {
                timeDesc = (timeSinceRead / 60000) + " 分钟前";
            }

            String relativePath = PathSecurityUtils.getRelativePath(path);
            int totalLines = content.split("\n", -1).length;

            return String.format(
                "<system-reminder>\n" +
                "文件 %s 内容未改变（%s 读取，第 %d 次访问）。\n" +
                "内容已从缓存返回，可直接使用。\n" +
                "</system-reminder>\n" +
                "文件内容 (%s) [缓存]:\n" +
                "<file_content>\n" +
                "%s\n" +
                "</file_content>\n" +
                "(%d 字符, 文件共 %d 行)\n",
                filePath,
                timeDesc,
                accessCount,
                relativePath,
                content,
                contentLength,
                totalLines
            );
        }
    }

    private static String normalizeCacheKey(String filePath) {
        return java.nio.file.Paths.get(filePath).normalize().toString();
    }

    private void evictIfNeeded() {
        if (fileCache.size() < MAX_CACHE_SIZE) {
            return;
        }
        Map.Entry<String, FileCacheEntry> oldest = null;
        for (Map.Entry<String, FileCacheEntry> entry : fileCache.entrySet()) {
            if (entry.getValue().isExpired()) {
                fileCache.remove(entry.getKey());
                continue;
            }
            if (oldest == null || entry.getValue().readTime < oldest.getValue().readTime) {
                oldest = entry;
            }
        }
        if (oldest != null && fileCache.size() >= MAX_CACHE_SIZE) {
            fileCache.remove(oldest.getKey());
            logger.debug("缓存淘汰: {}（超过最大容量 {}）", oldest.getKey(), MAX_CACHE_SIZE);
        }
    }

    @Override
    public String getName() {
        return "read_file";
    }

    @Override
    public String getDescription() {
        return "读取指定路径的文件内容。只能访问项目目录内的文件。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要读取的文件路径（绝对路径或相对路径，只能访问项目目录内）"
                    },
                    "offset": {
                        "type": "integer",
                        "description": "起始行号（默认 0，从第 1 行开始）"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "读取行数（默认 2000，最大 2000）"
                    }
                },
                "required": ["path"]
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        if (arguments.has("path")) {
            return Collections.singletonList(arguments.get("path").asText());
        }
        return Collections.emptyList();
    }

    @Override
    public boolean requiresFileLock() {
        return true;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (!arguments.has("path") || arguments.get("path").isNull()) {
            throw new ToolExecutionException("缺少必需参数: path");
        }

        String filePath = arguments.get("path").asText();
        if (filePath == null || filePath.trim().isEmpty()) {
            throw new ToolExecutionException("path 参数不能为空");
        }

        Path path = PathSecurityUtils.validateAndResolve(filePath);
        String cacheKey = normalizeCacheKey(path.toString());

        if (!Files.exists(path)) {
            throw new ToolExecutionException("文件不存在: " + filePath);
        }

        if (!Files.isRegularFile(path)) {
            throw new ToolExecutionException("不是常规文件: " + filePath);
        }

        if (!Files.isReadable(path)) {
            throw new ToolExecutionException("文件不可读: " + filePath);
        }

        try {
            long fileSize = Files.size(path);
            if (fileSize > MAX_FILE_SIZE) {
                throw new ToolExecutionException(
                        String.format("文件过大（%d 字节），最大支持 %d 字节（10MB）", fileSize, MAX_FILE_SIZE));
            }

            int offset = 0;
            if (arguments.has("offset") && !arguments.get("offset").isNull()) {
                offset = Math.max(0, arguments.get("offset").asInt());
            }

            int limit = MAX_LINES_TO_READ;
            if (arguments.has("limit") && !arguments.get("limit").isNull()) {
                limit = Math.min(MAX_LINES_TO_READ, Math.max(1, arguments.get("limit").asInt()));
            }

            FileCacheEntry cached = fileCache.get(cacheKey);
            if (cached != null && !cached.isExpired() && !cached.isFileModified(path) && offset == 0 && limit == MAX_LINES_TO_READ) {
                logger.debug("缓存命中: {} (访问次数: {}, 缓存key: {})", filePath, cached.accessCount + 1, cacheKey);
                
                if (hasRecentEditFailure(cacheKey)) {
                    recentEditFailures.remove(cacheKey);
                    logger.info("编辑失败后重新读取: {} (返回完整内容)", filePath);
                    return cached.content;
                }
                
                return cached.generateCacheHitMessage(filePath, path);
            } else if (cached != null) {
                fileCache.remove(cacheKey);
            }

            List<String> allLines = Files.readAllLines(path);
            int totalLines = allLines.size();

            if (totalLines > MAX_LINES_TO_READ && offset == 0 && !arguments.has("limit")) {
                throw new ToolExecutionException(
                    String.format("文件过大（%d 行），超过最大读取限制（%d 行）。\n" +
                    "请使用 offset 和 limit 参数分段读取。\n" +
                    "示例: offset=0, limit=%d 读取前 %d 行",
                    totalLines, MAX_LINES_TO_READ, MAX_LINES_TO_READ, MAX_LINES_TO_READ)
                );
            }

            int actualOffset = Math.min(offset, totalLines);
            int actualLimit = Math.min(limit, totalLines - actualOffset);
            
            String content;
            boolean isPartialRead = actualLimit < totalLines;

            if (isPartialRead) {
                int end = Math.min(actualOffset + actualLimit, totalLines);
                content = String.join("\n", allLines.subList(actualOffset, end));
            } else {
                content = String.join("\n", allLines);
            }

            long lastModified = Files.getLastModifiedTime(path).toMillis();
            if (offset == 0 && limit == MAX_LINES_TO_READ) {
                evictIfNeeded();
                fileCache.put(cacheKey, new FileCacheEntry(content, lastModified, System.currentTimeMillis()));
            }
            
            String relativePath = PathSecurityUtils.getRelativePath(path);

            StringBuilder result = new StringBuilder();
            result.append("文件内容 (").append(relativePath);
            if (isPartialRead) {
                result.append(", 行 ").append(actualOffset + 1).append("-").append(actualOffset + actualLimit);
            }
            result.append("):\n");
            result.append("<file_content>\n");
            result.append(content);
            result.append("\n</file_content>\n");
            result.append("(").append(content.length()).append(" 字符, 文件共 ").append(totalLines).append(" 行");
            if (isPartialRead) {
                result.append(", 已读取 ").append(actualOffset + 1).append("-").append(actualOffset + actualLimit).append(" 行");
                result.append("\n提示: 使用 offset/limit 参数继续读取其他部分");
            }
            if (!content.endsWith("\n")) {
                result.append(", 文件末尾无换行符");
            }
            result.append(")\n");

            return result.toString();

        } catch (IOException e) {
            throw new ToolExecutionException("读取文件失败: " + e.getMessage(), e);
        }
    }

    public void invalidateCache(String filePath) {
        String cacheKey = normalizeCacheKey(filePath);
        fileCache.remove(cacheKey);
        logger.debug("缓存失效: {}", filePath);
    }

    public void clearCache() {
        int size = fileCache.size();
        fileCache.clear();
        logger.info("清空文件缓存，共清除 {} 个条目", size);
    }

    public int getCacheSize() {
        return fileCache.size();
    }

    public static void markRecentEditFailure(String filePath) {
        String cacheKey = normalizeCacheKey(filePath);
        recentEditFailures.put(cacheKey, Instant.now());
        logger.info("记录编辑失败: {} (30秒内读取将返回完整内容)", filePath);
    }

    public static boolean hasRecentEditFailure(String filePath) {
        String cacheKey = normalizeCacheKey(filePath);
        Instant failureTime = recentEditFailures.get(cacheKey);
        if (failureTime == null) {
            return false;
        }

        long elapsed = Instant.now().toEpochMilli() - failureTime.toEpochMilli();
        if (elapsed > EDIT_FAILURE_WINDOW_MS) {
            recentEditFailures.remove(cacheKey);
            return false;
        }

        return true;
    }
}
