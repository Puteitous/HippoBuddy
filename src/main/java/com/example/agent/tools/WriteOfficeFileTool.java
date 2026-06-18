package com.example.agent.tools;

import com.example.agent.snapshot.FileSnapshotManager;
import com.example.agent.tools.office.*;
import com.example.agent.tools.office.PptxWriter.SlideDef;
import com.example.agent.tools.office.PptxWriter.SlideDef.TableDef;
import com.example.agent.tools.office.SpreadsheetWriter.SheetDef;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 写入 Office 文件和 CSV 文件的工具。
 * <p>
 * 与 {@link ReadOfficeFileTool} 对称，支持创建和覆盖（edit）XLSX / CSV / DOCX / PPTX 格式。
 * <p>
 * 各格式的写入逻辑分别委托给 {@code office/} 包下的专用 Writer：
 * <ul>
 *   <li>XLSX → {@link SpreadsheetWriter}</li>
 *   <li>CSV → {@link CsvWriter}</li>
 *   <li>DOCX → {@link DocxWriter}</li>
 *   <li>PPTX → {@link PptxWriter}</li>
 * </ul>
 */
public class WriteOfficeFileTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(WriteOfficeFileTool.class);

    private final SpreadsheetWriter spreadsheetWriter = new SpreadsheetWriter();
    private final CsvWriter csvWriter = new CsvWriter();
    private final DocxWriter docxWriter = new DocxWriter();
    private final PptxWriter pptxWriter = new PptxWriter();

    @Override
    public String getName() {
        return "write_office_file";
    }

    @Override
    public String getDescription() {
        return "将结构化数据写入 Office 文件（XLSX / DOCX / PPTX）或 CSV 文件。"
                + "支持多 Sheet、表头、覆盖已有文件（编辑场景）。"
                + "DOCX 以 Markdown 作为输入 DSL。";
    }

    @Override
    public String getParametersSchema() {
        return """
                {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "输出文件路径（绝对路径或相对路径，只能访问项目目录内）"
                        },
                        "data": {
                            "type": "object",
                            "description": "写入的数据。格式因目标文件类型而异。"
                                + " XLSX: {sheets: [{name?, headers?, rows: [[...]]}]}. "
                                + " CSV: {headers?, rows: [[...]]}. "
                                + " DOCX: {content: \"# Title\\\\n\\\\nParagraph...\"}. "
                                + " PPTX: {slides: [{title?, content?, bullets?: [...], table?: {headers?, rows: [[...]]}, layout?}]}."
                        },
                        "format": {
                            "type": "string",
                            "enum": ["xlsx", "csv", "docx", "pptx"],
                            "description": "显式指定输出格式。不传则按 path 后缀名推断。"
                        },
                        "overwrite": {
                            "type": "boolean",
                            "description": "文件已存在时是否覆盖（默认 false）。"
                                + "设为 true 可覆盖已有文件实现编辑更新。"
                        }
                    },
                    "required": ["path", "data"]
                }
                """;
    }

    @Override
    public boolean requiresFileLock() {
        return true;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        if (arguments.has("path")) {
            return Collections.singletonList(arguments.get("path").asText());
        }
        return Collections.emptyList();
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        String filePath = extractPath(arguments);
        Path path = PathSecurityUtils.validateAndResolve(filePath);
        String fileName = path.getFileName().toString().toLowerCase();

        // 推断格式
        Format format = resolveFormat(fileName, arguments);

        // 检查文件是否存在 + overwrite
        boolean exists = Files.exists(path);
        if (exists) {
            boolean overwrite = parseOverwrite(arguments);
            if (!overwrite) {
                throw new ToolExecutionException(
                        "文件已存在: " + path.getFileName()
                        + "。如需覆盖请设置 overwrite=true，或更换路径。");
            }
            if (!Files.isRegularFile(path) || !Files.isWritable(path)) {
                throw new ToolExecutionException("文件不可写: " + filePath);
            }
        }

        // 确保父目录存在
        try {
            Path parentDir = path.getParent();
            if (parentDir != null && !Files.exists(parentDir)) {
                Files.createDirectories(parentDir);
            }
        } catch (IOException e) {
            throw new ToolExecutionException("无法创建目录: " + e.getMessage(), e);
        }

        JsonNode data = arguments.get("data");
        if (data == null || data.isNull()) {
            throw new ToolExecutionException("缺少必需参数: data");
        }

        try {
            String result = switch (format) {
                case XLSX -> writeXlsx(path, data);
                case CSV -> writeCsv(path, data);
                case DOCX -> writeDocx(path, data);
                case PPTX -> writePptx(path, data);
            };

            // 跟踪文件变更
            FileSnapshotManager.trackCurrentSessionFile(
                    path.toAbsolutePath().toString(), !exists);

            String action = exists ? "覆盖" : "创建";
            String relativePath = PathSecurityUtils.getRelativePath(path);
            return result + "（" + action + "）\n文件: " + relativePath;

        } catch (ToolExecutionException e) {
            throw e;
        } catch (Exception e) {
            logger.error("WriteOfficeFileTool: 写入失败 {}", path, e);
            throw new ToolExecutionException("写入文件失败: " + e.getMessage(), e);
        }
    }

    // ==================== 格式路由 ====================

    private enum Format { XLSX, CSV, DOCX, PPTX }

    private Format resolveFormat(String fileName, JsonNode args) throws ToolExecutionException {
        // 显式 format 参数优先
        if (args.has("format") && !args.get("format").isNull()) {
            String fmt = args.get("format").asText().toLowerCase();
            return switch (fmt) {
                case "xlsx" -> Format.XLSX;
                case "csv" -> Format.CSV;
                case "docx" -> Format.DOCX;
                case "pptx" -> Format.PPTX;
                default -> throw new ToolExecutionException(
                        "不支持的格式: " + fmt + "。仅支持 xlsx、csv、docx、pptx。");
            };
        }
        // 按后缀推断
        if (fileName.endsWith(".xlsx")) return Format.XLSX;
        if (fileName.endsWith(".csv")) return Format.CSV;
        if (fileName.endsWith(".docx")) return Format.DOCX;
        if (fileName.endsWith(".pptx")) return Format.PPTX;
        throw new ToolExecutionException(
                "无法从文件名推断格式，请通过 format 参数指定，或使用 .xlsx / .csv / .docx / .pptx 后缀。"
                + "当前文件名: " + fileName);
    }

    // ==================== XLSX 写入 ====================

    private String writeXlsx(Path path, JsonNode data) throws Exception {
        JsonNode sheetsNode = data.get("sheets");
        if (sheetsNode == null || !sheetsNode.isArray() || sheetsNode.isEmpty()) {
            throw new ToolExecutionException(
                    "XLSX 数据缺少 sheets 数组，或为空数组。"
                    + "data 应为 {sheets: [{name?, headers?, rows: [[...]]}]}");
        }

        List<SheetDef> sheets = new ArrayList<>();
        for (JsonNode sheetNode : sheetsNode) {
            String name = sheetNode.has("name") && !sheetNode.get("name").isNull()
                    ? sheetNode.get("name").asText() : null;

            String[] headers = null;
            if (sheetNode.has("headers") && !sheetNode.get("headers").isNull()
                    && sheetNode.get("headers").isArray()) {
                headers = jsonArrayToStringArray(sheetNode.get("headers"));
            }

            JsonNode rowsNode = sheetNode.get("rows");
            if (rowsNode == null || !rowsNode.isArray()) {
                throw new ToolExecutionException("每个 sheet 必须包含 rows 数组");
            }

            List<String[]> rows = new ArrayList<>();
            for (JsonNode rowNode : rowsNode) {
                if (rowNode.isArray()) {
                    rows.add(jsonArrayToStringArray(rowNode));
                } else {
                    throw new ToolExecutionException("rows 的每个元素必须是字符串数组");
                }
            }

            sheets.add(new SheetDef(name, headers, rows));
        }

        return spreadsheetWriter.write(path, sheets);
    }

    // ==================== CSV 写入 ====================

    private String writeCsv(Path path, JsonNode data) throws Exception {
        String[] headers = null;
        if (data.has("headers") && !data.get("headers").isNull()
                && data.get("headers").isArray()) {
            headers = jsonArrayToStringArray(data.get("headers"));
        }

        JsonNode rowsNode = data.get("rows");
        if (rowsNode == null || !rowsNode.isArray() || rowsNode.isEmpty()) {
            throw new ToolExecutionException(
                    "CSV 数据缺少 rows 数组，或为空数组。"
                    + "data 应为 {headers?, rows: [[...]]}");
        }

        List<String[]> rows = new ArrayList<>();
        for (JsonNode rowNode : rowsNode) {
            if (rowNode.isArray()) {
                rows.add(jsonArrayToStringArray(rowNode));
            } else {
                throw new ToolExecutionException("rows 的每个元素必须是字符串数组");
            }
        }

        return csvWriter.write(path, headers, rows);
    }

    // ==================== DOCX 写入 ====================

    private String writeDocx(Path path, JsonNode data) throws Exception {
        if (!data.has("content") || data.get("content").isNull()) {
            throw new ToolExecutionException(
                    "DOCX 数据缺少 content。"
                    + "data 应为 {content: \"# 标题\\n\\n正文...\"}");
        }
        String content = data.get("content").asText();
        return docxWriter.write(path, content);
    }

    // ==================== PPTX 写入 ====================

    private String writePptx(Path path, JsonNode data) throws Exception {
        JsonNode slidesNode = data.get("slides");
        if (slidesNode == null || !slidesNode.isArray() || slidesNode.isEmpty()) {
            throw new ToolExecutionException(
                    "PPTX 数据缺少 slides 数组，或为空数组。"
                    + "data 应为 {slides: [{title?, content?, bullets?, table?, layout?}]}");
        }

        List<SlideDef> slides = new ArrayList<>();
        for (JsonNode slideNode : slidesNode) {
            String title = slideNode.has("title") && !slideNode.get("title").isNull()
                    ? slideNode.get("title").asText() : null;
            String content = slideNode.has("content") && !slideNode.get("content").isNull()
                    ? slideNode.get("content").asText() : null;
            String layout = slideNode.has("layout") && !slideNode.get("layout").isNull()
                    ? slideNode.get("layout").asText() : null;

            String[] bullets = null;
            if (slideNode.has("bullets") && !slideNode.get("bullets").isNull()
                    && slideNode.get("bullets").isArray()) {
                bullets = jsonArrayToStringArray(slideNode.get("bullets"));
            }

            TableDef table = null;
            if (slideNode.has("table") && !slideNode.get("table").isNull()) {
                JsonNode tableNode = slideNode.get("table");
                String[] tableHeaders = null;
                if (tableNode.has("headers") && tableNode.get("headers").isArray()) {
                    tableHeaders = jsonArrayToStringArray(tableNode.get("headers"));
                }
                List<String[]> tableRows = new ArrayList<>();
                if (tableNode.has("rows") && tableNode.get("rows").isArray()) {
                    for (JsonNode rowNode : tableNode.get("rows")) {
                        if (rowNode.isArray()) {
                            tableRows.add(jsonArrayToStringArray(rowNode));
                        }
                    }
                }
                if (tableHeaders != null && tableHeaders.length > 0) {
                    table = new TableDef(tableHeaders, tableRows);
                }
            }

            slides.add(new SlideDef(title, content, bullets, table, layout));
        }

        return pptxWriter.write(path, slides);
    }

    // ==================== 参数提取 ====================

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

    private boolean parseOverwrite(JsonNode args) {
        return args.has("overwrite") && !args.get("overwrite").isNull()
                && args.get("overwrite").asBoolean();
    }

    private String[] jsonArrayToStringArray(JsonNode arrayNode) {
        String[] result = new String[arrayNode.size()];
        for (int i = 0; i < arrayNode.size(); i++) {
            JsonNode item = arrayNode.get(i);
            result[i] = item != null && !item.isNull() ? item.asText() : "";
        }
        return result;
    }
}
