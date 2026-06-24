package com.example.agent.domain.rule;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 规则文件元数据，从 Frontmatter 解析。
 * <p>
 * 规则文件可选的 YAML Frontmatter 格式：
 * <pre>
 * ---
 * mode: manual
 * description: Spring Boot API 设计规范
 * ---
 * </pre>
 * 没有 Frontmatter 或解析失败时使用默认值 {@code mode=always, description=文件名}。
 * </p>
 */
public class RuleMetadata {

    private static final Logger logger = LoggerFactory.getLogger(RuleMetadata.class);

    /** 规则模式：始终注入、手动引用、自动匹配（预留） */
    public enum Mode {
        ALWAYS("always"),
        MANUAL("manual"),
        AUTO("auto");

        private final String value;

        Mode(String value) {
            this.value = value;
        }

        public String getValue() {
            return value;
        }

        public static Mode fromString(String s) {
            if (s == null) return ALWAYS;
            return switch (s.trim().toLowerCase()) {
                case "manual" -> MANUAL;
                case "auto" -> AUTO;
                default -> ALWAYS;
            };
        }
    }

    private final Mode mode;
    private final String description;

    public RuleMetadata(Mode mode, String description) {
        this.mode = mode;
        this.description = description;
    }

    public Mode getMode() {
        return mode;
    }

    public String getDescription() {
        return description;
    }

    /**
     * 从文件内容解析 Frontmatter 元数据。
     *
     * @param content   文件内容（可能是文件的前几 KB，不必全部读入）
     * @param fallbackDesc 解析失败时的描述兜底
     * @return 解析后的元数据，解析失败返回默认值 {@code mode=always}
     */
    public static RuleMetadata parse(String content, String fallbackDesc) {
        if (content == null || content.isBlank()) {
            return new RuleMetadata(Mode.ALWAYS, fallbackDesc);
        }

        try {
            // 必须以前三字符 ---\n 开头
            if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
                return new RuleMetadata(Mode.ALWAYS, fallbackDesc);
            }

            int endIndex = findFrontmatterEnd(content);
            if (endIndex < 0) {
                return new RuleMetadata(Mode.ALWAYS, fallbackDesc);
            }

            String yamlBlock = content.substring(4, endIndex); // 跳过 "---\n"
            Map<String, String> fields = parseSimpleYaml(yamlBlock);

            Mode mode = Mode.fromString(fields.get("mode"));
            String description = fields.getOrDefault("description", fallbackDesc);

            return new RuleMetadata(mode, description);
        } catch (Exception e) {
            logger.debug("解析规则 Frontmatter 失败，使用默认值: {}", fallbackDesc);
            return new RuleMetadata(Mode.ALWAYS, fallbackDesc);
        }
    }

    /**
     * 查找 Frontmatter 结束位置（第二个 ---）。
     */
    private static int findFrontmatterEnd(String content) {
        // 从第二行开始找
        int searchFrom = content.startsWith("---\r\n") ? 5 : 4;
        int idx = content.indexOf("\n---", searchFrom);
        if (idx < 0) {
            idx = content.indexOf("\r\n---", searchFrom);
        }
        return idx;
    }

    /**
     * 极简 YAML key: value 解析器，只处理单行键值对。
     * 不支持列表、嵌套、多行值。
     */
    private static Map<String, String> parseSimpleYaml(String yamlBlock) {
        Map<String, String> result = new LinkedHashMap<>();
        String[] lines = yamlBlock.split("\\r?\\n");
        for (String line : lines) {
            int colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
                String key = line.substring(0, colonIdx).trim();
                String value = line.substring(colonIdx + 1).trim();
                if (!key.isEmpty()) {
                    result.put(key, value);
                }
            }
        }
        return result;
    }
}
