package com.example.agent.domain.rule;

import com.example.agent.config.RuleConfig;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.service.SimpleTokenEstimator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * RuleManager 边界条件测试
 *
 * 测试重点：
 * - null 配置处理
 * - null tokenEstimator 处理
 * - 懒加载行为
 * - reload 边界
 * - 禁用注入
 * - 工作区切换缓存失效
 * - 两层规则（项目级+全局）输出格式
 */
class RuleManagerTest {

    private SimpleTokenEstimator tokenEstimator;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        tokenEstimator = new SimpleTokenEstimator();
    }

    @AfterEach
    void tearDown() {
        // 恢复 WorkspaceContext 状态，不影响其他测试
        WorkspaceContext.clear();
    }

    @Test
    @DisplayName("构造函数 - null config 使用默认配置")
    void testConstructorWithNullConfig() {
        RuleManager manager = new RuleManager(tokenEstimator, null);
        assertNotNull(manager);
        assertEquals(0, manager.getTotalTokens());
    }

    @Test
    @DisplayName("构造函数 - null tokenEstimator 应抛出 IllegalArgumentException (Fail-Fast)")
    void testConstructorWithNullTokenEstimator() {
        RuleConfig config = new RuleConfig();
        IllegalArgumentException e = assertThrows(
            IllegalArgumentException.class,
            () -> new RuleManager(null, config)
        );
        assertEquals("TokenEstimator cannot be null", e.getMessage());
    }

    @Test
    @DisplayName("构造函数 - 双参数都为 null 应抛出异常")
    void testConstructorWithBothNull() {
        IllegalArgumentException e = assertThrows(
            IllegalArgumentException.class,
            () -> new RuleManager(null, null)
        );
        assertEquals("TokenEstimator cannot be null", e.getMessage());
    }

    @Test
    @DisplayName("构造函数 - 单参数 null tokenEstimator 应抛出异常")
    void testSingleArgConstructor() {
        IllegalArgumentException e = assertThrows(
            IllegalArgumentException.class,
            () -> new RuleManager(null)
        );
        assertEquals("TokenEstimator cannot be null", e.getMessage());
    }

    @Test
    @DisplayName("懒加载 - 构造后不调用 enhanceSystemPrompt 不触发文件扫描")
    void testLazyLoadingNoScanOnConstruction() {
        // 构造后不应有文件扫描行为，token 应为 0
        RuleManager manager = new RuleManager(tokenEstimator);
        assertEquals(0, manager.getTotalTokens());
    }

    @Test
    @DisplayName("懒加载 - 首次 enhanceSystemPrompt 触发加载（无规则文件时返回空）")
    void testLazyLoadingTriggersOnFirstEnhance() {
        RuleManager manager = new RuleManager(tokenEstimator);
        String result = manager.enhanceSystemPrompt("base prompt");
        // 没有实际规则文件，规则部分应为空，但 base prompt 应保留
        assertTrue(result.contains("base prompt"));
        // 确保 token 被计算了（即使规则内容为空）
        assertTrue(manager.getTotalTokens() > 0);
    }

    @Test
    @DisplayName("边界 - 增强 null 系统提示词")
    void testEnhanceNullSystemPrompt() {
        RuleManager manager = new RuleManager(tokenEstimator);
        String result = manager.enhanceSystemPrompt(null);
        assertNotNull(result);
    }

    @Test
    @DisplayName("边界 - 增强空字符串系统提示词")
    void testEnhanceEmptySystemPrompt() {
        RuleManager manager = new RuleManager(tokenEstimator);
        String result = manager.enhanceSystemPrompt("");
        assertNotNull(result);
    }

    @Test
    @DisplayName("边界 - 禁用注入时返回原始提示词")
    void testInjectDisabled() {
        RuleConfig config = new RuleConfig();
        config.setInjectAtStartup(false);
        RuleManager manager = new RuleManager(tokenEstimator, config);

        String original = "original prompt";
        String result = manager.enhanceSystemPrompt(original);
        assertEquals(original, result);
    }

    @Test
    @DisplayName("边界 - reload 方法不报错")
    void testReload() {
        RuleManager manager = new RuleManager(tokenEstimator);
        assertDoesNotThrow(() -> manager.reload());
    }

    @Test
    @DisplayName("边界 - 初始 token 数为 0")
    void testInitialTokens() {
        RuleManager manager = new RuleManager(tokenEstimator);
        assertEquals(0, manager.getTotalTokens());
    }

    @Test
    @DisplayName("边界 - null tokenEstimator 构造应抛异常 (Fail-Fast)")
    void testNullTokenEstimatorEnhance() {
        IllegalArgumentException e = assertThrows(
            IllegalArgumentException.class,
            () -> new RuleManager(null)
        );
        assertEquals("TokenEstimator cannot be null", e.getMessage());
    }

    @Test
    @DisplayName("边界 - 连续多次 reload 不报错")
    void testMultipleReloads() {
        RuleManager manager = new RuleManager(tokenEstimator);
        assertDoesNotThrow(() -> {
            manager.reload();
            manager.reload();
            manager.reload();
        });
    }

    @Test
    @DisplayName("边界 - reload 后再次 enhanceSystemPrompt 不报错")
    void testReloadThenEnhance() {
        RuleManager manager = new RuleManager(tokenEstimator);
        manager.reload();
        String result = manager.enhanceSystemPrompt("after reload");
        assertNotNull(result);
        assertTrue(manager.getTotalTokens() > 0);
    }

    @Test
    @DisplayName("边界 - 连续多次 enhanceSystemPrompt 结果一致")
    void testMultipleEnhanceCalls() {
        RuleManager manager = new RuleManager(tokenEstimator);
        String result1 = manager.enhanceSystemPrompt("test");
        String result2 = manager.enhanceSystemPrompt("test");
        assertEquals(result1, result2);
    }

    @Test
    @DisplayName("工作区切换 - 切换工作区后触发重新加载")
    void testWorkspaceChangeTriggersReload() throws Exception {
        Path ws1 = tempDir.resolve("project-a");
        Path ws2 = tempDir.resolve("project-b");
        Files.createDirectories(ws1.resolve(".hippo").resolve("rules"));
        Files.createDirectories(ws2.resolve(".hippo").resolve("rules"));
        Files.writeString(ws1.resolve(".hippo").resolve("rules").resolve("rules-a.md"), "rules from A");
        Files.writeString(ws2.resolve(".hippo").resolve("rules").resolve("rules-b.md"), "rules from B");

        RuleManager manager = new RuleManager(tokenEstimator);

        // 设置工作区 A，加载项目 A 的规则
        WorkspaceContext.setCurrentFolder(ws1.toString());
        String resultA = manager.enhanceSystemPrompt("base");
        assertTrue(resultA.contains("rules from A"), "应加载项目 A 规则");
        assertTrue(resultA.contains("=== 项目规则 ==="));

        // 切换工作区 B
        WorkspaceContext.setCurrentFolder(ws2.toString());
        String resultB = manager.enhanceSystemPrompt("base");
        assertTrue(resultB.contains("rules from B"), "应重新加载为项目 B 规则");
        assertFalse(resultB.contains("rules from A"), "应不再包含项目 A 规则");
    }

    @Test
    @DisplayName("工作区切换 - 相同工作区不重复加载")
    void testSameWorkspaceNoReload() throws Exception {
        Path ws = tempDir.resolve("my-project");
        Files.createDirectories(ws.resolve(".hippo").resolve("rules"));
        Files.writeString(ws.resolve(".hippo").resolve("rules").resolve("my.md"), "original");

        RuleManager manager = new RuleManager(tokenEstimator);

        WorkspaceContext.setCurrentFolder(ws.toString());
        manager.enhanceSystemPrompt("base");

        // 获取缓存后的 token 数
        int cachedTokens = manager.getTotalTokens();

        // 再次调用（同一工作区），应使用缓存
        manager.enhanceSystemPrompt("base");
        assertEquals(cachedTokens, manager.getTotalTokens(), "同一工作区应使用缓存");
    }

    @Test
    @DisplayName("输出格式 - 项目规则和全局规则分开注入")
    void testTwoSectionOutput() throws Exception {
        // 创建带项目规则的临时工作区
        Path workspace = tempDir.resolve("test-project");
        Files.createDirectories(workspace.resolve(".hippo").resolve("rules"));
        Files.writeString(workspace.resolve(".hippo").resolve("rules").resolve("project.md"),
                "project rules content");

        WorkspaceContext.setCurrentFolder(workspace.toString());

        RuleManager manager = new RuleManager(tokenEstimator);
        String result = manager.enhanceSystemPrompt("base prompt");

        int projectSection = result.indexOf("=== 项目规则 ===");
        int globalSection = result.indexOf("=== 全局规则 ===");

        assertTrue(projectSection >= 0, "应包含项目规则段落");
        // 全局规则不存在时为 -1，这是合法的（没有用户级规则）
        // 如果存在全局规则段，应在项目规则段之后
        if (globalSection >= 0) {
            assertTrue(globalSection > projectSection, "项目规则应在全局规则之前");
        }
        assertTrue(result.contains("project rules content"), "应包含项目规则内容");
        assertTrue(result.contains("base prompt"), "base prompt 应保留");
    }

    @Test
    @DisplayName("输出格式 - 无项目规则时只有 base prompt，不含项目规则段落")
    void testNoRulesOutput() {
        // 使用空的工作区目录，无项目规则
        WorkspaceContext.setCurrentFolder(tempDir.toString());

        RuleManager manager = new RuleManager(tokenEstimator);
        String result = manager.enhanceSystemPrompt("hello");

        // 无项目规则时不应有项目规则段落标记
        assertFalse(result.contains("=== 项目规则 ==="));
        // base prompt 应保留
        assertTrue(result.contains("hello"));
    }
}
