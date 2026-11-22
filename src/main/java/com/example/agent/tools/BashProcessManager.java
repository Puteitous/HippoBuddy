package com.example.agent.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
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

    /** 已请求"前台转后台"的 toolCallId 集合。
     *  <p>由 {@link #requestDetach(String)} 标记，{@link BashTool} 在前台等待循环中轮询感知，
     *  随后停止等待、释放回合锁，并把读线程交接给后台托管。 */
    private final Set<String> detachRequestedToolCallIds = ConcurrentHashMap.newKeySet();

    // ===== 后台进程（run_in_background）托管 =====

    /** 后台进程输出缓冲上限（字符）：达到上限后丢弃中间，仅保留开头与结尾，防止长驻进程日志撑爆内存 */
    public static final int MAX_BACKGROUND_OUTPUT_CHARS = 100_000;

    /** 已托管的后台进程：toolCallId -> 后台进程记录 */
    private final Map<String, BackgroundRecord> backgroundProcesses = new ConcurrentHashMap<>();

    /** 已结束后台进程的日志暂存（有上限），供界面在进程退出后仍能查看最终输出 */
    private final Map<String, BackgroundRecord> completedBackgroundProcesses = new ConcurrentHashMap<>();
    private static final int MAX_COMPLETED_BACKGROUNDS = 20;

    /** 已结束记录的历史持久化；为 null 表示未初始化（如单元测试场景），此时完全走内存 */
    private volatile BackgroundProcessStore store;

    /** toolCallId -> 会话 ID：后台进程结束时据此把状态通知投递回对应会话上下文 */
    private final Map<String, String> toolCallSessions = new ConcurrentHashMap<>();

    /** 会话 -> 待注入下一轮上下文的后台进程通知 */
    private final Map<String, List<String>> pendingNotices = new ConcurrentHashMap<>();

    /** 被用户主动停止的后台进程（用于区分"已停止"与自然"已结束"的通知文案） */
    private final Set<String> userStoppedBackgrounds = ConcurrentHashMap.newKeySet();

    /**
     * 后台进程记录：持有进程引用与已累积输出（带上限截断），并由行程结束时清理。
     * <p>
     * 与 {@link #processes} 的区别：{@code processes} 只记录"进程对象"用于取消/终止；
     * 后台记录额外累积输出快照，供外层（如 BashTool）在返回结果时展示启动日志开头。
     */
    public static final class BackgroundRecord {
        private final String toolCallId;
        private final String command;
        private final String workingDir;
        /** 进程句柄；从磁盘恢复的历史记录为 null（进程早已消失） */
        private final Process process;
        private final long pidValue;
        private final long startTime;
        private final StringBuilder output = new StringBuilder();
        private final StringBuilder errorOutput = new StringBuilder();
        private boolean truncated;
        /** 所属会话 id（可为 null：老记录或未绑定会话） */
        private volatile String sessionId;
        /** 结束时间戳（0 = 仍在运行） */
        private volatile long endedAt;
        /** 是否被用户主动停止 */
        private volatile boolean stoppedByUser;

        public BackgroundRecord(String toolCallId, String command, String workingDir, Process process) {
            this.toolCallId = toolCallId;
            this.command = command;
            this.workingDir = workingDir;
            this.process = process;
            this.pidValue = process != null ? process.pid() : -1;
            this.startTime = System.currentTimeMillis();
        }

        private BackgroundRecord(String toolCallId, String command, String workingDir, String sessionId,
                                 long pid, long startTime, long endedAt, boolean stoppedByUser,
                                 String outputText, String errorText) {
            this.toolCallId = toolCallId;
            this.command = command;
            this.workingDir = workingDir;
            this.process = null;
            this.pidValue = pid;
            this.startTime = startTime;
            this.sessionId = sessionId;
            this.endedAt = endedAt;
            this.stoppedByUser = stoppedByUser;
            if (outputText != null && !outputText.isEmpty()) {
                this.output.append(outputText);
            }
            if (errorText != null && !errorText.isEmpty()) {
                this.errorOutput.append(errorText);
            }
        }

        /**
         * 从磁盘恢复一条已结束的后台进程记录（没有进程句柄，{@link #isAlive()} 恒为 false）。
         */
        public static BackgroundRecord restored(String toolCallId, String command, String workingDir, String sessionId,
                                                long pid, long startTime, long endedAt, boolean stoppedByUser,
                                                String outputText, String errorText) {
            return new BackgroundRecord(toolCallId, command, workingDir, sessionId, pid, startTime, endedAt,
                stoppedByUser, outputText, errorText);
        }

        public String getToolCallId() { return toolCallId; }
        public String getCommand() { return command; }
        public String getWorkingDir() { return workingDir; }
        /** 运行中的进程句柄；历史记录返回 null。 */
        public Process getProcess() { return process; }
        public long getStartTime() { return startTime; }
        public int pid() { return (int) pidValue; }
        public boolean isAlive() { return process != null && process.isAlive(); }
        public boolean isTruncated() { synchronized (this) { return truncated; } }

        /** 所属会话 id：供进程总览展示「属于哪个会话」并跳转定位，可能为 null。 */
        public String getSessionId() { return sessionId; }
        public void setSessionId(String sessionId) { this.sessionId = sessionId; }

        /** 结束时间戳（0 表示仍在运行）。 */
        public long getEndedAt() { return endedAt; }

        /** 是否被用户主动停止（区分「已停止」与自然「已结束」）。 */
        public boolean isStoppedByUser() { return stoppedByUser; }

        /** 标记进程已结束：记录结束时间与是否由用户停止。 */
        public void markEnded(boolean byUser) {
            this.endedAt = System.currentTimeMillis();
            this.stoppedByUser = byUser;
        }

        public synchronized void append(String line) {
            if (output.length() + line.length() + 1 > MAX_BACKGROUND_OUTPUT_CHARS) {
                truncated = true;
                return;
            }
            output.append(line).append('\n');
        }

        public synchronized void appendError(String line) {
            if (errorOutput.length() + line.length() + 1 > MAX_BACKGROUND_OUTPUT_CHARS) {
                truncated = true;
                return;
            }
            errorOutput.append(line).append('\n');
        }

        public synchronized String getOutputSnapshot() { return output.toString(); }

        public synchronized String getErrorSnapshot() { return errorOutput.toString(); }
    }

    /**
     * 登记一个后台进程并返回其记录，供 {@link BashTool} 累积输出。
     */
    public BackgroundRecord registerBackground(String toolCallId, Process process, String command, String workingDir) {
        if (toolCallId == null || process == null) {
            return null;
        }
        BackgroundRecord record = new BackgroundRecord(toolCallId, command, workingDir, process);
        record.setSessionId(toolCallSessions.get(toolCallId));
        backgroundProcesses.put(toolCallId, record);
        return record;
    }

    /**
     * 向指定后台进程追加一行输出（reader 线程调用）。
     */
    public void appendBackgroundOutput(String toolCallId, String line) {
        if (toolCallId == null) {
            return;
        }
        BackgroundRecord record = backgroundProcesses.get(toolCallId);
        if (record != null) {
            record.append(line);
        }
    }

    /**
     * 向指定后台进程追加一行标准错误输出（stderr monitor 线程调用）。
     */
    public void appendBackgroundError(String toolCallId, String line) {
        if (toolCallId == null) {
            return;
        }
        BackgroundRecord record = backgroundProcesses.get(toolCallId);
        if (record != null) {
            record.appendError(line);
        }
    }

    /**
     * 查询指定后台进程记录；不存在时返回 null（可能未登记，或已结束被清理）。
     */
    public BackgroundRecord getBackground(String toolCallId) {
        return toolCallId == null ? null : backgroundProcesses.get(toolCallId);
    }

    /**
     * 判断指定 toolCallId 是否仍为被托管的后台进程。
     */
    public boolean isBackground(String toolCallId) {
        return toolCallId != null && backgroundProcesses.containsKey(toolCallId);
    }

    /**
     * 结束一个后台进程的托管：从后台表移除并注销终止表引用，清理内存。
     * <p>由后台监控 reader 线程在流 EOF（进程已退出/崩溃）时调用；幂等。
     */
    public void finalizeBackground(String toolCallId) {
        if (toolCallId == null) {
            return;
        }
        BackgroundRecord finished = backgroundProcesses.remove(toolCallId);
        if (finished != null) {
            boolean userStopped = userStoppedBackgrounds.remove(toolCallId);
            finished.markEnded(userStopped);
            retainCompleted(toolCallId, finished);
            enqueueNotice(toolCallId, "后台进程 PID " + finished.pid()
                + "（命令: " + abbreviate(finished.getCommand(), 120) + "）"
                + (userStopped ? "已被用户停止。" : "已结束。"));
            toolCallSessions.remove(toolCallId);
        }
        processes.remove(toolCallId);
        terminateAttemptDoneToolCallIds.remove(toolCallId);
        detachRequestedToolCallIds.remove(toolCallId);
        // 后台进程被终止后不会再走 BashTool 的 consumeCancelled，这里顺手清理避免标志泄漏
        cancelledToolCallIds.remove(toolCallId);
        // 记录推进到已结束表后落盘，供应用重启后回看
        persistCompleted();
    }

    /**
     * 绑定 toolCallId 与所属会话；bash 执行前由编排层调用，供后台进程结束时回投通知。
     */
    public void bindSession(String toolCallId, String sessionId) {
        if (toolCallId != null && sessionId != null) {
            toolCallSessions.put(toolCallId, sessionId);
            BackgroundRecord record = backgroundProcesses.get(toolCallId);
            if (record != null) {
                record.setSessionId(sessionId);
            }
        }
    }

    /**
     * 列出全部后台进程（运行中 + 最近已结束），按启动时间倒序。
     * <p>供「后台进程总览」面板展示；返回的记录为只读快照引用，调用方不得修改其内容。
     */
    public List<BackgroundRecord> listBackgrounds() {
        List<BackgroundRecord> all = new ArrayList<>(backgroundProcesses.values());
        all.addAll(completedBackgroundProcesses.values());
        all.sort((a, b) -> Long.compare(b.getStartTime(), a.getStartTime()));
        return all;
    }

    /**
     * 停止全部<b>后台</b>进程（不影响正在前台执行的 bash）。
     *
     * @return 实际发起终止的进程数量
     */
    public int cancelAllBackgrounds() {
        int count = 0;
        for (String toolCallId : new ArrayList<>(backgroundProcesses.keySet())) {
            if (cancel(toolCallId, 0)) {
                count++;
            }
        }
        return count;
    }

    /**
     * 初始化历史持久化（幂等）：数据目录优先取系统属性 {@code hippo.data.dir}，
     * 未设置时使用当前工作目录下的 {@code .hippo}。
     */
    public void initPersistence() {
        String dataDir = System.getProperty("hippo.data.dir");
        Path root = (dataDir != null && !dataDir.isBlank())
            ? Paths.get(dataDir)
            : Paths.get(".hippo").toAbsolutePath();
        initPersistence(root);
    }

    /** 初始化历史持久化（幂等），并加载上次已结束的后台进程记录。 */
    public synchronized void initPersistence(Path hippoRoot) {
        if (store != null) {
            return;
        }
        BackgroundProcessStore newStore = new BackgroundProcessStore(hippoRoot);
        for (BackgroundRecord record : newStore.load()) {
            completedBackgroundProcesses.put(record.getToolCallId(), record);
        }
        trimCompleted();
        store = newStore;
        logger.info("后台进程历史已恢复: count={}, root={}", completedBackgroundProcesses.size(), hippoRoot);
    }

    /** 按上限裁剪已结束记录（保留最近启动的）。 */
    private void trimCompleted() {
        while (completedBackgroundProcesses.size() > MAX_COMPLETED_BACKGROUNDS) {
            String oldestId = null;
            long oldestStart = Long.MAX_VALUE;
            for (Map.Entry<String, BackgroundRecord> entry : completedBackgroundProcesses.entrySet()) {
                long start = entry.getValue().getStartTime();
                if (start < oldestStart) {
                    oldestStart = start;
                    oldestId = entry.getKey();
                }
            }
            if (oldestId == null) {
                return;
            }
            completedBackgroundProcesses.remove(oldestId);
        }
    }

    /** 把已结束记录整体落盘（未初始化持久化时跳过）。 */
    private void persistCompleted() {
        BackgroundProcessStore current = store;
        if (current == null) {
            return;
        }
        current.save(new ArrayList<>(completedBackgroundProcesses.values()));
    }

    /**
     * 应用退出前调用：把仍在运行的后台进程记为「已结束（应用退出）」并落盘。
     * <p>JVM 退出后读线程不会再到 EOF，不在这里补写这些记录会直接丢失。
     */
    public void persistOnShutdown() {
        for (String toolCallId : new ArrayList<>(backgroundProcesses.keySet())) {
            BackgroundRecord record = backgroundProcesses.remove(toolCallId);
            if (record == null) {
                continue;
            }
            record.markEnded(false);
            retainCompleted(toolCallId, record);
        }
        persistCompleted();
    }

    /**
     * 取出并清空某会话待注入上下文的后台进程通知。
     *
     * @return 通知列表；无通知时返回空列表
     */
    public List<String> drainNotices(String sessionId) {
        if (sessionId == null) {
            return List.of();
        }
        List<String> notices = pendingNotices.remove(sessionId);
        return notices != null ? notices : List.of();
    }

    /** 把一条后台进程状态通知投递到对应会话的待注入队列。 */
    private void enqueueNotice(String toolCallId, String text) {
        String sessionId = toolCallSessions.get(toolCallId);
        if (sessionId == null || text == null) {
            return;
        }
        pendingNotices.computeIfAbsent(sessionId, key -> new CopyOnWriteArrayList<>()).add(text);
        logger.info("后台进程通知已入队: sessionId={}, toolCallId={}, text={}", sessionId, toolCallId, text);
    }

    /** 截断过长命令，避免通知文本膨胀。 */
    private static String abbreviate(String text, int max) {
        if (text == null) {
            return "";
        }
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }

    /**
     * 暂存已结束后台进程的记录（限定数量），供界面查看最终日志。
     */
    private void retainCompleted(String toolCallId, BackgroundRecord record) {
        if (completedBackgroundProcesses.size() >= MAX_COMPLETED_BACKGROUNDS) {
            String oldestId = null;
            long oldestStart = Long.MAX_VALUE;
            for (Map.Entry<String, BackgroundRecord> entry : completedBackgroundProcesses.entrySet()) {
                long start = entry.getValue().getStartTime();
                if (start < oldestStart) {
                    oldestStart = start;
                    oldestId = entry.getKey();
                }
            }
            if (oldestId != null) {
                completedBackgroundProcesses.remove(oldestId);
            }
        }
        completedBackgroundProcesses.put(toolCallId, record);
    }

    /**
     * 查询后台进程记录用于日志快照：优先运行中的进程，其次已结束进程的暂存记录。
     */
    public BackgroundRecord getBackgroundForLog(String toolCallId) {
        if (toolCallId == null) {
            return null;
        }
        BackgroundRecord live = backgroundProcesses.get(toolCallId);
        return live != null ? live : completedBackgroundProcesses.get(toolCallId);
    }

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
            toolCallSessions.remove(toolCallId);
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

        // 后台进程被用户主动停止：记录原因，供 finalizeBackground 时通知模型
        if (backgroundProcesses.containsKey(toolCallId)) {
            userStoppedBackgrounds.add(toolCallId);
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
     * 请求把正在前台执行的进程转入后台托管。
     * <p>
     * 仅做标记，不终止进程：{@link BashTool} 的等待循环会轮询该标记，
     * 感知后停止按命令 timeout 等待、立即返回 tool_result，并把输出读线程
     * 交接给 {@link #registerBackground} 的缓冲。进程本身继续运行。
     *
     * @return 进程 PID；进程不存在或已结束时返回 -1
     */
    public long requestDetach(String toolCallId) {
        if (toolCallId == null) {
            return -1;
        }
        Process process = processes.get(toolCallId);
        if (process == null || !process.isAlive()) {
            return -1;
        }
        detachRequestedToolCallIds.add(toolCallId);
        logger.info("bash 收到转后台请求: toolCallId={}, pid={}", toolCallId, process.pid());
        return process.pid();
    }

    /** 查询"转后台是否已请求"（不消费标志）。 */
    public boolean isDetachRequested(String toolCallId) {
        return toolCallId != null && detachRequestedToolCallIds.contains(toolCallId);
    }

    /** 消费"转后台请求"标志：交接完成后清除，避免影响同 id 的后续执行。 */
    public void consumeDetachRequested(String toolCallId) {
        if (toolCallId != null) {
            detachRequestedToolCallIds.remove(toolCallId);
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
