package com.example.agent.llm.model;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ChatRequest 构造参数校验测试")
class ChatRequestValidationTest {

    @Nested
    @DisplayName("🔵 model 参数边界校验")
    class ModelValidationTests {

        private final List<Message> validMessages = List.of(new Message("user", "test"));

        @Test
        @DisplayName("null model 抛出异常")
        void testNullModelThrows() {
            assertThrows(IllegalArgumentException.class, () -> ChatRequest.of(null, validMessages));
        }

        @Test
        @DisplayName("空字符串 model 抛出异常")
        void testEmptyModelThrows() {
            assertThrows(IllegalArgumentException.class, () -> ChatRequest.of("", validMessages));
        }

        @Test
        @DisplayName("空白字符串 model 抛出异常")
        void testBlankModelThrows() {
            assertThrows(IllegalArgumentException.class, () -> ChatRequest.of("   \t\n", validMessages));
        }

        @Test
        @DisplayName("有效model前后空白被trim")
        void testModelTrimmed() {
            ChatRequest request = ChatRequest.of("  gpt-4o  ", validMessages);
            assertEquals("gpt-4o", request.getModel());
        }

        @Test
        @DisplayName("setModel null抛出异常")
        void testSetModelNullThrows() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages);
            assertThrows(IllegalArgumentException.class, () -> request.setModel(null));
        }

        @Test
        @DisplayName("setModel空字符串抛出异常")
        void testSetModelEmptyThrows() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages);
            assertThrows(IllegalArgumentException.class, () -> request.setModel(""));
        }
    }

    @Nested
    @DisplayName("🔵 messages 参数边界校验")
    class MessagesValidationTests {

        @Test
        @DisplayName("null messages 抛出异常")
        void testNullMessagesThrows() {
            assertThrows(IllegalArgumentException.class, () -> ChatRequest.of("gpt-4o", null));
        }

        @Test
        @DisplayName("空列表 messages 抛出异常")
        void testEmptyMessagesThrows() {
            assertThrows(IllegalArgumentException.class, () -> ChatRequest.of("gpt-4o", new ArrayList<>()));
        }

        @Test
        @DisplayName("单元素列表 messages 正常构造")
        void testSingleMessageAccepted() {
            List<Message> messages = List.of(new Message("user", "test"));
            ChatRequest request = ChatRequest.of("gpt-4o", messages);
            assertEquals(1, request.getMessages().size());
        }

        @Test
        @DisplayName("setMessages null抛出异常")
        void testSetMessagesNullThrows() {
            ChatRequest request = ChatRequest.of("gpt-4o", List.of(new Message("user", "test")));
            assertThrows(IllegalArgumentException.class, () -> request.setMessages(null));
        }

        @Test
        @DisplayName("setMessages空列表抛出异常")
        void testSetMessagesEmptyThrows() {
            ChatRequest request = ChatRequest.of("gpt-4o", List.of(new Message("user", "test")));
            assertThrows(IllegalArgumentException.class, () -> request.setMessages(new ArrayList<>()));
        }

        @Test
        @DisplayName("messages包含null元素构造成功")
        void testNullElementInMessages() {
            List<Message> messages = new ArrayList<>();
            messages.add(new Message("user", "test"));
            messages.add(null);
            ChatRequest request = ChatRequest.of("gpt-4o", messages);
            assertEquals(2, request.getMessages().size());
        }
    }

    @Nested
    @DisplayName("🔵 链式调用边界测试")
    class BuilderChainTests {

        private final List<Message> validMessages = List.of(new Message("user", "test"));

        @Test
        @DisplayName("stream(true)自动设置streamOptions")
        void testStreamTrueSetsOptions() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).stream(true);
            assertTrue(request.getStream());
            assertNotNull(request.getStreamOptions());
        }

        @Test
        @DisplayName("stream(false)清空streamOptions")
        void testStreamFalseClearsOptions() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).stream(true).stream(false);
            assertFalse(request.getStream());
            assertNull(request.getStreamOptions());
        }

        @Test
        @DisplayName("tools(null)可设置无异常")
        void testToolsNullAllowed() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).tools(null);
            assertNull(request.getTools());
        }

        @Test
        @DisplayName("tools(empty list)可设置无异常")
        void testToolsEmptyListAllowed() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).tools(new ArrayList<>());
            assertNotNull(request.getTools());
            assertTrue(request.getTools().isEmpty());
        }

        @Test
        @DisplayName("toolChoiceFunction(null)正常工作")
        void testToolChoiceFunctionNull() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).toolChoiceFunction(null);
            assertNotNull(request.getToolChoice());
        }

        @Test
        @DisplayName("所有链式调用返回this以支持链式")
        void testAllChainsReturnThis() {
            ChatRequest base = ChatRequest.of("gpt-4o", validMessages);

            assertSame(base, base.maxTokens(100));
            assertSame(base, base.temperature(0.7));
            assertSame(base, base.topP(0.9));
            assertSame(base, base.stream(true));
            assertSame(base, base.tools(null));
            assertSame(base, base.toolChoiceAuto());
            assertSame(base, base.toolChoiceNone());
            assertSame(base, base.toolChoiceRequired());
            assertSame(base, base.toolChoiceFunction("test"));
        }
    }

    @Nested
    @DisplayName("🔵 reasoning_content 序列化（DeepSeek 400 兼容）")
    class ReasoningContentSerializationTests {

        private final ObjectMapper objectMapper = new ObjectMapper();

        @Test
        @DisplayName("assistant + reasoning + tool_calls + null content → 不输出 content 字段")
        void testReasoningWithToolCallsOmitsContent() throws Exception {
            ToolCall toolCall = new ToolCall();
            toolCall.setId("call-123");
            FunctionDefinition func = new FunctionDefinition("get_weather", "Get weather");
            toolCall.setFunction(func);

            Message msg = Message.assistantWithToolCalls(List.of(toolCall), "我需要先查日期");
            msg.setContent(null);

            ChatRequest request = ChatRequest.of("deepseek-v4-pro", List.of(
                Message.user("今天杭州天气怎么样？"),
                msg
            ));

            String json = objectMapper.writeValueAsString(request);
            JsonNode root = objectMapper.readTree(json);
            JsonNode messages = root.get("messages");

            assertTrue(messages.isArray(), "messages 应该是数组");
            assertEquals(2, messages.size());

            JsonNode assistantMsg = messages.get(1);
            assertEquals("assistant", assistantMsg.get("role").asText());
            assertTrue(assistantMsg.has("reasoning_content"), "应包含 reasoning_content");
            assertEquals("我需要先查日期", assistantMsg.get("reasoning_content").asText());
            assertTrue(assistantMsg.has("tool_calls"), "应包含 tool_calls");
            assertFalse(assistantMsg.has("content"), "content 应为 null 不序列化");
        }

        @Test
        @DisplayName("assistant + reasoning + content + null tool_calls → 输出 reasoning_content 和 content")
        void testReasoningWithContent() throws Exception {
            Message msg = Message.assistant("今天杭州多云，7~13°C");
            msg.setReasoningContent("查到了天气数据");

            ChatRequest request = ChatRequest.of("deepseek-v4-pro", List.of(
                Message.user("杭州天气怎么样？"),
                msg
            ));

            String json = objectMapper.writeValueAsString(request);
            JsonNode root = objectMapper.readTree(json);
            JsonNode assistantMsg = root.get("messages").get(1);

            assertEquals("assistant", assistantMsg.get("role").asText());
            assertTrue(assistantMsg.has("reasoning_content"), "应包含 reasoning_content");
            assertTrue(assistantMsg.has("content"), "应包含 content");
        }

        @Test
        @DisplayName("assistant + null reasoning + null tool_calls → 不输出 reasoning_content")
        void testNoReasoningOmitsField() throws Exception {
            ChatRequest request = ChatRequest.of("deepseek-v4-pro", List.of(
                Message.user("你好"),
                Message.assistant("你好！有什么可以帮你的？")
            ));

            String json = objectMapper.writeValueAsString(request);
            JsonNode assistantMsg = objectMapper.readTree(json).get("messages").get(1);

            assertFalse(assistantMsg.has("reasoning_content"), "无 reasoning 时不输出该字段");
        }
    }

    @Nested
    @DisplayName("🔵 null参数特殊处理")
    class NullParameterTests {

        private final List<Message> validMessages = List.of(new Message("user", "test"));

        @Test
        @DisplayName("maxTokens(null)可设置")
        void testMaxTokensNullAllowed() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).maxTokens(null);
            assertNull(request.getMaxTokens());
        }

        @Test
        @DisplayName("temperature(null)可设置")
        void testTemperatureNullAllowed() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).temperature(null);
            assertNull(request.getTemperature());
        }

        @Test
        @DisplayName("topP(null)可设置")
        void testTopPNullAllowed() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).topP(null);
            assertNull(request.getTopP());
        }

        @Test
        @DisplayName("stream(null)可设置且清空options")
        void testStreamNullAllowed() {
            ChatRequest request = ChatRequest.of("gpt-4o", validMessages).stream(true).stream(null);
            assertNull(request.getStream());
            assertNull(request.getStreamOptions());
        }
    }
}
