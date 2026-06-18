package com.example.agent.tools.office;

import com.example.agent.tools.ToolExecutionException;
import org.apache.poi.ss.usermodel.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.FileInputStream;
import java.nio.file.Path;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;

/**
 * XLSX / XLS 文件解析器，输出 Markdown 表格。
 */
public class SpreadsheetParser {

    private static final Logger logger = LoggerFactory.getLogger(SpreadsheetParser.class);

    public static final int MAX_ROWS = 1000;
    public static final int MAX_SHEETS = 3;

    /**
     * 解析电子表格文件为 Markdown 格式。
     *
     * @param path       文件路径
     * @param fileName   文件名
     * @param maxRows    最大行数
     * @param sheetIndex sheet 索引（-1 表示读取前 MAX_SHEETS 个）
     * @return Markdown 格式内容
     */
    public String parse(Path path, String fileName, int maxRows, int sheetIndex) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append(OfficeUtils.fileHeader(fileName));

        try (var fis = new FileInputStream(path.toFile());
             var workbook = WorkbookFactory.create(fis)) {

            int sheetCount = workbook.getNumberOfSheets();
            if (sheetCount == 0) {
                sb.append("（空工作簿，无 sheet）\n");
                return sb + OfficeUtils.fileFooter(fileName);
            }

            // sheet_index 越界检查
            if (sheetIndex >= sheetCount) {
                throw new ToolExecutionException(
                        "sheet_index 超出范围: " + sheetIndex
                        + "，该工作簿只有 " + sheetCount + " 个 sheet（索引 0~" + (sheetCount - 1) + "）。");
            }

            int[] sheetIndices = resolveSheetIndices(sheetIndex, sheetCount, sb);

            for (int si : sheetIndices) {
                var sheet = workbook.getSheetAt(si);
                String sheetName = sheet.getSheetName();
                int lastRow = sheet.getLastRowNum();

                sb.append("## Sheet ").append(si).append(": ")
                        .append(OfficeUtils.escapeMd(sheetName)).append("\n\n");

                if (lastRow < 0) {
                    sb.append("（空 sheet）\n\n");
                    continue;
                }

                int rowCount = Math.min(lastRow + 1, maxRows);
                boolean truncated = lastRow + 1 > maxRows;

                List<String[]> rows = new ArrayList<>();
                int maxCols = 0;

                for (int ri = 0; ri < rowCount; ri++) {
                    var row = sheet.getRow(ri);
                    if (row == null) {
                        rows.add(new String[0]);
                        continue;
                    }
                    int colCount = row.getLastCellNum();
                    maxCols = Math.max(maxCols, colCount);
                    String[] cells = new String[colCount];
                    for (int ci = 0; ci < colCount; ci++) {
                        var cell = row.getCell(ci);
                        cells[ci] = (cell != null) ? getCellValue(cell) : "";
                    }
                    rows.add(cells);
                }

                if (maxCols == 0) {
                    sb.append("（空 sheet）\n\n");
                    continue;
                }

                String[][] rowsArr = rows.toArray(new String[0][]);
                rowsArr = OfficeUtils.padRows(rowsArr, maxCols);

                // 表头
                OfficeUtils.appendTableRow(sb, rowsArr[0], maxCols);
                OfficeUtils.appendTableSeparator(sb, maxCols);

                // 数据行
                for (int ri = 1; ri < rowsArr.length; ri++) {
                    OfficeUtils.appendTableRow(sb, rowsArr[ri], maxCols);
                }

                if (truncated) {
                    sb.append("\n> 仅显示前 ").append(maxRows).append(" 行，共 ")
                            .append(lastRow + 1).append(" 行。\n");
                }
                sb.append("\n");
            }
        }

        sb.append(OfficeUtils.fileFooter(fileName));
        return sb.toString();
    }

    private int[] resolveSheetIndices(int sheetIndex, int sheetCount, StringBuilder sb) {
        if (sheetIndex >= 0) {
            return new int[]{sheetIndex};
        }

        int count = Math.min(sheetCount, MAX_SHEETS);
        if (sheetCount > MAX_SHEETS) {
            sb.append("> 工作簿共 ").append(sheetCount).append(" 个 sheet，仅显示前 ")
                    .append(MAX_SHEETS).append(" 个。\n");
            sb.append("> 可用 sheet 列表：\n");
            for (int i = 0; i < sheetCount; i++) {
                sb.append(">   - `").append(i).append("`: ...\n");
            }
            sb.append("> 使用 `sheet_index` 参数可指定读取某个 sheet。\n\n");
        }

        int[] indices = new int[count];
        for (int i = 0; i < count; i++) {
            indices[i] = i;
        }
        return indices;
    }

    /** 获取单元格的字符串值 */
    public static String getCellValue(Cell cell) {
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    try {
                        var date = cell.getDateCellValue();
                        yield new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(date);
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
}
