package com.example.agent.tools;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.skill.SkillEntry;
import com.example.agent.domain.skill.SkillLoader;
import com.example.agent.domain.skill.SkillManager;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.MalformedInputException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 技能工具 — AI 通过此工具读取技能内容获取专业指导。
 * <p>
 * 技能清单（名称 + 描述）在会话创建时固化为 System Prompt 的「可用技能」段落，
 * AI 直接可见全部可用技能。工具描述保持静态，仅说明调用方式。
 * </p>
 * <p>
 * 两种调用形态：
 * <ul>
 *   <li>{@code skill(name)} — 返回技能正文（剥离 Frontmatter）；若为目录形态技能，
 *       同时返回附带资源清单。</li>
 *   <li>{@code skill(name, resource)} — 返回该资源的文本内容，用于渐进式披露
 *       （正文里指向 references/api.md 等，需要时再读）。路径严格限制在技能目录内。</li>
 * </ul>
 * </p>
 *
 * <pre>
 * 示例流程：
 * 1. 用户说"帮我审查这段代码"
 * 2. AI 从 System Prompt 的「可用技能」段落看到 "java-code-review — 审查 Java 代码中的常见问题"
 * 3. AI 调用 skill(name: "java-code-review")
 * 4. 工具返回技能正文；若正文提到 references/xxx.md，再调用
 *    skill(name: "java-code-review", resource: "references/xxx.md") 取细节
 * </pre>
 */
public class SkillTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(SkillTool.class);

    /** 单个资源文件可读入的大小上限（超出提示改用其他方式） */
    private static final long MAX_RESOURCE_BYTES = 1024 * 1024;

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
        // 技能清单（名称 + 描述）已固化为 System Prompt 的「可用技能」段落，
        // 因此这里不再内联清单，保持工具描述静态不变，避免切换工作区导致
        // tools 参数变化而破坏 LLM 服务端的前缀缓存。
        return "读取并应用技能内容。技能清单（含名称与简介）已在系统提示词的"
             + "「可用技能」段落中列出。当用户请求涉及其中某个技能领域时，"
             + "调用此工具并传入对应的技能名称（如 java-code-review）获取详细指导内容，"
             + "然后按照指导处理用户请求。"
             + "部分技能为目录形态，正文之外还带附带资源（如 references/、scripts/ 下的文件）；"
             + "调用后如返回「附带资源」清单，可在正文指向某个资源时再次调用本工具并传入 "
             + "resource 参数（填清单中的相对路径）按需读取，无需一次性全部读取。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "技能名称（如 java-code-review，即系统提示词「可用技能」段落中列出的名称）"
                    },
                    "resource": {
                        "type": "string",
                        "description": "可选。要读取的附带资源相对路径（如 references/api.md），取自上次调用返回的「附带资源」清单。不填则返回技能正文"
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
                    .map(s -> "  - " + s.getSkillId())
                    .collect(Collectors.joining("\n"));
            throw new ToolExecutionException(
                    "未找到技能 \"" + name + "\"。\n可用技能：\n" +
                    (available.isEmpty() ? "  （无可用技能）" : available));
        }

        String resource = null;
        if (arguments.has("resource") && !arguments.get("resource").isNull()) {
            resource = arguments.get("resource").asText().trim();
        }

        return resource == null || resource.isEmpty()
                ? readSkillBody(entry)
                : readResource(entry, resource);
    }

    /** 读取技能正文（剥离 Frontmatter），目录技能附带资源清单 */
    private String readSkillBody(SkillEntry entry) throws ToolExecutionException {
        String content = readText(Path.of(entry.getFilePath()), "读取技能文件失败");
        String body = SkillLoader.stripFrontmatter(content);

        StringBuilder result = new StringBuilder();
        result.append("技能: ").append(entry.getSkillId()).append("\n");
        result.append("─────────────────────────────────────────────────────────────\n");
        result.append(body);

        List<String> resources = SkillLoader.listResources(entry);
        if (!resources.isEmpty()) {
            result.append("\n\n附带资源（可用 skill(name=\"").append(entry.getSkillId())
                  .append("\", resource=\"<相对路径>\") 读取）：\n");
            for (String path : resources) {
                result.append("  ").append(path).append("\n");
            }
        }
        return result.toString();
    }

    /** 读取目录技能的单个附带资源（路径已由 SkillLoader 做越界校验） */
    private String readResource(SkillEntry entry, String relativePath) throws ToolExecutionException {
        Path target;
        try {
            target = SkillLoader.resolveResource(entry, relativePath);
        } catch (IllegalArgumentException e) {
            throw new ToolExecutionException(e.getMessage());
        }

        long size;
        try {
            size = Files.size(target);
        } catch (IOException e) {
            throw new ToolExecutionException("读取资源失败: " + relativePath);
        }
        if (size > MAX_RESOURCE_BYTES) {
            throw new ToolExecutionException("资源过大（" + (size / 1024) + "KB，上限 "
                    + (MAX_RESOURCE_BYTES / 1024) + "KB），请改用其他方式查看: " + relativePath);
        }

        String content = readText(target, "读取资源失败: " + relativePath);
        return "技能: " + entry.getSkillId() + "  资源: " + relativePath + "\n"
             + "─────────────────────────────────────────────────────────────\n"
             + content;
    }

    /** 以 UTF-8 读文本；二进制内容给出明确提示而非抛底层异常 */
    private String readText(Path file, String failureMessage) throws ToolExecutionException {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (MalformedInputException e) {
            throw new ToolExecutionException(failureMessage + "（疑似二进制文件，无法以文本读取）");
        } catch (IOException e) {
            logger.warn("{}: {}", failureMessage, file, e);
            throw new ToolExecutionException(failureMessage + ": " + file);
        }
    }
}