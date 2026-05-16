package com.example.agent.web.orchestrator;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.service.TokenEstimator;
import com.example.agent.testutil.MockLlmClient;
import com.example.agent.testutil.LlmResponseBuilder;
import com.example.agent.tools.ToolExecutionException;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.session.PendingToolCall;
import com.example.agent.web.session.SessionManager;
import com.example.agent.web.session.SessionTokenStats;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.StringWriter;
import java.io.Writer;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@DisplayName("WebAgentOrchestrator 单元测试")
class WebAgentOrchestratorTest {

    private static final String TEST_SESSION_ID = "test-session-orch";
    private static final int DEFAULT_MAX_TOKENS = 4096;

    private MockLlmClient mockLlmClient;
    private ToolRegistry toolRegistry;
    private SessionManager mockSessionManager;
    private ConversationService mockConversationService;
    private TokenEstimator mockTokenEstimator;
    private WebAgentOrchestrator orchestrator;
    private StringWriter stringWriter;
    private SseWriter sseWriter;
    private Conversation conversation;
    private List<Message> baseContext;

    @BeforeEach
    void setUp() throws Exception {
        ServiceLocator.clear();
        SseWriter.removeClientDisconnected();

        mockLlmClient = new MockLlmClient();
        toolRegistry = new ToolRegistry();
        mockSessionManager = mock(SessionManager.class);
        mockConversationService = mock(ConversationService.class);
        mockTokenEstimator = mock(TokenEstimator.class);

        ServiceLocator.registerSingleton(LlmClient.class, mockLlmClient);
        ServiceLocator.registerSingleton(ToolRegistry.class, toolRegistry);
        ServiceLocator.registerSingleton(ConversationService.class, mockConversationService);

        orchestrator = new WebAgentOrchestrator(mockSessionManager);

        stringWriter = new StringWriter();
        sseWriter = new SseWriter(stringWriter);

        conversation = new Conversation(DEFAULT_MAX_TOKENS, mockTokenEstimator, TEST_SESSION_ID);
        Message systemMsg = Message.system("You are a helpful assistant.");
        conversation.addMessage(systemMsg);

        baseContext = new ArrayList<>();
        baseContext.add(systemMsg);

        lenient().when(mockConversationService.getContextForInference(conversation))
            .thenReturn(new ArrayList<>(baseContext));
        lenient().when(mockConversationService.getHistory(conversation))
            .thenReturn(new ArrayList<>(baseContext));
        lenient().doNothing().when(mockConversationService)
            .addAssistantMessage(any(), any(Message.class), any());
        lenient().doNothing().when(mockConversationService)
            .addToolResult(any(), anyString(), anyString(), anyString(), anyBoolean());
        lenient().when(mockSessionManager.getOrCreateSessionTokenStats(TEST_SESSION_ID))
            .thenReturn(new SessionTokenStats());
        lenient().when(mockSessionManager.hasPendingToolCall(TEST_SESSION_ID))
            .thenReturn(false);
    }

    @AfterEach
    void tearDown() {
        SseWriter.removeClientDisconnected();
        ServiceLocator.clear();
    }

    private String sseOutput() {
        return stringWriter.toString();
    }

    private boolean sseContains(String event) {
        return sseOutput().contains("event: " + event + "\n");
    }

    private ToolCall createToolCall(String id, String name, String args) {
        ToolCall tc = new ToolCall();
        tc.setId(id);
        FunctionCall fc = new FunctionCall();
        fc.setName(name);
        fc.setArguments(args);
        tc.setFunction(fc);
        return tc;
    }

    private void registerMockTool(String name, String resultJson) {
        ToolExecutor executor = mock(ToolExecutor.class);
        lenient().when(executor.getName()).thenReturn(name);
        lenient().when(executor.getDescription()).thenReturn("Mock tool: " + name);
        lenient().when(executor.getParametersSchema())
            .thenReturn("{\"type\":\"object\",\"properties\":{}}");
        try {
            lenient().when(executor.execute(any(JsonNode.class))).thenReturn(resultJson);
        } catch (ToolExecutionException e) {
            throw new RuntimeException(e);
        }
        toolRegistry.register(executor);
    }

