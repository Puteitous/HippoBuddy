package com.example.agent.execute;

import com.example.agent.application.ConversationService;
import com.example.agent.console.AgentUi;
import com.example.agent.core.AgentContext;
import com.example.agent.core.AgentMode;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.logging.ConversationLogger;
import com.example.agent.tools.ToolExecutionException;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.tools.concurrent.ConcurrentToolExecutor;
import com.example.agent.tools.concurrent.ToolExecutionResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ToolCallProcessorTest {

    private ToolRegistry toolRegistry;
    private ConcurrentToolExecutor executor;
    private ConversationService conversationService;
    private Conversation conversation;
    private AgentUi ui;
    private AgentContext context;
    private ToolCallProcessor processor;

    @BeforeEach
    void setUp() throws Exception {
        toolRegistry = new ToolRegistry();
        executor = new ConcurrentToolExecutor(toolRegistry);
        conversationService = mock(ConversationService.class);
        conversation = mock(Conversation.class);
        ui = mock(AgentUi.class);
        context = mock(AgentContext.class);
        when(context.getCurrentMode()).thenReturn(AgentMode.CODING);
        processor = new ToolCallProcessor(context, executor, conversationService, conversation, ui);
    }

    private ToolCall createToolCall(String id, String name, String arguments) {
        ToolCall toolCall = new ToolCall();
        toolCall.setId(id);
        toolCall.setFunction(new FunctionCall(name, arguments));
        return toolCall;
    }

    @Nested
    @DisplayName("边界条件测试")
    class BoundaryTests {

        @Test
        @DisplayName("空工具调用列表应正常处理")
        void testEmptyToolCallsList() {
            List<ToolCall> toolCalls = new ArrayList<>();
            
            assertDoesNotThrow(() -> processor.processToolCallsConcurrently(toolCalls, null));
            
            verify(conversationService, never()).addToolResult(any(Conversation.class), anyString(), anyString(), anyString(), anyBoolean());
        }

        @Test
        @DisplayName("null工具调用列表应正常处理")
        void testNullToolCallsList() {
            assertDoesNotThrow(() -> processor.processToolCallsConcurrently(null, null));
        }

        @Test
        @DisplayName("工具名称为null应跳过")
        void testNullToolName() {
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", null, "{}"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService, never()).addToolResult(any(Conversation.class), anyString(), anyString(), anyString(), anyBoolean());
        }

        @Test
        @DisplayName("工具名称为空字符串应跳过")
        void testEmptyToolName() {
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "", "{}"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService, never()).addToolResult(any(Conversation.class), anyString(), anyString(), anyString(), anyBoolean());
        }

        @Test
        @DisplayName("Function为null应跳过")
        void testNullFunction() {
            ToolCall toolCall = new ToolCall();
            toolCall.setId("call-1");
            toolCall.setFunction(null);
            
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(toolCall);
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService, never()).addToolResult(any(Conversation.class), anyString(), anyString(), anyString(), anyBoolean());
        }
    }

    @Nested
    @DisplayName("工具不存在测试")
    class ToolNotFoundTests {

        @Test
        @DisplayName("工具不存在应返回失败结果，不崩溃")
        void testToolNotExist() {
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "grep", "{}"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService).addToolResult(eq(conversation), 
                eq("call-1"),
                eq("grep"),
                contains("Error:"),
                eq(false)
            );
        }

        @Test
        @DisplayName("多个工具调用中部分不存在应继续执行其他")
        void testPartialToolNotExist() throws ToolExecutionException {
            toolRegistry.register(new MockToolExecutor("bash", "success result"));
            
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "bash", "{}"));
            toolCalls.add(createToolCall("call-2", "grep", "{}"));
            toolCalls.add(createToolCall("call-3", "bash", "{}"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService, times(3)).addToolResult(any(Conversation.class), anyString(), anyString(), anyString(), anyBoolean());
        }
    }

    @Nested
    @DisplayName("成功执行测试")
    class SuccessfulExecutionTests {

        @Test
        @DisplayName("单个工具调用成功执行")
        void testSingleToolCallSuccess() throws ToolExecutionException {
            toolRegistry.register(new MockToolExecutor("bash", "test result"));
            
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "bash", "{\"arg\": \"value\"}"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService).addToolResult(conversation, "call-1", "bash", "test result", true);
        }

        @Test
        @DisplayName("多个工具调用并发执行")
        void testMultipleToolCallsConcurrent() throws ToolExecutionException {
            toolRegistry.register(new MockToolExecutor("bash", "result_a"));
            toolRegistry.register(new MockToolExecutor("glob", "result_b"));
            
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "bash", "{}"));
            toolCalls.add(createToolCall("call-2", "glob", "{}"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService).addToolResult(conversation, "call-1", "bash", "result_a", true);
            verify(conversationService).addToolResult(conversation, "call-2", "glob", "result_b", true);
        }
    }

    @Nested
    @DisplayName("参数解析测试")
    class ArgumentParsingTests {

        @Test
        @DisplayName("无效JSON参数应返回错误")
        void testInvalidJsonArguments() {
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "bash", "not valid json"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService).addToolResult(eq(conversation), 
                eq("call-1"),
                eq("bash"),
                contains("Error:"),
                eq(false)
            );
        }

        @Test
        @DisplayName("null参数应正常处理")
        void testNullArguments() {
            ToolCall toolCall = new ToolCall();
            toolCall.setId("call-1");
            toolCall.setFunction(new FunctionCall("bash", null));
            
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(toolCall);
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService).addToolResult(eq(conversation), 
                eq("call-1"),
                eq("bash"),
                anyString(),
                eq(false)
            );
        }

        @Test
        @DisplayName("空JSON对象参数应正常处理")
        void testEmptyJsonArguments() throws ToolExecutionException {
            toolRegistry.register(new MockToolExecutor("bash", "success"));
            
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "bash", "{}"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService).addToolResult(conversation, "call-1", "bash", "success", true);
        }
    }

    @Nested
    @DisplayName("日志记录测试")
    class LoggingTests {

        @Test
        @DisplayName("成功执行应记录日志")
        void testLogSuccessfulExecution() throws ToolExecutionException {
            toolRegistry.register(new MockToolExecutor("bash", "result"));
            
            ConversationLogger logger = mock(ConversationLogger.class);
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "bash", "{\"key\": \"value\"}"));
            
            processor.processToolCallsConcurrently(toolCalls, logger);
            
            verify(logger).logToolCall(
                eq("bash"),
                eq("{\"key\": \"value\"}"),
                eq("result"),
                anyLong(),
                eq(true)
            );
        }

        @Test
        @DisplayName("失败执行应记录日志")
        void testLogFailedExecution() {
            ConversationLogger logger = mock(ConversationLogger.class);
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "grep", "{}"));
            
            processor.processToolCallsConcurrently(toolCalls, logger);
            
            verify(logger).logToolCall(
                eq("grep"),
                eq("{}"),
                contains("未知的工具"),
                anyLong(),
                eq(false)
            );
        }

        @Test
        @DisplayName("null日志应不崩溃")
        void testNullLogger() throws ToolExecutionException {
            toolRegistry.register(new MockToolExecutor("bash", "result"));
            
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "bash", "{}"));
            
            assertDoesNotThrow(() -> processor.processToolCallsConcurrently(toolCalls, null));
        }
    }

    @Nested
    @DisplayName("混合场景测试")
    class MixedScenarioTests {

        @Test
        @DisplayName("有效和无效工具调用混合")
        void testMixedValidInvalidToolCalls() throws ToolExecutionException {
            toolRegistry.register(new MockToolExecutor("bash", "success"));
            
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(createToolCall("call-1", "bash", "{}"));
            toolCalls.add(createToolCall("call-2", null, "{}"));
            toolCalls.add(createToolCall("call-3", "", "{}"));
            toolCalls.add(createToolCall("call-4", "grep", "{}"));
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService, times(2)).addToolResult(any(Conversation.class), anyString(), anyString(), anyString(), anyBoolean());
        }

        @Test
        @DisplayName("大量工具调用并发执行")
        void testLargeNumberOfToolCalls() throws ToolExecutionException {
            toolRegistry.register(new MockToolExecutor("bash", "result"));
            
            List<ToolCall> toolCalls = new ArrayList<>();
            for (int i = 0; i < 100; i++) {
                toolCalls.add(createToolCall("call-" + i, "bash", "{}"));
            }
            
            processor.processToolCallsConcurrently(toolCalls, null);
            
            verify(conversationService, times(100)).addToolResult(any(Conversation.class), anyString(), anyString(), anyString(), anyBoolean());
        }
    }

    private static class MockToolExecutor implements com.example.agent.tools.ToolExecutor {
        private final String name;
        private final String result;

        MockToolExecutor(String name, String result) {
            this.name = name;
            this.result = result;
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public String getDescription() {
            return "Mock tool for testing";
        }

        @Override
        public String getParametersSchema() {
            return "{\"type\": \"object\"}";
        }

        @Override
        public String execute(JsonNode arguments) throws ToolExecutionException {
            return result;
        }
    }
}
