package com.example.agent.tools.office;

import org.apache.poi.xslf.usermodel.*;

import java.awt.*;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * PPTX 文件写入器，将结构化数据写为 .pptx 格式。
 * <p>
 * 每张幻灯片支持：标题、正文、项目符号列表、表格。
 * 暂不支持图片嵌入。
 */
public class PptxWriter {

    private static final int MAX_SLIDES = 50;

    private static final int TITLE_X = 50;
    private static final int TITLE_Y = 30;
    private static final int TITLE_W = 620;
    private static final int TITLE_H = 50;
    private static final int CONTENT_X = 50;
    private static final int CONTENT_W = 620;

    /**
     * 将幻灯片数据写入 PPTX 文件。
     *
     * @param path   输出路径
     * @param slides 幻灯片列表
     * @return 写入摘要
     */
    public String write(Path path, List<SlideDef> slides) throws IOException {
        try (XMLSlideShow ppt = new XMLSlideShow()) {
            int slideCount = Math.min(slides.size(), MAX_SLIDES);
            for (int i = 0; i < slideCount; i++) {
                renderSlide(ppt, slides.get(i));
            }

            try (OutputStream os = Files.newOutputStream(path)) {
                ppt.write(os);
            }
        }

        int total = Math.min(slides.size(), MAX_SLIDES);
        boolean truncated = slides.size() > MAX_SLIDES;
        String suffix = truncated ? "（仅前 " + MAX_SLIDES + " 张）" : "";
        return String.format("PPTX 文件写入成功: %d 张幻灯片%s", total, suffix);
    }

    // ==================== 幻灯片渲染 ====================

    private void renderSlide(XMLSlideShow ppt, SlideDef def) {
        XSLFSlide slide = ppt.createSlide();
        int yOffset = TITLE_Y;

        // 标题
        if (def.title != null && !def.title.isBlank()) {
            XSLFTextShape titleShape = slide.createTextBox();
            titleShape.setAnchor(new Rectangle(TITLE_X, yOffset, TITLE_W, TITLE_H));
            titleShape.setText(def.title);
            boldFirstRun(titleShape, 28);
            yOffset += 70;
        }

        // 正文
        if (def.content != null && !def.content.isBlank()) {
            String[] lines = def.content.split("\n", -1);
            XSLFTextShape contentShape = slide.createTextBox();
            int contentH = Math.max(60, lines.length * 24);
            contentShape.setAnchor(new Rectangle(CONTENT_X, yOffset, CONTENT_W, contentH));

            List<XSLFTextParagraph> paras = contentShape.getTextParagraphs();
            for (int i = 0; i < lines.length; i++) {
                XSLFTextParagraph para = (i == 0) ? paras.get(0) : contentShape.addNewTextParagraph();
                XSLFTextRun run = para.addNewTextRun();
                run.setText(lines[i]);
                run.setFontSize(18.0);
            }
            yOffset += contentH + 10;
        }

        // 项目符号列表
        if (def.bullets != null && def.bullets.length > 0) {
            XSLFTextShape bulletShape = slide.createTextBox();
            int bulletH = Math.max(40, def.bullets.length * 26);
            bulletShape.setAnchor(new Rectangle(CONTENT_X, yOffset, CONTENT_W, bulletH));

            List<XSLFTextParagraph> bulletParas = bulletShape.getTextParagraphs();
            for (int i = 0; i < def.bullets.length; i++) {
                XSLFTextParagraph para = (i == 0) ? bulletParas.get(0) : bulletShape.addNewTextParagraph();
                para.setBullet(true);
                XSLFTextRun run = para.addNewTextRun();
                run.setText(def.bullets[i]);
                run.setFontSize(16.0);
            }
            yOffset += bulletH + 10;
        }

        // 表格
        if (def.table != null && def.table.headers != null && def.table.headers.length > 0) {
            int colCount = def.table.headers.length;
            int dataRowCount = def.table.rows != null ? def.table.rows.size() : 0;
            int rowCount = 1 + dataRowCount;
            int cellH = 28;

            XSLFTable table = slide.createTable(rowCount, colCount);
            table.setAnchor(new Rectangle(CONTENT_X, yOffset, Math.min(CONTENT_W, colCount * 150), rowCount * cellH));

            // 表头
            for (int ci = 0; ci < colCount; ci++) {
                XSLFTableCell cell = table.getCell(0, ci);
                cell.setText(def.table.headers[ci]);
                boldCell(cell);
            }

            // 数据行
            for (int ri = 0; ri < dataRowCount; ri++) {
                String[] rowData = def.table.rows.get(ri);
                for (int ci = 0; ci < colCount && ci < rowData.length; ci++) {
                    XSLFTableCell cell = table.getCell(ri + 1, ci);
                    cell.setText(rowData[ci] != null ? rowData[ci] : "");
                }
            }
        }
    }

    // ==================== 工具方法 ====================

    private void boldFirstRun(XSLFTextShape shape, double fontSize) {
        List<XSLFTextParagraph> paras = shape.getTextParagraphs();
        if (!paras.isEmpty()) {
            List<XSLFTextRun> runs = paras.get(0).getTextRuns();
            if (!runs.isEmpty()) {
                runs.get(0).setBold(true);
                runs.get(0).setFontSize(fontSize);
            }
        }
    }

    private void boldCell(XSLFTableCell cell) {
        List<XSLFTextParagraph> paras = cell.getTextParagraphs();
        if (!paras.isEmpty()) {
            List<XSLFTextRun> runs = paras.get(0).getTextRuns();
            if (!runs.isEmpty()) {
                runs.get(0).setBold(true);
            }
        }
    }

    // ==================== 幻灯片定义 ====================

    /** 一张幻灯片的结构定义 */
    public static class SlideDef {
        public final String title;
        public final String content;
        public final String[] bullets;
        public final TableDef table;
        public final String layout; // 预留扩展

        public SlideDef(String title, String content, String[] bullets, TableDef table, String layout) {
            this.title = title;
            this.content = content;
            this.bullets = bullets;
            this.table = table;
            this.layout = layout;
        }

        /** 表格定义 */
        public static class TableDef {
            public final String[] headers;
            public final List<String[]> rows;

            public TableDef(String[] headers, List<String[]> rows) {
                this.headers = headers;
                this.rows = rows;
            }
        }
    }
}
