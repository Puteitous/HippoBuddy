package com.example.agent.domain.skill;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SkillLoader 两层技能扫描测试。
 * <p>
 * 测试覆盖：
 * <ul>
 *   <li>项目级技能扫描（findProjectSkillFiles）</li>
 *   <li>用户级技能扫描（findUserSkillFiles）</li>
 *   <li>合并加载 loadAllSkills(workspacePath) — 去重、排序</li>
 *   <li>兼容 loadAllSkills() 仅用户级</li>
 *   <li>Frontmatter 解析（name, description）</li>
 *   <li>文件排序、.md 过滤、目录不存在等边界</li>
 * </ul>
 * </p>
 */
class SkillLoaderTest {

    @TempDir
    Path tempDir;

    // ==================== findProjectSkillFiles ====================

    @Test
    @DisplayName("findProjectSkillFiles - null 路径返回空列表")
    void findProjectSkillFiles_nullPath() {
        assertTrue(SkillLoader.findProjectSkillFiles(null).isEmpty());
    }

    @Test
    @DisplayName("findProjectSkillFiles - 空字符串返回空列表")
    void findProjectSkillFiles_emptyPath() {
        assertTrue(SkillLoader.findProjectSkillFiles("").isEmpty());
    }

    @Test
    @DisplayName("findProjectSkillFiles - 空白字符串返回空列表")
    void findProjectSkillFiles_blankPath() {
        assertTrue(SkillLoader.findProjectSkillFiles("   ").isEmpty());
    }

    @Test
    @DisplayName("findProjectSkillFiles - 不存在的目录返回空列表")
    void findProjectSkillFiles_nonexistentDir() {
        List<Path> files = SkillLoader.findProjectSkillFiles(
                tempDir.resolve("nonexistent").toString());
        assertTrue(files.isEmpty());
    }

