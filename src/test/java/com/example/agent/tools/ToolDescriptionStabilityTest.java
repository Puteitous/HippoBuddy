package com.example.agent.tools;

import com.example.agent.core.todo.TodoManager;
import com.example.agent.tools.web.WebFetchTool;
import com.example.agent.tools.web.WebSearchConfig;
import com.example.agent.tools.web.WebSearchTool;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * 契约测试：Tool 描述必须进程内静态。
 * <p>
 * 背景：LLM 服务端前缀缓存要求每次请求的 tools 参数逐字节一致。
 * 若任何工具在 {@link ToolExecutor#getDescription()} 中内联动态内容
 * （当前日期、工作区路径、技能清单等），跨天/切工作区/规则变更时
 * tools 参数变化 → 前缀缓存整体 miss（曾观测到 cacheHitRate 96% → 6.7%）。
 * </p>
 * <p>
 * 本测试遍历全部内置工具，断言 getDescription() 连续调用两次逐字节相等，
 * 让"描述静态"成为编译期/测试期强制的不变式，而非开发者自觉。
 * </p>
 * <p>
 * 边界说明：SubAgent 相关工具（fork_agent / fork_agents 等）未纳入自动构造，
 * 其构造依赖 ServiceLocator 中 LlmClient 接口实例（测试环境无法自动创建）。
 * 它们的描述由 BuiltInAgent.getAgentMenu()（静态常量）+ ProjectAgentLoader
 * （基于启动时确定的 HIPPO_ROOT 扫描）构成，进程内稳定；若未来 HIPPO_ROOT
 * 变为动态，需在本测试中补充覆盖。
 * </p>
 */
class ToolDescriptionStabilityTest {

    @Test
    @DisplayName("契约：所有内置工具描述两次调用必须逐字节一致（防动态内容击穿缓存）")
    void allBuiltinToolDescriptionsAreStable() {
        List<ToolExecutor> tools = buildBuiltinTools();
        assertFalse(tools.isEmpty(), "内置工具列表不应为空");

        for (ToolExecutor tool : tools) {
            String first = tool.getDescription();
            String second = tool.getDescription();

            assertNotNull(first, "工具 [" + tool.getName() + "] 描述不应为 null");
            assertEquals(first, second,
                "工具 [" + tool.getName() + "] 的描述两次调用不一致——描述必须进程内静态，"
                    + "不得内联时间/工作区路径/技能清单等动态内容，"
                    + "否则 tools 参数每轮变化 → LLM 前缀缓存整体 miss");
        }
    }

    @Test
    @DisplayName("web_search 描述不含动态日期（跨天不击穿缓存）")
    void webSearchDescriptionHasNoDynamicDate() {
        WebSearchTool tool = new WebSearchTool(new WebSearchConfig());
        String desc = tool.getDescription();

        // 不得内联"yyyy年M月d日"格式的日期
        assertFalse(desc.matches(".*\\d{4}年\\d{1,2}月\\d{1,2}日.*"),
            "web_search 描述不应内联完整日期，应改为静态文本 + system prompt 固化日期");
        // 不得内联当前年份（跨年会变化）
        assertFalse(desc.contains(String.valueOf(LocalDate.now().getYear())),
            "web_search 描述不应内联当前年份，跨年会导致 tools 参数变化");
        // 不得残留"当前日期"字样
        assertFalse(desc.contains("当前日期"),
            "web_search 描述不应包含“当前日期”字样");
    }

    /** 与 CoreModule.createConfiguredToolRegistry 注册的内置工具保持一致（不含 MCP / SubAgent）。 */
    private List<ToolExecutor> buildBuiltinTools() {
        List<ToolExecutor> tools = new ArrayList<>();
        tools.add(new ReadFileTool());
        tools.add(new ReadOfficeFileTool());
        tools.add(new WriteOfficeFileTool());
        tools.add(new WriteFileTool());
        tools.add(new EditFileTool());
        tools.add(new UndoFileTool());
        tools.add(new DeleteFileTool());
        tools.add(new ListDirectoryTool());
        tools.add(new GlobTool());
        tools.add(new GrepTool());
        tools.add(new AskUserTool());
        tools.add(new BashTool());
        tools.add(new TodoWriteTool(new TodoManager()));
        tools.add(new WebFetchTool());
        tools.add(new LintDiagnosticsTool());
        tools.add(new SkillTool());
        tools.add(new WebSearchTool(new WebSearchConfig()));
        return tools;
    }
}
