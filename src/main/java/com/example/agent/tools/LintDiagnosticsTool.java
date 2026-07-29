package com.example.agent.tools;

import com.example.agent.domain.ast.ParseResult;
import com.example.agent.domain.ast.SyntaxError;
import com.example.agent.domain.ast.TreeSitterWasmParser;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 语法诊断工具。
 * <p>
 * 基于 Tree-sitter WASM (Chicory 运行时) 做纯语法层面的诊断，
 * 不依赖外部 CLI 工具，零 native 依赖。
 * 适用场景：检测 LLM 生成的代码中缺少括号、分号、花括号不匹配等简单语法错误。
 * <p>
 * 替代了旧的 CLI 调用方式（javac/eslint/flake8/go vet/cargo check 等），
 * 无需 classpath/PATH 增强，无需正则解析。
 */
public class LintDiagnosticsTool implements ToolExecutor {

    private static final Logger log = LoggerFactory.getLogger(LintDiagnosticsTool.class);

    static final Map<String, List<String>> LANGUAGE_EXTENSIONS = Map.of(
        "java", List.of(".java"),
        "javascript", List.of(".js", ".mjs", ".cjs", ".jsx"),
        "typescript", List.of(".ts", ".tsx"),
        "python", List.of(".py"),
        "go", List.of(".go"),
        "rust", List.of(".rs"),
        "html", List.of(".html", ".htm"),
        "css", List.of(".css", ".scss", ".less"),
        "json", List.of(".json")
    );

    @Override
    public String getName() {
        return "lint_diagnostics";
    }

