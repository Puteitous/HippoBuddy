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
import com.example.agent.llm.model.WebSearchAction;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.StringWriter;
import java.io.Writer;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import org.mockito.ArgumentCaptor;

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
        if (sseWriter != null) {
            sseWriter.close();
        }
        SseWriter.removeClientDisconnected();
        ServiceLocator.clear();
    }

    private String sseOutput() {
        // SseWriter 已异步化：先等后台发送线程排空队列，再读取输出，保证断言完整
        if (sseWriter != null) {
            sseWriter.awaitFlush();
        }
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

        @Test
        @DisplayName("tool_result SSE 输出应包含合法 JSON（id、name、success、args）")
        void toolResultSseIsValidJson() throws Exception {
            registerMockTool("read_file", "文件内容: test");

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("read_file", "{\"path\":\"test.txt\"}")
            );
            mockLlmClient.enqueueSuccessResponse("文件读取完毕。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            // 提取 tool_result 的 data 部分并验证 JSON 合法性
            String output = sseOutput();
            String[] lines = output.split("\n");
            ObjectMapper mapper = new ObjectMapper();
            boolean foundToolResult = false;

            for (int i = 0; i < lines.length; i++) {
                if (lines[i].equals("event: tool_result") && i + 1 < lines.length) {
                    String dataLine = lines[i + 1];
                    assertTrue(dataLine.startsWith("data: "), "tool_result 后一行应是 data: 开头");
                    String json = dataLine.substring(6); // 去掉 "data: "

                    JsonNode node = mapper.readTree(json);
                    assertTrue(node.has("id"), "tool_result JSON 应包含 id 字段");
                    assertTrue(node.has("name"), "tool_result JSON 应包含 name 字段");
                    assertTrue(node.has("success"), "tool_result JSON 应包含 success 字段");
                    assertTrue(node.has("args"), "tool_result JSON 应包含 args 字段");
                    assertEquals("read_file", node.get("name").asText());
                    assertTrue(node.get("success").asBoolean());
                    assertTrue(node.get("result").asText().contains("文件内容"));
                    foundToolResult = true;
                }
            }
            assertTrue(foundToolResult, "应发送 tool_result 事件");
        }

        @Test
        @DisplayName("tool_start SSE 输出应包含合法 JSON（id、name、args）")
        void toolStartSseIsValidJson() throws Exception {
            registerMockTool("read_file", "文件内容");

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("read_file", "{\"path\":\"test.txt\"}")
            );
            mockLlmClient.enqueueSuccessResponse("完成。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            String[] lines = output.split("\n");
            ObjectMapper mapper = new ObjectMapper();
            boolean foundToolStart = false;

            for (int i = 0; i < lines.length; i++) {
                if (lines[i].equals("event: tool_start") && i + 1 < lines.length) {
                    String dataLine = lines[i + 1];
                    assertTrue(dataLine.startsWith("data: "), "tool_start 后一行应是 data: 开头");
                    String json = dataLine.substring(6);

                    JsonNode node = mapper.readTree(json);
                    assertTrue(node.has("id"), "tool_start JSON 应包含 id 字段");
                    assertTrue(node.has("name"), "tool_start JSON 应包含 name 字段");
                    assertTrue(node.has("args"), "tool_start JSON 应包含 args 字段");
                    assertEquals("read_file", node.get("name").asText());
                    foundToolStart = true;
                }
            }
            assertTrue(foundToolStart, "应发送 tool_start 事件");
        }

        @Test
        @DisplayName("工具执行失败时 tool_result 应包含 success=false 及 error 信息")
        void toolResultErrorContainsErrorField() throws Exception {
            // 注意：必须使用 CODING 白名单内的工具名，否则会被模式权限拦截，
            // 走的是"不允许使用工具"分支而非真实执行失败分支。
            registerFailingTool("read_file");

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("read_file", "{}")
            );
            mockLlmClient.enqueueSuccessResponse("已处理。");

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            String output = sseOutput();
            String[] lines = output.split("\n");
            ObjectMapper mapper = new ObjectMapper();
            boolean foundErrorResult = false;

            for (int i = 0; i < lines.length; i++) {
                if (lines[i].equals("event: tool_result") && i + 1 < lines.length) {
                    String dataLine = lines[i + 1];
                    String json = dataLine.substring(6);
                    JsonNode node = mapper.readTree(json);
                    if (!node.get("success").asBoolean()) {
                        assertTrue(node.has("error"), "失败的 tool_result 应包含 error 字段");
                        assertTrue(node.get("error").asText().contains("模拟工具执行失败"));
                        assertTrue(node.has("id"), "失败的 tool_result 应包含 id 字段");
                        assertTrue(node.has("name"), "失败的 tool_result 应包含 name 字段");
                        foundErrorResult = true;
                    }
                }
            }
            assertTrue(foundErrorResult, "应发送失败的 tool_result 事件");
        }
    }

    @Nested
    @DisplayName("客户端断开连接")
    class ClientDisconnectionTests {

        @Test
        @DisplayName("断开标志不影响 Agent 执行（后台继续运行）")
        void disconnectedFlagDoesNotBlockExecution() throws Exception {
            // 设计变更（2026-07-27, 69f0404）：断开客户端不终止 Agent 执行。
            // 生产代码不再读取 SseWriter.isClientDisconnected()，Agent 照常输出并持久化。
            mockLlmClient.enqueueSuccessResponse("Hello");

            SseWriter.setClientDisconnected(true);

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            assertFalse(sseOutput().isEmpty(), "断开标志不应阻止 SSE 输出");
            assertTrue(sseContains("done"), "Agent 应正常完成");
            verify(mockConversationService, atLeastOnce())
                .addAssistantMessage(any(), any(Message.class), any());
        }

        @Test
        @DisplayName("流式回调中断开后 Agent 继续执行并持久化（后台恢复）")
        void disconnectDuringStreamContinuesAndPersists() throws Exception {
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

            // 新设计：断开后不 abort、Agent 继续执行并写入 conversation.jsonl
            assertFalse(mockLlmClient.isAborted(), "客户端断开后不应 abort 请求（后台继续执行）");
            verify(mockConversationService, atLeastOnce())
                .addAssistantMessage(any(), any(Message.class), any());

            disconnectSseWriter.close();
        }

        @Test
        @DisplayName("工具执行期间客户端断开后剩余工具仍会执行（后台继续）")
        void disconnectDuringToolExecutionContinuesRemainingTools() throws Exception {
            registerMockTool("read_file", "first result");
            registerMockTool("grep", "second result");

            // 用 Writer 在第一个 tool_result 之后抛 IOException 模拟客户端断开，
            // 验证断开后剩余工具仍会执行（新设计：后台继续，不跳过剩余工具）。
            Writer disconnectWriter = new Writer() {
                private int eventCount = 0;
                @Override
                public void write(char[] cbuf, int off, int len) throws IOException {
                    String text = new String(cbuf, off, len);
                    if (text.startsWith("event: ")) {
                        eventCount++;
                    }
                    // thinking(1) + tool_start#1(2) + tool_result#1(3) 之后断开
                    if (eventCount >= 4) {
                        throw new IOException("Broken pipe");
                    }
                }
                @Override
                public void flush() throws IOException {}
                @Override
                public void close() throws IOException {}
            };
            SseWriter disconnectSseWriter = new SseWriter(disconnectWriter);

            List<ToolCall> toolCalls = List.of(
                createToolCall("call-1", "read_file", "{\"path\":\"a.txt\"}"),
                createToolCall("call-2", "grep", "{\"pattern\":\"test\"}")
            );
            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCalls(toolCalls)
            );
            mockLlmClient.enqueueSuccessResponse("Done.");

            orchestrator.execute(TEST_SESSION_ID, conversation, disconnectSseWriter);

            // 两个工具都应执行并持久化（断开不中断剩余工具）
            verify(mockConversationService, times(2))
                .addToolResult(any(), anyString(), anyString(), anyString(), eq(true));

            disconnectSseWriter.close();
        }

        @Test
        @DisplayName("多轮：第二轮流式输出中断后 Agent 仍完成执行并持久化（后台恢复）")
        void multiTurn_interruptDuringSecondTurnStreaming_continuesAndPersists() throws Exception {
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

            registerMockTool("read_file", "result from turn 1");

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.withToolCall("read_file", "{}")
            );
            mockLlmClient.enqueueSuccessResponse("Turn 2 response content");

            orchestrator.execute(TEST_SESSION_ID, conversation, turn2SseWriter);

            // 新设计：断开后不 abort，第二轮仍照常持久化（共 2 次 addAssistantMessage）
            assertFalse(mockLlmClient.isAborted(),
                "第二轮流式回调中断开后不应 abort（后台继续执行）");
            verify(mockConversationService, times(2))
                .addAssistantMessage(any(), any(Message.class), any());
            verify(mockConversationService, times(1))
                .addToolResult(any(), anyString(), eq("read_file"), anyString(), eq(true));

            turn2SseWriter.close();
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

    @Nested
    @DisplayName("safeArgs 兜底 (反射调用私有方法)")
    class SafeArgsGracefulDegradationTests {

        private Method safeArgsMethod;
        private Method buildToolResultJsonMethod;

        @BeforeEach
        void setUpReflection() throws Exception {
            safeArgsMethod = WebAgentOrchestrator.class.getDeclaredMethod("safeArgs", String.class, String.class);
            safeArgsMethod.setAccessible(true);
            buildToolResultJsonMethod = WebAgentOrchestrator.class.getDeclaredMethod(
                "buildToolResultJson", String.class, String.class, boolean.class,
                String.class, String.class, String.class, String.class);
            buildToolResultJsonMethod.setAccessible(true);
        }

        @Test
        @DisplayName("非法 JSON → 返回 textNode，不抛异常")
        void invalidJson_returnsTextNode() throws Exception {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode result = (JsonNode) safeArgsMethod.invoke(orchestrator, "纯文本参数", "tc-invalid");
            assertInstanceOf(TextNode.class, result, "非法 JSON 应返回 TextNode");
            assertEquals("纯文本参数", result.asText());

            // 通过 buildToolResultJson 验证整体输出仍是合法 JSON
            String json = (String) buildToolResultJsonMethod.invoke(orchestrator,
                "tc-1", "test_tool", false, null, "error msg", "纯文本参数", "tc-1");
            JsonNode node = mapper.readTree(json);
            assertTrue(node.has("id"), "即使 args 非法，id 字段仍存在");
            assertTrue(node.has("args"), "即使 args 非法，args 字段仍存在");
            assertEquals("纯文本参数", node.get("args").asText(), "args 降级为文本值");
        }

        @Test
        @DisplayName("null arguments → 返回空字符串 textNode")
        void nullJson_returnsEmptyTextNode() throws Exception {
            JsonNode result = (JsonNode) safeArgsMethod.invoke(orchestrator, (String) null, "tc-null");
            assertInstanceOf(TextNode.class, result, "null 应返回 TextNode");
            assertEquals("", result.asText(), "null 输入应返回空字符串");
        }

        @Test
        @DisplayName("合法 JSON → 返回 ObjectNode，保持嵌套结构")
        void validJson_returnsObjectNode() throws Exception {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode result = (JsonNode) safeArgsMethod.invoke(orchestrator,
                "{\"path\":\"test.txt\",\"content\":\"hello\"}", "tc-valid");
            assertInstanceOf(ObjectNode.class, result, "合法 JSON 应返回 ObjectNode");
            assertEquals("test.txt", result.get("path").asText());
            assertEquals("hello", result.get("content").asText());

            // 通过 buildToolResultJson 验证嵌套结构保持
            String json = (String) buildToolResultJsonMethod.invoke(orchestrator,
                "tc-1", "test_tool", true, "ok", null, "{\"path\":\"test.txt\"}", "tc-1");
            JsonNode node = mapper.readTree(json);
            assertTrue(node.get("args").isObject(), "合法 JSON 的 args 应为对象");
            assertEquals("test.txt", node.get("args").get("path").asText());
        }

        @Test
        @DisplayName("空字符串 arguments → 返回空字符串 textNode")
        void emptyString_returnsEmptyTextNode() throws Exception {
            JsonNode result = (JsonNode) safeArgsMethod.invoke(orchestrator, "", "tc-empty");
            assertInstanceOf(TextNode.class, result, "空字符串应返回 TextNode");
            assertEquals("", result.asText());
        }
    }

    @Nested
    @DisplayName("联网搜索动作透传")
    class WebSearchActionTests {

        @Test
        @DisplayName("非流式响应带 web_search_actions 时落库的 assistant 消息携带该字段")
        void nonStreamingWebSearchActionsPersisted() throws Exception {
            // 非流式路径：parseResponsesBody 已在 message 上设置 web_search_actions
            WebSearchAction search = new WebSearchAction();
            search.setType("search");
            search.setQueries(List.of("人工智能 最新新闻", "AI news today"));
            search.setStatus("completed");

            WebSearchAction openPage = new WebSearchAction();
            openPage.setType("open_page");
            openPage.setUrl("https://news.youth.cn/1#ws_call_id=ws_2");
            openPage.setStatus("completed");

            mockLlmClient.enqueueResponse(
                LlmResponseBuilder.create()
                    .content("已搜索完成。")
                    .webSearched(true)
                    .webSearchActions(List.of(search, openPage))
                    .build()
            );

            orchestrator.execute(TEST_SESSION_ID, conversation, sseWriter);

            ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);
            verify(mockConversationService).addAssistantMessage(any(), messageCaptor.capture(), any());
            Message saved = messageCaptor.getValue();

            assertTrue(saved.isWebSearched(), "落库消息应携带 web_searched 标记");
            assertNotNull(saved.getWebSearchActions(), "落库消息应携带 web_search_actions");
            assertEquals(2, saved.getWebSearchActions().size());
            assertEquals("search", saved.getWebSearchActions().get(0).getType());
            assertEquals(List.of("人工智能 最新新闻", "AI news today"),
                saved.getWebSearchActions().get(0).getQueries());
            assertEquals("https://news.youth.cn/1#ws_call_id=ws_2",
                saved.getWebSearchActions().get(1).getUrl());
        }

        @Test
        @DisplayName("mergeWebSearchActions 按指纹去重流式与非流式来源")
        void mergeWebSearchActionsDeduplicates() throws Exception {
            Method mergeMethod = WebAgentOrchestrator.class.getDeclaredMethod(
                "mergeWebSearchActions", List.class, List.class);
            mergeMethod.setAccessible(true);

            // 流式来源：search（queries）+ open_page（url）
            WebSearchAction streamSearch = new WebSearchAction();
            streamSearch.setType("search");
            streamSearch.setQueries(List.of("AI news today"));
            streamSearch.setStatus("completed");

            WebSearchAction streamOpen = new WebSearchAction();
            streamOpen.setType("open_page");
            streamOpen.setUrl("https://a.example.com#ws_call_id=a");
            streamOpen.setStatus("completed");

            // 非流式来源：search 与流式重复（应去重）+ find_in_page（应保留）
            WebSearchAction nonStreamSearch = new WebSearchAction();
            nonStreamSearch.setType("search");
            nonStreamSearch.setQueries(List.of("AI news today"));
            nonStreamSearch.setStatus("completed");

            WebSearchAction nonStreamFind = new WebSearchAction();
            nonStreamFind.setType("find_in_page");
            nonStreamFind.setUrl("https://a.example.com#ws_call_id=a");
            nonStreamFind.setPattern("OpenAI");
            nonStreamFind.setStatus("completed");

            @SuppressWarnings("unchecked")
            List<WebSearchAction> merged = (List<WebSearchAction>) mergeMethod.invoke(
                orchestrator,
                List.of(streamSearch, streamOpen),
                List.of(nonStreamSearch, nonStreamFind)
            );

            assertNotNull(merged);
            assertEquals(3, merged.size(),
                "search 去重（流式/非流式各一份 → 合并为 1）+ open_page + find_in_page = 3");
            // 顺序：流式优先，去重保留首个
            assertEquals("search", merged.get(0).getType());
            assertEquals("open_page", merged.get(1).getType());
            assertEquals("find_in_page", merged.get(2).getType());
        }

        @Test
        @DisplayName("mergeWebSearchActions 处理 null 入参（流式无 action 时）")
        void mergeWebSearchActionsHandlesNull() throws Exception {
            Method mergeMethod = WebAgentOrchestrator.class.getDeclaredMethod(
                "mergeWebSearchActions", List.class, List.class);
            mergeMethod.setAccessible(true);

            WebSearchAction nonStreamSearch = new WebSearchAction();
            nonStreamSearch.setType("search");
            nonStreamSearch.setQueries(List.of("关键词A"));
            nonStreamSearch.setStatus("completed");

            @SuppressWarnings("unchecked")
            List<WebSearchAction> merged = (List<WebSearchAction>) mergeMethod.invoke(
                orchestrator, null, List.of(nonStreamSearch));

            assertNotNull(merged, "null 流式来源不应抛异常");
            assertEquals(1, merged.size());
            assertEquals("search", merged.get(0).getType());

            @SuppressWarnings("unchecked")
            List<WebSearchAction> bothNull = (List<WebSearchAction>) mergeMethod.invoke(
                orchestrator, null, null);
            assertNotNull(bothNull, "双 null 应返回空列表而非抛异常");
            assertTrue(bothNull.isEmpty());
        }
    }
}
