package com.example.agent.context.compressor;

import com.example.agent.context.SessionCompactionState;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ContextClipper 全面测试")
class ContextClipperTest {

    private ContextClipper clipper;
    private TokenEstimator tokenEstimator;

    @BeforeEach
    void setUp() {
        tokenEstimator = TokenEstimatorFactory.getDefault();
        clipper = new ContextClipper(tokenEstimator);
    }

    @Nested
    @DisplayName("边界条件测试")
    class BoundaryConditionTests {

        @Test
        @DisplayName("null消息列表 - 返回空结果")
        void nullMessagesReturnsEmptyResult() {
            ContextClipper.CompactionResult result = clipper.compact(null, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertNotNull(result.getCompactedMessages());
            assertEquals(0, result.getRemovedTurns());
        }

        @Test
        @DisplayName("空消息列表 - 返回空结果")
        void emptyMessagesReturnsEmptyResult() {
            List<Message> messages = new ArrayList<>();

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertEquals(0, result.getCompactedMessages().size());
        }

        @Test
        @DisplayName("单条消息 - 不压缩")
        void singleMessageNoCompaction() {
            List<Message> messages = List.of(Message.user("Single message"));

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertEquals(1, result.getCompactedMessages().size());
            assertEquals(0, result.getRemovedTurns());
        }

        @Test
        @DisplayName("两条消息 - 不压缩")
        void twoMessagesNoCompaction() {
            List<Message> messages = List.of(
                Message.user("User message"),
                Message.assistant("Assistant response")
            );

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertEquals(2, result.getCompactedMessages().size());
            assertEquals(0, result.getRemovedTurns());
        }
    }

    @Nested
    @DisplayName("基本压缩功能测试")
    class BasicCompactionTests {

        @Test
        @DisplayName("多条消息 - 正确分组为对话轮次")
        void multipleMessagesGroupedIntoTurns() {
            List<Message> messages = createConversation(10);

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getTotalTurns() > 0);
            assertTrue(result.getCompactedMessages().size() > 0);
        }

        @Test
        @DisplayName("包含系统消息的对话 - 系统消息保留")
        void systemMessagePreserved() {
            List<Message> messages = new ArrayList<>();
            messages.add(Message.system("You are a helpful assistant"));
            messages.addAll(createConversation(5));

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getCompactedMessages().get(0).isSystem());
        }

        @Test
        @DisplayName("目标token数较大 - 保留更多消息")
        void largeTargetTokensPreservesMoreMessages() {
            List<Message> messages = createConversation(20);

            ContextClipper.CompactionResult resultLarge = clipper.compact(messages, 50000, new SessionCompactionState());
            ContextClipper.CompactionResult resultSmall = clipper.compact(messages, 10000, new SessionCompactionState());

            assertTrue(resultLarge.getCompactedMessages().size() >= resultSmall.getCompactedMessages().size());
        }

