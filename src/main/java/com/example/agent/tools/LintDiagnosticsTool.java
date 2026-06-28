package com.example.agent.tools;

import com.example.agent.config.Config;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

public class LintDiagnosticsTool implements ToolExecutor {

    private static final int DEFAULT_TIMEOUT = 60;
    private static final int MAX_TIMEOUT = 300;

    private static final Pattern JAVA_ERROR = Pattern.compile(
        "^(.+\\.java):(\\d+):\\s*(error|warning|错误|警告):\\s*(.+)$", Pattern.MULTILINE);

    private static final Pattern FLAKE8_LINE = Pattern.compile(
        "^(.+\\.py):(\\d+):(\\d+):\\s*(\\S+)\\s+(.+)$", Pattern.MULTILINE);

    private static final Pattern TSC_LINE = Pattern.compile(
        "^(.+\\.tsx?):(\\d+):(\\d+)\\s*-\\s*(error|warning)\\s*(\\S+):\\s*(.+)$", Pattern.MULTILINE);

    private static final Pattern GO_VET_LINE = Pattern.compile(
        "^(.+\\.go):(\\d+):(\\d+):\\s*(.+)$", Pattern.MULTILINE);

    private static final Pattern HTML_VALIDATE = Pattern.compile(
        "^(.+\\.html?):(\\d+):(\\d+):\\s*(error|warning):\\s*(.+)$", Pattern.MULTILINE);

    private static final Pattern CARGO_JSON = Pattern.compile(
        "\"message\"\\s*:\\s*\\{[^}]*\"level\"\\s*:\\s*\"(error|warning)\"[^}]*\"message\"\\s*:\\s*\"([^\"]+)\"[^}]*\"spans\"\\s*:\\s*\\[\\{[^}]*\"file_name\"\\s*:\\s*\"([^\"]+)\"[^}]*\"line_start\"\\s*:\\s*(\\d+)[^}]*\"column_start\"\\s*:\\s*(\\d+)[^}]*\\][^}]*\\}",
        Pattern.DOTALL);

    private static final Map<String, List<String>> LANGUAGE_EXTENSIONS = Map.of(
        "java", List.of(".java"),
        "javascript", List.of(".js", ".mjs", ".cjs", ".jsx"),
        "typescript", List.of(".ts", ".tsx"),
        "python", List.of(".py"),
        "go", List.of(".go"),
        "rust", List.of(".rs"),
        "html", List.of(".html", ".htm"),
        "css", List.of(".css", ".scss", ".less"),
        "json", List.of(".json"),
        "yaml", List.of(".yaml", ".yml")
    );

    private static final Logger log = LoggerFactory.getLogger(LintDiagnosticsTool.class);

    private static final Map<String, String> LANGUAGE_TO_TOOL = Map.of(
        "java", "javac",
        "javascript", "npx",
        "typescript", "npx",
        "python", "flake8",
        "go", "go",
        "rust", "cargo",
        "html", "npx",
        "css", "npx",
        "json", "node"
    );

    /**
     * 语言 → 运行时配置键名映射。
     * 用于从 Config.runtimes 中查找用户配置的可执行文件路径。
     */
    private static final Map<String, String> LANGUAGE_TO_RUNTIME = Map.of(
        "javascript", "node",
        "typescript", "node",
        "json", "node",
        "html", "node",
        "css", "node",
        "python", "python",
        "go", "go"
    );

    /**
     * Java classpath 缓存：项目根目录 → (构建文件修改时间, classpath 字符串)
     * 构建文件（pom.xml/build.gradle）未变时复用缓存，避免重复计算。
     */
    private final Map<Path, ClasspathCacheEntry> classpathCache = new ConcurrentHashMap<>();

    private record ClasspathCacheEntry(FileTime buildFileMtime, String classpath) {}

    @Override
    public String getName() {
        return "lint_diagnostics";
    }

