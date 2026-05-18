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

public class EditFileTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(EditFileTool.class);
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;

    public EditFileTool() {
    }

    @Override
    public String getName() {
        return "edit_file";
    }

    @Override
    public String getDescription() {
        return "精确替换文件中的文本内容。通过查找并替换指定的文本片段来编辑文件。" +
               "要求 old_text 必须在文件中唯一匹配，否则会报错。" +
               "比 write_file 更安全，适合精确修改代码片段。只能编辑项目目录内的文件。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要编辑的文件路径（绝对路径或相对路径）"
                    },
                    "old_text": {
                        "type": "string",
                        "description": "要被替换的文本（必须在文件中唯一匹配）"
                    },
                    "new_text": {
                        "type": "string",
                        "description": "替换后的新文本"
                    }
                },
                "required": ["path", "old_text", "new_text"]
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
        if (!arguments.has("old_text") || arguments.get("old_text").isNull()) {
            throw new ToolExecutionException("缺少必需参数: old_text");
        }
        if (!arguments.has("new_text") || arguments.get("new_text").isNull()) {
            throw new ToolExecutionException("缺少必需参数: new_text");
        }

        String filePath = arguments.get("path").asText();
        if (filePath == null || filePath.trim().isEmpty()) {
            throw new ToolExecutionException("path 参数不能为空");
        }
        
        String oldText = arguments.get("old_text").asText();
        String newText = arguments.get("new_text").asText();

        if (oldText == null || oldText.isEmpty()) {
            throw new ToolExecutionException("old_text 不能为空");
        }

        Path path = PathSecurityUtils.validateAndResolve(filePath);

        if (!Files.exists(path)) {
            throw new ToolExecutionException("文件不存在: " + filePath);
        }

        if (!Files.isRegularFile(path)) {
            throw new ToolExecutionException("不是常规文件: " + filePath);
        }

        if (!Files.isReadable(path)) {
            throw new ToolExecutionException("文件不可读: " + filePath);
        }

        if (!Files.isWritable(path)) {
            throw new ToolExecutionException("文件不可写: " + filePath);
        }

        try {
            long fileSize = Files.size(path);
            if (fileSize > MAX_FILE_SIZE) {
                throw new ToolExecutionException(
                    String.format("文件过大（%d 字节），最大支持 %d 字节（10MB）", fileSize, MAX_FILE_SIZE));
            }
            
            String content = Files.readString(path, StandardCharsets.UTF_8);
            
            int firstIndex = content.indexOf(oldText);
            String adjustmentNote = "";
            if (firstIndex == -1) {
                String adjusted = tryAdjustMatching(content, oldText);
                if (adjusted != null) {
                    adjustmentNote = String.format("\n✅ 智能修正：old_text 从 %d 字符调整为 %d 字符（移除了末尾不匹配的空白/换行）",
                        oldText.length(), adjusted.length());
                    logger.debug("智能修正匹配成功：{}", adjustmentNote);
                    oldText = adjusted;
                    firstIndex = content.indexOf(oldText);
                }
            }
            
            if (firstIndex == -1) {
                String diagnosis = diagnoseMismatch(content, oldText);
                ReadFileTool.markRecentEditFailure(filePath);
                throw new ToolExecutionException(
                    "未找到要替换的文本。\n" +
                    diagnosis
                );
            }

            int lastIndex = content.lastIndexOf(oldText);
            if (firstIndex != lastIndex) {
                int count = countOccurrences(content, oldText);
                ReadFileTool.markRecentEditFailure(filePath);
                throw new ToolExecutionException(
                    String.format(
                        "要替换的文本在文件中出现 %d 次，必须唯一匹配才能替换。\n" +
                        "请提供更多上下文使其唯一，或使用更精确的文本片段。",
                        count
                    )
                );
            }

            String newContent = content.substring(0, firstIndex) + newText + content.substring(firstIndex + oldText.length());
            
            Files.writeString(path, newContent, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING);

            FileChangeTracker.recordChange(
                path.toAbsolutePath().toString(),
                content,
                newContent,
                "edit_file"
            );

            String absolutePath = path.toAbsolutePath() != null ? path.toAbsolutePath().toString() : path.toString();
            String relativePath = PathSecurityUtils.getRelativePath(path);


            
            return formatResult(relativePath, oldText, newText, content, newContent, adjustmentNote);
            
        } catch (IOException e) {
            throw new ToolExecutionException("编辑文件失败: " + e.getMessage(), e);
        }
    }

    private int countOccurrences(String text, String substring) {
        if (substring == null || substring.isEmpty()) {
            return 0;
        }
        int count = 0;
        int index = 0;
        while ((index = text.indexOf(substring, index)) != -1) {
            count++;
            index += substring.length();
        }
        return count;
    }

    private String formatResult(String filePath, String oldText, String newText, String oldContent, String newContent, String adjustmentNote) {
        StringBuilder result = new StringBuilder();
        
        result.append("文件编辑成功\n");
        result.append("<edit_result>\n");
        result.append("文件: ").append(filePath).append("\n");
        if (adjustmentNote != null && !adjustmentNote.isEmpty()) {
            result.append(adjustmentNote).append("\n");
        }
        result.append("</edit_result>\n");
        
        int oldLines = oldText.split("\n", -1).length;
        int newLines = newText.split("\n", -1).length;
        
        result.append("替换统计:\n");
        result.append(String.format("  - 原文本: %d 行, %d 字符\n", oldLines, oldText.length()));
        result.append(String.format("  - 新文本: %d 行, %d 字符\n", newLines, newText.length()));
        result.append(String.format("  - 文件总大小: %d → %d 字符 (变化: %+d)\n", 
            oldContent.length(), newContent.length(), newContent.length() - oldContent.length()));
        
        result.append("\n<replacement_preview>\n");
        
        result.append("\n❌ 原文本:\n");
        result.append(formatTextBlock(oldText));
        
        result.append("\n✅ 新文本:\n");
        result.append(formatTextBlock(newText));
        
        result.append("</replacement_preview>\n");
        
        return result.toString();
    }

    private String formatTextBlock(String text) {
        if (text.isEmpty()) {
            return "  (空文本)\n";
        }
        
        StringBuilder sb = new StringBuilder();
        String[] lines = text.split("\n", -1);
        
        for (int i = 0; i < lines.length; i++) {
            sb.append("  ").append(i + 1).append(": ").append(lines[i]).append("\n");
        }
        
        return sb.toString();
    }

    private String tryAdjustMatching(String content, String oldText) {
        String trimmed = oldText.stripTrailing();
        if (!trimmed.equals(oldText) && content.contains(trimmed)) {
            return trimmed;
        }
        
        String trimmedBoth = oldText.strip();
        if (!trimmedBoth.equals(oldText) && content.contains(trimmedBoth)) {
            return trimmedBoth;
        }
        
        String noTrailingNewline = oldText.replaceAll("[\\r\\n]+$", "");
        if (!noTrailingNewline.equals(oldText) && content.contains(noTrailingNewline)) {
            return noTrailingNewline;
        }
        
        String withNewline = oldText + "\n";
        if (content.contains(withNewline)) {
            return withNewline;
        }
        
        return null;
    }

    private String diagnoseMismatch(String content, String oldText) {
        StringBuilder sb = new StringBuilder();
        
        String partial = findLongestMatchingSuffix(content, oldText);
        if (partial != null && partial.length() > 10) {
            int matchPos = content.indexOf(partial);
            
            String[] contentLines = content.split("\n", -1);
            String[] oldLines = oldText.split("\n", -1);
            String[] partialLines = partial.split("\n", -1);
            
            int contentStartLine = 0;
            int charCount = 0;
            for (int i = 0; i < contentLines.length; i++) {
                if (charCount + contentLines[i].length() + (i > 0 ? 1 : 0) > matchPos) {
                    contentStartLine = i;
                    break;
                }
                charCount += contentLines[i].length() + (i > 0 ? 1 : 0);
            }
            
            int oldStartLine = 0;
            for (int i = 0; i < oldLines.length; i++) {
                if (oldLines[i].contains(partialLines[0].trim())) {
                    oldStartLine = i;
                    break;
                }
            }
            
            int contextLines = 4;
            int contentEndLine = Math.min(contentLines.length, contentStartLine + partialLines.length + contextLines);
            int oldEndLine = Math.min(oldLines.length, oldStartLine + partialLines.length + contextLines);
            
            int maxLines = Math.max(contentEndLine - contentStartLine, oldEndLine - oldStartLine);
            
            sb.append("EditMismatchError: old_text 与文件内容不匹配。\n\n");
            
            sb.append("文件中匹配位置附近的内容:\n");
            sb.append("┌─────────────────────────────────────────────────\n");
            for (int i = contentStartLine; i < contentEndLine; i++) {
                boolean matched = (i - contentStartLine) < partialLines.length;
                sb.append(String.format("%s %5d: %s\n", matched ? "│>" : "│ ", i + 1, contentLines[i]));
            }
            sb.append("└─────────────────────────────────────────────────\n");
            
            sb.append("\n你提供的 old_text:\n");
            sb.append("┌─────────────────────────────────────────────────\n");
            for (int i = oldStartLine; i < oldEndLine; i++) {
                boolean matched = (i - oldStartLine) < partialLines.length && i < oldLines.length;
                sb.append(String.format("%s %5d: %s\n", matched ? "│>" : "│ ", i + 1, oldLines[i]));
            }
            sb.append("└─────────────────────────────────────────────────\n");
            
            sb.append("\n│> 标注的行 = 已成功匹配的行，未标注 = 匹配失败的行\n");
            sb.append(String.format("已匹配前 %d 行（%d 字符），差异出现在 old_text 第 %d 行附近。\n",
                partialLines.length, partial.length(), oldStartLine + partialLines.length + 1));
        } else {
            sb.append("EditMismatchError: old_text 与文件内容差异过大，无法自动定位匹配位置。\n");
        }

        return sb.toString();
    }

    private String findLongestMatchingSuffix(String content, String oldText) {
        for (int i = oldText.length() - 1; i >= 10; i--) {
            String prefix = oldText.substring(0, i);
            if (content.contains(prefix)) {
                return prefix;
            }
        }
        return null;
    }
}