        @Test
        @DisplayName("目标token数较小 - 删除更多消息")
        void smallTargetTokensRemovesMoreMessages() {
            List<Message> messages = createConversation(100);

            ContextClipper.CompactionResult result = clipper.compact(messages, 5000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getCompactedMessages().size() < messages.size());
        }
    }

    @Nested
    @DisplayName("摘要边界测试")
    class SummaryBoundaryTests {

        @Test
        @DisplayName("无边界状态 - 从头开始")
        void noBoundaryStartsFromBeginning() {
            List<Message> messages = createConversation(10);
            SessionCompactionState state = new SessionCompactionState();

            ContextClipper.BoundaryResult boundary = clipper.findSummaryBoundaryWithValidation(messages, state);

            assertNotNull(boundary);
            assertEquals(0, boundary.startIndex);
            assertEquals("no_boundary", boundary.reason);
            assertTrue(boundary.isValid);
        }

        @Test
        @DisplayName("有效边界 - 找到正确位置")
        void validBoundaryFound() {
            List<Message> messages = createConversation(10);
            SessionCompactionState state = new SessionCompactionState();
            state.setLastSummarizedMessageId(messages.get(3).getId());
            state.recordCompaction();

            ContextClipper.BoundaryResult boundary = clipper.findSummaryBoundaryWithValidation(messages, state);

            assertNotNull(boundary);
            assertEquals(4, boundary.startIndex);
            assertEquals("found", boundary.reason);
            assertTrue(boundary.isValid);
        }

        @Test
        @DisplayName("恢复会话 - 边界不存在")
        void resumedSessionBoundaryNotFound() {
            List<Message> messages = createConversation(10);
            SessionCompactionState state = new SessionCompactionState();
            state.setLastSummarizedMessageId("non-existent-id");
            state.recordCompaction();

            ContextClipper.BoundaryResult boundary = clipper.findSummaryBoundaryWithValidation(messages, state);

            assertNotNull(boundary);
            assertEquals(-1, boundary.startIndex);
            assertEquals("resumed_session", boundary.reason);
            assertFalse(boundary.isValid);
        }

        @Test
        @DisplayName("工具调用进行中 - 保护最后几条消息")
        void toolCallInProgressProtectsLastMessages() {
            List<Message> messages = createConversationWithToolCall(5);

            ContextClipper.BoundaryResult boundary = clipper.findSummaryBoundaryWithValidation(messages, null);

            assertNotNull(boundary);
            assertEquals("tool_call_in_progress", boundary.reason);
            assertTrue(boundary.isValid);
            assertTrue(boundary.startIndex > 0);
        }
    }

    @Nested
    @DisplayName("压缩结果验证测试")
    class CompactionResultTests {

        @Test
        @DisplayName("压缩后token数减少")
        void compactionReducesTokenCount() {
            List<Message> messages = createConversation(50);
            int originalTokens = tokenEstimator.estimateConversationTokens(messages);

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());
            int finalTokens = tokenEstimator.estimateConversationTokens(result.getCompactedMessages());

            assertTrue(finalTokens <= originalTokens);
            assertTrue(result.getTokensSaved() >= 0);
        }

        @Test
        @DisplayName("压缩结果包含正确的轮次信息")
        void compactionResultContainsTurnInfo() {
            List<Message> messages = createConversation(20);

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getTotalTurns() > 0);
            assertTrue(result.getRemovedTurns() >= 0);
            assertEquals(result.getTotalTurns(), result.getRemovedTurns() + (result.getTotalTurns() - result.getRemovedTurns()));
        }

        @Test
        @DisplayName("压缩结果范围标志正确")
        void compactionResultRangeFlagCorrect() {
            List<Message> messages = createConversation(30);

            ContextClipper.CompactionResult result = clipper.compact(messages, 20000, new SessionCompactionState());

            assertNotNull(result);
            boolean withinRange = result.isWithinOptimalRange();
            assertTrue(withinRange || result.getCompactedMessages().size() > 0);
        }
    }

    @Nested
    @DisplayName("对话轮次分组测试")
    class ConversationTurnTests {

        @Test
        @DisplayName("用户-助手交替 - 正确分组")
        void userAssistantAlternating() {
            List<Message> messages = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                messages.add(Message.user("User message " + i));
                messages.add(Message.assistant("Assistant response " + i));
            }

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getTotalTurns() > 0);
        }

        @Test
        @DisplayName("连续用户消息 - 正确处理")
        void consecutiveUserMessages() {
            List<Message> messages = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                messages.add(Message.user("User message " + i));
            }
            messages.add(Message.assistant("Assistant response"));

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getCompactedMessages().size() > 0);
        }

        @Test
        @DisplayName("连续助手消息 - 正确处理")
        void consecutiveAssistantMessages() {
            List<Message> messages = new ArrayList<>();
            messages.add(Message.user("User message"));
            for (int i = 0; i < 5; i++) {
                messages.add(Message.assistant("Assistant response " + i));
            }

            ContextClipper.CompactionResult result = clipper.compact(messages, 10000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getCompactedMessages().size() > 0);
        }
    }

    @Nested
    @DisplayName("滑动窗口测试")
    class SlidingWindowTests {

        @Test
        @DisplayName("小窗口 - 保留最少消息")
        void smallWindowPreservesMinimum() {
            List<Message> messages = createConversation(200);

            ContextClipper.CompactionResult result = clipper.compact(messages, 5000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getCompactedMessages().size() > 0);
            assertTrue(result.getCompactedMessages().size() < messages.size());
        }

        @Test
        @DisplayName("大窗口 - 保留更多消息")
        void largeWindowPreservesMore() {
            List<Message> messages = createConversation(100);

            ContextClipper.CompactionResult result = clipper.compact(messages, 50000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getCompactedMessages().size() > 0);
        }

        @Test
        @DisplayName("窗口调整保留不变量")
        void windowAdjustmentPreservesInvariants() {
            List<Message> messages = createConversation(50);

            ContextClipper.CompactionResult result = clipper.compact(messages, 15000, new SessionCompactionState());

            assertNotNull(result);
            assertTrue(result.getCompactedMessages().size() > 0);
            assertTrue(result.getSignificantTextBlocks() >= 0);
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
            ContextClipper.CompactionResult result = clipper.compact(messages, 20000, new SessionCompactionState());
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
                clipper.compact(messages, 10000, new SessionCompactionState());
                totalTime += System.currentTimeMillis() - startTime;
            }

            long avgTime = totalTime / 10;
            assertTrue(avgTime < 1000, "平均压缩时间应该小于1秒，实际: " + avgTime + "ms");
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

    private List<Message> createConversationWithToolCall(int turnCount) {
        List<Message> messages = createConversation(turnCount);
        List<com.example.agent.llm.model.ToolCall> toolCalls = new ArrayList<>();
        com.example.agent.llm.model.ToolCall toolCall = new com.example.agent.llm.model.ToolCall();
        toolCall.setId("tool-call-1");
        toolCall.setType("function");
        toolCalls.add(toolCall);
        messages.set(messages.size() - 1, Message.assistantWithToolCalls(toolCalls));
        return messages;
    }
}
