package com.example.agent.replay;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.session.TranscriptLoader;
import com.example.agent.testutil.MockLlmClient;
import com.example.agent.tools.BashTool;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.orchestrator.WebAgentOrchestrator;
import com.example.agent.web.session.WebSessionManager;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.StringWriter;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 无密钥回放测试骨架（MVP）。
 * <p>
 * 用录制的 LLM 响应序列（fixture）驱动完整 agent 循环，断言工具调用被真正执行、
 * 工具结果回填到下一次请求、且转录记录结构化 detail。改代码后无 key 回归，
 * 行为漂移会在「LLM 收到的消息」与「转录结构」上暴露。
 */
class AgentLoopReplayTest {

    @TempDir
    Path tempDir;

    private MockLlmClient mockLlmClient;
    private ConversationService conversationService;
    private WebAgentOrchestrator orchestrator;

    @BeforeEach
    void setUp() throws Exception {
        WorkspaceManager.overrideBasePath(tempDir);
        mockLlmClient = new MockLlmClient();
        TokenEstimator tokenEstimator = TokenEstimatorFactory.getDefault();
        conversationService = new ConversationService(tokenEstimator, mockLlmClient);

        ToolRegistry toolRegistry = new ToolRegistry();
        toolRegistry.register(new BashTool());

        ServiceLocator.registerSingleton(LlmClient.class, mockLlmClient);
        ServiceLocator.registerSingleton(ConversationService.class, conversationService);
        ServiceLocator.registerSingleton(ToolRegistry.class, toolRegistry);

        // 预热 BashTool 首次初始化（chcp 编码探测缓存 + BashProcessManager 单例）：
        // 组合跑时若由 orchestrator 触发首次探测，偶发读到空输出导致 4c 不稳定。
        BashTool.setCurrentToolCallId(null);
        ObjectNode warmupArgs = new ObjectMapper().createObjectNode();
        warmupArgs.put("command", "echo prewarm");
        new BashTool().execute(warmupArgs);

        orchestrator = new WebAgentOrchestrator(WebSessionManager.getInstance());
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    @Test
    void replayBasicBashTurn() throws Exception {
        // 1. 加载夹具并喂给 mock LLM（无 key）
        ReplayFixture fixture = ReplayFixture.load("replay/basic-bash-replay.json");
        fixture.responses().forEach(mockLlmClient::enqueueResponse);

        // 2. 准备会话与用户消息
        String sessionId = "replay-basic-" + System.currentTimeMillis();
        Conversation conversation = conversationService.create("You are a helpful assistant", 4000, sessionId);
        conversationService.addUserMessage(conversation, fixture.userPrompt());

        // 3. 驱动完整 agent 循环
        orchestrator.execute(sessionId, conversation, new SseWriter(new StringWriter()));
        // 转录为异步批量刷盘，读取前强制落盘
        conversationService.flushTranscript(sessionId);

        // 4. 断言
        // 4a. 夹具的 2 次 LLM 响应被按序消费（循环完整跑完；流式调用记录在 recordedMessages）
        assertEquals(2, mockLlmClient.getRecordedMessages().size(),
            "agent 循环应消费夹具中全部 LLM 响应");

        // 4b. 第二次请求（总结前）必须包含 bash 工具结果回填
        List<Message> lastRequest = mockLlmClient.getLastSentMessages();
        assertTrue(lastRequest.stream().anyMatch(m -> m.isTool() && "bash".equals(m.getName())),
            "工具结果应回填到下一次 LLM 请求");

        // 4c. 转录记录了结构化 detail（exitCode=0、output 含 hello）——本次 stderr/结构化改动的端到端验证
        TranscriptLoader.LoadResult loaded = TranscriptLoader.load(
            WorkspaceManager.getSessionMessagesFile(sessionId));
        assertTrue(loaded.getMessages().stream()
                .filter(Message::isTool)
                .anyMatch(m -> m.getToolResultDetail() != null
                    && Integer.valueOf(0).equals(m.getToolResultDetail().get("exitCode"))
                    && String.valueOf(m.getToolResultDetail().get("output")).contains("hello")),
            "转录应含 bash 的结构化 detail");

        // 4d. 会话以夹具的总结文本收尾
        Message last = conversation.getMessages().get(conversation.getMessages().size() - 1);
        assertTrue(last.isAssistant() && "已执行 echo hello，输出为 hello。".equals(last.getContent()),
            "最终 assistant 消息应为夹具总结，实际: " + last.getContent());
    }
}
