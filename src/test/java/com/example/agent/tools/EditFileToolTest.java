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
            assertTrue(exception.getMessage().contains("必须唯一匹配"));
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
}