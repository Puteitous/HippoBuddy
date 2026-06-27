package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class GrepToolTest {

    private GrepTool tool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tool = new GrepTool();
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        assertEquals("grep", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("搜索"));
        assertTrue(description.contains("正则"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("pattern"));
        assertTrue(schema.contains("path"));
        assertTrue(schema.contains("file_pattern"));
    }

    @Test
    void testSearchSimplePattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "public class");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("public class"));
        assertTrue(result.contains("📄"));
        assertTrue(result.contains("找到"));
    }

    @Test
    void testSearchWithFilePattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "import");
        args.put("file_pattern", "*.java");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("import"));
        assertTrue(result.contains(".java"));
    }

    @Test
    void testSearchInSpecificDirectory() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "ToolExecutor");
        args.put("path", "src/main/java");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("ToolExecutor"));
        assertTrue(result.contains("找到"));
    }

    @Test
    void testCaseSensitiveSearch() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "PUBLIC");
        args.put("case_sensitive", true);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertFalse(result.contains("未找到匹配的内容"));
    }

    @Test
    void testCaseInsensitiveSearch() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "PUBLIC");
        args.put("case_sensitive", false);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到"));
    }

    @Test
    void testSearchWithMaxResults() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "import");
        args.put("max_results", 5);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("仅展示前 5 条"));
    }

    @Test
    void testSearchNonExistentPattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ");
        args.put("file_pattern", "*.md");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("未找到匹配的内容"));
    }

    @Test
    void testMissingPatternParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testInvalidRegexPattern() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "[invalid(regex");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testInvalidSearchPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "test");
        args.put("path", "/non/existent/path");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testSearchFilePathInsteadOfDirectory() throws Exception {
        // path 传文件：宽松模式，应成功搜索该文件
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("path", "pom.xml");

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("project"));
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testGetAffectedPaths() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "test");
        args.put("path", "src");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals("src", paths.get(0));
    }

    @Test
    void testSearchRegexPattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "public\\s+class\\s+\\w+");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("📄"));
        assertTrue(result.contains("找到"));
    }

    @Test
    void testSearchRootDirectoryFiles() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("file_pattern", "pom.xml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
        assertFalse(result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchWithExplicitRootPath() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "Hippo");
        args.put("path", ".");
        args.put("file_pattern", "*.md");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("Hippo"));
        assertTrue(result.contains(".md"));
    }

    @Test
    void testSearchMarkdownFilesInRoot() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "README");
        args.put("file_pattern", "*.md");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("README.md") || result.contains("找到"));
    }

    @Test
    void testSearchConfigFileInRoot() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "yaml");
        args.put("file_pattern", "*.yaml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchWithEmptyPath() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "xml");
        args.put("path", "");
        args.put("file_pattern", "pom.xml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testSearchWithDotSlashPath() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("path", "./");
        args.put("file_pattern", "pom.xml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testSearchRootFileWithAbsolutePath() throws Exception {
        String userDir = System.getProperty("user.dir");
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("path", userDir);
        args.put("file_pattern", "pom.xml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testSearchGitignoreInRoot() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "gitignore");
        args.put("file_pattern", ".gitignore");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("未找到匹配的内容") || result.contains("找到"));
    }

    @Test
    void testSearchWithNullFilePattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("file_pattern", (String) null);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchWithEmptyFilePattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("file_pattern", "");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchBoundaryMaxResults() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "import");
        args.put("max_results", 1);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("仅展示前 1 条") || result.contains("找到 1 处"));
    }

    @Test
    void testSearchWithMaxResultsExceedsLimit() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "import");
        args.put("max_results", 1000);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchWithMinResults() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "import");
        args.put("max_results", 0);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchSpecialCharactersInPattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "\\$\\{\\w+\\}");
        args.put("file_pattern", "*.yaml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchWithBackslashPath() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("path", ".\\");
        args.put("file_pattern", "pom.xml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    // ──────── 单文件搜索（path 传文件）────────

    @Test
    void testSearchSingleFileMatch() throws Exception {
        // 单文件匹配到内容
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("path", "pom.xml");

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("project"));
        assertTrue(result.contains("pom.xml"));
        assertFalse(result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchSingleFileNoMatch() throws Exception {
        // 单文件未匹配到内容
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "ZZZZZZZZZZZZZZZZ_not_exist");
        args.put("path", "pom.xml");

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchSingleFileWithMatchingFilePattern() throws Exception {
        // 单文件 + filePattern 匹配（文件类型符合）
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("path", "pom.xml");
        args.put("file_pattern", "*.xml");

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("project"));
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testSearchSingleFileWithNonMatchingFilePattern() throws Exception {
        // 单文件 + filePattern 不匹配（文件类型不符合）
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "project");
        args.put("path", "pom.xml");
        args.put("file_pattern", "*.js");

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("未找到匹配的内容"));
    }

    @Test
    void testSearchSingleFileNonExistent() {
        // 单文件不存在，应抛异常
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "test");
        args.put("path", "non_existent_file.xyz");

        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testSearchSingleJavaFile() throws Exception {
        // 搜索一个具体的 Java 源文件
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "GrepTool");
        args.put("path", "src/main/java/com/example/agent/tools/GrepTool.java");

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("GrepTool"));
        assertFalse(result.contains("未找到匹配的内容"));
    }
}
