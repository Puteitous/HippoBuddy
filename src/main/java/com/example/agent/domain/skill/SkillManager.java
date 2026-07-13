package com.example.agent.domain.skill;

import com.example.agent.desktop.WorkspaceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Objects;

/**
 * 技能管理器 — 加载技能列表并提供查询。
 * <p>
 * 职责：加载项目级 {@code {workspace}/.hippo/skills/*.md}
 * 和用户级 {@code {HIPPO_ROOT}/skills/*.md} 技能文件。
 * 数据懒加载，首次调用 {@link #getSkills()} 时从磁盘扫描。
 * </p>
 * <p>
 * 技能不再直接注入 System Prompt，而是通过 {@code SkillTool} 供 AI 主动调用。
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
}
