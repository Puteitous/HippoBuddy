package com.example.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EditFileToolTest {

    private EditFileTool tool;
    private ObjectMapper objectMapper;

    @Mock
    private Path mockPath;

    @BeforeEach
    void setUp() {
        tool = new EditFileTool();
        objectMapper = new ObjectMapper();
        lenient().when(mockPath.toAbsolutePath()).thenReturn(mockPath);
    }

    @Test
    void testGetName() {
        assertEquals("edit_file", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("替换"));
        assertTrue(description.contains("唯一匹配"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("path"));
        assertTrue(schema.contains("old_text"));
        assertTrue(schema.contains("new_text"));
    }

    @Test
    void testEditSingleLine() throws Exception {
        String fileContent = "Hello World\nThis is a test\nGoodbye World";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "This is a test");
            args.put("new_text", "This is modified");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("文件编辑成功"));
            
            filesMock.verify(() -> Files.writeString(eq(mockPath), contains("This is modified"), 
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testEditMultiLine() throws Exception {
        String fileContent = "Line 1\nLine 2\nLine 3";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Line 1\nLine 2");
            args.put("new_text", "Modified Line 1\nModified Line 2");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("文件编辑成功"));
            
            filesMock.verify(() -> Files.writeString(eq(mockPath), contains("Modified Line 1"), 
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testEditTextNotFound() throws Exception {
        String fileContent = "Hello World";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Not Found");
            args.put("new_text", "Replacement");
            
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }
    }

    @Test
    void testEditMultipleMatches() throws Exception {
        String fileContent = "Hello World\nHello World\nHello World";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Hello World");
            args.put("new_text", "Hi");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            
            assertTrue(exception.getMessage().contains("3 次"));
            assertTrue(exception.getMessage().contains("选项 2"));
        }
    }

    @Test
    void testMissingPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("old_text", "test");
        args.put("new_text", "replacement");
        
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testMissingOldTextParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "test.txt");
        args.put("new_text", "replacement");
        
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testMissingNewTextParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "test.txt");
        args.put("old_text", "test");
        
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testEditNonExistentFile() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(false);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "/non/existent/file.txt");
            args.put("old_text", "test");
            args.put("new_text", "replacement");
            
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }
    }

    @Test
    void testEditWithEmptyOldText() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn("Hello World");
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "");
            args.put("new_text", "Insert");
            
            assertThrows(ToolExecutionException.class, () -> tool.execute(args));
        }
    }

    @Test
    void testEditWithEmptyNewText() throws Exception {
        String fileContent = "Hello World";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Hello");
            args.put("new_text", "");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("文件编辑成功"));
            
            filesMock.verify(() -> Files.writeString(eq(mockPath), eq(" World"), 
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testRequiresFileLock() {
        assertTrue(tool.requiresFileLock());
    }

    @Test
    void testGetAffectedPaths() throws Exception {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "test.txt");
        args.put("old_text", "test");
        args.put("new_text", "replacement");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertEquals(1, paths.size());
        assertEquals("test.txt", paths.get(0));
    }

    @Test
    void testEditPreservesOtherContent() throws Exception {
        String fileContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Line 3");
            args.put("new_text", "Modified Line 3");
            
            tool.execute(args);
            
            filesMock.verify(() -> Files.writeString(eq(mockPath), 
                contains("Line 1\nLine 2\nModified Line 3\nLine 4\nLine 5"), 
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testFileNotRegularFile() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(false);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "test");
            args.put("new_text", "replacement");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("不是常规文件"));
        }
    }

    @Test
    void testFileNotReadable() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(false);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "test");
            args.put("new_text", "replacement");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("文件不可读"));
        }
    }

    @Test
    void testFileNotWritable() {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(false);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "test");
            args.put("new_text", "replacement");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("文件不可写"));
        }
    }

    @Test
    void testIOExceptionOnRead() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8))
                .thenThrow(new IOException("Read error"));
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "test");
            args.put("new_text", "replacement");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("编辑文件失败"));
        }
    }

    @Test
    void testGetAffectedPathsWithoutPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("old_text", "test");
        args.put("new_text", "replacement");
        
        var paths = tool.getAffectedPaths(args);
        
        assertNotNull(paths);
        assertTrue(paths.isEmpty());
    }

    @Test
    void testNullPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("path");
        args.put("old_text", "test");
        args.put("new_text", "replacement");
        
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testEmptyPathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "");
        args.put("old_text", "test");
        args.put("new_text", "replacement");
        
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testWhitespacePathParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "   ");
        args.put("old_text", "test");
        args.put("new_text", "replacement");
        
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testNullOldTextParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "test.txt");
        args.putNull("old_text");
        args.put("new_text", "replacement");
        
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testNullNewTextParameter() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "test.txt");
        args.put("old_text", "test");
        args.putNull("new_text");
        
        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testEditLargeFile() throws Exception {
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn(20 * 1024 * 1024L);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "test");
            args.put("new_text", "replacement");
            
            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("文件过大"));
        }
    }

    @Test
    void testEditWithUnicodeContent() throws Exception {
        String fileContent = "你好世界\nHello World\n🎉 Emoji";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn((long) fileContent.length());
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "你好世界");
            args.put("new_text", "Hello World CN");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("文件编辑成功"));
        }
    }

    @Test
    void testEditWithSpecialCharacters() throws Exception {
        String fileContent = "Line with $var and \"quotes\" and 'apostrophes'";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn((long) fileContent.length());
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "$var");
            args.put("new_text", "${variable}");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("文件编辑成功"));
        }
    }

    @Test
    void testEditWithNewlines() throws Exception {
        String fileContent = "Line 1\r\nLine 2\r\nLine 3";
        
        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            
            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");
            
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn((long) fileContent.length());
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);
            
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Line 2");
            args.put("new_text", "Modified Line 2");
            
            String result = tool.execute(args);
            
            assertNotNull(result);
            assertTrue(result.contains("文件编辑成功"));
        }
    }

    @Test
    void testEditRecordsChange() throws Exception {
        String fileContent = "Hello World\nThis is a test\nGoodbye World";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class);
             MockedStatic<FileChangeTracker> trackerMock = mockStatic(FileChangeTracker.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            when(mockPath.toAbsolutePath()).thenReturn(mockPath);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn((long) fileContent.length());
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "This is a test");
            args.put("new_text", "This is modified");

            tool.execute(args);

            trackerMock.verify(() -> FileChangeTracker.recordChange(
                anyString(), eq(fileContent), contains("This is modified"), eq("edit_file")));
        }
    }

    @Test
    void testEditWithEmptyNewTextRecordsChange() throws Exception {
        String fileContent = "Hello World";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class);
             MockedStatic<FileChangeTracker> trackerMock = mockStatic(FileChangeTracker.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            when(mockPath.toAbsolutePath()).thenReturn(mockPath);
            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.size(mockPath)).thenReturn((long) fileContent.length());
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Hello");
            args.put("new_text", "");

            tool.execute(args);

            trackerMock.verify(() -> FileChangeTracker.recordChange(
                anyString(), eq(fileContent), eq(" World"), eq("edit_file")));
        }
    }

    @Test
    void testCrlfFileWithLfOldText() throws Exception {
        String fileContent = "Line1\r\nLine2\r\nLine3\r\n";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class);
             MockedStatic<FileChangeTracker> trackerMock = mockStatic(FileChangeTracker.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Line1\nLine2");
            args.put("new_text", "Modified");

            String result = tool.execute(args);

            assertTrue(result.contains("文件编辑成功"));
            filesMock.verify(() -> Files.writeString(eq(mockPath), eq("Modified\r\nLine3\r\n"),
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testFirstLineMismatchShowsDiagnostic() throws Exception {
        String fileContent = "Line1\nLine2\nLine3\n";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Wrong1\nLine2\nLine3\n");
            args.put("new_text", "Modified");

            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));

            assertAll(
                () -> assertTrue(exception.getMessage().contains("文件中匹配位置附近的内容"),
                    "应输出诊断头部"),
                () -> assertTrue(exception.getMessage().contains(">>"),
                    "应包含行级匹配标注"),
                () -> assertTrue(exception.getMessage().contains("差异出现在 old_text 第"),
                    "应指出差异行位置")
            );
        }
    }

    @Test
    void testLastLineMismatchShowsDiagnostic() throws Exception {
        String fileContent = "Line1\nLine2\nLine3\n";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Line1\nLine2\nWrong3\n");
            args.put("new_text", "Modified");

            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));

            assertAll(
                () -> assertTrue(exception.getMessage().contains("文件中匹配位置附近的内容"),
                    "应输出诊断头部"),
                () -> assertTrue(exception.getMessage().contains(">>"),
                    "应包含行级匹配标注"),
                () -> assertTrue(exception.getMessage().contains("差异出现在 old_text 第"),
                    "应指出差异行位置")
            );
        }
    }

    @Test
    void testCurlyDoubleQuotesInOldText() throws Exception {
        String fileContent = "System.out.println(\"Hello\");\nint x = 1;\n";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "System.out.println(\u201cHello\u201d);");
            args.put("new_text", "System.out.println(\"Hi\");");

            String result = tool.execute(args);

            assertTrue(result.contains("文件编辑成功"));
            assertTrue(result.contains("弯引号已自动转换为直引号"));
            filesMock.verify(() -> Files.writeString(eq(mockPath), contains("System.out.println(\"Hi\");"),
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testCurlySingleQuotesInOldText() throws Exception {
        String fileContent = "char c = 'A';\nint x = 1;\n";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "char c = \u2018A\u2019;");
            args.put("new_text", "char c = 'B';");

            String result = tool.execute(args);

            assertTrue(result.contains("文件编辑成功"));
            assertTrue(result.contains("弯引号已自动转换为直引号"));
            filesMock.verify(() -> Files.writeString(eq(mockPath), contains("char c = 'B';"),
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testExtremeMismatchShowsFilePreview() throws Exception {
        String fileContent = "Line1\nLine2\nLine3\nLine4\nLine5\nLine6\nLine7\nLine8\nLine9\nLine10\nLine11\nLine12\n";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Completely different text that doesn't exist");
            args.put("new_text", "irrelevant");

            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));

            assertAll(
                () -> assertTrue(exception.getMessage().contains("差异过大"),
                    "应输出差异过大提示"),
                () -> assertTrue(exception.getMessage().contains("前 10 行"),
                    "应输出前 10 行内容预览"),
                () -> assertTrue(exception.getMessage().contains("Line10"),
                    "预览应包含前 10 行中的内容"),
                () -> assertTrue(exception.getMessage().contains("文件共 13 行"),
                    "应显示文件总行数（含末尾换行的 split 计数）")
            );
        }
    }

    @Test
    void testReplaceAllReplacesMultipleMatches() throws Exception {
        String fileContent = "Hello World\nHello World\nHello World";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Hello World");
            args.put("new_text", "Hi");
            args.put("replace_all", true);

            String result = tool.execute(args);

            assertAll(
                () -> assertTrue(result.contains("文件编辑成功")),
                () -> assertTrue(result.contains("替换次数: 3 处")),
                () -> assertTrue(result.contains("3 处"))
            );
            filesMock.verify(() -> Files.writeString(eq(mockPath), eq("Hi\nHi\nHi"),
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testReplaceAllErrorWithoutFlag() throws Exception {
        String fileContent = "Hello World\nHello World\nHello World";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Hello World");
            args.put("new_text", "Hi");

            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));

            assertAll(
                () -> assertTrue(exception.getMessage().contains("3 次")),
                () -> assertTrue(exception.getMessage().contains("选项 2")),
                () -> assertTrue(exception.getMessage().contains("replace_all=true"))
            );
        }
    }

    @Test
    void testReplaceAllSingleMatch() throws Exception {
        String fileContent = "Hello World\nGoodbye World";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "Hello World");
            args.put("new_text", "Hi");
            args.put("replace_all", true);

            String result = tool.execute(args);

            assertAll(
                () -> assertTrue(result.contains("文件编辑成功")),
                () -> assertTrue(result.contains("替换次数: 1 处"))
            );
            filesMock.verify(() -> Files.writeString(eq(mockPath), eq("Hi\nGoodbye World"),
                eq(StandardCharsets.UTF_8), any(StandardOpenOption.class), any(StandardOpenOption.class)));
        }
    }

    @Test
    void testReplaceAllShortOldTextThrowsError() throws Exception {
        String fileContent = "abcdef\n";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "ab");
            args.put("new_text", "xy");
            args.put("replace_all", true);

            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));

            assertTrue(exception.getMessage().contains("old_text 过短"));
            assertTrue(exception.getMessage().contains("最少需要 5 字符"));
        }
    }

    @Test
    void testReplaceAllShortOldTextWithoutFlagSucceeds() throws Exception {
        String fileContent = "abcdef\n";

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(mockPath);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("test.txt");

            filesMock.when(() -> Files.exists(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isReadable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.isWritable(mockPath)).thenReturn(true);
            filesMock.when(() -> Files.readString(mockPath, StandardCharsets.UTF_8)).thenReturn(fileContent);
            filesMock.when(() -> Files.writeString(eq(mockPath), anyString(), eq(StandardCharsets.UTF_8),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(mockPath);

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            args.put("old_text", "ab");
            args.put("new_text", "xy");

            String result = tool.execute(args);

            assertTrue(result.contains("文件编辑成功"));
        }
    }

    @ParameterizedTest
    @MethodSource("readFileConsistencyCases")
    void testReadFileEditFileConsistency(String rawContent, String readFileOutput, String editFileNormalized) {
        assertTrue(editFileNormalized.contains(readFileOutput),
            () -> "read_file output must be findable in edit_file normalized content\n" +
                  "raw:       " + escapeForDisplay(rawContent) + "\n" +
                  "read_file: " + escapeForDisplay(readFileOutput) + "\n" +
                  "edit_file: " + escapeForDisplay(editFileNormalized));
    }

    static Stream<Arguments> readFileConsistencyCases() {
        return Stream.of(
            Arguments.of("Hello\n",       "Hello",     "Hello\n"),
            Arguments.of("Hello",         "Hello",     "Hello"),
            Arguments.of("Hello\r\n",     "Hello",     "Hello\n"),
            Arguments.of("A\nB\nC\n",     "A\nB\nC",   "A\nB\nC\n"),
            Arguments.of("A\nB\nC",       "A\nB\nC",   "A\nB\nC"),
            Arguments.of("A\n\nB\n",      "A\n\nB",    "A\n\nB\n"),
            Arguments.of("A\r\nB\r\nC\r\n", "A\nB\nC",   "A\nB\nC\n"),
            Arguments.of("A\r\n\r\nB\r\n",  "A\n\nB",    "A\n\nB\n"),
            Arguments.of("A\n\n",         "A\n",       "A\n\n")
        );
    }

    private static String escapeForDisplay(String s) {
        return s.replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    @Test
    void testEditPassesTimestampCheck(@TempDir Path tempDir) throws Exception {
        Path testFile = tempDir.resolve("timestamp_ok.txt");
        Files.writeString(testFile, "Hello World");

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(testFile);
            securityUtilsMock.when(() -> PathSecurityUtils.getRelativePath(any())).thenReturn("timestamp_ok.txt");

            filesMock.when(() -> Files.exists(any())).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(any())).thenReturn(true);
            filesMock.when(() -> Files.isReadable(any())).thenReturn(true);
            filesMock.when(() -> Files.isWritable(any())).thenReturn(true);
            filesMock.when(() -> Files.readString(any(), any())).thenReturn("Hello World");
            filesMock.when(() -> Files.writeString(any(), anyString(), any(Charset.class),
                any(StandardOpenOption.class), any(StandardOpenOption.class))).thenReturn(testFile);
            long now = System.currentTimeMillis();
            filesMock.when(() -> Files.getLastModifiedTime(any())).thenReturn(FileTime.fromMillis(now));

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", testFile.toString());
            args.put("old_text", "Hello World");
            args.put("new_text", "Modified");

            String result = tool.execute(args);
            assertTrue(result.contains("文件编辑成功"));
        }
    }

    @Test
    void testConcurrentModificationThrowsError(@TempDir Path tempDir) throws Exception {
        Path testFile = tempDir.resolve("timestamp_conflict.txt");
        Files.writeString(testFile, "Hello World");

        try (MockedStatic<PathSecurityUtils> securityUtilsMock = mockStatic(PathSecurityUtils.class);
             MockedStatic<Files> filesMock = mockStatic(Files.class)) {

            securityUtilsMock.when(() -> PathSecurityUtils.validateAndResolve(anyString())).thenReturn(testFile);

            filesMock.when(() -> Files.exists(any())).thenReturn(true);
            filesMock.when(() -> Files.isRegularFile(any())).thenReturn(true);
            filesMock.when(() -> Files.isReadable(any())).thenReturn(true);
            filesMock.when(() -> Files.isWritable(any())).thenReturn(true);
            filesMock.when(() -> Files.readString(any(), any()))
                .thenReturn("Hello World", "Modified Content");
            filesMock.when(() -> Files.getLastModifiedTime(any()))
                .thenReturn(FileTime.fromMillis(1000), FileTime.fromMillis(2000));

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", testFile.toString());
            args.put("old_text", "Hello World");
            args.put("new_text", "Modified");

            ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> tool.execute(args));
            assertTrue(exception.getMessage().contains("外部修改"));
        }
    }
}