package com.example.agent.domain.skill;

import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 技能管理器 — 加载技能列表并注入 System Prompt。
 * <p>
 * 职责：加载项目级 {@code {workspace}/.hippo/skills/*.md}
 * 和用户级 {@code {HIPPO_ROOT}/skills/*.md} 技能文件，
 * 在 System Prompt 末尾注入技能目录供 AI 主动读取。
 * 数据懒加载，首次调用 {@link #enhanceSystemPrompt(String)} 时从磁盘扫描。
 * </p>
 * <p>
 * 注入示例：
 * <pre>
 * === 可用技能 ===
 * 项目技能: file:///path/to/project/.hippo/skills/
 * - java-review.md — 审查 Java 代码中的常见问题
 *
 * 用户技能: file:///C:/Users/user/.hippo/skills/
 * - git-workflow.md — 团队 Git 协作规范
 *
 * 当用户的问题涉及上述领域时，先读取对应的技能文件再回答。
 * </pre>
 * </p>
 */
public class SkillManager {

    private static final Logger logger = LoggerFactory.getLogger(SkillManager.class);

    private volatile List<SkillEntry> cachedSkills;
    private volatile String cachedPromptSnippet;
    private volatile String lastWorkspacePath;

    public SkillManager() {
        this.cachedSkills = null;
        this.cachedPromptSnippet = null;
        this.lastWorkspacePath = null;
    }

    /**
     * 将技能目录追加到 System Prompt 末尾。
     * 技能数据懒加载，首次调用时从磁盘扫描。
     * 工作区切换时自动失效缓存。
     *
     * @param baseSystemPrompt 原始或已被 RuleManager 增强的 System Prompt
     * @return 追加了技能目录后的 System Prompt，无技能时返回原始内容
     */
    public String enhanceSystemPrompt(String baseSystemPrompt) {
        if (baseSystemPrompt == null) {
            return null;
        }

        String currentWorkspacePath = WorkspaceContext.getCurrentFolder();

        // 工作区切换时缓存失效
        if (cachedSkills != null && !Objects.equals(lastWorkspacePath, currentWorkspacePath)) {
            logger.debug("工作区路径变化，技能缓存失效");
            cachedSkills = null;
            cachedPromptSnippet = null;
        }

        if (cachedSkills == null) {
            reload(currentWorkspacePath);
        }

        if (cachedSkills.isEmpty()) {
            return baseSystemPrompt;
        }

        return baseSystemPrompt + "\n\n" + cachedPromptSnippet;
    }

    /**
     * 重新加载技能列表（热重载）。
     */
    public void reload() {
        reload(WorkspaceContext.getCurrentFolder());
    }

    private void reload(String workspacePath) {
        this.cachedSkills = SkillLoader.loadAllSkills(workspacePath);
        this.cachedPromptSnippet = buildPromptSnippet(cachedSkills, workspacePath);
        this.lastWorkspacePath = workspacePath;
        long projectCount = cachedSkills.stream().filter(s -> "project".equals(s.getSource())).count();
        long userCount = cachedSkills.stream().filter(s -> "user".equals(s.getSource())).count();
        logger.info("技能加载完成: 项目级 {} 个, 用户级 {} 个", projectCount, userCount);
    }

    /**
     * 获取当前技能列表。
     *
     * @return 技能列表（可能为空）
     */
    public List<SkillEntry> getSkills() {
        if (cachedSkills == null) {
            reload();
        }
        return cachedSkills;
    }

    /**
     * 构建要注入到 prompt 中的技能目录文本。
     * 按来源分组展示，项目级在前，用户级在后。
     */
    private static String buildPromptSnippet(List<SkillEntry> skills, String workspacePath) {
        if (skills.isEmpty()) {
            return "";
        }

        List<SkillEntry> projectSkills = skills.stream()
                .filter(s -> "project".equals(s.getSource()))
                .collect(Collectors.toList());
        List<SkillEntry> userSkills = skills.stream()
                .filter(s -> "user".equals(s.getSource()))
                .collect(Collectors.toList());

        StringBuilder sb = new StringBuilder();
        sb.append("=== 可用技能 ===\n");

        // 项目级
        if (!projectSkills.isEmpty()) {
            String projectDirUri = getDirUri(workspacePath, ".hippo/skills");
            sb.append("项目技能: ").append(projectDirUri).append("/\n");
            for (SkillEntry skill : projectSkills) {
                appendSkillLine(sb, skill);
            }
            sb.append("\n");
        }

        // 用户级
        if (!userSkills.isEmpty()) {
            Path userDir = WorkspaceManager.getUserSkillsDir();
            String userDirUri = "file:///" + userDir.toAbsolutePath().normalize().toString().replace("\\", "/");
            sb.append("用户技能: ").append(userDirUri).append("/\n");
            for (SkillEntry skill : userSkills) {
                appendSkillLine(sb, skill);
            }
            sb.append("\n");
        }

        sb.append("当用户的问题涉及上述领域时，先读取对应的技能文件再回答。");

        return sb.toString();
    }

    private static void appendSkillLine(StringBuilder sb, SkillEntry skill) {
        sb.append("- ").append(skill.getFileName());
        if (skill.getDescription() != null && !skill.getDescription().isBlank()) {
            sb.append(" — ").append(skill.getDescription());
        }
        sb.append("\n");
    }

    private static String getDirUri(String workspacePath, String subPath) {
        if (workspacePath == null || workspacePath.isBlank()) {
            return "";
        }
        return "file:///" + Path.of(workspacePath).toAbsolutePath().normalize()
                .resolve(subPath).toString().replace("\\", "/");
    }
}
