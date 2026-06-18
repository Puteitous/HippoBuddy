package com.example.agent.tools.office;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * CSV 文件写入器，将结构化数据写为 CSV 格式。
 * <p>
 * 输出 UTF-8 编码，含 BOM（便于 Excel 正确识别中文）。
 * 自动转义含逗号/引号/换行的字段。
 */
public class CsvWriter {

    /**
     * 将数据写入 CSV 文件。
     *
     * @param path    输出路径
     * @param headers 可选的表头行
     * @param rows    数据行
     * @return 写入摘要
     */
    public String write(Path path, String[] headers, List<String[]> rows) throws IOException {
        try (OutputStream os = Files.newOutputStream(path);
             BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(os, StandardCharsets.UTF_8))) {

            // 写入 UTF-8 BOM
            os.write(0xEF);
            os.write(0xBB);
            os.write(0xBF);

            // 写表头
            if (headers != null && headers.length > 0) {
                writer.write(escapeCsvLine(headers));
                writer.newLine();
            }

            // 写数据行
            for (String[] row : rows) {
                writer.write(escapeCsvLine(row));
                writer.newLine();
            }
        }

        int totalRows = rows.size();
        return String.format("CSV 文件写入成功: 共 %d 行数据", totalRows);
    }

    /** 将一行数据转义为 CSV 格式 */
    private String escapeCsvLine(String[] fields) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < fields.length; i++) {
            if (i > 0) sb.append(',');
            String field = fields[i] != null ? fields[i] : "";
            // 如果包含逗号、引号、换行，需要引号包裹
            if (field.contains(",") || field.contains("\"") || field.contains("\n") || field.contains("\r")) {
                sb.append('"').append(field.replace("\"", "\"\"")).append('"');
            } else {
                sb.append(field);
            }
        }
        return sb.toString();
    }
}
