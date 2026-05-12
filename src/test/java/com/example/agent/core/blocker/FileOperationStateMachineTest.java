package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class FileOperationStateMachineTest {

    private FileOperationStateMachine stateMachine;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        stateMachine = new FileOperationStateMachine();
        stateMachine.reset();
    }

    @AfterEach
    void tearDown() {
        stateMachine.reset();
    }

    @Test
    @DisplayName("write_file 创建新文件应被允许")
    void writeFile_notExists_shouldBeAllowed() {
        String newFilePath = tempDir.resolve("NewFile.java").toString();
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", newFilePath);

        HookResult result = stateMachine.check("write_file", args);

        assertTrue(result.isAllowed(), "创建新文件应该被允许");
        assertTrue(stateMachine.isNewlyCreated(newFilePath), "新文件应被标记为 NEWLY_CREATED");
    }

    @Test
    @DisplayName("write_file 写入已存在文件应被允许")
    void writeFile_exists_shouldBeAllowed() throws IOException {
        Path existingFile = tempDir.resolve("Existing.java");
        Files.createFile(existingFile);
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", existingFile.toString());

        HookResult result = stateMachine.check("write_file", args);

        assertTrue(result.isAllowed(), "写入已存在文件应该被允许");
        assertFalse(stateMachine.isNewlyCreated(existingFile.toString()), "已存在文件不应被标记为 NEWLY_CREATED");
    }

    @Test
    @DisplayName("edit_file 修改不存在文件应被阻断")
    void editFile_notExists_shouldBeDenied() {
        String newFilePath = tempDir.resolve("NotExist.java").toString();
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", newFilePath);

        HookResult result = stateMachine.check("edit_file", args);

        assertFalse(result.isAllowed(), "edit_file 不能修改不存在的文件");
        assertTrue(result.getReason().contains("不存在"));
    }

    @Test
    @DisplayName("edit_file 修改已存在文件应被允许")
    void editFile_exists_shouldBeAllowed() throws IOException {
        Path existingFile = tempDir.resolve("Existing.java");
        Files.createFile(existingFile);
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", existingFile.toString());

        HookResult result = stateMachine.check("edit_file", args);

        assertTrue(result.isAllowed(), "edit_file 修改已存在文件应该被允许");
    }

    @Test
    @DisplayName("read_file 读取不存在文件应被阻断")
    void readFile_notExists_shouldBeDenied() {
        String newFilePath = tempDir.resolve("NotExist.java").toString();
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", newFilePath);

        HookResult result = stateMachine.check("read_file", args);

        assertFalse(result.isAllowed(), "read_file 不能读取不存在的文件");
        assertTrue(result.getReason().contains("不存在"));
    }

    @Test
    @DisplayName("read_file 读取已存在文件应被允许")
    void readFile_exists_shouldBeAllowed() throws IOException {
        Path existingFile = tempDir.resolve("Existing.java");
        Files.createFile(existingFile);
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", existingFile.toString());

        HookResult result = stateMachine.check("read_file", args);

        assertTrue(result.isAllowed(), "read_file 读取已存在文件应该被允许");
    }

    @Test
    @DisplayName("delete_file 删除不存在文件应被阻断")
    void deleteFile_notExists_shouldBeDenied() {
        String newFilePath = tempDir.resolve("NotExist.java").toString();
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", newFilePath);

        HookResult result = stateMachine.check("delete_file", args);

        assertFalse(result.isAllowed(), "delete_file 不能删除不存在的文件");
        assertTrue(result.getReason().contains("不存在"));
    }

    @Test
    @DisplayName("目录不能作为文件操作")
    void writeFile_isDirectory_shouldBeDenied() {
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", tempDir.toString());

        HookResult result = stateMachine.check("write_file", args);

        assertFalse(result.isAllowed(), "不能写入目录");
        assertTrue(result.getReason().contains("目录"));
    }

    @Test
    @DisplayName("非文件工具应始终被允许")
    void nonFileTools_shouldAlwaysBeAllowed() {
        JsonNode args = JsonNodeFactory.instance.objectNode();

        assertTrue(stateMachine.check("glob", args).isAllowed());
        assertTrue(stateMachine.check("grep", args).isAllowed());
        assertTrue(stateMachine.check("list_directory", args).isAllowed());
        assertTrue(stateMachine.check("bash", args).isAllowed());
    }

    @Test
    @DisplayName("与 EditBeforeReadBlocker 集成：新文件跳过先读检查")
    void integration_newFile_shouldSkipEditBeforeReadCheck() {
        String newFilePath = tempDir.resolve("NewFile.java").toString();
        JsonNode writeArgs = JsonNodeFactory.instance.objectNode()
                .put("path", newFilePath);

        stateMachine.check("write_file", writeArgs);

        EditBeforeReadBlocker editBlocker = new EditBeforeReadBlocker();
        editBlocker.setStateMachine(stateMachine);

        JsonNode editArgs = JsonNodeFactory.instance.objectNode()
                .put("path", newFilePath);
        HookResult result = editBlocker.check("write_file", editArgs);

        assertTrue(result.isAllowed(), "新文件创建后应跳过先读检查");
    }

    @Test
    @DisplayName("与 EditBeforeReadBlocker 集成：旧文件仍要求先读")
    void integration_existingFile_shouldStillRequireRead() throws IOException {
        Path existingFile = tempDir.resolve("Existing.java");
        Files.createFile(existingFile);

        EditBeforeReadBlocker editBlocker = new EditBeforeReadBlocker();
        editBlocker.setStateMachine(stateMachine);

        JsonNode editArgs = JsonNodeFactory.instance.objectNode()
                .put("path", existingFile.toString());
        HookResult result = editBlocker.check("edit_file", editArgs);

        assertTrue(result.isAllowed(), "已存在文件应允许编辑");
        assertTrue(result.isWarning(), "已存在文件应给出读取建议");
    }

    @Test
    @DisplayName("reset 应清空新文件追踪")
    void reset_shouldClearNewFiles() {
        String newFilePath = tempDir.resolve("NewFile.java").toString();
        JsonNode writeArgs = JsonNodeFactory.instance.objectNode()
                .put("path", newFilePath);

        stateMachine.check("write_file", writeArgs);
        assertTrue(stateMachine.isNewlyCreated(newFilePath));

        stateMachine.reset();
        assertFalse(stateMachine.isNewlyCreated(newFilePath), "reset 后应清空新文件标记");
    }
}
