package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

class ReadOfficeFileToolTest {

    private ReadOfficeFileTool tool;
    private ObjectMapper objectMapper;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        tool = new ReadOfficeFileTool();
        objectMapper = new ObjectMapper();
    }

    // ==================== 基本元数据 ====================

    @Test
    void testGetName() {
        assertEquals("read_office_file", tool.getName());
    }

    @Test
    void testGetDescription() {
        String desc = tool.getDescription();
        assertNotNull(desc);
        assertTrue(desc.contains("Office"));
        assertTrue(desc.contains("Markdown"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("path"));
        assertTrue(schema.contains("max_rows"));
        assertTrue(schema.contains("sheet_index"));
    }

    @Test
    void testRequiresFileLock() {
        assertTrue(tool.requiresFileLock());
    }

    // ==================== 参数验证 ====================

    @Test
    void testMissingPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testNullPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("path");
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testEmptyPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "");
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    // ==================== 文件不存在 / 不支持格式 / 目录 ====================

    @Test
    void testReadNonExistentFile() throws Exception {
        Path testFile = tempDir.resolve("nonexistent.xlsx");
        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(testFile);

            ObjectNode args = args("path", testFile.toString());
            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("文件不存在"));
        }
    }

    @Test
    void testReadDirectoryPath() throws Exception {
        Path dir = Files.createTempDirectory(tempDir, "testdir");
        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(dir);

            ObjectNode args = args("path", dir.toString());
            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("不可读") || ex.getMessage().contains("不是常规文件"));
        }
    }

    @Test
    void testReadUnsupportedFormat_txt() throws Exception {
        Path testFile = tempDir.resolve("test.txt");
        Files.writeString(testFile, "hello");
        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(testFile);

            ObjectNode args = args("path", testFile.toString());
            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("不支持的文件格式"));
        }
    }

    @Test
    void testReadUnsupportedFormat_pdf() throws Exception {
        Path testFile = tempDir.resolve("test.pdf");
        Files.write(testFile, new byte[]{0x25, 0x50, 0x44, 0x46}); // %PDF header
        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(testFile);

            ObjectNode args = args("path", testFile.toString());
            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("不支持的文件格式"));
        }
    }

    // ==================== POI 解析：PPTX ====================

    @Test
    void testReadPptx_basic() throws Exception {
        Path pptxFile;
        try (var ppt = new org.apache.poi.xslf.usermodel.XMLSlideShow()) {
            var slide1 = ppt.createSlide();
            var title1 = slide1.createTextBox();
            title1.setText("Slide 1 Title");
            title1.getTextBody().getParagraphs().get(0).getTextRuns().get(0).setFontSize(32.0);

            var slide2 = ppt.createSlide();
            var body2 = slide2.createTextBox();
            body2.setText("This is slide 2 content");

            pptxFile = tempDir.resolve("test.pptx");
            try (var out = new FileOutputStream(pptxFile.toFile())) {
                ppt.write(out);
            }
        }

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(pptxFile);

            String result = tool.execute(args("path", pptxFile.toString()));

            assertNotNull(result);
            assertTrue(result.contains("幻灯片 1"));
            assertTrue(result.contains("Slide 1 Title"));
            assertTrue(result.contains("幻灯片 2"));
            assertTrue(result.contains("slide 2 content"));
            assertTrue(result.contains(".pptx"));
        }
    }

    @Test
    void testReadPptx_empty() throws Exception {
        Path pptxFile;
        try (var ppt = new org.apache.poi.xslf.usermodel.XMLSlideShow()) {
            pptxFile = tempDir.resolve("empty.pptx");
            try (var out = new FileOutputStream(pptxFile.toFile())) {
                ppt.write(out);
            }
        }

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(pptxFile);

            String result = tool.execute(args("path", pptxFile.toString()));
            assertTrue(result.contains("空演示文稿") || result.contains("空"));
        }
    }

    // ==================== POI 解析：XLSX ====================

    @Test
    void testReadXlsx_basic() throws Exception {
        Path xlsxFile = createMinimalXlsx(new String[][]{
                {"Name", "Age", "City"},
                {"Alice", "30", "Beijing"},
                {"Bob", "25", "Shanghai"}
        });

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            String result = tool.execute(args("path", xlsxFile.toString()));

            assertNotNull(result);
            assertTrue(result.contains("| Name"));
            assertTrue(result.contains("| Alice"));
            assertTrue(result.contains("| 30"));
            assertTrue(result.contains("| Beijing"));
            assertTrue(result.contains(".xlsx"));
        }
    }

    @Test
    void testReadXlsx_sheetIndex() throws Exception {
        Path xlsxFile = createMultiSheetXlsx();

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            String result = tool.execute(args(
                    "path", xlsxFile.toString(),
                    "sheet_index", 1
            ));

            assertNotNull(result);
            assertTrue(result.contains("Sheet 1"));
            assertTrue(result.contains("Data-B"));
            assertFalse(result.contains("Data-A")); // Sheet0 should NOT appear
        }
    }

    @Test
    void testReadXlsx_sheetIndexOutOfBounds() throws Exception {
        Path xlsxFile = createMinimalXlsx(new String[][]{{"A", "B"}, {"1", "2"}});

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            ObjectNode args = args("path", xlsxFile.toString(), "sheet_index", 999);
            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("sheet_index 超出范围"));
        }
    }

    @Test
    void testReadXlsx_sheetIndexNegative_throws() throws Exception {
        Path xlsxFile = createMinimalXlsx(new String[][]{{"A", "B"}, {"1", "2"}});

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            ObjectNode args = args("path", xlsxFile.toString(), "sheet_index", -2);
            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("sheet_index 不能小于 -1"));
        }
    }

    @Test
    void testReadXlsx_maxRows() throws Exception {
        String[][] data = new String[50][3];
        data[0] = new String[]{"Col1", "Col2", "Col3"};
        for (int i = 1; i < 50; i++) {
            data[i] = new String[]{String.valueOf(i), "val", "x"};
        }
        Path xlsxFile = createMinimalXlsx(data);

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            String result = tool.execute(args(
                    "path", xlsxFile.toString(),
                    "max_rows", 5
            ));

            assertNotNull(result);
            assertTrue(result.contains("仅显示前 5 行，共 50 行"));
        }
    }

    @Test
    void testReadXlsx_maxRowsZero_throws() throws Exception {
        Path xlsxFile = createMinimalXlsx(new String[][]{{"A", "B"}, {"1", "2"}});

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            ObjectNode args = args("path", xlsxFile.toString(), "max_rows", 0);
            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("max_rows 必须大于 0"));
        }
    }

    @Test
    void testReadXlsx_emptyWorkbook() throws Exception {
        var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
        Path xlsxFile = tempDir.resolve("empty.xlsx");
        try (var out = new FileOutputStream(xlsxFile.toFile())) {
            wb.write(out);
        }
        wb.close();

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            String result = tool.execute(args("path", xlsxFile.toString()));
            assertTrue(result.contains("空工作簿") || result.contains("空 sheet"));
        }
    }

    @Test
    void testReadXlsx_emptySheet() throws Exception {
        var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
        wb.createSheet("EmptySheet");
        Path xlsxFile = tempDir.resolve("emptysheet.xlsx");
        try (var out = new FileOutputStream(xlsxFile.toFile())) {
            wb.write(out);
        }
        wb.close();

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            String result = tool.execute(args("path", xlsxFile.toString()));
            assertTrue(result.contains("空 sheet"));
        }
    }

    @Test
    void testReadXlsx_variousDataTypes() throws Exception {
        // 测试不同数据类型：数字、布尔、公式
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook()) {
            var sheet = wb.createSheet("Types");
            var row = sheet.createRow(0);
            row.createCell(0).setCellValue("Text");
            row.createCell(1).setCellValue(42);
            row.createCell(2).setCellValue(true);
            row.createCell(3).setCellValue(3.14);

            Path xlsxFile = tempDir.resolve("types.xlsx");
            try (var out = new FileOutputStream(xlsxFile.toFile())) {
                wb.write(out);
            }

            try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
                securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                        .thenReturn(xlsxFile);

                String result = tool.execute(args("path", xlsxFile.toString()));

                assertTrue(result.contains("Text"));
                assertTrue(result.contains("42"));
                assertTrue(result.contains("true"));
                assertTrue(result.contains("3.14"));
            }
        }
    }

    // ==================== POI 解析：DOCX ====================

    @Test
    void testReadDocx_basic() throws Exception {
        Path docxFile = createMinimalDocx("Hello World", "This is a paragraph.");

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(docxFile);

            String result = tool.execute(args("path", docxFile.toString()));

            assertNotNull(result);
            assertTrue(result.contains("Hello World"));
            assertTrue(result.contains("This is a paragraph"));
            assertTrue(result.contains(".docx"));
        }
    }

    @Test
    void testReadDocx_headings() throws Exception {
        try (var doc = new org.apache.poi.xwpf.usermodel.XWPFDocument()) {
            // 标题 1
            var h1 = doc.createParagraph();
            h1.setStyle("Heading1");
            h1.createRun().setText("Chapter 1");

            // 正文
            var p = doc.createParagraph();
            p.createRun().setText("Some text");

            // 标题 2
            var h2 = doc.createParagraph();
            h2.setStyle("Heading2");
            h2.createRun().setText("Section 1.1");

            Path docxFile = tempDir.resolve("headings.docx");
            try (var out = new FileOutputStream(docxFile.toFile())) {
                doc.write(out);
            }

            try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
                securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                        .thenReturn(docxFile);

                String result = tool.execute(args("path", docxFile.toString()));

                assertTrue(result.contains("# Chapter 1"));
                assertTrue(result.contains("## Section 1.1"));
                assertTrue(result.contains("Some text"));
            }
        }
    }

    // ==================== CSV 解析 ====================

    @Test
    void testReadCsv_basic() throws Exception {
        Path csvFile = tempDir.resolve("test.csv");
        Files.writeString(csvFile, "Name,Age,City\nAlice,30,Beijing\nBob,25,Shanghai");

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);

            String result = tool.execute(args("path", csvFile.toString()));

            assertNotNull(result);
            assertTrue(result.contains("| Name"));
            assertTrue(result.contains("| Alice"));
            assertTrue(result.contains("| 30"));
            assertTrue(result.contains("| Beijing"));
        }
    }

    @Test
    void testReadCsv_utf8Bom() throws Exception {
        Path csvFile = tempDir.resolve("bom.csv");
        // UTF-8 BOM + GBK content 实际是 UTF-8
        byte[] bom = new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
        byte[] content = "名称,价格\n苹果,5.00\n香蕉,3.50".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] all = new byte[bom.length + content.length];
        System.arraycopy(bom, 0, all, 0, bom.length);
        System.arraycopy(content, 0, all, bom.length, content.length);
        Files.write(csvFile, all);

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);

            String result = tool.execute(args("path", csvFile.toString()));

            assertTrue(result.contains("名称"));
            assertTrue(result.contains("苹果"));
            assertTrue(result.contains("5.00"));
        }
    }

    @Test
    void testReadCsv_emptyFile() throws Exception {
        Path csvFile = tempDir.resolve("empty.csv");
        Files.writeString(csvFile, "");

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);

            String result = tool.execute(args("path", csvFile.toString()));
            assertTrue(result.contains("空文件"));
        }
    }

    @Test
    void testReadCsv_maxRows() throws Exception {
        StringBuilder sb = new StringBuilder("A,B,C\n");
        for (int i = 1; i < 20; i++) {
            sb.append(i).append(",x,y\n");
        }
        sb.append("20,x,y"); // 最后一行不加 \n，避免 split 多出空串
        Path csvFile = tempDir.resolve("many.csv");
        Files.writeString(csvFile, sb.toString());

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);

            String result = tool.execute(args(
                    "path", csvFile.toString(),
                    "max_rows", 5
            ));

            assertTrue(result.contains("仅显示前 5 行，共 21 行"));
        }
    }

    @Test
    void testReadCsv_quotedFields() throws Exception {
        Path csvFile = tempDir.resolve("quoted.csv");
        Files.writeString(csvFile, "\"First Name\",\"Last Name\"\n\"Alice\",\"Smith\"\n\"Bob\",\"Johnson\"");

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);

            String result = tool.execute(args("path", csvFile.toString()));

            assertNotNull(result);
            assertTrue(result.contains("First Name"));
            assertTrue(result.contains("Alice"));
            assertTrue(result.contains("Smith"));
            assertFalse(result.contains("\"Alice\"")); // 引号应去掉
        }
    }

    // ==================== 文件过大 ====================

    @Test
    void testFileTooLarge() throws Exception {
        Path testFile = tempDir.resolve("huge.xlsx");
        // 创建一个略大于 50MB 的稀疏文件
        try (var out = new FileOutputStream(testFile.toFile())) {
            byte[] buf = new byte[60 * 1024 * 1024];
            out.write(buf);
        }

        try (var securityUtilsMock = mockStatic(PathSecurityUtils.class)) {
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(testFile);

            ObjectNode args = args("path", testFile.toString());
            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("文件过大"));
        }
    }

    // ==================== 辅助方法 ====================

    /** 创建只有单个 sheet 的最小 XLSX */
    private Path createMinimalXlsx(String[][] rows) throws IOException {
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook()) {
            var sheet = wb.createSheet("Sheet1");
            for (int ri = 0; ri < rows.length; ri++) {
                var row = sheet.createRow(ri);
                for (int ci = 0; ci < rows[ri].length; ci++) {
                    row.createCell(ci).setCellValue(rows[ri][ci]);
                }
            }
            Path xlsxFile = tempDir.resolve("test.xlsx");
            try (var out = new FileOutputStream(xlsxFile.toFile())) {
                wb.write(out);
            }
            return xlsxFile;
        }
    }

    /** 创建多 sheet 的 XLSX */
    private Path createMultiSheetXlsx() throws IOException {
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook()) {
            var s0 = wb.createSheet("Sheet0");
            s0.createRow(0).createCell(0).setCellValue("Data-A");

            var s1 = wb.createSheet("Sheet1");
            s1.createRow(0).createCell(0).setCellValue("Data-B");

            Path xlsxFile = tempDir.resolve("multi.xlsx");
            try (var out = new FileOutputStream(xlsxFile.toFile())) {
                wb.write(out);
            }
            return xlsxFile;
        }
    }

    /** 创建最小 DOCX */
    private Path createMinimalDocx(String... paragraphs) throws IOException {
        try (var doc = new org.apache.poi.xwpf.usermodel.XWPFDocument()) {
            for (String text : paragraphs) {
                var p = doc.createParagraph();
                p.createRun().setText(text);
            }
            Path docxFile = tempDir.resolve("test.docx");
            try (var out = new FileOutputStream(docxFile.toFile())) {
                doc.write(out);
            }
            return docxFile;
        }
    }

    /** 快速构建参数 JSON */
    private ObjectNode args(String key, Object value, Object... more) {
        ObjectNode node = objectMapper.createObjectNode();
        putValue(node, key, value);
        for (int i = 0; i < more.length; i += 2) {
            putValue(node, more[i].toString(), more[i + 1]);
        }
        return node;
    }

    private void putValue(ObjectNode node, String key, Object value) {
        if (value instanceof String s) {
            node.put(key, s);
        } else if (value instanceof Integer i) {
            node.put(key, i);
        } else if (value instanceof Long l) {
            node.put(key, l);
        } else if (value instanceof Boolean b) {
            node.put(key, b);
        } else if (value instanceof Double d) {
            node.put(key, d);
        }
    }
}
