package com.example.agent.tools.grep;

import com.example.agent.tools.ToolExecutionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class NativeGrepBackend implements GrepBackend {

    private static final String RG_EXECUTABLE = "rg.exe";
    private static final long TIMEOUT_SECONDS = 30;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private static volatile Boolean availableCache = null;
    private static volatile Path cachedRgPath = null;

    @Override
    public String getName() {
        return "native";
    }

    @Override
    public boolean isAvailable() {
        if (availableCache != null) {
            return availableCache;
        }
        
        try {
            Path rgPath = getRgExecutable();
            ProcessBuilder pb = new ProcessBuilder(rgPath.toString(), "--version");
            Process process = pb.start();
            boolean completed = process.waitFor(5, TimeUnit.SECONDS);
            if (completed) {
                process.destroy();
            }
            boolean available = completed && process.exitValue() == 0;
            availableCache = available;
            if (available) {
                cachedRgPath = rgPath;
            }
            return available;
        } catch (Exception e) {
            availableCache = false;
            return false;
        }
    }

    @Override
    public List<SearchResult> search(GrepOptions options) throws ToolExecutionException {
        try {
            // 单文件搜索时，在 Java 层提前应用 filePattern 过滤
            // （ripgrep 对显式传入的文件路径会忽略 --glob 参数）
            if (options.getSearchPath() != null && Files.isRegularFile(options.getSearchPath())) {
                if (!matchesFilePattern(options.getSearchPath(), options.getFilePattern())) {
                    return Collections.emptyList();
                }
            }

            Path rgPath = getRgExecutable();
            ProcessBuilder processBuilder = buildProcess(rgPath, options);
            
            Process process = processBuilder.start();
            
            List<String> outputLines = Collections.synchronizedList(new ArrayList<>());
            Thread outputReader = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        outputLines.add(line);
                    }
                } catch (IOException e) {
                    // 进程终止时流关闭是正常行为
                }
            });
            outputReader.setDaemon(true);
            outputReader.start();
            
            boolean completed = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            outputReader.join(5000);
            
            if (!completed) {
                process.destroyForcibly();
                throw new ToolExecutionException("ripgrep 搜索超时 (" + TIMEOUT_SECONDS + " 秒)");
            }

            if (process.exitValue() != 0 && process.exitValue() != 1) {
                String error = String.join("\n", outputLines);
                throw new ToolExecutionException("ripgrep 执行失败 (退出码 " + process.exitValue() + "): " + error);
            }

            List<SearchResult> results = parseJsonOutput(outputLines);

            // offset 是应用层分页参数，不透传到 ripgrep
            if (options.getOffset() > 0 && options.getOffset() < results.size()) {
                results = results.subList(options.getOffset(), results.size());
            } else if (options.getOffset() > 0) {
                results = Collections.emptyList();
            }

            return results;
            
        } catch (IOException e) {
            throw new ToolExecutionException("执行 ripgrep 时发生 IO 错误：" + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ToolExecutionException("ripgrep 执行被中断", e);
        }
    }

    private Path getRgExecutable() throws IOException {
        if (cachedRgPath != null && Files.exists(cachedRgPath)) {
            return cachedRgPath;
        }
        
        String platformDir = getPlatformDirectory();
        String resourcePath = "native/ripgrep/" + platformDir + "/" + RG_EXECUTABLE;
        
        Path tempDir = Files.createTempDirectory("ripgrep-");
        Path rgExecutable = tempDir.resolve(RG_EXECUTABLE);
        
        try (var inputStream = getClass().getClassLoader().getResourceAsStream(resourcePath)) {
            if (inputStream == null) {
                throw new IOException("找不到 ripgrep 可执行文件：" + resourcePath);
            }
            Files.copy(inputStream, rgExecutable);
        }
        
        rgExecutable.toFile().setExecutable(true);
        cachedRgPath = rgExecutable;
        return rgExecutable;
    }

    private String getPlatformDirectory() {
        String os = System.getProperty("os.name").toLowerCase();
        String arch = System.getProperty("os.arch").toLowerCase();
        
        if (os.contains("win")) {
            if (arch.contains("aarch64") || arch.contains("arm64")) {
                return "windows-aarch64";
            } else if (arch.contains("64")) {
                return "windows-x86_64";
            }
        } else if (os.contains("mac")) {
            if (arch.contains("aarch64") || arch.contains("arm64")) {
                return "macos-aarch64";
            } else if (arch.contains("64")) {
                return "macos-x86_64";
            }
        } else if (os.contains("linux")) {
            if (arch.contains("aarch64") || arch.contains("arm64")) {
                return "linux-aarch64";
            } else if (arch.contains("64")) {
                return "linux-x86_64";
            }
        }
        
        throw new UnsupportedOperationException("不支持的平台：" + os + " " + arch);
    }

    private ProcessBuilder buildProcess(Path rgPath, GrepOptions options) {
        List<String> command = new ArrayList<>();
        command.add(rgPath.toString());
        
        command.add("--json");
        command.add("--no-require-git");
        command.add("--line-buffered");
        
        if (options.isCaseSensitive()) {
            command.add("--case-sensitive");
        } else {
            command.add("--ignore-case");
        }
        
        if (options.getContextBefore() > 0 || options.getContextAfter() > 0) {
            int context = Math.max(options.getContextBefore(), options.getContextAfter());
            command.add("-C");
            command.add(String.valueOf(context));
        } else {
            if (options.getContextBefore() > 0) {
                command.add("-B");
                command.add(String.valueOf(options.getContextBefore()));
            }
            if (options.getContextAfter() > 0) {
                command.add("-A");
                command.add(String.valueOf(options.getContextAfter()));
            }
        }
        
        if (options.isMultiline()) {
            command.add("--multiline");
            if (options.getPattern().contains("(?s)")) {
                command.add("--multiline-dotall");
            }
        }
        
        // 注意: offset 是应用层分页参数，在 search() 中处理，不透传到 ripgrep
        
        // 单文件时 filePattern 已在 search() 中通过 Java 层过滤，不传 --glob 给 ripgrep
        // （ripgrep 对显式传入的文件路径会忽略 --glob 参数）
        if (options.getFilePattern() != null && !options.getFilePattern().isEmpty()
                && !(options.getSearchPath() != null && Files.isRegularFile(options.getSearchPath()))) {
            command.add("--glob");
            command.add(options.getFilePattern());
        }
        
        command.add("--max-count");
        command.add(String.valueOf(options.getMaxResults()));
        
        command.add("-e");
        command.add(options.getPattern());
        
        if (options.getSearchPath() != null) {
            Path searchPath = options.getSearchPath();
            // 如果 path 是单个文件，传文件全路径，workdir 设为父目录
            if (Files.isRegularFile(searchPath)) {
                command.add(searchPath.toAbsolutePath().normalize().toString());
            } else {
                command.add(searchPath.toString());
            }
        } else {
            command.add(".");
        }

        ProcessBuilder pb = new ProcessBuilder(command);
        if (options.getSearchPath() != null && Files.isRegularFile(options.getSearchPath())) {
            pb.directory(options.getSearchPath().toAbsolutePath().normalize().getParent().toFile());
        } else if (options.getSearchPath() != null) {
            pb.directory(options.getSearchPath().toFile());
        } else {
            pb.directory(new File("."));
        }
        pb.redirectErrorStream(true);
        
        return pb;
    }

    private List<SearchResult> parseJsonOutput(List<String> outputLines) throws IOException {
        List<SearchResult> results = new ArrayList<>();
        String currentFile = null;
        
        for (String line : outputLines) {
            if (line.trim().isEmpty()) {
                continue;
            }
            
            JsonNode jsonNode = objectMapper.readTree(line);
            String type = jsonNode.get("type").asText();
            
            switch (type) {
                case "begin":
                    JsonNode beginData = jsonNode.get("data");
                    if (beginData != null && beginData.has("path")) {
                        JsonNode pathNode = beginData.get("path");
                        if (pathNode.has("text")) {
                            currentFile = pathNode.get("text").asText();
                        }
                    }
                    break;
                    
                case "context": {
                    JsonNode contextData = jsonNode.get("data");
                    if (contextData != null && currentFile != null) {
                        int lineNumber = 0;
                        if (contextData.has("line_number")) {
                            lineNumber = contextData.get("line_number").asInt();
                        }

                        String lineContent = "";
                        if (contextData.has("lines")) {
                            JsonNode linesNode = contextData.get("lines");
                            if (linesNode.has("text")) {
                                lineContent = linesNode.get("text").asText().replaceAll("\\r?\\n$", "");
                            }
                        }

                        results.add(new SearchResult(currentFile, lineNumber, lineContent, true));
                    }
                    break;
                }

                case "match": {
                    JsonNode matchData = jsonNode.get("data");
                    if (matchData != null) {
                        String filePath = currentFile;
                        if (matchData.has("path")) {
                            JsonNode pathNode = matchData.get("path");
                            if (pathNode.has("text")) {
                                filePath = pathNode.get("text").asText();
                            }
                        }
                        
                        int lineNumber = 0;
                        if (matchData.has("line_number")) {
                            lineNumber = matchData.get("line_number").asInt();
                        }
                        
                        String lineContent = "";
                        if (matchData.has("lines")) {
                            JsonNode linesNode = matchData.get("lines");
                            if (linesNode.has("text")) {
                                lineContent = linesNode.get("text").asText().replaceAll("\\r?\\n$", "");
                            }
                        }
                        
                        results.add(new SearchResult(filePath, lineNumber, lineContent, false));
                    }
                    break;
                }
                    
                case "end":
                    currentFile = null;
                    break;
            }
        }
        
        return results;
    }

    /**
     * 检查文件路径是否匹配 filePattern（glob 模式）。
     * 与 JavaGrepBackend.matchesFilePattern 保持逻辑一致。
     */
    private boolean matchesFilePattern(Path path, String filePattern) {
        if (filePattern == null || filePattern.isEmpty()) {
            return true;
        }

        String fileName = path.getFileName().toString();
        String normalizedPattern = filePattern.startsWith("*") ? filePattern : "*" + filePattern;

        try {
            return fileName.matches(convertGlobToRegex(normalizedPattern));
        } catch (Exception e) {
            return fileName.toLowerCase().contains(filePattern.toLowerCase());
        }
    }

    private String convertGlobToRegex(String glob) {
        StringBuilder regex = new StringBuilder();
        for (char c : glob.toCharArray()) {
            switch (c) {
                case '*':
                    regex.append(".*");
                    break;
                case '?':
                    regex.append(".");
                    break;
                case '.':
                case '\\':
                case '(':
                case ')':
                case '[':
                case ']':
                case '{':
                case '}':
                case '^':
                case '$':
                case '|':
                case '+':
                    regex.append("\\").append(c);
                    break;
                default:
                    regex.append(c);
            }
        }
        return regex.toString();
    }
}
