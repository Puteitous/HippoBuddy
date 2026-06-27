package com.example.agent.tools;

import com.example.agent.tools.grep.BackendSelector;
import com.example.agent.tools.grep.GrepBackend;
import com.example.agent.tools.grep.GrepOptions;
import com.example.agent.tools.grep.SearchResult;
import com.fasterxml.jackson.databind.JsonNode;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class GrepTool implements ToolExecutor {

    private static final int DEFAULT_MAX_RESULTS = 100;
    private static final int ABSOLUTE_MAX_RESULTS = 500;

    private final BackendSelector backendSelector;

    public GrepTool() {
        this(BackendSelector.createDefault());
    }

    public GrepTool(BackendSelector backendSelector) {
        this.backendSelector = backendSelector;
    }

    @Override
    public String getName() {
        return "grep";
    }

    @Override
    public String getDescription() {
        return "在文件内容中搜索匹配的文本模式。支持正则表达式，可以指定文件类型过滤。" +
               "path 参数支持文件或目录：传文件则只搜索该文件内容，传目录则递归搜索子文件。" +
               "支持上下文行（context_before/context_after）、" +
               "多行匹配（multiline）、输出模式切换（output_mode）和结果分页（offset）。" +
               "用于查找代码、配置、日志等。只能搜索项目目录内的文件。";
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
                        "description": "搜索路径：文件或目录均可。传文件则只搜索该文件内容，传目录则递归搜索子文件（默认为项目根目录）"
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
                    },
                    "context_before": {
                        "type": "integer",
                        "description": "匹配行之前显示的行数（-B），用于查看上下文",
                        "default": 0,
                        "minimum": 0,
                        "maximum": 10
                    },
                    "context_after": {
                        "type": "integer",
                        "description": "匹配行之后显示的行数（-A），用于查看上下文",
                        "default": 0,
                        "minimum": 0,
                        "maximum": 10
                    },
                    "output_mode": {
                        "type": "string",
                        "description": "输出模式：content=显示匹配行内容，files_with_matches=只显示文件名，count=只显示每个文件的匹配数",
                        "enum": ["content", "files_with_matches", "count"],
                        "default": "content"
                    },
                    "multiline": {
                        "type": "boolean",
                        "description": "是否启用多行模式，让点号（.）匹配换行符（默认 false）",
                        "default": false
                    },
                    "offset": {
                        "type": "integer",
                        "description": "跳过前 N 个匹配结果（默认 0），用于分页",
                        "default": 0,
                        "minimum": 0
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
        GrepOptions options = parseOptions(arguments);
        validateSearchPath(options.getSearchPath());

        GrepBackend backend = backendSelector.selectBackend();
        List<SearchResult> results = backend.search(options);

        return formatResults(results, options);
    }

    private GrepOptions parseOptions(JsonNode arguments) throws ToolExecutionException {
        if (!arguments.has("pattern") || arguments.get("pattern").isNull()) {
            throw new ToolExecutionException("缺少必需参数: pattern");
        }

        String patternStr = arguments.get("pattern").asText();

        String searchPathStr = ".";
        if (arguments.has("path") && !arguments.get("path").isNull()) {
            String pathValue = arguments.get("path").asText();
            if (pathValue != null && !pathValue.trim().isEmpty()) {
                searchPathStr = pathValue;
            }
        }

        String filePattern = arguments.has("file_pattern") && !arguments.get("file_pattern").isNull()
            ? arguments.get("file_pattern").asText() : null;

        boolean caseSensitive = arguments.has("case_sensitive")
            && arguments.get("case_sensitive").asBoolean();

        int maxResults = DEFAULT_MAX_RESULTS;
        if (arguments.has("max_results")) {
            maxResults = Math.max(1, Math.min(ABSOLUTE_MAX_RESULTS, arguments.get("max_results").asInt()));
        }

        int contextBefore = arguments.has("context_before") ? arguments.get("context_before").asInt() : 0;
        int contextAfter = arguments.has("context_after") ? arguments.get("context_after").asInt() : 0;

        GrepOptions.OutputMode outputMode = GrepOptions.OutputMode.CONTENT;
        if (arguments.has("output_mode") && !arguments.get("output_mode").isNull()) {
            String modeStr = arguments.get("output_mode").asText();
            try {
                outputMode = GrepOptions.OutputMode.valueOf(modeStr.toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new ToolExecutionException("无效的 output_mode: '" + modeStr + "'，可选值: content, files_with_matches, count");
            }
        }

        boolean multiline = arguments.has("multiline") && arguments.get("multiline").asBoolean();

        int offset = arguments.has("offset") ? Math.max(0, arguments.get("offset").asInt()) : 0;

        Path searchPath = PathSecurityUtils.validateAndResolve(searchPathStr);

        return GrepOptions.builder()
                .pattern(patternStr)
                .caseSensitive(caseSensitive)
                .filePattern(filePattern)
                .searchPath(searchPath)
                .maxResults(maxResults)
                .contextBefore(contextBefore)
                .contextAfter(contextAfter)
                .outputMode(outputMode)
                .multiline(multiline)
                .offset(offset)
                .build();
    }

    private void validateSearchPath(Path basePath) throws ToolExecutionException {
        if (!Files.exists(basePath)) {
            throw new ToolExecutionException("搜索路径不存在: " + basePath);
        }
        if (!Files.isReadable(basePath)) {
            throw new ToolExecutionException("搜索路径不可读: " + basePath);
        }
        // 宽松模式：path 可以是目录或文件，不强制要求是目录
    }

    private String formatResults(List<SearchResult> results, GrepOptions options) {
        if (results.isEmpty()) {
            return "未找到匹配的内容\n";
        }

        switch (options.getOutputMode()) {
            case FILES_WITH_MATCHES:
                return formatFilesWithMatches(results, options);
            case COUNT:
                return formatCount(results, options);
            default:
                return formatContent(results, options);
        }
    }

    private String formatContent(List<SearchResult> results, GrepOptions options) {
        StringBuilder sb = new StringBuilder();
        String currentFile = null;
        int fileCount = 0;

        for (SearchResult result : results) {
            if (!result.getFilePath().equals(currentFile)) {
                if (currentFile != null) {
                    sb.append("\n");
                }
                sb.append("📄 ").append(result.getFilePath()).append("\n");
                currentFile = result.getFilePath();
                fileCount++;
            }

            if (result.isContext()) {
                sb.append("   · ").append(String.format("%4d", result.getLineNumber()))
                  .append(": ").append(result.getLineContent()).append("\n");
            } else {
                sb.append("   → ").append(String.format("%4d", result.getLineNumber()))
                  .append(": ").append(result.getLineContent()).append("\n");
            }
        }

        appendFooter(sb, fileCount, results.size(), options);
        return sb.toString();
    }

    private String formatFilesWithMatches(List<SearchResult> results, GrepOptions options) {
        StringBuilder sb = new StringBuilder();
        List<String> files = results.stream()
                .map(SearchResult::getFilePath)
                .distinct()
                .collect(Collectors.toList());

        for (String file : files) {
            sb.append("📄 ").append(file).append("\n");
        }

        appendFooter(sb, files.size(), results.size(), options);
        return sb.toString();
    }

    private String formatCount(List<SearchResult> results, GrepOptions options) {
        StringBuilder sb = new StringBuilder();
        Map<String, Long> countByFile = results.stream()
                .collect(Collectors.groupingBy(SearchResult::getFilePath, Collectors.counting()));

        long totalMatches = 0;
        for (Map.Entry<String, Long> entry : countByFile.entrySet()) {
            sb.append("📄 ").append(entry.getKey()).append(": ").append(entry.getValue()).append(" 处匹配\n");
            totalMatches += entry.getValue();
        }

        sb.append("─────────────────────────────────────────────────────────────\n");
        sb.append("总计 ").append(totalMatches).append(" 处匹配");
        if (results.size() >= options.getMaxResults()) {
            sb.append("（仅展示前 ").append(options.getMaxResults()).append(" 条，可能不完整）");
        }
        sb.append("\n");
        return sb.toString();
    }

    private void appendFooter(StringBuilder sb, int fileCount, int matchCount, GrepOptions options) {
        sb.append("─────────────────────────────────────────────────────────────\n");
        sb.append(String.format("在 %d 个文件中找到 %d 处匹配", fileCount, matchCount));
        if (matchCount >= options.getMaxResults()) {
            sb.append("（仅展示前 ").append(options.getMaxResults()).append(" 条，可能不完整）");
        }
        sb.append("\n");
    }
}
