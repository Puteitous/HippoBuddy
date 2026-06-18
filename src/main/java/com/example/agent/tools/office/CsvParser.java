package com.example.agent.tools.office;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * CSV 文件解析器，自动检测编码（UTF-8 BOM / UTF-8 / GBK），
 * 输出 Markdown 表格。
 */
public class CsvParser {

    /**
     * 解析 CSV 文件为 Markdown 格式。
     *
     * @param path     文件路径
     * @param fileName 文件名
     * @param maxRows  最大行数
     * @return Markdown 格式内容
     */
    public String parse(Path path, String fileName, int maxRows) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append(OfficeUtils.fileHeader(fileName));

        byte[] rawBytes = Files.readAllBytes(path);
        String content = decodeCsvBytes(rawBytes);
        if (content.isEmpty()) {
            sb.append("（空文件）\n\n");
            sb.append(OfficeUtils.fileFooter(fileName));
            return sb.toString();
        }

        String[] lines = content.split("\n", -1);
        int totalLines = lines.length;
        int rowCount = Math.min(totalLines, maxRows);
        boolean truncated = totalLines > maxRows;

        int maxCols = 0;
        String[][] cells = new String[rowCount][];
        for (int i = 0; i < rowCount; i++) {
            String[] parts = splitCsvLine(lines[i]);
            maxCols = Math.max(maxCols, parts.length);
            cells[i] = parts;
        }

        if (maxCols == 0) {
            sb.append("（空文件）\n\n");
            sb.append(OfficeUtils.fileFooter(fileName));
            return sb.toString();
        }

        cells = OfficeUtils.padRows(cells, maxCols);

        // 表头（第一行）
        OfficeUtils.appendTableRow(sb, cells[0], maxCols);
        OfficeUtils.appendTableSeparator(sb, maxCols);

        // 数据行
        for (int ri = 1; ri < rowCount; ri++) {
            OfficeUtils.appendTableRow(sb, cells[ri], maxCols);
        }

        if (truncated) {
            sb.append("\n> 仅显示前 ").append(maxRows).append(" 行，共 ")
                    .append(totalLines).append(" 行。\n");
        }

        sb.append(OfficeUtils.fileFooter(fileName));
        return sb.toString();
    }

    /**
     * CSV 编码检测：UTF-8 BOM → 去 BOM 解码；UTF-8 解码失败 → GBK 解码。
     */
    public static String decodeCsvBytes(byte[] bytes) {
        if (bytes.length == 0) return "";

        int start = 0;
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xEF
                && (bytes[1] & 0xFF) == 0xBB && (bytes[2] & 0xFF) == 0xBF) {
            start = 3;
        }

        try {
            return new String(bytes, start, bytes.length - start, StandardCharsets.UTF_8);
        } catch (Exception e) {
            try {
                return new String(bytes, start, bytes.length - start, Charset.forName("GBK"));
            } catch (Exception e2) {
                return new String(bytes, start, bytes.length - start);
            }
        }
    }

    /**
     * 简单 CSV 行解析：按逗号分隔，去除首尾空白和引号。
     */
    public static String[] splitCsvLine(String line) {
        if (line == null || line.isEmpty()) return new String[0];
        String[] parts = line.split(",", -1);
        for (int i = 0; i < parts.length; i++) {
            parts[i] = parts[i].trim();
            if (parts[i].length() >= 2 && parts[i].startsWith("\"") && parts[i].endsWith("\"")) {
                parts[i] = parts[i].substring(1, parts[i].length() - 1).replace("\"\"", "\"");
            }
        }
        return parts;
    }
}