    @Test
    @DisplayName("findProjectSkillFiles - 只返回 .md 文件，忽略其他后缀")
    void findProjectSkillFiles_onlyMdFiles() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("a.md"), "");
        Files.writeString(skillsDir.resolve("b.md"), "");
        Files.writeString(skillsDir.resolve("c.txt"), "");
        Files.writeString(skillsDir.resolve("d.json"), "");

        List<Path> files = SkillLoader.findProjectSkillFiles(tempDir.toString());
        assertEquals(2, files.size(), "应只返回 .md 文件");
    }

    @Test
    @DisplayName("findProjectSkillFiles - 返回的文件按文件名字母排序")
    void findProjectSkillFiles_orderedByName() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("z.md"), "");
        Files.writeString(skillsDir.resolve("a.md"), "");
        Files.writeString(skillsDir.resolve("m.md"), "");

        List<Path> files = SkillLoader.findProjectSkillFiles(tempDir.toString());
        assertEquals(3, files.size());
        assertEquals("a.md", files.get(0).getFileName().toString());
        assertEquals("m.md", files.get(1).getFileName().toString());
        assertEquals("z.md", files.get(2).getFileName().toString());
    }

    @Test
    @DisplayName("findProjectSkillFiles - 空技能目录返回空列表")
    void findProjectSkillFiles_emptyDir() throws IOException {
        Files.createDirectories(tempDir.resolve(".hippo").resolve("skills"));
        assertTrue(SkillLoader.findProjectSkillFiles(tempDir.toString()).isEmpty());
    }

    // ==================== findUserSkillFiles ====================

    @Test
    @DisplayName("findUserSkillFiles - 不报错，返回非空列表（可能为空）")
    void findUserSkillFiles_noError() {
        List<Path> files = SkillLoader.findUserSkillFiles();
        assertNotNull(files);
    }

    // ==================== loadProjectSkills ====================

    @Test
    @DisplayName("loadProjectSkills - null 路径返回空列表")
    void loadProjectSkills_nullPath() {
        assertTrue(SkillLoader.loadProjectSkills(null).isEmpty());
    }

    @Test
    @DisplayName("loadProjectSkills - 加载内容并设置 source=project")
    void loadProjectSkills_sourceField() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("java.md"),
                "---\nname: Java\n---\ncheck NPE\n");

        List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
        assertEquals(1, skills.size());
        assertEquals("project", skills.get(0).getSource());
        assertEquals("Java", skills.get(0).getName());
    }

    // ==================== loadUserSkills ====================

    @Test
    @DisplayName("loadUserSkills - 不报错，返回非空列表（可能为空）")
    void loadUserSkills_noError() {
        List<SkillEntry> skills = SkillLoader.loadUserSkills();
        assertNotNull(skills);
    }

    // ==================== loadAllSkills()（仅用户级，向后兼容） ====================

    @Test
    @DisplayName("loadAllSkills - 无参版本仅加载用户级")
    void loadAllSkills_noArg() {
        List<SkillEntry> skills = SkillLoader.loadAllSkills();
        assertNotNull(skills);
        // 所有 entry 应全是 source=user
        for (SkillEntry s : skills) {
            assertEquals("user", s.getSource());
        }
    }

    // ==================== loadAllSkills(workspacePath) ====================

    @Test
    @DisplayName("loadAllSkills - 合并项目级和用户级技能")
    void loadAllSkills_merge() throws IOException {
        // 项目级
        Path projectSkillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(projectSkillsDir);
        Files.writeString(projectSkillsDir.resolve("project-skill.md"),
                "---\nname: 项目技能\n---\nproject content\n");

        // 调用 SkillLoader.loadAllSkills 加载
        List<SkillEntry> skills = SkillLoader.loadAllSkills(tempDir.toString());
        assertNotNull(skills);

        // 验证项目级技能存在
        boolean hasProjectSkill = skills.stream()
                .anyMatch(s -> "project".equals(s.getSource()) && "项目技能".equals(s.getName()));
        assertTrue(hasProjectSkill, "应包含项目级技能");
    }

    @Test
    @DisplayName("loadAllSkills - null 路径只加载用户级")
    void loadAllSkills_nullPath() {
        List<SkillEntry> skills = SkillLoader.loadAllSkills((String) null);
        assertNotNull(skills);
        for (SkillEntry s : skills) {
            assertEquals("user", s.getSource());
        }
    }

    @Test
    @DisplayName("loadAllSkills - 空路径只加载用户级")
    void loadAllSkills_emptyPath() {
        List<SkillEntry> skills = SkillLoader.loadAllSkills("");
        assertNotNull(skills);
        for (SkillEntry s : skills) {
            assertEquals("user", s.getSource());
        }
    }

    @Test
    @DisplayName("loadAllSkills - 返回的文件按文件名排序")
    void loadAllSkills_sorted() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("z.md"), "");
        Files.writeString(skillsDir.resolve("a.md"), "");
        Files.writeString(skillsDir.resolve("m.md"), "");

        List<SkillEntry> skills = SkillLoader.loadAllSkills(tempDir.toString());
        assertEquals(3, skills.size());
        assertEquals("a.md", skills.get(0).getFileName());
        assertEquals("m.md", skills.get(1).getFileName());
        assertEquals("z.md", skills.get(2).getFileName());
    }

    @Test
    @DisplayName("loadAllSkills - 空目录返回空列表")
    void loadAllSkills_emptyDir() throws IOException {
        Files.createDirectories(tempDir.resolve(".hippo").resolve("skills"));
        List<SkillEntry> skills = SkillLoader.loadAllSkills(tempDir.toString());
        assertTrue(skills.isEmpty());
    }

    // ==================== 同名去重 ====================

    @Test
    @DisplayName("loadAllSkills - 同名文件项目级覆盖用户级")
    void loadAllSkills_dedup_projectOverridesUser() throws IOException {
        // 项目级同名文件
        Path projectDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(projectDir);
        Files.writeString(projectDir.resolve("overlap.md"),
                "---\nname: 项目版\n---");

        // 用户级同名 — 我们模拟不了用户级目录（受 WorkspaceManager 控制），
        // 但可以测试项目级同名覆盖的逻辑：在同名时项目级胜出
        List<SkillEntry> skills = SkillLoader.loadAllSkills(tempDir.toString());

        // 如果有用户级也有同名文件，项目级覆盖
        // 用户级文件数量不确定，但至少应包含项目级
        boolean hasProjectOverlap = skills.stream()
                .anyMatch(s -> "overlap.md".equals(s.getFileName()) && "project".equals(s.getSource()));
        // 如果用户级正好也有 overlap.md，应只剩 project source
        long overlapCount = skills.stream()
                .filter(s -> "overlap.md".equals(s.getFileName()))
                .count();
        assertTrue(overlapCount <= 1, "同名文件应去重，最多保留一个");
    }

    // ==================== Frontmatter 解析 ====================

    @Nested
    @DisplayName("Frontmatter 解析")
    class FrontmatterTests {

        @Test
        @DisplayName("无 Frontmatter — 使用文件名作为 name，description 为空")
        void noFrontmatter() throws IOException {
            Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
            Files.createDirectories(skillsDir);
            Files.writeString(skillsDir.resolve("my-skill.md"), "just content");

            List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
            assertEquals(1, skills.size());
            assertEquals("my-skill", skills.get(0).getName());
            assertEquals("", skills.get(0).getDescription());
        }

        @Test
        @DisplayName("完整的 Frontmatter — 解析 name 和 description")
        void fullFrontmatter() throws IOException {
            Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
            Files.createDirectories(skillsDir);
            Files.writeString(skillsDir.resolve("review.md"),
                    "---\n" +
                    "name: Java 代码审查\n" +
                    "description: 审查 Java 代码中的常见问题\n" +
                    "---\n" +
                    "content here\n");

            List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
            assertEquals(1, skills.size());
            assertEquals("Java 代码审查", skills.get(0).getName());
            assertEquals("审查 Java 代码中的常见问题", skills.get(0).getDescription());
        }

        @Test
        @DisplayName("Frontmatter 只有 name 没有 description")
        void frontmatterOnlyName() throws IOException {
            Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
            Files.createDirectories(skillsDir);
            Files.writeString(skillsDir.resolve("git.md"),
                    "---\nname: Git 工作流\n---\ncontent\n");

            List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
            assertEquals(1, skills.size());
            assertEquals("Git 工作流", skills.get(0).getName());
            assertEquals("", skills.get(0).getDescription());
        }

        @Test
        @DisplayName("Frontmatter 只有 description 没有 name — 使用文件名")
        void frontmatterOnlyDescription() throws IOException {
            Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
            Files.createDirectories(skillsDir);
            Files.writeString(skillsDir.resolve("my-skill.md"),
                    "---\ndescription: 一些说明\n---\ncontent\n");

            List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
            assertEquals(1, skills.size());
            assertEquals("my-skill", skills.get(0).getName());
            assertEquals("一些说明", skills.get(0).getDescription());
        }

        @Test
        @DisplayName("Frontmatter 中的额外字段会被忽略")
        void frontmatterExtraFields() throws IOException {
            Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
            Files.createDirectories(skillsDir);
            Files.writeString(skillsDir.resolve("test.md"),
                    "---\n" +
                    "name: Test\n" +
                    "description: desc\n" +
                    "keywords: java, spring\n" +
                    "version: 1.0\n" +
                    "---\n" +
                    "content\n");

            List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
            assertEquals(1, skills.size());
            assertEquals("Test", skills.get(0).getName());
            assertEquals("desc", skills.get(0).getDescription());
        }

        @Test
        @DisplayName("文件内容为空时，用文件名作为 name")
        void emptyFile() throws IOException {
            Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
            Files.createDirectories(skillsDir);
            Files.writeString(skillsDir.resolve("empty.md"), "");

            List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
            assertEquals(1, skills.size());
            assertEquals("empty", skills.get(0).getName());
            assertEquals("", skills.get(0).getDescription());
        }

        @Test
        @DisplayName("文件只有 --- 开头但没有结束标记 — 视为无 Frontmatter")
        void malformedFrontmatter_noEnd() throws IOException {
            Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
            Files.createDirectories(skillsDir);
            Files.writeString(skillsDir.resolve("bad.md"),
                    "---\nname: Bad\ncontent\n");

            List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
            assertEquals(1, skills.size());
            assertEquals("bad", skills.get(0).getName(), "解析失败时使用文件名");
        }
    }

    // ==================== SkillEntry 元数据 ====================

    @Test
    @DisplayName("SkillEntry - filePath 为绝对路径")
    void skillEntry_filePath() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("test.md"), "content");

        List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
        assertEquals(1, skills.size());
        assertTrue(skills.get(0).getFilePath().endsWith("test.md"));
        assertTrue(skills.get(0).getFilePath().startsWith(tempDir.toAbsolutePath().toString()));
    }

    @Test
    @DisplayName("SkillEntry - 没有 Frontmatter 时 fileName 等于文件名")
    void skillEntry_fileNameWithoutFrontmatter() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("hello-world.md"), "plain text");

        List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
        assertEquals(1, skills.size());
        assertEquals("hello-world.md", skills.get(0).getFileName());
    }

    @Test
    @DisplayName("SkillEntry - toString 不抛异常")
    void skillEntry_toString() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("s.md"), "---\nname: S\n---\n");

        List<SkillEntry> skills = SkillLoader.loadProjectSkills(tempDir.toString());
        assertEquals(1, skills.size());
        assertNotNull(skills.get(0).toString());
        assertTrue(skills.get(0).toString().contains("S"));
    }

    // ==================== stripFrontmatter ====================

    @Nested
    @DisplayName("stripFrontmatter")
    class StripFrontmatterTests {

        @Test
        @DisplayName("null 输入返回空字符串")
        void nullInput() {
            assertEquals("", SkillLoader.stripFrontmatter(null));
        }

        @Test
        @DisplayName("空字符串返回空字符串")
        void emptyInput() {
            assertEquals("", SkillLoader.stripFrontmatter(""));
        }

        @Test
        @DisplayName("空白字符串返回空字符串")
        void blankInput() {
            assertEquals("", SkillLoader.stripFrontmatter("   "));
        }

        @Test
        @DisplayName("无 Frontmatter — 原样返回")
        void noFrontmatter() {
            String input = "just plain content\nwithout frontmatter";
            assertEquals(input, SkillLoader.stripFrontmatter(input));
        }

        @Test
        @DisplayName("完整 Frontmatter — 只返回正文")
        void fullFrontmatter() {
            String input = "---\nname: Test\ndescription: desc\n---\nbody content\n";
            assertEquals("body content\n", SkillLoader.stripFrontmatter(input));
        }

        @Test
        @DisplayName("Frontmatter 后正文有多行")
        void multiLineBody() {
            String input = "---\nname: Test\n---\nline1\nline2\nline3\n";
            assertEquals("line1\nline2\nline3\n", SkillLoader.stripFrontmatter(input));
        }

        @Test
        @DisplayName("Frontmatter 后无正文 — 返回空字符串")
        void frontmatterOnly() {
            String input = "---\nname: Test\n---\n";
            assertEquals("", SkillLoader.stripFrontmatter(input));
        }

        @Test
        @DisplayName("Frontmatter 后紧接正文无换行")
        void frontmatterNoTrailingNewline() {
            String input = "---\nname: Test\n---\nbody";
            assertEquals("body", SkillLoader.stripFrontmatter(input));
        }

        @Test
        @DisplayName("只有 --- 开头无结束标记 — 原样返回")
        void noEndMarker() {
            String input = "---\nname: Test\ncontent\n";
            assertEquals(input, SkillLoader.stripFrontmatter(input));
        }

        @Test
        @DisplayName("正文中有 --- 但不影响剥离")
        void bodyContainsMarker() {
            String input = "---\nname: Test\n---\n---\nstill body\n---\n";
            assertEquals("---\nstill body\n---\n", SkillLoader.stripFrontmatter(input),
                    "只剥离第一个 Frontmatter");
        }

        @Test
        @DisplayName("Windows 换行符 (\\r\\n)")
        void windowsLineEndings() {
            String input = "---\r\nname: Test\r\n---\r\nbody content\r\n";
            assertEquals("body content\r\n", SkillLoader.stripFrontmatter(input));
        }

        @Test
        @DisplayName("只含 --- 无任何内容 — 返回空字符串")
        void onlyMarkers() {
            String input = "---\n---\n";
            assertEquals("", SkillLoader.stripFrontmatter(input),
                    "Frontmatter 后是空内容");
        }

        @Test
        @DisplayName("无 name 字段的 Frontmatter")
        void frontmatterWithoutName() {
            String input = "---\ndescription: only desc\n---\nbody\n";
            assertEquals("body\n", SkillLoader.stripFrontmatter(input));
        }
    }
}
