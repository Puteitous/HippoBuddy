package com.example.agent.tools.office;

import org.apache.poi.xwpf.usermodel.*;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * DOCX 文件写入器，将 Markdown 内容渲染为 .docx 格式。
 * <p>
 * 支持的 Markdown 语法：
 * <ul>
 *   <li>{@code # ～ ######} 标题 — 渲染为 Word 标题（加粗 + 字号渐变）</li>
 *   <li>{@code | col1 | col2 |} 表格 — 渲染为 Word 表格，首行加粗（最多 20 行）</li>
 *   <li>{@code |---|---|} 表格分隔行 — 自动跳过</li>
 *   <li>普通文本 — 渲染为正文段落</li>
 * </ul>
 * 暂不支持内联样式（加粗、斜体、代码等）。
 */
public class DocxWriter {

    private static final Pattern HEADING_PATTERN = Pattern.compile("^(#{1,6})\\s+(.+)$");
    private static final Pattern TABLE_SEPARATOR = Pattern.compile("^\\|?\\s*-+\\s*(\\|\\s*-+\\s*)*\\|?\\s*$");
    private static final int MAX_TABLE_ROWS = 20;

    /**
     * 将 Markdown 内容写入 DOCX 文件。
     *
     * @param path    输出路径
     * @param content Markdown 格式内容
     * @return 写入摘要
     */
    public String write(Path path, String content) throws IOException {
        try (XWPFDocument doc = new XWPFDocument()) {
            renderMarkdown(doc, content);
            try (OutputStream os = Files.newOutputStream(path)) {
                doc.write(os);
            }
        }

        int lineCount = content.isEmpty() ? 0 : content.split("\n", -1).length;
        return String.format("DOCX 文件写入成功: %d 行 Markdown 内容", lineCount);
    }

    // ==================== Markdown → XWPF 渲染 ====================

    private void renderMarkdown(XWPFDocument doc, String content) {
        String[] lines = content.split("\n", -1);
        List<String[]> tableBuffer = new ArrayList<>();

        for (String rawLine : lines) {
            String trimmed = rawLine.trim();

            if (trimmed.isEmpty()) {
                flushTable(doc, tableBuffer);
                continue;
            }

            // 表格分隔行（|---|---|）跳过
            if (TABLE_SEPARATOR.matcher(trimmed).matches()) {
                continue;
            }

            // 标题
            Matcher headingMatcher = HEADING_PATTERN.matcher(trimmed);
            if (headingMatcher.matches()) {
                flushTable(doc, tableBuffer);
                addHeading(doc, headingMatcher.group(2), headingMatcher.group(1).length());
                continue;
            }

            // 表格行（包含 |）
            if (trimmed.contains("|")) {
                String[] cells = parseTableRow(trimmed);
                if (cells.length > 0) {
                    tableBuffer.add(cells);
                    continue;
                }
            }

            // 普通段落
            flushTable(doc, tableBuffer);
            addParagraph(doc, trimmed);
        }

        flushTable(doc, tableBuffer);
    }

    // ==================== 标题 ====================

    private void addHeading(XWPFDocument doc, String text, int level) {
        XWPFParagraph para = doc.createParagraph();
        XWPFRun run = para.createRun();
        run.setText(text);
        run.setBold(true);

        switch (Math.min(level, 6)) {
            case 1 -> run.setFontSize(24);
            case 2 -> run.setFontSize(20);
            case 3 -> run.setFontSize(16);
            case 4 -> run.setFontSize(14);
            case 5 -> run.setFontSize(12);
            default -> run.setFontSize(11);
        }
    }

    // ==================== 段落 ====================

    private void addParagraph(XWPFDocument doc, String text) {
        XWPFParagraph para = doc.createParagraph();
        XWPFRun run = para.createRun();
        run.setText(text);
        run.setFontSize(11);
    }

    // ==================== 表格 ====================

    private void flushTable(XWPFDocument doc, List<String[]> buffer) {
        if (buffer.isEmpty()) return;

        int rowCount = Math.min(buffer.size(), MAX_TABLE_ROWS);
        int maxCols = buffer.stream().mapToInt(r -> r.length).max().orElse(1);

        XWPFTable table = doc.createTable(rowCount, maxCols);

        for (int ri = 0; ri < rowCount; ri++) {
            String[] cells = buffer.get(ri);
            XWPFTableRow row = table.getRow(ri);
            for (int ci = 0; ci < maxCols; ci++) {
                String cellText = ci < cells.length ? cells[ci] : "";
                XWPFTableCell cell = row.getCell(ci);
                cell.setText(cellText);

                // 表头行加粗
                if (ri == 0) {
                    XWPFParagraph p = cell.getParagraphs().get(0);
                    if (!p.getRuns().isEmpty()) {
                        p.getRuns().get(0).setBold(true);
                    }
                }
            }
        }

        // 截断提示
        if (buffer.size() > MAX_TABLE_ROWS) {
            XWPFParagraph notice = doc.createParagraph();
            XWPFRun run = notice.createRun();
            run.setText("（表格超过 " + MAX_TABLE_ROWS + " 行，已截断）");
            run.setItalic(true);
            run.setFontSize(9);
            run.setColor("999999");
        }

        buffer.clear();
    }

    // ==================== 表格行解析 ====================

    private String[] parseTableRow(String line) {
        String trimmed = line.trim();
        // 确保首尾都有 |
        if (!trimmed.startsWith("|")) trimmed = "|" + trimmed;
        if (!trimmed.endsWith("|")) trimmed = trimmed + "|";

        String inner = trimmed.substring(1, trimmed.length() - 1);
        String[] parts = inner.split("\\|", -1);
        for (int i = 0; i < parts.length; i++) {
            parts[i] = parts[i].trim();
        }
        return parts;
    }
}