    @Override
    public String getDescription() {
        return "对指定文件或目录进行语法诊断检查。支持 Java(javac)、JavaScript(eslint)、" +
            "TypeScript(tsc)、Python(flake8)、Go(go vet)、Rust(cargo check) 等语言。\n" +
            "适用于 LLM 完成任务后做最终语法校验，发现错误后可自动修复。";
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
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "超时时间（秒，默认 60，最大 300）",
                        "default": 60,
                        "minimum": 10,
                        "maximum": 300
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
        int timeout = getTimeoutParam(arguments);
        Path targetPath = PathSecurityUtils.validateAndResolve(pathStr);
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
            List<Diagnostic> diagnostics = runDiagnostics(targetPath, language, timeout);
            return formatResult(targetPath, language, diagnostics);
        } catch (IOException e) {
            throw new ToolExecutionException("诊断失败: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ToolExecutionException("诊断被中断: " + e.getMessage(), e);
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

    private int getTimeoutParam(JsonNode args) {
        int t = DEFAULT_TIMEOUT;
        if (args.has("timeout") && !args.get("timeout").isNull()) {
            t = args.get("timeout").asInt();
        }
        return Math.max(10, Math.min(MAX_TIMEOUT, t));
    }

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

    private List<Diagnostic> runDiagnostics(Path target, String language, int timeout)
            throws IOException, InterruptedException {
        String missingTool = checkToolAvailable(language);
        if (missingTool != null) {
            return List.of(new Diagnostic(target.toString(), 0, 0, "info",
                "工具 '" + missingTool + "' 未安装或不在 PATH 中，跳过 " + language + " 诊断"));
        }
        return switch (language) {
            case "java" -> runJavaDiagnostics(target, timeout);
            case "javascript", "typescript" -> runEslintDiagnostics(target, language, timeout);
            case "python" -> runFlake8Diagnostics(target, timeout);
            case "go" -> runGoVetDiagnostics(target, timeout);
            case "rust" -> runCargoDiagnostics(target, timeout);
            case "html" -> runHtmlValidateDiagnostics(target, timeout);
            case "css" -> runStylelintDiagnostics(target, timeout);
            default -> runGenericDiagnostics(target, language, timeout);
        };
    }

    private String checkToolAvailable(String language) {
        String tool = LANGUAGE_TO_TOOL.get(language);
        if (tool == null) return null;
        try {
            boolean isWin = System.getProperty("os.name").toLowerCase().contains("win");
            String checkCmd = isWin ? "where" : "which";
            ProcessBuilder pb = buildProcessBuilder(List.of(checkCmd, tool), null, language);
            Process p = pb.start();
            boolean finished = p.waitFor(5, TimeUnit.SECONDS);
            if (!finished || p.exitValue() != 0) {
                log.warn("Tool not available: {} (check cmd: {} {})", tool, checkCmd, tool);
                return tool;
            }
            log.debug("Tool available: {}", tool);
            return null;
        } catch (Exception e) {
            log.warn("Tool check failed for {}: {}", tool, e.getMessage());
            return tool;
        }
    }

    private List<Diagnostic> runJavaDiagnostics(Path target, int timeout)
            throws IOException, InterruptedException {
        List<Path> files = collectFiles(target, "java");
        if (files.isEmpty()) return List.of();

        boolean isWin = isWindows();
        List<String> cmd = new ArrayList<>(List.of("javac", "-Xlint", "-d", isWin ? "NUL" : "/dev/null"));

        // 向上查找项目根目录，解析 classpath
        Path projectRoot = findJavaProjectRoot(target);
        if (projectRoot != null) {
            String cp = resolveJavaClasspath(projectRoot);
            if (!cp.isEmpty() && !".".equals(cp)) {
                cmd.add("-cp");
                cmd.add(cp);
            }
        }
        files.stream().map(Path::toAbsolutePath).map(Path::toString).forEach(cmd::add);

        log.info("Java diagnostics command: {}", String.join(" ", cmd));
        log.info("Using charset: {}", getPipeCharset().name());
        Path workDir = target.getParent();
        log.info("Working directory: {}", workDir);

        String rawOutput = exec(cmd, target.getParent(), timeout);
        log.info("Java diagnostics raw output (length={}):\n{}", rawOutput.length(), rawOutput);

        return parseJavaOutput(rawOutput);
    }

    // ==================== Java Classpath 增强 ====================

    /**
     * 从 target 向上遍历目录，查找构建文件（pom.xml / build.gradle / build.gradle.kts）。
     * 返回项目根目录，未找到返回 null。
     */
    private Path findJavaProjectRoot(Path target) {
        Path dir = Files.isDirectory(target) ? target : target.getParent();
        if (dir == null) dir = target.toAbsolutePath().getParent();
        while (dir != null) {
            if (Files.exists(dir.resolve("pom.xml"))
                || Files.exists(dir.resolve("build.gradle"))
                || Files.exists(dir.resolve("build.gradle.kts"))) {
                return dir;
            }
            dir = dir.getParent();
        }
        return null;
    }

    /**
     * 解析 Java 项目 classpath。
     * 优先走快速路径（直接解析 pom.xml / gradle），失败后回退到构建工具调用。
     */
    private String resolveJavaClasspath(Path projectRoot) {
        Path pomFile = projectRoot.resolve("pom.xml");
        Path gradleFile = projectRoot.resolve("build.gradle");
        if (!Files.exists(gradleFile)) {
            gradleFile = projectRoot.resolve("build.gradle.kts");
        }

        if (Files.exists(pomFile)) {
            return resolveMavenClasspath(projectRoot, pomFile);
        } else if (Files.exists(gradleFile)) {
            return resolveGradleClasspath(projectRoot, gradleFile);
        }
        return ".";
    }

    /**
     * Maven classpath 解析：先尝试直接解析 pom.xml，失败后回退到 mvn dependency:build-classpath。
     */
    private String resolveMavenClasspath(Path projectRoot, Path pomFile) {
        // 检查缓存
        try {
            ClasspathCacheEntry cached = classpathCache.get(projectRoot);
            FileTime currentMtime = Files.getLastModifiedTime(pomFile);
            if (cached != null && currentMtime.equals(cached.buildFileMtime())) {
                log.debug("resolveMavenClasspath: cache hit for {}", projectRoot);
                return cached.classpath();
            }
        } catch (IOException e) {
            log.debug("resolveMavenClasspath: cannot read pom mtime, skipping cache", e);
        }

        // 快速路径：直接解析 pom.xml 获取本地仓库 jar
        String classpath = resolveMavenClasspathFromPom(pomFile);
        if (classpath != null) {
            log.info("resolveMavenClasspath: resolved from pom.xml: {} chars", classpath.length());
            updateClasspathCache(projectRoot, pomFile, classpath);
            return classpath;
        }

        // 慢速路径：调 mvn
        log.info("resolveMavenClasspath: falling back to mvn dependency:build-classpath");
        String cp = resolveMavenClasspathViaMvn(projectRoot, pomFile);
        updateClasspathCache(projectRoot, pomFile, cp);
        return cp;
    }

    /**
     * 直接解析 pom.xml，从本地 Maven 仓库（~/.m2/repository）映射 jar 路径。
     * 仅处理直接依赖，不包括传递依赖。对简单项目足够，复杂项目回退到 mvn。
     */
    private String resolveMavenClasspathFromPom(Path pomFile) {
        try {
            Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(pomFile.toFile());
            doc.getDocumentElement().normalize();

            String m2Repo = System.getProperty("user.home") + File.separator + ".m2" + File.separator + "repository";

            // 项目自己的输出目录
            StringBuilder cp = new StringBuilder();
            String buildDir = getMavenBuildDir(doc);
            cp.append(buildDir);

            // 解析依赖
            NodeList deps = doc.getElementsByTagName("dependency");
            for (int i = 0; i < deps.getLength(); i++) {
                Element dep = (Element) deps.item(i);

                // 跳过 scope=system/test/provided 的依赖
                String scope = getElementText(dep, "scope");
                if ("test".equals(scope) || "provided".equals(scope)) continue;

                String groupId = getElementText(dep, "groupId");
                String artifactId = getElementText(dep, "artifactId");
                String version = getElementText(dep, "version");
                if (groupId == null || artifactId == null || version == null) continue;

                // 跳过 ${...} 占位符（无法直接解析）
                if (version.startsWith("${")) continue;

                String jarPath = m2Repo + File.separator
                    + groupId.replace('.', File.separatorChar) + File.separator
                    + artifactId + File.separator
                    + version + File.separator
                    + artifactId + "-" + version + ".jar";

                File jarFile = new File(jarPath);
                if (jarFile.exists()) {
                    cp.append(File.pathSeparator).append(jarPath);
                }
            }

            return cp.toString();
        } catch (Exception e) {
            log.debug("resolveMavenClasspathFromPom: failed, will fallback to mvn: {}", e.getMessage());
            return null;
        }
    }

    /** 获取 pom.xml 中配置的 build 输出目录，默认 target/classes */
    private String getMavenBuildDir(Document doc) {
        NodeList buildNodes = doc.getElementsByTagName("build");
        if (buildNodes.getLength() > 0) {
            Element build = (Element) buildNodes.item(0);
            String dir = getElementText(build, "outputDirectory");
            if (dir != null && !dir.isEmpty()) return dir;
        }
        return "target" + File.separator + "classes";
    }

    /** 安全获取子标签文本 */
    private String getElementText(Element parent, String tagName) {
        NodeList list = parent.getElementsByTagName(tagName);
        if (list.getLength() == 0) return null;
        String text = list.item(0).getTextContent();
        return text != null ? text.trim() : null;
    }

    /**
     * 调 mvn dependency:build-classpath 获取完整 classpath（包括传递依赖）。
     */
    private String resolveMavenClasspathViaMvn(Path projectRoot, Path pomFile) {
        try {
            String cp = exec(List.of("mvn", "dependency:build-classpath", "-q",
                "-Dmdep.outputFile=/dev/stdout"), projectRoot, 30, "java").trim();
            if (cp.isEmpty() || cp.startsWith("[ERROR]")) {
                log.warn("resolveMavenClasspathViaMvn: empty or error output: {}", cp);
                return ".";
            }
            // 追加项目自己的输出目录
            String buildDir = "target" + File.separator + "classes";
            return buildDir + File.pathSeparator + cp;
        } catch (Exception e) {
            log.warn("resolveMavenClasspathViaMvn: failed: {}", e.getMessage());
            return ".";
        }
    }

    /**
     * Gradle classpath 解析：尝试调 gradlew / gradle 获取运行时类路径。
     */
    private String resolveGradleClasspath(Path projectRoot, Path gradleFile) {
        // 检查缓存
        try {
            ClasspathCacheEntry cached = classpathCache.get(projectRoot);
            FileTime currentMtime = Files.getLastModifiedTime(gradleFile);
            if (cached != null && currentMtime.equals(cached.buildFileMtime())) {
                log.debug("resolveGradleClasspath: cache hit for {}", projectRoot);
                return cached.classpath();
            }
        } catch (IOException e) {
            log.debug("resolveGradleClasspath: cannot read gradle mtime, skipping cache", e);
        }

        // 选择 gradle 命令
        Path gradlew = projectRoot.resolve("gradlew.bat");
        String gradleCmd;
        if (Files.exists(gradlew)) {
            gradleCmd = gradlew.toAbsolutePath().toString();
        } else {
            gradleCmd = "gradle";
        }

        try {
            List<String> cmd = List.of(gradleCmd, "printClasspath", "-q");
            String output = exec(cmd, projectRoot, 30, "java").trim();
            if (output.isEmpty() || output.contains("FAILED")) {
                // gradle printClasspath 可能不存在，尝试用 gradle dependencies
                log.debug("resolveGradleClasspath: printClasspath task not available, trying dependencies");
                cmd = List.of(gradleCmd, "dependencies", "--configuration", "runtimeClasspath", "-q");
                output = exec(cmd, projectRoot, 30, "java");
                // 输出是依赖树，无法直接当 classpath 用，回退到仅项目输出
                String cp = "build" + File.separator + "classes" + File.separator + "java" + File.separator + "main";
                updateClasspathCache(projectRoot, gradleFile, cp);
                return cp;
            }
            String cp = output + File.pathSeparator + "build" + File.separator + "classes" + File.separator + "java" + File.separator + "main";
            updateClasspathCache(projectRoot, gradleFile, cp);
            return cp;
        } catch (Exception e) {
            log.warn("resolveGradleClasspath: failed: {}", e.getMessage());
            String cp = "build" + File.separator + "classes" + File.separator + "java" + File.separator + "main";
            updateClasspathCache(projectRoot, gradleFile, cp);
            return cp;
        }
    }

    /** 更新 classpath 缓存 */
    private void updateClasspathCache(Path projectRoot, Path buildFile, String classpath) {
        try {
            FileTime mtime = Files.getLastModifiedTime(buildFile);
            classpathCache.put(projectRoot, new ClasspathCacheEntry(mtime, classpath));
        } catch (IOException e) {
            log.debug("updateClasspathCache: cannot read mtime for {}", buildFile);
        }
    }

    private List<Diagnostic> parseJavaOutput(String output) {
        List<Diagnostic> list = new ArrayList<>();
        var m = JAVA_ERROR.matcher(output);
        while (m.find()) {
            String rawSeverity = m.group(3);
            String severity = "错误".equals(rawSeverity) || "error".equals(rawSeverity) ? "error" : "warning";
            list.add(new Diagnostic(
                shortenPath(m.group(1)), parseInt(m.group(2)), 0,
                severity,
                m.group(4).trim()));
        }
        log.debug("parseJavaOutput: regex matched {} diagnostics from {} chars of output",
            list.size(), output.length());
        if (list.isEmpty() && !output.isBlank()) {
            log.warn("parseJavaOutput: no matches found. First 500 chars of output:\n{}",
                output.substring(0, Math.min(500, output.length())));
        }
        return list;
    }

    @SuppressWarnings("unchecked")
    private List<Diagnostic> runEslintDiagnostics(Path target, String language, int timeout)
            throws IOException, InterruptedException {
        List<Path> files = collectFiles(target, "javascript");
        if (language.equals("typescript")) {
            files = collectFiles(target, "typescript");
        }
        if (files.isEmpty()) return List.of();

        List<String> cmd = new ArrayList<>(List.of("npx", "eslint", "--format", "json"));
        files.stream().map(p -> p.toAbsolutePath().toString()).forEach(cmd::add);

        String output = exec(cmd, target.getParent(), timeout, language);
        return parseEslintOutput(output);
    }

    private List<Diagnostic> parseEslintOutput(String jsonOutput) {
        List<Diagnostic> list = new ArrayList<>();
        if (jsonOutput.isBlank() || jsonOutput.trim().equals("[]")) return list;
        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var root = mapper.readTree(jsonOutput);
            for (var fileResult : root) {
                String file = fileResult.get("filePath").asText();
                var messages = fileResult.get("messages");
                if (messages == null) continue;
                for (var msg : messages) {
                    int line = msg.has("line") ? msg.get("line").asInt() : 0;
                    int col = msg.has("column") ? msg.get("column").asInt() : 0;
                    String sev = msg.has("severity") && msg.get("severity").asInt() >= 2 ? "error" : "warning";
                    String rule = msg.has("ruleId") && !msg.get("ruleId").isNull()
                        ? msg.get("ruleId").asText() : "";
                    String text = msg.has("message") ? msg.get("message").asText() : "";
                    list.add(new Diagnostic(shortenPath(file), line, col, sev,
                        rule.isEmpty() ? text : "[" + rule + "] " + text));
                }
            }
        } catch (Exception ignored) {}
        return list;
    }

    private List<Diagnostic> runFlake8Diagnostics(Path target, int timeout)
            throws IOException, InterruptedException {
        List<Path> files = collectFiles(target, "python");
        if (files.isEmpty()) return List.of();

        List<String> cmd = new ArrayList<>(List.of("flake8"));
        files.stream().map(p -> p.toAbsolutePath().toString()).forEach(cmd::add);

        return parseFlake8Output(exec(cmd, target.getParent(), timeout, "python"));
    }

    private List<Diagnostic> parseFlake8Output(String output) {
        List<Diagnostic> list = new ArrayList<>();
        var m = FLAKE8_LINE.matcher(output);
        while (m.find()) {
            list.add(new Diagnostic(
                shortenPath(m.group(1)), parseInt(m.group(2)), parseInt(m.group(3)),
                "warning", "[" + m.group(4) + "] " + m.group(5).trim()));
        }
        return list;
    }

    private List<Diagnostic> runHtmlValidateDiagnostics(Path target, int timeout)
            throws IOException, InterruptedException {
        List<Path> files = collectFiles(target, "html");
        if (files.isEmpty()) return List.of();

        List<String> cmd = new ArrayList<>(List.of("npx", "html-validate"));
        files.stream().map(p -> p.toAbsolutePath().toString()).forEach(cmd::add);

        String output = exec(cmd, target.getParent(), timeout, "html");
        return parseHtmlValidateOutput(output);
    }

    private List<Diagnostic> parseHtmlValidateOutput(String output) {
        List<Diagnostic> list = new ArrayList<>();
        var m = HTML_VALIDATE.matcher(output);
        while (m.find()) {
            list.add(new Diagnostic(
                shortenPath(m.group(1)), parseInt(m.group(2)), parseInt(m.group(3)),
                m.group(4), m.group(5).trim()));
        }
        return list;
    }

    private List<Diagnostic> runStylelintDiagnostics(Path target, int timeout)
            throws IOException, InterruptedException {
        List<Path> files = collectFiles(target, "css");
        if (files.isEmpty()) return List.of();

        List<String> cmd = new ArrayList<>(List.of("npx", "stylelint", "--formatter", "json"));
        files.stream().map(p -> p.toAbsolutePath().toString()).forEach(cmd::add);

        String output = exec(cmd, target.getParent(), timeout, "css");
        return parseStylelintOutput(output);
    }

    private List<Diagnostic> parseStylelintOutput(String jsonOutput) {
        List<Diagnostic> list = new ArrayList<>();
        if (jsonOutput.isBlank()) return list;
        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var root = mapper.readTree(jsonOutput);
            for (var fileResult : root) {
                String file = fileResult.has("source") ? fileResult.get("source").asText() : "";
                var warnings = fileResult.get("warnings");
                if (warnings == null) continue;
                for (var w : warnings) {
                    int line = w.has("line") ? w.get("line").asInt() : 0;
                    int col = w.has("column") ? w.get("column").asInt() : 0;
                    String sev = w.has("severity") ? w.get("severity").asText() : "error";
                    String rule = w.has("rule") && !w.get("rule").isNull()
                        ? w.get("rule").asText() : "";
                    String text = w.has("text") ? w.get("text").asText() : "";
                    list.add(new Diagnostic(shortenPath(file), line, col, sev,
                        rule.isEmpty() ? text : "[" + rule + "] " + text));
                }
            }
        } catch (Exception ignored) {}
        return list;
    }

