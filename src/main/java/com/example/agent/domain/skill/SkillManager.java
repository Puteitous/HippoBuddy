package com.example.agent.domain.skill;

import com.example.agent.desktop.WorkspaceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 技能管理器 — 加载技能列表并提供查询。
 * <p>
 * 职责：加载项目级 {@code {workspace}/.hippo/skills/*.md}
 * 和用户级 {@code {HIPPO_ROOT}/skills/*.md} 技能文件。
 * 数据懒加载，首次调用 {@link #getSkills()} 时从磁盘扫描。
 * </p>
 * <p>
 * 技能清单在会话创建时拍快照固化进 System Prompt（见
 * {@link #buildSystemPromptSnippet()}），切换工作区不改变已有会话的清单，
 * 只有新建会话才会拼入新清单。技能正文仍通过 {@code SkillTool} 供 AI 按需读取。
 * </p>
 */
public class SkillManager {

    private static final Logger logger = LoggerFactory.getLogger(SkillManager.class);

    private volatile List<SkillEntry> cachedSkills;
    private volatile String lastWorkspacePath;

    public SkillManager() {
        this.cachedSkills = null;
        this.lastWorkspacePath = null;
    }

    /**
     * 获取当前技能列表。
     * 技能数据懒加载，首次调用时从磁盘扫描。
     * 工作区切换时自动失效缓存。
     *
     * @return 技能列表（可能为空）
     */
    public List<SkillEntry> getSkills() {
        String currentWorkspacePath = WorkspaceContext.getCurrentFolder();

        // 工作区切换时缓存失效
        if (cachedSkills != null && !Objects.equals(lastWorkspacePath, currentWorkspacePath)) {
            logger.debug("工作区路径变化，技能缓存失效");
            cachedSkills = null;
        }

        if (cachedSkills == null) {
            reload(currentWorkspacePath);
        }

        return cachedSkills;
    }

    /**
     * 按技能名称（文件名，不含 {@code .md}）查找技能。
     *
     * @param name 技能名称（文件名不含 .md，或 Frontmatter 中的 name 字段）
     * @return 匹配的 SkillEntry，未找到返回 null
     */
    public SkillEntry findByName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        String fileName = name.endsWith(".md") ? name : name + ".md";
        return getSkills().stream()
                .filter(s -> s.getFileName().equals(fileName)
                        || s.getName().equals(name))
                .findFirst()
                .orElse(null);
    }

    /**
     * 重新加载技能列表（热重载）。
     */
    public void reload() {
        reload(WorkspaceContext.getCurrentFolder());
    }

    private void reload(String workspacePath) {
        this.cachedSkills = SkillLoader.loadAllSkills(workspacePath);
        this.lastWorkspacePath = workspacePath;
        long projectCount = cachedSkills.stream().filter(s -> "project".equals(s.getSource())).count();
        long userCount = cachedSkills.stream().filter(s -> "user".equals(s.getSource())).count();
        logger.info("技能加载完成: 项目级 {} 个, 用户级 {} 个", projectCount, userCount);
    }

    /**
     * 生成技能清单段落，供 System Prompt 在会话创建时固化注入。
     * <p>
     * 输出格式（与 {@code SkillTool} 原有工具描述保持一致的分组风格）：
     * <pre>
     * ## 可用技能
     * 以下技能文件提供特定领域的专业指导，当用户请求涉及以下领域时，
     * 调用 skill 工具获取详细内容：
     *
     * 【项目技能】
     * - 文件名 — 描述
     *
     * 【用户技能】
     * - 文件名 — 描述
     *
     * 使用方式：调用 skill 工具并传入对应的技能名称（文件名不含 .md 后缀）。
     * </pre>
     * 技能清单为空时返回空字符串（调用方应跳过注入）。
     * </p>
     *
     * @return 以 {@code \n\n} 开头的 Markdown 段落，无技能时返回空字符串
     */
    public String buildSystemPromptSnippet() {
        List<SkillEntry> skills = getSkills();
        if (skills == null || skills.isEmpty()) {
            return "";
        }

        List<SkillEntry> projectSkills = skills.stream()
                .filter(s -> "project".equals(s.getSource()))
                .collect(Collectors.toList());
        List<SkillEntry> userSkills = skills.stream()
                .filter(s -> "user".equals(s.getSource()))
                .collect(Collectors.toList());

        StringBuilder sb = new StringBuilder();
        sb.append("\n\n## 可用技能\n");
        sb.append("以下技能文件提供特定领域的专业指导，当用户请求涉及以下领域时，")
           .append("调用 skill 工具获取详细内容：\n");

        if (!projectSkills.isEmpty()) {
            sb.append("\n【项目技能】\n");
            for (SkillEntry skill : projectSkills) {
                sb.append("- ").append(skill.getFileName());
                if (skill.getDescription() != null && !skill.getDescription().isBlank()) {
                    sb.append(" — ").append(skill.getDescription());
                }
                sb.append("\n");
            }
        }

        if (!userSkills.isEmpty()) {
            sb.append("\n【用户技能】\n");
            for (SkillEntry skill : userSkills) {
                sb.append("- ").append(skill.getFileName());
                if (skill.getDescription() != null && !skill.getDescription().isBlank()) {
                    sb.append(" — ").append(skill.getDescription());
                }
                sb.append("\n");
            }
        }

        sb.append("\n使用方式：调用 skill 工具并传入对应的技能名称（文件名不含 .md 后缀）。");
        return sb.toString();
    }
}
