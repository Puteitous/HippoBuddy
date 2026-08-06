package com.example.agent.tools;

import com.example.agent.core.blocker.BashDangerousCommandBlocker;
import com.example.agent.core.blocker.HookResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.function.Consumer;

public class BashTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(BashTool.class);

    private static final int DEFAULT_TIMEOUT = 30;
    private static final int MAX_TIMEOUT = 300;
    private static final int MAX_OUTPUT_CHARS = 50000;
    private static final int MAX_OUTPUT_CHARS_WARN = 30000;
    private static final String OUTPUT_TRUNCATE_MARKER = "\n... [输出过长，已截断 %d 字符，共 %d 字符] ...\n";

    // ===== 取消感知与短等待窗口 =====
    /** 主线程轮询进程状态的间隔：250ms 内即可感知外部取消，避免取消后仍按命令 timeout 长等 */
    private static final long CANCELLATION_POLL_INTERVAL_MS = 250;
    /** 取消已发起后，确认进程是否真的被终止的兜底窗口：超过则判定"终止失败，转入后台"。
     *  <p>正常路径由"终止操作完成信号"（isTerminateAttemptDone）提前驱动退出，
     *  无需等满本窗口；本窗口仅为 taskkill 卡死等极端情况提供兜底。 */
    private static final long CANCELLATION_CONFIRM_TIMEOUT_MS = 1000;
    /** 终止失败（进程转入后台）时等待读取线程收尾的上限：进程仍在运行，readerThread 阻塞在
     *  readLine() 上 join 必等满超时，缩短该值避免"终止失败"场景白白多等 3s 而迟迟不释放会话锁 */
    private static final long CANCELLATION_JOIN_TIMEOUT_MS = 300;

    // ===== 输出策略（output_mode + max_lines）=====
    private static final String OUTPUT_MODE_ALL = "all";
    private static final Set<String> VALID_OUTPUT_MODES = Set.of("all", "head", "tail", "errors");
    private static final int MAX_OUTPUT_LINES = 2000;
    private static final int DEFAULT_OUTPUT_LINES = 500;
    private static final Map<String, Integer> DEFAULT_MAX_LINES_FOR_MODE = Map.of(
        "head", 500,
        "tail", 500,
        "errors", 300
    );

    private static final Map<String, Set<Integer>> EXPECTED_NONZERO_EXIT_CODES = Map.of(
        "grep", Set.of(1),
        "diff", Set.of(1)
    );

    private static final Pattern FIRST_COMMAND_PATTERN = Pattern.compile("^\\s*(\\S+)");

    private static final ThreadLocal<String> currentToolCallId = new ThreadLocal<>();

    public static void setCurrentToolCallId(String toolCallId) {
        currentToolCallId.set(toolCallId);
    }

    public static void clearCurrentToolCallId() {
        currentToolCallId.remove();
    }

    public BashTool() {
    }

    @Override
    public String getName() {
        return "bash";
    }

    @Override
    public String getDescription() {
        return "执行终端命令。支持构建工具（mvn, gradle, npm）、版本控制、文件操作等。" +
               "支持管道（|）和重定向（>）操作。" +
               "Windows 环境使用 cmd：用 dir/type/findstr 代替 ls/cat/grep（Unix 命令不保证可用）。" +
               "自动适配系统编码以解决中文乱码问题。" +
               "⚠️ 严禁执行系统级破坏性命令（format/fdisk/diskpart/dd/shutdown/reboot/halt/poweroff/mkfs）、" +
               "递归删除系统/根/家目录（rm -rf /、rm -rf ~、del /s 系统盘）、命令替换注入（`、$()）、" +
               "磁盘擦除（cipher /w、shred、sdelete）、清空防火墙（iptables -F、ufw disable）、" +
               "管道下载执行（curl/wget | bash|sh）——这些操作会被安全机制直接拦截，不要尝试。" +
               "删除/覆盖/提权（sudo/su）/强杀进程（kill/taskkill）等操作可能触发用户确认，执行前请确认意图。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "要执行的命令。Windows 环境（cmd）：用 dir/type/findstr 代替 ls/cat/grep"
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "超时时间（秒，默认 30，最大 300）",
                        "default": 30,
                        "minimum": 1,
                        "maximum": 300
                    },
                    "working_dir": {
                        "type": "string",
                        "description": "工作目录（默认为项目根目录）"
                    },
                    "output_mode": {
                        "type": "string",
                        "enum": ["all", "head", "tail", "errors"],
                        "default": "all",
                        "description": "输出策略：all=完整输出（受默认上限限制）；head=只看开头；tail=只看结尾（构建日志/测试失败推荐）；errors=只提取错误上下文（调试推荐）。仅影响返回内容，不改变命令本身的行为"
                    },
                    "max_lines": {
                        "type": "integer",
                        "description": "配合 output_mode 使用，限制返回的最大行数（默认 head/tail 500 行、errors 300 行，最大 2000）",
                        "minimum": 1,
                        "maximum": 2000
                    }
                },
                "required": ["command"]
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        if (arguments.has("working_dir")) {
            return Collections.singletonList(arguments.get("working_dir").asText());
        }
        return Collections.singletonList(".");
    }

    @Override
    public boolean requiresFileLock() {
        return false;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        return execute(arguments, null);
    }

    @Override
    public String execute(JsonNode arguments, Consumer<String> progressCallback) throws ToolExecutionException {
        if (!arguments.has("command") || arguments.get("command").isNull()) {
            throw new ToolExecutionException("缺少必需参数: command");
        }

        String command = arguments.get("command").asText();
        if (command == null || command.trim().isEmpty()) {
            throw new ToolExecutionException("command 参数不能为空");
        }
        command = command.trim();
        
        int timeout = DEFAULT_TIMEOUT;
        if (arguments.has("timeout") && !arguments.get("timeout").isNull()) {
            timeout = arguments.get("timeout").asInt();
        }
        
        String workingDir = ".";
        if (arguments.has("working_dir") && !arguments.get("working_dir").isNull()) {
            String dirValue = arguments.get("working_dir").asText();
            if (dirValue != null && !dirValue.trim().isEmpty()) {
                workingDir = dirValue;
            }
        }
        
        // 输出策略参数：output_mode + max_lines
        String outputMode = OUTPUT_MODE_ALL;
        if (arguments.has("output_mode") && !arguments.get("output_mode").isNull()) {
            outputMode = arguments.get("output_mode").asText().trim().toLowerCase();
        }
        if (!VALID_OUTPUT_MODES.contains(outputMode)) {
            throw new ToolExecutionException("output_mode 只能是 all/head/tail/errors: " + outputMode);
        }

        int maxLines = -1; // -1 = 未指定，使用模式默认行数
        if (arguments.has("max_lines") && !arguments.get("max_lines").isNull()) {
            maxLines = arguments.get("max_lines").asInt();
        }
        if (maxLines > 0) {
            maxLines = Math.max(1, Math.min(MAX_OUTPUT_LINES, maxLines));
        }
        
        timeout = Math.max(1, Math.min(MAX_TIMEOUT, timeout));

        Path workPath = PathSecurityUtils.validateAndResolve(workingDir);
        
        if (!Files.exists(workPath)) {
            throw new ToolExecutionException("工作目录不存在: " + workingDir);
        }
        
        if (!Files.isDirectory(workPath)) {
            throw new ToolExecutionException("工作目录不是目录: " + workingDir);
        }

        // Unix 上使用原生管道在源头限制输出量（head/tail/grep）；
        // Windows cmd 无等价命令，保留原始命令，在执行后按模式做行级截断。
        String effectiveCommand = command;
        if (!OUTPUT_MODE_ALL.equals(outputMode) && !isWindows()) {
            effectiveCommand = translateCommandForUnix(command, outputMode, resolveMaxLines(outputMode, maxLines));
            validateTranslatedCommand(effectiveCommand);
        }

        try {
            return executeCommand(effectiveCommand, workPath, timeout, progressCallback, outputMode, maxLines);
        } catch (IOException e) {
            throw new ToolExecutionException("命令执行失败: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ToolExecutionException("命令执行被中断: " + e.getMessage(), e);
        }
    }

    /**
     * 对翻译后的命令（含工具拼装的管道）做严格禁止级二次校验。
     * <p>
     * 原始命令已在 ToolRegistry/WebAgentOrchestrator 层通过 Blocker 链检查；
     * 这里只拦截"翻译后"新引入的危险内容（理论上工具只拼接白名单命令，
     * 此校验为纵深防御，防止未来扩展输出模式时引入注入面）。
     */
    private void validateTranslatedCommand(String translatedCommand) throws ToolExecutionException {
        try {
            ObjectNode args = new ObjectMapper().createObjectNode();
            args.put("command", translatedCommand);
            HookResult result = new BashDangerousCommandBlocker().check("bash", args);
            if (result.isDenied()) {
                throw new ToolExecutionException("安全限制: 翻译后的命令被禁止执行: " + result.getReason());
            }
        } catch (ToolExecutionException e) {
            throw e;
        } catch (Exception e) {
            // 校验器本身异常不应阻断执行，仅记录
        }
    }

    /**
     * Unix 上把输出策略翻译为原生管道命令，从源头限制进程输出量。
     */
    private String translateCommandForUnix(String command, String outputMode, int maxLines) {
        switch (outputMode) {
            case "head":
                return command + " | head -n " + maxLines;
            case "tail":
                return command + " | tail -n " + maxLines;
            case "errors":
                return command + " | grep -E \"ERROR|Exception|FAILED|Caused by|error\" -A 5 | head -n " + maxLines;
            default:
                return command;
        }
    }

    /**
     * 计算实际生效的输出行数：优先取参数值（已钳制），否则用模式默认值。
     */
    private int resolveMaxLines(String outputMode, int maxLines) {
        if (maxLines > 0) {
            return maxLines;
        }
        return DEFAULT_MAX_LINES_FOR_MODE.getOrDefault(outputMode, DEFAULT_OUTPUT_LINES);
    }

    private String executeCommand(String command, Path workPath, int timeout, Consumer<String> progressCallback,
                                  String outputMode, int maxLines) 
            throws IOException, InterruptedException, ToolExecutionException {
        
        ProcessBuilder processBuilder;
        
        if (isWindows()) {
            processBuilder = new ProcessBuilder("cmd.exe", "/c", command);
        } else {
            processBuilder = new ProcessBuilder("bash", "-c", command);
        }
        
        processBuilder.directory(workPath.toFile());
        processBuilder.redirectErrorStream(true);
        
        // 禁止分页器 — 防止命令（如 git log、less 等）进入交互式分页模式导致进程挂起
        processBuilder.environment().put("PAGER", "cat");
        processBuilder.environment().put("GIT_PAGER", "cat");
        
        long startTime = System.currentTimeMillis();
        Process process = processBuilder.start();
        process.getOutputStream().close();  // 关闭子进程 stdin，防止被 date 等命令卡在交互式输入等待
        
        String toolCallId = currentToolCallId.get();
        if (toolCallId != null) {
            BashProcessManager.getInstance().register(toolCallId, process);
        }
        logger.debug("bash 进程启动: toolCallId={}, pid={}, command={}",
            toolCallId, process.pid(), truncateForLog(command));
        
        Thread readerThread = null;
        try {
            StringBuilder output = new StringBuilder();
            
            // 守护线程读取输出，主线程负责超时控制
            // 修复：将 process.waitFor 放在 readLine 之前，
            // 避免 readLine 阻塞导致超时机制失效
            readerThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), getPipeCharset()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (toolCallId != null && !BashProcessManager.getInstance().isRunning(toolCallId)) {
                            break;
                        }
                        if (progressCallback != null) {
                            progressCallback.accept(line);
                        }
                        synchronized (output) {
                            output.append(line).append("\n");
                        }
                    }
                } catch (IOException e) {
                    // 进程销毁时流关闭，忽略异常
                }
            });
            readerThread.setDaemon(true);
            readerThread.start();
            
            // 主线程等待进程完成或超时（步长轮询，便于及时感知外部取消）。
            // 取消已发起后不再按命令自身 timeout 长等：进入短确认窗口，
            // 进程未能在窗口内死亡则判定"终止失败"，立即返回而非干等。
            boolean finished = false;
            boolean externallyCancelled = false;
            boolean cancelFailed = false;
            long deadline = startTime + timeout * 1000L;
            while (!finished) {
                long remaining = deadline - System.currentTimeMillis();
                if (remaining <= 0) {
                    break; // 命令自身超时
                }
                long step = Math.min(CANCELLATION_POLL_INTERVAL_MS, remaining);
                finished = process.waitFor(step, TimeUnit.MILLISECONDS);
                if (finished) {
                    break;
                }
                // 外部取消已发起（用户点击终止按钮）：进入短确认窗口
                if (toolCallId != null && BashProcessManager.getInstance().isCancelledRequested(toolCallId)) {
                    externallyCancelled = true;
                    long confirmStart = System.currentTimeMillis();
                    boolean exitBySignal = false;
                    long confirmDeadline = confirmStart + CANCELLATION_CONFIRM_TIMEOUT_MS;
                    logger.info("bash 感知外部取消，进入确认窗口: toolCallId={}, pid={}", toolCallId, process.pid());
                    while (!finished && System.currentTimeMillis() < confirmDeadline) {
                        finished = process.waitFor(CANCELLATION_POLL_INTERVAL_MS, TimeUnit.MILLISECONDS);
                        // 信号驱动提前退出：taskkill/强杀已执行完成（cancel 已返回）但进程仍存活，
                        // 说明终止确实失败，立即判定，无需盲等固定窗口
                        if (!finished && BashProcessManager.getInstance().isTerminateAttemptDone(toolCallId)) {
                            exitBySignal = true;
                            break;
                        }
                    }
                    if (!finished) {
                        // taskkill 未能终止进程：放弃等待，转入后台（进程保持运行），
                        // 并记录"终止失败"标志供 Orchestrator 将 tool_result 标记为非成功
                        cancelFailed = true;
                        BashProcessManager.getInstance().markCancelFailed(toolCallId);
                        logger.info("bash 判定终止失败: toolCallId={}, pid={}, confirmMs={}, reason={}",
                            toolCallId, process.pid(), System.currentTimeMillis() - confirmStart,
                            exitBySignal ? "terminate-attempt-done（终止操作已完成但进程仍存活）"
                                         : "confirm-timeout（确认窗口兜底超时）");
                    } else {
                        logger.info("bash 取消后进程已终止，快速返回: toolCallId={}, pid={}, confirmMs={}",
                            toolCallId, process.pid(), System.currentTimeMillis() - confirmStart);
                    }
                    break;
                }
            }
            long duration = System.currentTimeMillis() - startTime;

            if (!finished && !cancelFailed) {
                // 纯超时：递归终止整棵进程树（避免只杀 cmd/bash 根进程而遗留孤儿子进程）
                BashProcessManager.getInstance().terminateTree(process, false);
            }

            // 等待读取线程处理完剩余输出。
            // 正常结束/超时路径：进程已退出、流已关闭，join 快速返回；
            // 终止失败路径：进程仍在后台运行，readerThread 阻塞在 readLine() 上 join 必等满超时，
            // 缩短为 300ms 收尾，避免锁迟迟不释放（用户点终止后无法马上发新消息）。
            long joinTimeout = cancelFailed ? CANCELLATION_JOIN_TIMEOUT_MS : 3000;
            readerThread.join(joinTimeout);

            // 清理取消标志（供标注使用；进程已自然结束时 consumeCancelled 返回 false）
            if (toolCallId != null) {
                BashProcessManager.getInstance().consumeCancelled(toolCallId);
                BashProcessManager.getInstance().consumeTerminateAttemptDone(toolCallId);
            }

            String rawOutput;
            synchronized (output) {
                rawOutput = output.toString();
            }
            String processedOutput = truncateOutput(applyOutputMode(rawOutput, outputMode, maxLines));

            int finalExitCode;
            String result;
            if (cancelFailed) {
                // 终止失败：进程仍在后台运行，附 PID 与补救命令，不让用户干等
                finalExitCode = -1;
                result = formatResult(command, processedOutput, finalExitCode, duration, workPath,
                    false, outputMode, maxLines, true, true, process.pid());
            } else if (!finished) {
                // 超时
                finalExitCode = 124;
                result = formatResult(command, processedOutput, finalExitCode, duration, workPath,
                    true, outputMode, maxLines, externallyCancelled, false, -1);
            } else {
                finalExitCode = process.exitValue();
                result = formatResult(command, processedOutput, finalExitCode, duration, workPath,
                    false, outputMode, maxLines, externallyCancelled, false, -1);
            }
            logger.debug("bash 执行结束: toolCallId={}, pid={}, durationMs={}, exitCode={}, externallyCancelled={}, cancelFailed={}",
                toolCallId, process.pid(), duration, finalExitCode, externallyCancelled, cancelFailed);
            return result;
        } finally {
            if (readerThread != null && readerThread.isAlive()) {
                readerThread.interrupt();
            }
            if (toolCallId != null) {
                BashProcessManager.getInstance().unregister(toolCallId);
            }
        }
    }

    private static final long CODEPAGE_CACHE_TTL_MS = 30_000;
    private static final Object CODEPAGE_LOCK = new Object();
    private static volatile String cachedCodePage = null;
    private static volatile long codePageCacheTime = 0;

    private boolean isWindows() {
        return System.getProperty("os.name").toLowerCase().contains("win");
    }

    /**
     * 获取读取 cmd 子进程输出时应使用的字符集。
     * <p>
     * Windows 上 cmd.exe 的实际输出编码由当前代码页（chcp）决定，且可能随命令
     * 执行（如命令内部 chcp 65001）而改变。JVM 的 native.encoding 是启动时的静态
     * 快照，无法反映运行期代码页变化，直接使用会导致中文乱码。
     * <p>
     * 策略：
     * 1. 非 Windows 一律 UTF-8；
     * 2. Windows 上先运行 chcp 探测实际代码页（带 30s TTL 缓存，避免每条命令都
     *    fork 一次探测进程）；
     * 3. 探测失败则回退到 native.encoding，再回退 UTF-8。
     */
    private Charset getPipeCharset() {
        if (!isWindows()) {
            return StandardCharsets.UTF_8;
        }
        String codePage = detectWindowsCodePage();
        if (codePage != null) {
            Charset charset = charsetForCodePage(codePage);
            if (charset != null) {
                return charset;
            }
        }
        String nativeEncoding = System.getProperty("native.encoding");
        if (nativeEncoding != null && !nativeEncoding.isEmpty()) {
            try {
                return Charset.forName(nativeEncoding);
            } catch (Exception ignored) {
            }
        }
        return StandardCharsets.UTF_8;
    }

    /**
     * 运行 chcp 探测 Windows 当前代码页，带 TTL 缓存。
     *
     * @return 代码页字符串（如 "65001"、"936"），探测失败返回 null
     */
    private String detectWindowsCodePage() {
        long now = System.currentTimeMillis();
        String cached = cachedCodePage;
        if (cached != null && now - codePageCacheTime < CODEPAGE_CACHE_TTL_MS) {
            return cached;
        }
        synchronized (CODEPAGE_LOCK) {
            now = System.currentTimeMillis();
            cached = cachedCodePage;
            if (cached != null && now - codePageCacheTime < CODEPAGE_CACHE_TTL_MS) {
                return cached;
            }
            String detected = probeCodePage();
            cachedCodePage = detected;
            codePageCacheTime = now;
            return detected;
        }
    }

    /**
     * 实际执行 chcp 探测。单独方法便于测试覆盖。
     */
    private String probeCodePage() {
        try {
            Process probe = new ProcessBuilder("cmd.exe", "/c", "chcp").start();
            probe.getOutputStream().close();
            if (!probe.waitFor(3, TimeUnit.SECONDS)) {
                probe.destroyForcibly();
                return null;
            }
            String output;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(probe.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append('\n');
                }
                output = sb.toString();
            }
            Matcher m = Pattern.compile("(\\d{2,5})").matcher(output);
            return m.find() ? m.group(1) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 代码页 → Charset 映射。仅映射可能输出非 ASCII 中文的常见代码页，
     * 其余（如 437、850 等拉丁码页）返回 null 交由上层回退。
     */
    private Charset charsetForCodePage(String codePage) {
        if (codePage == null) return null;
        switch (codePage.trim()) {
            case "65001":
                return StandardCharsets.UTF_8;
            case "936":
            case "54936":
                try { return Charset.forName("GBK"); } catch (Exception ignored) { return null; }
            case "950":
                try { return Charset.forName("Big5"); } catch (Exception ignored) { return null; }
            case "932":
                try { return Charset.forName("Shift_JIS"); } catch (Exception ignored) { return null; }
            case "949":
                try { return Charset.forName("EUC-KR"); } catch (Exception ignored) { return null; }
            default:
                return null;
        }
    }

    /** 日志用命令截断：避免超长命令（管道/多命令拼接）刷爆日志行 */
    private static String truncateForLog(String command) {
        if (command == null) {
            return "";
        }
        return command.length() <= 120 ? command : command.substring(0, 120) + "...";
    }

    private String truncateOutput(String output) {
        if (output == null || output.length() <= MAX_OUTPUT_CHARS) {
            return output;
        }
        int headLen = MAX_OUTPUT_CHARS_WARN;
        int tailLen = MAX_OUTPUT_CHARS - MAX_OUTPUT_CHARS_WARN;
        String head = output.substring(0, headLen);
        String tail = output.substring(output.length() - tailLen);
        String marker = String.format(OUTPUT_TRUNCATE_MARKER, output.length() - MAX_OUTPUT_CHARS, output.length());
        return head + marker + tail;
    }

    /**
     * 按输出策略对完整输出做行级截断。
     * <p>
     * Unix 上策略已在源头通过管道生效（进程只产出受限输出），此处对结果再次
     * 应用是幂等操作；Windows cmd 无原生 head/tail/错误过滤，此处是唯一的截断手段。
     */
    private String applyOutputMode(String output, String outputMode, int maxLines) {
        if (OUTPUT_MODE_ALL.equals(outputMode) || output == null || output.isEmpty()) {
            return output;
        }
        int lines = resolveMaxLines(outputMode, maxLines);
        switch (outputMode) {
            case "head":
                return takeFirstLines(output, lines);
            case "tail":
                return takeLastLines(output, lines);
            case "errors":
                return extractErrorLines(output, lines);
            default:
                return output;
        }
    }

    private String takeFirstLines(String output, int n) {
        String[] all = output.split("\n");
        int count = Math.min(n, all.length);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            sb.append(all[i]).append("\n");
        }
        return sb.toString();
    }

    private String takeLastLines(String output, int n) {
        String[] all = output.split("\n");
        int count = Math.min(n, all.length);
        int start = all.length - count;
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < all.length; i++) {
            sb.append(all[i]).append("\n");
        }
        return sb.toString();
    }

    private static final Pattern ERROR_LINE_PATTERN = Pattern.compile(
        ".*(ERROR|error|Error|Exception|exception|FAILED|failed|FAIL|fail|Caused by).*");
    private static final Pattern STACK_TRACE_LINE_PATTERN = Pattern.compile(
        "^\\s+at\\s+[\\w.$<>]+\\([\\w.:]+\\)");

    /**
     * 提取错误行及其后最多 5 行堆栈上下文；未发现错误时退化为尾部 50 行，
     * 保证 LLM 至少能看到命令的最后输出。
     */
    private String extractErrorLines(String output, int maxLines) {
        String[] all = output.split("\n");
        List<String> result = new ArrayList<>();
        int contextAfter = 5;
        for (int i = 0; i < all.length && result.size() < maxLines; i++) {
            if (!ERROR_LINE_PATTERN.matcher(all[i]).matches()) {
                continue;
            }
            result.add(all[i]);
            // 错误行之后最多 contextAfter 行上下文（堆栈行/空行），遇无关行停止
            for (int j = i + 1; j < all.length && j <= i + contextAfter && result.size() < maxLines; j++) {
                String line = all[j];
                if (ERROR_LINE_PATTERN.matcher(line).matches()) {
                    result.add(line);
                    i = j - 1; // 外层 i++ 后正好落到新的错误行
                    break;
                }
                if (STACK_TRACE_LINE_PATTERN.matcher(line).matches() || line.isBlank()) {
                    result.add(line);
                } else {
                    break; // 非错误、非堆栈的无关输出，截断上下文
                }
            }
        }
        if (result.isEmpty()) {
            return takeLastLines(output, Math.min(maxLines, 50));
        }
        return String.join("\n", result) + "\n";
    }

    private boolean isExpectedExitCode(String command, int exitCode) {
        if (exitCode == 0) return true;
        String baseCommand = extractBaseCommand(command);
        Set<Integer> expected = EXPECTED_NONZERO_EXIT_CODES.get(baseCommand);
        return expected != null && expected.contains(exitCode);
    }

    private String extractBaseCommand(String command) {
        if (command == null || command.isBlank()) return "";
        java.util.regex.Matcher m = FIRST_COMMAND_PATTERN.matcher(command);
        if (!m.find()) return "";
        String firstToken = m.group(1);
        int lastSep = firstToken.lastIndexOf('/');
        int lastBack = firstToken.lastIndexOf('\\');
        int lastSlash = Math.max(lastSep, lastBack);
        return (lastSlash >= 0 ? firstToken.substring(lastSlash + 1) : firstToken).toLowerCase();
    }

    private String formatResult(String command, String output, int exitCode, 
                               long duration, Path workPath, boolean isTimeout,
                               String outputMode, int maxLines, boolean externallyCancelled,
                               boolean cancelFailed, long pid) {
        StringBuilder result = new StringBuilder();
        
        result.append("命令执行结果\n");
        result.append("命令: ").append(command).append("\n");
        result.append("工作目录: ").append(PathSecurityUtils.getRelativePath(workPath)).append("\n");
        
        if (cancelFailed) {
            result.append("退出码: -1（终止失败：进程未能被终止，已转入后台继续运行）\n");
            result.append("进程 PID: ").append(pid).append("\n");
            result.append("补救: 如需强制清理，请在系统终端执行: taskkill /F /T /PID ").append(pid).append("\n");
        } else if (externallyCancelled) {
            result.append("退出码: ").append(exitCode).append("（已被用户终止）\n");
            result.append("终止方式: 已递归终止整棵进程树（含所有子进程）\n");
        } else if (isTimeout) {
            result.append("退出码: 124（执行超时，超过 ").append(duration / 1000).append(" 秒）\n");
        } else {
            result.append("退出码: ").append(exitCode).append(" ");
            result.append(isExpectedExitCode(command, exitCode) ? "成功" : "失败").append("\n");
        }
        
        result.append("执行时间: ").append(duration).append(" ms\n");
        
        if (!OUTPUT_MODE_ALL.equals(outputMode)) {
            int lines = resolveMaxLines(outputMode, maxLines);
            result.append("输出策略: ").append(outputMode)
                  .append("（仅保留最多 ").append(lines).append(" 行；如需完整输出请改用 output_mode=all）\n");
        }
        
        if (output.isEmpty()) {
            result.append("(无输出)\n");
        } else {
            result.append("输出:\n");
            result.append(output);
            if (!output.endsWith("\n")) {
                result.append("\n");
            }
        }
        
        if (cancelFailed) {
            result.append("\n提示: 该命令未能被终止，正在后台继续运行。以上输出为终止时已产生的部分。\n");
        } else if (externallyCancelled) {
            result.append("\n提示: 该命令在完成前被用户终止，以上输出为终止时已产生的部分。\n");
        } else if (isTimeout) {
            result.append("\n提示: 该命令执行超过 ").append(duration / 1000).append(" 秒未完成，已被自动终止。\n");
            result.append("建议你在终端手动执行该命令，将完整结果贴回来。\n");
        }
        
        return result.toString();
    }
}
