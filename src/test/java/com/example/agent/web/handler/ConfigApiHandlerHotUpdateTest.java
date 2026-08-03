package com.example.agent.web.handler;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.tools.web.WebSearchConfig;
import com.example.agent.tools.web.WebSearchTool;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 验证 Web Search 开关的热更新行为：
 * 禁用→启用无需重启即可注册工具，启用→禁用立即注销工具。
 */
@DisplayName("WebSearch 热更新行为测试")
class ConfigApiHandlerHotUpdateTest {

    private ConfigApiHandler handler;
    private ToolRegistry toolRegistry;
    private WebSearchConfig webSearchConfig;

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        handler = new ConfigApiHandler();
        toolRegistry = new ToolRegistry();
        ServiceLocator.registerSingleton(ToolRegistry.class, toolRegistry);

        webSearchConfig = new WebSearchConfig();
        webSearchConfig.setEnabled(true);
        webSearchConfig.setProvider("brave");
        webSearchConfig.setApiKey("test-key");
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    @Test
    @DisplayName("禁用→启用：动态注册 web_search 工具")
    void enablesRegistersTool() {
        assertFalse(toolRegistry.hasTool("web_search"));

        handler.syncWebSearchTool(false, true, webSearchConfig);

        assertTrue(toolRegistry.hasTool("web_search"));
        assertNotNull(toolRegistry.getExecutor("web_search"));
        // 工具注册后应立即出现在 toTools() 列表中（下次对话 schema 即生效）
        assertTrue(toolRegistry.toTools().stream()
                .anyMatch(t -> "web_search".equals(t.getFunction().getName())));
    }

    @Test
    @DisplayName("启用→禁用：动态注销 web_search 工具")
    void disablesUnregistersTool() {
        // 先注册一个 WebSearchTool，模拟启动时已启用的场景
        toolRegistry.register(new WebSearchTool(webSearchConfig));
        assertTrue(toolRegistry.hasTool("web_search"));

        handler.syncWebSearchTool(true, false, webSearchConfig);

        assertFalse(toolRegistry.hasTool("web_search"));
        assertNull(toolRegistry.getExecutor("web_search"));
        // 工具注销后应立即从 toTools() 列表消失
        assertTrue(toolRegistry.toTools().stream()
                .noneMatch(t -> "web_search".equals(t.getFunction().getName())));
    }

    @Test
    @DisplayName("enabled 无变化：不触发注册/注销")
    void noStateChangeDoesNothing() {
        toolRegistry.register(new WebSearchTool(webSearchConfig));

        // 保持启用状态（改 provider / apiKey 等场景），不应注销工具
        handler.syncWebSearchTool(true, true, webSearchConfig);
        assertTrue(toolRegistry.hasTool("web_search"));

        // 保持禁用状态，不应注册工具
        toolRegistry.unregister("web_search");
        handler.syncWebSearchTool(false, false, webSearchConfig);
        assertFalse(toolRegistry.hasTool("web_search"));
    }

    @Test
    @DisplayName("重复启用：已注册时跳过，不产生重复工具")
    void reEnableWhenAlreadyRegisteredSkipsDuplicate() {
        toolRegistry.register(new WebSearchTool(webSearchConfig));

        handler.syncWebSearchTool(false, true, webSearchConfig);

        // 注册表按名称存储，不应出现重复
        assertEquals(1, toolRegistry.toTools().stream()
                .filter(t -> "web_search".equals(t.getFunction().getName()))
                .count());
    }
}
