package com.example.agent.tools;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FileSnapshotServiceTest {

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        FileSnapshotService.resetForTest();
    }

    @Test
    void testFirstCallInitializesSnapshot() throws Exception {
        Path f = tempDir.resolve("a.txt");
        Files.writeString(f, "hello");

        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(tempDir.toString());

        assertTrue(changes.isEmpty(), "首次调用仅初始化快照，不应返回变更");
    }

    @Test
    void testExternalModificationDetected() throws Exception {
        Path f = tempDir.resolve("a.txt");
        Files.writeString(f, "v1");
        FileSnapshotService.detectExternalChanges(tempDir.toString()); // init

        Files.writeString(f, "v2", StandardCharsets.UTF_8);
        Thread.sleep(50); // 确保 lastModified 变化（低精度文件系统）

        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(tempDir.toString());

        assertEquals(1, changes.size());
        assertEquals(FileSnapshotService.ChangeType.MODIFIED, changes.get(0).type);
        assertTrue(changes.get(0).path.endsWith("a.txt"));
    }

    @Test
    void testExternalAddDetected() throws Exception {
        Files.writeString(tempDir.resolve("a.txt"), "hello");
        FileSnapshotService.detectExternalChanges(tempDir.toString()); // init

        Files.writeString(tempDir.resolve("b.txt"), "new file");

        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(tempDir.toString());

        assertEquals(1, changes.size());
        assertEquals(FileSnapshotService.ChangeType.ADDED, changes.get(0).type);
        assertTrue(changes.get(0).path.endsWith("b.txt"));
    }

    @Test
    void testExternalDeleteDetected() throws Exception {
        Path f = tempDir.resolve("a.txt");
        Files.writeString(f, "hello");
        FileSnapshotService.detectExternalChanges(tempDir.toString()); // init

        Files.delete(f);

        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(tempDir.toString());

        assertEquals(1, changes.size());
        assertEquals(FileSnapshotService.ChangeType.DELETED, changes.get(0).type);
    }

    @Test
    void testAiWriteIsSkipped() throws Exception {
        Path f = tempDir.resolve("a.txt");
        Files.writeString(f, "v1");
        FileSnapshotService.detectExternalChanges(tempDir.toString()); // init

        // 模拟 AI 写入：先写盘再 markAiWrite（与 WriteFileTool → recordChange 顺序一致）
        Files.writeString(f, "v2", StandardCharsets.UTF_8);
        FileSnapshotService.markAiWrite(f.toAbsolutePath().toString());

        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(tempDir.toString());

        assertTrue(changes.isEmpty(), "AI 自身写入不应被报为外部变更");
    }

    @Test
    void testIgnoredDirectorySkipped() throws Exception {
        Path ignored = tempDir.resolve("node_modules");
        Files.createDirectories(ignored);
        Files.writeString(ignored.resolve("lib.js"), "x");
        Files.writeString(tempDir.resolve("a.txt"), "hello");

        FileSnapshotService.detectExternalChanges(tempDir.toString()); // init

        // node_modules 内的修改不应被检测
        Files.writeString(ignored.resolve("lib.js"), "y", StandardCharsets.UTF_8);
        Thread.sleep(50);

        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(tempDir.toString());

        assertTrue(changes.isEmpty(), "黑名单目录内的变更应被忽略");
    }

    @Test
    void testNoChangeReturnsEmpty() throws Exception {
        Files.writeString(tempDir.resolve("a.txt"), "hello");
        FileSnapshotService.detectExternalChanges(tempDir.toString()); // init

        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(tempDir.toString());

        assertTrue(changes.isEmpty());
    }

    @Test
    void testNullRootReturnsEmpty() {
        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(null);
        assertTrue(changes.isEmpty());

        changes = FileSnapshotService.detectExternalChanges("");
        assertTrue(changes.isEmpty());
    }

    @Test
    void testMissingRootResetsSnapshot() throws Exception {
        Path f = tempDir.resolve("a.txt");
        Files.writeString(f, "hello");
        FileSnapshotService.detectExternalChanges(tempDir.toString()); // init

        // 根目录不存在时：重置快照，返回空
        List<FileSnapshotService.ExternalChange> changes =
            FileSnapshotService.detectExternalChanges(tempDir.resolve("nonexistent").toString());
        assertTrue(changes.isEmpty());

        // 根目录恢复后：重新初始化快照，不应误报存量文件为新增
        changes = FileSnapshotService.detectExternalChanges(tempDir.toString());
        assertTrue(changes.isEmpty());
    }
}
