package com.example.agent.domain.rule;

import com.example.agent.config.RuleConfig;
import com.example.agent.service.SimpleTokenEstimator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

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
 */
class RuleManagerTest {

    private SimpleTokenEstimator tokenEstimator;

    @BeforeEach
    void setUp() {
        tokenEstimator = new SimpleTokenEstimator();
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
}