    private void registerFailingTool(String name) {
        ToolExecutor executor = mock(ToolExecutor.class);
        lenient().when(executor.getName()).thenReturn(name);
        lenient().when(executor.getDescription()).thenReturn("Failing tool: " + name);
        lenient().when(executor.getParametersSchema())
            .thenReturn("{\"type\":\"object\",\"properties\":{}}");
        try {
            lenient().when(executor.execute(any(JsonNode.class)))
                .thenThrow(new ToolExecutionException("模拟工具执行失败: " + name));
        } catch (ToolExecutionException e) {
            throw new RuntimeException(e);
        }
        toolRegistry.register(executor);
    }

    @Nested
    @DisplayName("简单文本响应")
    class SimpleContentTests {

        @Test
        @DisplayName("正常回复应调用 addAssistantMessage 并发送 content 和 done 事件")
        void simpleContentResponse() throws Exception {
            mockLlmClient.enqueueSuccessResponse("Hello, I am Hippo!");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: thinking"), "应有 thinking 事件");
            assertTrue(output.contains("event: content"), "应有 content 事件");
            assertTrue(output.contains("event: done"), "应有 done 事件");
            verify(mockConversationService, atLeastOnce())
                .addAssistantMessage(any(), any(Message.class), any());
        }

        @Test
        @DisplayName("有 reasoning 时应先发 reasoning 再发 content 再发 reasoning_done")
        void contentWithReasoning() throws Exception {
            mockLlmClient.setMockReasoning("让我仔细思考这个问题...");
            mockLlmClient.enqueueSuccessResponse("这是最终答案。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: thinking"), "应有 thinking 事件");
            assertTrue(output.contains("event: reasoning"), "应有 reasoning 事件");
            assertTrue(output.contains("event: reasoning_done"), "应有 reasoning_done 事件");
            assertTrue(output.contains("event: content"), "应有 content 事件");
            assertTrue(output.contains("event: done"), "应有 done 事件");

            int thinkingIdx = output.indexOf("event: thinking");
            int reasoningIdx = output.indexOf("event: reasoning");
            int reasoningDoneIdx = output.indexOf("event: reasoning_done");
            int contentIdx = output.indexOf("event: content");
            int doneIdx = output.indexOf("event: done");

            assertTrue(thinkingIdx < reasoningIdx, "thinking 应在 reasoning 之前");
            assertTrue(reasoningIdx < reasoningDoneIdx, "reasoning 应在 reasoning_done 之前");
            assertTrue(reasoningDoneIdx < contentIdx, "reasoning_done 应在 content 之前");
            assertTrue(contentIdx < doneIdx, "content 应在 done 之前");
        }

