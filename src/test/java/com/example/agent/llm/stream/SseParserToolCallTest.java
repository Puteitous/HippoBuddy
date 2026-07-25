package com.example.agent.llm.stream;

import com.example.agent.config.Config;
import com.example.agent.llm.client.OpenAiLlmClient;
import com.example.agent.llm.model.ToolCall;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SseParser ToolCall 边界测试")
class SseParserToolCallTest {

    @Nested
    @DisplayName("🔵 SseParser ToolCall index 边界处理")
    class SseParserIndexTests {

        private final SseParser sseParser = new SseParser();

        @Test
        @DisplayName("恶意构造的大index delta被正确跳过")
        void testMaliciousLargeIndexSkipped() {
            String line = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\": 999999,\"function\":{\"name\":\"malicious\"}}]}}]}";

            StreamChunk chunk = sseParser.parse(line);

            assertNotNull(chunk);
            assertTrue(chunk.isToolCall());
            assertEquals(1, chunk.getToolCallDeltas().size());

            ToolCallDelta delta = chunk.getToolCallDeltas().get(0);
            assertNull(delta.getIndex(), "超出范围的index不应被设置，保持null");
            assertEquals("malicious", delta.getFunction().getName());
        }

        @Test
        @DisplayName("index为负数时被正确跳过")
        void testNegativeIndexSkipped() {
            String line = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\": -100,\"function\":{\"name\":\"negative\"}}]}}]}";

            StreamChunk chunk = sseParser.parse(line);

            ToolCallDelta delta = chunk.getToolCallDeltas().get(0);
            assertNull(delta.getIndex(), "负数index不应被设置");
        }

        @Test
        @DisplayName("边界值MAX_TOOL_CALL_INDEX-1可正常通过")
        void testBoundaryIndexAccepted() {
            String line = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\": 999,\"function\":{\"name\":\"valid\"}}]}}]}";

            StreamChunk chunk = sseParser.parse(line);

            ToolCallDelta delta = chunk.getToolCallDeltas().get(0);
            assertEquals(999, delta.getIndex());
            assertEquals("valid", delta.getFunction().getName());
        }

        @Test
        @DisplayName("arguments超长时被正确截断")
        void testArgumentsTruncated() {
            StringBuilder longArgs = new StringBuilder();
            for (int i = 0; i < 2000; i++) {
                longArgs.append("a");
            }
            String line = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\": 0,\"function\":{\"arguments\":\"" + longArgs + "\"}}]}}]}";

            StreamChunk chunk = sseParser.parse(line);

            ToolCallDelta delta = chunk.getToolCallDeltas().get(0);
            assertTrue(delta.getFunction().getArguments().length() <= 100000, "arguments应被截断到合理长度");
        }
    }

    @Nested
    @DisplayName("🔵 mergeToolCallDeltas 边界处理")
    class MergeToolCallDeltasTests {

        static class TestableLlmClient extends OpenAiLlmClient {
            public TestableLlmClient() {
                super(Config.getInstance());
            }

            @Override
            public void mergeToolCallDeltas(List<ToolCall> toolCalls, List<ToolCallDelta> deltas) {
                super.mergeToolCallDeltas(toolCalls, deltas);
            }
        }

        @Test
        @DisplayName("delta.index为null时正确追加到末尾")
        void testNullIndexAppendsToEnd() {
            TestableLlmClient client = new TestableLlmClient();
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(new ToolCall());
            toolCalls.add(new ToolCall());

            List<ToolCallDelta> deltas = new ArrayList<>();
            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(null);
            ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();
            funcDelta.setName("appended");
            delta.setFunction(funcDelta);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(3, toolCalls.size(), "null index应追加到末尾");
            assertEquals("appended", toolCalls.get(2).getFunction().getName());
        }

        @Test
        @DisplayName("超大index delta被正确跳过")
        void testLargeIndexDeltaSkipped() {
            TestableLlmClient client = new TestableLlmClient();
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(new ToolCall());

            List<ToolCallDelta> deltas = new ArrayList<>();
            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(999999);
            ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();
            funcDelta.setName("skipped");
            delta.setFunction(funcDelta);
            deltas.add(delta);

            int initialSize = toolCalls.size();
            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(initialSize, toolCalls.size(), "超大index不应创建新条目");
        }

        @Test
        @DisplayName("index为null且toolCalls为空时正确创建")
        void testNullIndexWithEmptyList() {
            TestableLlmClient client = new TestableLlmClient();
            List<ToolCall> toolCalls = new ArrayList<>();

            List<ToolCallDelta> deltas = new ArrayList<>();
            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(null);
            ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();
            funcDelta.setName("first");
            delta.setFunction(funcDelta);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(1, toolCalls.size());
            assertEquals("first", toolCalls.get(0).getFunction().getName());
        }
    }
}
