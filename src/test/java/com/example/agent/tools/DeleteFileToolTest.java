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
            // 目录内文件被删完后目录变空，应被自动清理
            assertTrue(Files.notExists(subdir));
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

            // 空目录应被识别并删除
            String result = tool.execute(createArgs("emptydir"));
            assertTrue(result.contains("空目录"));
            assertTrue(Files.notExists(emptyDir));
        }
    }

    @Test
    void testExecute_DeleteEmptyDirectoryWithSlash(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path emptyDir = tempDir.resolve("data");
            Files.createDirectories(emptyDir);

            String result = tool.execute(createArgs("data/"));
            assertTrue(result.contains("空目录"));
            assertFalse(Files.exists(emptyDir));
        }
    }

    @Test
    void testExecute_RejectEmptyPath(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("")));
            assertTrue(ex.getMessage().contains("路径不能为空"));
        }
    }

    @Test
    void testExecute_RejectBlankPath(@TempDir Path tempDir) {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("   ")));
            assertTrue(ex.getMessage().contains("路径不能为空"));
        }
    }

    @Test
    void testExecute_RejectEmptyPathAmongValidPaths(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.writeString(tempDir.resolve("keep.txt"), "keep", StandardCharsets.UTF_8);

            // 混合传有效路径和空路径，应在空路径处提前拒绝，不要删除任何文件
            ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(createArgs("keep.txt", "")));
            assertTrue(ex.getMessage().contains("路径不能为空"));
            assertTrue(Files.exists(tempDir.resolve("keep.txt")));
        }
    }

    @Test
    void testExecute_DeleteDirectoryThenAutoCleanDir(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            // 一个只含文件的目录，删完文件后目录自动被清理
            Path subdir = tempDir.resolve("mymodule");
            Files.createDirectories(subdir);
            Files.writeString(subdir.resolve("a.java"), "class A {}", StandardCharsets.UTF_8);
            Files.writeString(subdir.resolve("b.java"), "class B {}", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("mymodule"));
            assertTrue(result.contains("已删除 2 个文件"));
            // 目录在文件删完后变空，应被自动清理
            assertTrue(Files.notExists(subdir));
        }
    }

    @Test
    void testExecute_DeleteDirectoryWithSubdirs_RecursiveClean(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            // 创建多层空子目录树，只最深层有文件
            // mymodule/src/main/java/com/example/App.java
            Path deepDir = tempDir.resolve("mymodule/src/main/java/com/example");
            Files.createDirectories(deepDir);
            Files.writeString(deepDir.resolve("App.java"), "class App {}", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("mymodule"));
            assertTrue(result.contains("已删除文件") && result.contains("App.java"), result);
            // 所有目录都应被递归清理（文件删完后全部变空）
            assertTrue(Files.notExists(tempDir.resolve("mymodule")));
        }
    }

    @Test
    void testExecute_DeleteDirectoryWithPartialSubdirs(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            // 复杂场景：部分子目录有文件保留，部分变空
            // mymodule/
            //   src/main/java/  ← 空
            //   src/main/resources/config.properties
            //   target/classes/  ← 空
            //   README.md
            Path javaDir = tempDir.resolve("mymodule/src/main/java");
            Files.createDirectories(javaDir);
            Path resDir = tempDir.resolve("mymodule/src/main/resources");
            Files.createDirectories(resDir);
            Files.writeString(resDir.resolve("config.properties"), "key=val", StandardCharsets.UTF_8);
            Path targetDir = tempDir.resolve("mymodule/target/classes");
            Files.createDirectories(targetDir);
            Files.writeString(tempDir.resolve("mymodule/README.md"), "docs", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("mymodule"));

            // 2 个文件被删
            assertTrue(result.contains("已删除 2 个文件"));
            // 空目录树应被递归清理
            assertTrue(Files.notExists(javaDir));       // 空 → 被删
            assertTrue(Files.notExists(targetDir));     // 空 → 被删
            assertTrue(Files.notExists(tempDir.resolve("mymodule/src/main")));  // 空 → 被删
            assertTrue(Files.notExists(tempDir.resolve("mymodule/src")));       // 空 → 被删
            // resources/ 有 config.properties → 没被删，但文件被删后它变空了
            // 但因为 resources 不是 walk 顶层（是 mymodule 的子树），也会被递归清理
            assertTrue(Files.notExists(resDir));        // 文件被删后变空 → 被递归清理
            // 顶层目录也应被递归清理
            assertTrue(Files.notExists(tempDir.resolve("mymodule")));
        }
    }

    @Test
    void testExecute_MixedFilesAndEmptyDirs(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            // 一次传多个路径：一个文件 + 一个空目录
            Files.writeString(tempDir.resolve("data.txt"), "data", StandardCharsets.UTF_8);
            Path emptyDir = tempDir.resolve("storage");
            Files.createDirectories(emptyDir);

            String result = tool.execute(createArgs("data.txt", "storage"));
            assertTrue(result.contains("已删除文件"));
            assertTrue(result.contains("data.txt"));
            assertTrue(result.contains("storage"));
            assertFalse(Files.exists(tempDir.resolve("data.txt")));
            assertFalse(Files.exists(emptyDir));
        }
    }

    @Test
    void testExecute_MixedFilesAndPopulatedDir(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            // 一个文件 + 一个含文件的目录
            Files.writeString(tempDir.resolve("root.txt"), "root", StandardCharsets.UTF_8);
            Path subdir = tempDir.resolve("sub");
            Files.createDirectories(subdir);
            Files.writeString(subdir.resolve("child.txt"), "child", StandardCharsets.UTF_8);

            String result = tool.execute(createArgs("root.txt", "sub"));
            assertTrue(result.contains("已删除 2 个文件"));
            assertFalse(Files.exists(tempDir.resolve("root.txt")));
            // 目录内文件被删后目录变空 → 自动清理
            assertTrue(Files.notExists(subdir));
        }
    }

    @Test
    void testExecute_NonExistentDir_StillReported(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            // 不存在的目录，应报告"不存在"
            String result = tool.execute(createArgs("ghost"));
            assertTrue(result.contains("没有文件需要删除"));
            assertTrue(result.contains("不存在"));
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

    // ====== Preview 空目录测试 ======

    @Test
    void testPreview_EmptyDirectory(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path emptyDir = tempDir.resolve("empty");
            Files.createDirectories(emptyDir);

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("empty"));
            assertEquals(1, result.totalCount());
            assertEquals(1, result.getEmptyDirs().size());
            assertTrue(result.getEmptyDirs().get(0).contains("empty"));
            assertEquals(0, result.getFiles().size());
            assertFalse(result.hasErrors());
        }
    }

    @Test
    void testPreview_MixedFilesAndEmptyDirs(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.writeString(tempDir.resolve("data.txt"), "data", StandardCharsets.UTF_8);
            Path emptyDir = tempDir.resolve("cache");
            Files.createDirectories(emptyDir);

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("data.txt", "cache"));
            assertEquals(2, result.totalCount());  // 1 file + 1 empty dir
            assertEquals(1, result.getFiles().size());
            assertEquals(1, result.getEmptyDirs().size());
            assertTrue(result.getFiles().get(0).contains("data.txt"));
            assertTrue(result.getEmptyDirs().get(0).contains("cache"));
        }
    }

    @Test
    void testPreview_NonEmptyDirectory_NoEmptyDirs(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Path dir = tempDir.resolve("src");
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("Main.java"), "class Main {}", StandardCharsets.UTF_8);

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("src"));
            assertEquals(1, result.totalCount());
            assertEquals(1, result.getFiles().size());
            assertEquals(0, result.getEmptyDirs().size());
        }
    }

    @Test
    void testPreview_MultipleEmptyDirs(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.createDirectories(tempDir.resolve("a"));
            Files.createDirectories(tempDir.resolve("b"));
            Files.createDirectories(tempDir.resolve("c"));

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("a", "b", "c"));
            assertEquals(3, result.totalCount());
            assertEquals(3, result.getEmptyDirs().size());
            assertEquals(0, result.getFiles().size());
        }
    }

    @Test
    void testPreview_EmptyAndNonExistentPaths(@TempDir Path tempDir) throws Exception {
        try (MockedStatic<PathSecurityUtils> utils = mockSecurityUtils(tempDir)) {
            Files.createDirectories(tempDir.resolve("existing"));

            DeleteFileTool.PreviewResult result = DeleteFileTool.preview(createArgs("existing", "ghost"));
            assertEquals(1, result.totalCount());
            assertEquals(1, result.getEmptyDirs().size());
            assertEquals(1, result.getNotFound().size());
            assertTrue(result.getNotFound().get(0).contains("ghost"));
        }
    }
}
