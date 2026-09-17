package com.example.agent.domain.skill;

/**
 * 技能元数据模型。
 * <p>
 * 技能有两种形态：
 * <ul>
 *   <li><b>扁平</b>：单个 {@code .md} 文件，如 {@code .hippo/skills/java-review.md}；{@code rootDir} 为 null。</li>
 *   <li><b>目录</b>：技能目录，入口为 {@code <dir>/SKILL.md}，同目录可带 scripts/、references/ 等资源，
 *       如 {@code .hippo/skills/pdf-tools/SKILL.md}；{@code rootDir} 指向技能目录。</li>
 * </ul>
 * </p>
 * <p>
 * {@code skillId} 是技能的统一身份键：扁平形态取文件名去后缀，目录形态取目录名。
 * 去重、查找与技能清单均以它为准（目录形态的 {@code fileName} 恒为 {@code SKILL.md}，不可作身份）。
 * </p>
 */
public class SkillEntry {

    private final String skillId;
    private final String name;
    private final String description;
    private final String fileName;
    private final String filePath;
    private final String source; // "project" 或 "user"
    private final String rootDir; // 技能根目录；扁平形态为 null

    public SkillEntry(String skillId, String name, String description, String fileName,
                      String filePath, String source, String rootDir) {
        this.skillId = skillId;
        this.name = name;
        this.description = description;
        this.fileName = fileName;
        this.filePath = filePath;
        this.source = source;
        this.rootDir = rootDir;
    }

    /** 统一身份键：扁平=文件名去后缀，目录=目录名 */
    public String getSkillId() {
        return skillId;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    /** 入口文件名（扁平：{@code xxx.md}；目录：{@code SKILL.md}） */
    public String getFileName() {
        return fileName;
    }

    /** 入口文件绝对路径 */
    public String getFilePath() {
        return filePath;
    }

    public String getSource() {
        return source;
    }

    /** 技能根目录绝对路径；扁平形态为 null */
    public String getRootDir() {
        return rootDir;
    }

    /** 是否为目录形态技能（含 SKILL.md 与同目录资源） */
    public boolean isDirectorySkill() {
        return rootDir != null;
    }

    @Override
    public String toString() {
        return "SkillEntry{" +
                "skillId='" + skillId + '\'' +
                ", name='" + name + '\'' +
                ", fileName='" + fileName + '\'' +
                ", source='" + source + '\'' +
                ", directory=" + isDirectorySkill() +
                '}';
    }
}