package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mockStatic;

class DeleteFileToolTest {

    private DeleteFileTool tool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tool = new DeleteFileTool();
        objectMapper = new ObjectMapper();
    }

    /**
     * Mock PathSecurityUtils to use tempDir as the project root.
     * Call this at the start of each test that needs filesystem operations.
     */
    private MockedStatic<PathSecurityUtils> mockSecurityUtils(Path tempDir) {
        MockedStatic<PathSecurityUtils> utils = mockStatic(PathSecurityUtils.class);
        utils.when(PathSecurityUtils::getProjectRoot).thenReturn(tempDir);
        utils.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenAnswer(invocation -> {
            String path = invocation.getArgument(0);
            if (path == null || path.trim().isEmpty()) {
                return tempDir;
            }
            String trimmed = path.trim();
            if (trimmed.equals(".") || trimmed.equals("./")) {
                return tempDir;
            }
            Path p = Path.of(trimmed);
            if (!p.isAbsolute()) {
                p = tempDir.resolve(p);
            }
            return p.normalize();
        });
        utils.when(() -> PathSecurityUtils.isWithinAllowedPath(any())).thenAnswer(invocation -> {
            Path p = invocation.getArgument(0);
            return p.toAbsolutePath().normalize().startsWith(tempDir);
        });
        utils.when(() -> PathSecurityUtils.getRelativePath(any())).thenAnswer(invocation -> {
            Path p = invocation.getArgument(0);
            try {
                return tempDir.relativize(p.toAbsolutePath().normalize()).toString().replace('\\', '/');
            } catch (IllegalArgumentException e) {
                return p.toString();
            }
        });
        return utils;
    }

    private ObjectNode createArgs(String... paths) {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode pathsArray = objectMapper.createArrayNode();
        for (String p : paths) {
            pathsArray.add(p);
        }
        args.set("paths", pathsArray);
        return args;
    }

    // ====== 基础测试 ======

    @Test
    void testGetName() {
        assertEquals("delete_file", tool.getName());
    }

    @Test
    void testGetDescription() {
        String desc = tool.getDescription();
        assertNotNull(desc);
        assertTrue(desc.contains("删除"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("paths"));
    }

    // ====== 参数校验 ======

    @Test
    void testExecute_MissingPathsParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("other", "value");
        ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("缺少必需参数"));
    }

    @Test
    void testExecute_EmptyPathsArray() {
        ObjectNode args = objectMapper.createObjectNode();
        args.set("paths", objectMapper.createArrayNode());
        ToolExecutionException ex = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("paths 不能为空"));
    }

    // ====== Layer 1: 通配符拒绝（glob 不影响接收） ======

    @Test
    void testExecute_RejectWildcard_DoubleStar(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("**")));
            assertTrue(ex.getMessage().contains("不支持 glob"));
        }
    }

    @Test
    void testExecute_RejectWildcard_DoubleStarAll(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("**/*")));
            assertTrue(ex.getMessage().contains("不支持 glob"));
        }
    }

    @Test
    void testExecute_RejectWildcard_SingleStar(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("*")));
            assertTrue(ex.getMessage().contains("不支持 glob"));
        }
    }

    @Test
    void testExecute_RejectWildcard_QuestionMark(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("src/?.java")));
            assertTrue(ex.getMessage().contains("不支持 glob"));
        }
    }

    @Test
    void testExecute_RejectWildcard_GlobWithPath(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("src/**/*.tmp")));
            assertTrue(ex.getMessage().contains("不支持 glob"));
        }
    }

    // ====== Layer 2: MAX_DELETE_COUNT = 50 ======

    @Test
    void testExecute_DeleteOverLimit_51Files(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            // Create 51 files in a subdirectory then delete by directory
            Path subdir = tempDir.resolve("logs");
            Files.createDirectories(subdir);
            for (int i = 0; i < 51; i++) {
                Files.writeString(subdir.resolve("log-" + i + ".txt"), "content-" + i, StandardCharsets.UTF_8);
            }

            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("logs")));
            assertTrue(ex.getMessage().contains("最多允许"));
            assertTrue(ex.getMessage().contains("50"));
            assertTrue(ex.getMessage().contains("51"));
        }
    }

    @Test
    void testExecute_DeleteAtLimit_50Files(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path subdir = tempDir.resolve("cleanup");
            Files.createDirectories(subdir);
            for (int i = 0; i < 50; i++) {
                Files.writeString(subdir.resolve("file-" + i + ".tmp"), "data-" + i, StandardCharsets.UTF_8);
            }

            String result = tool.execute(createArgs("cleanup"));
            assertTrue(result.contains("已删除 50 个文件"));
        }
    }

    @Test
    void testExecute_DeleteDirectoryExceedsLimit(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path subdir = tempDir.resolve("buildoutput");
            Files.createDirectories(subdir);
            for (int i = 0; i < 60; i++) {
                Files.writeString(subdir.resolve("bundle-" + i + ".js"), "content-" + i, StandardCharsets.UTF_8);
            }

            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("buildoutput")));
            assertTrue(ex.getMessage().contains("最多允许"));
        }
    }

    // ====== Layer 3: 保护文件/目录/扩展名 ======

    @Test
    void testExecute_ProtectedFileName_Gitignore(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.writeString(tempDir.resolve(".gitignore"), "*.class", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs(".gitignore"));
            assertTrue(result.contains("受保护"));
            assertTrue(result.contains(".gitignore"));
        }
    }

    @Test
    void testExecute_ProtectedFileName_Gitattributes(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.writeString(tempDir.resolve(".gitattributes"), "* text=auto", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs(".gitattributes"));
            assertTrue(result.contains("受保护"));
        }
    }

    @Test
    void testExecute_ProtectedExtension_DotEnv(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.writeString(tempDir.resolve(".env"), "SECRET=xxx", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs(".env"));
            assertTrue(result.contains("受保护"));
        }
    }

    @Test
    void testExecute_ProtectedExtension_DotKey(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.writeString(tempDir.resolve("server.key"), "private-key", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("server.key"));
            assertTrue(result.contains("受保护"));
        }
    }

    @Test
    void testExecute_ProtectedExtension_DotPem(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.writeString(tempDir.resolve("cert.pem"), "cert-data", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("cert.pem"));
            assertTrue(result.contains("受保护"));
        }
    }

    @Test
    void testExecute_ProtectedDirectory_Git(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path gitDir = tempDir.resolve(".git");
            Files.createDirectories(gitDir);
            Files.writeString(gitDir.resolve("config"), "[core]", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs(".git/config"));
            assertTrue(result.contains("受保护"));
        }
    }

    @Test
    void testExecute_ProtectedDirectory_NodeModules(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path nmDir = tempDir.resolve("node_modules");
            Files.createDirectories(nmDir.resolve("lodash"));
            Files.writeString(nmDir.resolve("lodash/index.js"), "module.exports={}", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("node_modules/lodash/index.js"));
            assertTrue(result.contains("受保护"));
        }
    }

    @Test
    void testExecute_ProtectedDirectory_DotHippo(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path hippoDir = tempDir.resolve(".hippo");
            Files.createDirectories(hippoDir);
            Files.writeString(hippoDir.resolve("snapshot.json"), "{}", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs(".hippo/snapshot.json"));
            assertTrue(result.contains("受保护"));
        }
    }

    @Test
    void testExecute_ProtectedExtensionInDirectory(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path dir = tempDir.resolve("config");
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("app.properties"), "key=value", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("secret.key"), "key-data", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("config"));
            assertTrue(result.contains("已删除文件"));  // app.properties only, single-file format
            assertTrue(result.contains("受保护"));      // secret.key skipped
        }
    }

    // ====== Layer 4: 项目根目录保护 ======

    @Test
    void testExecute_ProjectRoot_DotPath(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs(".")));
            assertTrue(ex.getMessage().contains("项目根目录"));
        }
    }

    @Test
    void testExecute_ProjectRoot_DotSlashPath(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("./")));
            assertTrue(ex.getMessage().contains("项目根目录"));
        }
    }

    @Test
    void testExecute_RejectWildcard_DotStar(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("*.tmp")));
            assertTrue(ex.getMessage().contains("不支持 glob"));
        }
    }

    @Test
    void testExecute_RejectWildcard_DoubleStarSubdir(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("**/*.tmp")));
            assertTrue(ex.getMessage().contains("不支持 glob"));
        }
    }

    // ====== 正常操作 ======

    @Test
    void testExecute_DeleteSingleFile(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path file = tempDir.resolve("test.txt");
            Files.writeString(file, "hello", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("test.txt"));
            assertTrue(result.contains("已删除文件"));
            assertTrue(result.contains("test.txt"));
            assertFalse(Files.exists(file));
        }
    }

    @Test
    void testExecute_DeleteDirectory(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path subdir = tempDir.resolve("mymodule");
            Files.createDirectories(subdir);
            Files.writeString(subdir.resolve("a.java"), "class A {}", StandardCharsets.UTF_8);
            Files.writeString(subdir.resolve("b.java"), "class B {}", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("mymodule"));
            assertTrue(result.contains("已删除 2 个文件"));
            assertFalse(Files.exists(subdir.resolve("a.java")));
            assertFalse(Files.exists(subdir.resolve("b.java")));
            // Directory itself should remain if it's not empty (we only delete regular files)
            // Actually the code tries to delete empty dirs after deleting files
            assertTrue(Files.notExists(subdir) || Files.isDirectory(subdir));
        }
    }

    @Test
    void testExecute_DeleteMultiplePaths(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.writeString(tempDir.resolve("f1.txt"), "1", StandardCharsets.UTF_8);
            Files.writeString(tempDir.resolve("f2.txt"), "2", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("f1.txt", "f2.txt"));
            assertTrue(result.contains("已删除 2 个文件"));
            assertFalse(Files.exists(tempDir.resolve("f1.txt")));
            assertFalse(Files.exists(tempDir.resolve("f2.txt")));
        }
    }

    @Test
    void testExecute_DeleteMultipleSpecificFiles(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path dir = tempDir.resolve("obsolete");
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("output.js"), "js", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("output.css"), "css", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("output.html"), "html", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("obsolete/output.css", "obsolete/output.html"));
            assertTrue(result.contains("已删除 2 个文件"));
            assertTrue(Files.exists(dir.resolve("output.js")));
            assertFalse(Files.exists(dir.resolve("output.css")));
            assertFalse(Files.exists(dir.resolve("output.html")));
        }
    }

    // ====== 边界场景 ======

    @Test
    void testExecute_NonExistentPath(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            String result = tool.execute(createArgs("nonexistent.txt"));
            assertTrue(result.contains("没有文件需要删除"));
            assertTrue(result.contains("不存在"));
        }
    }

    @Test
    void testExecute_DeleteEmptyDirectory(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path emptyDir = tempDir.resolve("emptydir");
            Files.createDirectories(emptyDir);

            // Directory with no regular files → should report nothing to delete
            String result = tool.execute(createArgs("emptydir"));
            assertTrue(result.contains("没有文件需要删除"));
        }
    }

    @Test
    void testExecute_MixedValidAndProtectedPaths(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            // Create a valid file
            Files.writeString(tempDir.resolve("readme.md"), "# Readme", StandardCharsets.UTF_8);
            // Create a protected file
            Files.writeString(tempDir.resolve(".gitignore"), "*.class", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("readme.md", ".gitignore"));
            assertTrue(result.contains("已删除文件"));
            assertTrue(result.contains("readme.md"));
            assertTrue(result.contains("受保护"));
            assertFalse(Files.exists(tempDir.resolve("readme.md")));
            assertTrue(Files.exists(tempDir.resolve(".gitignore")));
        }
    }

    // ====== Preview 测试 ======

    @Test
    void testPreview_ReturnsFileList(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path dir = tempDir.resolve("src");
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("Main.java"), "class Main {}", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("Util.java"), "class Util {}", StandardCharsets.UTF_8);

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("src"));
            assertEquals(2, result.totalCount());
            assertTrue(result.getFiles().stream().anyMatch(f -> f.contains("Main.java")));
            assertTrue(result.getFiles().stream().anyMatch(f -> f.contains("Util.java")));
            assertFalse(result.hasErrors());
        }
    }

    @Test
    void testPreview_WithProtectedFiles(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path dir = tempDir.resolve("mixed");
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("data.txt"), "data", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve(".env"), "SECRET=xxx", StandardCharsets.UTF_8);

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("mixed"));
            assertEquals(1, result.totalCount()); // only data.txt
            assertEquals(1, result.getSkippedProtected().size());
            assertTrue(result.getSkippedProtected().get(0).contains(".env"));
            assertFalse(result.hasErrors());
        }
    }

    @Test
    void testPreview_WithDirectory(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path dir = tempDir.resolve("logs");
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("app.log"), "log1", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("error.log"), "log2", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("README.md"), "docs", StandardCharsets.UTF_8);

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("logs"));
            assertEquals(3, result.totalCount());
            assertFalse(result.hasErrors());
        }
    }

    @Test
    void testPreview_WithWildcard(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("**"));
            assertTrue(result.hasErrors());
            assertTrue(result.getErrors().get(0).contains("不支持 glob"));
        }
    }

    @Test
    void testPreview_WithNonExistentPath(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("ghost.txt"));
            assertEquals(0, result.totalCount());
            assertEquals(1, result.getNotFound().size());
            assertFalse(result.hasErrors());
        }
    }

    @Test
    void testPreview_MissingPathsParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("other", "value");

        DeleteFileTool.PreviewResult result = DeleteFileTool.preview(args);
        assertTrue(result.hasErrors());
        assertTrue(result.getErrors().get(0).contains("缺少必需参数"));
    }

    @Test
    void testPreview_ProtectedFilesUnderGit(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path gitDir = tempDir.resolve(".git");
            Files.createDirectories(gitDir);
            Files.writeString(gitDir.resolve("HEAD"), "ref: main", StandardCharsets.UTF_8);

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs(".git/HEAD"));
            assertEquals(0, result.totalCount());
            assertTrue(result.hasProtectedFiles());
        }
    }
}
