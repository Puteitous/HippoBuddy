package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.function.Consumer;

public class BashTool implements ToolExecutor {

    private static final int DEFAULT_TIMEOUT = 30;
    private static final int MAX_TIMEOUT = 300;
    private static final int MAX_OUTPUT_CHARS = 50000;
    private static final int MAX_OUTPUT_CHARS_WARN = 30000;
    private static final String OUTPUT_TRUNCATE_MARKER = "\n... [输出过长，已截断 %d 字符，共 %d 字符] ...\n";

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
               "Windows 环境下使用 cmd 执行，自动适配系统编码以解决中文乱码问题。" +
               "执行前会进行安全检查，危险命令需要用户确认。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "要执行的命令（注意：只允许白名单内的命令）"
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
        
        timeout = Math.max(1, Math.min(MAX_TIMEOUT, timeout));

        Path workPath = PathSecurityUtils.validateAndResolve(workingDir);
        
        if (!Files.exists(workPath)) {
            throw new ToolExecutionException("工作目录不存在: " + workingDir);
        }
        
        if (!Files.isDirectory(workPath)) {
            throw new ToolExecutionException("工作目录不是目录: " + workingDir);
        }

        try {
            return executeCommand(command, workPath, timeout, progressCallback);
        } catch (IOException e) {
            throw new ToolExecutionException("命令执行失败: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ToolExecutionException("命令执行被中断: " + e.getMessage(), e);
        }
    }

    private String executeCommand(String command, Path workPath, int timeout, Consumer<String> progressCallback) 
            throws IOException, InterruptedException, ToolExecutionException {
        
        ProcessBuilder processBuilder;
        
        if (isWindows()) {
            processBuilder = new ProcessBuilder("cmd.exe", "/c", command);
        } else {
            processBuilder = new ProcessBuilder("bash", "-c", command);
        }
        
        processBuilder.directory(workPath.toFile());
        processBuilder.redirectErrorStream(true);
        
        long startTime = System.currentTimeMillis();
        Process process = processBuilder.start();
        
        String toolCallId = currentToolCallId.get();
        if (toolCallId != null) {
            BashProcessManager.getInstance().register(toolCallId, process);
        }
        
        try {
            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), getPipeCharset()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (toolCallId != null && !BashProcessManager.getInstance().isRunning(toolCallId)) {
                        process.destroyForcibly();
                        while (reader.readLine() != null) {
                        }
                        break;
                    }
                    if (progressCallback != null) {
                        progressCallback.accept(line);
                    }
                    output.append(line).append("\n");
                }
            }
            
            boolean finished = process.waitFor(timeout, TimeUnit.SECONDS);
            long duration = System.currentTimeMillis() - startTime;
            
            if (!finished) {
                process.destroyForcibly();
                return formatResult(command, truncateOutput(output.toString()), 124, duration, workPath, true);
            }
            
            int exitCode = process.exitValue();
            
            String rawOutput = truncateOutput(output.toString());
            
            return formatResult(command, rawOutput, exitCode, duration, workPath, false);
        } finally {
            if (toolCallId != null) {
                BashProcessManager.getInstance().unregister(toolCallId);
            }
        }
    }

    private boolean isWindows() {
        return System.getProperty("os.name").toLowerCase().contains("win");
    }

    private Charset getPipeCharset() {
        if (isWindows()) {
            String nativeEncoding = System.getProperty("native.encoding");
            if (nativeEncoding != null && !nativeEncoding.isEmpty()) {
                try {
                    return Charset.forName(nativeEncoding);
                } catch (Exception ignored) {
                }
            }
        }
        return StandardCharsets.UTF_8;
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
                               long duration, Path workPath, boolean isTimeout) {
        StringBuilder result = new StringBuilder();
        
        result.append("命令执行结果\n");
        result.append("─────────────────────────────────────────────────────────────\n");
        result.append("命令: ").append(command).append("\n");
        result.append("工作目录: ").append(PathSecurityUtils.getRelativePath(workPath)).append("\n");
        
        if (isTimeout) {
            result.append("退出码: 124（执行超时，超过 ").append(duration / 1000).append(" 秒）\n");
        } else {
            result.append("退出码: ").append(exitCode).append(" ");
            result.append(isExpectedExitCode(command, exitCode) ? "成功" : "失败").append("\n");
        }
        
        result.append("执行时间: ").append(duration).append(" ms\n");
        result.append("─────────────────────────────────────────────────────────────\n");
        
        if (output.isEmpty()) {
            result.append("(无输出)\n");
        } else {
            result.append("输出:\n");
            result.append(output);
            if (!output.endsWith("\n")) {
                result.append("\n");
            }
        }
        
        result.append("─────────────────────────────────────────────────────────────\n");
        
        if (isTimeout) {
            result.append("\n提示: 该命令执行超过 ").append(duration / 1000).append(" 秒未完成，已被自动终止。\n");
            result.append("建议你在终端手动执行该命令，将完整结果贴回来。\n");
        }
        
        return result.toString();
    }
}
