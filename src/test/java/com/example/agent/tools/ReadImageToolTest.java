package com.example.agent.tools;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.config.ToolsConfig;
import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * {@link ReadImageTool} 测试。
 * 覆盖参数校验、格式校验、图片解析，以及成功读取后的图片旁路输出。
 */
@DisplayName("read_image 工具测试")
class ReadImageToolTest {

    private ReadImageTool tool;
    private ObjectMapper objectMapper;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        tool = new ReadImageTool();
        objectMapper = new ObjectMapper();
    }

    @AfterEach
    void tearDown() {
        ReadImageTool.drainPendingImages();
        ReadImageTool.resetTurnImageCount();
    }

    // ==================== 基础元信息 ====================

    @Test
    @DisplayName("工具名应为 read_image")
    void testGetName() {
        assertEquals("read_image", tool.getName());
    }

    @Test
    @DisplayName("参数 schema 应包含 path")
    void testGetParametersSchema() {
        assertTrue(tool.getParametersSchema().contains("path"));
    }

    // ==================== 参数与格式校验 ====================

    @Nested
    @DisplayName("参数校验")
    class ArgumentValidation {

        @Test
        @DisplayName("缺少 path 参数应抛异常")
        void testMissingPath() {
            ObjectNode args = objectMapper.createObjectNode();
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }

        @Test
        @DisplayName("path 为空应抛异常")
        void testBlankPath() {
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "   ");
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }

        @Test
        @DisplayName("文件不存在应抛异常")
        void testFileNotExist() {
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", tempDir.resolve("missing.png").toString());
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }

        @Test
        @DisplayName("不支持的扩展名应抛异常")
        void testUnsupportedExtension() throws Exception {
            Path textFile = tempDir.resolve("note.txt");
            Files.writeString(textFile, "hello");

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", textFile.toString());
            ToolExecutionException e = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(e.getMessage().contains("不支持的图片格式"));
        }

        @Test
        @DisplayName("内容不是图片应抛异常")
        void testInvalidImageContent() throws Exception {
            Path fake = tempDir.resolve("fake.png");
            Files.writeString(fake, "not an image");

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", fake.toString());
            try (MockedStatic<Config> configMock = mockVisionSupported()) {
                ToolExecutionException e = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
                assertTrue(e.getMessage().contains("无法解析"));
            }
        }
    }

    // ==================== 成功路径 ====================

    @Test
    @DisplayName("正常读取图片应返回文本结果并通过旁路输出图片")
    void testReadImageSuccess() throws Exception {
        Path imagePath = tempDir.resolve("sample.png");
        BufferedImage image = new BufferedImage(32, 24, BufferedImage.TYPE_INT_RGB);
        ImageIO.write(image, "png", imagePath.toFile());

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", imagePath.toString());

        try (MockedStatic<Config> configMock = mockVisionSupported();
             MockedStatic<WorkspaceManager> workspaceMock = mockStatic(WorkspaceManager.class)) {
            workspaceMock.when(WorkspaceManager::getHippoRoot).thenReturn(tempDir);

            String result = tool.execute(args);

            assertTrue(result.contains("图片已读取"));
            List<ReadImageTool.ReadImage> images = ReadImageTool.drainPendingImages();
            assertEquals(1, images.size());
            assertEquals(32, images.get(0).width());
            assertEquals(24, images.get(0).height());
            assertTrue(images.get(0).fileUri().startsWith("file://images/"));
            assertTrue(Files.exists(tempDir.resolve("images")));
        }
    }

    @Test
    @DisplayName("单轮超过 8 张应拒绝")
    void testPerTurnImageLimit() throws Exception {
        Path imagePath = tempDir.resolve("small.png");
        ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "png", imagePath.toFile());

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", imagePath.toString());

        try (MockedStatic<Config> configMock = mockVisionSupported();
             MockedStatic<WorkspaceManager> workspaceMock = mockStatic(WorkspaceManager.class)) {
            workspaceMock.when(WorkspaceManager::getHippoRoot).thenReturn(tempDir);

            for (int i = 0; i < 8; i++) {
                assertTrue(tool.execute(args).contains("图片已读取"), "第 " + (i + 1) + " 张应成功");
            }

            ToolExecutionException e = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(e.getMessage().contains("已达上限"));
        }
    }

    @Test
    @DisplayName("模型不支持视觉时应直接拒绝")
    void testVisionNotSupported() throws Exception {
        Path imagePath = tempDir.resolve("sample.png");
        ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "png", imagePath.toFile());

        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", imagePath.toString());

        try (MockedStatic<Config> configMock = mockStatic(Config.class)) {
            Config config = mock(Config.class);
            LlmConfig llm = mock(LlmConfig.class);
            ToolsConfig tools = mock(ToolsConfig.class);
            when(config.getLlm()).thenReturn(llm);
            when(config.getTools()).thenReturn(tools);
            when(tools.isModeRelaxed()).thenReturn(false);
            when(llm.getVisionSupported()).thenReturn("false");
            configMock.when(Config::getInstance).thenReturn(config);

            ToolExecutionException e = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(e.getMessage().contains("不支持图片识别"));
        }
    }

    private MockedStatic<Config> mockVisionSupported() {
        MockedStatic<Config> configMock = mockStatic(Config.class);
        Config config = mock(Config.class);
        LlmConfig llm = mock(LlmConfig.class);
        ToolsConfig tools = mock(ToolsConfig.class);
        when(config.getLlm()).thenReturn(llm);
        when(config.getTools()).thenReturn(tools);
        when(tools.isModeRelaxed()).thenReturn(false);
        when(llm.getVisionSupported()).thenReturn("true");
        configMock.when(Config::getInstance).thenReturn(config);
        return configMock;
    }
}
