package com.example.agent.tools.office;

/**
 * Office 文件解析的通用工具方法。
 */
public class OfficeUtils {

    /** 转义 Markdown 特殊字符（避免破坏标题/段落结构） */
    public static String escapeMd(String text) {
        if (text == null) return "";
        return text.replace("\\", "\\\\")
                .replace("`", "\\`");
    }

    /** 转义 Markdown 表格单元格内容（主要是管道符和换行） */
    public static String escapeMdCell(String text) {
        if (text == null) return "";
        return text.replace("|", "\\|")
                .replace("\n", "<br>")
                .replace("\r", "");
    }

    /** 格式化文件名标题行 */
    public static String fileHeader(String fileName) {
        return "# " + escapeMd(fileName) + "\n\n";
    }

    /** 文件尾标记 */
    public static String fileFooter(String fileName) {
        return "---\n> 文件: `" + escapeMd(fileName) + "`\n";
    }

    /** 输出 Markdown 表格行 */
    public static void appendTableRow(StringBuilder sb, String[] cells, int maxCols) {
        sb.append("|");
        for (int ci = 0; ci < maxCols; ci++) {
            sb.append(" ").append(escapeMdCell(ci < cells.length ? cells[ci] : "")).append(" |");
        }
        sb.append("\n");
    }

    /** 输出 Markdown 表头分隔行 */
    public static void appendTableSeparator(StringBuilder sb, int maxCols) {
        sb.append("|");
        for (int ci = 0; ci < maxCols; ci++) {
            sb.append(" --- |");
        }
        sb.append("\n");
    }

    /** 补齐行数组到指定列数 */
    public static String[][] padRows(String[][] rows, int maxCols) {
        for (int i = 0; i < rows.length; i++) {
            if (rows[i].length < maxCols) {
                String[] padded = new String[maxCols];
                System.arraycopy(rows[i], 0, padded, 0, rows[i].length);
                rows[i] = padded;
            }
        }
        return rows;
    }
}
