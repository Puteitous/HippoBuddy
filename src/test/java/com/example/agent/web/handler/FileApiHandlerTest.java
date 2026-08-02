package com.example.agent.web.handler;

import com.example.agent.tools.FileChangeTracker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * FileApiHandler.buildSessionSummary 单元测试。
 * 覆盖：净变化行数（非累计）、A/M/D 计数、二进制跳过、会话隔离。
 */
class FileApiHandlerTest {

    @BeforeEach
    void setUp() {
        // 与 FileChangeTrackerTest 一致：清空内存存储即可（sessionId 为空时仅跳过落盘）
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

    private String file(String name) {
        return java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "hb-test-" + name).toString();
    }

    // ==================== 基础场景 ====================

    @Test
    void emptySessionReturnsAllZero() {
        Map<String, Object> s = FileApiHandler.buildSessionSummary("no-such-session");

        assertEquals(0, s.get("fileCount"));
        assertEquals(0, s.get("addedFiles"));
        assertEquals(0, s.get("modifiedFiles"));
        assertEquals(0, s.get("deletedFiles"));
        assertEquals(0, s.get("binaryFiles"));
        assertEquals(0, s.get("insertions"));
        assertEquals(0, s.get("deletions"));
    }

    @Test
    void singleEditCountsNetStats() {
        recordInSession("S1", () -> {
            // 3 行 → 4 行：净 +1
            FileChangeTracker.recordChange(
                file("a.txt"), "l1\nl2\nl3", "l1\nl2\nl3\nl4", "edit_file", false);
        });

        Map<String, Object> s = FileApiHandler.buildSessionSummary("S1");

        assertEquals(1, s.get("fileCount"));
        assertEquals(1, s.get("modifiedFiles"));
        assertEquals(0, s.get("addedFiles"));
        assertEquals(0, s.get("deletedFiles"));
        assertEquals(1, s.get("insertions"));
        assertEquals(0, s.get("deletions"));
    }

    // ==================== 净变化（非累计） ====================

    @Test
    void multipleEditsUseNetDiffNotCumulative() {
        recordInSession("S1", () -> {
            String p = file("app.txt");
            // 第 1 次：3 行 → 4 行（写入）
            FileChangeTracker.recordChange(p, "l1\nl2\nl3", "l1\nl2\nl3\nl4", "write_file", false);
            // 第 2 次：4 行 → 5 行
            FileChangeTracker.recordChange(p, "l1\nl2\nl3\nl4", "l1\nl2\nl3\nl4\nl5", "edit_file", false);
            // 第 3 次：5 行 → 4 行（删掉 l4）
            FileChangeTracker.recordChange(p, "l1\nl2\nl3\nl4\nl5", "l1\nl2\nl3\nl5", "edit_file", false);
        });

        Map<String, Object> s = FileApiHandler.buildSessionSummary("S1");

        assertEquals(1, s.get("fileCount"));
        // 净变化：最早 original（3 行）vs 最新 newContent（l1,l2,l3,l5）
        // → 新增 l5，无删除
        assertEquals(1, s.get("insertions"));
        assertEquals(0, s.get("deletions"));
        // 最新 toolName 是 edit_file → M
        assertEquals(1, s.get("modifiedFiles"));
    }

    @Test
    void newFileCountedAsAddedWithFullInsertions() {
        recordInSession("S1", () -> {
            // 新建文件：originalContent 为空，newFile=true
            FileChangeTracker.recordChange(
                file("new.txt"), "", "a\nb\nc", "write_file", true);
        });

        Map<String, Object> s = FileApiHandler.buildSessionSummary("S1");

        assertEquals(1, s.get("fileCount"));
        assertEquals(1, s.get("addedFiles"));
        assertEquals(3, s.get("insertions"));
        assertEquals(0, s.get("deletions"));
    }

    @Test
    void deletedFileCountedAsDeletedWithFullDeletions() {
        recordInSession("S1", () -> {
            FileChangeTracker.recordChange(
                file("del.txt"), "x\ny\nz", "", "delete_file", false);
        });

        Map<String, Object> s = FileApiHandler.buildSessionSummary("S1");

        assertEquals(1, s.get("fileCount"));
        assertEquals(1, s.get("deletedFiles"));
        assertEquals(0, s.get("insertions"));
        assertEquals(3, s.get("deletions"));
    }

    // ==================== 二进制文件 ====================

    @Test
    void binaryFileCountedButSkippedFromLineStats() {
        recordInSession("S1", () -> {
            FileChangeTracker.recordChange(
                file("report.docx"), "", null, "", "write_office_file", false,
                FileChangeTracker.getCurrentSessionId(), "", true);
        });

        Map<String, Object> s = FileApiHandler.buildSessionSummary("S1");

        assertEquals(1, s.get("fileCount"));
        assertEquals(1, s.get("binaryFiles"));
        assertEquals(0, s.get("insertions"));
        assertEquals(0, s.get("deletions"));
    }

    // ==================== 会话隔离 ====================

    @Test
    void sessionIsolation() {
        recordInSession("session-A", () -> {
            FileChangeTracker.recordChange(file("a.txt"), "", "a1\na2", "write_file", true);
        });
        recordInSession("session-B", () -> {
            FileChangeTracker.recordChange(file("b.txt"), "b0", "b1\nb2", "edit_file", false);
        });

        Map<String, Object> sA = FileApiHandler.buildSessionSummary("session-A");
        assertEquals(1, sA.get("fileCount"));
        assertEquals(2, sA.get("insertions"));
        assertEquals(0, sA.get("deletions"));

        Map<String, Object> sB = FileApiHandler.buildSessionSummary("session-B");
        assertEquals(1, sB.get("fileCount"));
        assertEquals(1, sB.get("modifiedFiles"));
        // "b0" → "b1\nb2"：删 1 增 2
        assertEquals(2, sB.get("insertions"));
        assertEquals(1, sB.get("deletions"));
    }

