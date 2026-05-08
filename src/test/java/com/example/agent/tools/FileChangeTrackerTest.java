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
}
