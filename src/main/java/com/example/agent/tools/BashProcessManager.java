package com.example.agent.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * bash 进程注册表与终止管理器。
 * <p>
 * 职责：
 * <ul>
 *   <li>按 toolCallId 登记/注销正在运行的 {@link Process}，供外部（如 ToolAbortHandler）定位；</li>
 *   <li>终止进程时<b>递归终止整棵进程树</b>，而不是只杀根进程——这是修复 Windows 上
 *       {@code cmd.exe /c <command>} 场景"只杀 cmd 不杀子进程（node/mvn/python 等）"的关键；</li>
 *   <li>记录"已被外部取消"的 toolCallId，供 {@link BashTool} 在输出中标注"已被用户终止"。</li>
 * </ul>
 * <p>
 * 终止策略（{@link #cancel(String)}）：
 * <ol>
 *   <li><b>Unix</b>：先对整棵进程树发 SIGTERM（优雅终止），等待 {@code gracefulTimeoutMs} 让进程自行清理；
 *       若仍存活再发 SIGKILL（强杀兜底）。</li>
 *   <li><b>Windows</b>：无可靠的进程级优雅终止手段（taskkill 不带 /F 对控制台程序无效），
 *       直接使用 {@code taskkill /F /T} 强杀整棵进程树。这与"点终止立即生效"的用户预期一致。</li>
 * </ol>
 */
public class BashProcessManager {

    private static final Logger logger = LoggerFactory.getLogger(BashProcessManager.class);

    private static final BashProcessManager INSTANCE = new BashProcessManager();

    /** 默认优雅终止等待时间：3 秒 */
    private static final long DEFAULT_GRACEFUL_TIMEOUT_MS = 3000;

    private final ConcurrentHashMap<String, Process> processes = new ConcurrentHashMap<>();

    /** 已被外部取消的 toolCallId 集合，供 BashTool 消费（consumeCancelled）并标注输出 */
    private final Set<String> cancelledToolCallIds = ConcurrentHashMap.newKeySet();

    /** 终止失败（进程未能被终止，转入后台）的 toolCallId 集合，供 Orchestrator 消费并决定 tool_result 状态 */
    private final Set<String> cancelFailedToolCallIds = ConcurrentHashMap.newKeySet();

    /** 终止操作（taskkill/descendants 强杀）已执行完成的 toolCallId 集合。
     *  <p>由 {@link #cancel(String, long)} 在 finally 中标记，供 {@link BashTool} 确认窗口查询：
     *  一旦终止操作已完成但进程仍存活，即可立即判定"终止失败"，无需再盲等固定窗口。 */
    private final Set<String> terminateAttemptDoneToolCallIds = ConcurrentHashMap.newKeySet();

    private BashProcessManager() {
    }

    public static BashProcessManager getInstance() {
        return INSTANCE;
    }

    public void register(String toolCallId, Process process) {
        if (toolCallId != null && process != null) {
            processes.put(toolCallId, process);
        }
    }

    public void unregister(String toolCallId) {
        if (toolCallId != null) {
            processes.remove(toolCallId);
        }
    }

    public boolean isRunning(String toolCallId) {
        if (toolCallId == null) {
            return false;
        }
        Process process = processes.get(toolCallId);
        return process != null && process.isAlive();
    }

    /**
     * 取消指定 toolCallId 对应的 bash 进程（递归终止整棵进程树），使用默认优雅等待时间。
     *
     * @return true 表示找到并终止了进程；false 表示不存在或已结束
     */
    public boolean cancel(String toolCallId) {
        return cancel(toolCallId, DEFAULT_GRACEFUL_TIMEOUT_MS);
    }

    /**
     * 取消指定 toolCallId 对应的 bash 进程（递归终止整棵进程树）。
     * <p>
     * 仅当进程在取消时确实存活才记录"已取消"标志（供 BashTool 标注输出）；
     * 若进程刚好已自然结束，则仅做清理、不记录标志，避免误标。
     *
     * @param gracefulTimeoutMs Unix 上优雅终止后等待进程自行退出的毫秒数（&lt;=0 表示不等待，直接强杀）
     * @return true 表示找到并终止了进程；false 表示不存在或已结束
     */
    public boolean cancel(String toolCallId, long gracefulTimeoutMs) {
        if (toolCallId == null) {
            return false;
        }
        Process process = processes.get(toolCallId);
        if (process == null || !process.isAlive()) {
            processes.remove(toolCallId);
            return false;
        }

        cancelledToolCallIds.add(toolCallId);
        logger.info("bash 取消：开始终止进程树: toolCallId={}, pid={}, gracefulTimeoutMs={}",
            toolCallId, process.pid(), gracefulTimeoutMs);
        try {
            if (isWindows()) {
                // Windows 无可靠优雅终止手段（taskkill 不带 /F 对控制台程序无效），直接强杀整棵树
                destroyProcessTree(process, false);
            } else {
                // Unix：优雅终止优先，超时后强杀兜底
                destroyProcessTree(process, true);
                if (gracefulTimeoutMs > 0) {
                    process.waitFor(gracefulTimeoutMs, TimeUnit.MILLISECONDS);
                }
                if (process.isAlive()) {
                    destroyProcessTree(process, false);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.warn("等待进程优雅退出被中断，立即强杀: toolCallId={}", toolCallId, e);
            destroyProcessTree(process, false);
        } finally {
            processes.remove(toolCallId);
            // 终止操作已执行完成：供 BashTool 确认窗口查询，
            // 若此时进程仍存活即可立即判定"终止失败"，不必盲等固定窗口
            terminateAttemptDoneToolCallIds.add(toolCallId);
            logger.info("bash 终止操作完成，terminateDone 已标记: toolCallId={}, pid={}",
                toolCallId, process.pid());
        }
        return true;
    }

    /**
     * 消费"已取消"标志：若该 toolCallId 曾被外部取消则返回 true 并清除标志。
     * <p>
     * 由 {@link BashTool} 在执行结束、格式化结果前调用，用于在输出中标注"已被用户终止"。
     */
    public boolean consumeCancelled(String toolCallId) {
        return toolCallId != null && cancelledToolCallIds.remove(toolCallId);
    }

    /**
     * 查询"取消是否已发起"（不消费标志，可多次调用）。
     * <p>
     * 由 {@link BashTool} 在等待进程期间轮询调用：一旦发现取消已发起，
     * 立即放弃按命令自身 timeout 继续等待，转而进入短确认窗口，
     * 避免"taskkill 失败导致进程没死时仍要等满 30~300s"的体验问题。
     */
    public boolean isCancelledRequested(String toolCallId) {
        return toolCallId != null && cancelledToolCallIds.contains(toolCallId);
    }

    /**
     * 查询"终止操作是否已执行完成"（不消费标志，可多次调用）。
     * <p>
     * 由 {@link BashTool} 在确认窗口轮询：终止操作已完成（cancel 已返回）但进程仍存活时，
     * 说明 taskkill/强杀确实失败了，立即判定"终止失败"，无需再等固定窗口。
     */
    public boolean isTerminateAttemptDone(String toolCallId) {
        return toolCallId != null && terminateAttemptDoneToolCallIds.contains(toolCallId);
    }

    /**
     * 消费"终止操作完成"标志（清除后不再被查询命中）。
     * <p>
     * 由 {@link BashTool} 在执行结束清理时调用，避免集合泄漏。
     */
    public void consumeTerminateAttemptDone(String toolCallId) {
        if (toolCallId != null) {
            terminateAttemptDoneToolCallIds.remove(toolCallId);
        }
    }

    /**
     * 记录"终止失败"：进程未能被终止，已转入后台继续运行。
     * <p>
     * 由 {@link BashTool} 在短确认窗口超时后调用；
     * {@link com.example.agent.web.orchestrator.WebAgentOrchestrator} 通过
     * {@link #consumeCancelFailed(String)} 消费该标志，将 tool_result 标记为非成功。
     */
    public void markCancelFailed(String toolCallId) {
        if (toolCallId != null) {
            cancelFailedToolCallIds.add(toolCallId);
        }
    }

    /**
     * 消费"终止失败"标志：返回 true 表示该 toolCallId 的进程未能被终止（转入后台），并清除标志。
     */
    public boolean consumeCancelFailed(String toolCallId) {
        return toolCallId != null && cancelFailedToolCallIds.remove(toolCallId);
    }

    /**
     * 递归终止整棵进程树（对外暴露，供 BashTool 超时分支等场景使用）。
     * <p>
     * Windows: {@code taskkill /F /T}；Unix: 递归 descendants 逐个 SIGTERM/SIGKILL 后再处理根进程。
     *
     * @param graceful true 时优先优雅终止（仅 Unix 生效；Windows 直接强杀）
     */
    public void terminateTree(Process process, boolean graceful) {
        destroyProcessTree(process, graceful);
    }

    public void cancelAll() {
        processes.forEach((id, process) -> {
            if (process.isAlive()) {
                destroyProcessTree(process, false);
            }
        });
        processes.clear();
    }

    /**
     * 递归终止进程树。Windows 上 graceful 参数被忽略（平台限制，见类注释）。
     */
    private void destroyProcessTree(Process process, boolean graceful) {
        if (process == null || !process.isAlive()) {
            return;
        }
        if (isWindows()) {
            killWindowsTree(process);
        } else {
            killUnixTree(process, graceful);
        }
    }

    /**
     * Windows：使用 taskkill /F /T 按进程树强杀。
     * <p>
     * 仅 {@code TerminateProcess} 根进程（即 {@code process.destroyForcibly()}）会遗留孤儿子进程，
     * 因此这里必须用 /T 递归整棵树。taskkill 自身失败时回退到 destroyForcibly。
     */
    private void killWindowsTree(Process process) {
        try {
            Process killer = new ProcessBuilder("taskkill", "/F", "/T", "/PID", String.valueOf(process.pid()))
                    .redirectErrorStream(true)
                    .start();
            killer.getOutputStream().close();
            if (!killer.waitFor(5, TimeUnit.SECONDS)) {
                killer.destroyForcibly();
            }
        } catch (IOException e) {
            logger.warn("taskkill 执行失败，回退到 destroyForcibly: pid={}", process.pid(), e);
            process.destroyForcibly();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }

    /**
     * Unix：先递归终止所有后代进程，再处理根进程本身。
     * <p>
     * 收集 descendants 快照后逐个处理，即使父进程先退出，后代仍持有引用可被终止，避免孤儿残留。
     */
    private void killUnixTree(Process process, boolean graceful) {
        try (var descendants = process.descendants()) {
            descendants.forEach(handle -> {
                if (graceful) {
                    handle.destroy();
                } else {
                    handle.destroyForcibly();
                }
            });
        } catch (UnsupportedOperationException | IllegalStateException e) {
            logger.warn("获取子进程列表失败，仅处理根进程: pid={}", process.pid(), e);
        }
        if (graceful) {
            process.destroy();
        } else {
            process.destroyForcibly();
        }
    }

    private boolean isWindows() {
        return System.getProperty("os.name").toLowerCase().contains("win");
    }
}
