package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xslf.usermodel.*;
import org.apache.poi.xwpf.usermodel.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mockStatic;

class WriteOfficeFileToolTest {

    private WriteOfficeFileTool tool;
    private ObjectMapper objectMapper;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        tool = new WriteOfficeFileTool();
        objectMapper = new ObjectMapper();
    }

    // ==================== 基本元数据 ====================

    @Test
    void testGetName() {
        assertEquals("write_office_file", tool.getName());
    }

    @Test
    void testGetDescription() {
        String desc = tool.getDescription();
        assertNotNull(desc);
        assertTrue(desc.contains("Office"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("path"));
        assertTrue(schema.contains("data"));
        assertTrue(schema.contains("format"));
        assertTrue(schema.contains("overwrite"));
        assertTrue(schema.contains("docx"));
        assertTrue(schema.contains("pptx"));
    }

    @Test
    void testRequiresFileLock() {
        assertTrue(tool.requiresFileLock());
    }

    // ==================== 参数验证 ====================

    @Test
    void testMissingPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.set("data", objectMapper.createObjectNode());

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testNullPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("path");
        args.set("data", objectMapper.createObjectNode());

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testMissingData() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", tempDir.resolve("test.xlsx").toString());

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testNullData() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", tempDir.resolve("test.xlsx").toString());
        args.putNull("data");

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    // ==================== 格式推断 ====================

    @Test
    void testUnsupportedExtension() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", tempDir.resolve("test.txt").toString());
        args.set("data", createXlsxData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(tempDir.resolve("test.txt"));

            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("无法从文件名推断格式"));
        }
    }

    @Test
    void testInvalidFormatParam() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", tempDir.resolve("test.foo").toString());
        args.put("format", "pdf");
        args.set("data", createXlsxData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(tempDir.resolve("test.foo"));

            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("不支持的格式"));
        }
    }

    // ==================== 文件已存在（无 overwrite） ====================

    @Test
    void testFileExistsWithoutOverwrite() throws Exception {
        Path xlsxFile = tempDir.resolve("exists.xlsx");
        createMinimalXlsx(xlsxFile, new String[][]{{"a"}});

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", xlsxFile.toString());
        args.set("data", createXlsxData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("文件已存在"));
            assertTrue(ex.getMessage().contains("overwrite=true"));
        }
    }

    // ==================== XLSX 写入 ====================

    @Test
    void testWriteXlsx_basic() throws Exception {
        Path xlsxFile = tempDir.resolve("output.xlsx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", xlsxFile.toString());
        args.set("data", createXlsxData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("output.xlsx");

            String result = tool.execute(args);
            assertTrue(result.contains("XLSX"));
            assertTrue(result.contains("创建"));
        }

        // 验证文件可读
        assertTrue(Files.exists(xlsxFile));
        assertTrue(Files.size(xlsxFile) > 0);

        // 用 POI 验证内容
        try (Workbook wb = new XSSFWorkbook(new FileInputStream(xlsxFile.toFile()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertEquals("Test Sheet", sheet.getSheetName());
            assertEquals("Name", sheet.getRow(0).getCell(0).getStringCellValue());
            assertEquals("Value", sheet.getRow(0).getCell(1).getStringCellValue());
            assertEquals("Alice", sheet.getRow(1).getCell(0).getStringCellValue());
            assertEquals("100", sheet.getRow(1).getCell(1).getStringCellValue());
        }
    }

    @Test
    void testWriteXlsx_multipleSheets() throws Exception {
        Path xlsxFile = tempDir.resolve("multi.xlsx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", xlsxFile.toString());
        args.set("data", createMultiSheetData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("multi.xlsx");

            String result = tool.execute(args);
            assertTrue(result.contains("2 个 Sheet"));
        }

        try (Workbook wb = new XSSFWorkbook(new FileInputStream(xlsxFile.toFile()))) {
            assertEquals(2, wb.getNumberOfSheets());
            assertEquals("Sheet A", wb.getSheetAt(0).getSheetName());
            assertEquals("Sheet B", wb.getSheetAt(1).getSheetName());
            // 表头 + 数据行：Sheet A 有 header + 2 行 = 3，Sheet B 有 header + 1 行 = 2
            assertEquals(3, wb.getSheetAt(0).getPhysicalNumberOfRows());
            assertEquals(2, wb.getSheetAt(1).getPhysicalNumberOfRows());
        }
    }

    @Test
    void testWriteXlsx_withoutHeaders() throws Exception {
        Path xlsxFile = tempDir.resolve("noheader.xlsx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", xlsxFile.toString());
        args.set("data", createXlsxDataNoHeaders());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("noheader.xlsx");

            tool.execute(args);
        }

        try (Workbook wb = new XSSFWorkbook(new FileInputStream(xlsxFile.toFile()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertEquals("Alice", sheet.getRow(0).getCell(0).getStringCellValue());
            assertEquals("Bob", sheet.getRow(1).getCell(0).getStringCellValue());
        }
    }

    @Test
    void testWriteXlsx_overwrite() throws Exception {
        Path xlsxFile = tempDir.resolve("overwrite.xlsx");
        createMinimalXlsx(xlsxFile, new String[][]{{"old"}});

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", xlsxFile.toString());
        args.put("overwrite", true);
        args.set("data", createXlsxData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("overwrite.xlsx");

            String result = tool.execute(args);
            assertTrue(result.contains("覆盖"));
        }

        try (Workbook wb = new XSSFWorkbook(new FileInputStream(xlsxFile.toFile()))) {
            assertEquals("Alice", wb.getSheetAt(0).getRow(1).getCell(0).getStringCellValue());
        }
    }

    @Test
    void testWriteXlsx_emptySheetsArray() throws Exception {
        Path xlsxFile = tempDir.resolve("empty.xlsx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", xlsxFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        data.set("sheets", objectMapper.createArrayNode());
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("sheets"));
        }
    }

    @Test
    void testWriteXlsx_missingRows() throws Exception {
        Path xlsxFile = tempDir.resolve("norows.xlsx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", xlsxFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        ArrayNode sheets = objectMapper.createArrayNode();
        ObjectNode sheet = objectMapper.createObjectNode();
        sheet.put("name", "Bad");
        sheets.add(sheet);
        data.set("sheets", sheets);
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);

            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("rows"));
        }
    }

    @Test
    void testWriteXlsx_withFormatParam() throws Exception {
        Path xlsxFile = tempDir.resolve("output.notxlsx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", xlsxFile.toString());
        args.put("format", "xlsx");
        args.set("data", createXlsxData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(xlsxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("output.notxlsx");

            String result = tool.execute(args);
            assertTrue(result.contains("XLSX"));
        }

        assertTrue(Files.exists(xlsxFile));
    }

    // ==================== CSV 写入 ====================

    @Test
    void testWriteCsv_basic() throws Exception {
        Path csvFile = tempDir.resolve("output.csv");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", csvFile.toString());
        args.set("data", createCsvData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("output.csv");

            String result = tool.execute(args);
            assertTrue(result.contains("CSV"));
            assertTrue(result.contains("创建"));
        }

        String content = Files.readString(csvFile, StandardCharsets.UTF_8);
        assertTrue(content.contains("Name,Value") || content.contains("Name"));
        assertTrue(content.contains("Alice"));
        assertTrue(content.contains("Bob"));
    }

    @Test
    void testWriteCsv_withoutHeaders() throws Exception {
        Path csvFile = tempDir.resolve("noheader.csv");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", csvFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        ArrayNode rows = objectMapper.createArrayNode();
        rows.add(array("Alice", "100"));
        rows.add(array("Bob", "200"));
        data.set("rows", rows);
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("noheader.csv");

            tool.execute(args);
        }

        String content = Files.readString(csvFile, StandardCharsets.UTF_8);
        assertFalse(content.contains("Name,Value"));
        assertTrue(content.contains("Alice,100"));
    }

    @Test
    void testWriteCsv_emptyRows() throws Exception {
        Path csvFile = tempDir.resolve("empty.csv");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", csvFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        data.set("rows", objectMapper.createArrayNode());
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);

            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("rows"));
        }
    }

    @Test
    void testWriteCsv_overwrite() throws Exception {
        Path csvFile = tempDir.resolve("overwrite.csv");
        Files.writeString(csvFile, "old,data", StandardCharsets.UTF_8);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", csvFile.toString());
        args.put("overwrite", true);
        args.set("data", createCsvData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("overwrite.csv");

            String result = tool.execute(args);
            assertTrue(result.contains("覆盖"));
        }

        String content = Files.readString(csvFile, StandardCharsets.UTF_8);
        assertTrue(content.contains("Alice"));
        assertFalse(content.contains("old"));
    }

    @Test
    void testWriteCsv_withFormatParam() throws Exception {
        Path csvFile = tempDir.resolve("output.notcsv");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", csvFile.toString());
        args.put("format", "csv");
        args.set("data", createCsvData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("output.notcsv");

            String result = tool.execute(args);
            assertTrue(result.contains("CSV"));
        }

        assertTrue(Files.exists(csvFile));
    }

    @Test
    void testWriteCsv_escaping() throws Exception {
        Path csvFile = tempDir.resolve("escape.csv");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", csvFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        data.set("headers", array("Name", "Note"));
        ArrayNode rows = objectMapper.createArrayNode();
        rows.add(array("Alice", "has, comma"));
        rows.add(array("Bob", "has \"quote\""));
        data.set("rows", rows);
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(csvFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("escape.csv");

            tool.execute(args);
        }

        String content = Files.readString(csvFile, StandardCharsets.UTF_8);
        assertTrue(content.contains("\"has, comma\""));
        assertTrue(content.contains("\"has \"\"quote\"\"\""));
    }

    // ==================== DOCX 写入 ====================

    @Test
    void testWriteDocx_basic() throws Exception {
        Path docxFile = tempDir.resolve("output.docx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", docxFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        data.put("content", "# My Title\n\nThis is a paragraph.\n\n| Col1 | Col2 |\n|------|------|\n| A | B |\n| C | D |");
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(docxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("output.docx");

            String result = tool.execute(args);
            assertTrue(result.contains("DOCX"));
            assertTrue(result.contains("创建"));
        }

        // POI 验证内容
        try (XWPFDocument doc = new XWPFDocument(new java.io.FileInputStream(docxFile.toFile()))) {
            List<XWPFParagraph> paras = doc.getParagraphs();
            // 至少应有标题 + 段落 + 表格行产生的段落
            assertTrue(paras.size() >= 2);
            boolean hasTitle = paras.stream().anyMatch(p -> "My Title".equals(p.getText()));
            assertTrue(hasTitle);
            boolean hasContent = paras.stream().anyMatch(p -> "This is a paragraph.".equals(p.getText()));
            assertTrue(hasContent);
        }
    }

    @Test
    void testWriteDocx_missingContent() throws Exception {
        Path docxFile = tempDir.resolve("missing.docx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", docxFile.toString());
        args.set("data", objectMapper.createObjectNode());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(docxFile);

            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("content"));
        }
    }

    @Test
    void testWriteDocx_withFormatParam() throws Exception {
        Path docxFile = tempDir.resolve("output.notdocx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", docxFile.toString());
        args.put("format", "docx");

        ObjectNode data = objectMapper.createObjectNode();
        data.put("content", "# Hello");
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(docxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("output.notdocx");

            String result = tool.execute(args);
            assertTrue(result.contains("DOCX"));
        }

        assertTrue(Files.exists(docxFile));
    }

    @Test
    void testWriteDocx_overwrite() throws Exception {
        Path docxFile = tempDir.resolve("overwrite.docx");
        // 创建初始 DOCX
        try (XWPFDocument doc = new XWPFDocument()) {
            doc.createParagraph().createRun().setText("old");
            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(docxFile.toFile())) {
                doc.write(fos);
            }
        }

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", docxFile.toString());
        args.put("overwrite", true);

        ObjectNode data = objectMapper.createObjectNode();
        data.put("content", "# New Title");
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(docxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("overwrite.docx");

            String result = tool.execute(args);
            assertTrue(result.contains("覆盖"));
        }

        // 验证内容已更新
        try (XWPFDocument doc = new XWPFDocument(new java.io.FileInputStream(docxFile.toFile()))) {
            boolean hasNew = doc.getParagraphs().stream().anyMatch(p -> "New Title".equals(p.getText()));
            assertTrue(hasNew);
            boolean hasOld = doc.getParagraphs().stream().anyMatch(p -> "old".equals(p.getText()));
            assertFalse(hasOld);
        }
    }

    @Test
    void testWriteDocx_emptyContent() throws Exception {
        Path docxFile = tempDir.resolve("empty.docx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", docxFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        data.put("content", "");
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(docxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("empty.docx");

            // 空内容应该写入成功（生成空白文档）
            String result = tool.execute(args);
            assertTrue(result.contains("DOCX"));
            assertTrue(Files.exists(docxFile));
        }
    }

    // ==================== PPTX 写入 ====================

    @Test
    void testWritePptx_basic() throws Exception {
        Path pptxFile = tempDir.resolve("output.pptx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", pptxFile.toString());
        args.set("data", createPptxData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(pptxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("output.pptx");

            String result = tool.execute(args);
            assertTrue(result.contains("PPTX"));
            assertTrue(result.contains("创建"));
        }

        // POI 验证内容
        try (XMLSlideShow ppt = new XMLSlideShow(new java.io.FileInputStream(pptxFile.toFile()))) {
            assertEquals(2, ppt.getSlides().size());
            // 验证第一张幻灯片有标题
            XSLFSlide slide1 = ppt.getSlides().get(0);
            boolean hasTitle = slide1.getShapes().stream()
                    .anyMatch(s -> s instanceof XSLFTextShape
                            && "Slide 1".equals(((XSLFTextShape) s).getText()));
            assertTrue(hasTitle);
        }
    }

    @Test
    void testWritePptx_withBullets() throws Exception {
        Path pptxFile = tempDir.resolve("bullets.pptx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", pptxFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        ArrayNode slides = objectMapper.createArrayNode();
        ObjectNode slide = objectMapper.createObjectNode();
        slide.put("title", "Bullet Slide");
        ArrayNode bullets = objectMapper.createArrayNode();
        bullets.add("Item 1");
        bullets.add("Item 2");
        bullets.add("Item 3");
        slide.set("bullets", bullets);
        slides.add(slide);
        data.set("slides", slides);
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(pptxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("bullets.pptx");

            String result = tool.execute(args);
            assertTrue(result.contains("PPTX"));
        }

        try (XMLSlideShow ppt = new XMLSlideShow(new java.io.FileInputStream(pptxFile.toFile()))) {
            assertEquals(1, ppt.getSlides().size());
        }
    }

    @Test
    void testWritePptx_withTable() throws Exception {
        Path pptxFile = tempDir.resolve("table.pptx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", pptxFile.toString());

        ObjectNode data = objectMapper.createObjectNode();
        ArrayNode slides = objectMapper.createArrayNode();
        ObjectNode slide = objectMapper.createObjectNode();
        slide.put("title", "Data Slide");
        slide.put("content", "Quarterly results");

        ObjectNode table = objectMapper.createObjectNode();
        table.set("headers", array("Q", "Revenue"));
        ArrayNode rows = objectMapper.createArrayNode();
        rows.add(array("Q1", "100"));
        rows.add(array("Q2", "200"));
        table.set("rows", rows);
        slide.set("table", table);

        slides.add(slide);
        data.set("slides", slides);
        args.set("data", data);

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(pptxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("table.pptx");

            String result = tool.execute(args);
            assertTrue(result.contains("PPTX"));
        }

        assertTrue(Files.exists(pptxFile));
    }

    @Test
    void testWritePptx_missingSlides() throws Exception {
        Path pptxFile = tempDir.resolve("missing.pptx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", pptxFile.toString());
        args.set("data", objectMapper.createObjectNode());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(pptxFile);

            ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(ex.getMessage().contains("slides"));
        }
    }

    @Test
    void testWritePptx_withFormatParam() throws Exception {
        Path pptxFile = tempDir.resolve("output.notpptx");

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", pptxFile.toString());
        args.put("format", "pptx");
        args.set("data", createPptxData());

        try (MockedStatic<PathSecurityUtils> suMock = mockStatic(PathSecurityUtils.class)) {
            suMock.when(() -> PathSecurityUtils.validateAndResolve(anyString()))
                    .thenReturn(pptxFile);
            suMock.when(() -> PathSecurityUtils.getRelativePath(any()))
                    .thenReturn("output.notpptx");

            String result = tool.execute(args);
            assertTrue(result.contains("PPTX"));
        }

        assertTrue(Files.exists(pptxFile));
    }

    // ==================== 辅助方法 ====================

    private ObjectNode createXlsxData() {
        ObjectNode data = objectMapper.createObjectNode();
        ArrayNode sheets = objectMapper.createArrayNode();

        ObjectNode sheet = objectMapper.createObjectNode();
        sheet.put("name", "Test Sheet");
        sheet.set("headers", array("Name", "Value"));

        ArrayNode rows = objectMapper.createArrayNode();
        rows.add(array("Alice", "100"));
        rows.add(array("Bob", "200"));
        sheet.set("rows", rows);

        sheets.add(sheet);
        data.set("sheets", sheets);
        return data;
    }

    private ObjectNode createMultiSheetData() {
        ObjectNode data = objectMapper.createObjectNode();
        ArrayNode sheets = objectMapper.createArrayNode();

        ObjectNode sheet1 = objectMapper.createObjectNode();
        sheet1.put("name", "Sheet A");
        sheet1.set("headers", array("X"));
        ArrayNode rows1 = objectMapper.createArrayNode();
        rows1.add(array("1"));
        rows1.add(array("2"));
        sheet1.set("rows", rows1);

        ObjectNode sheet2 = objectMapper.createObjectNode();
        sheet2.put("name", "Sheet B");
        sheet2.set("headers", array("Y"));
        ArrayNode rows2 = objectMapper.createArrayNode();
        rows2.add(array("3"));
        sheet2.set("rows", rows2);

        sheets.add(sheet1);
        sheets.add(sheet2);
        data.set("sheets", sheets);
        return data;
    }

    private ObjectNode createXlsxDataNoHeaders() {
        ObjectNode data = objectMapper.createObjectNode();
        ArrayNode sheets = objectMapper.createArrayNode();
        ObjectNode sheet = objectMapper.createObjectNode();
        sheet.put("name", "Data Only");
        ArrayNode rows = objectMapper.createArrayNode();
        rows.add(array("Alice", "100"));
        rows.add(array("Bob", "200"));
        sheet.set("rows", rows);
        sheets.add(sheet);
        data.set("sheets", sheets);
        return data;
    }

    private ObjectNode createCsvData() {
        ObjectNode data = objectMapper.createObjectNode();
        data.set("headers", array("Name", "Value"));
        ArrayNode rows = objectMapper.createArrayNode();
        rows.add(array("Alice", "100"));
        rows.add(array("Bob", "200"));
        data.set("rows", rows);
        return data;
    }

    private ArrayNode array(String... values) {
        ArrayNode arr = objectMapper.createArrayNode();
        for (String v : values) {
            arr.add(v);
        }
        return arr;
    }

    private ObjectNode createPptxData() {
        ObjectNode data = objectMapper.createObjectNode();
        ArrayNode slides = objectMapper.createArrayNode();

        ObjectNode slide1 = objectMapper.createObjectNode();
        slide1.put("title", "Slide 1");
        slide1.put("content", "This is slide 1 content.");
        slides.add(slide1);

        ObjectNode slide2 = objectMapper.createObjectNode();
        slide2.put("title", "Slide 2");
        ArrayNode bullets = objectMapper.createArrayNode();
        bullets.add("Point A");
        bullets.add("Point B");
        slide2.set("bullets", bullets);
        slides.add(slide2);

        data.set("slides", slides);
        return data;
    }

    private void createMinimalXlsx(Path path, String[][] rows) throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("Test");
            for (int i = 0; i < rows.length; i++) {
                Row row = sheet.createRow(i);
                for (int j = 0; j < rows[i].length; j++) {
                    row.createCell(j).setCellValue(rows[i][j]);
                }
            }
            try (FileOutputStream fos = new FileOutputStream(path.toFile())) {
                wb.write(fos);
            }
        }
    }
}
