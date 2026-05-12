package com.example.agent.web.util;

import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("MessageConverter 单元测试")
class MessageConverterTest {

    private MessageConverter converter;

    @BeforeEach
    void setUp() {
        converter = new MessageConverter();
    }

    @Nested
    @DisplayName("convertMessages 基础过滤")
    class BasicFilteringTests {

        @Test
        @DisplayName("空列表返回空列表")
        void emptyListReturnsEmpty() {
            List<Map<String, Object>> result = converter.convertMessages(new ArrayList<>());
            assertTrue(result.isEmpty());
        }

        @Test
        @DisplayName("过滤 system 角色的消息")
        void filtersSystemMessages() {
            List<Message> messages = List.of(
                Message.system("你是助手"),
                Message.user("你好").withId("msg-1")
            );

            List<Map<String, Object>> result = converter.convertMessages(messages);

            assertEquals(1, result.size());
            assertEquals("你好", result.get(0).get("content"));
        }

        @Test
        @DisplayName("过滤空白内容且无 tool_calls 的消息")
        void filtersBlankContentWithoutToolCalls() {
            List<Message> messages = List.of(
                new Message("user", "").withId("msg-1"),
                Message.user("hello").withId("msg-2")
            );

            List<Map<String, Object>> result = converter.convertMessages(messages);

            assertEquals(1, result.size());
            assertEquals("hello", result.get(0).get("content"));
        }
    }

    @Nested
    @DisplayName("convertMessages 普通消息转换")
    class NormalMessageConversionTests {

        @Test
        @DisplayName("正常 user 和 assistant 消息保留 id/role/content")
        void preservesIdRoleContent() {
            Message userMsg = Message.user("你好").withId("uid-1");
            Message asstMsg = Message.assistant("你好！有什么可以帮你的？").withId("aid-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(userMsg, asstMsg));

            assertEquals(2, result.size());
            assertEquals("uid-1", result.get(0).get("id"));
            assertEquals("user", result.get(0).get("role"));
            assertEquals("你好", result.get(0).get("content"));
            assertEquals("aid-1", result.get(1).get("id"));
            assertEquals("assistant", result.get(1).get("role"));
            assertEquals("你好！有什么可以帮你的？", result.get(1).get("content"));
        }

        @Test
        @DisplayName("包含 reasoning_content 时一并转换")
        void includesReasoningContent() {
            Message asstMsg = Message.assistantWithToolCalls(null, "思考过程");
            asstMsg.setContent("最终答案");
            asstMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(asstMsg));

            assertEquals(1, result.size());
            assertEquals("最终答案", result.get(0).get("content"));
            assertEquals("思考过程", result.get(0).get("reasoning_content"));
        }
    }

    @Nested
    @DisplayName("convertMessages tool_calls 转换")
    class ToolCallConversionTests {

        @Test
        @DisplayName("assistant 消息的 tool_calls 列表正确转换")
        void convertsAssistantToolCalls() {
            ToolCall tc1 = new ToolCall("call-1", new FunctionCall("get_weather", "{\"city\":\"北京\"}"));
            ToolCall tc2 = new ToolCall("call-2", new FunctionCall("get_time", "{}"));
            Message asstMsg = Message.assistantWithToolCalls(List.of(tc1, tc2));
            asstMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(asstMsg));

            assertEquals(1, result.size());
            List<Map<String, Object>> calls = (List<Map<String, Object>>) result.get(0).get("tool_calls");
            assertEquals(2, calls.size());
            assertEquals("get_weather", calls.get(0).get("name"));
            assertEquals("{\"city\":\"北京\"}", calls.get(0).get("arguments"));
            assertEquals("get_time", calls.get(1).get("name"));
        }

        @Test
        @DisplayName("空白内容但有 tool_calls 时不被过滤")
        void keepsBlankContentWithToolCalls() {
            ToolCall tc = new ToolCall("call-1", new FunctionCall("search", "{\"q\":\"test\"}"));
            Message asstMsg = Message.assistantWithToolCalls(List.of(tc));
            asstMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(asstMsg));

