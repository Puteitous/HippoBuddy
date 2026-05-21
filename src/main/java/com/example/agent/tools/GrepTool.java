package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class GrepTool implements ToolExecutor {

    private static final int MAX_RESULTS = 100;
    private static final int MAX_FILE_SIZE = 10 * 1024 * 1024;
    private static final int MAX_LINE_LENGTH = 2000;
    private static final int MAX_DEPTH = 20;

    @Override
    public String getName() {
        return "grep";
    }

    @Override
    public String getDescription() {
        return "在文件内容中搜索匹配的文本模式。支持正则表达式，可以指定文件类型过滤。" +
               "返回匹配的文件名、行号和行内容。用于查找代码、配置、日志等。" +
               "只能搜索项目目录内的文件。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "要搜索的正则表达式模式"
                    },
                    "path": {
                        "type": "string",
                        "description": "搜索的起始目录（默认为项目根目录）"
                    },
                    "file_pattern": {
                        "type": "string",
                        "description": "文件名 glob 模式过滤（如 '*.java' 只搜索 Java 文件，默认搜索所有文件）"
                    },
                    "case_sensitive": {
                        "type": "boolean",
                        "description": "是否区分大小写（默认 false）",
                        "default": false
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "最大返回结果数（默认 100，最大 500）",
                        "default": 100,
                        "minimum": 1,
                        "maximum": 500
                    }
                },
                "required": ["pattern"]
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        if (arguments.has("path")) {
            return Collections.singletonList(arguments.get("path").asText());
        }
        return Collections.singletonList(".");
    }

    @Override
    public boolean requiresFileLock() {
        return false;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (!arguments.has("pattern")) {
            throw new ToolExecutionException("缺少必需参数: pattern");
        }

        String patternStr = arguments.get("pattern").asText();
        String searchPath = ".";
        if (arguments.has("path") && !arguments.get("path").isNull()) {
            String pathValue = arguments.get("path").asText();
            if (pathValue != null && !pathValue.trim().isEmpty()) {
                searchPath = pathValue;
            }
        }
        String filePattern = arguments.has("file_pattern") && !arguments.get("file_pattern").isNull() 
            ? arguments.get("file_pattern").asText() : null;
        boolean caseSensitive = arguments.has("case_sensitive") && arguments.get("case_sensitive").asBoolean();
        int maxResults = arguments.has("max_results") ? arguments.get("max_results").asInt() : 100;
        
        maxResults = Math.max(1, Math.min(500, maxResults));

        Pattern pattern;
        try {
            int flags = caseSensitive ? 0 : Pattern.CASE_INSENSITIVE;
            pattern = Pattern.compile(patternStr, flags);
        } catch (PatternSyntaxException e) {
            throw new ToolExecutionException("无效的正则表达式: " + e.getMessage());
        }

        Path basePath = PathSecurityUtils.validateAndResolve(searchPath);

        if (!Files.exists(basePath)) {
            throw new ToolExecutionException("搜索路径不存在: " + searchPath);
        }

        if (!Files.isDirectory(basePath)) {
            throw new ToolExecutionException("搜索路径不是目录: " + searchPath);
        }

        if (!Files.isReadable(basePath)) {
            throw new ToolExecutionException("搜索路径不可读: " + searchPath);
        }

        try {
            List<SearchResult> results = searchInDirectory(basePath, pattern, filePattern, maxResults);
            return formatResults(results, patternStr, searchPath, filePattern, maxResults);
        } catch (IOException e) {
            throw new ToolExecutionException("搜索失败: " + e.getMessage(), e);
        }
    }

    private List<SearchResult> searchInDirectory(Path basePath, Pattern pattern, String filePattern, int maxResults) throws IOException {
        List<SearchResult> results = new ArrayList<>();
        
        try (Stream<Path> stream = Files.walk(basePath, MAX_DEPTH)) {
            List<Path> files = stream
                .filter(Files::isRegularFile)
                .filter(this::isWithinProject)
                .filter(p -> matchesFilePattern(p, filePattern))
                .collect(Collectors.toList());

            for (Path file : files) {
                if (results.size() >= maxResults) {
                    break;
                }
                
                List<SearchResult> fileResults = searchInFile(file, pattern, maxResults - results.size());
                results.addAll(fileResults);
            }
        }

        return results;
    }

    private boolean isWithinProject(Path path) {
        return PathSecurityUtils.isWithinProject(path);
    }

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

    private List<SearchResult> searchInFile(Path file, Pattern pattern, int maxResults) throws IOException {
        List<SearchResult> results = new ArrayList<>();
        
        try {
            long fileSize = Files.size(file);
            if (fileSize > MAX_FILE_SIZE) {
                return results;
            }

            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            String relativePath = PathSecurityUtils.getRelativePath(file);
            
            for (int lineNum = 0; lineNum < lines.size() && results.size() < maxResults; lineNum++) {
                String line = lines.get(lineNum);
                Matcher matcher = pattern.matcher(line);
                
                if (matcher.find()) {
                    String trimmedLine = line.length() > MAX_LINE_LENGTH 
                        ? line.substring(0, MAX_LINE_LENGTH) + "..." 
                        : line;
                    results.add(new SearchResult(relativePath, lineNum + 1, trimmedLine.trim()));
                }
            }
        } catch (IOException e) {
            // Skip files that can't be read
        }

        return results;
    }

    private String formatResults(List<SearchResult> results, String pattern, String searchPath, String filePattern, int maxResults) {
        StringBuilder sb = new StringBuilder();
        
        if (results.isEmpty()) {
            sb.append("未找到匹配的内容\n");
        } else {
            String currentFile = null;
            int fileCount = 0;
            
            for (SearchResult result : results) {
                if (!result.filePath.equals(currentFile)) {
                    if (currentFile != null) {
                        sb.append("\n");
                    }
                    sb.append("📄 ").append(result.filePath).append("\n");
                    currentFile = result.filePath;
                    fileCount++;
                }
                
                sb.append("   ").append(String.format("%4d", result.lineNumber))
                  .append(": ").append(result.lineContent).append("\n");
            }

            sb.append("─────────────────────────────────────────────────────────────\n");
            sb.append(String.format("在 %d 个文件中找到 %d 处匹配", fileCount, results.size()));
            
            if (results.size() >= maxResults) {
                sb.append("（仅展示前 ").append(maxResults).append(" 条，可能不完整）");
            }
            sb.append("\n");
        }

        return sb.toString();
    }

    static class SearchResult {
        final String filePath;
        final int lineNumber;
        final String lineContent;

        SearchResult(String filePath, int lineNumber, String lineContent) {
            this.filePath = filePath;
            this.lineNumber = lineNumber;
            this.lineContent = lineContent;
        }
    }
}
