package com.example.agent.tools;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * BackgroundProcessStore 单元测试。
 * <p>
 * 覆盖：保存/加载往返（元数据 + 输出快照）、淘汰后清理孤儿日志文件。
 */
class BackgroundProcessStoreTest {

    @TempDir
    Path tempDir;

    private static BashProcessManager.BackgroundRecord record(
        String id, String command, String dir, String sessionId,
        long pid, long startedAt, long endedAt, boolean stopped,
        String output, String error
    ) {
        return BashProcessManager.BackgroundRecord.restored(
            id, command, dir, sessionId, pid, startedAt, endedAt, stopped, output, error);
    }

    @Test
    void saveAndLoadRoundTrip() {
        BackgroundProcessStore store = new BackgroundProcessStore(tempDir);
        store.save(List.of(
            record("call_a", "npm run dev", "D:\\proj\\web", "s1", 8421, 1000L, 2000L, false,
                "> vite\nready\n", ""),
            record("call_b", "mvn test", "D:\\proj\\core", null, 900, 500L, 900L, true,
                "tests ok\n", "warning\n")
        ));

        List<BashProcessManager.BackgroundRecord> loaded = store.load();
        assertEquals(2, loaded.size(), "应恢复两条记录");

        Map<String, BashProcessManager.BackgroundRecord> byId = loaded.stream()
            .collect(Collectors.toMap(BashProcessManager.BackgroundRecord::getToolCallId, Function.identity()));

        BashProcessManager.BackgroundRecord a = byId.get("call_a");
        assertNotNull(a);
        assertEquals("npm run dev", a.getCommand());
        assertEquals("D:\\proj\\web", a.getWorkingDir());
        assertEquals("s1", a.getSessionId());
        assertEquals(8421, a.pid());
        assertEquals(1000L, a.getStartTime());
        assertEquals(2000L, a.getEndedAt());
        assertFalse(a.isStoppedByUser());
        assertFalse(a.isAlive(), "历史记录没有进程句柄，不应视为运行中");
        assertTrue(a.getOutputSnapshot().contains("ready"));

        BashProcessManager.BackgroundRecord b = byId.get("call_b");
        assertNotNull(b);
        assertNull(b.getSessionId());
        assertTrue(b.isStoppedByUser());
        assertTrue(b.getOutputSnapshot().contains("tests ok"));
        assertTrue(b.getOutputSnapshot().contains("warning"), "stderr 应与 stdout 一并保留");
    }

    @Test
    void saveRemovesOrphanLogFiles() throws Exception {
        BackgroundProcessStore store = new BackgroundProcessStore(tempDir);
        BashProcessManager.BackgroundRecord kept =
            record("call_keep", "echo hi", ".", "s1", 1, 1L, 2L, false, "hi\n", "");
        BashProcessManager.BackgroundRecord dropped =
            record("call_drop", "echo bye", ".", "s1", 2, 3L, 4L, false, "bye\n", "");

        store.save(List.of(kept, dropped));
        Path droppedLog = tempDir.resolve("background").resolve("logs").resolve("call_drop.log");
        assertTrue(Files.exists(droppedLog), "首次保存应写出日志文件");

        store.save(List.of(kept));
        assertFalse(Files.exists(droppedLog), "被淘汰记录的日志文件应被清理");
        assertEquals(1, store.load().size());
    }
}