            assertEquals(1, result.size());
            assertNotNull(result.get(0).get("tool_calls"));
        }
    }

    @Nested
    @DisplayName("convertMessages tool 角色 success 推断")
    class ToolSuccessInferenceTests {

        @Test
        @DisplayName("tool 消息包含 toolName 和 toolCallId")
        void includesToolNameAndToolCallId() {
            Message toolMsg = Message.toolResult("tc-1", "calculator", "42");
            toolMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(toolMsg));

            assertEquals(1, result.size());
            assertEquals("calculator", result.get(0).get("toolName"));
            assertEquals("tc-1", result.get(0).get("toolCallId"));
        }

        @Test
        @DisplayName("tool 消息成功时 success 默认为 true")
        void successDefaultsToTrue() {
            Message toolMsg = Message.toolResult("tc-1", "calculator", "42");
            toolMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(toolMsg));

            assertEquals(true, result.get(0).get("success"));
        }

        @Test
        @DisplayName("tool 消息含错误关键词时 success 为 false")
        void errorKeywordsSetSuccessFalse() {
            Message toolMsg = Message.toolResult("tc-1", "file_write", "执行失败：权限拒绝");
            toolMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(toolMsg));

            assertEquals(false, result.get(0).get("success"));
        }

        @Test
        @DisplayName("tool 消息含 error: 关键词时 success 为 false")
        void errorColonKeywordSetsSuccessFalse() {
            Message toolMsg = Message.toolResult("tc-1", "api_call", "error: connection timeout");
            toolMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(toolMsg));

            assertEquals(false, result.get(0).get("success"));
        }

        @Test
        @DisplayName("tool 消息含 cancelled 关键词时 success 为 false")
        void cancelledKeywordSetsSuccessFalse() {
            Message toolMsg = Message.toolResult("tc-1", "db_query", "Query cancelled by user");
            toolMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(toolMsg));

            assertEquals(false, result.get(0).get("success"));
        }

        @Test
        @DisplayName("tool 消息空白内容时被过滤（与原始 extractMessages 行为一致）")
        void blankContentToolIsFiltered() {
            Message toolMsg = Message.toolResult("tc-1", "noop", "");
            toolMsg.setId("msg-1");

            List<Map<String, Object>> result = converter.convertMessages(List.of(toolMsg));

            assertTrue(result.isEmpty());
        }
    }

    @Nested
    @DisplayName("convertMessages 混合场景")
    class MixedScenariosTests {

        @Test
        @DisplayName("多种类型消息混合转换")
        void convertsMixedMessageTypes() {
            List<Message> messages = List.of(
                Message.system("system prompt"),
                Message.user("查询天气").withId("u-1"),
                Message.assistantWithToolCalls(List.of(
                    new ToolCall("call-1", new FunctionCall("get_weather", "{\"city\":\"北京\"}"))
                )).withId("a-1"),
                Message.toolResult("call-1", "get_weather", "晴天 25°C").withId("t-1"),
                Message.assistant("北京今天晴天").withId("a-2")
            );

            List<Map<String, Object>> result = converter.convertMessages(messages);

            assertEquals(4, result.size());
            assertEquals("user", result.get(0).get("role"));
            assertEquals("assistant", result.get(1).get("role"));
            assertNotNull(result.get(1).get("tool_calls"));
            assertEquals("tool", result.get(2).get("role"));
            assertEquals(true, result.get(2).get("success"));
            assertEquals("assistant", result.get(3).get("role"));
            assertEquals("北京今天晴天", result.get(3).get("content"));
        }

        @Test
        @DisplayName("空白消息全部过滤后返回空列表")
        void allBlankMessagesReturnsEmpty() {
            List<Message> messages = List.of(
                new Message("user", "").withId("u-1"),
                new Message("assistant", "").withId("a-1"),
                new Message("user", "  ").withId("u-2")
            );

            List<Map<String, Object>> result = converter.convertMessages(messages);

            assertTrue(result.isEmpty());
        }
    }
}
