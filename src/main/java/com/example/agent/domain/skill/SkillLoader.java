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
 * 技能加载器 — 从项目级和用户级目录加载并解析技能文件。
 * <p>
 * 技能来源（两层，按优先级合并）：
 * <ol>
 *   <li>{@code {workspace}/.hippo/skills/*.md} — 项目级（高优先级）</li>
 *   <li>{@code {HIPPO_ROOT}/skills/*.md} — 用户级（低优先级，兜底）</li>
 * </ol>
 * 同名文件项目级覆盖用户级（去重）。
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
 * 没有 Frontmatter 时使用文件名作为 name，description 为空。
 * </p>
 */
public final class SkillLoader {

    private static final Logger logger = LoggerFactory.getLogger(SkillLoader.class);

    private SkillLoader() {
    }

    // ==================== 项目级技能 ====================

    /**
     * 扫描项目级技能目录：{@code {workspacePath}/.hippo/skills/*.md}。
     *
     * @param workspacePath 项目工作区路径，为 null 或空时返回空列表
     * @return 技能文件路径列表（按文件名排序）
     */
    public static List<Path> findProjectSkillFiles(String workspacePath) {
        if (workspacePath == null || workspacePath.isBlank()) {
            return Collections.emptyList();
        }
        Path skillsDir = Path.of(workspacePath).toAbsolutePath().normalize()
                .resolve(".hippo").resolve("skills");
        return listMdFiles(skillsDir);
    }

    /**
     * 加载项目级技能（解析为 {@link SkillEntry}）。
     */
    public static List<SkillEntry> loadProjectSkills(String workspacePath) {
        List<Path> files = findProjectSkillFiles(workspacePath);
        List<SkillEntry> skills = new ArrayList<>();
        for (Path file : files) {
            SkillEntry entry = parseSkillFile(file, "project");
            if (entry != null) {
                skills.add(entry);
            }
        }
        return skills;
    }

    // ==================== 用户级全局技能 ====================

    /**
     * 扫描用户级技能目录：{@code {HIPPO_ROOT}/skills/*.md}。
     */
    public static List<Path> findUserSkillFiles() {
        return listMdFiles(WorkspaceManager.getUserSkillsDir());
    }

    /**
     * 加载用户级技能（解析为 {@link SkillEntry}）。
     */
    public static List<SkillEntry> loadUserSkills() {
        List<Path> files = findUserSkillFiles();
        List<SkillEntry> skills = new ArrayList<>();
        for (Path file : files) {
            SkillEntry entry = parseSkillFile(file, "user");
            if (entry != null) {
                skills.add(entry);
            }
        }
        return skills;
    }

    // ==================== 合并加载（去重） ====================

    /**
     * 合并加载所有技能（项目级 + 用户级，去重）。
     * <p>
     * 同名文件项目级覆盖用户级。
     * </p>
     *
     * @param workspacePath 当前工作区路径，为 null 时只加载用户级
     * @return 合并后的技能列表
     */
    public static List<SkillEntry> loadAllSkills(String workspacePath) {
        List<SkillEntry> projectSkills = loadProjectSkills(workspacePath);
        List<SkillEntry> userSkills = loadUserSkills();

        // 以文件名为 key 去重，项目级优先
        Map<String, SkillEntry> merged = new HashMap<>();
        for (SkillEntry entry : userSkills) {
            merged.put(entry.getFileName(), entry);
        }
        for (SkillEntry entry : projectSkills) {
            merged.put(entry.getFileName(), entry); // 项目级覆盖
        }

        List<SkillEntry> result = new ArrayList<>(merged.values());
        result.sort((a, b) -> a.getFileName().compareToIgnoreCase(b.getFileName()));
        return result;
    }

    /**
     * 仅加载用户级技能（无项目级），兼容旧调用方。
     */
    public static List<SkillEntry> loadAllSkills() {
        return loadUserSkills();
    }

    // ==================== 内部方法 ====================

    /**
     * 解析单个技能文件。
     *
     * @param file   技能文件路径
     * @param source 来源（"project" 或 "user"）
     */
    private static SkillEntry parseSkillFile(Path file, String source) {
        try {
            String content = Files.readString(file);
            String fileName = file.getFileName().toString();

            // 读取前几行用于 Frontmatter 解析
            String head = content.lines().limit(20).collect(Collectors.joining("\n"));

            String name = fileName.endsWith(".md")
                    ? fileName.substring(0, fileName.length() - 3)
                    : fileName;
            String description = "";

            // 解析 Frontmatter（如果有）
            if (head.startsWith("---\n") || head.startsWith("---\r\n")) {
                int endIndex = findFrontmatterEnd(head);
                if (endIndex > 0) {
                    String yamlBlock = head.substring(4, endIndex);
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

            return new SkillEntry(name, description, fileName, file.toAbsolutePath().toString(), source);
        } catch (IOException e) {
            logger.warn("读取技能文件失败: {}", file, e);
            return null;
        }
    }

    /**
     * 列出目录下的所有 {@code .md} 文件（不递归）。
     */
    private static List<Path> listMdFiles(Path dir) {
        if (!Files.exists(dir) || !Files.isDirectory(dir)) {
            return Collections.emptyList();
        }
        try (Stream<Path> stream = Files.list(dir)) {
            return stream.filter(p -> p.getFileName().toString().endsWith(".md"))
                    .sorted()
                    .collect(Collectors.toList());
        } catch (IOException e) {
            logger.warn("扫描技能目录失败: {}", dir, e);
            return Collections.emptyList();
        }
    }

    /**
     * 查找 Frontmatter 结束位置（第二个 {@code ---}）。
     */
    private static int findFrontmatterEnd(String content) {
        int searchFrom = content.startsWith("---\r\n") ? 5 : 4;
        int idx = content.indexOf("\n---", searchFrom);
        if (idx < 0) {
            idx = content.indexOf("\r\n---", searchFrom);
        }
        return idx;
    }
}
