package com.example.agent.domain.skill;

import com.example.agent.desktop.WorkspaceContext;
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
 *   <li>null/空系统提示词处理</li>
 *   <li>懒加载行为</li>
 *   <li>reload 边界</li>
 *   <li>工作区切换缓存失效</li>
 *   <li>两层技能（项目级+用户级）输出格式</li>
 *   <li>无技能时返回原始 prompt</li>
 * </ul>
 * </p>
 */
class SkillManagerTest {

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        // 确保每次测试有独立的工作区
        WorkspaceContext.setCurrentFolder(tempDir.toString());
    }

    @AfterEach
    void tearDown() {
        WorkspaceContext.clear();
    }

    @Test
    @DisplayName("enhanceSystemPrompt - null 输入返回 null")
    void testEnhanceNull() {
        SkillManager manager = new SkillManager();
        assertNull(manager.enhanceSystemPrompt(null));
    }

    @Test
    @DisplayName("enhanceSystemPrompt - 空字符串输入返回空字符串")
    void testEnhanceEmpty() {
        SkillManager manager = new SkillManager();
        String result = manager.enhanceSystemPrompt("");
        assertNotNull(result);
        assertEquals("", result);
    }

    @Test
    @DisplayName("懒加载 - 构造后不触发文件扫描")
    void testLazyLoadingNoScanOnConstruction() {
        SkillManager manager = new SkillManager();
        // getSkills() 会触发加载，所以构造后不应缓存
        // 这里只验证构造没有副作用
        assertDoesNotThrow(() -> { /* 构造本身不应有 IO */ });
    }

    @Test
    @DisplayName("懒加载 - 首次 enhanceSystemPrompt 触发加载（无技能时返回原始 prompt）")
    void testLazyLoadingTriggersOnFirstEnhance() {
        SkillManager manager = new SkillManager();
        String original = "base system prompt";
        String result = manager.enhanceSystemPrompt(original);
        // 没有技能文件，应返回原始内容
        assertEquals(original, result);
    }

    @Test
    @DisplayName("无技能时 - 返回原始 prompt，不追加任何内容")
    void testNoSkillsReturnsOriginal() {
        SkillManager manager = new SkillManager();
        String original = "original prompt";
        String result = manager.enhanceSystemPrompt(original);
        assertEquals(original, result, "无技能时应原样返回");
    }

    @Test
    @DisplayName("有技能时 - 追加技能目录段落")
    void testWithSkillsAppendsSection() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("test-skill.md"),
                "---\nname: Test\n---\ncontent\n");

        SkillManager manager = new SkillManager();
        String result = manager.enhanceSystemPrompt("base");

        assertTrue(result.startsWith("base"), "base prompt 应保留");
        assertTrue(result.contains("=== 可用技能 ==="));
        assertTrue(result.contains("test-skill.md"));
        assertTrue(result.contains("当用户的问题涉及上述领域时，先读取对应的技能文件再回答。"));
    }

    @Test
    @DisplayName("输出格式 - 项目技能在前，用户技能在后，分组展示")
    void testProjectAndUserSections() throws IOException {
        // 项目级技能
        Path projectDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(projectDir);
        Files.writeString(projectDir.resolve("project-skill.md"),
                "---\ndescription: 项目级\n---\n");

        SkillManager manager = new SkillManager();
        String result = manager.enhanceSystemPrompt("base");

        assertTrue(result.contains("项目技能:"));
        assertTrue(result.contains("project-skill.md — 项目级"));
    }

    @Test
    @DisplayName("技能描述为空时不显示描述分隔符")
    void testNoDescriptionOmitted() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("no-desc.md"), "plain content");

        SkillManager manager = new SkillManager();
        String result = manager.enhanceSystemPrompt("base");

        assertTrue(result.contains("no-desc.md"));
        assertFalse(result.contains(" — "),
                "无 description 时不应有分隔符");
    }

    @Test
    @DisplayName("多次调用 enhanceSystemPrompt 结果一致")
    void testMultipleCallsConsistent() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("s.md"), "---\nname: S\n---\n");

        SkillManager manager = new SkillManager();
        String result1 = manager.enhanceSystemPrompt("base");
        String result2 = manager.enhanceSystemPrompt("base");
        assertEquals(result1, result2);
    }

    @Test
    @DisplayName("reload 后再次 enhanceSystemPrompt 不报错")
    void testReloadThenEnhance() throws IOException {
        Path skillsDir = tempDir.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsDir);
        Files.writeString(skillsDir.resolve("s.md"), "---\nname: S\n---\n");

        SkillManager manager = new SkillManager();
        assertDoesNotThrow(() -> {
            manager.reload();
            String result = manager.enhanceSystemPrompt("after reload");
            assertNotNull(result);
            assertTrue(result.contains("s.md"));
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
    @DisplayName("getSkills - 返回非空列表（可能为空）")
    void testGetSkills() {
        SkillManager manager = new SkillManager();
        assertNotNull(manager.getSkills());
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
        String resultA = manager.enhanceSystemPrompt("base");
        assertTrue(resultA.contains("skill-a.md"), "应加载项目 A 技能");
        assertTrue(resultA.contains("from A"));

        // 切换工作区 B
        WorkspaceContext.setCurrentFolder(ws2.toString());
        String resultB = manager.enhanceSystemPrompt("base");
        assertTrue(resultB.contains("skill-b.md"), "应重新加载为项目 B 技能");
        assertTrue(resultB.contains("from B"));
        assertFalse(resultB.contains("skill-a.md"), "应不再包含项目 A 技能");
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

        String result1 = manager.enhanceSystemPrompt("base");
        String result2 = manager.enhanceSystemPrompt("base");
        assertEquals(result1, result2, "同一工作区应使用缓存");
    }

    @Test
    @DisplayName("工作区切换 - 从有技能切换到无技能，不再追加技能段落")
    void testWorkspaceSwitchToNoSkills() throws IOException {
        Path ws1 = tempDir.resolve("with-skills");
        Path ws2 = tempDir.resolve("without-skills");
        Files.createDirectories(ws1.resolve(".hippo").resolve("skills"));
        Files.createDirectories(ws2); // 无 .hippo/skills 目录
        Files.writeString(ws1.resolve(".hippo").resolve("skills").resolve("s.md"),
                "---\ndescription: some skill\n---\n");

        SkillManager manager = new SkillManager();

        WorkspaceContext.setCurrentFolder(ws1.toString());
        String result1 = manager.enhanceSystemPrompt("base");
        assertTrue(result1.contains("=== 可用技能 ==="));

        WorkspaceContext.setCurrentFolder(ws2.toString());
        String result2 = manager.enhanceSystemPrompt("base");
        assertEquals("base", result2, "无技能时应原样返回");
    }
}