    private List<Diagnostic> runGoVetDiagnostics(Path target, int timeout)
            throws IOException, InterruptedException {
        String targetStr = target.toAbsolutePath().toString();
        String output = exec(List.of("go", "vet", targetStr), target.getParent(), timeout, "go");
        return parseGoVetOutput(output);
    }

    private List<Diagnostic> parseGoVetOutput(String output) {
        List<Diagnostic> list = new ArrayList<>();
        var m = GO_VET_LINE.matcher(output);
        while (m.find()) {
            list.add(new Diagnostic(
                shortenPath(m.group(1)), parseInt(m.group(2)), parseInt(m.group(3)),
                "error", m.group(4).trim()));
        }
        return list;
    }

    private List<Diagnostic> runCargoDiagnostics(Path target, int timeout)
            throws IOException, InterruptedException {
        Path projectDir = findCargoProject(target);
        if (projectDir == null) return List.of();

        String output = exec(List.of("cargo", "check", "--message-format=json", "--quiet"),
            projectDir, timeout);
        return parseCargoOutput(output);
    }

    private Path findCargoProject(Path target) {
        Path dir = Files.isDirectory(target) ? target : target.getParent();
        while (dir != null) {
            if (Files.exists(dir.resolve("Cargo.toml"))) return dir;
            dir = dir.getParent();
        }
        return null;
    }

