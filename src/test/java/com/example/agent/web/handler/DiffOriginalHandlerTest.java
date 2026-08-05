package com.example.agent.web.handler;

import com.example.agent.tools.FileChangeTracker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * DiffOriginalHandler.tryAiTracker 单元测试。
 * <p>
 * 覆盖：按"当前会话 + 文件"取最早一条作 diff 基线、会话隔离（不跨会话合并）、
 * 磁盘校验（文件被其他会话/外部改动 → 不显示混合态标记）、
 * 无 sessionId / 无变更 / 二进制 / 新建文件等边界。
 */
class DiffOriginalHandlerTest {

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        FileChangeTracker.clear();
    }

    /** 在指定会话上下文中记录变更（模拟真实调用路径的 ThreadLocal 传递） */
    private void recordInSession(String sessionId, Runnable action) {
        FileChangeTracker.setCurrentSessionId(sessionId);
        try {
            action.run();
        } finally {
            FileChangeTracker.clearCurrentSessionId();
        }
    }

    /** 创建真实文件并写入内容（tryAiTracker 需读磁盘做校验） */
    private Path createFile(String name, String content) throws Exception {
        Path f = tempDir.resolve(name);
        Files.writeString(f, content, StandardCharsets.UTF_8);
        return f;
    }

    // ==================== 基线选取 ====================

    @Test
    void returnsEarliestChangeAsBaseline() throws Exception {
        // AI 连续编辑 3 次：v0 → v1 → v2 → v3，磁盘停留在 v3
        Path f = createFile("base.txt", "v3");
        recordInSession("S1", () -> {
            FileChangeTracker.recordChange(f.toString(), "v0", "v1", "write_file");
            FileChangeTracker.recordChange(f.toString(), "v1", "v2", "edit_file");
            FileChangeTracker.recordChange(f.toString(), "v2", "v3", "edit_file");
        });

        assertEquals("v0", DiffOriginalHandler.tryAiTracker(f, "S1"),
            "基线 = 该会话内最早一次变更的原始内容（v0 → 当前的全部改动）");
    }

    // ==================== 会话隔离 ====================

    @Test
    void sessionIsolated_otherSessionChangesNotVisible() throws Exception {
        // 两个会话各改各的文件：A 改 a.txt，B 改 b.txt，磁盘各自停留在最后写入内容
        Path fa = createFile("a.txt", "a1");
        Path fb = createFile("b.txt", "b1");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(fa.toString(), "a0", "a1", "write_file"));
        recordInSession("S2", () ->
            FileChangeTracker.recordChange(fb.toString(), "b0", "b1", "write_file"));

        assertEquals("a0", DiffOriginalHandler.tryAiTracker(fa, "S1"));
        assertEquals("b0", DiffOriginalHandler.tryAiTracker(fb, "S2"));
        // 各会话看不到对方文件的变更
        assertNull(DiffOriginalHandler.tryAiTracker(fb, "S1"));
        assertNull(DiffOriginalHandler.tryAiTracker(fa, "S2"));
    }

    // ==================== 磁盘校验（防混合态） ====================

    @Test
    void fileReModifiedByOtherSessionHidesMarker() throws Exception {
        // A 改 v0→v1，B 接着改 v1→v2，磁盘 = v2
        Path f = createFile("shared.txt", "v2");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(f.toString(), "v0", "v1", "write_file"));
        recordInSession("S2", () ->
            FileChangeTracker.recordChange(f.toString(), "v1", "v2", "write_file"));

        // 切回 A：磁盘(v2) ≠ A 最后写入(v1) → 不显示混合态标记
        assertNull(DiffOriginalHandler.tryAiTracker(f, "S1"),
            "A 改的文件已被 B 覆盖，切回 A 不显示（避免 A 标记混入 B 的行）");
        // 切到 B：磁盘(v2) == B 最后写入(v2) → 正常显示 B 的基线 v1
        assertEquals("v1", DiffOriginalHandler.tryAiTracker(f, "S2"));
    }

    @Test
    void diskContentChangedExternallyHidesMarker() throws Exception {
        // A 改 v0→v1 后，文件被外部工具/用户改成其他内容
        Path f = createFile("external.txt", "externally modified");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(f.toString(), "v0", "v1", "write_file"));

        assertNull(DiffOriginalHandler.tryAiTracker(f, "S1"),
            "磁盘内容 ≠ 会话最后写入内容 → 不显示（无法纯净表达该会话的改动）");
    }

    @Test
    void diskContentMatchesShowsMarker() throws Exception {
        // A 改 v0→v1，磁盘仍为 v1（未被其他会话/外部改动）→ 正常显示
        Path f = createFile("intact.txt", "v1");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(f.toString(), "v0", "v1", "write_file"));

        assertEquals("v0", DiffOriginalHandler.tryAiTracker(f, "S1"));
    }

    // ==================== 边界 ====================

    @Test
    void nullOrEmptySessionIdReturnsNull() throws Exception {
        Path f = createFile("no-session.txt", "new");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(f.toString(), "old", "new", "write_file"));

        assertNull(DiffOriginalHandler.tryAiTracker(f, null), "无 sessionId → 不显示标记");
        assertNull(DiffOriginalHandler.tryAiTracker(f, ""), "空 sessionId → 不显示标记");
    }

    @Test
    void noChangesForSessionReturnsNull() throws Exception {
        Path f = createFile("no-change.txt", "new");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(f.toString(), "old", "new", "write_file"));

        // 其他会话没有该文件的变更 → null
        assertNull(DiffOriginalHandler.tryAiTracker(f, "S2"));
        // 该会话其他文件（无变更记录）→ null
        Path other = createFile("no-change-other.txt", "x");
        assertNull(DiffOriginalHandler.tryAiTracker(other, "S1"));
    }

    @Test
    void newFileReturnsEmptyBaseline() throws Exception {
        // 新建文件：originalContent 为空，磁盘 = 新建内容
        Path f = createFile("new.txt", "brand new content");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(f.toString(), "", "brand new content", "write_file", true));

        assertEquals("", DiffOriginalHandler.tryAiTracker(f, "S1"),
            "新建文件返回空基线，diff 插件标记所有行为新增");
    }

    @Test
    void newFileModifiedElsewhereHidesMarker() throws Exception {
        // 新建文件后又被外部改过（磁盘 ≠ 新建内容）→ 不显示
        Path f = createFile("new-modified.txt", "externally changed");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(f.toString(), "", "brand new content", "write_file", true));

        assertNull(DiffOriginalHandler.tryAiTracker(f, "S1"));
    }

    @Test
    void binaryChangeReturnsNull() throws Exception {
        Path f = createFile("bin.dat", "binary");
        recordInSession("S1", () ->
            FileChangeTracker.recordChange(f.toString(), null, (byte[]) null, null, "write_file", false, "S1", "", true));

        assertNull(DiffOriginalHandler.tryAiTracker(f, "S1"), "二进制文件未保存原始内容，跳过");
    }
}
