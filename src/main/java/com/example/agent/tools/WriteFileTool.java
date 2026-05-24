package com.example.agent.tools;


import com.example.agent.snapshot.FileSnapshotManager;
import com.example.agent.web.server.DashboardServer;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public class WriteFileTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(WriteFileTool.class);
    private static final long MAX_CONTENT_SIZE = 10 * 1024 * 1024;

    public WriteFileTool() {
    }

    @Override
    public String getName() {
        return "write_file";
    }

    @Override
    public String getDescription() {
        return "将内容写入指定路径的文件。如果文件不存在则创建，如果存在则覆盖。只能访问项目目录内的文件。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要写入的文件路径（绝对路径或相对路径，只能访问项目目录内）"
                    },
                    "content": {
                        "type": "string",
                        "description": "要写入文件的内容"
                    }
                },
                "required": ["path", "content"]
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
        if (!arguments.has("content") || arguments.get("content").isNull()) {
            throw new ToolExecutionException("缺少必需参数: content");
        }

        String filePath = arguments.get("path").asText();
        if (filePath == null || filePath.trim().isEmpty()) {
            throw new ToolExecutionException("path 参数不能为空");
        }
        
        String content = arguments.get("content").asText();
        if (content == null) {
            content = "";
        }
        
        if (content.length() > MAX_CONTENT_SIZE) {
            throw new ToolExecutionException(
                String.format("内容过大（%d 字符），最大支持 %d 字符（10MB）", 
                    content.length(), MAX_CONTENT_SIZE));
        }

        Path path = PathSecurityUtils.validateAndResolve(filePath);

        try {
            Path parentDir = path.getParent();
            if (parentDir != null && !Files.exists(parentDir)) {
                Files.createDirectories(parentDir);
            }

            boolean fileExisted = Files.exists(path);
            String originalContent = "";
            if (fileExisted) {
                originalContent = Files.readString(path, StandardCharsets.UTF_8);
            }

            Files.writeString(path, content, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING);

            FileChangeTracker.recordChange(
                path.toAbsolutePath().toString(),
                originalContent,
                content,
                "write_file",
                !fileExisted
            );
            FileSnapshotManager.trackCurrentSessionFile(path.toAbsolutePath().toString(), !fileExisted);

            String absolutePath = path.toAbsolutePath() != null ? path.toAbsolutePath().toString() : path.toString();
            String relativePath = PathSecurityUtils.getRelativePath(path);
            String normalizedPath = relativePath.replace('\\', '/');
            String action = fileExisted ? "覆盖" : "创建";

            // 如果写入的是记忆文件，广播 SSE 事件
            if (normalizedPath.contains(".hippo/memory/") && !normalizedPath.endsWith("MEMORY.md")) {
                String memoryType = extractMemoryType(normalizedPath);
                String broadcastData = "{\"id\":\"" + UUID.randomUUID() + "\",\"type\":\"" + memoryType + "\",\"path\":\"" + normalizedPath + "\"}";
                DashboardServer.broadcast("memory_saved", broadcastData);
                logger.info("SSE 广播：记忆文件已写入 {}", normalizedPath);
            }

            return String.format("文件%s成功: %s (%d 字符)", action, relativePath, content.length());
        } catch (IOException e) {
            throw new ToolExecutionException("写入文件失败: " + e.getMessage(), e);
        }
    }

    /**
     * 从记忆文件路径中提取类型
     * 例如：.hippo/memory/user_preference_react.md -> user_preference
     */
    private String extractMemoryType(String relativePath) {
        String fileName = Path.of(relativePath).getFileName().toString();
        // 移除 .md 后缀
        if (fileName.endsWith(".md")) {
            fileName = fileName.substring(0, fileName.length() - 3);
        }
        // 提取类型部分（假设格式为 type_topic.md）
        int underscoreIndex = fileName.indexOf('_');
        if (underscoreIndex > 0) {
            return fileName.substring(0, underscoreIndex);
        }
        return "unknown";
    }
}
