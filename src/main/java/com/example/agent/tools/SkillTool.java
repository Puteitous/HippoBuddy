package com.example.agent.tools;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.skill.SkillEntry;
import com.example.agent.domain.skill.SkillLoader;
import com.example.agent.domain.skill.SkillManager;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 技能工具 — AI 通过此工具主动读取技能文件获取专业指导。
 * <p>
 * 工具描述中动态列出所有可用技能（名称 + 描述），
 * AI 识别用户需求匹配某个技能后，调用此工具传入技能名称，
 * 工具返回技能文件完整内容（剥离 Frontmatter）。
 * </p>
 *
 * <pre>
 * 示例流程：
 * 1. 用户说"帮我审查这段代码"
 * 2. AI 看到工具描述中列出 "java-code-review.md — 审查 Java 代码中的常见问题"
 * 3. AI 调用 skill(name: "java-code-review")
 * 4. 工具返回技能正文，AI 按指导执行
 * </pre>
 */
public class SkillTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(SkillTool.class);

    private final SkillManager skillManager;

    public SkillTool() {
        this.skillManager = ServiceLocator.get(SkillManager.class);
    }

    @Override
    public String getName() {
        return "skill";
    }

    @Override
    public String getDescription() {
        List<SkillEntry> skills = skillManager.getSkills();
        if (skills.isEmpty()) {
            return "读取并应用技能文件。目前没有可用的技能文件。";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("读取并应用技能文件。当用户的问题涉及以下领域时，先调用此工具获取技能指导：\n\n");

        // 按来源分组
        List<SkillEntry> projectSkills = skills.stream()
                .filter(s -> "project".equals(s.getSource()))
                .collect(Collectors.toList());
        List<SkillEntry> userSkills = skills.stream()
                .filter(s -> "user".equals(s.getSource()))
                .collect(Collectors.toList());

        if (!projectSkills.isEmpty()) {
            sb.append("【项目技能】\n");
            for (SkillEntry skill : projectSkills) {
                appendSkillLine(sb, skill);
            }
            sb.append("\n");
        }

        if (!userSkills.isEmpty()) {
            sb.append("【用户技能】\n");
            for (SkillEntry skill : userSkills) {
                appendSkillLine(sb, skill);
            }
            sb.append("\n");
        }

        sb.append("使用方式：调用 skill 工具并传入对应的技能名称（文件名不含 .md 后缀）。");
        return sb.toString();
    }

    private static void appendSkillLine(StringBuilder sb, SkillEntry skill) {
        sb.append("- ").append(skill.getFileName());
        if (skill.getDescription() != null && !skill.getDescription().isBlank()) {
            sb.append(" — ").append(skill.getDescription());
        }
        sb.append("\n");
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "技能名称（文件名，不含 .md 后缀，如 java-code-review）"
                    }
                },
                "required": ["name"]
            }
            """;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (arguments == null || !arguments.has("name") || arguments.get("name").isNull()) {
            throw new ToolExecutionException("缺少必需参数: name");
        }

        String name = arguments.get("name").asText().trim();
        if (name.isEmpty()) {
            throw new ToolExecutionException("name 参数不能为空");
        }

        SkillEntry entry = skillManager.findByName(name);
        if (entry == null) {
            // 给 AI 提示可用技能
            String available = skillManager.getSkills().stream()
                    .map(s -> "  - " + s.getFileName())
                    .collect(Collectors.joining("\n"));
            throw new ToolExecutionException(
                    "未找到技能 \"" + name + "\"。\n可用技能：\n" +
                    (available.isEmpty() ? "  （无可用技能）" : available));
        }

        try {
            String content = Files.readString(Path.of(entry.getFilePath()));
            String body = SkillLoader.stripFrontmatter(content);

            StringBuilder result = new StringBuilder();
            result.append("技能: ").append(entry.getFileName()).append("\n");
            result.append("─────────────────────────────────────────────────────────────\n");
            result.append(body);
            return result.toString();
        } catch (IOException e) {
            logger.warn("读取技能文件失败: {}", entry.getFilePath(), e);
            throw new ToolExecutionException("读取技能文件失败: " + entry.getFilePath());
        }
    }
}
