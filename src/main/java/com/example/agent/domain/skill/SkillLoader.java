package com.example.agent.domain.skill;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 技能加载器 — 从项目级和用户级目录加载并解析技能。
 * <p>
 * 技能来源（两层，按优先级合并）：
 * <ol>
 *   <li>{@code {workspace}/.hippo/skills/} — 项目级（高优先级）</li>
 *   <li>{@code {HIPPO_ROOT}/skills/} — 用户级（低优先级，兜底）</li>
 * </ol>
 * 同 {@code skillId} 项目级覆盖用户级（去重）。
 * </p>
 * <p>
 * 技能目录下支持两种形态（只扫一层，不递归）：
 * <ul>
 *   <li><b>扁平</b>：单个 {@code <name>.md} → skillId = 文件名去 {@code .md}</li>
 *   <li><b>目录</b>：{@code <name>/SKILL.md} → skillId = 目录名，同目录资源由
 *       {@link #listResources}/{@link #resolveResource} 按需取用</li>
 * </ul>
 * </p>
 * <p>
 * 技能文件格式（支持可选的 YAML Frontmatter）：
 * <pre>
 * ---
 * name: Java 代码审查
 * description: 审查 Java 代码中的常见问题
 * ---
 * 技能正文内容...
 * </pre>
 * 没有 Frontmatter 时使用 skillId 作为 name，description 为空。
 * </p>
 */
public final class SkillLoader {

    private static final Logger logger = LoggerFactory.getLogger(SkillLoader.class);

    /** 目录形态技能的入口文件名 */
    public static final String ENTRY_FILE_NAME = "SKILL.md";

    /** 资源清单最多列出多少条（防止超大技能目录刷爆上下文） */
    private static final int MAX_RESOURCE_LIST = 100;

    private SkillLoader() {
    }

    /** 目录形态技能的一个候选项：入口文件 + 技能根目录（扁平形态为 null） */
    private record Candidate(Path entryFile, Path rootDir, String skillId) {
    }

    // ==================== 项目级技能 ====================

    /**
     * 扫描项目级技能目录 {@code {workspacePath}/.hippo/skills/}，返回各技能的<b>入口文件</b>路径。
     * <p>
     * 扁平技能即其 {@code .md} 文件；目录技能为 {@code <dir>/SKILL.md}。
     *
     * @param workspacePath 项目工作区路径，为 null 或空时返回空列表
     */
    public static List<Path> findProjectSkillFiles(String workspacePath) {
        Path dir = projectSkillsDir(workspacePath);
        if (dir == null) {
            return Collections.emptyList();
        }
        return scanCandidates(dir).stream().map(Candidate::entryFile).collect(Collectors.toList());
    }

    /**
     * 加载项目级技能（解析为 {@link SkillEntry}）。
     */
    public static List<SkillEntry> loadProjectSkills(String workspacePath) {
        Path dir = projectSkillsDir(workspacePath);
        if (dir == null) {
            return Collections.emptyList();
        }
        return toEntries(scanCandidates(dir), "project");
    }

    // ==================== 用户级全局技能 ====================

    /**
     * 扫描用户级技能目录 {@code {HIPPO_ROOT}/skills/}，返回各技能的入口文件路径。
     */
    public static List<Path> findUserSkillFiles() {
        return scanCandidates(WorkspaceManager.getUserSkillsDir()).stream()
                .map(Candidate::entryFile)
                .collect(Collectors.toList());
    }

    /**
     * 加载用户级技能（解析为 {@link SkillEntry}）。
     */
    public static List<SkillEntry> loadUserSkills() {
        return toEntries(scanCandidates(WorkspaceManager.getUserSkillsDir()), "user");
    }

    // ==================== 合并加载（去重） ====================

    /**
     * 合并加载所有技能（项目级 + 用户级，去重）。
     * <p>
     * 同 {@code skillId} 项目级覆盖用户级。
     * </p>
     *
     * @param workspacePath 当前工作区路径，为 null 时只加载用户级
     * @return 合并后的技能列表（按 skillId 不区分大小写排序）
     */
    public static List<SkillEntry> loadAllSkills(String workspacePath) {
        List<SkillEntry> projectSkills = loadProjectSkills(workspacePath);
        List<SkillEntry> userSkills = loadUserSkills();

        // 以 skillId 为 key 去重，项目级优先
        Map<String, SkillEntry> merged = new HashMap<>();
        for (SkillEntry entry : userSkills) {
            merged.put(entry.getSkillId(), entry);
        }
        for (SkillEntry entry : projectSkills) {
            merged.put(entry.getSkillId(), entry); // 项目级覆盖
        }

        List<SkillEntry> result = new ArrayList<>(merged.values());
        result.sort((a, b) -> a.getSkillId().compareToIgnoreCase(b.getSkillId()));
        return result;
    }

    /**
     * 仅加载用户级技能（无项目级），兼容旧调用方。
     */
    public static List<SkillEntry> loadAllSkills() {
        return loadUserSkills();
    }

    // ==================== 目录技能资源 ====================

    /**
     * 列出目录技能附带资源的相对路径（递归，不含入口文件本身），按路径排序。
     * <p>
     * 扁平形态技能无资源，返回空列表。清单超过 {@link #MAX_RESOURCE_LIST} 条时截断。
     *
     * @param entry 技能条目
     * @return 相对技能根目录的资源路径列表
     */
    public static List<String> listResources(SkillEntry entry) {
        if (entry == null || !entry.isDirectorySkill()) {
            return Collections.emptyList();
        }
        Path root = Path.of(entry.getRootDir()).toAbsolutePath().normalize();
        Path entryFile = Path.of(entry.getFilePath()).toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            return Collections.emptyList();
        }

        List<String> resources = new ArrayList<>();
        try (Stream<Path> stream = Files.walk(root)) {
            for (Path p : stream.sorted().collect(Collectors.toList())) {
                if (resources.size() >= MAX_RESOURCE_LIST) {
                    break;
                }
                if (!Files.isRegularFile(p) || p.toAbsolutePath().normalize().equals(entryFile)) {
                    continue;
                }
                resources.add(root.relativize(p).toString().replace('\\', '/'));
            }
        } catch (IOException e) {
            logger.warn("列出技能资源失败: {}", root, e);
            return Collections.emptyList();
        }
        return resources;
    }

    /**
     * 把资源相对路径解析为实际文件路径，并做越界校验。
     * <p>
     * 约束：必须为相对路径、不得越出技能根目录、不得指向入口文件本身。
     *
     * @param entry        技能条目
     * @param relativePath 资源相对路径（如 {@code references/api.md}）
     * @return 校验通过的资源绝对路径
     * @throws IllegalArgumentException 非目录技能、路径非法、越界或资源不存在
     */
    public static Path resolveResource(SkillEntry entry, String relativePath) {
        if (entry == null || !entry.isDirectorySkill()) {
            throw new IllegalArgumentException("该技能不是目录形态，没有附带资源");
        }
        if (relativePath == null || relativePath.isBlank()) {
            throw new IllegalArgumentException("resource 参数不能为空");
        }
        Path rel = Path.of(relativePath.trim());
        if (rel.isAbsolute()) {
            throw new IllegalArgumentException("resource 必须是相对技能目录的路径");
        }
        Path root = Path.of(entry.getRootDir()).toAbsolutePath().normalize();
        Path target = root.resolve(rel).normalize();
        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("resource 路径越界: " + relativePath);
        }
        if (target.equals(Path.of(entry.getFilePath()).toAbsolutePath().normalize())) {
            throw new IllegalArgumentException("请直接调用 skill(不带 resource) 读取技能正文");
        }
        if (!Files.exists(target) || !Files.isRegularFile(target)) {
            throw new IllegalArgumentException("资源不存在: " + relativePath);
        }
        return target;
    }

    // ==================== 内部方法 ====================

    /** 项目级技能目录；工作区为空时返回 null */
    private static Path projectSkillsDir(String workspacePath) {
        if (workspacePath == null || workspacePath.isBlank()) {
            return null;
        }
        return Path.of(workspacePath).toAbsolutePath().normalize()
                .resolve(".hippo").resolve("skills");
    }

    /**
     * 扫描技能目录（只扫一层），识别扁平 {@code .md} 与目录形态 {@code <dir>/SKILL.md}。
     * 目录不存在或读取失败时返回空列表。
     */
    private static List<Candidate> scanCandidates(Path dir) {
        if (dir == null || !Files.exists(dir) || !Files.isDirectory(dir)) {
            return Collections.emptyList();
        }
        List<Candidate> candidates = new ArrayList<>();
        try (Stream<Path> stream = Files.list(dir)) {
            for (Path child : stream.sorted().collect(Collectors.toList())) {
                String name = child.getFileName().toString();
                if (Files.isRegularFile(child) && name.endsWith(".md")) {
                    candidates.add(new Candidate(child, null, name.substring(0, name.length() - 3)));
                } else if (Files.isDirectory(child) && Files.exists(child.resolve(ENTRY_FILE_NAME))) {
                    candidates.add(new Candidate(child.resolve(ENTRY_FILE_NAME), child, name));
                }
            }
        } catch (IOException e) {
            logger.warn("扫描技能目录失败: {}", dir, e);
            return Collections.emptyList();
        }
        return candidates;
    }

    private static List<SkillEntry> toEntries(List<Candidate> candidates, String source) {
        List<SkillEntry> skills = new ArrayList<>();
        for (Candidate candidate : candidates) {
            SkillEntry entry = parseSkillFile(candidate, source);
            if (entry != null) {
                skills.add(entry);
            }
        }
        return skills;
    }

    /**
     * 解析单个技能条目（入口文件）。
     *
     * @param candidate 候选项（入口文件 + 技能根目录 + skillId）
     * @param source    来源（"project" 或 "user"）
     */
    private static SkillEntry parseSkillFile(Candidate candidate, String source) {
        Path file = candidate.entryFile();
        try {
            String content = Files.readString(file);
            String fileName = file.getFileName().toString();

            // 读取前几行用于 Frontmatter 解析
            String head = content.lines().limit(20).collect(Collectors.joining("\n"));

            // 默认 name 取 skillId（扁平=文件名去后缀，目录=目录名）
            String name = candidate.skillId();
            String description = "";

            // 解析 Frontmatter（如果有）
            if (head.startsWith("---\n") || head.startsWith("---\r\n")) {
                int endIndex = findFrontmatterEnd(head);
                if (endIndex > 0) {
                    // 空 Frontmatter（如 "---\n---\n正文"）时 endIndex <= 4，
                    // 此时 yamlBlock 为空字符串，跳过字段解析（避免 substring 越界）
                    String yamlBlock = endIndex > 4 ? head.substring(4, endIndex) : "";
                    String[] lines = yamlBlock.split("\\r?\\n");
                    for (String line : lines) {
                        int colonIdx = line.indexOf(':');
                        if (colonIdx > 0) {
                            String key = line.substring(0, colonIdx).trim();
                            String value = line.substring(colonIdx + 1).trim();
                            if (key.equals("name")) {
                                name = value;
                            } else if (key.equals("description")) {
                                description = value;
                            }
                        }
                    }
                }
            }

            String rootDir = candidate.rootDir() == null
                    ? null
                    : candidate.rootDir().toAbsolutePath().normalize().toString();
            return new SkillEntry(candidate.skillId(), name, description, fileName,
                    file.toAbsolutePath().normalize().toString(), source, rootDir);
        } catch (IOException e) {
            logger.warn("读取技能文件失败: {}", file, e);
            return null;
        }
    }

    /**
     * 查找 Frontmatter 结束位置（第二个 {@code ---}）。
     */
    private static int findFrontmatterEnd(String content) {
        int searchFrom = 3;
        int idx = content.indexOf("\n---", searchFrom);
        if (idx < 0) {
            idx = content.indexOf("\r\n---", searchFrom);
        }
        return idx;
    }

    /**
     * 从技能文件内容中剥离 Frontmatter，只返回正文。
     * 如果没有 Frontmatter，原样返回。
     *
     * @param content 完整的技能文件内容（可能含 Frontmatter）
     * @return 剥离 Frontmatter 后的正文
     */
    public static String stripFrontmatter(String content) {
        if (content == null || content.isBlank()) {
            return "";
        }
        if (content.startsWith("---\n") || content.startsWith("---\r\n")) {
            int searchFrom = 3;
            int endIdx = content.indexOf("\n---", searchFrom);
            if (endIdx < 0) {
                endIdx = content.indexOf("\r\n---", searchFrom);
            }
            if (endIdx > 0) {
                int bodyStart = endIdx + 4;
                if (bodyStart < content.length() && content.charAt(bodyStart) == '\n') {
                    bodyStart++;
                } else if (bodyStart + 1 < content.length()
                        && content.charAt(bodyStart) == '\r'
                        && content.charAt(bodyStart + 1) == '\n') {
                    bodyStart += 2;
                }
                return content.substring(bodyStart);
            }
        }
        return content;
    }
}