    private List<Diagnostic> parseCargoOutput(String output) {
        List<Diagnostic> list = new ArrayList<>();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (String line : output.split("\n")) {
            line = line.trim();
            if (line.isEmpty()) continue;
            try {
                var json = mapper.readTree(line);
                if (!json.has("message")) continue;
                var msg = json.get("message");
                String level = msg.has("level") ? msg.get("level").asText() : "error";
                if (!"error".equals(level) && !"warning".equals(level)) continue;
                String text = msg.has("message") ? msg.get("message").asText() : "";
                String file = "";
                int lineNum = 0, col = 0;
                if (msg.has("spans") && msg.get("spans").size() > 0) {
                    var span = msg.get("spans").get(0);
                    file = span.has("file_name") ? span.get("file_name").asText() : "";
                    lineNum = span.has("line_start") ? span.get("line_start").asInt() : 0;
                    col = span.has("column_start") ? span.get("column_start").asInt() : 0;
                }
                if (!file.isEmpty()) {
                    list.add(new Diagnostic(shortenPath(file), lineNum, col, level, text));
                }
            } catch (Exception ignored) {}
        }
        return list;
    }

    private List<Diagnostic> runGenericDiagnostics(Path target, String language, int timeout)
            throws IOException, InterruptedException {
        List<String> cmd = switch (language) {
            case "json" -> List.of("node", "-e",
                "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))",
                target.toAbsolutePath().toString());
            default -> null;
        };
        if (cmd == null) {
            return List.of(new Diagnostic(target.toString(), 0, 0, "info",
                "语言 '" + language + "' 暂不支持自动诊断"));
        }
        String output = exec(cmd, target.getParent(), timeout, language);
        if (output.isEmpty() || output.contains("undefined")) return List.of();
        return List.of(new Diagnostic(target.toString(), 0, 0, "error", output.trim()));
    }

