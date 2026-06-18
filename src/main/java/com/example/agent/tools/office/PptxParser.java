package com.example.agent.tools.office;

import org.apache.poi.xslf.usermodel.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.FileInputStream;
import java.nio.file.Path;

/**
 * PPTX 文件解析器，提取每张幻灯片的文字内容输出为 Markdown。
 * <p>
 * 旧版 .ppt 格式不支持（需 poi-scratchpad 的 HSLF）。
 */
public class PptxParser {

    private static final Logger logger = LoggerFactory.getLogger(PptxParser.class);

    private static final int MAX_SLIDES = 50;

    /**
     * 解析 PPTX 文件为 Markdown 格式。
     *
     * @param path     文件路径
     * @param fileName 文件名
     * @return Markdown 格式内容
     */
    public String parse(Path path, String fileName) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append(OfficeUtils.fileHeader(fileName));

        int imageCount = 0;
        int slideCount;

        try (var fis = new FileInputStream(path.toFile());
             var ppt = new XMLSlideShow(fis)) {

            var slides = ppt.getSlides();
            slideCount = slides.size();

            if (slideCount == 0) {
                sb.append("（空演示文稿）\n\n");
                sb.append(OfficeUtils.fileFooter(fileName));
                return sb.toString();
            }

            int slidesToShow = Math.min(slideCount, MAX_SLIDES);
            boolean truncated = slideCount > MAX_SLIDES;

            for (int i = 0; i < slidesToShow; i++) {
                var slide = slides.get(i);
                sb.append("## 幻灯片 ").append(i + 1).append("\n\n");

                // 提取所有形状中的文字
                boolean hasText = false;
                for (var shape : slide.getShapes()) {
                    if (shape instanceof XSLFTextShape textShape) {
                        String text = textShape.getText().trim();
                        if (!text.isEmpty()) {
                            // 判断是否像标题（在幻灯片中通常是第一个文本框或更大的字号）
                            boolean isTitle = isLikelyTitle(textShape, slide);
                            if (isTitle) {
                                sb.append("### ").append(OfficeUtils.escapeMd(text)).append("\n\n");
                            } else {
                                sb.append(OfficeUtils.escapeMd(text)).append("\n\n");
                            }
                            hasText = true;
                        }
                    } else if (shape instanceof XSLFTable table) {
                        renderPptxTable(sb, table);
                        hasText = true;
                    } else if (shape instanceof XSLFGroupShape group) {
                        // 递归提取组中的文字
                        String groupText = extractGroupText(group);
                        if (!groupText.isEmpty()) {
                            sb.append(groupText).append("\n");
                            hasText = true;
                        }
                    }

                    // 统计图片（仅计顶层形状，递归子形状的暂不计）
                    if (shape instanceof XSLFPictureShape) {
                        imageCount++;
                    }
                }

                if (!hasText) {
                    sb.append("（此幻灯片可能仅包含图片或图表）\n\n");
                }
            }

            if (truncated) {
                sb.append("> 演示文稿共 ").append(slideCount)
                        .append(" 张幻灯片，仅显示前 ").append(MAX_SLIDES).append(" 张。\n\n");
            }
        }

        if (imageCount > 0) {
            sb.append("> 该演示文稿中包含约 ").append(imageCount)
                    .append(" 张图片/图表，已忽略其内容。\n");
        }

        sb.append(OfficeUtils.fileFooter(fileName));
        return sb.toString();
    }

    /** 判断文本形状是否可能是标题 */
    private boolean isLikelyTitle(XSLFTextShape shape, XSLFSlide slide) {
        // 方式 1：检查占位符类型
        try {
            var ph = shape.getTextType();
            if (ph == org.apache.poi.sl.usermodel.Placeholder.TITLE
                    || ph == org.apache.poi.sl.usermodel.Placeholder.SUBTITLE) {
                return true;
            }
        } catch (Exception ignored) {
        }

        // 方式 2：检查是否在幻灯片顶部区域
        try {
            var anchor = shape.getAnchor();
            if (anchor != null) {
                double slideH = anchor.getY() * 6; // 估计幻灯片高度
                // 顶部 15% 区域内的形状被视为标题候选
                if (anchor.getY() < slideH * 0.15 && anchor.getY() >= 0) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        }

        return false;
    }

    /** 提取组形状中的文字 */
    private String extractGroupText(XSLFGroupShape group) {
        StringBuilder sb = new StringBuilder();
        for (var shape : group.getShapes()) {
            if (shape instanceof XSLFTextShape textShape) {
                String text = textShape.getText().trim();
                if (!text.isEmpty()) {
                    sb.append(text).append("\n");
                }
            } else if (shape instanceof XSLFGroupShape nestedGroup) {
                sb.append(extractGroupText(nestedGroup));
            } else if (shape instanceof XSLFPictureShape) {
                // 组内的图片已整体统计，不重复计数
            }
        }
        return sb.toString();
    }

    /** 渲染 PPTX 中的表格 */
    private void renderPptxTable(StringBuilder sb, XSLFTable table) {
        var rows = table.getRows();
        if (rows.isEmpty()) return;

        int rowCount = rows.size();
        int cols = 0;
        for (var row : rows) {
            cols = Math.max(cols, row.getCells().size());
        }
        if (cols == 0) return;

        for (int ri = 0; ri < rowCount; ri++) {
            var row = rows.get(ri);
            sb.append("|");
            for (int ci = 0; ci < cols; ci++) {
                String text = (ci < row.getCells().size())
                        ? row.getCells().get(ci).getText().trim()
                        : "";
                sb.append(" ").append(OfficeUtils.escapeMdCell(text)).append(" |");
            }
            sb.append("\n");
            if (ri == 0) {
                OfficeUtils.appendTableSeparator(sb, cols);
            }
        }
        sb.append("\n");
    }
}
