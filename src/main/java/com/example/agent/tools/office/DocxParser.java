package com.example.agent.tools.office;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;

import java.io.FileInputStream;
import java.nio.file.Path;

/**
 * DOCX 文件解析器，保留标题层级输出为 Markdown。
 */
public class DocxParser {

    private static final int MAX_TABLE_ROWS = 20;

    /**
     * 解析 DOCX 文件为 Markdown 格式。
     *
     * @param path     文件路径
     * @param fileName 文件名
     * @return Markdown 格式内容
     */
    public String parse(Path path, String fileName) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append(OfficeUtils.fileHeader(fileName));

        int imageCount = 0;

        try (var fis = new FileInputStream(path.toFile());
             var doc = new XWPFDocument(fis)) {

            var bodyElements = doc.getBodyElements();
            for (var element : bodyElements) {
                if (element instanceof XWPFParagraph para) {
                    renderParagraph(sb, para);
                } else if (element instanceof XWPFTable table) {
                    renderTable(sb, table);
                }
            }

            var pictures = doc.getAllPictures();
            imageCount = pictures.size();
        }

        if (imageCount > 0) {
            sb.append("> 该文档中包含约 ").append(imageCount)
                    .append(" 张图片，已忽略其内容。\n");
        }

        sb.append(OfficeUtils.fileFooter(fileName));
        return sb.toString();
    }

    private void renderParagraph(StringBuilder sb, XWPFParagraph para) {
        String text = para.getText().trim();
        if (text.isEmpty()) return;

        int headingLevel = detectHeadingLevel(para);
        if (headingLevel > 0) {
            sb.append("#".repeat(headingLevel)).append(" ")
                    .append(OfficeUtils.escapeMd(text)).append("\n\n");
        } else {
            sb.append(OfficeUtils.escapeMd(text)).append("\n\n");
        }
    }

    private void renderTable(StringBuilder sb, XWPFTable table) {
        var rows = table.getRows();
        if (rows.isEmpty()) return;

        for (int ri = 0; ri < Math.min(rows.size(), MAX_TABLE_ROWS); ri++) {
            var row = rows.get(ri);
            var cells = row.getTableCells();
            sb.append("|");
            for (var cell : cells) {
                sb.append(" ").append(OfficeUtils.escapeMdCell(cell.getText().trim())).append(" |");
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
        if (rows.size() > MAX_TABLE_ROWS) {
            sb.append("> 表格共 ").append(rows.size()).append(" 行，仅显示前 ")
                    .append(MAX_TABLE_ROWS).append(" 行。\n");
        }
        sb.append("\n");
    }

    private int detectHeadingLevel(XWPFParagraph para) {
        String style = para.getStyle();
        if (style == null) return -1;

        if (style.contains("Heading1") || style.contains("heading1")
                || "1".equals(style)) {
            return 1;
        } else if (style.contains("Heading2") || style.contains("heading2")
                || "2".equals(style)) {
            return 2;
        } else if (style.contains("Heading3") || style.contains("heading3")
                || "3".equals(style)) {
            return 3;
        } else if (style.contains("Heading4") || style.contains("heading4")
                || "4".equals(style)) {
            return 4;
        } else if (style.contains("Heading5") || style.contains("heading5")
                || "5".equals(style)) {
            return 5;
        } else if (style.contains("Title") || style.contains("Subtitle")) {
            return 1;
        }
        return -1;
    }
}