    /**
     * 根据语言查找用户在 config.yaml 中配置的运行时可执行文件路径。
     * 如未配置返回 null，调用方不做 PATH 增强。
     */
    private String resolveRuntimePath(String language) {
        if (language == null) return null;
        String runtimeKey = LANGUAGE_TO_RUNTIME.get(language);
        if (runtimeKey == null) return null;
        Map<String, String> runtimes = Config.getInstance().getRuntimes();
        String path = runtimes.get(runtimeKey);
        if (path != null && !path.isEmpty()) {
            log.debug("resolveRuntimePath: {} → {} = {}", language, runtimeKey, path);
        }
        return path;
    }

    /**
     * 将运行时可执行文件所在目录追加到 PATH 环境变量前面，
     * 使子进程能优先找到用户配置路径下的工具。
     */
    private void augmentPath(Map<String, String> env, String runtimePath) {
        if (runtimePath == null || runtimePath.isEmpty()) return;
        File runtimeFile = new File(runtimePath);
        String runtimeDir = runtimeFile.getParent();
        if (runtimeDir != null && !runtimeDir.isEmpty()) {
            String currentPath = env.get("PATH");
            String newPath = runtimeDir + File.pathSeparator + (currentPath != null ? currentPath : "");
            env.put("PATH", newPath);
            log.debug("augmentPath: prepended {} to PATH", runtimeDir);
        }
    }

