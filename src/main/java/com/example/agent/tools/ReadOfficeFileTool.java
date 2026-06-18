package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 读取 Office 二进制文件内容（XLSX / XLS / DOCX），
 * 输出 Markdown 格式文本供 LLM 消费。
 * <p>
 * 不支持：旧版 .doc 格式（需 poi-scratchpad）、PPTX。
 * CSV 请使用 read_file 工具。
 */
public class ReadOfficeFileTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(ReadOfficeFileTool.class);

    private static final int MAX_ROWS = 1000;
    private static final int MAX_SHEETS = 3;
    private static final long MAX_FILE_SIZE = 50L * 1024 * 1024; // 50MB

    @Override
    public String getName() {
        return "read_office_file";
    }

    @Override
    public String getDescription() {
        return "读取 Office 二进制文件的内容（XLSX/XLS/DOCX），返回 Markdown 格式文本。"
                + "表格文件输出为 Markdown 表格，Word 文档保留标题层级。";
    }

    @Override
    public String getParametersSchema() {
        return """
                {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "要读取的 Office 文件路径（绝对路径或相对路径，只能访问项目目录内）"
                        },
                        "max_rows": {
                            "type": "integer",
                            "description": "每个 sheet 最多读取行数（默认 1000，仅对 XLSX/XLS 有效）"
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
        if (!arguments.has("path") || arguments.get("path").isNull()) {
            throw new ToolExecutionException("缺少必需参数: path");
        }

        String filePath = arguments.get("path").asText().trim();
        if (filePath.isEmpty()) {
            throw new ToolExecutionException("path 参数不能为空");
        }

        Path path = PathSecurityUtils.validateAndResolve(filePath);

        if (!Files.exists(path)) {
            throw new ToolExecutionException("文件不存在: " + filePath);
        }
        if (!Files.isRegularFile(path) || !Files.isReadable(path)) {
            throw new ToolExecutionException("文件不可读或不是常规文件: " + filePath);
        }

        long fileSize;
        try {
            fileSize = Files.size(path);
        } catch (IOException e) {
            throw new ToolExecutionException("无法获取文件大小: " + e.getMessage(), e);
        }
        if (fileSize > MAX_FILE_SIZE) {
            throw new ToolExecutionException(
                    String.format("文件过大（%d 字节），最大支持 50MB", fileSize));
        }

        // 提取参数
        int maxRows = MAX_ROWS;
        if (arguments.has("max_rows") && !arguments.get("max_rows").isNull()) {
            maxRows = Math.min(MAX_ROWS, Math.max(1, arguments.get("max_rows").asInt()));
        }
        int sheetIndex = -1;
        if (arguments.has("sheet_index") && !arguments.get("sheet_index").isNull()) {
            sheetIndex = arguments.get("sheet_index").asInt();
        }

        String fileName = path.getFileName().toString().toLowerCase();

        try {
            if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
                return readSpreadsheet(path, fileName, maxRows, sheetIndex);
            } else if (fileName.endsWith(".docx")) {
                return readDocx(path, fileName);
            } else {
                throw new ToolExecutionException(
                        "不支持的文件格式: " + path.getFileName()
                        + "。仅支持 XLSX、XLS、DOCX 格式。");
            }
        } catch (ToolExecutionException e) {
            throw e;
        } catch (Exception e) {
            logger.error("ReadOfficeFileTool: 解析失败 {}", path, e);
            throw new ToolExecutionException(
                    "解析 Office 文件失败: " + e.getMessage()
                    + "\n该文件可能已损坏或格式不兼容。", e);
        }
    }

    // ==================== XLSX / XLS 解析 ====================

    private String readSpreadsheet(Path path, String fileName,
                                   int maxRows, int sheetIndex) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append("# ").append(escapeMd(fileName)).append("\n\n");

        try (var fis = new FileInputStream(path.toFile());
             var workbook = org.apache.poi.ss.usermodel.WorkbookFactory.create(fis)) {

            int sheetCount = workbook.getNumberOfSheets();
            if (sheetCount == 0) {
                sb.append("（空工作簿，无 sheet）\n");
                return sb.toString();
            }

            // sheet_index 越界检查
            if (sheetIndex >= sheetCount) {
                throw new ToolExecutionException(
                        "sheet_index 超出范围: " + sheetIndex
                        + "，该工作簿只有 " + sheetCount + " 个 sheet（索引 0~" + (sheetCount - 1) + "）。");
            }

            int sheetsToProcess;
            int[] sheetIndices;

            if (sheetIndex >= 0) {
                sheetsToProcess = 1;
                sheetIndices = new int[]{sheetIndex};
            } else {
                sheetsToProcess = Math.min(sheetCount, MAX_SHEETS);
                sheetIndices = new int[sheetsToProcess];
                for (int i = 0; i < sheetsToProcess; i++) {
                    sheetIndices[i] = i;
                }
            }

            // 如果有多余的 sheet 且没指定索引，列出名称
            if (sheetIndex < 0 && sheetCount > MAX_SHEETS) {
                sb.append("> 工作簿共 ").append(sheetCount).append(" 个 sheet，仅显示前 ")
                        .append(MAX_SHEETS).append(" 个。\n");
                sb.append("> 可用 sheet 列表：\n");
                for (int i = 0; i < sheetCount; i++) {
                    sb.append(">   - `").append(i).append("`: ")
                            .append(escapeMd(workbook.getSheetName(i))).append("\n");
                }
                sb.append("> 使用 `sheet_index` 参数可指定读取某个 sheet。\n\n");
            }

            for (int si : sheetIndices) {
                var sheet = workbook.getSheetAt(si);
                String sheetName = sheet.getSheetName();
                int lastRow = sheet.getLastRowNum(); // 0-based

                sb.append("## Sheet ").append(si).append(": ")
                        .append(escapeMd(sheetName)).append("\n\n");

                if (lastRow < 0) {
                    sb.append("（空 sheet）\n\n");
                    continue;
                }

                int rowCount = Math.min(lastRow + 1, maxRows);
                boolean truncated = lastRow + 1 > maxRows;

                // 解析所有行
                List<String[]> rows = new ArrayList<>();
                int maxCols = 0;

                for (int ri = 0; ri < rowCount; ri++) {
                    var row = sheet.getRow(ri);
                    if (row == null) {
                        rows.add(new String[0]);
                        continue;
                    }
                    int colCount = row.getLastCellNum(); // 1-based
                    maxCols = Math.max(maxCols, colCount);
                    String[] cells = new String[colCount];
                    for (int ci = 0; ci < colCount; ci++) {
                        var cell = row.getCell(ci);
                        if (cell != null) {
                            cells[ci] = getCellValue(cell);
                        } else {
                            cells[ci] = "";
                        }
                    }
                    rows.add(cells);
                }

                // 统一补齐列数
                for (int ri = 0; ri < rows.size(); ri++) {
                    String[] row = rows.get(ri);
                    if (row.length < maxCols) {
                        String[] padded = new String[maxCols];
                        System.arraycopy(row, 0, padded, 0, row.length);
                        rows.set(ri, padded);
                    }
                }

                if (maxCols == 0) {
                    sb.append("（空 sheet）\n\n");
                    continue;
                }

                // 输出 Markdown 表格
                // 表头（第一行）
                String[] header = rows.isEmpty() ? new String[maxCols] : rows.getFirst();
                sb.append("|");
                for (int ci = 0; ci < maxCols; ci++) {
                    sb.append(" ").append(escapeMdCell(ci < header.length ? header[ci] : "")).append(" |");
                }
                sb.append("\n|");
                for (int ci = 0; ci < maxCols; ci++) {
                    sb.append(" --- |");
                }
                sb.append("\n");

                // 数据行（从第二行开始）
                for (int ri = 1; ri < rows.size(); ri++) {
                    String[] row = rows.get(ri);
                    sb.append("|");
                    for (int ci = 0; ci < maxCols; ci++) {
                        sb.append(" ")
                                .append(escapeMdCell(ci < row.length ? row[ci] : ""))
                                .append(" |");
                    }
                    sb.append("\n");
                }

                if (truncated) {
                    sb.append("\n> 仅显示前 ").append(maxRows).append(" 行，共 ")
                            .append(lastRow + 1).append(" 行。\n");
                }
                sb.append("\n");
            }
        }

        sb.append("---\n");
        sb.append("> 文件: `").append(escapeMd(fileName)).append("`\n");

        return sb.toString();
    }

    /** 获取单元格的字符串值 */
    private static String getCellValue(org.apache.poi.ss.usermodel.Cell cell) {
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                if (org.apache.poi.ss.usermodel.DateUtil.isCellDateFormatted(cell)) {
                    try {
                        var date = cell.getDateCellValue();
                        yield new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(date);
                    } catch (Exception e) {
                        yield String.valueOf(cell.getNumericCellValue());
                    }
                } else {
                    double val = cell.getNumericCellValue();
                    if (val == Math.floor(val) && !Double.isInfinite(val)) {
                        yield String.valueOf((long) val);
                    } else {
                        yield String.valueOf(val);
                    }
                }
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try {
                    yield switch (cell.getCachedFormulaResultType()) {
                        case STRING -> cell.getStringCellValue();
                        case NUMERIC -> String.valueOf(cell.getNumericCellValue());
                        case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
                        default -> cell.getCellFormula();
                    };
                } catch (Exception e) {
                    yield cell.getCellFormula();
                }
            }
            case BLANK -> "";
            default -> "";
        };
    }

    // ==================== DOCX 解析 ====================

    private String readDocx(Path path, String fileName) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append("# ").append(escapeMd(fileName)).append("\n\n");

        int imageCount = 0;

        try (var fis = new FileInputStream(path.toFile());
             var doc = new org.apache.poi.xwpf.usermodel.XWPFDocument(fis)) {

            var bodyElements = doc.getBodyElements();
            for (var element : bodyElements) {
                if (element instanceof org.apache.poi.xwpf.usermodel.XWPFParagraph para) {
                    String text = para.getText().trim();
                    if (text.isEmpty()) {
                        continue;
                    }

                    // 判断标题层级
                    String style = para.getStyle();
                    int headingLevel = -1;

                    if (style != null) {
                        if (style.contains("Heading1") || style.contains("heading1")
                                || "1".equals(style)) {
                            headingLevel = 1;
                        } else if (style.contains("Heading2") || style.contains("heading2")
                                || "2".equals(style)) {
                            headingLevel = 2;
                        } else if (style.contains("Heading3") || style.contains("heading3")
                                || "3".equals(style)) {
                            headingLevel = 3;
                        } else if (style.contains("Heading4") || style.contains("heading4")
                                || "4".equals(style)) {
                            headingLevel = 4;
                        } else if (style.contains("Heading5") || style.contains("heading5")
                                || "5".equals(style)) {
                            headingLevel = 5;
                        } else if (style.contains("Title") || style.contains("Subtitle")) {
                            headingLevel = 1;
                        }
                    }

                    if (headingLevel > 0) {
                        sb.append("#".repeat(headingLevel)).append(" ")
                                .append(escapeMd(text)).append("\n\n");
                    } else {
                        sb.append(escapeMd(text)).append("\n\n");
                    }

                } else if (element instanceof org.apache.poi.xwpf.usermodel.XWPFTable table) {
                    // 简单输出表格为 Markdown
                    var rows = table.getRows();
                    if (rows.isEmpty()) continue;

                    for (int ri = 0; ri < Math.min(rows.size(), 20); ri++) {
                        var row = rows.get(ri);
                        var cells = row.getTableCells();
                        sb.append("|");
                        for (var cell : cells) {
                            sb.append(" ").append(escapeMdCell(cell.getText().trim())).append(" |");
                        }
                        sb.append("\n");
                        if (ri == 0) {
                            sb.append("|");
                            for (var cell : row.getTableCells()) {
                                sb.append(" --- |");
                            }
                            sb.append("\n");
                        }
                    }
                    if (rows.size() > 20) {
                        sb.append("> 表格共 ").append(rows.size()).append(" 行，仅显示前 20 行。\n");
                    }
                    sb.append("\n");
                }
            }

            // 统计图片
            var pictures = doc.getAllPictures();
            imageCount = pictures.size();
        }

        if (imageCount > 0) {
            sb.append("> 该文档中包含约 ").append(imageCount)
                    .append(" 张图片，已忽略其内容。\n");
        }

        sb.append("---\n");
        sb.append("> 文件: `").append(escapeMd(fileName)).append("`\n");

        return sb.toString();
    }

    // ==================== 工具方法 ====================

    /** 转义 Markdown 特殊字符（避免破坏标题/段落结构） */
    private static String escapeMd(String text) {
        if (text == null) return "";
        // 只转义会破坏 Markdown 结构的字符
        return text.replace("\\", "\\\\")
                .replace("`", "\\`");
    }

    /** 转义 Markdown 表格单元格内容（主要是管道符和换行） */
    private static String escapeMdCell(String text) {
        if (text == null) return "";
        return text.replace("|", "\\|")
                .replace("\n", "<br>")
                .replace("\r", "");
    }
}
