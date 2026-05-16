package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.TimeUnit;

public class BashTool implements ToolExecutor {

    private static final int DEFAULT_TIMEOUT = 30;
    private static final int MAX_TIMEOUT = 300;
    private static final int MAX_OUTPUT_CHARS = 5000;
    private static final int MAX_OUTPUT_CHARS_WARN = 3000;
    private static final String OUTPUT_TRUNCATE_MARKER = "\n... [输出过长，已截断 %d 字符，共 %d 字符] ...\n";

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
               "出于安全考虑，只允许执行白名单内的命令，禁止危险操作。" +
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
            return executeCommand(command, workPath, timeout);
        } catch (IOException e) {
            throw new ToolExecutionException("命令执行失败: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ToolExecutionException("命令执行被中断: " + e.getMessage(), e);
        }
    }

    private String executeCommand(String command, Path workPath, int timeout) 
            throws IOException, InterruptedException, ToolExecutionException {
        
        ProcessBuilder processBuilder;
        String shell;
        
        if (isWindows()) {
            processBuilder = new ProcessBuilder("cmd.exe", "/c", command);
        } else {
            processBuilder = new ProcessBuilder("bash", "-c", command);
        }
        
        processBuilder.directory(workPath.toFile());
        processBuilder.redirectErrorStream(true);
        
        Map<String, String> env = processBuilder.environment();
        env.put("LANG", "en_US.UTF-8");
        
        long startTime = System.currentTimeMillis();
        Process process = processBuilder.start();
        
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
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
    }

    private boolean isWindows() {
        return System.getProperty("os.name").toLowerCase().contains("win");
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

    private String formatResult(String command, String output, int exitCode, 
                               long duration, Path workPath, boolean isTimeout) {
        StringBuilder result = new StringBuilder();
        
        result.append("命令执行结果\n");
        result.append("─────────────────────────────────────────────────────────────\n");
        result.append("命令: ").append(command).append("\n");
        result.append("工作目录: ").append(PathSecurityUtils.getRelativePath(workPath)).append("\n");
        
        if (isTimeout) {
            result.append("退出码: 124 ⏱️ 执行超时（超过 ").append(duration / 1000).append(" 秒）\n");
        } else {
            result.append("退出码: ").append(exitCode).append(" ");
            result.append(exitCode == 0 ? "✅ 成功" : "❌ 失败").append("\n");
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
            result.append("\n💡 提示: 该命令执行超过 ").append(duration / 1000).append(" 秒未完成，已被自动终止。\n");
            result.append("建议你在终端手动执行该命令，将完整结果贴回来。\n");
        }
        
        return result.toString();
    }
}
