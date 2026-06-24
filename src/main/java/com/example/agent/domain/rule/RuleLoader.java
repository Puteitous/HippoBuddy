package com.example.agent.domain.rule;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 规则文件加载器。
 * <p>
 * 支持两层规则来源，按优先级合并：
 * <ol>
 *   <li><b>项目级</b>：{@code {workspace}/.hippo/rules/*.md} — 高优先级，跟随项目 Git 同步</li>
 *   <li><b>用户级</b>：{@code {HIPPO_ROOT}/rules/*.md} — 低优先级，全局兜底</li>
 * </ol>
 * 支持 Frontmatter 元数据定义规则行为模式：
 * <ul>
 *   <li>{@code mode=always} — 自动注入 system prompt（默认）</li>
 *   <li>{@code mode=manual} — 仅通过用户手动引用</li>
 * </ul>
 * 当项目级和用户级指向同一物理目录时自动去重（CLI 场景）。
 * 只扫描顶层目录，不递归子目录。
 * </p>
 */
public final class RuleLoader {

    private static final Logger logger = LoggerFactory.getLogger(RuleLoader.class);

    private RuleLoader() {
    }

    // ==================== 项目级规则 ====================

    /**
     * 扫描项目级规则目录：{@code {workspacePath}/.hippo/rules/*.md}。
     *
     * @param workspacePath 项目工作区路径，为 null 或空时返回空列表
     * @return 规则文件路径列表（按文件名排序）
     */
    public static List<Path> findProjectRuleFiles(String workspacePath) {
        if (workspacePath == null || workspacePath.isBlank()) {
            return Collections.emptyList();
        }
        Path rulesDir = Paths.get(workspacePath).toAbsolutePath().normalize()
                .resolve(".hippo").resolve("rules");
        return listMdFiles(rulesDir);
    }

    // ==================== 用户级全局规则 ====================

    /**
     * 扫描用户级全局规则目录：{@code {HIPPO_ROOT}/rules/*.md}。
     */
    public static List<Path> findUserRuleFiles() {
        return listMdFiles(WorkspaceManager.getUserRulesDir());
    }

    /**
     * @deprecated 改用 {@link #findUserRuleFiles()} 或
     * {@link #findProjectRuleFiles(String)}
     */
    @Deprecated
    public static List<Path> findAllRuleFiles() {
        return findUserRuleFiles();
    }

    // ==================== 按 mode 过滤的规则列表 ====================

    /**
     * 返回所有 {@code mode=always} 的规则文件列表（项目级 + 用户级，去重）。
     */
    public static List<Path> listAlwaysRuleFiles(String workspacePath) {
        return filterByMode(workspacePath, RuleMetadata.Mode.ALWAYS);
    }

    /**
     * 返回所有 {@code mode=manual} 的规则文件列表（项目级 + 用户级，去重）。
     */
    public static List<Path> listManualRuleFiles(String workspacePath) {
        return filterByMode(workspacePath, RuleMetadata.Mode.MANUAL);
    }

    /**
     * 获取完整的规则列表（含元数据），供前端 API 使用。
     */
    public static List<RuleInfo> getRuleList(String workspacePath) {
        List<RuleInfo> result = new ArrayList<>();

        // 项目级
        for (Path file : findProjectRuleFiles(workspacePath)) {
            result.add(toRuleInfo(file, "project"));
        }

        // 用户级（去重）
        Path projectRulesDir = getProjectRulesDir(workspacePath);
        Path userRulesDir = WorkspaceManager.getUserRulesDir();
        boolean sameDir = projectRulesDir.toAbsolutePath().normalize()
                .equals(userRulesDir.toAbsolutePath().normalize());
        if (!sameDir) {
            for (Path file : findUserRuleFiles()) {
                result.add(toRuleInfo(file, "user"));
            }
        }

        return result;
    }

    /**
     * 规则信息（给前端 API 的 DTO）。
     */
    public static class RuleInfo {
        private final String id;
        private final String name;
        private final String description;
        private final String mode;
        private final String source; // "project" or "user"

        public RuleInfo(String id, String name, String description, String mode, String source) {
            this.id = id;
            this.name = name;
            this.description = description;
            this.mode = mode;
            this.source = source;
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public String getDescription() { return description; }
        public String getMode() { return mode; }
        public String getSource() { return source; }
    }

    /**
     * 读取指定规则文件的完整内容（用于手动引用注入）。
     *
     * @param ruleId 规则 ID（即文件名不含 .md 后缀）
     * @param workspacePath 当前工作区路径
     * @return 规则文件的文本内容，文件不存在时返回 null
     */
    public static String readRuleContent(String ruleId, String workspacePath) {
        // 先找项目级
        if (workspacePath != null && !workspacePath.isBlank()) {
            Path projectFile = Paths.get(workspacePath).toAbsolutePath().normalize()
                    .resolve(".hippo").resolve("rules").resolve(ruleId + ".md");
            if (Files.exists(projectFile)) {
                return readFileSafe(projectFile);
            }
        }
        // 再找用户级
        Path userFile = WorkspaceManager.getUserRulesDir().resolve(ruleId + ".md");
        if (Files.exists(userFile)) {
            return readFileSafe(userFile);
        }
        return null;
    }

    // ==================== 始终生效规则加载（供 RuleManager 使用） ====================

    /**
     * 加载项目级始终生效规则内容（只包含 {@code mode=always} 的规则）。
     */
    public static String loadProjectRulesContent(String workspacePath) {
        if (workspacePath == null || workspacePath.isBlank()) {
            return "";
        }
        return loadDirContentFiltered(getProjectRulesDir(workspacePath), "项目规则",
                RuleMetadata.Mode.ALWAYS);
    }

    /**
     * 加载用户级全局始终生效规则内容（只包含 {@code mode=always} 的规则）。
     */
    public static String loadUserRulesContent() {
        return loadDirContentFiltered(WorkspaceManager.getUserRulesDir(), "全局规则",
                RuleMetadata.Mode.ALWAYS);
    }

    /**
     * 合并加载所有始终生效规则（项目级 + 用户级，去重）。
     */
    public static String loadCombinedRules() {
        return loadCombinedRules(null);
    }

    /**
     * 合并加载所有始终生效规则（项目级 + 用户级，去重）。
     */
    public static String loadCombinedRules(String workspacePath) {
        Path projectRulesDir = getProjectRulesDir(workspacePath);
        Path userRulesDir = WorkspaceManager.getUserRulesDir();

        boolean sameDir = projectRulesDir.toAbsolutePath().normalize()
                .equals(userRulesDir.toAbsolutePath().normalize());

        List<Path> projectFiles = listMdFiles(projectRulesDir);
        List<Path> userFiles = sameDir ? Collections.emptyList() : listMdFiles(userRulesDir);

        StringBuilder sb = new StringBuilder();
        for (Path file : projectFiles) {
            if (isMode(file, RuleMetadata.Mode.ALWAYS)) {
                appendFile(sb, file, "项目规则");
            }
        }
        for (Path file : userFiles) {
            if (isMode(file, RuleMetadata.Mode.ALWAYS)) {
                appendFile(sb, file, "全局规则");
            }
        }

        int count = projectFiles.size() + userFiles.size();
        if (count > 0) {
            logger.info("规则加载完成: 项目级 {} 个, 全局 {} 个",
                    projectFiles.size(), userFiles.size());
        }
        return sb.toString();
    }

    /**
     * 返回始终生效规则文件总数（项目级 + 用户级，去重后）。
     */
    public static int countRuleFiles(String workspacePath) {
        return listAlwaysRuleFiles(workspacePath).size();
    }

    /**
     * 返回用户级规则文件数量（仅始终生效）。
     */
    public static int countRuleFiles() {
        return filterByModeInDir(WorkspaceManager.getUserRulesDir(), RuleMetadata.Mode.ALWAYS).size();
    }

    // ==================== 创建规则 ====================

    /**
     * 创建规则文件的返回结果。
     */
    public static class CreateRuleResult {
        private final boolean success;
        private final String message;
        private final Path filePath;

        public CreateRuleResult(boolean success, String message, Path filePath) {
            this.success = success;
            this.message = message;
            this.filePath = filePath;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public Path getFilePath() { return filePath; }
    }

    /**
     * 校验规则名称是否合法（只允许字母、数字、连字符、下划线、点）。
     */
    private static final Pattern RULE_NAME_PATTERN = Pattern.compile("^[a-zA-Z0-9._-]+$");

    /**
     * 创建规则文件。
     *
     * @param ruleName      规则名称（不含 .md 后缀）
     * @param mode          规则模式（always / manual）
     * @param description   规则描述（可选，为空则使用 ruleName）
     * @param scope         scope 作用域（"project" 或 "user"）
     * @param content       规则正文内容（可选，为 null 则生成模板）
     * @param workspacePath 当前工作区路径（project scope 时需要）
     * @return 创建结果
     */
    public static CreateRuleResult createRuleFile(String ruleName, String mode,
                                                   String description, String scope,
                                                   String content, String workspacePath) {
        // 校验名称
        if (ruleName == null || ruleName.isBlank()) {
            return new CreateRuleResult(false, "规则名称不能为空", null);
        }
        if (!RULE_NAME_PATTERN.matcher(ruleName).matches()) {
            return new CreateRuleResult(false, "规则名称只允许字母、数字、连字符、下划线和点", null);
        }

        // 确定目标目录
        Path targetDir;
        if ("user".equalsIgnoreCase(scope)) {
            targetDir = WorkspaceManager.getUserRulesDir();
        } else {
            // 默认 project
            if (workspacePath == null || workspacePath.isBlank()) {
                return new CreateRuleResult(false, "当前没有打开的工作区，无法创建项目级规则", null);
            }
            targetDir = getProjectRulesDir(workspacePath);
            if (targetDir.toString().isEmpty()) {
                return new CreateRuleResult(false, "项目规则目录无效", null);
            }
        }

        // 确保目录存在
        try {
            Files.createDirectories(targetDir);
        } catch (IOException e) {
            logger.error("创建规则目录失败: {}", targetDir, e);
            return new CreateRuleResult(false, "创建目录失败: " + e.getMessage(), null);
        }

        // 检查文件是否已存在
        Path targetFile = targetDir.resolve(ruleName + ".md").normalize();
        if (Files.exists(targetFile)) {
            return new CreateRuleResult(false, "规则文件 '" + ruleName + ".md' 已存在", targetFile);
        }

        // 组装文件内容
        String effectiveDesc = (description != null && !description.isBlank()) ? description : ruleName;
        StringBuilder fileContent = new StringBuilder();
        fileContent.append("---\n");
        fileContent.append("mode: ").append(mode != null ? mode : "always").append("\n");
        fileContent.append("description: ").append(effectiveDesc).append("\n");
        fileContent.append("---\n\n");
        if (content != null && !content.isBlank()) {
            fileContent.append(content);
        } else {
            fileContent.append("# ").append(effectiveDesc).append("\n\n");
            fileContent.append("<!-- 在此撰写规则内容 -->\n");
        }

        // 写入文件
        try {
            Files.writeString(targetFile, fileContent.toString(), StandardOpenOption.CREATE_NEW);
            logger.info("创建规则文件: {}", targetFile);
            return new CreateRuleResult(true, "规则创建成功", targetFile);
        } catch (IOException e) {
            logger.error("写入规则文件失败: {}", targetFile, e);
            return new CreateRuleResult(false, "写入文件失败: " + e.getMessage(), null);
        }
    }

    // ==================== 内部方法 ====================

    private static List<Path> filterByMode(String workspacePath, RuleMetadata.Mode mode) {
        List<Path> result = new ArrayList<>();
        result.addAll(filterByModeInDir(getProjectRulesDir(workspacePath), mode));

        Path userDir = WorkspaceManager.getUserRulesDir();
        Path projectDir = getProjectRulesDir(workspacePath);
        boolean sameDir = projectDir.toAbsolutePath().normalize()
                .equals(userDir.toAbsolutePath().normalize());
        if (!sameDir) {
            result.addAll(filterByModeInDir(userDir, mode));
        }
        return result;
    }

    private static List<Path> filterByModeInDir(Path dir, RuleMetadata.Mode mode) {
        List<Path> all = listMdFiles(dir);
        List<Path> result = new ArrayList<>();
        for (Path file : all) {
            if (isMode(file, mode)) {
                result.add(file);
            }
        }
        return result;
    }

    private static boolean isMode(Path file, RuleMetadata.Mode expected) {
        String head = readHeadSafe(file);
        RuleMetadata meta = RuleMetadata.parse(head, file.getFileName().toString());
        return meta.getMode() == expected;
    }

    private static RuleInfo toRuleInfo(Path file, String source) {
        String head = readHeadSafe(file);
        String fileName = file.getFileName().toString();
        String id = fileName.endsWith(".md") ? fileName.substring(0, fileName.length() - 3) : fileName;
        RuleMetadata meta = RuleMetadata.parse(head, fileName);
        return new RuleInfo(id, fileName, meta.getDescription(), meta.getMode().getValue(), source);
    }

    /**
     * 读取文件前 4KB 用于 Frontmatter 解析。
     */
    private static String readHeadSafe(Path file) {
        try (Stream<String> lines = Files.lines(file)) {
            return lines.limit(20).collect(Collectors.joining("\n"));
        } catch (IOException e) {
            return "";
        }
    }

    private static String readFileSafe(Path file) {
        try {
            return Files.readString(file);
        } catch (IOException e) {
            logger.warn("读取规则文件失败: {}", file, e);
            return null;
        }
    }

    /**
     * 加载指定目录下所有指定 mode 的 .md 文件内容，合并为一个字符串。
     */
    private static String loadDirContentFiltered(Path dir, String source, RuleMetadata.Mode mode) {
        List<Path> files = listMdFiles(dir);
        if (files.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Path file : files) {
            if (isMode(file, mode)) {
                appendFile(sb, file, source);
            }
        }
        return sb.toString();
    }

    private static Path getProjectRulesDir(String workspacePath) {
        if (workspacePath == null || workspacePath.isBlank()) {
            return Paths.get("");
        }
        return Paths.get(workspacePath).toAbsolutePath().normalize()
                .resolve(".hippo").resolve("rules");
    }

    private static List<Path> listMdFiles(Path dir) {
        if (!Files.exists(dir) || !Files.isDirectory(dir)) {
            return Collections.emptyList();
        }
        try (Stream<Path> stream = Files.list(dir)) {
            return stream.filter(p -> p.getFileName().toString().endsWith(".md"))
                    .sorted()
                    .collect(Collectors.toList());
        } catch (IOException e) {
            logger.warn("扫描规则目录失败: {}", dir, e);
            return Collections.emptyList();
        }
    }

    private static void appendFile(StringBuilder sb, Path file, String source) {
        try {
            sb.append("<!-- ").append(source).append(": ").append(file.getFileName()).append(" -->\n");
            sb.append(Files.readString(file)).append("\n");
        } catch (IOException e) {
            logger.warn("读取规则文件失败: {}", file, e);
        }
    }
}
