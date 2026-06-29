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
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
        return "对指定文件或目录进行语法诊断检查。支持 Java、JavaScript、TypeScript、Python、" +
            "Go、Rust、HTML、CSS、JSON。检测缺少括号、分号、花括号不匹配等语法错误。\n";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要检查的文件或目录路径"
                    },
                    "language": {
                        "type": "string",
                        "description": "语言类型，不传则从文件后缀推断",
                        "enum": ["java","javascript","typescript","python","go","rust","html","css","json"]
                    }
                },
                "required": ["path"]
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        if (arguments.has("path")) {
            return Collections.singletonList(arguments.get("path").asText());
        }
        return Collections.emptyList();
    }

    @Override
    public boolean requiresFileLock() {
        return false;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        String pathStr = getRequiredParam(arguments, "path");
        Path targetPath = Path.of(pathStr);
        if (!Files.exists(targetPath)) {
            throw new ToolExecutionException("路径不存在: " + pathStr);
        }

        String language = arguments.has("language") && !arguments.get("language").isNull()
            ? arguments.get("language").asText().trim().toLowerCase() : null;
        if (language == null || language.isEmpty()) {
            language = detectLanguage(targetPath);
            if (language == null) {
                throw new ToolExecutionException("无法从路径推断语言，请通过 language 参数指定。支持: "
                    + String.join(", ", LANGUAGE_EXTENSIONS.keySet()));
            }
        }

        try {
            List<Diagnostic> diagnostics = runDiagnostics(targetPath, language);
            return formatResult(targetPath, language, diagnostics);
        } catch (IOException e) {
            throw new ToolExecutionException("诊断失败: " + e.getMessage(), e);
        }
    }

    private String getRequiredParam(JsonNode args, String name) throws ToolExecutionException {
        if (!args.has(name) || args.get(name).isNull()) {
            throw new ToolExecutionException("缺少必需参数: " + name);
        }
        String val = args.get(name).asText().trim();
        if (val.isEmpty()) throw new ToolExecutionException("参数 " + name + " 不能为空");
        return val;
    }

    // ==================== 语言推断 ====================

    private String detectLanguage(Path target) {
        if (Files.isDirectory(target)) {
            try (Stream<Path> files = Files.list(target)) {
                return files.map(this::detectLanguageByExtension)
                    .filter(Objects::nonNull)
                    .findFirst().orElse(null);
            } catch (IOException e) {
                return null;
            }
        }
        return detectLanguageByExtension(target);
    }

    private String detectLanguageByExtension(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        for (var entry : LANGUAGE_EXTENSIONS.entrySet()) {
            for (String ext : entry.getValue()) {
                if (name.endsWith(ext)) return entry.getKey();
            }
        }
        return null;
    }

    private List<Path> collectFiles(Path target, String language) throws IOException {
        List<String> exts = LANGUAGE_EXTENSIONS.get(language);
        if (exts == null) return List.of();
        if (Files.isRegularFile(target)) {
            return List.of(target);
        }
        try (Stream<Path> walk = Files.walk(target, 20)) {
            return walk.filter(Files::isRegularFile)
                .filter(f -> {
                    String name = f.getFileName().toString().toLowerCase();
                    return exts.stream().anyMatch(name::endsWith);
                })
                .collect(Collectors.toList());
        }
    }

    // ==================== 核心诊断 ====================

    private List<Diagnostic> runDiagnostics(Path target, String language) throws IOException {
        // 检查 Tree-sitter WASM 是否可用
        if (!TreeSitterWasmParser.isAvailable()) {
            return List.of(new Diagnostic(target.toString(), 0, 0, "info",
                "Tree-sitter WASM 解析器未加载，跳过诊断。"
                + "请确认 resources/tree-sitter/ 目录中存在 tree-sitter-parser.wasm 文件。"));
        }

        List<Path> files = collectFiles(target, language);
        if (files.isEmpty()) return List.of();

        List<Diagnostic> allDiagnostics = new ArrayList<>();
        TreeSitterWasmParser parser = new TreeSitterWasmParser(language);

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

        return allDiagnostics;
    }

    // ==================== 输出格式化 ====================

    private String formatResult(Path target, String language, List<Diagnostic> diagnostics) {
        StringBuilder sb = new StringBuilder();
        boolean isDir = Files.isDirectory(target);
        String targetName = isDir ? target.toString() : target.getFileName().toString();

        if (diagnostics.isEmpty()) {
            sb.append("✅ ").append(targetName).append(" — 通过语法检查，未发现错误");
            if (isDir) {
                sb.append("（语言: ").append(language).append("）");
            }
            return sb.toString();
        }

        // 统计错误/警告
        long errors = diagnostics.stream().filter(d -> "error".equals(d.severity)).count();
        long warnings = diagnostics.stream().filter(d -> "warning".equals(d.severity)).count();

        sb.append("🔍 语法诊断结果 — ").append(targetName);
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