    // ==================== 混合文件 A/M/D 计数 ====================

    @Test
    void mixedFilesBreakdownCounts() {
        recordInSession("S1", () -> {
            // 新增
            FileChangeTracker.recordChange(file("new.txt"), "", "n1\nn2", "write_file", true);
            // 修改
            FileChangeTracker.recordChange(file("mod.txt"), "m0", "m1\nm2", "edit_file", false);
            // 删除
            FileChangeTracker.recordChange(file("del.txt"), "d1\nd2\nd3", "", "delete_file", false);
        });

        Map<String, Object> s = FileApiHandler.buildSessionSummary("S1");

        assertEquals(3, s.get("fileCount"));
        assertEquals(1, s.get("addedFiles"));
        assertEquals(1, s.get("modifiedFiles"));
        assertEquals(1, s.get("deletedFiles"));
        // 净行数：new.txt +2，mod.txt "m0"→"m1\nm2" +2 -1，del.txt -3
        assertEquals(4, s.get("insertions"));
        assertEquals(4, s.get("deletions"));
    }

    // ==================== 文件被删除后重建 ====================

    @Test
    void deletedThenRecreatedUsesNetDiff() {
        recordInSession("S1", () -> {
            String p = file("cycle.txt");
            // 删除：3 行 → 空
            FileChangeTracker.recordChange(p, "l1\nl2\nl3", "", "delete_file", false);
            // 重建：空 → 2 行新内容
            FileChangeTracker.recordChange(p, "", "n1\nn2", "write_file", true);
        });

        Map<String, Object> s = FileApiHandler.buildSessionSummary("S1");

        assertEquals(1, s.get("fileCount"));
        // 最新 toolName 是 write_file → A
        assertEquals(1, s.get("addedFiles"));
        // 净变化：最早 original（l1,l2,l3）vs 最新 newContent（n1,n2）
        // → 删 3 增 2
        assertEquals(2, s.get("insertions"));
        assertEquals(3, s.get("deletions"));
    }

    // ==================== netDiffStats 单文件净统计 ====================

    @Test
    void netDiffStatsReturnsNullOnEmptyList() {
        assertNull(FileApiHandler.netDiffStats(null));
        assertNull(FileApiHandler.netDiffStats(List.of()));
    }

    @Test
    void netDiffStatsComputesFirstToLastNet() {
        recordInSession("S1", () -> {
            String p = file("net.txt");
            FileChangeTracker.recordChange(p, "a\nb\nc", "a\nb\nc\nd", "write_file", false);
            FileChangeTracker.recordChange(p, "a\nb\nc\nd", "a\nb\nc\nd\ne", "edit_file", false);
        });

        Map<String, List<FileChangeTracker.FileChange>> files =
            FileChangeTracker.getSessionFileChanges("S1");
        List<FileChangeTracker.FileChange> list = files.values().iterator().next();

        // 最早 original（a,b,c）vs 最新 newContent（a,b,c,d,e）→ 净 +2
        int[] stats = FileApiHandler.netDiffStats(list);
        assertNotNull(stats);
        assertEquals(2, stats[0]);
        assertEquals(0, stats[1]);
    }

    @Test
    void netDiffStatsReturnsNullOnBinary() {
        recordInSession("S1", () -> {
            FileChangeTracker.recordChange(
                file("bin.docx"), "", null, "", "write_office_file", false,
                FileChangeTracker.getCurrentSessionId(), "", true);
        });

        Map<String, List<FileChangeTracker.FileChange>> files =
            FileChangeTracker.getSessionFileChanges("S1");
        List<FileChangeTracker.FileChange> list = files.values().iterator().next();

        assertNull(FileApiHandler.netDiffStats(list));
    }

    /**
     * 回归测试：同一毫秒内多条变更（timestamp 相同）时，
     * last 必须取最后一条而非第一条达到该 ts 的记录。
     */
    @Test
    void netDiffStatsWithSameTimestampPicksLastRecord() {
        String p = file("same-ts.txt");
        List<FileChangeTracker.FileChange> list = List.of(
            new FileChangeTracker.FileChange(p, "a\nb\nc", "a\nb\nc\nd", "write_file", 100L, false, "S1", (byte[]) null, "t1", false),
            new FileChangeTracker.FileChange(p, "a\nb\nc\nd", "a\nb\nc\nd\ne", "edit_file", 200L, false, "S1", (byte[]) null, "t2", false),
            // 与上一条同 ts：最新内容应为 a,b,c,d（删掉 e），而非 a,b,c,d,e
            new FileChangeTracker.FileChange(p, "a\nb\nc\nd\ne", "a\nb\nc\nd", "edit_file", 200L, false, "S1", (byte[]) null, "t3", false)
        );

        // 最早 original（a,b,c）vs 最新 newContent（a,b,c,d）→ 净 +1 -0
        int[] stats = FileApiHandler.netDiffStats(list);
        assertNotNull(stats);
        assertEquals(1, stats[0], "同一毫秒应取最后一条作为最新，净新增应为 1");
        assertEquals(0, stats[1]);
    }
}