    /**
     * 创建 ProcessBuilder，可选地根据语言增强 PATH 环境变量。
     */
    private ProcessBuilder buildProcessBuilder(List<String> command, Path workingDir, String language) {
        ProcessBuilder pb = new ProcessBuilder(command);
        if (workingDir != null && Files.isDirectory(workingDir)) {
            pb.directory(workingDir.toFile());
        }
        pb.redirectErrorStream(true);
        // 防止分页阻塞
        pb.environment().put("PAGER", "cat");
        // 根据语言增强 PATH（如果用户配置了运行时路径）
        String runtimePath = resolveRuntimePath(language);
        if (runtimePath != null) {
            augmentPath(pb.environment(), runtimePath);
        }
        return pb;
    }

    private String exec(List<String> command, Path workingDir, int timeoutSecs)
            throws IOException, InterruptedException {
        return exec(command, workingDir, timeoutSecs, null);
    }

    private String exec(List<String> command, Path workingDir, int timeoutSecs, String language)
            throws IOException, InterruptedException {
        log.debug("exec: command={}, workingDir={}, timeout={}s, language={}",
            command, workingDir, timeoutSecs, language);
        ProcessBuilder pb = buildProcessBuilder(command, workingDir, language);

        Process process = pb.start();
        process.getOutputStream().close();

        Charset charset = getPipeCharset();
        log.debug("exec: using charset={}", charset.name());

        StringBuilder output = new StringBuilder();
        Thread reader = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), charset))) {
                String line;
                while ((line = r.readLine()) != null) {
                    synchronized (output) { output.append(line).append("\n"); }
                }
            } catch (IOException ignored) {}
        });
        reader.setDaemon(true);
        reader.start();

        boolean finished = process.waitFor(timeoutSecs, TimeUnit.SECONDS);
        reader.join(2000);

        if (!finished) {
            process.destroyForcibly();
            log.warn("exec: command timed out after {}s: {}", timeoutSecs, String.join(" ", command));
            return output + "\n[超时] 命令执行超过 " + timeoutSecs + " 秒\n";
        }
        int exitCode = process.exitValue();
        synchronized (output) {
            String result = output.toString();
            log.debug("exec: exitCode={}, output length={}", exitCode, result.length());
            return result;
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

    private String shortenPath(String path) {
        if (path == null || path.isEmpty()) return path;
        int idx = path.replace('\\', '/').indexOf("/src/");
        if (idx >= 0) return path.substring(idx + 1);
        idx = path.lastIndexOf("\\");
        int idx2 = path.lastIndexOf("/");
        int last = Math.max(idx, idx2);
        if (last > 0 && last < path.length() - 1) return path.substring(last + 1);
        return path;
    }

    private int parseInt(String s) {
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return 0; }
    }

    private String formatResult(Path target, String language, List<Diagnostic> diagnostics) {
        StringBuilder sb = new StringBuilder();
        sb.append("📋 Diagnostic Report\n");
        sb.append("─────────────────────────────────────────\n");
        sb.append("Path: ").append(target).append("\n");
        sb.append("Language: ").append(language).append("\n");

        long errs = diagnostics.stream().filter(d -> "error".equals(d.severity)).count();
        long warns = diagnostics.stream().filter(d -> "warning".equals(d.severity)).count();

        if (errs == 0 && warns == 0) {
            sb.append("Status: ✅ PASS (0 errors, 0 warnings)\n");
            return sb.toString();
        }

        sb.append("Status: ❌ FAIL (").append(errs).append(" errors, ").append(warns).append(" warnings)\n\n");
        sb.append("Details:\n");
        int idx = 1;
        for (Diagnostic d : diagnostics) {
            if (!"error".equals(d.severity) && !"warning".equals(d.severity)) continue;
            String icon = "error".equals(d.severity) ? "🔴" : "🟡";
            sb.append(String.format("  [%d] %s %s:%d:%d  %s  %s\n",
                idx++, icon, d.file, d.line, d.column, d.severity.toUpperCase(), d.message));
        }
        sb.append("\nTip: Fix the issues above and re-run lint_diagnostics.\n");
        return sb.toString();
    }

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
