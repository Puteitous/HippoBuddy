package com.example.agent.domain.skill;

/**
 * 技能元数据模型。
 * <p>
 * 从 {@code .md} 技能文件的 Frontmatter 解析：
 * <pre>
 * ---
 * name: Java 代码审查
 * description: 审查 Java 代码中的常见问题
 * ---
 * </pre>
 * </p>
 */
public class SkillEntry {

    private final String name;
    private final String description;
    private final String fileName;
    private final String filePath;
    private final String source; // "project" 或 "user"

    public SkillEntry(String name, String description, String fileName, String filePath, String source) {
        this.name = name;
        this.description = description;
        this.fileName = fileName;
        this.filePath = filePath;
        this.source = source;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public String getFileName() {
        return fileName;
    }

    public String getFilePath() {
        return filePath;
    }

    public String getSource() {
        return source;
    }

    @Override
    public String toString() {
        return "SkillEntry{" +
                "name='" + name + '\'' +
                ", fileName='" + fileName + '\'' +
                ", source='" + source + '\'' +
                '}';
    }
}
