package com.example.agent.tools;

import org.junit.jupiter.api.Test;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * BashProcessManager 单元测试。
 * <p>
 * 覆盖：注册/注销/运行态、取消（含进程树递归终止）、取消标志消费、
 * 以及"进程已自然结束时不误标取消"等边界场景。
 */
class BashProcessManagerTest {

    private final BashProcessManager manager = BashProcessManager.getInstance();
    private final AtomicInteger idSeq = new AtomicInteger();

    private boolean isWindows() {
        return System.getProperty("os.name").toLowerCase().contains("win");
    }

    /**
     * 启动一个长时间运行、且必然派生子进程的命令，用于验证进程树终止。
     * Windows: cmd /c ping（ping 子进程约跑 100 秒）；Unix: bash -c sleep 100。
     */
    private Process startLongRunningProcess() throws Exception {
        ProcessBuilder pb = isWindows()
                ? new ProcessBuilder("cmd.exe", "/c", "ping 127.0.0.1 -n 100 > nul")
                : new ProcessBuilder("bash", "-c", "sleep 100");
        pb.redirectErrorStream(true);
        Process process = pb.start();
        process.getOutputStream().close();
        return process;
    }

    private String nextId() {
        return "test-" + idSeq.incrementAndGet();
    }

    @Test
    void testCancelStopsRunningProcess() throws Exception {
        Process process = startLongRunningProcess();
        String id = nextId();
        manager.register(id, process);
        assertTrue(manager.isRunning(id));

        boolean killed = manager.cancel(id, 200);
        assertTrue(killed, "应成功终止运行中的进程");
        assertFalse(process.isAlive(), "进程应已被终止");
        assertFalse(manager.isRunning(id), "取消后不应再视为运行中");
        // 取消标志已记录，供 BashTool 标注"已被用户终止"
        assertTrue(manager.consumeCancelled(id), "取消标志应可被消费");
        assertFalse(manager.consumeCancelled(id), "标志消费后不应残留");
    }

    @Test
    void testCancelUnknownIdReturnsFalse() {
        assertFalse(manager.cancel("no-such-id", 100));
    }

    @Test
    void testCancelNullIdReturnsFalse() {
        assertFalse(manager.cancel(null, 100));
    }

    @Test
    void testCancelAlreadyFinishedProcessDoesNotMarkCancelled() throws Exception {
        ProcessBuilder pb = isWindows()
                ? new ProcessBuilder("cmd.exe", "/c", "echo done")
                : new ProcessBuilder("bash", "-c", "echo done");
        Process process = pb.start();
        process.getOutputStream().close();
        assertTrue(process.waitFor(5, TimeUnit.SECONDS), "短命令应在 5 秒内结束");

        String id = nextId();
        manager.register(id, process);
        assertFalse(manager.cancel(id, 100), "已结束的进程不应视为被终止");
        // 进程自然结束时不得误标取消
        assertFalse(manager.consumeCancelled(id), "已自然结束的进程不应记录取消标志");
        manager.unregister(id);
    }

    @Test
    void testCancelKillsChildProcessTree() throws Exception {
        Process process = startLongRunningProcess();
        String id = nextId();
        manager.register(id, process);

        assertTrue(manager.cancel(id, 200), "应成功终止进程树");
        assertFalse(process.isAlive(), "根进程应已终止");
        // 子进程应一并被终止（轮询等待，避免进程表/句柄快照延迟）
        awaitCondition(() -> {
            try (var descendants = process.descendants()) {
                return descendants.noneMatch(ProcessHandle::isAlive);
            }
        }, 5000, "子进程树应在 5 秒内全部终止");
    }

    @Test
    void testRegisterUnregisterIsRunning() throws Exception {
        Process process = startLongRunningProcess();
        String id = nextId();
        manager.register(id, process);
        assertTrue(manager.isRunning(id), "注册后应视为运行中");

        manager.unregister(id);
        assertFalse(manager.isRunning(id), "注销后不应视为运行中");

        // 清理：进程仍在后台运行，需整树终止避免测试残留
        manager.terminateTree(process, false);
        assertTrue(process.waitFor(5, TimeUnit.SECONDS), "清理应在 5 秒内完成");
    }

    @Test
    void testConsumeCancelledReturnsFalseForUnknown() {
        assertFalse(manager.consumeCancelled("unknown"));
        assertFalse(manager.consumeCancelled(null));
    }

    @Test
    void testIsCancelledRequestedReflectsCancelState() throws Exception {
        Process process = startLongRunningProcess();
        String id = nextId();
        manager.register(id, process);

        // 取消前：未发起
        assertFalse(manager.isCancelledRequested(id));
        assertFalse(manager.isCancelledRequested("unknown"));
        assertFalse(manager.isCancelledRequested(null));

        // 取消后：已发起（可重复查询，不消费）
        assertTrue(manager.cancel(id, 200));
        assertTrue(manager.isCancelledRequested(id), "取消后应能查询到已发起标志");
        assertTrue(manager.isCancelledRequested(id), "重复查询不应消费标志");

        // 消费后：标志清除
        assertTrue(manager.consumeCancelled(id));
        assertFalse(manager.isCancelledRequested(id), "消费后标志应被清除");
    }

    @Test
    void testMarkAndConsumeCancelFailed() {
        String id = nextId();

        // 未标记前：查询/消费均为 false
        assertFalse(manager.consumeCancelFailed(id));
        assertFalse(manager.consumeCancelFailed(null));

        // 标记后：可消费一次
        manager.markCancelFailed(id);
        assertTrue(manager.consumeCancelFailed(id), "标记后应能消费到终止失败标志");
        assertFalse(manager.consumeCancelFailed(id), "消费后标志应被清除");

        // null 调用不抛异常
        manager.markCancelFailed(null);
    }

    @Test
    void testTerminateAttemptDoneMarkedOnCancel() throws Exception {
        Process process = startLongRunningProcess();
        // 用全局唯一 id：manager 是跨测试方法共享的单例，避免与其他测试残留的 "test-N" 冲突
        String id = "term-done-" + System.nanoTime();
        manager.register(id, process);

        // 取消前：未标记
        assertFalse(manager.isTerminateAttemptDone(id));
        assertFalse(manager.isTerminateAttemptDone("unknown"));
        assertFalse(manager.isTerminateAttemptDone(null));

        // 取消后：终止操作完成标志应被标记（cancel 返回即已执行完 taskkill/强杀）
        assertTrue(manager.cancel(id, 200));
        assertTrue(manager.isTerminateAttemptDone(id), "cancel 返回后应标记终止操作完成");
        assertTrue(manager.isTerminateAttemptDone(id), "重复查询不应消费标志");

        // 消费后：清除
        manager.consumeTerminateAttemptDone(id);
        assertFalse(manager.isTerminateAttemptDone(id), "消费后标志应被清除");
        manager.consumeTerminateAttemptDone(null);
    }

    @Test
    void testCancelUnknownIdDoesNotMarkTerminateAttemptDone() {
        // 未知/空 toolCallId：cancel 返回 false，不应标记终止操作完成
        assertFalse(manager.cancel("no-such-id", 100));
        assertFalse(manager.isTerminateAttemptDone("no-such-id"));
        assertFalse(manager.isTerminateAttemptDone(null));
    }

    private void awaitCondition(BooleanSupplier condition, long timeoutMs, String message) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(100);
        }
        fail(message);
    }
}
