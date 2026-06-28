package com.example.agent.tools;

import com.example.agent.config.Config;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 覆盖 LintDiagnosticsTool 的核心解析逻辑：正则匹配、路径缩短、参数获取。
 * 不依赖外部进程（不调用 exec），只测解析层。
 */
@DisplayName("LintDiagnosticsTool 解析逻辑测试")
class LintDiagnosticsToolTest {

    private LintDiagnosticsTool tool;
    private Method parseJavaOutput;
    private Method parseHtmlValidateOutput;
    private Method parseStylelintOutput;
    private Method shortenPath;
    private Method parseIntMethod;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        tool = new LintDiagnosticsTool();

        parseJavaOutput = LintDiagnosticsTool.class.getDeclaredMethod("parseJavaOutput", String.class);
        parseJavaOutput.setAccessible(true);

        parseHtmlValidateOutput = LintDiagnosticsTool.class.getDeclaredMethod("parseHtmlValidateOutput", String.class);
        parseHtmlValidateOutput.setAccessible(true);

        parseStylelintOutput = LintDiagnosticsTool.class.getDeclaredMethod("parseStylelintOutput", String.class);
        parseStylelintOutput.setAccessible(true);

        shortenPath = LintDiagnosticsTool.class.getDeclaredMethod("shortenPath", String.class);
        shortenPath.setAccessible(true);

