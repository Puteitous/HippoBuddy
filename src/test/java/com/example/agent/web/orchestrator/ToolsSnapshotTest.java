package com.example.agent.web.orchestrator;

import com.example.agent.core.AgentMode;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Tool;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.session.SessionManager;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 契约测试：会话级 Tools 快照。
 * <p>
 * 与 system prompt 固化同构 —— 会话首次 execute 时拍下 tools 快照，
 * 之后同 mode 复用（不再调用 getDescription()），切换工作区/跨天/
 * MCP 后续注册均不影响已有会话；只有新建会话或 mode 变化才重建。
 * </p>
 */
class ToolsSnapshotTest {

    private ToolRegistry toolRegistry;
    private WebAgentOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        ServiceLocator.registerSingleton(LlmClient.class, mock(LlmClient.class));
        toolRegistry = new ToolRegistry();
        ServiceLocator.registerSingleton(ToolRegistry.class, toolRegistry);
        orchestrator = new WebAgentOrchestrator(mock(SessionManager.class));
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    private void registerFakeTool(String name) {
        toolRegistry.register(new ToolExecutor() {
            @Override public String getName() { return name; }
            @Override public String getDescription() { return "静态描述-" + name; }
            @Override public String getParametersSchema() { return "{\"type\":\"object\",\"properties\":{}}"; }
            @Override public List<String> getAffectedPaths(JsonNode arguments) { return List.of(); }
            @Override public boolean requiresFileLock() { return false; }
            @Override public boolean shouldRunInBackground() { return false; }
            @Override public String execute(JsonNode arguments) { return ""; }
        });
    }

    private List<String> toolNames(List<Tool> tools) {
        return tools.stream().map(t -> t.getFunction().getName()).toList();
    }

    @Test
    @DisplayName("同会话同 mode 两次调用返回同一快照（引用相等，不再重建）")
    void sameSessionSameMode_reusesSnapshot() {
        registerFakeTool("read_file");
        List<Tool> first = orchestrator.getOrCreateToolsSnapshot("s1", AgentMode.CODING);
        List<Tool> second = orchestrator.getOrCreateToolsSnapshot("s1", AgentMode.CODING);

        assertSame(first, second, "同会话同 mode 必须复用同一快照实例");
        assertEquals(List.of("read_file"), toolNames(first));
    }

    @Test
    @DisplayName("不同会话各自独立快照，互不影响")
    void differentSessions_haveIndependentSnapshots() {
        registerFakeTool("read_file");
        List<Tool> s1 = orchestrator.getOrCreateToolsSnapshot("s1", AgentMode.CODING);
        List<Tool> s2 = orchestrator.getOrCreateToolsSnapshot("s2", AgentMode.CODING);

        assertNotSame(s1, s2);
        assertEquals(toolNames(s1), toolNames(s2));
    }

    @Test
    @DisplayName("mode 变化 → 快照重建（内容按新 mode 过滤）")
    void modeChange_rebuildsSnapshot() {
        registerFakeTool("read_file");
        registerFakeTool("bash");

        List<Tool> coding = orchestrator.getOrCreateToolsSnapshot("s1", AgentMode.CODING);
        List<Tool> chat = orchestrator.getOrCreateToolsSnapshot("s1", AgentMode.CHAT);

        // CODING 含 bash，CHAT 不含（权限过滤）
        assertTrue(toolNames(coding).contains("bash"), "CODING 模式应含 bash");
        assertTrue(!toolNames(chat).contains("bash"), "CHAT 模式不应含 bash");
        assertNotSame(coding, chat, "mode 变化必须重建快照");
    }

    @Test
    @DisplayName("快照后新注册工具不影响已有会话（MCP 晚注册场景）")
    void toolRegisteredAfterSnapshot_doesNotAffectExistingSession() {
        registerFakeTool("read_file");
        List<Tool> snapshot = orchestrator.getOrCreateToolsSnapshot("s1", AgentMode.CODING);
        assertEquals(List.of("read_file"), toolNames(snapshot));

        // 模拟 MCP 晚注册
        registerFakeTool("web_fetch");
        List<Tool> reused = orchestrator.getOrCreateToolsSnapshot("s1", AgentMode.CODING);

        assertSame(snapshot, reused, "快照后注册的新工具不得进入已有会话");
        assertEquals(List.of("read_file"), toolNames(reused));
        // 新会话才能看到新工具（ConcurrentHashMap 迭代顺序不定，用集合语义断言）
        List<Tool> newSession = orchestrator.getOrCreateToolsSnapshot("s2", AgentMode.CODING);
        assertEquals(2, newSession.size(), "新会话应包含快照后注册的工具");
        assertTrue(toolNames(newSession).containsAll(List.of("read_file", "web_fetch")),
            "新会话应同时看到 read_file 与晚注册的 web_fetch，实际: " + toolNames(newSession));
    }
}