        @Test
        @DisplayName("无 reasoning 时应直接输出 content 且无 reasoning/reasoning_done")
        void contentWithoutReasoning() throws Exception {
            mockLlmClient.setMockReasoning(null);
            mockLlmClient.enqueueSuccessResponse("直接输出答案。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: content"), "应有 content 事件");
            assertTrue(output.contains("event: done"), "应有 done 事件");
            assertFalse(output.contains("event: reasoning"), "不应有 reasoning 事件");
            assertFalse(output.contains("event: reasoning_done"), "不应有 reasoning_done 事件");
        }

        @Test
        @DisplayName("LLM 返回空内容时应发送 error 事件")
        void emptyContentResponse() throws Exception {
            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.create().content("").finishReason("stop").build()
            );

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: error"), "空内容应发送 error 事件");
            assertTrue(output.contains("未返回有效内容"), "应提示未返回有效内容");
        }
    }

    @Nested
    @DisplayName("LLM 错误响应处理")
    class ErrorResponseTests {

        @Test
        @DisplayName("finish_reason 为 length 时应输出长度超限错误")
        void lengthFinishReason() throws Exception {
            ChatResponse response = LlmResponseBuilder.create()
                .content("")
                .finishReason("length")
                .build();
            mockLlmClient.enqueueResponse(response);

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: error"), "length 时应有 error 事件");
            assertTrue(output.contains("max_tokens"), "应提示 max_tokens 限制");
        }

        @Test
        @DisplayName("finish_reason 为 content_filter 时应输出内容过滤错误")
        void contentFilterFinishReason() throws Exception {
            ChatResponse response = LlmResponseBuilder.create()
                .content("")
                .finishReason("content_filter")
                .build();
            mockLlmClient.enqueueResponse(response);

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: error"), "content_filter 时应有 error 事件");
            assertTrue(output.contains("安全过滤器"), "应提示安全过滤器");
        }

        @Test
        @DisplayName("finish_reason 未知时应输出通用错误")
        void unknownFinishReason() throws Exception {
            ChatResponse response = LlmResponseBuilder.create()
                .content("")
                .finishReason("error")
                .build();
            mockLlmClient.enqueueResponse(response);

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: error"), "未知 finish_reason 时应有 error 事件");
            assertTrue(output.contains("未返回有效内容"), "应提示未返回有效内容");
        }
    }

    @Nested
    @DisplayName("工具调用")
    class ToolCallTests {

        @Test
        @DisplayName("工具调用流程应发送 tool_start、tool_result 并最终 done")
        void toolCallFlow() throws Exception {
            registerMockTool("read_file", "文件内容: test");

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("read_file", "{\"path\":\"test.txt\"}")
            );
            mockLlmClient.enqueueSuccessResponse("文件读取完毕。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: tool_start"), "应有 tool_start 事件");
            assertTrue(output.contains("event: tool_result"), "应有 tool_result 事件");
            assertTrue(output.contains("event: done"), "最终应有 done 事件");

            verify(mockConversationService, times(1))
                .addToolResult(any(), anyString(), eq("read_file"), anyString(), eq(true));
        }

        @Test
        @DisplayName("同一轮多个工具调用应逐个执行")
        void multipleToolCallsInOneTurn() throws Exception {
            registerMockTool("read_file", "文件内容");
            registerMockTool("grep", "匹配结果");

            List<ToolCall> toolCalls = List.of(
                createToolCall("call-1", "read_file", "{\"path\":\"a.txt\"}"),
                createToolCall("call-2", "grep", "{\"pattern\":\"test\"}")
            );
            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCalls(toolCalls)
            );
            mockLlmClient.enqueueSuccessResponse("全部完成。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();

            int firstToolStart = output.indexOf("event: tool_start");
            int secondToolStart = output.indexOf("event: tool_start", firstToolStart + 1);
            assertTrue(firstToolStart >= 0, "应有第一个 tool_start");
            assertTrue(secondToolStart > firstToolStart, "应有第二个 tool_start");

            verify(mockConversationService, times(2))
                .addToolResult(any(), anyString(), anyString(), anyString(), eq(true));
        }

        @Test
        @DisplayName("工具执行失败应发送 tool_result 并标记 success=false")
        void toolCallFailure() throws Exception {
            registerFailingTool("failing_tool");

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("failing_tool", "{}")
            );
            mockLlmClient.enqueueSuccessResponse("已处理错误。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: tool_result"), "应有 tool_result 事件");
            assertTrue(sseContains("tool_result"), "应有 tool_result");

            verify(mockConversationService, times(1))
                .addToolResult(any(), anyString(), anyString(), anyString(), eq(false));
        }

        @Test
        @DisplayName("ask_user 工具应发送 waiting_user 事件并设置 pending tool call")
        void askUserTool() throws Exception {
            String askUserResult = "{\"question\":\"您确认要执行此操作吗？\",\"options\":[\"是\",\"否\"],\"allow_custom_input\":true}";
            ToolExecutor askUserExecutor = mock(ToolExecutor.class);
            lenient().when(askUserExecutor.getName()).thenReturn("ask_user");
            lenient().when(askUserExecutor.getDescription()).thenReturn("Ask user for input");
            lenient().when(askUserExecutor.getParametersSchema())
                .thenReturn("{\"type\":\"object\",\"properties\":{}}");
            try {
                lenient().when(askUserExecutor.execute(any(JsonNode.class))).thenReturn(askUserResult);
            } catch (ToolExecutionException e) {
                throw new RuntimeException(e);
            }
            toolRegistry.register(askUserExecutor);

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("ask_user", "{\"question\":\"确认？\"}")
            );

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            verify(mockSessionManager).setPendingToolCall(eq(TEST_SESSION_ID), any(PendingToolCall.class));
            String output = sseOutput();
            assertTrue(output.contains("event: waiting_user"), "ask_user 应发送 waiting_user 事件");
        }
    }

    @Nested
    @DisplayName("客户端断开连接")
    class ClientDisconnectionTests {

        @Test
        @DisplayName("执行前断开应跳过所有 SSE 事件并直接返回")
        void disconnectedBeforeExecute() throws Exception {
            mockLlmClient.enqueueSuccessResponse("Hello");

            SseWriter.setClientDisconnected(true);

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            assertTrue(sseOutput().isEmpty(), "断开后不应有任何 SSE 输出");
        }

        @Test
        @DisplayName("流式回调中断开应调用 abortCurrentRequest 并跳过持久化")
        void disconnectDuringStreamAbortsAndSkipsPersistence() throws Exception {
            SseWriter.removeClientDisconnected();

            Writer failAfterThinkingWriter = new Writer() {
                private int eventCount = 0;
                @Override
                public void write(char[] cbuf, int off, int len) throws IOException {
                    String text = new String(cbuf, off, len);
                    if (text.startsWith("event: ")) {
                        eventCount++;
                    }
                    if (eventCount >= 2) {
                        throw new IOException("Broken pipe");
                    }
                }
                @Override
                public void flush() throws IOException {}
                @Override
                public void close() throws IOException {}
            };
            SseWriter disconnectSseWriter = new SseWriter(failAfterThinkingWriter);

            mockLlmClient.enqueueSuccessResponse("Hello, I am Hippo!");

            orchestrator.execute(TEST_SESSION_ID, conversation, disconnectSseWriter);

            assertTrue(mockLlmClient.isAborted(), "客户端断开时应调用 abortCurrentRequest()");
            verify(mockConversationService, never())
                .addAssistantMessage(any(), any(Message.class), any());
        }

        @Test
        @DisplayName("工具执行期间断开应跳过剩余工具调用")
        void disconnectDuringToolExecutionSkipsRemainingTools() throws Exception {
            ToolExecutor disconnectTrigger = mock(ToolExecutor.class);
            lenient().when(disconnectTrigger.getName()).thenReturn("disconnect_trigger");
            lenient().when(disconnectTrigger.getDescription()).thenReturn("Triggers disconnect during execution");
            lenient().when(disconnectTrigger.getParametersSchema())
                .thenReturn("{\"type\":\"object\",\"properties\":{}}");
            try {
                lenient().when(disconnectTrigger.execute(any(JsonNode.class))).thenAnswer(invocation -> {
                    SseWriter.setClientDisconnected(true);
                    return "{}";
                });
            } catch (ToolExecutionException e) {
                throw new RuntimeException(e);
            }
            toolRegistry.register(disconnectTrigger);

            ToolExecutor normalTool = mock(ToolExecutor.class);
            lenient().when(normalTool.getName()).thenReturn("normal_tool");
            lenient().when(normalTool.getDescription()).thenReturn("Normal tool that should be skipped");
            lenient().when(normalTool.getParametersSchema())
                .thenReturn("{\"type\":\"object\",\"properties\":{}}");
            try {
                lenient().when(normalTool.execute(any(JsonNode.class))).thenReturn("normal result");
            } catch (ToolExecutionException e) {
                throw new RuntimeException(e);
            }
            toolRegistry.register(normalTool);

            List<ToolCall> toolCalls = List.of(
                createToolCall("call-1", "disconnect_trigger", "{}"),
                createToolCall("call-2", "normal_tool", "{}")
            );
            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCalls(toolCalls)
            );
            mockLlmClient.enqueueSuccessResponse("Done.");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("\"name\":\"disconnect_trigger\""),
                "第一个工具应有 tool_start 事件");
            assertFalse(output.contains("\"name\":\"normal_tool\""),
                "断开后第二个工具的 tool_start 不应发送");
        }

        @Test
        @DisplayName("多轮：第一轮工具完整执行，第二轮流式输出中断 → 第一轮完整、第二轮不残留")
        void multiTurn_interruptDuringSecondTurnStreaming() throws Exception {
            SseWriter.removeClientDisconnected();

            Writer multiTurnWriter = new Writer() {
                boolean turn2Started = false;
                @Override
                public void write(char[] cbuf, int off, int len) throws IOException {
                    String text = new String(cbuf, off, len);
                    if (text.contains("\"turn\":2")) {
                        turn2Started = true;
                    }
                    if (turn2Started && text.startsWith("event: content")) {
                        throw new IOException("Broken pipe during turn 2 streaming");
                    }
                }
                @Override
                public void flush() throws IOException {}
                @Override
                public void close() throws IOException {}
            };
            SseWriter turn2SseWriter = new SseWriter(multiTurnWriter);

            registerMockTool("tool_turn1", "result from turn 1");

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("tool_turn1", "{}")
            );
            mockLlmClient.enqueueSuccessResponse("Turn 2 response content");

            orchestrator.execute(TEST_SESSION_ID, conversation, turn2SseWriter);

            verify(mockConversationService, times(1))
                .addAssistantMessage(any(), any(Message.class), any());
            verify(mockConversationService, times(1))
                .addToolResult(any(), anyString(), eq("tool_turn1"), anyString(), eq(true));
            assertTrue(mockLlmClient.isAborted(),
                "第二轮流式回调中断开时应调用 abortCurrentRequest()");
        }
    }

    @Nested
    @DisplayName("Token 统计")
    class TokenStatsTests {

        @Test
        @DisplayName("LLM 返回 usage 时应累加到 SessionTokenStats")
        void tokenUsageRecorded() throws Exception {
            SessionTokenStats stats = new SessionTokenStats();
            when(mockSessionManager.getOrCreateSessionTokenStats(TEST_SESSION_ID)).thenReturn(stats);

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.create()
                    .content("Hello")
                    .usage(100, 50)
                    .build()
            );

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            assertEquals(1, stats.llmCalls, "应记录一次 LLM 调用");
            assertEquals(100, stats.totalInputTokens, "应累加输入 Token");
            assertEquals(50, stats.totalOutputTokens, "应累加输出 Token");
            assertEquals(150, stats.totalTokens, "应累加总 Token");
        }

        @Test
        @DisplayName("工具调用应累加 toolCalls 计数")
        void toolCallCountsRecorded() throws Exception {
            SessionTokenStats stats = new SessionTokenStats();
            when(mockSessionManager.getOrCreateSessionTokenStats(TEST_SESSION_ID)).thenReturn(stats);

            registerMockTool("read_file", "内容");
            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("read_file", "{\"path\":\"test.txt\"}")
            );
            mockLlmClient.enqueueSuccessResponse("完成。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            assertTrue(stats.toolCalls >= 1, "应记录工具调用次数");
        }
    }

    @Nested
    @DisplayName("边界情况")
    class EdgeCaseTests {

        @Test
        @DisplayName("无工具调用时应直接以 done 结束")
        void noToolCallsEndsWithDone() throws Exception {
            mockLlmClient.enqueueSuccessResponse("你好");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: done"), "应有 done 事件");
            int lastDone = output.lastIndexOf("event: done");
            int lastContent = output.lastIndexOf("event: content");
            assertTrue(lastContent < lastDone, "content 应在 done 之前");
        }

        @Test
        @DisplayName("LLM 异常应传播给调用方")
        void llmExceptionPropagates() {
            mockLlmClient.setExceptionToThrow(
                new LlmException("模拟 LLM 异常")
            );

            assertThrows(LlmException.class, () ->
                orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter));
        }

        @Test
        @DisplayName("getContextForInference 返回空列表时应优雅处理")
        void emptyContextFromInference() throws Exception {
            when(mockConversationService.getContextForInference(conversation))
                .thenReturn(new ArrayList<>());

            mockLlmClient.enqueueSuccessResponse("Hello");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            assertTrue(output.contains("event: content"), "空列表 context 仍应有 content");
            assertTrue(output.contains("event: done"), "空列表 context 仍应有 done");
        }
    }

    @Nested
    @DisplayName("孤立 ToolCall 清理 (cleanupOrphanToolCalls)")
    class OrphanToolCallCleanupTests {

        @Test
        @DisplayName("相邻破坏：assistant(tool_calls) 后接 user 消息 → 清理并添加中断标记")
        void adjacentBroken_cleansUpOrphanToolCalls() throws Exception {
            ToolCall tc1 = createToolCall("call-1", "read_file", "{\"path\":\"test.txt\"}");
            ToolCall tc2 = createToolCall("call-2", "grep", "{\"pattern\":\"test\"}");
            Message assistantMsg = Message.assistantWithToolCalls(List.of(tc1, tc2));
            assistantMsg.setContent(null);

            List<Message> orphanedMessages = List.of(
                Message.system("You are a helper."),
                Message.user("search and read"),
                assistantMsg,
                Message.user("next query")
            );
            when(mockConversationService.getContextForInference(conversation))
                .thenReturn(new ArrayList<>(orphanedMessages));

            mockLlmClient.enqueueSuccessResponse("Result");
            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            List<Message> sentMessages = mockLlmClient.getLastSentMessages();
            assertNotNull(sentMessages, "chatStream 应被调用并记录消息");
            assertEquals(4, sentMessages.size(), "消息数量应保持不变");
            Message cleanedAssistant = sentMessages.get(2);
            assertTrue(cleanedAssistant.getContent().contains("会话中断"),
                "应添加会话中断标记");
            assertNull(cleanedAssistant.getToolCalls(),
                "tool_calls 应被清空");
        }

        @Test
        @DisplayName("部分响应：部分 tool 有结果部分缺失 → 清理并添加中断标记")
        void partialToolResponses_cleansUpOrphanToolCalls() throws Exception {
            ToolCall tc1 = createToolCall("call-1", "read_file", "{\"path\":\"test.txt\"}");
            ToolCall tc2 = createToolCall("call-2", "grep", "{\"pattern\":\"test\"}");
            Message assistantMsg = Message.assistantWithToolCalls(List.of(tc1, tc2));
            assistantMsg.setContent(null);

            List<Message> orphanedMessages = List.of(
                Message.system("You are a helper."),
                Message.user("search and read"),
                assistantMsg,
                Message.toolResult("call-1", "read_file", "found!")
            );
            when(mockConversationService.getContextForInference(conversation))
                .thenReturn(new ArrayList<>(orphanedMessages));

            mockLlmClient.enqueueSuccessResponse("Result");
            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            List<Message> sentMessages = mockLlmClient.getLastSentMessages();
            assertNotNull(sentMessages);
            assertEquals(3, sentMessages.size(),
                "tool_calls 清空后关联的 tool_result 也会被移除，所以共 3 条");
            Message cleanedAssistant = sentMessages.get(2);
            assertTrue(cleanedAssistant.getContent().contains("会话中断"),
                "孤立 tool_calls 应添加会话中断标记");
            assertNull(cleanedAssistant.getToolCalls(),
                "tool_calls 应被清空");
        }

        @Test
        @DisplayName("全部响应：所有 tool 都有对应 tool_result → 不清理")
        void allToolResultsPresent_noCleanup() throws Exception {
            ToolCall tc1 = createToolCall("call-1", "read_file", "{\"path\":\"test.txt\"}");
            ToolCall tc2 = createToolCall("call-2", "grep", "{\"pattern\":\"test\"}");
            Message assistantMsg = Message.assistantWithToolCalls(List.of(tc1, tc2));
            assistantMsg.setContent(null);

            List<Message> completeMessages = List.of(
                Message.system("You are a helper."),
                Message.user("search and read"),
                assistantMsg,
                Message.toolResult("call-1", "read_file", "found!"),
                Message.toolResult("call-2", "grep", "matched!")
            );
            when(mockConversationService.getContextForInference(conversation))
                .thenReturn(new ArrayList<>(completeMessages));

            mockLlmClient.enqueueSuccessResponse("Result");
            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            List<Message> sentMessages = mockLlmClient.getLastSentMessages();
            assertNotNull(sentMessages);
            assertEquals(5, sentMessages.size());
            Message unchangedAssistant = sentMessages.get(2);
            assertFalse(unchangedAssistant.getContent() != null && unchangedAssistant.getContent().contains("会话中断"),
                "全部响应时不应添加会话中断标记");
            assertNotNull(unchangedAssistant.getToolCalls(),
                "全部响应时 tool_calls 应保留");
            assertEquals(2, unchangedAssistant.getToolCalls().size(),
                "全部响应时 tool_calls 数量应不变");
        }

        @Test
        @DisplayName("无 tool_calls：assistant 不含工具调用 → 跳过清理")
        void noToolCalls_skipsCleanup() throws Exception {
            List<Message> normalMessages = List.of(
                Message.system("You are a helper."),
                Message.user("hello"),
                Message.assistant("normal response")
            );
            when(mockConversationService.getContextForInference(conversation))
                .thenReturn(new ArrayList<>(normalMessages));

            mockLlmClient.enqueueSuccessResponse("Next result");
            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            List<Message> sentMessages = mockLlmClient.getLastSentMessages();
            assertNotNull(sentMessages);
            assertEquals(3, sentMessages.size());
            Message assistant = sentMessages.get(2);
            assertNull(assistant.getToolCalls(), "普通 assistant 无 tool_calls");
            assertEquals("normal response", assistant.getContent());
        }

        @Test
        @DisplayName("空 tool_calls 列表 → 跳过清理")
        void emptyToolCalls_skipsCleanup() throws Exception {
            Message assistantMsg = Message.assistantWithToolCalls(new ArrayList<>());
            assistantMsg.setContent("some content");

            List<Message> messages = List.of(
                Message.system("You are a helper."),
                Message.user("hello"),
                assistantMsg
            );
            when(mockConversationService.getContextForInference(conversation))
                .thenReturn(new ArrayList<>(messages));

            mockLlmClient.enqueueSuccessResponse("Next result");
            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            List<Message> sentMessages = mockLlmClient.getLastSentMessages();
            assertNotNull(sentMessages);
            Message assistant = sentMessages.get(2);
            assertTrue(assistant.getToolCalls() == null || assistant.getToolCalls().isEmpty(),
                "空 tool_calls 的 assistant 不应被修改");
            assertEquals("some content", assistant.getContent());
        }
    }
}
