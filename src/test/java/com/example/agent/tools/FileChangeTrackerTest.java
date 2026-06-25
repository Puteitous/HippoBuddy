package com.example.agent.tools;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

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
    void testNewFileFlagTrueWhenFileDoesNotExist() {
        String filePath = tempDir.resolve("brand_new.txt").toString();
        FileChangeTracker.recordChange(filePath, "", "new content", "write_file", true);

        FileChangeTracker.FileChange change = FileChangeTracker.getLastChange(filePath);
        assertNotNull(change);
        assertTrue(change.newFile, "文件不存在时应标记为 newFile=true");
    }

    @Test
    void testNewFileFlagFalseWhenFileExists() throws Exception {
        Path testFile = tempDir.resolve("existing.txt");
        Files.writeString(testFile, "existing content", StandardCharsets.UTF_8);
        String filePath = testFile.toString();

        FileChangeTracker.recordChange(filePath, "existing content", "modified content", "edit_file", false);

        FileChangeTracker.FileChange change = FileChangeTracker.getLastChange(filePath);
        assertNotNull(change);
        assertFalse(change.newFile, "文件已存在时应标记为 newFile=false");
    }

    @Test
    void testRollbackDeletesNewFile() throws Exception {
        Path testFile = tempDir.resolve("to_delete.txt");
        Files.writeString(testFile, "new file content", StandardCharsets.UTF_8);
        String filePath = testFile.toString();

        FileChangeTracker.recordChange(filePath, "", "new file content", "write_file", true);

        assertTrue(Files.exists(testFile), "记录变更前应先创建文件（模拟 WriteFileTool 行为）");

        boolean success = FileChangeTracker.rollback(filePath);
        assertTrue(success);

        assertFalse(Files.exists(testFile), "回滚新建文件应删除文件");
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
            "/path/to/file.txt", "line1\nline2", "modified\ncontent", "edit_file", 1234567890L, false);

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
        assertFalse(change.newFile, "旧格式缺少 newFile 字段应默认为 false");
    }

    @Test
    void testFromJsonRecoversNewFileFlag() {
        String json = "{\"filePath\":\"/new/file.txt\",\"originalContent\":\"\",\"newContent\":\"content\",\"toolName\":\"write_file\",\"timestamp\":100,\"newFile\":true}";
        FileChangeTracker.FileChange change = FileChangeTracker.FileChange.fromJson(json);

        assertNotNull(change);
        assertEquals("/new/file.txt", change.filePath);
        assertEquals("", change.originalContent);
        assertTrue(change.newFile);
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
            "/path/to/file.txt", "original\ncontent", "new\ncontent", "edit_file", 42L, false);

        String json = original.toJson();
        FileChangeTracker.FileChange recovered = FileChangeTracker.FileChange.fromJson(json);

        assertEquals(original.filePath, recovered.filePath);
        assertEquals(original.originalContent, recovered.originalContent);
        assertEquals(original.newContent, recovered.newContent);
        assertEquals(original.toolName, recovered.toolName);
        assertEquals(original.timestamp, recovered.timestamp);
        assertEquals(original.newFile, recovered.newFile);
    }

    @Test
    void testToFromJsonRoundTripWithNewFile() {
        FileChangeTracker.FileChange original = new FileChangeTracker.FileChange(
            "/new/file.txt", "", "new content", "write_file", 99L, true);

        String json = original.toJson();
        FileChangeTracker.FileChange recovered = FileChangeTracker.FileChange.fromJson(json);

        assertEquals(original.filePath, recovered.filePath);
        assertEquals(original.originalContent, recovered.originalContent);
        assertEquals(original.newContent, recovered.newContent);
        assertEquals(original.toolName, recovered.toolName);
        assertEquals(original.timestamp, recovered.timestamp);
        assertTrue(recovered.newFile);
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

    @Test
    void testSessionIdFieldInFileChange() {
        FileChangeTracker.FileChange change = new FileChangeTracker.FileChange(
            "/path/to/file.txt", "old", "new", "write_file", 100L, false, "session-123");

        assertEquals("session-123", change.sessionId, "FileChange 应保存 sessionId");

        String json = change.toJson();
        assertTrue(json.contains("\"sessionId\":\"session-123\""), "sessionId 应序列化到 JSON");

        FileChangeTracker.FileChange recovered = FileChangeTracker.FileChange.fromJson(json);
        assertEquals("session-123", recovered.sessionId, "反序列化应恢复 sessionId");
    }

    @Test
    void testRecordChangeWithSessionId() {
        FileChangeTracker.setStorageDirForTest(tempDir);
        FileChangeTracker.setCurrentSessionId("test-session-456");
        try {
            String filePath = tempDir.resolve("session_test.txt").toString();
            FileChangeTracker.recordChange(filePath, "old", "new", "write_file");

            FileChangeTracker.FileChange change = FileChangeTracker.getLastChange(filePath);
            assertNotNull(change);
            assertEquals("test-session-456", change.sessionId, "ThreadLocal 中的 sessionId 应传递给 FileChange");
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }
    }

    @Test
    void testSessionIsolationWithThreadLocal() throws Exception {
        FileChangeTracker.setStorageDirForTest(tempDir);
        String fileA = tempDir.resolve("session_a.txt").toString();
        String fileB = tempDir.resolve("session_b.txt").toString();

        // 会话 A 记录变更
        FileChangeTracker.setCurrentSessionId("session-A");
        try {
            FileChangeTracker.recordChange(fileA, "old_A", "new_A", "write_file");
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }

        // 会话 B 记录变更
        FileChangeTracker.setCurrentSessionId("session-B");
        try {
            FileChangeTracker.recordChange(fileB, "old_B", "new_B", "edit_file");
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }

        // 跨会话查询：getLastChange 应能查到所有会话的变更
        FileChangeTracker.FileChange changeA = FileChangeTracker.getLastChange(fileA);
        assertNotNull(changeA, "会话 A 的变更应可查询");
        assertEquals("session-A", changeA.sessionId);

        FileChangeTracker.FileChange changeB = FileChangeTracker.getLastChange(fileB);
        assertNotNull(changeB, "会话 B 的变更应可查询");
        assertEquals("session-B", changeB.sessionId);

        // 会话 A 回滚不应影响会话 B
        boolean success = FileChangeTracker.rollback(fileA);
        assertTrue(success, "会话 A 的回滚应成功");

        FileChangeTracker.FileChange afterRollback = FileChangeTracker.getLastChange(fileA);
        assertNull(afterRollback, "会话 A 的变更被回滚后应不可查");

        FileChangeTracker.FileChange stillInB = FileChangeTracker.getLastChange(fileB);
        assertNotNull(stillInB, "会话 B 的变更应不受会话 A 回滚的影响");
        assertEquals("session-B", stillInB.sessionId);
    }

    @Test
    void testFromJsonOldFormatWithoutSessionId() {
        String json = "{\"filePath\":\"/old/file.txt\",\"originalContent\":\"old\",\"newContent\":\"new\",\"toolName\":\"write_file\",\"timestamp\":100,\"newFile\":false}";
        FileChangeTracker.FileChange change = FileChangeTracker.FileChange.fromJson(json);

        assertNotNull(change);
        assertEquals("", change.sessionId, "旧格式 JSON 缺少 sessionId 应默认为空字符串");
    }

    @Test
    void testRecordChangeWithoutSessionIdIsolation() {
        FileChangeTracker.setStorageDirForTest(tempDir);
        FileChangeTracker.setCurrentSessionId("session-X");
        try {
            String filePath = tempDir.resolve("no_session_id.txt").toString();
            FileChangeTracker.recordChange(filePath, "old", "new", "write_file");

            FileChangeTracker.FileChange change = FileChangeTracker.getLastChange(filePath);
            assertNotNull(change);
            assertEquals("session-X", change.sessionId, "ThreadLocal 未设置时 sessionId 应来自上下文");
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }
    }

    // ==================== getRecentChanges(limit, sessionId) ====================

    @Test
    void testGetRecentChangesBySessionFilter() throws InterruptedException {
        FileChangeTracker.setStorageDirForTest(tempDir);
        String fileA = tempDir.resolve("session_a.txt").toString();
        String fileB = tempDir.resolve("session_b.txt").toString();

        // 会话 A 记录 3 条变更
        FileChangeTracker.setCurrentSessionId("session-A");
        try {
            FileChangeTracker.recordChange(fileA, "a0", "a1", "write_file");
            Thread.sleep(5);
            FileChangeTracker.recordChange(fileA, "a1", "a2", "edit_file");
            Thread.sleep(5);
            FileChangeTracker.recordChange(fileA, "a2", "a3", "edit_file");
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }

        // 会话 B 记录 2 条变更
        FileChangeTracker.setCurrentSessionId("session-B");
        try {
            FileChangeTracker.recordChange(fileB, "b0", "b1", "write_file");
            Thread.sleep(5);
            FileChangeTracker.recordChange(fileB, "b1", "b2", "edit_file");
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }

        // 查询会话 A → 只返回 3 条
        List<FileChangeTracker.FileChange> changesA = FileChangeTracker.getRecentChanges(50, "session-A");
        assertEquals(3, changesA.size(), "会话 A 应有 3 条变更");
        for (FileChangeTracker.FileChange c : changesA) {
            assertEquals("session-A", c.sessionId, "所有变更应属于会话 A");
        }

        // 查询会话 B → 只返回 2 条
        List<FileChangeTracker.FileChange> changesB = FileChangeTracker.getRecentChanges(50, "session-B");
        assertEquals(2, changesB.size(), "会话 B 应有 2 条变更");
        for (FileChangeTracker.FileChange c : changesB) {
            assertEquals("session-B", c.sessionId, "所有变更应属于会话 B");
        }

        // 无参查询 → 返回全部 5 条
        List<FileChangeTracker.FileChange> all = FileChangeTracker.getRecentChanges(50);
        assertEquals(5, all.size(), "无参查询应返回所有会话的变更");
    }

    @Test
    void testGetRecentChangesBySessionNoChanges() {
        FileChangeTracker.setStorageDirForTest(tempDir);

        // 查询一个从未记录过变更的会话 ID
        List<FileChangeTracker.FileChange> changes = FileChangeTracker.getRecentChanges(50, "non-existent-session");
        assertNotNull(changes);
        assertTrue(changes.isEmpty(), "不存在的会话应返回空列表");
    }

    @Test
    void testGetRecentChangesBySessionNullId() {
        FileChangeTracker.setStorageDirForTest(tempDir);

        // null sessionId → 返回空列表
        List<FileChangeTracker.FileChange> changesNull = FileChangeTracker.getRecentChanges(50, (String) null);
        assertNotNull(changesNull);
        assertTrue(changesNull.isEmpty(), "null sessionId 应返回空列表");

        // 空字符串 sessionId → 返回空列表
        List<FileChangeTracker.FileChange> changesEmpty = FileChangeTracker.getRecentChanges(50, "");
        assertNotNull(changesEmpty);
        assertTrue(changesEmpty.isEmpty(), "空字符串 sessionId 应返回空列表");
    }

    @Test
    void testGetRecentChangesBySessionLimit() {
        FileChangeTracker.setStorageDirForTest(tempDir);
        FileChangeTracker.setCurrentSessionId("session-limit");
        try {
            for (int i = 0; i < 10; i++) {
                FileChangeTracker.recordChange(
                    tempDir.resolve("file" + i + ".txt").toString(),
                    "old" + i, "new" + i, "write_file");
            }
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }

        // 按会话查询 + limit 限制
        List<FileChangeTracker.FileChange> limited = FileChangeTracker.getRecentChanges(3, "session-limit");
        assertEquals(3, limited.size(), "应受 limit 参数限制");
    }

    @Test
    void testCreateNewSessionShowsNoChanges() {
        FileChangeTracker.setStorageDirForTest(tempDir);

        // 模拟：旧会话（session-old）已有变更
        FileChangeTracker.setCurrentSessionId("session-old");
        try {
            String filePath = tempDir.resolve("old_file.txt").toString();
            FileChangeTracker.recordChange(filePath, "old", "new", "write_file");
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }

        // 模拟：创建新会话（session-new），还没有任何变更
        // 查询新会话 → 应返回空列表
        List<FileChangeTracker.FileChange> newSessionChanges =
            FileChangeTracker.getRecentChanges(50, "session-new");
        assertNotNull(newSessionChanges);
        assertTrue(newSessionChanges.isEmpty(),
            "新创建的会话没有产生任何变更，查询应返回空列表");

        // 验证旧会话的变更仍然可查（不受影响）
        List<FileChangeTracker.FileChange> oldSessionChanges =
            FileChangeTracker.getRecentChanges(50, "session-old");
        assertFalse(oldSessionChanges.isEmpty(),
            "旧会话的变更应不受新会话创建的影响");
    }
}
