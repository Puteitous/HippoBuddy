package com.example.agent.tools;

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

public class UndoFileTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(UndoFileTool.class);

    public UndoFileTool() {
    }

    @Override
    public String getName() {
        return "undo_file";
    }

    @Override
    public String getDescription() {
        return "撤销对文件的最近一次编辑操作。每次调用撤回到上一个版本，" +
               "多次调用可逐级回退。只能撤销当前会话中使用 edit_file 或 write_file 的修改。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要撤销的文件路径（绝对路径或相对路径）"
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

        if (!Files.exists(path)) {
            throw new ToolExecutionException("文件不存在: " + filePath);
        }

        boolean hasCrlf = false;
        try {
            String currentContent = Files.readString(path, StandardCharsets.UTF_8);
            hasCrlf = currentContent.contains("\r\n");
        } catch (IOException e) {
            logger.warn("读取文件行尾风格失败，跳过行尾还原: {}", e.getMessage());
        }

        boolean success = FileChangeTracker.rollback(path.toAbsolutePath().toString());
        if (!success) {
            return "没有可撤销的变更记录: " + filePath;
        }

        if (hasCrlf) {
            try {
                String restoredContent = Files.readString(path, StandardCharsets.UTF_8);
                if (!restoredContent.contains("\r\n")) {
                    String crlfContent = restoredContent.replace("\n", "\r\n");
                    Files.writeString(path, crlfContent, StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
                }
            } catch (IOException e) {
                logger.warn("回滚后行尾还原失败: {}", e.getMessage());
            }
        }

        String relativePath = PathSecurityUtils.getRelativePath(path);
        logger.info("已撤销文件编辑: {}", relativePath);
        return "已撤销文件编辑: " + relativePath;
    }
}
