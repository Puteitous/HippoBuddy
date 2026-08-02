package com.example.agent.web.util;

import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("MessageSanitizer 单元测试")
class MessageSanitizerTest {

    private static ToolCall toolCall(String id, String name) {
        return new ToolCall(id, new FunctionCall(name, "{}"));
    }

    private static Message assistantWithToolCalls(ToolCall... calls) {
        return Message.assistantWithToolCalls(List.of(calls));
    }

    private static Message toolResult(String callId) {
        return Message.toolResult(callId, "bash", "ok");
    }

    // =========================================================
    // 正向校验：assistant(tool_calls) 配对完整性
    // =========================================================
    @Nested
    @DisplayName("正向校验：assistant(tool_calls) 配对完整性")
    class ForwardTests {

        @Test
        @DisplayName("完整配对不清理")
        void completePairKept() {
            List<Message> messages = new ArrayList<>(List.of(
                assistantWithToolCalls(toolCall("call-1", "bash")),
                toolResult("call-1")
            ));
            boolean cleaned = MessageSanitizer.removeOrphanToolCalls(messages);
            assertFalse(cleaned);
            assertEquals(2, messages.size());
        }

        @Test
        @DisplayName("assistant 有 tool_calls 但缺 tool 响应 → 清空 tool_calls")
        void orphanAssistantCleared() {
            List<Message> messages = new ArrayList<>(List.of(
                Message.user("帮我看看文件"),
                assistantWithToolCalls(toolCall("call-1", "read_file"))
            ));
            boolean cleaned = MessageSanitizer.removeOrphanToolCalls(messages);
            assertTrue(cleaned);
            Message assistant = messages.get(1);
            assertNull(assistant.getToolCalls());
            assertNotNull(assistant.getContent());
        }
    }

    // =========================================================
    // 反向校验：孤立 tool 消息（无对应 function_call）
    // =========================================================
    @Nested
    @DisplayName("反向校验：孤立 tool 消息（无对应 function_call）")
    class ReverseTests {

        @Test
        @DisplayName("只有 tool 消息、没有 function_call → 移除")
        void orphanToolRemoved() {
            List<Message> messages = new ArrayList<>(List.of(
                Message.user("执行命令"),
                toolResult("call-orphan")
            ));
            boolean cleaned = MessageSanitizer.removeOrphanToolCalls(messages);
            assertTrue(cleaned);
            assertEquals(1, messages.size());
            assertTrue(messages.get(0).isUser());
        }

        @Test
        @DisplayName("tool 消息 call_id 为空 → 移除")
        void emptyCallIdToolRemoved() {
            Message tool = new Message("tool", "result");
            tool.setToolCallId("");
            List<Message> messages = new ArrayList<>(List.of(
                Message.user("执行命令"),
                tool
            ));
            boolean cleaned = MessageSanitizer.removeOrphanToolCalls(messages);
            assertTrue(cleaned);
            assertEquals(1, messages.size());
        }

        @Test
        @DisplayName("tool 消息 call_id 有对应 function_call → 保留")
        void matchedToolKept() {
            List<Message> messages = new ArrayList<>(List.of(
                assistantWithToolCalls(toolCall("call-1", "bash")),
                toolResult("call-1")
            ));
            boolean cleaned = MessageSanitizer.removeOrphanToolCalls(messages);
            assertFalse(cleaned);
            assertEquals(2, messages.size());
            assertTrue(messages.get(1).isTool());
            assertEquals("call-1", messages.get(1).getToolCallId());
        }

        @Test
        @DisplayName("多轮正常配对中混入孤立 tool → 只移除孤立的")
        void mixedMessages() {
            List<Message> messages = new ArrayList<>(List.of(
                assistantWithToolCalls(toolCall("call-1", "bash")),
                toolResult("call-1"),
                assistantWithToolCalls(toolCall("call-2", "read_file")),
                toolResult("call-2"),
                toolResult("call-ghost") // 无对应 function_call
            ));
            boolean cleaned = MessageSanitizer.removeOrphanToolCalls(messages);
            assertTrue(cleaned);
            assertEquals(4, messages.size());
            // 校验剩余的 tool 消息都是配对的
            for (Message m : messages) {
                if (m.isTool()) {
                    assertTrue("call-1".equals(m.getToolCallId()) || "call-2".equals(m.getToolCallId()));
                }
            }
        }

        @Test
        @DisplayName("压缩摘要后：仅残留 tool 消息 → 全部移除")
        void afterCompactionOnlyToolRemains() {
            // 模拟上下文压缩：assistant(function_call) 被摘要化，只剩 tool 响应残留
            List<Message> messages = new ArrayList<>(List.of(
                Message.system("--- SESSION COMPACTION BOUNDARY ---"),
                Message.user("## 历史摘要\n- 之前执行了文件读取"),
                toolResult("call-lost-1"),
                toolResult("call-lost-2")
            ));
            boolean cleaned = MessageSanitizer.removeOrphanToolCalls(messages);
            assertTrue(cleaned);
            assertEquals(2, messages.size());
        }
    }

    // =========================================================
    // 边界情况
    // =========================================================
    @Test
    @DisplayName("空列表返回 false")
    void emptyList() {
        assertFalse(MessageSanitizer.removeOrphanToolCalls(new ArrayList<>()));
    }

    @Test
    @DisplayName("null 列表返回 false")
    void nullList() {
        assertFalse(MessageSanitizer.removeOrphanToolCalls(null));
    }
}
