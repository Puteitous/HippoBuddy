package com.example.agent.mcp.client;

import com.example.agent.mcp.config.McpConfig;
import com.example.agent.mcp.exception.McpConnectionException;
import com.example.agent.mcp.exception.McpException;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

public class StdioMcpClient extends AbstractMcpClient {

    private static final Logger logger = LoggerFactory.getLogger(StdioMcpClient.class);

    /** Windows 批处理垫片扩展名：这类文件无法被 CreateProcess 直接执行，必须经 cmd.exe /c 转发 */
    private static final List<String> SHELL_SCRIPT_EXTS = List.of(".cmd", ".bat");

    private Process process;
    private BufferedReader stdoutReader;
    private BufferedWriter stdinWriter;
    private BufferedReader stderrReader;
    private ExecutorService executor;


    public StdioMcpClient(McpConfig.McpServerConfig config) {
        super(config);
    }

    @Override
    public CompletableFuture<Void> connect() {
        return CompletableFuture.supplyAsync(() -> {
            Process tempProcess = null;
            BufferedReader tempStdout = null;
            BufferedWriter tempStdin = null;
            BufferedReader tempStderr = null;
            ExecutorService tempExecutor = null;

            try {
                String command = serverConfig.getCommand();
                if (command == null || command.trim().isEmpty()) {
                    throw new McpConnectionException("MCP服务器命令不能为空");
                }

                logger.info("启动MCP子进程: {} {}", command, serverConfig.getArgs());

                List<String> commandList = buildCommandList(serverConfig);

                ProcessBuilder pb = new ProcessBuilder(commandList);
                if (serverConfig.getEnv() != null && !serverConfig.getEnv().isEmpty()) {
                    pb.environment().putAll(serverConfig.getEnv());
                }

                tempProcess = pb.start();

                tempStdout = new BufferedReader(
                        new InputStreamReader(tempProcess.getInputStream(), StandardCharsets.UTF_8));
                tempStdin = new BufferedWriter(
                        new OutputStreamWriter(tempProcess.getOutputStream(), StandardCharsets.UTF_8));
                tempStderr = new BufferedReader(
                        new InputStreamReader(tempProcess.getErrorStream(), StandardCharsets.UTF_8));

                tempExecutor = Executors.newCachedThreadPool(r -> {
                    Thread t = new Thread(r, "stdio-mcp-" + getServerId());
                    t.setDaemon(true);
                    return t;
                });

                process = tempProcess;
                stdoutReader = tempStdout;
                stdinWriter = tempStdin;
                stderrReader = tempStderr;
                executor = tempExecutor;

                executor.submit(this::readStdoutLoop);
                executor.submit(this::readStderrLoop);
                executor.submit(this::monitorProcessExit);

                connected = true;
                resetReconnectState();
                logger.info("MCP子进程启动成功");
                return null;
            } catch (Exception e) {
                cleanupResources(tempProcess, tempStdout, tempStdin, tempStderr, tempExecutor);
                throw new McpConnectionException("启动MCP子进程失败: " + e.getMessage(), e);
            }
        });
    }

    /**
     * 构建子进程命令行。
     * <p>
     * Windows 上 npm/npx/yarn/pnpm 等命令实际是 {@code .cmd} 批处理垫片，而 ProcessBuilder
     * 底层走 CreateProcessW：它只补全 {@code .exe}，既不认 PATHEXT 也无法执行 {@code .cmd/.bat}，
     * 直接启动会报 {@code CreateProcess error=2, 系统找不到指定的文件}。
     * 因此命令解析为批处理垫片时改用 {@code cmd.exe /c} 转发（与 BashTool 的处理一致）；
     * 解析为原生可执行文件（node.exe 等）时保持直接启动，避免多一层进程。
     * </p>
     */
    private static List<String> buildCommandList(McpConfig.McpServerConfig config) {
        String command = config.getCommand();
        List<String> commandList = new ArrayList<>();

        if (isWindows() && needsCmdWrapper(command)) {
            logger.info("检测到 Windows 批处理命令，改用 cmd.exe /c 转发: {}", command);
            commandList.add("cmd.exe");
            commandList.add("/c");
        }
        commandList.add(command);
        if (config.getArgs() != null) {
            commandList.addAll(config.getArgs());
        }
        return commandList;
    }