        parseIntMethod = LintDiagnosticsTool.class.getDeclaredMethod("parseInt", String.class);
        parseIntMethod.setAccessible(true);
    }

    @SuppressWarnings("unchecked")
    private List<LintDiagnosticsTool.Diagnostic> invokeParseJava(String output) throws Exception {
        return (List<LintDiagnosticsTool.Diagnostic>) parseJavaOutput.invoke(tool, output);
    }

    @SuppressWarnings("unchecked")
    private List<LintDiagnosticsTool.Diagnostic> invokeParseHtmlValidate(String output) throws Exception {
        return (List<LintDiagnosticsTool.Diagnostic>) parseHtmlValidateOutput.invoke(tool, output);
    }

    @SuppressWarnings("unchecked")
    private List<LintDiagnosticsTool.Diagnostic> invokeParseStylelint(String output) throws Exception {
        return (List<LintDiagnosticsTool.Diagnostic>) parseStylelintOutput.invoke(tool, output);
    }

    private String invokeShortenPath(String path) throws Exception {
        return (String) shortenPath.invoke(tool, path);
    }

    private int invokeParseInt(String s) throws Exception {
        return (int) parseIntMethod.invoke(tool, s);
    }

    // ==================== 正则匹配 (JAVA_ERROR) ====================

    @Nested
    @DisplayName("JAVA_ERROR 正则匹配")
    class JavaErrorRegexTest {

        private final Pattern JAVA_ERROR = Pattern.compile(
            "^(.+\\.java):(\\d+):\\s*(error|warning):\\s*(.+)$", Pattern.MULTILINE);

        @Test
        @DisplayName("简单错误行")
        void testSimpleError() {
            String input = "TestLint.java:5: error: ';' expected\n";
            var m = JAVA_ERROR.matcher(input);
            assertTrue(m.find(), "应匹配简单错误行");
            assertEquals("TestLint.java", m.group(1));
            assertEquals("5", m.group(2));
            assertEquals("error", m.group(3));
            assertEquals("';' expected", m.group(4).trim());
        }

        @Test
        @DisplayName("警告行")
        void testWarning() {
            String input = "TestLint.java:10: warning: [unchecked] unchecked cast\n";
            var m = JAVA_ERROR.matcher(input);
            assertTrue(m.find(), "应匹配警告行");
            assertEquals("10", m.group(2));
            assertEquals("warning", m.group(3));
            assertTrue(m.group(4).contains("unchecked"));
        }

        @Test
        @DisplayName("Windows 反斜杠路径")
        void testWindowsBackslashPath() {
            String input = "C:\\Users\\test\\TestLint.java:5: error: ';' expected\n";
            var m = JAVA_ERROR.matcher(input);
            assertTrue(m.find(), "应匹配 Windows 反斜杠路径");
            assertTrue(m.group(1).contains("C:\\Users\\test\\TestLint.java"));
            assertEquals("5", m.group(2));
        }

        @Test
        @DisplayName("Windows 路径含有空格")
        void testWindowsPathWithSpaces() {
            String input = "D:\\my project\\src\\TestLint.java:8: error: cannot find symbol\n";
            var m = JAVA_ERROR.matcher(input);
            assertTrue(m.find(), "应匹配含空格的 Windows 路径");
            assertTrue(m.group(1).contains("my project"));
            assertEquals("8", m.group(2));
        }

        @Test
        @DisplayName("Unix 路径")
        void testUnixPath() {
            String input = "/home/user/src/TestLint.java:3: error: class, interface, or enum expected\n";
            var m = JAVA_ERROR.matcher(input);
            assertTrue(m.find(), "应匹配 Unix 路径");
            assertEquals("3", m.group(2));
        }

        @Test
        @DisplayName("多行输出含多个错误")
        void testMultipleErrors() {
            String input = "TestLint.java:5: error: ';' expected\n" +
                "TestLint.java:10: warning: [deprecation] getDate in Date has been deprecated\n" +
                "TestLint.java:12: error: cannot find symbol\n" +
                "  symbol:   method length()\n" +
                "  location: variable str of type String\n";
            var m = JAVA_ERROR.matcher(input);
            int count = 0;
            while (m.find()) count++;
            assertEquals(3, count, "应匹配到 3 条诊断");
        }

        @Test
        @DisplayName("不相关的输出不应匹配")
        void testNoMatch() {
            String input = "Note: Some input files use unchecked or unsafe operations.\n" +
                "Note: Recompile with -Xlint:unchecked for details.\n";
            var m = JAVA_ERROR.matcher(input);
            assertFalse(m.find(), "Notes 不应匹配 error/warning");
        }

        @Test
        @DisplayName("javac 错误详情行不应匹配")
        void testDetailLinesShouldNotMatch() {
            String input = "TestLint.java:5: error: ';' expected\n" +
                "    System.out.println(\"Hello\")\n" +
                "                                ^\n";
            var m = JAVA_ERROR.matcher(input);
            int count = 0;
            while (m.find()) count++;
            assertEquals(1, count, "只有第一行应被匹配，详情行和箭头行不应匹配");
        }
    }

    // ==================== HTML_VALIDATE 正则匹配 ====================

    @Nested
    @DisplayName("HTML_VALIDATE 正则匹配")
    class HtmlValidateRegexTest {

        private final Pattern HTML_VALIDATE = Pattern.compile(
            "^(.+\\.html?):(\\d+):(\\d+):\\s*(error|warning):\\s*(.+)$", Pattern.MULTILINE);

        @Test
        @DisplayName("标准错误行")
        void testSimpleError() {
            String input = "index.html:15:3: error: Element 'div' is not closed\n";
            var m = HTML_VALIDATE.matcher(input);
            assertTrue(m.find());
            assertEquals("index.html", m.group(1));
            assertEquals("15", m.group(2));
            assertEquals("3", m.group(3));
            assertEquals("error", m.group(4));
            assertTrue(m.group(5).contains("not closed"));
        }

        @Test
        @DisplayName("警告行")
        void testWarning() {
            String input = "index.html:23:1: warning: Section lacks heading\n";
            var m = HTML_VALIDATE.matcher(input);
            assertTrue(m.find());
            assertEquals("warning", m.group(4));
        }

        @Test
        @DisplayName("含 .htm 扩展名")
        void testHtmExtension() {
            String input = "page.htm:5:2: error: Missing lang attribute\n";
            var m = HTML_VALIDATE.matcher(input);
            assertTrue(m.find());
            assertEquals("page.htm", m.group(1));
        }

        @Test
        @DisplayName("多行输出匹配多条")
        void testMultipleErrors() {
            String input = "a.html:1:1: error: First error\n" +
                "b.html:2:2: warning: Second warning\n" +
                "c.html:3:3: error: Third error\n";
            var m = HTML_VALIDATE.matcher(input);
            int count = 0;
            while (m.find()) count++;
            assertEquals(3, count);
        }

        @Test
        @DisplayName("无关输出不应匹配")
        void testNoMatch() {
            String input = "Some random output\nNo colon format here\n";
            var m = HTML_VALIDATE.matcher(input);
            assertFalse(m.find());
        }
    }

    // ==================== parseHtmlValidateOutput ====================

    @Nested
    @DisplayName("parseHtmlValidateOutput 解析")
    class ParseHtmlValidateOutputTest {

        @Test
        @DisplayName("空输入返回空")
        void testEmptyInput() throws Exception {
            assertTrue(invokeParseHtmlValidate("").isEmpty());
        }

        @Test
        @DisplayName("错误输出正确解析")
        void testErrorOutput() throws Exception {
            String output = "index.html:15:3: error: Element 'div' is not closed\n" +
                "index.html:23:1: warning: Section lacks heading\n";
            var results = invokeParseHtmlValidate(output);
            assertEquals(2, results.size());
            assertEquals("error", results.get(0).severity);
            assertEquals(15, results.get(0).line);
            assertEquals(3, results.get(0).column);
            assertEquals("warning", results.get(1).severity);
            assertEquals(23, results.get(1).line);
        }
    }

    // ==================== parseStylelintOutput ====================

    @Nested
    @DisplayName("parseStylelintOutput 解析")
    class ParseStylelintOutputTest {

        @Test
        @DisplayName("空输入返回空")
        void testEmptyInput() throws Exception {
            assertTrue(invokeParseStylelint("").isEmpty());
        }

        @Test
        @DisplayName("标准 JSON 输出解析")
        void testStandardOutput() throws Exception {
            String json = """
                [{
                    "source": "/home/user/style.css",
                    "warnings": [{
                        "line": 5,
                        "column": 1,
                        "severity": "error",
                        "rule": "block-no-empty",
                        "text": "Unexpected empty block (block-no-empty)"
                    },{
                        "line": 10,
                        "column": 3,
                        "severity": "warning",
                        "rule": "declaration-block-no-duplicate-properties",
                        "text": "Duplicate property (declaration-block-no-duplicate-properties)"
                    }]
                }]
                """;
            var results = invokeParseStylelint(json);
            assertEquals(2, results.size());
            assertEquals("error", results.get(0).severity);
            assertEquals(5, results.get(0).line);
            assertTrue(results.get(0).message.contains("block-no-empty"));
            assertEquals("warning", results.get(1).severity);
            assertEquals(10, results.get(1).line);
        }

        @Test
        @DisplayName("空 warnings 数组")
        void testEmptyWarnings() throws Exception {
            String json = """
                [{
                    "source": "test.css",
                    "warnings": []
                }]
                """;
            var results = invokeParseStylelint(json);
            assertTrue(results.isEmpty());
        }

        @Test
        @DisplayName("非 JSON 输出返回空")
        void testInvalidJson() throws Exception {
            var results = invokeParseStylelint("not json at all");
            assertTrue(results.isEmpty());
        }
    }

    // ==================== parseJavaOutput 反射测试 ====================

    @Nested
    @DisplayName("parseJavaOutput 完整解析")
    class ParseJavaOutputTest {

        @Test
        @DisplayName("空输入返回空列表")
        void testEmptyInput() throws Exception {
            assertTrue(invokeParseJava("").isEmpty());
        }

        @Test
        @DisplayName("纯 Notes 输出返回空列表")
        void testNotesOnly() throws Exception {
            String output = "Note: Some messages have been simplified.\n" +
                "Note: Recompile with -Xlint:all for details.\n";
            assertTrue(invokeParseJava(output).isEmpty());
        }

        @Test
        @DisplayName("标准 javac 错误输出应正确解析")
        void testStandardErrorOutput() throws Exception {
            String output = "TestLint.java:5: error: ';' expected\n" +
                "    System.out.println(\"Hello\")\n" +
                "                                ^\n" +
                "TestLint.java:10: warning: [deprecation] getDate in Date has been deprecated\n";
            var results = invokeParseJava(output);
            assertEquals(2, results.size());

            var err = results.get(0);
            assertEquals("error", err.severity);
            assertEquals(5, err.line);
            assertTrue(err.message.contains(";' expected"));

            var warn = results.get(1);
            assertEquals("warning", warn.severity);
            assertEquals(10, warn.line);
        }

        @Test
        @DisplayName("Windows 全路径应正确解析")
        void testWindowsFullPath() throws Exception {
            String output = "E:\\Trae_projects\\Hippo Code\\TestLint.java:5: error: ';' expected\n";
            var results = invokeParseJava(output);
            assertEquals(1, results.size());
            assertEquals(5, results.get(0).line);
            assertEquals("error", results.get(0).severity);
        }

        @Test
        @DisplayName("类型错误消息")
        void testCannotFindSymbol() throws Exception {
            String output = "TestLint.java:12: error: cannot find symbol\n" +
                "  symbol:   method length()\n" +
                "  location: variable str of type String\n";
            var results = invokeParseJava(output);
            assertEquals(1, results.size());
            assertEquals(12, results.get(0).line);
            assertTrue(results.get(0).message.contains("cannot find symbol"));
        }

        @Test
        @DisplayName("没有错误和警告时返回空")
        void testCleanCompilation() throws Exception {
            // javac 编译成功时的典型输出
            assertTrue(invokeParseJava("").isEmpty());
        }

        @Test
        @DisplayName("中文 javac 输出（Windows 本地化）")
        void testChineseLocalizedOutput() throws Exception {
            String output = "F:\\test\\Hello.java:3: 错误: 需要';'\n" +
                "        System.out.println(\"hi\")\n" +
                "                                ^\n" +
                "1 个错误\n";
            var results = invokeParseJava(output);
            assertEquals(1, results.size());
            assertEquals("error", results.get(0).severity);
            assertEquals(3, results.get(0).line);
            assertTrue(results.get(0).message.contains("需要';'"));
        }

        @Test
        @DisplayName("中英文混合输出（错误+警告）")
        void testMixedChineseEnglish() throws Exception {
            String output = "Hello.java:3: 错误: 需要';'\n" +
                "Hello.java:8: warning: [deprecation] getDate in Date has been deprecated\n" +
                "Hello.java:12: 警告: [unchecked] 未经检查的转换\n";
            var results = invokeParseJava(output);
            assertEquals(3, results.size());
            assertEquals("error", results.get(0).severity);
            assertEquals("warning", results.get(1).severity);
            assertEquals("warning", results.get(2).severity);
        }
    }

    // ==================== shortenPath ====================

    @Nested
    @DisplayName("shortenPath 路径缩短")
    class ShortenPathTest {

        @Test
        @DisplayName("含 /src/ 的路径应截断")
        void testSrcPath() throws Exception {
            String result = invokeShortenPath("/home/user/src/main/java/Test.java");
            assertEquals("src/main/java/Test.java", result);
        }

        @Test
        @DisplayName("Windows 含 /src/ 的路径应截断")
        void testWindowsSrcPath() throws Exception {
            String result = invokeShortenPath("C:/projects/src/main/java/Test.java");
            assertEquals("src/main/java/Test.java", result);
        }

        @Test
        @DisplayName("不含 /src/ 的路径应取文件名")
        void testNoSrcReturnsFilename() throws Exception {
            String result = invokeShortenPath("/home/user/Test.java");
            assertEquals("Test.java", result);
        }

        @Test
        @DisplayName("Windows 不含 /src/ 返回文件名")
        void testWindowsNoSrc() throws Exception {
            String result = invokeShortenPath("C:\\Users\\test\\TestLint.java");
            assertEquals("TestLint.java", result);
        }

        @Test
        @DisplayName("空字符串返回空")
        void testEmptyPath() throws Exception {
            assertEquals("", invokeShortenPath(""));
        }

        @Test
        @DisplayName("null 返回 null")
        void testNullPath() throws Exception {
            // shortenPath 对 null 返回 null
            assertNull(invokeShortenPath(null));
        }
    }

    // ==================== parseInt ====================

    @Nested
    @DisplayName("parseInt 安全解析")
    class ParseIntTest {

        @Test
        @DisplayName("正常数字")
        void testValidNumber() throws Exception {
            assertEquals(42, invokeParseInt("42"));
        }

        @Test
        @DisplayName("非数字返回 0")
        void testInvalidNumber() throws Exception {
            assertEquals(0, invokeParseInt("abc"));
        }

        @Test
        @DisplayName("空字符串返回 0")
        void testEmptyString() throws Exception {
            assertEquals(0, invokeParseInt(""));
        }

        @Test
        @DisplayName("负数字")
        void testNegativeNumber() throws Exception {
            assertEquals(-1, invokeParseInt("-1"));
        }
    }

    // ==================== resolveRuntimePath ====================

    @Nested
    @DisplayName("resolveRuntimePath 运行时路径解析")
    class ResolveRuntimePathTest {

        private Method resolveRuntimePath;
        private Map<String, String> savedRuntimes;

        @BeforeEach
        void setUp() throws Exception {
            resolveRuntimePath = LintDiagnosticsTool.class
                .getDeclaredMethod("resolveRuntimePath", String.class);
            resolveRuntimePath.setAccessible(true);
            savedRuntimes = new HashMap<>(Config.getInstance().getRuntimes());
        }

        @AfterEach
        void tearDown() {
            Config.getInstance().getRuntimes().clear();
            Config.getInstance().getRuntimes().putAll(savedRuntimes);
        }

        private String invoke(String language) throws Exception {
            return (String) resolveRuntimePath.invoke(tool, language);
        }

        @Test
        @DisplayName("配置了 python → 返回路径")
        void testConfiguredReturnsPath() throws Exception {
            Config.getInstance().getRuntimes().put("python", "C:/Python312/python.exe");
            assertEquals("C:/Python312/python.exe", invoke("python"));
        }

        @Test
        @DisplayName("没配置 → 返回 null")
        void testNotConfiguredReturnsNull() throws Exception {
            assertNull(invoke("python"));
        }

        @Test
        @DisplayName("语言没有映射（java）→ 返回 null")
        void testLanguageNoMappingReturnsNull() throws Exception {
            // java 不在 LANGUAGE_TO_RUNTIME 映射表中
            Config.getInstance().getRuntimes().put("node", "C:/node/node.exe");
            assertNull(invoke("java"));
        }
    }

    // ==================== augmentPath ====================

    @Nested
    @DisplayName("augmentPath PATH 增强")
    class AugmentPathTest {

        private Method augmentPath;

        @BeforeEach
        void setUp() throws Exception {
            augmentPath = LintDiagnosticsTool.class
                .getDeclaredMethod("augmentPath", Map.class, String.class);
            augmentPath.setAccessible(true);
        }

        private void invoke(Map<String, String> env, String runtimePath) throws Exception {
            augmentPath.invoke(tool, env, runtimePath);
        }

        @Test
        @DisplayName("正常路径 → PATH 前置了目录")
        void testPrependToPath() throws Exception {
            var env = new HashMap<String, String>();
            env.put("PATH", "/usr/bin:/bin");
            invoke(env, "/usr/local/bin/python3");
            String expectedDir = new File("/usr/local/bin/python3").getParent();
            assertEquals(expectedDir + File.pathSeparator + "/usr/bin:/bin", env.get("PATH"));
        }

        @Test
        @DisplayName("原 PATH 为空 → 只设置配置目录")
        void testEmptyOriginalPath() throws Exception {
            var env = new HashMap<String, String>();
            env.put("PATH", "");
            invoke(env, "/usr/bin/python3");
            String expectedDir = new File("/usr/bin/python3").getParent();
            assertEquals(expectedDir + File.pathSeparator, env.get("PATH"));
        }

        @Test
        @DisplayName("runtimePath 为 null → PATH 不变")
        void testNullRuntimePath() throws Exception {
            var env = new HashMap<String, String>();
            env.put("PATH", "/usr/bin");
            invoke(env, null);
            assertEquals("/usr/bin", env.get("PATH"));
        }

        @Test
        @DisplayName("runtimePath 为空字符串 → PATH 不变")
        void testEmptyRuntimePath() throws Exception {
            var env = new HashMap<String, String>();
            env.put("PATH", "/usr/bin");
            invoke(env, "");
            assertEquals("/usr/bin", env.get("PATH"));
        }
    }

    // ==================== buildProcessBuilder ====================

    @Nested
    @DisplayName("buildProcessBuilder 进程构建")
    class BuildProcessBuilderTest {

        private Method buildProcessBuilder;
        private Map<String, String> savedRuntimes;

        @BeforeEach
        void setUp() throws Exception {
            buildProcessBuilder = LintDiagnosticsTool.class
                .getDeclaredMethod("buildProcessBuilder", List.class, Path.class, String.class);
            buildProcessBuilder.setAccessible(true);
            savedRuntimes = new HashMap<>(Config.getInstance().getRuntimes());
        }

        @AfterEach
        void tearDown() {
            Config.getInstance().getRuntimes().clear();
            Config.getInstance().getRuntimes().putAll(savedRuntimes);
        }

        @SuppressWarnings("unchecked")
        private ProcessBuilder invoke(List<String> cmd, Path dir, String lang) throws Exception {
            return (ProcessBuilder) buildProcessBuilder.invoke(tool, cmd, dir, lang);
        }

        @Test
        @DisplayName("传 language=\"python\" 且配置了运行时 → PATH 被增强")
        void testPythonWithRuntime() throws Exception {
            Config.getInstance().getRuntimes().put("python", "/usr/bin/python3");
            ProcessBuilder pb = invoke(List.of("flake8", "test.py"), null, "python");
            String path = pb.environment().get("PATH");
            assertNotNull(path);
            String expectedPrefix = new File("/usr/bin/python3").getParent() + File.pathSeparator;
            assertTrue(path.startsWith(expectedPrefix));
        }

        @Test
        @DisplayName("不传 language（null）→ PATH 不变")
        void testNullLanguage() throws Exception {
            // 即使配置了 python，但 language=null 不会触发 PATH 增强
            Config.getInstance().getRuntimes().put("python", "/usr/bin/python3");
            ProcessBuilder pb = invoke(List.of("echo", "hello"), null, null);
            String path = pb.environment().get("PATH");
            // PATH 不应该以 python3 的目录开头
            assertNotNull(path);
            String unexpectedPrefix = new File("/usr/bin/python3").getParent() + File.pathSeparator;
            assertFalse(path.startsWith(unexpectedPrefix));
        }

        @Test
        @DisplayName("PAGER=cat 被设置")
        void testPagerSet() throws Exception {
            ProcessBuilder pb = invoke(List.of("echo", "hi"), null, null);
            assertEquals("cat", pb.environment().get("PAGER"));
        }

        @Test
        @DisplayName("command 和 workingDir 正确传递")
        void testCommandAndDir() throws Exception {
            Path tmpDir = Files.createTempDirectory("lint-test");
            try {
                ProcessBuilder pb = invoke(List.of("java", "-version"), tmpDir, "java");
                assertEquals("java", pb.command().get(0));
                assertEquals(tmpDir.toFile(), pb.directory());
            } finally {
                Files.deleteIfExists(tmpDir);
            }
        }
    }

    // ==================== Java Classpath 增强 ====================

    @Nested
    @DisplayName("Java Classpath 增强")
    class JavaClasspathTest {

        private Method findJavaProjectRoot;
        private Method getMavenBuildDir;
        private Method getElementText;
        private Method resolveMavenClasspathFromPom;

        @BeforeEach
        void setUp() throws Exception {
            findJavaProjectRoot = LintDiagnosticsTool.class
                .getDeclaredMethod("findJavaProjectRoot", Path.class);
            findJavaProjectRoot.setAccessible(true);

            getMavenBuildDir = LintDiagnosticsTool.class
                .getDeclaredMethod("getMavenBuildDir", Document.class);
            getMavenBuildDir.setAccessible(true);

            getElementText = LintDiagnosticsTool.class
                .getDeclaredMethod("getElementText", Element.class, String.class);
            getElementText.setAccessible(true);

            resolveMavenClasspathFromPom = LintDiagnosticsTool.class
                .getDeclaredMethod("resolveMavenClasspathFromPom", Path.class);
            resolveMavenClasspathFromPom.setAccessible(true);
        }

        @SuppressWarnings("unchecked")
        private Path invokeFindProjectRoot(Path target) throws Exception {
            return (Path) findJavaProjectRoot.invoke(tool, target);
        }

        private String invokeGetMavenBuildDir(Document doc) throws Exception {
            return (String) getMavenBuildDir.invoke(tool, doc);
        }

        private String invokeGetElementText(Element parent, String tag) throws Exception {
            return (String) getElementText.invoke(tool, parent, tag);
        }

        private String invokeResolveMavenClasspathFromPom(Path pom) throws Exception {
            return (String) resolveMavenClasspathFromPom.invoke(tool, pom);
        }

        // ===== findJavaProjectRoot =====

        @Test
        @DisplayName("findJavaProjectRoot: 当前目录有 pom.xml → 返回该目录")
        void testFindRootWithPomInSameDir() throws Exception {
            Path tmpDir = Files.createTempDirectory("jcp-test");
            try {
                Files.createFile(tmpDir.resolve("pom.xml"));
                Path result = invokeFindProjectRoot(tmpDir);
                assertEquals(tmpDir, result);
            } finally {
                deleteDir(tmpDir);
            }
        }

        @Test
        @DisplayName("findJavaProjectRoot: 父目录有 build.gradle → 返回父目录")
        void testFindRootWithGradleInParent() throws Exception {
            Path tmpDir = Files.createTempDirectory("jcp-test");
            try {
                Path subDir = Files.createDirectories(tmpDir.resolve("src/main/java"));
                Files.createFile(tmpDir.resolve("build.gradle"));
                Path result = invokeFindProjectRoot(subDir);
                assertEquals(tmpDir, result);
            } finally {
                deleteDir(tmpDir);
            }
        }

        @Test
        @DisplayName("findJavaProjectRoot: 找不到构建文件 → 返回 null")
        void testFindRootNotFound() throws Exception {
            Path tmpDir = Files.createTempDirectory("jcp-test");
            try {
                Path subDir = Files.createDirectories(tmpDir.resolve("a/b/c"));
                Path result = invokeFindProjectRoot(subDir);
                assertNull(result);
            } finally {
                deleteDir(tmpDir);
            }
        }

        @Test
        @DisplayName("findJavaProjectRoot: 目标为文件时向上查找")
        void testFindRootFromFile() throws Exception {
            Path tmpDir = Files.createTempDirectory("jcp-test");
            try {
                Path file = Files.createFile(tmpDir.resolve("Foo.java"));
                // 只有文件，没有构建文件 → null
                assertNull(invokeFindProjectRoot(file));

                // 放一个 pom.xml 后应该能找到
                Files.createFile(tmpDir.resolve("pom.xml"));
                assertEquals(tmpDir, invokeFindProjectRoot(file));
            } finally {
                deleteDir(tmpDir);
            }
        }

        // ===== getMavenBuildDir =====

        @Test
        @DisplayName("getMavenBuildDir: 无 build 配置 → 默认 target/classes")
        void testDefaultBuildDir() throws Exception {
            Document doc = parseXml("<project><modelVersion>4.0.0</modelVersion></project>");
            String dir = invokeGetMavenBuildDir(doc);
            assertEquals("target" + File.separator + "classes", dir);
        }

        @Test
        @DisplayName("getMavenBuildDir: 自定义 outputDirectory → 返回配置值")
        void testCustomBuildDir() throws Exception {
            Document doc = parseXml("""
                <project>
                    <build>
                        <outputDirectory>custom/classes</outputDirectory>
                    </build>
                </project>
                """);
            String dir = invokeGetMavenBuildDir(doc);
            assertEquals("custom/classes", dir);
        }

        // ===== getElementText =====

        @Test
        @DisplayName("getElementText: 子标签存在 → 返回文本")
        void testElementTextExists() throws Exception {
            Document doc = parseXml("""
                <dependency>
                    <groupId>org.slf4j</groupId>
                    <artifactId>slf4j-api</artifactId>
                </dependency>
                """);
            String gid = invokeGetElementText(doc.getDocumentElement(), "groupId");
            assertEquals("org.slf4j", gid);
        }

        @Test
        @DisplayName("getElementText: 子标签不存在 → 返回 null")
        void testElementTextMissing() throws Exception {
            Document doc = parseXml("<root><name>test</name></root>");
            assertNull(invokeGetElementText(doc.getDocumentElement(), "missing"));
        }

        // ===== resolveMavenClasspathFromPom =====

        @Test
        @DisplayName("resolveMavenClasspathFromPom: 简单 pom.xml → 可解析且包含默认 build 目录 (不检查本地 jar)")
        void testSimplePom() throws Exception {
            Path tmpDir = Files.createTempDirectory("jcp-pom-test");
            try {
                Path pomFile = tmpDir.resolve("pom.xml");
                Files.writeString(pomFile, """
                    <project>
                        <modelVersion>4.0.0</modelVersion>
                        <groupId>com.example</groupId>
                        <artifactId>test</artifactId>
                        <version>1.0</version>
                        <dependencies>
                            <dependency>
                                <groupId>org.slf4j</groupId>
                                <artifactId>slf4j-api</artifactId>
                                <version>2.0.9</version>
                            </dependency>
                        </dependencies>
                    </project>
                    """);

                String cp = invokeResolveMavenClasspathFromPom(pomFile);
                assertNotNull(cp);
                // 应包含默认 build 输出目录
                assertTrue(cp.contains("target" + File.separator + "classes"),
                    "Classpath should contain default build directory");
            } finally {
                deleteDir(tmpDir);
            }
        }

        @Test
        @DisplayName("resolveMavenClasspathFromPom: 无效 XML → 返回 null")
        void testInvalidPomReturnsNull() throws Exception {
            Path tmpDir = Files.createTempDirectory("jcp-pom-test");
            try {
                Path pomFile = tmpDir.resolve("pom.xml");
                Files.writeString(pomFile, "not xml at all");
                assertNull(invokeResolveMavenClasspathFromPom(pomFile));
            } finally {
                deleteDir(tmpDir);
            }
        }

        // ===== helper =====

        private Document parseXml(String xml) throws Exception {
            var factory = DocumentBuilderFactory.newInstance();
            try (var stream = new java.io.ByteArrayInputStream(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
                return factory.newDocumentBuilder().parse(stream);
            }
        }

        private void deleteDir(Path dir) throws IOException {
            try (var stream = Files.walk(dir)) {
                stream.sorted((a, b) -> b.compareTo(a))
                    .forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignored) {} });
            }
        }
    }

    // ==================== 工具基本信息 ====================

    @Nested
    @DisplayName("工具元信息")
    class ToolMetaTest {

        @Test
        @DisplayName("getName 应返回 lint_diagnostics")
        void testGetName() {
            assertEquals("lint_diagnostics", tool.getName());
        }

        @Test
        @DisplayName("getDescription 应包含支持的语言列表")
        void testGetDescription() {
            String desc = tool.getDescription();
            assertNotNull(desc);
            assertTrue(desc.contains("Java"));
            assertTrue(desc.contains("Python"));
            assertTrue(desc.contains("eslint"));
        }

        @Test
        @DisplayName("getParametersSchema 应包含 path、language、timeout")
        void testGetParametersSchema() {
            String schema = tool.getParametersSchema();
            assertNotNull(schema);
            assertTrue(schema.contains("\"path\""));
            assertTrue(schema.contains("\"language\""));
            assertTrue(schema.contains("\"timeout\""));
            assertTrue(schema.contains("\"required\""));
        }

        @Test
        @DisplayName("requiresFileLock 应返回 false")
        void testRequiresFileLock() {
            assertFalse(tool.requiresFileLock());
        }
    }
}
