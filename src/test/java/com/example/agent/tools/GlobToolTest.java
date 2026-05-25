package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

import static org.junit.jupiter.api.Assertions.*;

class GlobToolTest {

    private GlobTool tool;
    private ObjectMapper objectMapper;
    private Path tempTestDir;

    @BeforeEach
    void setUp() {
        tool = new GlobTool();
        objectMapper = new ObjectMapper();
    }

    @AfterEach
    void cleanUp() throws IOException {
        if (tempTestDir != null && Files.exists(tempTestDir)) {
            Files.walk(tempTestDir)
                .sorted(Comparator.reverseOrder())
                .forEach(p -> {
                    try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                });
            tempTestDir = null;
        }
    }

    @Test
    void testGetName() {
        assertEquals("glob", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("glob"));
        assertTrue(description.contains("通配符"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("pattern"));
        assertTrue(schema.contains("path"));
        assertTrue(schema.contains("max_results"));
    }

    @Test
    void testFindJavaFiles() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains(".java"));
        assertTrue(result.contains("找到"));
    }

    @Test
    void testFindPomFiles() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/pom.xml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testFindInSpecificDirectory() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("path", "src/main/java");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains(".java"));
    }

    @Test
    void testFindWithMaxResults() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("max_results", 5);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到"));
    }

    @Test
    void testFindNonExistentPattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.nonexistent");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("未找到匹配的文件"));
    }

    @Test
    void testMissingPatternParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testInvalidSearchPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("path", "/non/existent/path");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testSearchFilePathInsteadOfDirectory() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("path", "pom.xml");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testGetAffectedPaths() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("path", "src");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals("src", paths.get(0));
    }

    @Test
    void testSimplePattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "*.md");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains(".md"));
    }

    @Test
    void testFindRootDirectoryFileWithDoubleStarPattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/pom.xml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
        assertFalse(result.contains("未找到匹配的文件"));
    }

    @Test
    void testFindRootDirectoryConfigFile() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/config.yaml.example");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("config.yaml.example"));
        assertFalse(result.contains("未找到匹配的文件"));
    }

    @Test
    void testFindRootDirectoryMarkdownFiles() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.md");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains(".md"));
        assertTrue(result.contains("README.md") || result.contains("ARCHITECTURE.md"));
    }

    @Test
    void testFindRootDirectoryGitignore() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/.gitignore");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains(".gitignore"));
    }

    @Test
    void testFindWithExplicitRootPath() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/pom.xml");
        args.put("path", ".");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testFindWithEmptyPath() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/pom.xml");
        args.put("path", "");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testFindWithDotSlashPath() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/pom.xml");
        args.put("path", "./");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testFindWithAbsolutePath() throws Exception {
        String userDir = System.getProperty("user.dir");
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/pom.xml");
        args.put("path", userDir);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testBoundaryMaxResultsOne() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("max_results", 1);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到 1 个文件"));
    }

    @Test
    void testBoundaryMaxResultsExceedsLimit() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("max_results", 10000);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到"));
    }

    @Test
    void testBoundaryMaxResultsZero() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("max_results", 0);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到"));
    }

    @Test
    void testPatternWithQuestionMark() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "pom.xm?");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testPatternStartingWithStar() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "*.xml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains(".xml"));
    }

    @Test
    void testEmptyPattern() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testWhitespacePattern() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "   ");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullPatternParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("pattern");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullPathParameter() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/pom.xml");
        args.putNull("path");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml"));
    }

    @Test
    void testNullMaxResultsParameter() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.putNull("max_results");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到"));
    }

    @Test
    void testDoubleStarOnlyPattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到"));
    }

    @Test
    void testDoubleStarSlashOnlyPattern() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到"));
    }

    @Test
    void testInvalidGlobPattern() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "[");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testPatternWithSpecialCharacters() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "*.yaml.example");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到"));
    }

    @Test
    void testPatternWithBraces() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "*.{java,xml}");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到"));
    }

    @Test
    void testPatternWithCharacterClass() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "pom.[x]ml");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml") || result.contains("找到"));
    }

    @Test
    void testPatternWithBracesInRootDirectory() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "*.{xml,md}");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("pom.xml") || result.contains("README.md"));
    }

    @Test
    void testNegativeMaxResults() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("max_results", -1);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到"));
    }

    @Test
    void testVeryLargeMaxResults() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*.java");
        args.put("max_results", Integer.MAX_VALUE);
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到"));
    }

    @Test
    void testPatternWithMultipleStars() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "**/*Test*.java");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("Test"));
        assertTrue(result.contains(".java"));
    }

    @Test
    void testPatternMatchingHiddenFiles() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", ".*");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("找到") || result.contains("未找到"));
    }

    @Test
    void testPatternWithSlashAtEnd() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "src/");
        
        String result = tool.execute(args);
        
        assertNotNull(result);
        assertTrue(result.contains("未找到匹配的文件"));
    }

    @Test
    void testRespectGitignoreTrue() throws Exception {
        Path dir = Files.createTempDirectory(Path.of("."), ".globtest-");
        tempTestDir = dir;
        Files.writeString(dir.resolve(".gitignore"), "*.log\n");
        Files.createFile(dir.resolve("test.log"));
        Files.createFile(dir.resolve("test.txt"));

        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "*");
        args.put("path", dir.normalize().toAbsolutePath().toString());

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("test.txt"), "应包含未被忽略的文件");
        assertFalse(result.contains("test.log"), "应过滤掉 .gitignore 中列出的文件");
    }

    @Test
    void testRespectGitignoreFalse() throws Exception {
        Path dir = Files.createTempDirectory(Path.of("."), ".globtest-");
        tempTestDir = dir;
        Files.writeString(dir.resolve(".gitignore"), "*.log\n");
        Files.createFile(dir.resolve("test.log"));
        Files.createFile(dir.resolve("test.txt"));

        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", "*");
        args.put("path", dir.normalize().toAbsolutePath().toString());
        args.put("respect_gitignore", false);

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("test.txt"), "应包含未被忽略的文件");
        assertTrue(result.contains("test.log"), "respect_gitignore=false 时应保留被忽略的文件");
    }

    @Test
    void testAbsolutePattern() throws Exception {
        Path dir = Files.createTempDirectory(Path.of("."), ".globtest-");
        tempTestDir = dir;
        Files.createFile(dir.resolve("test.txt"));
        Files.createFile(dir.resolve("other.java"));

        String absolutePattern = dir.toAbsolutePath().normalize().toString().replace("\\", "/") + "/*.txt";

        ObjectNode args = objectMapper.createObjectNode();
        args.put("pattern", absolutePattern);

        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("test.txt"), "绝对路径模式应匹配到文件");
        assertFalse(result.contains("other.java"), "不应匹配模式外的文件");
    }
}
