package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReadFileToolTest {

    private ReadFileTool tool;
    private ObjectMapper objectMapper;

    @Mock
    private Path mockPath;

    @BeforeEach
    void setUp() {
        tool = new ReadFileTool();
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        assertEquals("read_file", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("读取"));
        assertTrue(description.contains("文件"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("path"));
    }

    @Test
    void testMissingPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("path");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testEmptyPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testWhitespacePathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "   ");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testReadNonExistentFile() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(false);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "/non/existent/file.txt");
            
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }
    }

    @Test
    void testReadDirectory() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(false);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "src");
            
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }
    }

    @Test
    void testReadUnreadableFile() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(false);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }
    }

    @Test
    void testReadLargeFile() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn(20 * 1024 * 1024L);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "large.txt");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("文件过大"));
        }
    }

    @Test
    void testReadFileSuccessfully() throws Exception {
        String fileContent = "Hello World\nLine 2\nLine 3";
        List<String> fileLines = List.of("Hello World", "Line 2", "Line 3");
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn((long) fileContent.length());
            filesMock.when(() -> Files.readAllLines(mockPath)).thenReturn(fileLines);
            filesMock.when(() -> Files.getLastModifiedTime(mockPath))
                .thenReturn(java.nio.file.attribute.FileTime.fromMillis(System.currentTimeMillis()));
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("文件内容"));
            assertTrue(result.contains("Hello World"));
        }
    }

    @Test
    void testReadFileWithUnicode() throws Exception {
        String fileContent = "你好世界\n🎉 Emoji\n日本語";
        List<String> fileLines = List.of("你好世界", "🎉 Emoji", "日本語");
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("unicode.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn((long) fileContent.getBytes(StandardCharsets.UTF_8).length);
            filesMock.when(() -> Files.readAllLines(mockPath)).thenReturn(fileLines);
            filesMock.when(() -> Files.getLastModifiedTime(mockPath))
                .thenReturn(java.nio.file.attribute.FileTime.fromMillis(System.currentTimeMillis()));
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "unicode.txt");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("你好世界"));
        }
    }

    @Test
    void testReadEmptyFile() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("empty.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn(0L);
            filesMock.when(() -> Files.readAllLines(mockPath)).thenReturn(List.of());
            filesMock.when(() -> Files.getLastModifiedTime(mockPath))
                .thenReturn(java.nio.file.attribute.FileTime.fromMillis(System.currentTimeMillis()));
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "empty.txt");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("文件内容"));
        }
    }

    @Test
    void testRequiresFileLock() {
        assertTrue(tool.requiresFileLock());
    }

    @Test
    void testGetAffectedPaths() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "test.txt");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals("test.txt", paths.get(0));
    }

    @Test
    void testGetAffectedPathsWithoutPath() {
        ObjectNode args = objectMapper.createObjectNode();
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertTrue(paths.isEmpty());
    }

    @Test
    void testIOExceptionOnRead() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn(100L);
            filesMock.when(() -> Files.readAllLines(mockPath))
                .thenThrow(new IOException("Read error"));
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("读取文件失败"));
        }
    }
}