    @Override
    public String getDescription() {
        return "对一个或多个文件/目录进行语法诊断检查。支持 Java、JavaScript、TypeScript、Python、" +
            "Go、Rust、HTML、CSS、JSON。检测缺少括号、分号、花括号不匹配等语法错误。\n" +
            "提示：建议传入具体文件路径，避免传大目录导致扫描耗时过长。\n";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "要检查的文件或目录路径列表（传目录会递归扫描其下所有匹配文件，建议传具体文件路径，避免传大目录导致扫描耗时过长）"
                    },
                    "language": {
                        "type": "string",
                        "description": "可选，指定只检查该语言。不传则自动检测所有支持的语言",
                        "enum": ["java","javascript","typescript","python","go","rust","html","css","json"]
                    }
                },
                "required": ["paths"]
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        List<String> paths = new ArrayList<>();
        if (arguments.has("paths") && arguments.get("paths").isArray()) {
            arguments.get("paths").forEach(p -> paths.add(p.asText()));
        }
        return paths;
    }

    @Override
    public boolean requiresFileLock() {
        return false;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        // 读取 paths 数组
        List<String> pathStrs = getPathsParam(arguments);
        if (pathStrs.isEmpty()) {
            throw new ToolExecutionException("缺少必需参数: paths（至少一个文件或目录路径）");
        }

        // 检查路径存在性
        List<Path> targetPaths = new ArrayList<>();
        for (String ps : pathStrs) {
            Path p = Path.of(ps);
            if (!Files.exists(p)) {
                throw new ToolExecutionException("路径不存在: " + ps);
            }
            targetPaths.add(p);
        }

        // 可选的语言过滤
        String languageFilter = arguments.has("language") && !arguments.get("language").isNull()
            ? arguments.get("language").asText().trim().toLowerCase() : null;

        try {
            List<Diagnostic> diagnostics = runDiagnostics(targetPaths, languageFilter);
            return formatResult(pathStrs, diagnostics);
        } catch (IOException e) {
            throw new ToolExecutionException("诊断失败: " + e.getMessage(), e);
        }
    }

    /** 从参数中读取 paths 数组 */
    private List<String> getPathsParam(JsonNode args) {
        List<String> paths = new ArrayList<>();
        if (args.has("paths") && args.get("paths").isArray()) {
            for (JsonNode p : args.get("paths")) {
                String s = p.asText().trim();
                if (!s.isEmpty()) paths.add(s);
            }
        }
        return paths;
    }

    // ==================== 语言推断 ====================

    private String detectLanguageByExtension(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        for (var entry : LANGUAGE_EXTENSIONS.entrySet()) {
            for (String ext : entry.getValue()) {
                if (name.endsWith(ext)) return entry.getKey();
            }
        }
        return null;
    }

    /**
     * 按语言分组收集文件。如有 languageFilter 则只收集该语言的文件。
     * 返回 Map<语言, List<文件路径>>。
     */
    private Map<String, List<Path>> collectFilesByLanguage(List<Path> targets, String languageFilter) throws IOException {
        Map<String, List<Path>> result = new HashMap<>();
        for (Path target : targets) {
            if (Files.isRegularFile(target)) {
                addFileToGroup(result, target, languageFilter);
            } else if (Files.isDirectory(target)) {
                try (Stream<Path> walk = Files.walk(target, 20)) {
                    walk.filter(Files::isRegularFile)
                        .forEach(f -> addFileToGroup(result, f, languageFilter));
                }
            }
        }
        return result;
    }

    private void addFileToGroup(Map<String, List<Path>> groups, Path file, String languageFilter) {
        String lang = detectLanguageByExtension(file);
        if (lang == null) return;
        if (languageFilter != null && !languageFilter.equals(lang)) return;
        groups.computeIfAbsent(lang, k -> new ArrayList<>()).add(file);
    }

    // ==================== 核心诊断 ====================

    private List<Diagnostic> runDiagnostics(List<Path> targets, String languageFilter) throws IOException {
        // 检查 Tree-sitter WASM 是否可用
        if (!TreeSitterWasmParser.isAvailable()) {
            String firstPath = targets.stream()
                .map(Path::toString)
                .findFirst().orElse("(unknown)");
            return List.of(new Diagnostic(firstPath, 0, 0, "info",
                "Tree-sitter WASM 解析器未加载，跳过诊断。"
                + "请确认 resources/tree-sitter/ 目录中存在 tree-sitter-parser.wasm 文件。"));
        }

        // 按语言分组收集文件
        Map<String, List<Path>> byLanguage = collectFilesByLanguage(targets, languageFilter);
        if (byLanguage.isEmpty()) return List.of();

        List<Diagnostic> allDiagnostics = new ArrayList<>();

        // 每种语言各创建一个 parser，分别解析
        for (var entry : byLanguage.entrySet()) {
            String lang = entry.getKey();
            List<Path> files = entry.getValue();
            TreeSitterWasmParser parser = new TreeSitterWasmParser(lang);

            for (Path file : files) {
                try {
                    String content = Files.readString(file);
                    ParseResult result = parser.parse(content);
                    if (!result.isValid()) {
                        for (SyntaxError err : result.getErrors()) {
                            allDiagnostics.add(new Diagnostic(
                                file.toAbsolutePath().toString(),
                                err.getLine(),
                                err.getColumn(),
                                "error",
                                err.getMessage()
                            ));
                        }
                    }
                } catch (Exception e) {
                    log.debug("Failed to parse {}: {}", file, e.getMessage());
                    allDiagnostics.add(new Diagnostic(
                        file.toAbsolutePath().toString(), 0, 0, "warning",
                        "解析失败: " + e.getMessage()));
                }
            }
        }

        return allDiagnostics;
    }

    // ==================== 输出格式化 ====================

    private String formatResult(List<String> inputPaths, List<Diagnostic> diagnostics) {
        StringBuilder sb = new StringBuilder();

        // 生成简洁的路径描述：目录用末尾名+/，文件用文件名
        String pathDesc = inputPaths.stream()
            .map(p -> {
                Path path = Path.of(p);
                if (Files.isDirectory(path)) {
                    return path.getFileName().toString() + "/";
                }
                return path.getFileName().toString();
            })
            .collect(Collectors.joining(", "));

        if (diagnostics.isEmpty()) {
            sb.append("✅ ").append(pathDesc).append(" — 通过语法检查，未发现错误");
            return sb.toString();
        }

        // 统计错误/警告
        long errors = diagnostics.stream().filter(d -> "error".equals(d.severity)).count();
        long warnings = diagnostics.stream().filter(d -> "warning".equals(d.severity)).count();

        sb.append("🔍 语法诊断结果 — ").append(pathDesc);
        if (errors > 0) sb.append("  ").append(errors).append(" 个错误");
        if (warnings > 0) sb.append("  ").append(warnings).append(" 个警告");
        sb.append("\n\n");

        // 按文件分组
        Map<String, List<Diagnostic>> byFile = diagnostics.stream()
            .collect(Collectors.groupingBy(d -> d.file));

        for (var entry : byFile.entrySet()) {
            String filePath = shortenPath(entry.getKey());
            sb.append("📄 ").append(filePath).append("\n");
            for (Diagnostic d : entry.getValue()) {
                sb.append("  ").append(d.line).append(":").append(d.column);
                sb.append("  [").append(d.severity).append("] ");
                sb.append(d.message).append("\n");
            }
            sb.append("\n");
        }

        return sb.toString();
    }

    /** 缩短路径：去掉 /src/ 之前的项目路径前缀 */
    static String shortenPath(String path) {
        if (path == null) return "";
        int srcIdx = path.indexOf("/src/");
        if (srcIdx < 0) srcIdx = path.indexOf("\\src\\");
        if (srcIdx >= 0) {
            return path.substring(srcIdx);
        }
        // 取最后两级（用 lastIndexOf 代替 split，避免反斜杠正则问题）
        String sep = path.contains("/") ? "/" : "\\";
        int lastSep = path.lastIndexOf(sep);
        if (lastSep > 0) {
            int secondLastSep = path.lastIndexOf(sep, lastSep - 1);
            if (secondLastSep >= 0) {
                return path.substring(secondLastSep + 1);
            }
        }
        return path;
    }

    // ==================== 内部类 ====================

    static class Diagnostic {
        final String file;
        final int line;
        final int column;
        final String severity;
        final String message;

        Diagnostic(String file, int line, int column, String severity, String message) {
            this.file = file;
            this.line = line;
            this.column = column;
            this.severity = severity;
            this.message = message;
        }
    }
}
