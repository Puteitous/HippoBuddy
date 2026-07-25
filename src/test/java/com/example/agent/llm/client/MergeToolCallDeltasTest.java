package com.example.agent.llm.client;

import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.stream.ToolCallDelta;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DisplayName("mergeToolCallDeltas边界条件测试")
class MergeToolCallDeltasTest {

    private TestableLlmClient client;

    static class TestableLlmClient extends OpenAiLlmClient {
        public TestableLlmClient() {
            super(com.example.agent.testutil.TestConfigFactory.Llm.createTestConfig());
        }

        @Override
        public void mergeToolCallDeltas(List<ToolCall> toolCalls, List<ToolCallDelta> deltas) {
            super.mergeToolCallDeltas(toolCalls, deltas);
        }
    }

    @BeforeEach
    void setUp() {
        client = new TestableLlmClient();
    }

    @Nested
    @DisplayName("🔴 安全边界测试 - 数组越界防护")
    class ArrayIndexBoundaryTests {

        @Test
        @DisplayName("index等于MAX_TOOL_CALL_INDEX应该被跳过")
        void testIndexAtMaxBoundary() {
            List<ToolCall> toolCalls = new ArrayList<>();
            List<ToolCallDelta> deltas = new ArrayList<>();

            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(1000);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(0, toolCalls.size(), "index=1000应该被跳过");
        }

        @Test
        @DisplayName("index超过MAX_TOOL_CALL_INDEX应该被跳过")
        void testIndexExceedingMax() {
            List<ToolCall> toolCalls = new ArrayList<>();
            List<ToolCallDelta> deltas = new ArrayList<>();

            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(9999);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(0, toolCalls.size(), "index超过上限应该被跳过");
        }

        @Test
        @DisplayName("正常范围的index应该正确处理")
        void testIndexWithinRange() {
            List<ToolCall> toolCalls = new ArrayList<>();
            List<ToolCallDelta> deltas = new ArrayList<>();

            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(0);
            ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();
            funcDelta.setName("test_function");
            delta.setFunction(funcDelta);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(1, toolCalls.size(), "index=0应该正确处理");
        }
    }

    @Nested
    @DisplayName("🔴 OOM防护测试 - 数量上限防护")
    class OomProtectionTests {

        @Test
        @DisplayName("toolCalls数量超过上限时停止添加")
        void testStopAddingWhenSizeExceedsMax() {
            List<ToolCall> toolCalls = new ArrayList<>();
            for (int i = 0; i < 1001; i++) {
                toolCalls.add(new ToolCall());
            }
            List<ToolCallDelta> deltas = new ArrayList<>();

            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(0);
            deltas.add(delta);

            int initialSize = toolCalls.size();

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(initialSize, toolCalls.size(), "超过上限时不应再添加新ToolCall");
        }

        @Test
        @DisplayName("空delta列表不做处理")
        void testEmptyDeltas() {
            List<ToolCall> toolCalls = new ArrayList<>();
            client.mergeToolCallDeltas(toolCalls, new ArrayList<>());
            assertEquals(0, toolCalls.size());
        }

        @Test
        @DisplayName("null delta列表不做处理")
        void testNullDeltas() {
            List<ToolCall> toolCalls = new ArrayList<>();
            client.mergeToolCallDeltas(toolCalls, null);
            assertEquals(0, toolCalls.size());
        }
    }

    @Nested
    @DisplayName("🔴 参数截断防护测试")
    class ArgumentsTruncationTests {

        @Test
        @DisplayName("arguments超过长度限制时被截断")
        void testArgumentsTruncatedWhenExceedingMaxLength() {
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(new ToolCall());
            List<ToolCallDelta> deltas = new ArrayList<>();

            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(0);
            ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();
            
            StringBuilder longArgs = new StringBuilder();
            for (int i = 0; i < 2000; i++) {
                longArgs.append("{\"param\":\"value").append(i).append("\"},");
            }
            funcDelta.setArguments(longArgs.toString());
            delta.setFunction(funcDelta);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            FunctionCall function = toolCalls.get(0).getFunction();
            assertNotNull(function);
            assertTrue(function.getArguments().length() <= 100000, "arguments应该被截断到安全长度");
        }

        @Test
        @DisplayName("多次delta累积超长参数正确合并")
        void testMultipleDeltaArgumentsMergedCorrectly() {
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(new ToolCall());
            List<ToolCallDelta> deltas = new ArrayList<>();

            for (int i = 0; i < 5; i++) {
                ToolCallDelta delta = new ToolCallDelta();
                delta.setIndex(0);
                ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();
                funcDelta.setArguments("part" + i);
                delta.setFunction(funcDelta);
                deltas.add(delta);
            }

            client.mergeToolCallDeltas(toolCalls, deltas);

            String args = toolCalls.get(0).getFunction().getArguments();
            assertTrue(args.contains("part0") && args.contains("part4"));
        }
    }

    @Nested
    @DisplayName("🔴 边界值测试")
    class EdgeCaseTests {

        @Test
        @DisplayName("delta.index为null时使用list大小作为索引")
        void testNullIndexUsesListSize() {
            List<ToolCall> toolCalls = new ArrayList<>();
            toolCalls.add(new ToolCall());
            List<ToolCallDelta> deltas = new ArrayList<>();

            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(null);
            ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();
            funcDelta.setName("function_name");
            delta.setFunction(funcDelta);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(2, toolCalls.size(), "null index应该追加到末尾");
        }

        @Test
        @DisplayName("负数index使用list大小作为索引")
        void testNegativeIndexUsesListSize() {
            List<ToolCall> toolCalls = new ArrayList<>();
            List<ToolCallDelta> deltas = new ArrayList<>();

            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(-1);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(1, toolCalls.size(), "负数index应该追加到末尾");
        }

        @Test
        @DisplayName("中间空隙自动填充")
        void testGapFilledAutomatically() {
            List<ToolCall> toolCalls = new ArrayList<>();
            List<ToolCallDelta> deltas = new ArrayList<>();

            ToolCallDelta delta = new ToolCallDelta();
            delta.setIndex(2);
            ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();
            funcDelta.setName("test");
            delta.setFunction(funcDelta);
            deltas.add(delta);

            client.mergeToolCallDeltas(toolCalls, deltas);

            assertEquals(3, toolCalls.size(), "中间空隙应该自动填充");
            assertNotNull(toolCalls.get(2).getFunction());
        }
    }
}
