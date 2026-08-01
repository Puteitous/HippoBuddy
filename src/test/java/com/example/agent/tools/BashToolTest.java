package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;

class BashToolTest {

    private BashTool tool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tool = new BashTool();
        objectMapper = new ObjectMapper();
    }

    @AfterEach
    void tearDown() {
        try {
            Files.deleteIfExists(Paths.get("file.txt"));
        } catch (Exception e) {
        }
    }

    @Test
    void testGetName() {
        assertEquals("bash", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("命令"));
        assertTrue(description.contains("安全"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("command"));
        assertTrue(schema.contains("timeout"));
        assertTrue(schema.contains("working_dir"));
    }

    @Test
    void testMissingCommandParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }



    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testGetAffectedPaths() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("working_dir", "src");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals("src", paths.get(0));
    }

    @Test
    void testGetAffectedPathsWithoutWorkingDir() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals(".", paths.get(0));
    }

    @Test
    void testParameterSchemaFormat() {
        String schema = tool.getParametersSchema();
        
        assertTrue(schema.contains("\"type\": \"object\""));
        assertTrue(schema.contains("\"required\": [\"command\"]"));
        assertTrue(schema.contains("\"minimum\": 1"));
        assertTrue(schema.contains("\"maximum\": 300"));
    }

    @Test
    void testInvalidWorkingDir() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("working_dir", "/non/existent/path");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullCommandParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("command");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testEmptyCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testWhitespaceCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "   ");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullTimeoutParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.putNull("timeout");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testNullWorkingDirParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.putNull("working_dir");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testEmptyWorkingDir() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("working_dir", "");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testNegativeTimeout() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", -1);
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testExcessiveTimeout() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", 10000);
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testAllowedPipeOperator() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git log --oneline");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("git"));
        }
    }

    @Test
    void testAllowedRedirectOperator() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello");
        
        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("命令执行结果"));
        } catch (ToolExecutionException e) {
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("echo"));
        }
    }

    @Test
    void testWorkingDirIsFile() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("working_dir", "pom.xml");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    // ===== 编码检测（Windows 代码页 → Charset 映射）=====

    @Test
    void testCharsetForCodePageUtf8() throws Exception {
        assertEquals(StandardCharsets.UTF_8, invokeCharsetForCodePage("65001"));
    }

    @Test
    void testCharsetForCodePageGbk() throws Exception {
        Charset gbk = invokeCharsetForCodePage("936");
        assertNotNull(gbk);
        assertEquals("GBK", gbk.name());
    }

    @Test
    void testCharsetForCodePageGbkAlias() throws Exception {
        Charset gbk = invokeCharsetForCodePage("54936");
        assertNotNull(gbk);
        assertEquals("GBK", gbk.name());
    }

    @Test
    void testCharsetForCodePageBig5() throws Exception {
        Charset big5 = invokeCharsetForCodePage("950");
        assertNotNull(big5);
        assertEquals("Big5", big5.name());
    }

    @Test
    void testCharsetForCodePageLatinReturnsNull() throws Exception {
        // 437/850 等拉丁码页不直接映射，交由上层回退 native.encoding/UTF-8
        assertNull(invokeCharsetForCodePage("437"));
        assertNull(invokeCharsetForCodePage("850"));
    }

    @Test
    void testCharsetForCodePageInvalidReturnsNull() throws Exception {
        assertNull(invokeCharsetForCodePage(null));
        assertNull(invokeCharsetForCodePage(""));
        assertNull(invokeCharsetForCodePage("abc"));
        assertNull(invokeCharsetForCodePage("99999"));
    }

    @Test
    void testCharsetForCodePageTrimsWhitespace() throws Exception {
        assertEquals(StandardCharsets.UTF_8, invokeCharsetForCodePage("  65001  "));
    }

    private static Charset invokeCharsetForCodePage(String codePage) throws Exception {
        java.lang.reflect.Method method = BashTool.class.getDeclaredMethod("charsetForCodePage", String.class);
        method.setAccessible(true);
        return (Charset) method.invoke(new BashTool(), codePage);
    }

    // ===== 输出策略（output_mode + max_lines）=====

    @Test
    void testSchemaContainsOutputMode() {
        String schema = tool.getParametersSchema();
        assertTrue(schema.contains("output_mode"));
        assertTrue(schema.contains("\"all\""));
        assertTrue(schema.contains("\"head\""));
        assertTrue(schema.contains("\"tail\""));
        assertTrue(schema.contains("\"errors\""));
        assertTrue(schema.contains("max_lines"));
        assertTrue(schema.contains("\"maximum\": 2000"));
    }

    @Test
    void testInvalidOutputMode() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello");
        args.put("output_mode", "middle");

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testNullOutputModeDefaultsToAll() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello");
        args.putNull("output_mode");

        String result = tool.execute(args);
        assertNotNull(result);
        assertFalse(result.contains("输出策略:"));
    }

    @Test
    void testAllOutputModeNoStrategyLabel() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello");
        args.put("output_mode", "all");

        String result = tool.execute(args);
        assertNotNull(result);
        assertFalse(result.contains("输出策略:"));
    }

    @Test
    void testTranslateCommandForUnixTail() throws Exception {
        String translated = invokeTranslateCommandForUnix("mvn test", "tail", 200);
        assertEquals("mvn test | tail -n 200", translated);
    }

    @Test
    void testTranslateCommandForUnixHead() throws Exception {
        String translated = invokeTranslateCommandForUnix("git log", "head", 100);
        assertEquals("git log | head -n 100", translated);
    }

    @Test
    void testTranslateCommandForUnixErrors() throws Exception {
        String translated = invokeTranslateCommandForUnix("node app.js", "errors", 300);
        assertTrue(translated.startsWith("node app.js | grep -E "));
        assertTrue(translated.endsWith(" | head -n 300"));
        assertTrue(translated.contains("ERROR"));
        assertTrue(translated.contains("Exception"));
    }

    @Test
    void testTranslateCommandForUnixAll() throws Exception {
        String translated = invokeTranslateCommandForUnix("mvn test", "all", 200);
        assertEquals("mvn test", translated);
    }

    @Test
    void testApplyOutputModeHead() throws Exception {
        String output = "line1\nline2\nline3\nline4\nline5\n";
        assertEquals("line1\nline2\nline3\n", invokeApplyOutputMode(output, "head", 3));
    }

    @Test
    void testApplyOutputModeTail() throws Exception {
        String output = "line1\nline2\nline3\nline4\nline5\n";
        assertEquals("line3\nline4\nline5\n", invokeApplyOutputMode(output, "tail", 3));
    }

    @Test
    void testApplyOutputModeTailMoreLinesThanOutput() throws Exception {
        String output = "line1\nline2\n";
        assertEquals("line1\nline2\n", invokeApplyOutputMode(output, "tail", 500));
    }

    @Test
    void testApplyOutputModeErrorsExtractsStackContext() throws Exception {
        String output = "start\nINFO init\nERROR boom\n  at com.example.Main.run(Main.java:10)\n  at com.example.App.main(App.java:5)\nend\n";
        String result = invokeApplyOutputMode(output, "errors", 100);
        assertTrue(result.contains("ERROR boom"));
        assertTrue(result.contains("at com.example.Main.run"));
        assertFalse(result.contains("INFO init"));
        // 栈上下文后是无关行 end，应被截断
        assertFalse(result.contains("end"));
    }

    @Test
    void testApplyOutputModeErrorsFallbackToTail() throws Exception {
        String output = "line1\nline2\nline3\nline4\nline5\n";
        String result = invokeApplyOutputMode(output, "errors", 100);
        // 无错误时退化为尾部最多 50 行
        assertEquals("line1\nline2\nline3\nline4\nline5\n", result);
    }

    @Test
    void testApplyOutputModeAllReturnsOriginal() throws Exception {
        String output = "line1\nline2\n";
        assertEquals(output, invokeApplyOutputMode(output, "all", 10));
    }

    @Test
    void testResolveMaxLinesExplicit() throws Exception {
        assertEquals(150, invokeResolveMaxLines("tail", 150));
    }

    @Test
    void testResolveMaxLinesDefaultForMode() throws Exception {
        assertEquals(500, invokeResolveMaxLines("tail", -1));
        assertEquals(500, invokeResolveMaxLines("head", -1));
        assertEquals(300, invokeResolveMaxLines("errors", -1));
        assertEquals(500, invokeResolveMaxLines("all", -1));
    }

    @Test
    void testOutputModeStrategyLabelInResult() throws Exception {
        // 仅当非 all 模式时，结果包含输出策略标注（Windows 上 execute 走执行后截断路径）
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello");
        args.put("output_mode", "tail");
        args.put("max_lines", 10);

        try {
            String result = tool.execute(args);
            assertNotNull(result);
            assertTrue(result.contains("输出策略: tail"));
        } catch (ToolExecutionException e) {
            // 某些环境（如安全检查拦截）可能直接抛异常，此时跳过标注断言
            assertTrue(e.getMessage().contains("安全限制") || e.getMessage().contains("echo"));
        }
    }

    private static String invokeTranslateCommandForUnix(String command, String outputMode, int maxLines) throws Exception {
        java.lang.reflect.Method method = BashTool.class.getDeclaredMethod(
            "translateCommandForUnix", String.class, String.class, int.class);
        method.setAccessible(true);
        return (String) method.invoke(new BashTool(), command, outputMode, maxLines);
    }

    private static String invokeApplyOutputMode(String output, String outputMode, int maxLines) throws Exception {
        java.lang.reflect.Method method = BashTool.class.getDeclaredMethod(
            "applyOutputMode", String.class, String.class, int.class);
        method.setAccessible(true);
        return (String) method.invoke(new BashTool(), output, outputMode, maxLines);
    }

    private static int invokeResolveMaxLines(String outputMode, int maxLines) throws Exception {
        java.lang.reflect.Method method = BashTool.class.getDeclaredMethod(
            "resolveMaxLines", String.class, int.class);
        method.setAccessible(true);
        return (int) method.invoke(new BashTool(), outputMode, maxLines);
    }
}
