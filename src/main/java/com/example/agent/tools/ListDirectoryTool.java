package com.example.agent.tools;

import com.example.agent.tools.filter.FileFilter;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class ListDirectoryTool implements ToolExecutor {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final int DEFAULT_MAX_DEPTH = 3;
    private static final int MAX_RESULTS = 500;

    @Override
    public String getName() {
        return "list_directory";
    }

    @Override
    public String getDescription() {
        return "列出指定目录的内容。可以显示文件和子目录的详细信息，支持递归显示目录树。" +
               "用于了解项目结构、查找文件位置。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要列出的目录路径（绝对路径或相对路径，默认为项目根目录）"
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "是否递归列出子目录（默认 false）",
                        "default": false
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "递归的最大深度（默认 3，最大 5）",
                        "default": 3,
                        "minimum": 1,
                        "maximum": 5
                    },
                    "show_hidden": {
                        "type": "boolean",
                        "description": "是否显示隐藏文件（以 . 开头的文件，默认 false）",
                        "default": false
                    },
                    "respect_gitignore": {
                        "type": "boolean",
                        "description": "是否遵循 .gitignore 规则过滤文件（默认 true，设为 false 可显示被 .gitignore 忽略的文件）",
                        "default": true
                    }
                },
                "required": []
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        if (arguments.has("path")) {
            return Collections.singletonList(arguments.get("path").asText());
        }
        return Collections.singletonList(".");
    }

    @Override
    public boolean requiresFileLock() {
        return false;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        String directoryPath = ".";
        if (arguments.has("path") && !arguments.get("path").isNull()) {
            String pathValue = arguments.get("path").asText();
            if (pathValue != null && !pathValue.trim().isEmpty()) {
                directoryPath = pathValue;
            }
        }
        
        boolean recursive = arguments.has("recursive") && 
                           !arguments.get("recursive").isNull() && 
                           arguments.get("recursive").asBoolean();
        
        int maxDepth = DEFAULT_MAX_DEPTH;
        if (arguments.has("max_depth") && !arguments.get("max_depth").isNull()) {
            maxDepth = arguments.get("max_depth").asInt();
        }
        
        boolean showHidden = arguments.has("show_hidden") && 
                            !arguments.get("show_hidden").isNull() && 
                            arguments.get("show_hidden").asBoolean();

        boolean respectGitignore = !arguments.has("respect_gitignore")
                || arguments.get("respect_gitignore").isNull()
                || arguments.get("respect_gitignore").asBoolean(true);

        maxDepth = Math.max(1, Math.min(5, maxDepth));

        Path path = PathSecurityUtils.validateAndResolve(directoryPath);

        if (!Files.exists(path)) {
            throw new ToolExecutionException("目录不存在: " + directoryPath);
        }

        if (!Files.isDirectory(path)) {
            throw new ToolExecutionException("不是目录: " + directoryPath);
        }

        if (!Files.isReadable(path)) {
            throw new ToolExecutionException("目录不可读: " + directoryPath);
        }

        try {
            FileFilter fileFilter = respectGitignore
                    ? new FileFilter(path)
                    : FileFilter.withoutGitignore(path);

            String relativePath = PathSecurityUtils.getRelativePath(path);
            
            if (recursive) {
                return listRecursively(path, relativePath, maxDepth, showHidden, fileFilter);
            } else {
                return listFlat(path, relativePath, showHidden, fileFilter);
            }
        } catch (IOException e) {
            throw new ToolExecutionException("列出目录失败: " + e.getMessage(), e);
        }
    }

    private String listFlat(Path directory, String relativePath, boolean showHidden, FileFilter fileFilter) throws IOException {
        StringBuilder result = new StringBuilder();
        result.append("目录内容: ").append(relativePath).append("\n");
        result.append("─────────────────────────────────────────────────────────────\n");

        try (Stream<Path> stream = Files.list(directory)) {
            List<Path> entries = stream
                .filter(p -> showHidden || !p.getFileName().toString().startsWith("."))
                .filter(p -> fileFilter.shouldList(p))
                .sorted((a, b) -> {
                    boolean aIsDir = Files.isDirectory(a);
                    boolean bIsDir = Files.isDirectory(b);
                    if (aIsDir && !bIsDir) return -1;
                    if (!aIsDir && bIsDir) return 1;
                    return a.getFileName().toString().compareToIgnoreCase(b.getFileName().toString());
                })
                .limit(MAX_RESULTS)
                .collect(Collectors.toList());

            if (entries.isEmpty()) {
                result.append("  (空目录)\n");
            } else {
                int fileCount = 0;
                int dirCount = 0;
                long totalSize = 0;

                for (Path entry : entries) {
                    String name = entry.getFileName().toString();
                    boolean isDir = Files.isDirectory(entry);
                    
                    if (isDir) {
                        dirCount++;
                        result.append("  📁 ").append(name).append("/\n");
                    } else {
                        fileCount++;
                        long size = Files.size(entry);
                        totalSize += size;
                        String sizeStr = formatSize(size);
                        
                        BasicFileAttributes attrs = Files.readAttributes(entry, BasicFileAttributes.class);
                        String modTime = formatTime(attrs.lastModifiedTime());
                        
                        result.append("  📄 ").append(String.format("%-40s", name))
                              .append("  ").append(String.format("%8s", sizeStr))
                              .append("  ").append(modTime).append("\n");
                    }
                }

                result.append("─────────────────────────────────────────────────────────────\n");
                result.append(String.format("统计: %d 个目录, %d 个文件, 总大小: %s\n", 
                    dirCount, fileCount, formatSize(totalSize)));
                
                if (entries.size() >= MAX_RESULTS) {
                    result.append("⚠️  结果已截断（最多显示 ").append(MAX_RESULTS).append(" 项）\n");
                }
            }
        }

        return result.toString();
    }

    private String listRecursively(Path directory, String relativePath, int maxDepth, boolean showHidden, FileFilter fileFilter) throws IOException {
        StringBuilder result = new StringBuilder();
        result.append("目录树: ").append(relativePath).append("\n");
        result.append("─────────────────────────────────────────────────────────────\n");

        int[] count = new int[2];
        int[] totalItems = {0};
        
        buildTree(directory, "", result, 0, maxDepth, showHidden, count, totalItems, fileFilter);

        result.append("─────────────────────────────────────────────────────────────\n");
        result.append(String.format("统计: %d 个目录, %d 个文件\n", count[0], count[1]));
        
        if (totalItems[0] >= MAX_RESULTS) {
            result.append("⚠️  结果已截断（最多显示 ").append(MAX_RESULTS).append(" 项）\n");
        }

        return result.toString();
    }

    private void buildTree(Path path, String prefix, StringBuilder result, int depth, int maxDepth, 
                          boolean showHidden, int[] count, int[] totalItems, FileFilter fileFilter) throws IOException {
        if (depth > maxDepth || totalItems[0] >= MAX_RESULTS) {
            return;
        }

        try (Stream<Path> stream = Files.list(path)) {
            List<Path> entries = stream
                .filter(p -> showHidden || !p.getFileName().toString().startsWith("."))
                .filter(p -> fileFilter.shouldList(p))
                .sorted((a, b) -> {
                    boolean aIsDir = Files.isDirectory(a);
                    boolean bIsDir = Files.isDirectory(b);
                    if (aIsDir && !bIsDir) return -1;
                    if (!aIsDir && bIsDir) return 1;
                    return a.getFileName().toString().compareToIgnoreCase(b.getFileName().toString());
                })
                .collect(Collectors.toList());

            for (int i = 0; i < entries.size() && totalItems[0] < MAX_RESULTS; i++) {
                Path entry = entries.get(i);
                String name = entry.getFileName().toString();
                boolean isLast = (i == entries.size() - 1);
                boolean isDir = Files.isDirectory(entry);

                String connector = isLast ? "└─ " : "├─ ";
                String icon = isDir ? "📁 " : "📄 ";
                
                result.append(prefix).append(connector).append(icon).append(name);
                if (isDir) {
                    result.append("/");
                }
                result.append("\n");

                totalItems[0]++;
                if (isDir) {
                    count[0]++;
                } else {
                    count[1]++;
                }

                if (isDir && depth < maxDepth) {
                    String newPrefix = prefix + (isLast ? "   " : "│  ");
                    buildTree(entry, newPrefix, result, depth + 1, maxDepth, showHidden, count, totalItems, fileFilter);
                }
            }
        }
    }

    private String formatSize(long bytes) {
        if (bytes < 1024) {
            return bytes + "B";
        } else if (bytes < 1024 * 1024) {
            return String.format("%.1fKB", bytes / 1024.0);
        } else if (bytes < 1024 * 1024 * 1024) {
            return String.format("%.1fMB", bytes / (1024.0 * 1024));
        } else {
            return String.format("%.1fGB", bytes / (1024.0 * 1024 * 1024));
        }
    }

    private String formatTime(FileTime fileTime) {
        LocalDateTime dateTime = LocalDateTime.ofInstant(
            fileTime.toInstant(), ZoneId.systemDefault()
        );
        return dateTime.format(TIME_FORMATTER);
    }
}
