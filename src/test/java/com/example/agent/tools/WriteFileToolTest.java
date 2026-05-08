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
import java.nio.file.StandardOpenOption;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WriteFileToolTest {

    private WriteFileTool tool;
    private ObjectMapper objectMapper;

    @Mock
    private Path mockPath;

    @Mock
    private Path mockParentPath;

    @BeforeEach
    void setUp() {
        tool = new WriteFileTool();
        objectMapper = new ObjectMapper();
        lenient().when(mockPath.toAbsolutePath()).thenReturn(mockPath);
    }

    @Test
    void testGetName() {
        assertEquals("write_file", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("写入"));
        assertTrue(description.contains("文件"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("path"));
        assertTrue(schema.contains("content"));
    }

    @Test
    void testMissingPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("content", "test");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testMissingContentParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "test.txt");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("path");
        args.put("content", "test");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testNullContentParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "test.txt");
        args.putNull("content");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testEmptyPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "");
        args.put("content", "test");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testWhitespacePathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "   ");
        args.put("content", "test");
        
        assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
    }

    @Test
    void testWriteNewFile() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            when(mockPath.getParent()).thenReturn(mockParentPath);
            filesMock.when(() -> Files.exists(mockParentPath)).thenReturn(true);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(false);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("content", "Hello World");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("创建成功"));
        }
    }

    @Test
    void testOverwriteExistingFile() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            when(mockPath.getParent()).thenReturn(mockParentPath);
            filesMock.when(() -> Files.exists(mockParentPath)).thenReturn(true);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("content", "New content");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("覆盖成功"));
        }
    }

    @Test
    void testWriteEmptyContent() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("empty.txt");
            
            when(mockPath.getParent()).thenReturn(mockParentPath);
            filesMock.when(() -> Files.exists(mockParentPath)).thenReturn(true);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(false);
            filesMock.when(() -> Files.writeString(eq(mockPath), eq(""), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "empty.txt");
            args.put("content", "");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("创建成功"));
        }
    }

    @Test
    void testWriteWithUnicodeContent() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("unicode.txt");
            
            when(mockPath.getParent()).thenReturn(mockParentPath);
            filesMock.when(() -> Files.exists(mockParentPath)).thenReturn(true);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(false);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "unicode.txt");
            args.put("content", "你好世界\n🎉 Emoji\n日本語");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("创建成功"));
        }
    }

    @Test
    void testWriteLargeContent() {
        StringBuilder largeContent = new StringBuilder();
        for (int i = 0; i < 11 * 1024 * 1024; i++) {
            largeContent.append("a");
        }
        
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "large.txt");
        args.put("content", largeContent.toString());
        
        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            tool.execute(args);
        });
        
        assertTrue(exception.getMessage().contains("内容过大"));
    }

    @Test
    void testCreateParentDirectories() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("new/dir/test.txt");
            
            when(mockPath.getParent()).thenReturn(mockParentPath);
            filesMock.when(() -> Files.exists(mockParentPath)).thenReturn(false);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(false);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "new/dir/test.txt");
            args.put("content", "test");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("创建成功"));
            filesMock.verify(() -> Files.createDirectories(mockParentPath));
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
        args.put("content", "test");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals("test.txt", paths.get(0));
    }

    @Test
    void testGetAffectedPathsWithoutPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("content", "test");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertTrue(paths.isEmpty());
    }

    @Test
    void testIOExceptionOnWrite() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            when(mockPath.getParent()).thenReturn(mockParentPath);
            filesMock.when(() -> Files.exists(mockParentPath)).thenReturn(true);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class)))
                .thenThrow(new IOException("Write error"));
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("content", "test");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("写入文件失败"));
        }
    }

    @Test
    void testWriteNewFileRecordsChange() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class);
             MockedStatic<FileChangeTracker> trackerMock = mockStatic(FileChangeTracker.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            when(mockPath.getParent()).thenReturn(mockParentPath);
            when(mockPath.toAbsolutePath()).thenReturn(mockPath);
            filesMock.when(() -> Files.exists(mockParentPath)).thenReturn(true);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(false);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("content", "Hello World");

            tool.execute(args);

            trackerMock.verify(() -> FileChangeTracker.recordChange(
                anyString(), eq(""), eq("Hello World"), eq("write_file")));
        }
    }

    @Test
    void testOverwriteExistingFileRecordsChange() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class);
             MockedStatic<FileChangeTracker> trackerMock = mockStatic(FileChangeTracker.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            when(mockPath.getParent()).thenReturn(mockParentPath);
            when(mockPath.toAbsolutePath()).thenReturn(mockPath);
            filesMock.when(() -> Files.exists(mockParentPath)).thenReturn(true);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn("original content");
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("content", "New content");

            tool.execute(args);

            trackerMock.verify(() -> FileChangeTracker.recordChange(
                anyString(), eq("original content"), eq("New content"), eq("write_file")));
        }
    }
}