package com.example.agent.tools;

import com.example.agent.tools.office.*;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 读取 Office 二进制文件和 CSV 文件内容的路由工具。
 * <p>
 * 各格式的解析逻辑分别委托给 {@code office/} 包下的专用 Parser：
 * <ul>
 *   <li>XLSX/XLS → {@link SpreadsheetParser}</li>
 *   <li>CSV → {@link CsvParser}</li>
 *   <li>DOCX → {@link DocxParser}</li>
 *   <li>PPTX → {@link PptxParser}</li>
 * </ul>
 * 不支持旧版 .doc 格式（需 poi-scratchpad）。
 */
public class ReadOfficeFileTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(ReadOfficeFileTool.class);

    static final int MAX_ROWS = 1000;
    static final long MAX_FILE_SIZE = 50L * 1024 * 1024; // 50MB

    private final SpreadsheetParser spreadsheetParser = new SpreadsheetParser();
    private final CsvParser csvParser = new CsvParser();
    private final DocxParser docxParser = new DocxParser();
    private final PptxParser pptxParser = new PptxParser();

    @Override
    public String getName() {
        return "read_office_file";
    }

    @Override
    public String getDescription() {
        return "读取 Office 文件（XLSX/XLS/DOCX/PPTX）和 CSV 文件的内容，返回 Markdown 格式文本。"
                + "表格文件输出为 Markdown 表格，Word 文档保留标题层级，PPTX 按幻灯片提取文字。"
                + "CSV 文件自动检测编码（UTF-8 / GBK）。";
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
                        "max_rows": {
                            "type": "integer",
                            "description": "最多读取行数（默认 1000，仅对 XLSX/XLS/CSV 有效）"
                        },
                        "sheet_index": {
                            "type": "integer",
                            "description": "Sheet 索引（从 0 开始，默认 -1 表示读取所有 sheet，仅对 XLSX/XLS 有效）"
                        }
                    },
                    "required": ["path"]
                }
                """;
    }

    @Override
    public boolean requiresFileLock() {
        return true;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        String filePath = extractPath(arguments);
        Path path = PathSecurityUtils.validateAndResolve(filePath);
        validateFile(path, filePath);

        int maxRows = parseMaxRows(arguments);
        int sheetIndex = parseSheetIndex(arguments);

        String fileName = path.getFileName().toString().toLowerCase();

        try {
            return switch (resolveFormat(fileName)) {
                case SPREADSHEET -> spreadsheetParser.parse(path, fileName, maxRows, sheetIndex);
                case CSV -> csvParser.parse(path, fileName, maxRows);
                case DOCX -> docxParser.parse(path, fileName);
                case PPTX -> pptxParser.parse(path, fileName);
            };
        } catch (ToolExecutionException e) {
            throw e;
        } catch (Exception e) {
            logger.error("ReadOfficeFileTool: 解析失败 {}", path, e);
            throw new ToolExecutionException(
                    "解析文件失败: " + e.getMessage()
                    + "\n该文件可能已损坏或格式不兼容。", e);
        }
    }

    // ==================== 内部枚举与路由 ====================

    private enum Format { SPREADSHEET, CSV, DOCX, PPTX }

    private Format resolveFormat(String fileName) {
        if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) return Format.SPREADSHEET;
        if (fileName.endsWith(".csv")) return Format.CSV;
        if (fileName.endsWith(".docx")) return Format.DOCX;
        if (fileName.endsWith(".pptx")) return Format.PPTX;
        throw new IllegalArgumentException(
                "不支持的文件格式。仅支持 XLSX、XLS、CSV、DOCX、PPTX 格式。");
    }

    // ==================== 参数提取与验证 ====================

    private String extractPath(JsonNode args) throws ToolExecutionException {
        if (!args.has("path") || args.get("path").isNull()) {
            throw new ToolExecutionException("缺少必需参数: path");
        }
        String path = args.get("path").asText().trim();
        if (path.isEmpty()) {
            throw new ToolExecutionException("path 参数不能为空");
        }
        return path;
    }

    private void validateFile(Path path, String filePath) throws ToolExecutionException {
        if (!Files.exists(path)) {
            throw new ToolExecutionException("文件不存在: " + filePath);
        }
        if (!Files.isRegularFile(path) || !Files.isReadable(path)) {
            throw new ToolExecutionException("文件不可读或不是常规文件: " + filePath);
        }

        try {
            long fileSize = Files.size(path);
            if (fileSize > MAX_FILE_SIZE) {
                throw new ToolExecutionException(
                        String.format("文件过大（%d 字节），最大支持 50MB", fileSize));
            }
        } catch (IOException e) {
            throw new ToolExecutionException("无法获取文件大小: " + e.getMessage(), e);
        }
    }

    private int parseMaxRows(JsonNode args) throws ToolExecutionException {
        if (args.has("max_rows") && !args.get("max_rows").isNull()) {
            int rows = args.get("max_rows").asInt();
            if (rows <= 0) {
                throw new ToolExecutionException("max_rows 必须大于 0，实际值: " + rows);
            }
            return Math.min(MAX_ROWS, rows);
        }
        return MAX_ROWS;
    }

    private int parseSheetIndex(JsonNode args) throws ToolExecutionException {
        if (args.has("sheet_index") && !args.get("sheet_index").isNull()) {
            int idx = args.get("sheet_index").asInt();
            if (idx < -1) {
                throw new ToolExecutionException("sheet_index 不能小于 -1（-1 表示不指定），实际值: " + idx);
            }
            return idx;
        }
        return -1;
    }
}
