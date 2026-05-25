package com.example.agent.snapshot;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FileSnapshotManagerTest {

    @TempDir
    Path tempDir;

    private static final String SESSION_ID = "test-session-123";
    private static final String MSG_ID_1 = "msg-001";
    private static final String MSG_ID_2 = "msg-002";

    @BeforeEach
    void setUp() {
        FileSnapshotManager.resetForTest();
        FileSnapshotManager.setStorageDirForTest(tempDir);
    }

    @Test
    void testTrackFileAndMakeSnapshot() throws Exception {
        Path testFile = tempDir.resolve("test.java");
        Files.writeString(testFile, "public class Test {}", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        Snapshot snapshot = FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        assertNotNull(snapshot);
        assertEquals(MSG_ID_1, snapshot.getMessageId());
        assertEquals(1, snapshot.getTrackedFiles().size());

        Snapshot.TrackedFile tf = snapshot.getTrackedFiles().get(0);
        assertEquals(testFile.toString(), tf.getPath());
        assertNotNull(tf.getBackup());
        assertTrue(tf.getBackup().endsWith("@v1"));

        Path backupPath = tempDir.resolve(SESSION_ID).resolve("file-history").resolve(tf.getBackup());
        assertTrue(Files.exists(backupPath));
        assertEquals("public class Test {}", Files.readString(backupPath, StandardCharsets.UTF_8));
    }

    @Test
    void testMakeSnapshotWithNoTrackedFiles() {
        Snapshot result = FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);
        assertNull(result);
    }

    @Test
    void testMakeSnapshotWithEmptySessionId() {
        Snapshot result = FileSnapshotManager.makeSnapshot("", MSG_ID_1);
        assertNull(result);
    }

    @Test
    void testRewindToSnapshotRestoresFile() throws Exception {
        Path testFile = tempDir.resolve("restore_test.java");
        Files.writeString(testFile, "version 1", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        Files.writeString(testFile, "modified content", StandardCharsets.UTF_8);

        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_1);

        assertTrue(result.isSuccess());
        assertEquals("version 1", Files.readString(testFile, StandardCharsets.UTF_8));
    }

    @Test
    void testRewindDeletesFileCreatedInLaterRound() throws Exception {
        Path existingFile = tempDir.resolve("existing.java");
        Files.writeString(existingFile, "original", StandardCharsets.UTF_8);

        // Round 1: track existingFile, snapshot at msg-001
        FileSnapshotManager.trackFile(SESSION_ID, existingFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);
        assertTrue(Files.exists(existingFile));

        // Round 2: create newFile, track it, snapshot at msg-002
        Path newFile = tempDir.resolve("new_file.txt");
        Files.writeString(newFile, "new content", StandardCharsets.UTF_8);
        FileSnapshotManager.trackFile(SESSION_ID, newFile.toString(), true);
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);
        assertTrue(Files.exists(newFile));

        // Rewind to msg-001: newFile should be deleted (created in later round)
        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_1);
        assertTrue(result.isSuccess());
        assertFalse(Files.exists(newFile), "后续轮次创建的文件应被删除");
        assertTrue(Files.exists(existingFile), "已有文件应保留");
    }

    @Test
    void testRewindToSnapshotOverwritesModifiedFile() throws Exception {
        Path testFile = tempDir.resolve("force_test.java");
        Files.writeString(testFile, "original", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        Files.writeString(testFile, "externally modified", StandardCharsets.UTF_8);

        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_1);

        assertTrue(result.isSuccess());
        assertEquals("original", Files.readString(testFile, StandardCharsets.UTF_8));
    }

    @Test
    void testRewindToSnapshotWithUnknownMessageId() {
        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(SESSION_ID, "nonexistent-msg");
        assertFalse(result.isSuccess());
        assertNotNull(result.getError());
    }

    @Test
    void testGetPreview() throws Exception {
        Path testFile = tempDir.resolve("preview_test.java");
        Files.writeString(testFile, "original", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        FileSnapshotManager.PreviewResult preview = FileSnapshotManager.getPreview(SESSION_ID, MSG_ID_1);
        assertNotNull(preview);
        assertEquals(1, preview.getFiles().size());
        assertEquals("restore", preview.getFiles().get(0).getAction());
    }

    @Test
    void testGetPreviewWithUnknownMessageId() {
        FileSnapshotManager.PreviewResult preview = FileSnapshotManager.getPreview(SESSION_ID, "nonexistent-msg");
        assertNull(preview);
    }

    @Test
    void testSnapshotJsonRoundTrip() {
        List<Snapshot.TrackedFile> files = List.of(
            new Snapshot.TrackedFile("/path/to/file.java", "a1b2c3d4", "a1b2c3d4@v1"),
            new Snapshot.TrackedFile("/path/to/new.txt", "e5f6g7h8", null)
        );
        Snapshot original = new Snapshot("msg-001", 1000L, files);

        String json = original.toJson();
        Snapshot restored = Snapshot.fromJson(json);

        assertEquals(original.getMessageId(), restored.getMessageId());
        assertEquals(original.getTimestamp(), restored.getTimestamp());
        assertEquals(original.getTrackedFiles().size(), restored.getTrackedFiles().size());
        assertEquals(original.getTrackedFiles().get(0).getPath(), restored.getTrackedFiles().get(0).getPath());
        assertEquals(original.getTrackedFiles().get(0).getHash(), restored.getTrackedFiles().get(0).getHash());
        assertEquals(original.getTrackedFiles().get(0).getBackup(), restored.getTrackedFiles().get(0).getBackup());
        assertNull(restored.getTrackedFiles().get(1).getBackup());
    }

    @Test
    void testTrackedFileJsonRoundTripWithNullBackup() {
        Snapshot.TrackedFile tf = new Snapshot.TrackedFile("/path/file.java", "hash123", null);
        String json = tf.toJson();
        Snapshot.TrackedFile restored = Snapshot.TrackedFile.fromJson(json);

        assertEquals(tf.getPath(), restored.getPath());
        assertEquals(tf.getHash(), restored.getHash());
        assertNull(restored.getBackup());
    }

    @Test
    void testThreadLocalSessionId() {
        assertTrue(FileSnapshotManager.getCurrentSessionId().isEmpty());

        FileSnapshotManager.setCurrentSessionId("session-456");
        assertEquals("session-456", FileSnapshotManager.getCurrentSessionId());

        FileSnapshotManager.clearCurrentSessionId();
        assertTrue(FileSnapshotManager.getCurrentSessionId().isEmpty());
    }

    @Test
    void testTrackCurrentSessionFile() throws Exception {
        Path testFile = tempDir.resolve("session_file.java");
        Files.writeString(testFile, "content", StandardCharsets.UTF_8);

        FileSnapshotManager.setCurrentSessionId(SESSION_ID);
        FileSnapshotManager.trackCurrentSessionFile(testFile.toString());
        FileSnapshotManager.clearCurrentSessionId();

        Snapshot snapshot = FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);
        assertNotNull(snapshot);
        assertEquals(1, snapshot.getTrackedFiles().size());
    }

    @Test
    void testMakeSnapshotReusesUnchangedBackup() throws Exception {
        Path testFile = tempDir.resolve("reuse_test.java");
        Files.writeString(testFile, "stable content", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        Snapshot snapshot2 = FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);

        assertNotNull(snapshot2);
        assertEquals(1, snapshot2.getTrackedFiles().size());

        Snapshot.TrackedFile tf = snapshot2.getTrackedFiles().get(0);
        assertTrue(tf.getBackup().endsWith("@v1"), "文件未变化时应复用 v1 备份");
    }

    @Test
    void testMultipleFilesInOneSnapshot() throws Exception {
        Path file1 = tempDir.resolve("multi_1.java");
        Path file2 = tempDir.resolve("multi_2.java");
        Files.writeString(file1, "file1 content", StandardCharsets.UTF_8);
        Files.writeString(file2, "file2 content", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, file1.toString());
        FileSnapshotManager.trackFile(SESSION_ID, file2.toString());
        Snapshot snapshot = FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        assertNotNull(snapshot);
        assertEquals(2, snapshot.getTrackedFiles().size());
    }

    @Test
    void testLoadAllSnapshots() throws Exception {
        Path testFile = tempDir.resolve("load_test.java");
        Files.writeString(testFile, "content", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        List<Snapshot> loaded = FileSnapshotManager.loadAllSnapshots(SESSION_ID);
        assertEquals(1, loaded.size());
        assertEquals(MSG_ID_1, loaded.get(0).getMessageId());
    }

    @Test
    void testLoadAllSnapshotsEmpty() {
        List<Snapshot> loaded = FileSnapshotManager.loadAllSnapshots(SESSION_ID);
        assertTrue(loaded.isEmpty());
    }

    @Test
    void testTruncateSnapshotsAfter() throws Exception {
        Path testFile = tempDir.resolve("truncate_test.java");
        Files.writeString(testFile, "v1", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        Files.writeString(testFile, "v2", StandardCharsets.UTF_8);
        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);

        assertEquals(2, FileSnapshotManager.loadAllSnapshots(SESSION_ID).size());

        FileSnapshotManager.truncateSnapshotsAfter(SESSION_ID, MSG_ID_2);

        List<Snapshot> remaining = FileSnapshotManager.loadAllSnapshots(SESSION_ID);
        assertEquals(1, remaining.size());
        assertEquals(MSG_ID_1, remaining.get(0).getMessageId());
    }

    @Test
    void testGcRetainsMaxSnapshots() throws Exception {
        Path testFile = tempDir.resolve("gc_test.java");

        for (int i = 1; i <= 5; i++) {
            Files.writeString(testFile, "v" + i, StandardCharsets.UTF_8);
            FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
            FileSnapshotManager.makeSnapshot(SESSION_ID, "msg-00" + i);
        }

        assertEquals(5, FileSnapshotManager.loadAllSnapshots(SESSION_ID).size());

        FileSnapshotManager.gc(SESSION_ID, 3);

        List<Snapshot> afterGc = FileSnapshotManager.loadAllSnapshots(SESSION_ID);
        assertEquals(3, afterGc.size());
        assertEquals("msg-003", afterGc.get(0).getMessageId());
    }

    @Test
    void testGcDoesNotDeleteReferencedBackups() throws Exception {
        Path testFile = tempDir.resolve("gc_ref_test.java");
        Files.writeString(testFile, "stable", StandardCharsets.UTF_8);

        for (int i = 1; i <= 4; i++) {
            FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
            FileSnapshotManager.makeSnapshot(SESSION_ID, "msg-00" + i);
        }

        Path fileHistoryDir = tempDir.resolve(SESSION_ID).resolve("file-history");
        assertTrue(Files.exists(fileHistoryDir));

        long beforeCount;
        try (var stream = Files.list(fileHistoryDir)) {
            beforeCount = stream.count();
        }

        FileSnapshotManager.gc(SESSION_ID, 2);

        try (var stream = Files.list(fileHistoryDir)) {
            long afterCount = stream.count();
            assertEquals(beforeCount, afterCount, "被保留快照引用的备份文件不应被删除");
        }
    }

    @Test
    void testComputeFileHashConsistency() {
        String hash1 = FileSnapshotManager.computeFileHash("/path/to/file.java");
        String hash2 = FileSnapshotManager.computeFileHash("/path/to/file.java");
        assertEquals(hash1, hash2, "相同路径应产生相同 hash");
        assertEquals(16, hash1.length(), "hash 应为 16 字符");
    }

    @Test
    void testComputeFileHashDifferentForDifferentPaths() {
        String hash1 = FileSnapshotManager.computeFileHash("/path/a.java");
        String hash2 = FileSnapshotManager.computeFileHash("/path/b.java");
        assertNotEquals(hash1, hash2, "不同路径应产生不同 hash");
    }

    @Test
    void testBigFileIsSkipped() throws Exception {
        Path bigFile = tempDir.resolve("big_file.bin");

        byte[] bigContent = new byte[11 * 1024 * 1024];
        bigContent[0] = 'A';
        bigContent[bigContent.length - 1] = 'B';
        Files.write(bigFile, bigContent);

        FileSnapshotManager.trackFile(SESSION_ID, bigFile.toString());
        Snapshot snapshot = FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        assertNotNull(snapshot);
        assertEquals(1, snapshot.getTrackedFiles().size());

        Snapshot.TrackedFile tf = snapshot.getTrackedFiles().get(0);
        assertNull(tf.getBackup(), "大文件不应创建备份");
    }

    @Test
    void testMakeSnapshotAbortsOnBackupFailure() throws Exception {
        Path goodFile = tempDir.resolve("good.java");
        Files.writeString(goodFile, "good", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(SESSION_ID, goodFile.toString());

        // 将 file-history 目录替换为普通文件，使备份写入失败
        Path fileHistoryDir = tempDir.resolve(SESSION_ID).resolve("file-history");
        Files.createDirectories(fileHistoryDir.getParent());
        Files.writeString(fileHistoryDir, "I am a file, not a directory");

        Snapshot snapshot = FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);
        assertNull(snapshot, "备份目录无法创建时应返回 null");
    }

    @Test
    void testRewindToSnapshotWithNullSessionId() {
        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(null, MSG_ID_1);
        assertFalse(result.isSuccess());
    }

    @Test
    void testMakeSnapshotAutoTriggersGc() throws Exception {
        Path testFile = tempDir.resolve("auto_gc.java");

        for (int i = 1; i <= 101; i++) {
            Files.writeString(testFile, "v" + i, StandardCharsets.UTF_8);
            FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
            FileSnapshotManager.makeSnapshot(SESSION_ID, "msg-" + i);
        }

        List<Snapshot> snapshots = FileSnapshotManager.loadAllSnapshots(SESSION_ID);
        assertEquals(100, snapshots.size(), "超过 100 个快照时应自动 GC 到 100 个");
        assertEquals("msg-2", snapshots.get(0).getMessageId(), "最旧的快照 msg-1 应被淘汰");
    }

    @Test
    void testMultipleSessionsIsolation() throws Exception {
        String sessionA = "session-A";
        String sessionB = "session-B";

        Path fileA = tempDir.resolve("fileA.java");
        Path fileB = tempDir.resolve("fileB.java");
        Files.writeString(fileA, "content A", StandardCharsets.UTF_8);
        Files.writeString(fileB, "content B", StandardCharsets.UTF_8);

        FileSnapshotManager.trackFile(sessionA, fileA.toString());
        FileSnapshotManager.trackFile(sessionB, fileB.toString());
        FileSnapshotManager.makeSnapshot(sessionA, MSG_ID_1);
        FileSnapshotManager.makeSnapshot(sessionB, MSG_ID_2);

        List<Snapshot> snapshotsA = FileSnapshotManager.loadAllSnapshots(sessionA);
        assertEquals(1, snapshotsA.size());
        assertEquals(fileA.toString(), snapshotsA.get(0).getTrackedFiles().get(0).getPath());

        List<Snapshot> snapshotsB = FileSnapshotManager.loadAllSnapshots(sessionB);
        assertEquals(1, snapshotsB.size());
        assertEquals(fileB.toString(), snapshotsB.get(0).getTrackedFiles().get(0).getPath());
    }

    @Test
    void testTrackedFileWithSpecialCharactersInPath() {
        String specialPath = "E:\\my project\\file (1).java";
        Snapshot.TrackedFile tf = new Snapshot.TrackedFile(specialPath, "abc123", "abc123@v1");
        String json = tf.toJson();
        Snapshot.TrackedFile restored = Snapshot.TrackedFile.fromJson(json);
        assertEquals(specialPath, restored.getPath());
    }

    @Test
    void testTrackedFileWithNewlinesInPath() {
        String pathWithNewline = "/path/line1\nline2/file.java";
        Snapshot.TrackedFile tf = new Snapshot.TrackedFile(pathWithNewline, "abc123", "abc123@v1");
        Snapshot.TrackedFile restored = Snapshot.TrackedFile.fromJson(tf.toJson());
        assertEquals(pathWithNewline, restored.getPath());
    }

    @Test
    void testEmptyTrackedFilesSerialization() {
        Snapshot snapshot = new Snapshot("msg-empty", 5000L, List.of());
        String json = snapshot.toJson();

        assertTrue(json.contains("\"trackedFiles\":[]"));

        Snapshot restored = Snapshot.fromJson(json);
        assertTrue(restored.getTrackedFiles().isEmpty());
    }

    @Test
    void testRewindDeletesFileCreatedInTargetRound() throws Exception {
        Path existingFile = tempDir.resolve("existing.java");
        Files.writeString(existingFile, "original", StandardCharsets.UTF_8);

        // Round 1: track existingFile
        FileSnapshotManager.trackFile(SESSION_ID, existingFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        // Round 2: edit existingFile + create newFile
        Files.writeString(existingFile, "modified", StandardCharsets.UTF_8);
        Path newFile = tempDir.resolve("new_file.txt");
        Files.writeString(newFile, "brand new", StandardCharsets.UTF_8);
        FileSnapshotManager.trackFile(SESSION_ID, existingFile.toString());
        FileSnapshotManager.trackFile(SESSION_ID, newFile.toString(), true);
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);
        assertTrue(Files.exists(newFile));

        // Rewind to msg-002: newFile should be DELETED (created in this round),
        // existingFile should be RESTORED (was edited in this round)
        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_2);
        assertTrue(result.isSuccess());
        assertFalse(Files.exists(newFile), "本轮新创建的文件应被删除");
        assertEquals("original", Files.readString(existingFile, StandardCharsets.UTF_8), "已有文件应恢复为初始内容");
    }

    @Test
    void testRewindDoesNotDeleteExistingFileWhenRollingBackToEditRound() throws Exception {
        Path testFile = tempDir.resolve("persist.java");
        Files.writeString(testFile, "v1", StandardCharsets.UTF_8);

        // Round 1: track testFile (pre-existing)
        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        // Round 2: edit testFile
        Files.writeString(testFile, "v2", StandardCharsets.UTF_8);
        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);

        // Rewind to msg-002: testFile should be restored (existed in previous snapshot)
        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_2);
        assertTrue(result.isSuccess());
        assertTrue(Files.exists(testFile), "编辑轮次的已有文件应保留");
        assertEquals("v1", Files.readString(testFile, StandardCharsets.UTF_8), "应恢复为最初内容");
    }

    @Test
    void testRewindDeletesFileCreatedInLaterRoundWithAccumulatedSnapshots() throws Exception {
        Path existingFile = tempDir.resolve("existing.java");
        Files.writeString(existingFile, "original", StandardCharsets.UTF_8);

        // Round 1: track existingFile
        FileSnapshotManager.trackFile(SESSION_ID, existingFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        // Round 2: create newFileB
        Path newFileB = tempDir.resolve("newFileB.txt");
        Files.writeString(newFileB, "file B content", StandardCharsets.UTF_8);
        FileSnapshotManager.trackFile(SESSION_ID, newFileB.toString(), true);
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);

        // Rewind to msg-001: newFileB should be deleted (created in later round)
        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_1);
        assertTrue(result.isSuccess());
        assertFalse(Files.exists(newFileB), "后续轮次创建的文件应被删除");
        assertTrue(Files.exists(existingFile), "已有文件应保留");
    }

    @Test
    void testPreviewShowsDeleteForNewlyCreatedFile() throws Exception {
        Path existingFile = tempDir.resolve("existing.java");
        Files.writeString(existingFile, "original", StandardCharsets.UTF_8);

        // Round 1: track existingFile
        FileSnapshotManager.trackFile(SESSION_ID, existingFile.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        // Round 2: create newFile
        Path newFile = tempDir.resolve("new_preview.txt");
        Files.writeString(newFile, "new content", StandardCharsets.UTF_8);
        FileSnapshotManager.trackFile(SESSION_ID, newFile.toString(), true);
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);

        // Preview for msg-002: newFile should show "delete", existingFile should show "restore"
        FileSnapshotManager.PreviewResult preview = FileSnapshotManager.getPreview(SESSION_ID, MSG_ID_2);
        assertNotNull(preview);
        assertEquals(2, preview.getFiles().size());

        for (FileSnapshotManager.PreviewFile pf : preview.getFiles()) {
            if (pf.getFilePath().equals(newFile.toString())) {
                assertEquals("delete", pf.getAction(), "新建文件预览应显示 delete");
            } else if (pf.getFilePath().equals(existingFile.toString())) {
                assertEquals("restore", pf.getAction(), "已有文件预览应显示 restore");
            }
        }
    }

    @Test
    void testRewindRestoresFileDeletedInLaterRound() throws Exception {
        Path testFile = tempDir.resolve("restore_deleted.java");
        Files.writeString(testFile, "original content", StandardCharsets.UTF_8);

        // Round 1: create testFile
        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString(), true);
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);
        assertTrue(Files.exists(testFile));

        // Round 2: delete testFile (simulated via bash - no trackFile call)
        Files.delete(testFile);
        assertFalse(Files.exists(testFile));

        // makeSnapshot still picks up testFile from inherited files
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);

        // Rewind to msg-002: testFile should be restored (undo the deletion)
        FileSnapshotManager.RewindResult result = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_2);
        assertTrue(result.isSuccess());
        assertTrue(Files.exists(testFile), "被删除的文件应被恢复");
        assertEquals("original content", Files.readString(testFile, StandardCharsets.UTF_8), "应恢复为最初内容");
    }

    @Test
    void testPreviewShowsRestoreForDeletedCreatedFile() throws Exception {
        Path testFile = tempDir.resolve("preview_restore.txt");
        Files.writeString(testFile, "content", StandardCharsets.UTF_8);

        // Round 1: create testFile
        FileSnapshotManager.trackFile(SESSION_ID, testFile.toString(), true);
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);

        // Round 2: delete testFile
        Files.delete(testFile);
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);

        // Preview for msg-002: should show "restore"
        FileSnapshotManager.PreviewResult preview = FileSnapshotManager.getPreview(SESSION_ID, MSG_ID_2);
        assertNotNull(preview);
        assertEquals(1, preview.getFiles().size());
        FileSnapshotManager.PreviewFile pf = preview.getFiles().get(0);
        assertEquals("restore", pf.getAction(), "被删除的文件预览应显示 restore");
        assertEquals(testFile.toString(), pf.getFilePath());
    }

    @Test
    void testContinuousRewindTwice() throws Exception {
        Path fileA = tempDir.resolve("fileA.txt");

        // Round 1 (msg-001): create fileA
        Files.writeString(fileA, "v1");
        FileSnapshotManager.trackFile(SESSION_ID, fileA.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_1);
        assertEquals("v1", Files.readString(fileA));

        // Round 2 (msg-002): edit fileA, create fileB
        Path fileB = tempDir.resolve("fileB.txt");
        Files.writeString(fileA, "v2");
        Files.writeString(fileB, "new");
        FileSnapshotManager.trackFile(SESSION_ID, fileA.toString());
        FileSnapshotManager.trackFile(SESSION_ID, fileB.toString(), true);
        FileSnapshotManager.makeSnapshot(SESSION_ID, MSG_ID_2);
        assertEquals("v2", Files.readString(fileA));
        assertTrue(Files.exists(fileB));

        // Round 3 (msg-003): edit fileA, edit fileB
        Files.writeString(fileA, "v3");
        Files.writeString(fileB, "v3_edit");
        FileSnapshotManager.trackFile(SESSION_ID, fileA.toString());
        FileSnapshotManager.trackFile(SESSION_ID, fileB.toString());
        FileSnapshotManager.makeSnapshot(SESSION_ID, "msg-003");
        assertEquals("v3", Files.readString(fileA));
        assertEquals("v3_edit", Files.readString(fileB));

        // --- First rollback: rewind to msg-002 ---
        FileSnapshotManager.RewindResult r1 = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_2);
        assertTrue(r1.isSuccess());
        FileSnapshotManager.truncateSnapshotsAfter(SESSION_ID, MSG_ID_2);

        // fileA should be restored to "v1" (from msg-001 backup, pre-edit)
        assertEquals("v1", Files.readString(fileA), "第一次回滚后 fileA 应恢复为 v1");
        // fileB should be deleted (created=true in msg-002, the target round)
        assertFalse(Files.exists(fileB), "第一次回滚后 fileB 应被删除");
        // snapshots.jsonl should only have msg-001 left
        assertEquals(1, FileSnapshotManager.loadAllSnapshots(SESSION_ID).size());

        // --- Second rollback: rewind to msg-001 ---
        FileSnapshotManager.RewindResult r2 = FileSnapshotManager.rewindToSnapshot(SESSION_ID, MSG_ID_1);
        assertTrue(r2.isSuccess());
        FileSnapshotManager.truncateSnapshotsAfter(SESSION_ID, MSG_ID_1);

        // fileA should remain "v1" (restored from its own backup, no previous snapshot)
        assertEquals("v1", Files.readString(fileA), "第二次回滚后 fileA 仍为 v1");
        // fileB should not exist (never tracked in msg-001)
        assertFalse(Files.exists(fileB), "第二次回滚后 fileB 不应存在");
        // snapshots.jsonl should be empty
        assertTrue(FileSnapshotManager.loadAllSnapshots(SESSION_ID).isEmpty());
    }
}
