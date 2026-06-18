package com.example.agent.tools.office;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * XLSX 文件写入器，将结构化数据写为 .xlsx 格式。
 * <p>
 * 支持多 Sheet、表头（加粗）、自动列宽。仅输出 XSSF（.xlsx），
 * 不支持旧版 .xls（HSSF）格式。
 */
public class SpreadsheetWriter {

    /**
     * 将 sheets 数据写入 XLSX 文件。
     *
     * @param path   输出路径
     * @param sheets Sheet 定义列表，每个元素含 name / headers / rows
     * @return 写入摘要
     */
    public String write(Path path, List<SheetDef> sheets) throws IOException {
        try (Workbook workbook = new XSSFWorkbook()) {
            CellStyle headerStyle = createHeaderStyle(workbook);

            for (SheetDef sheet : sheets) {
                String sheetName = sheet.name;
                if (sheetName == null || sheetName.isBlank()) {
                    sheetName = "Sheet" + (sheets.indexOf(sheet) + 1);
                }
                // POI 限制 sheet name <= 31 字符
                if (sheetName.length() > 31) {
                    sheetName = sheetName.substring(0, 31);
                }

                org.apache.poi.ss.usermodel.Sheet poiSheet = workbook.createSheet(sheetName);

                int rowIdx = 0;

                // 写表头
                if (sheet.headers != null && sheet.headers.length > 0) {
                    Row headerRow = poiSheet.createRow(rowIdx++);
                    for (int ci = 0; ci < sheet.headers.length; ci++) {
                        Cell cell = headerRow.createCell(ci);
                        cell.setCellValue(sheet.headers[ci]);
                        cell.setCellStyle(headerStyle);
                    }
                }

                // 写数据行
                int startRow = (sheet.headers != null && sheet.headers.length > 0) ? 1 : 0;
                for (String[] rowData : sheet.rows) {
                    Row dataRow = poiSheet.createRow(rowIdx++);
                    for (int ci = 0; ci < rowData.length; ci++) {
                        Cell cell = dataRow.createCell(ci);
                        cell.setCellValue(rowData[ci] != null ? rowData[ci] : "");
                    }
                }

                // 自动列宽
                int maxCols = Math.max(
                        sheet.headers != null ? sheet.headers.length : 0,
                        sheet.rows.isEmpty() ? 0 : sheet.rows.get(0).length
                );
                for (int ci = 0; ci < maxCols; ci++) {
                    poiSheet.autoSizeColumn(ci);
                }
            }

            try (OutputStream os = Files.newOutputStream(path)) {
                workbook.write(os);
            }
        }

        int totalSheets = sheets.size();
        int totalRows = sheets.stream().mapToInt(s -> s.rows.size()).sum();
        return String.format("XLSX 文件写入成功: %d 个 Sheet，共 %d 行数据", totalSheets, totalRows);
    }

    private CellStyle createHeaderStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        style.setFont(font);
        return style;
    }

    /** 一个 Sheet 的定义 */
    public static class SheetDef {
        public final String name;
        public final String[] headers;
        public final List<String[]> rows;

        public SheetDef(String name, String[] headers, List<String[]> rows) {
            this.name = name;
            this.headers = headers;
            this.rows = rows;
        }
    }
}
