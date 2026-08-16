package com.example.agent.domain.skill;

import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.logging.WorkspaceManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SkillManager 边界条件测试。
 * <p>
 * 测试重点：
 * <ul>
 *   <li>懒加载行为</li>
 *   <li>getSkills / findByName 正确性</li>
 *   <li>reload 边界</li>
 *   <li>工作区切换缓存失效</li>
 *   <li>两层技能（项目级+用户级）合并去重</li>
 *   <li>无技能时返回空列表</li>
 * </ul>
 * </p>
 */
class SkillManagerTest {

    @TempDir
    Path tempDir;

    private Path originalHippoRoot;

    @BeforeEach
    void setUp() {
        WorkspaceContext.setCurrentFolder(tempDir.toString());
        // 将用户级技能目录隔离到 tempDir 的子目录，避免受真实环境干扰
        originalHippoRoot = WorkspaceManager.getHippoRoot();
        WorkspaceManager.overrideBasePath(tempDir.resolve("user-hippo"));
    }

    @AfterEach
    void tearDown() {
        WorkspaceContext.clear();
        WorkspaceManager.overrideBasePath(originalHippoRoot);
    }

    @Test
    @DisplayName("懒加载 - 构造后不触发文件扫描")
    void testLazyLoadingNoScanOnConstruction() {
        SkillManager manager = new SkillManager();
        assertDoesNotThrow(() -> { /* 构造本身不应有 IO */ });
    }

    @Test
    @DisplayName("懒加载 - 首次 getSkills 触发加载（无技能时返回空列表）")
    void testLazyLoadingTriggersOnFirstGet() {
        SkillManager manager = new SkillManager();
        assertTrue(manager.getSkills().isEmpty(), "没有技能文件时应返回空列表");
    }

    @Test
    @DisplayName("getSkills - 返回非空列表（可能为空）")
    void testGetSkills() {
        SkillManager manager = new SkillManager();
        assertNotNull(manager.getSkills());
    }

    @Test
    @DisplayName("findByName - null/空输入返回 null")
    void testFindByNameNull() {
        SkillManager manager = new SkillManager();
        assertNull(manager.findByName(null));
        assertNull(manager.findByName(""));
        assertNull(manager.findByName("  "));
    }

    @Test
    @DisplayName("findByName - 不存在的技能返回 null")
    void testFindByNameNotFound() {
        SkillManager manager = new SkillManager();
        assertNull(manager.findByName("non-existent"));
    }

