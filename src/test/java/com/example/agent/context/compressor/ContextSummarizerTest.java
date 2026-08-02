package com.example.agent.context.compressor;

import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ContextSummarizer 全面测试")
class ContextSummarizerTest {

    private ContextSummarizer summarizer;
    private TokenEstimator tokenEstimator;

    @BeforeEach
    void setUp() {
        tokenEstimator = TokenEstimatorFactory.getDefault();
        CompactForkExecutor mockForkExecutor = new CompactForkExecutor(null, null, tokenEstimator);
        summarizer = new ContextSummarizer(tokenEstimator, mockForkExecutor);
    }

    @Nested
    @DisplayName("边界条件测试")
    class BoundaryConditionTests {

        @Test
        @DisplayName("空消息列表 - 降级摘要")
        void emptyMessagesFallbackSummary() {
            List<Message> messages = new ArrayList<>();

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.size() >= 2);
            assertTrue(result.get(0).isSystem());
        }

        @Test
        @DisplayName("单条消息 - 正常处理")
        void singleMessageHandled() {
            List<Message> messages = List.of(Message.user("Single message"));

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.size() >= 2);
        }

        @Test
        @DisplayName("两条消息 - 正常处理")
        void twoMessagesHandled() {
            List<Message> messages = List.of(
                Message.user("User message"),
                Message.assistant("Assistant response")
            );

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.size() >= 2);
        }
    }

    @Nested
    @DisplayName("基本压缩功能测试")
    class BasicCompactionTests {

        @Test
        @DisplayName("多条消息 - 正确压缩")
        void multipleMessagesCompacted() {
            List<Message> messages = createConversation(10);

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.size() > 0);
            assertTrue(result.size() < messages.size());
        }

        @Test
        @DisplayName("包含系统消息 - 系统消息保留")
        void systemMessagePreserved() {
            List<Message> messages = new ArrayList<>();
            messages.add(Message.system("You are a helpful assistant"));
            messages.addAll(createConversation(5));

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.get(0).isSystem());
        }

        @Test
        @DisplayName("压缩后包含摘要头")
        void compactionContainsSummaryHeader() {
            List<Message> messages = createConversation(10);

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            boolean hasBoundary = result.stream()
                .anyMatch(m -> m.isSystem() && m.getContent().contains("COMPACTION BOUNDARY"));
            assertTrue(hasBoundary);
        }

        @Test
        @DisplayName("压缩后包含摘要内容")
        void compactionContainsSummaryContent() {
            List<Message> messages = createConversation(10);

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            boolean hasSummary = result.stream()
                .anyMatch(m -> m.getContent() != null && m.getContent().contains("AutoCompact"));
            assertTrue(hasSummary);
        }
    }

    @Nested
    @DisplayName("摘要结果测试")
    class SummaryResultTests {

        @Test
        @DisplayName("压缩后生成结果对象")
        void compactionGeneratesResult() {
            List<Message> messages = createConversation(10);

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
        }

        @Test
        @DisplayName("结果包含正确的合并计数")
        void resultContainsCorrectMergeCount() {
            List<Message> messages = createConversation(10);

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            assertTrue(result.getMergedCount() > 0);
            assertTrue(result.getMergedCount() <= messages.size() / 2);
        }

        @Test
        @DisplayName("结果包含token信息")
        void resultContainsTokenInfo() {
            List<Message> messages = createConversation(10);

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            assertTrue(result.getTokenCountBefore() > 0);
            assertTrue(result.getTokenCountAfter() > 0);
        }

        @Test
        @DisplayName("结果包含摘要文本")
        void resultContainsSummaryText() {
            List<Message> messages = createConversation(10);

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            assertNotNull(result.getSummary());
            assertFalse(result.getSummary().isEmpty());
        }
    }

    @Nested
    @DisplayName("自定义指令测试")
    class CustomInstructionTests {

        @Test
        @DisplayName("设置自定义指令 - 影响摘要生成")
        void setCustomInstructionAffectsSummary() {
            summarizer.setCustomInstruction("请只保留技术决策");

            List<Message> messages = createConversation(10);
            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.size() > 0);
        }

        @Test
        @DisplayName("设置空指令 - 使用默认指令")
        void setEmptyInstructionUsesDefault() {
            summarizer.setCustomInstruction("");

            List<Message> messages = createConversation(10);
            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.size() > 0);
        }

        @Test
        @DisplayName("设置null指令 - 使用默认指令")
        void setNullInstructionUsesDefault() {
            summarizer.setCustomInstruction(null);

            List<Message> messages = createConversation(10);
            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.size() > 0);
        }

        @Test
        @DisplayName("多次设置指令 - 只有最后一次生效")
        void multipleInstructionSettings() {
            summarizer.setCustomInstruction("指令1");
            summarizer.setCustomInstruction("指令2");

            List<Message> messages = createConversation(10);
            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
        }
    }

    @Nested
    @DisplayName("消息分割测试")
    class MessageSplitTests {

        @Test
        @DisplayName("偶数消息 - 对半分割")
        void evenMessagesSplitHalf() {
            List<Message> messages = createConversation(10);

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            assertTrue(result.getMergedCount() > 0);
        }

        @Test
        @DisplayName("奇数消息 - 正确分割")
        void oddMessagesSplitCorrectly() {
            List<Message> messages = createConversation(11);

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            assertTrue(result.getMergedCount() > 0);
        }

        @Test
        @DisplayName("大量消息 - 正确分割")
        void largeMessagesSplitCorrectly() {
            List<Message> messages = createConversation(100);

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            assertTrue(result.getMergedCount() > 0);
            assertTrue(result.getMergedCount() < messages.size());
        }
    }

    @Nested
    @DisplayName("降级摘要测试")
    class FallbackSummaryTests {

        @Test
        @DisplayName("无LLM客户端 - 使用降级摘要")
        void noLlmClientUsesFallback() {
            List<Message> messages = createConversation(10);

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            ContextSummarizer.CompactionResult summaryResult = summarizer.getLastResult();
            assertNotNull(summaryResult);
            assertNotNull(summaryResult.getSummary());
        }

        @Test
        @DisplayName("空消息 - 降级摘要格式正确")
        void emptyMessagesFallbackFormat() {
            List<Message> messages = new ArrayList<>();

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            assertTrue(result.getSummary().contains("对话历史为空") || 
                      result.getSummary().contains("历史摘要"));
        }

        @Test
        @DisplayName("单条消息 - 降级摘要包含预览")
        void singleMessageFallbackContainsPreview() {
            List<Message> messages = List.of(Message.user("This is a test message with some content"));

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            assertNotNull(result.getSummary());
        }
    }

    @Nested
    @DisplayName("性能测试")
    class PerformanceTests {

        @Test
        @DisplayName("大量消息压缩性能")
        void largeMessageCompactionPerformance() {
            List<Message> messages = createConversation(200);

            long startTime = System.currentTimeMillis();
            List<Message> result = summarizer.compact(messages, 20000);
            long duration = System.currentTimeMillis() - startTime;

            assertNotNull(result);
            assertTrue(duration < 5000, "压缩200条消息应该在5秒内完成，实际耗时: " + duration + "ms");
        }

        @Test
        @DisplayName("重复压缩性能稳定")
        void repeatedCompactionPerformance() {
            List<Message> messages = createConversation(50);

            long totalTime = 0;
            for (int i = 0; i < 10; i++) {
                long startTime = System.currentTimeMillis();
                summarizer.compact(messages, 10000);
                totalTime += System.currentTimeMillis() - startTime;
            }

            long avgTime = totalTime / 10;
            assertTrue(avgTime < 1000, "平均压缩时间应该小于1秒，实际: " + avgTime + "ms");
        }
    }

    @Nested
    @DisplayName("工具调用对完整性测试（L4）")
    class ToolPairIntegrityTests {

        private List<Message> createToolConversation(int turnCount) {
            List<Message> messages = new ArrayList<>();
            for (int i = 0; i < turnCount; i++) {
                messages.add(Message.user("User question " + i + " " + "x".repeat(50)));
                ToolCall tc = new ToolCall("call-" + i, new FunctionCall("bash", "{}"));
                messages.add(Message.assistantWithToolCalls(List.of(tc)));
                messages.add(Message.toolResult("call-" + i, "bash", "result " + i));
            }
            return messages;
        }

        /**
         * 校验结果中每条 tool 消息的 call_id 都必须在结果中有对应的 function_call。
         */
        private void assertNoOrphanTool(List<Message> result) {
            java.util.Set<String> knownIds = new java.util.HashSet<>();
            for (Message m : result) {
                if (m.isAssistant() && m.getToolCalls() != null) {
                    for (ToolCall tc : m.getToolCalls()) {
                        if (tc.getId() != null && !tc.getId().isEmpty()) {
                            knownIds.add(tc.getId());
                        }
                    }
                }
            }
            for (Message m : result) {
                if (m.isTool()) {
                    assertTrue(knownIds.contains(m.getToolCallId()),
                        "压缩结果中存在孤立 tool 消息: call_id=" + m.getToolCallId());
                }
            }
        }

        @Test
        @DisplayName("工具调用对不跨切分点：压缩结果无孤立 tool 消息")
        void toolPairNeverSplitAcrossBoundary() {
            List<Message> messages = createToolConversation(5); // 15 条

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertNoOrphanTool(result);
        }

        @Test
        @DisplayName("偶数轮次工具对同样保持完整")
        void evenToolTurnsKeptComplete() {
            List<Message> messages = createToolConversation(6); // 18 条

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertNoOrphanTool(result);
        }

        @Test
        @DisplayName("保留区（toKeep）首条必须是 user 消息")
        void keptRegionStartsWithUser() {
            List<Message> messages = createToolConversation(8); // 24 条

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            // 找到摘要边界后的第一条真实历史消息
            boolean afterBoundary = false;
            for (Message m : result) {
                if (m.isSystem() && m.getContent() != null
                    && m.getContent().contains("COMPACTION BOUNDARY")) {
                    afterBoundary = true;
                    continue;
                }
                if (afterBoundary && m.isUser()) {
                    return; // 找到，符合预期
                }
            }
            fail("保留区首条消息不是 user（未找到摘要边界后的 user 消息）");
        }

        @Test
        @DisplayName("纯对话（无工具调用）压缩行为不受影响")
        void plainConversationUnaffected() {
            List<Message> messages = createConversation(10);

            List<Message> result = summarizer.compact(messages, 10000);

            assertNotNull(result);
            assertTrue(result.size() > 0);
            assertTrue(result.size() < messages.size());
        }

        @Test
        @DisplayName("合并数量保持在对半附近（压缩力度不退化）")
        void mergeCountNearHalf() {
            List<Message> messages = createToolConversation(8); // 24 条

            summarizer.compact(messages, 10000);

            ContextSummarizer.CompactionResult result = summarizer.getLastResult();
            assertNotNull(result);
            // 轮次边界切分可能略偏离对半（±1 轮 = 3 条），但不该严重退化
            assertTrue(result.getMergedCount() > 0);
            assertTrue(result.getMergedCount() <= messages.size() / 2 + 3,
                "合并数量偏离对半过多: merged=" + result.getMergedCount()
                    + ", size=" + messages.size());
        }
    }

    private List<Message> createConversation(int turnCount) {
        List<Message> messages = new ArrayList<>();
        for (int i = 0; i < turnCount; i++) {
            messages.add(Message.user("User question " + i + " " + "x".repeat(100)));
            messages.add(Message.assistant("Assistant response " + i + " " + "y".repeat(100)));
        }
        return messages;
    }
}
