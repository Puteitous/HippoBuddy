package com.example.agent.tools;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FileChangeTrackerTest {

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        FileChangeTracker.clear();
    }

    @Test
    void testRecordAndGetChange() {
        String filePath = tempDir.resolve("test.txt").toString();
        FileChangeTracker.recordChange(filePath, "original", "new content", "write_file");

        FileChangeTracker.FileChange change = FileChangeTracker.getLastChange(filePath);
        assertNotNull(change);
        assertEquals(filePath, change.filePath);
        assertEquals("original", change.originalContent);
        assertEquals("new content", change.newContent);
        assertEquals("write_file", change.toolName);
        assertTrue(change.timestamp > 0);
    }

    @Test
    void testGetLastChangeNonExistent() {
        FileChangeTracker.FileChange change = FileChangeTracker.getLastChange("/nonexistent/file.txt");
        assertNull(change);
    }

    @Test
    void testGetRecentChanges() throws InterruptedException {
        String file1 = tempDir.resolve("file1.txt").toString();
        String file2 = tempDir.resolve("file2.txt").toString();

        FileChangeTracker.recordChange(file1, "old1", "new1", "write_file");
        Thread.sleep(10);
        FileChangeTracker.recordChange(file2, "old2", "new2", "edit_file");

        List<FileChangeTracker.FileChange> recent = FileChangeTracker.getRecentChanges(10);
        assertEquals(2, recent.size());
        assertEquals(file2, recent.get(0).filePath);
        assertEquals(file1, recent.get(1).filePath);
    }

    @Test
    void testGetRecentChangesWithLimit() {
        for (int i = 0; i < 10; i++) {
            FileChangeTracker.recordChange(
                tempDir.resolve("file" + i + ".txt").toString(),
                "old" + i, "new" + i, "write_file");
        }

        List<FileChangeTracker.FileChange> recent = FileChangeTracker.getRecentChanges(3);
        assertEquals(3, recent.size());
    }

    @Test
    void testRollbackRestoresOriginalContent() throws Exception {
        Path testFile = tempDir.resolve("rollback_test.txt");
        Files.writeString(testFile, "original content", StandardCharsets.UTF_8);

        String filePath = testFile.toString();
        FileChangeTracker.recordChange(filePath, "original content", "modified content", "edit_file");

        boolean success = FileChangeTracker.rollback(filePath);
        assertTrue(success);

        String restoredContent = Files.readString(testFile, StandardCharsets.UTF_8);
        assertEquals("original content", restoredContent);
    }

    @Test
    void testRollbackNonExistentChange() {
        boolean success = FileChangeTracker.rollback("/nonexistent/file.txt");
        assertFalse(success);
    }

    @Test
    void testMultipleChangesToSameFile() {
        String filePath = tempDir.resolve("multi.txt").toString();

        FileChangeTracker.recordChange(filePath, "v0", "v1", "write_file");
        FileChangeTracker.recordChange(filePath, "v1", "v2", "edit_file");
        FileChangeTracker.recordChange(filePath, "v2", "v3", "edit_file");

        FileChangeTracker.FileChange last = FileChangeTracker.getLastChange(filePath);
        assertNotNull(last);
        assertEquals("v2", last.originalContent);
        assertEquals("v3", last.newContent);

        boolean success = FileChangeTracker.rollback(filePath);
        assertTrue(success);

        FileChangeTracker.FileChange afterRollback = FileChangeTracker.getLastChange(filePath);
        assertNotNull(afterRollback);
        assertEquals("v1", afterRollback.originalContent);
        assertEquals("v2", afterRollback.newContent);
    }

    @Test
    void testMaxChangesPerFile() {
        String filePath = tempDir.resolve("max_test.txt").toString();

        for (int i = 0; i < 25; i++) {
            FileChangeTracker.recordChange(filePath, "old" + i, "new" + i, "write_file");
        }

        List<FileChangeTracker.FileChange> all = FileChangeTracker.getRecentChanges(100);
        long count = all.stream().filter(c -> c.filePath.equals(filePath)).count();
        assertEquals(20, count);
    }

    @Test
    void testRollbackAfterMultipleChanges() throws Exception {
        Path testFile = tempDir.resolve("multi_rollback.txt");
        Files.writeString(testFile, "initial", StandardCharsets.UTF_8);
        String filePath = testFile.toString();

        FileChangeTracker.recordChange(filePath, "initial", "change1", "write_file");
        FileChangeTracker.recordChange(filePath, "change1", "change2", "edit_file");

        boolean success = FileChangeTracker.rollback(filePath);
        assertTrue(success);

        String content = Files.readString(testFile, StandardCharsets.UTF_8);
        assertEquals("change1", content);

        success = FileChangeTracker.rollback(filePath);
        assertTrue(success);

        content = Files.readString(testFile, StandardCharsets.UTF_8);
        assertEquals("initial", content);
    }

    @Test
    void testRecordChangeForNewFile() {
        String filePath = tempDir.resolve("new_file.txt").toString();
        FileChangeTracker.recordChange(filePath, "", "new content", "write_file");

        FileChangeTracker.FileChange change = FileChangeTracker.getLastChange(filePath);
        assertNotNull(change);
        assertEquals("", change.originalContent);
        assertEquals("new content", change.newContent);
    }

    @Test
    void testConcurrentRecordChanges() throws InterruptedException {
        String filePath = tempDir.resolve("concurrent.txt").toString();
        int threadCount = 10;

        Thread[] threads = new Thread[threadCount];
        for (int i = 0; i < threadCount; i++) {
            final int index = i;
            threads[i] = new Thread(() -> {
                FileChangeTracker.recordChange(filePath, "old" + index, "new" + index, "write_file");
            });
            threads[i].start();
        }

        for (Thread thread : threads) {
            thread.join();
        }

        FileChangeTracker.FileChange last = FileChangeTracker.getLastChange(filePath);
        assertNotNull(last);
    }

    // ==================== 序列化/反序列化 ====================

    @Test
    void testToJsonProducesValidJson() {
        FileChangeTracker.FileChange change = new FileChangeTracker.FileChange(
            "/path/to/file.txt", "line1\nline2", "modified\ncontent", "edit_file", 1234567890L);

        String json = change.toJson();
        assertTrue(json.startsWith("{"));
        assertTrue(json.endsWith("}"));
        assertTrue(json.contains("\"filePath\":\"/path/to/file.txt\""));
        assertTrue(json.contains("\"toolName\":\"edit_file\""));
        assertTrue(json.contains("\"timestamp\":1234567890"));
        assertTrue(json.contains("line1\\nline2"));
        assertTrue(json.contains("modified\\ncontent"));
    }

    @Test
    void testFromJsonRecoversChange() {
        String json = "{\"filePath\":\"/test/file.java\",\"originalContent\":\"old text\",\"newContent\":\"new text\",\"toolName\":\"write_file\",\"timestamp\":9876543210}";
        FileChangeTracker.FileChange change = FileChangeTracker.FileChange.fromJson(json);

        assertNotNull(change);
        assertEquals("/test/file.java", change.filePath);
        assertEquals("old text", change.originalContent);
        assertEquals("new text", change.newContent);
        assertEquals("write_file", change.toolName);
        assertEquals(9876543210L, change.timestamp);
    }

    @Test
    void testFromJsonHandlesEscapedCharacters() {
        String json = "{\"filePath\":\"/a.txt\",\"originalContent\":\"line1\\nline2\",\"newContent\":\"quote:\\\"hello\\\"\",\"toolName\":\"edit_file\",\"timestamp\":100}";
        FileChangeTracker.FileChange change = FileChangeTracker.FileChange.fromJson(json);

        assertNotNull(change);
        assertEquals("line1\nline2", change.originalContent);
        assertEquals("quote:\"hello\"", change.newContent);
    }

    @Test
    void testToFromJsonRoundTrip() {
        FileChangeTracker.FileChange original = new FileChangeTracker.FileChange(
            "/path/to/file.txt", "original\ncontent", "new\ncontent", "edit_file", 42L);

        String json = original.toJson();
        FileChangeTracker.FileChange recovered = FileChangeTracker.FileChange.fromJson(json);

        assertEquals(original.filePath, recovered.filePath);
        assertEquals(original.originalContent, recovered.originalContent);
        assertEquals(original.newContent, recovered.newContent);
        assertEquals(original.toolName, recovered.toolName);
        assertEquals(original.timestamp, recovered.timestamp);
    }

    // ==================== 持久化 ====================

    @Test
    void testRecordChangePersistsToFile(@TempDir Path storageDir) throws Exception {
        FileChangeTracker.resetForTest();
        FileChangeTracker.setStorageDirForTest(storageDir);

        String filePath = storageDir.resolve("test.txt").toString();
        FileChangeTracker.recordChange(filePath, "original", "modified", "write_file");

        Path storageFile = storageDir.resolve("changes.jsonl");
        // 关闭记录器后文件应仍然存在
        FileChangeTracker.resetForTest();

        assertTrue(Files.exists(storageFile), "持久化文件应在记录变更后被创建");
        String content = Files.readString(storageFile, StandardCharsets.UTF_8).trim();
        // toJson 会转义 Windows 反斜杠，所以用工具名/原文等唯一定位断言
        assertTrue(content.contains("write_file"), "持久化文件应包含工具名");
        assertTrue(content.contains("original"), "持久化文件应包含原文");
        assertTrue(content.contains("modified"), "持久化文件应包含修改内容");
    }

    @Test
    void testInitRecoversFromFile(@TempDir Path storageDir) throws Exception {
        FileChangeTracker.resetForTest();
        FileChangeTracker.setStorageDirForTest(storageDir);

        String filePath = storageDir.resolve("recover.txt").toString();
        FileChangeTracker.recordChange(filePath, "original", "recovered", "write_file");

        // 模拟重启：重置状态后重新设置存储目录（会从文件恢复）
        FileChangeTracker.resetForTest();
        FileChangeTracker.setStorageDirForTest(storageDir);

        // 验证记录已恢复
        FileChangeTracker.FileChange change = FileChangeTracker.getLastChange(filePath);
        assertNotNull(change, "重启后应恢复变更记录");
        assertEquals("recovered", change.newContent);

        FileChangeTracker.resetForTest();
    }

    @Test
    void testRollbackRemovesFromStorage(@TempDir Path storageDir) throws Exception {
        FileChangeTracker.resetForTest();
        FileChangeTracker.setStorageDirForTest(storageDir);

        Path testFile = storageDir.resolve("rollback_persist.txt");
        Files.writeString(testFile, "original content", StandardCharsets.UTF_8);
        String filePath = testFile.toString();

        FileChangeTracker.recordChange(filePath, "original content", "modified", "edit_file");

        // 回滚
        boolean success = FileChangeTracker.rollback(filePath);
        assertTrue(success);

        // 验证持久化文件中也移除了该记录
        Path storageFile = storageDir.resolve("changes.jsonl");
        FileChangeTracker.resetForTest();
        String content = Files.readString(storageFile, StandardCharsets.UTF_8).trim();
        assertFalse(content.contains("modified"), "回滚后持久化文件不应包含已回滚的记录");
    }
}