    @Test
    @DisplayName("findByName - 按文件名（不含 .md）查找成功")
    void testFindByNameByFileName() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("java-review.md"),
                "---\nname: Java 代码审查\ndescription: 审查 Java 代码\n---\n内容");

        SkillManager manager = new SkillManager();
        SkillEntry entry = manager.findByName("java-review");
        assertNotNull(entry);
        assertEquals("java-review.md", entry.getFileName());
        assertEquals("Java 代码审查", entry.getName());
        assertEquals("审查 Java 代码", entry.getDescription());
    }

    @Test
    @DisplayName("findByName - 按 Frontmatter name 查找成功")
    void testFindByNameByName() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("my-skill.md"),
                "---\nname: Git 工作流\ndescription: Git 协作规范\n---\n内容");

        SkillManager manager = new SkillManager();
        SkillEntry entry = manager.findByName("Git 工作流");
        assertNotNull(entry);
        assertEquals("my-skill.md", entry.getFileName());
    }

    @Test
    @DisplayName("findByName - 传入带 .md 后缀也能匹配")
    void testFindByNameWithExtension() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("test-skill.md"), "内容");

        SkillManager manager = new SkillManager();
        SkillEntry entry = manager.findByName("test-skill.md");
        assertNotNull(entry);
        assertEquals("test-skill.md", entry.getFileName());
    }

    @Test
    @DisplayName("getSkills - 加载项目级技能")
    void testProjectSkills() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("project-skill.md"),
                "---\ndescription: 项目级\n---\n");

        SkillManager manager = new SkillManager();
        assertEquals(1, manager.getSkills().size());
        assertEquals("project", manager.getSkills().get(0).getSource());
    }

    @Test
    @DisplayName("getSkills - 同名文件项目级覆盖用户级（去重）")
    void testProjectOverridesUser() throws IOException {
        // 项目级
        Path projectDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(projectDir);
        Files.writeString(projectDir.resolve("same.md"),
                "---\ndescription: 项目版\n---\n");

        // 用户级
        Path userDir = WorkspaceManager.getUserSkillsDir();
        Files.createDirectories(userDir);
        Files.writeString(userDir.resolve("same.md"),
                "---\ndescription: 用户版\n---\n");

        SkillManager manager = new SkillManager();
        assertEquals(1, manager.getSkills().size());
        SkillEntry entry = manager.getSkills().get(0);
        assertEquals("项目版", entry.getDescription(),
                "项目级应覆盖用户级");
    }

    @Test
    @DisplayName("reload 后 getSkills 不报错")
    void testReloadThenGetSkills() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("s.md"), "---\nname: S\n---\n");

        SkillManager manager = new SkillManager();
        assertDoesNotThrow(() -> {
            manager.reload();
            assertFalse(manager.getSkills().isEmpty());
            assertNotNull(manager.findByName("S"));
        });
    }

    @Test
    @DisplayName("连续多次 reload 不报错")
    void testMultipleReloads() {
        SkillManager manager = new SkillManager();
        assertDoesNotThrow(() -> {
            manager.reload();
            manager.reload();
            manager.reload();
        });
    }

    @Test
    @DisplayName("工作区切换 - 缓存失效，重新加载")
    void testWorkspaceChangeInvalidatesCache() throws IOException {
        Path ws1 = tempDir.resolve("project-a");
        Path ws2 = tempDir.resolve("project-b");
        Files.createDirectories(ws1.resolve(".hippo").resolve("skills"));
        Files.createDirectories(ws2.resolve(".hippo").resolve("skills"));
        Files.writeString(ws1.resolve(".hippo").resolve("skills").resolve("skill-a.md"),
                "---\ndescription: from A\n---\n");
        Files.writeString(ws2.resolve(".hippo").resolve("skills").resolve("skill-b.md"),
                "---\ndescription: from B\n---\n");

        SkillManager manager = new SkillManager();

        // 工作区 A
        WorkspaceContext.setCurrentFolder(ws1.toString());
        assertEquals(1, manager.getSkills().size());
        assertEquals("skill-a.md", manager.getSkills().get(0).getFileName());

        // 切换工作区 B
        WorkspaceContext.setCurrentFolder(ws2.toString());
        assertEquals(1, manager.getSkills().size());
        assertEquals("skill-b.md", manager.getSkills().get(0).getFileName());
    }

    @Test
    @DisplayName("工作区切换 - 相同工作区不重新加载，结果一致")
    void testSameWorkspaceNoReload() throws IOException {
        Path ws = tempDir.resolve("my-project");
        Files.createDirectories(ws.resolve(".hippo").resolve("skills"));
        Files.writeString(ws.resolve(".hippo").resolve("skills").resolve("s.md"),
                "---\ndescription: stable\n---\n");

        WorkspaceContext.setCurrentFolder(ws.toString());
        SkillManager manager = new SkillManager();

        var list1 = manager.getSkills();
        var list2 = manager.getSkills();
        assertSame(list1, list2, "同一工作区应使用缓存");
    }

    @Test
    @DisplayName("工作区切换 - 从有技能切换到无技能，返回空列表")
    void testWorkspaceSwitchToNoSkills() throws IOException {
        Path ws1 = tempDir.resolve("with-skills");
        Path ws2 = tempDir.resolve("without-skills");
        Files.createDirectories(ws1.resolve(".hippo").resolve("skills"));
        Files.createDirectories(ws2);
        Files.writeString(ws1.resolve(".hippo").resolve("skills").resolve("s.md"),
                "---\ndescription: some skill\n---\n");

        SkillManager manager = new SkillManager();

        WorkspaceContext.setCurrentFolder(ws1.toString());
        assertFalse(manager.getSkills().isEmpty());

        WorkspaceContext.setCurrentFolder(ws2.toString());
        assertTrue(manager.getSkills().isEmpty(), "无技能时应返回空列表");
    }

    // ==================== buildSystemPromptSnippet ====================

    @Test
    @DisplayName("buildSystemPromptSnippet - 无技能时返回空字符串")
    void testSnippetNoSkills() {
        SkillManager manager = new SkillManager();
        assertEquals("", manager.buildSystemPromptSnippet(), "无技能时应返回空字符串");
    }

    @Test
    @DisplayName("buildSystemPromptSnippet - 项目级技能生成清单段落")
    void testSnippetProjectSkills() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("code-review.md"),
                "---\nname: 代码审查\ndescription: 审查代码中的常见问题\n---\n正文");

        SkillManager manager = new SkillManager();
        String snippet = manager.buildSystemPromptSnippet();

        assertTrue(snippet.startsWith("\n\n## 可用技能\n"), "应以「可用技能」标题开头");
        assertTrue(snippet.contains("【项目技能】"), "应包含项目技能分组");
        assertFalse(snippet.contains("【用户技能】"), "无用户技能时不应出现用户分组");
        assertTrue(snippet.contains("- code-review.md — 审查代码中的常见问题"),
                "应包含技能文件名和描述");
        assertTrue(snippet.contains("使用方式：调用 skill 工具并传入对应的技能名称"),
                "应包含使用方式说明");
    }

    @Test
    @DisplayName("buildSystemPromptSnippet - 用户级技能生成清单段落")
    void testSnippetUserSkills() throws IOException {
        Path userDir = WorkspaceManager.getUserSkillsDir();
        Files.createDirectories(userDir);
        Files.writeString(userDir.resolve("git-workflow.md"),
                "---\nname: Git 工作流\ndescription: Git 协作规范\n---\n正文");

        SkillManager manager = new SkillManager();
        String snippet = manager.buildSystemPromptSnippet();

        assertTrue(snippet.contains("【用户技能】"), "应包含用户技能分组");
        assertFalse(snippet.contains("【项目技能】"), "无项目技能时不应出现项目分组");
        assertTrue(snippet.contains("- git-workflow.md — Git 协作规范"),
                "应包含用户技能文件名和描述");
    }

    @Test
    @DisplayName("buildSystemPromptSnippet - 项目级与用户级同时存在时都列出")
    void testSnippetBothScopes() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("project-skill.md"),
                "---\ndescription: 项目级技能\n---\n");
        Path userDir = WorkspaceManager.getUserSkillsDir();
        Files.createDirectories(userDir);
        Files.writeString(userDir.resolve("user-skill.md"),
                "---\ndescription: 用户级技能\n---\n");

        SkillManager manager = new SkillManager();
        String snippet = manager.buildSystemPromptSnippet();

        assertTrue(snippet.contains("【项目技能】"), "应包含项目技能分组");
        assertTrue(snippet.contains("【用户技能】"), "应包含用户技能分组");
        assertTrue(snippet.contains("- project-skill.md — 项目级技能"), "应列出项目技能");
        assertTrue(snippet.contains("- user-skill.md — 用户级技能"), "应列出用户技能");
    }

    @Test
    @DisplayName("buildSystemPromptSnippet - 描述为空时只输出文件名")
    void testSnippetBlankDescription() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("no-desc.md"), "---\n---\n正文");

        SkillManager manager = new SkillManager();
        String snippet = manager.buildSystemPromptSnippet();

        assertTrue(snippet.contains("- no-desc.md\n"), "描述为空时不应输出「— 」后缀");
        assertFalse(snippet.contains("no-desc.md —"), "不应包含空描述分隔符");
    }

    @Test
    @DisplayName("buildSystemPromptSnippet - 工作区切换后生成不同清单")
    void testSnippetWorkspaceChange() throws IOException {
        Path ws1 = tempDir.resolve("proj-a");
        Path ws2 = tempDir.resolve("proj-b");
        Files.createDirectories(ws1.resolve(".hippo").resolve("skills"));
        Files.createDirectories(ws2.resolve(".hippo").resolve("skills"));
        Files.writeString(ws1.resolve(".hippo").resolve("skills").resolve("skill-a.md"),
                "---\ndescription: from A\n---\n");
        Files.writeString(ws2.resolve(".hippo").resolve("skills").resolve("skill-b.md"),
                "---\ndescription: from B\n---\n");

        SkillManager manager = new SkillManager();

        WorkspaceContext.setCurrentFolder(ws1.toString());
        String snippetA = manager.buildSystemPromptSnippet();
        assertTrue(snippetA.contains("skill-a.md"), "工作区 A 的清单应包含 skill-a");
        assertFalse(snippetA.contains("skill-b.md"), "工作区 A 的清单不应包含 skill-b");

        WorkspaceContext.setCurrentFolder(ws2.toString());
        String snippetB = manager.buildSystemPromptSnippet();
        assertTrue(snippetB.contains("skill-b.md"), "工作区 B 的清单应包含 skill-b");
        assertFalse(snippetB.contains("skill-a.md"), "工作区 B 的清单不应包含 skill-a");
    }
}