    /** 判断命令是否需要 cmd.exe 转发：仅当它最终解析为 .cmd/.bat 批处理文件。 */
    private static boolean needsCmdWrapper(String command) {
        String lower = command.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
            return true;
        }
        if (lower.endsWith(".exe") || lower.endsWith(".com")) {
            return false;
        }
        return resolvesToShellScript(command);
    }

    /**
     * 沿 PATH 查找命令，判断命中的是否为批处理垫片。
     * <p>
     * 按 PATHEXT 的顺序逐扩展名探测，取第一个命中的文件，以此模拟 Windows 的解析顺序：
     * node → 命中 node.exe（无需转发）；npx → 命中 npx.cmd（需要转发）。
     * </p>
     */
    private static boolean resolvesToShellScript(String command) {
        String path = System.getenv("PATH");
        if (path == null || path.isBlank()) {
            return false;
        }
        String pathExt = System.getenv("PATHEXT");
        List<String> exts = (pathExt == null || pathExt.isBlank())
                ? List.of(".com", ".exe", ".bat", ".cmd")
                : Arrays.stream(pathExt.split(";"))
                        .map(e -> e.toLowerCase(Locale.ROOT).trim())
                        .filter(e -> !e.isEmpty())
                        .toList();

        for (String dir : path.split(Pattern.quote(File.pathSeparator))) {
            if (dir.isBlank()) {
                continue;
            }
            for (String ext : exts) {
                if (Files.isRegularFile(Path.of(dir, command + ext))) {
                    return SHELL_SCRIPT_EXTS.contains(ext);
                }
            }
        }
        return false;
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    private void cleanupResources(Process p, BufferedReader out, BufferedWriter in, BufferedReader err, ExecutorService exec) {
        if (exec != null) {
            exec.shutdownNow();
        }
        try {
            if (in != null) in.close();
        } catch (Exception ignored) {}
        try {
            if (out != null) out.close();
        } catch (Exception ignored) {}
        try {
            if (err != null) err.close();
        } catch (Exception ignored) {}
        if (p != null) {
            terminateProcessTree(p);
        }
    }

    /**
     * Windows：用 {@code taskkill /F /T} 递归终止进程树。
     * <p>
     * 经 {@code cmd.exe /c} 转发启动时，真实的 MCP 进程是 cmd 的后代（cmd → npx.cmd → node），
     * 仅终止根进程会遗留孤立的 node。taskkill 失败时回退到 destroyForcibly。
     * </p>
     */
    private void killWindowsTree(Process p) {
        try {
            Process killer = new ProcessBuilder("taskkill", "/F", "/T", "/PID", String.valueOf(p.pid()))
                    .redirectErrorStream(true)
                    .start();
            killer.getOutputStream().close();
            if (!killer.waitFor(5, TimeUnit.SECONDS)) {
                killer.destroyForcibly();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
        } catch (Exception e) {
            logger.warn("taskkill 执行失败，回退到 destroyForcibly: pid={}", p.pid(), e);
            p.destroyForcibly();
        }
    }

    private void terminateProcessTree(Process p) {
        if (p == null || !p.isAlive()) {
            return;
        }
        if (isWindows()) {
            killWindowsTree(p);
        } else {
            p.destroyForcibly();
        }
    }

    private void monitorProcessExit() {
        try {
            int exitCode = process.waitFor();
            if (connected) {
                logger.warn("MCP子进程异常退出，退出码: {}", exitCode);
                onConnectionLost();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.debug("进程监控线程被中断");
        }
    }

    @Override
    protected void doSendMessage(String messageJson) {
        try {
            synchronized (stdinWriter) {
                stdinWriter.write(messageJson);
                stdinWriter.newLine();
                stdinWriter.flush();
            }
        } catch (Exception e) {
            throw new McpException("发送消息失败", e);
        }
    }

    @Override
    protected CompletableFuture<JsonNode> sendRequestInternal(String method, Object params) {
        int id = jsonRpcHandler.nextId();
        CompletableFuture<JsonNode> future = jsonRpcHandler.registerPendingRequest(id);

        return CompletableFuture.supplyAsync(() -> {
            try {
                String requestJson = jsonRpcHandler.createRequest(id, method, params);
                logger.debug("发送MCP请求: {} id={}", requestJson, id);
                doSendMessage(requestJson);
                return future.get();
            } catch (Exception e) {
                throw new McpException("发送请求失败: " + method, e);
            }
        }, executor);
    }

    private void readStdoutLoop() {
        try {
            String line;
            while ((line = stdoutReader.readLine()) != null) {
                if (!line.trim().isEmpty()) {
                    logger.debug("收到MCP消息: {}", line);
                    jsonRpcHandler.handleResponse(line);
                }
            }
        } catch (Exception e) {
            if (connected) {
                logger.error("读取stdout失败", e);
            }
        } finally {
            if (connected) {
                logger.warn("stdout读取线程已退出，触发连接丢失");
                onConnectionLost();
            }
        }
    }

    private void readStderrLoop() {
        try {
            String line;
            while ((line = stderrReader.readLine()) != null) {
                if (!line.trim().isEmpty()) {
                    logger.debug("MCP stderr: {}", line);
                }
            }
        } catch (Exception e) {
            if (connected) {
                logger.error("读取stderr失败", e);
            }
        } finally {
            if (connected) {
                logger.warn("stderr读取线程已退出，触发连接丢失");
                onConnectionLost();
            }
        }
    }

    @Override
    public CompletableFuture<Void> disconnect() {
        return CompletableFuture.runAsync(() -> {
            markUserInitiatedDisconnect();
            connected = false;

            jsonRpcHandler.cancelAllPending();

            if (executor != null) {
                executor.shutdownNow();
            }

            try {
                if (stdinWriter != null) {
                    stdinWriter.close();
                }
            } catch (Exception ignored) {
            }
            try {
                if (stdoutReader != null) {
                    stdoutReader.close();
                }
            } catch (Exception ignored) {
            }
            try {
                if (stderrReader != null) {
                    stderrReader.close();
                }
            } catch (Exception ignored) {
            }

            if (process != null) {
                if (isWindows()) {
                    // 可能是 cmd.exe /c 转发启动的，必须按进程树终止
                    killWindowsTree(process);
                } else {
                    process.destroy();
                    try {
                        if (!process.waitFor(5, TimeUnit.SECONDS)) {
                            process.destroyForcibly();
                        }
                    } catch (InterruptedException e) {
                        process.destroyForcibly();
                        Thread.currentThread().interrupt();
                    }
                }
            }

            logger.info("MCP连接已关闭: {}", getServerId());
        });
    }
}
