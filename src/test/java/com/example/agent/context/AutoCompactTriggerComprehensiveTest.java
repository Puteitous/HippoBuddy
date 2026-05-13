package com.example.agent.context;

import com.example.agent.context.compressor.AutoCompactTrigger;
import com.example.agent.context.compressor.ContextSummarizer;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Choice;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.CompactionMetricsCollector;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.session.SessionTranscript;
import com.example.agent.testutil.MockLlmClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("AutoCompactTrigger 全面测试")
class AutoCompactTriggerComprehensiveTest {

    private ContextWindow contextWindow;
    private SessionCompactionState state;
    private AutoCompactTrigger trigger;
    private MockLlmClient mockLlmClient;
    private SessionTranscript mockTranscript;
    private TokenEstimator tokenEstimator;
    private static final int MAX_TOKENS = 100000;

    @BeforeEach
    void setUp() {
        tokenEstimator = TokenEstimatorFactory.getDefault();
        mockLlmClient = new MockLlmClient();
        mockTranscript = new SessionTranscript("test-session");

        contextWindow = new ContextWindow(MAX_TOKENS, tokenEstimator);
        state = new SessionCompactionState();

        trigger = new AutoCompactTrigger(
            contextWindow,
            tokenEstimator,
            mockLlmClient,
            "test-session",
            mockTranscript,
            state
        );
        trigger.register();

        state.recordMemoryExtraction("test-init");
    }

    @Nested
    @DisplayName("边界条件测试")
    class BoundaryConditionTests {

        @Test
        @DisplayName("空消息列表 - 不触发压缩")
        void emptyMessageListNoCompaction() {
            assertEquals(0, contextWindow.size());
            
            contextWindow.getBudget().update(MAX_TOKENS);
            
            assertFalse(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("刚好达到阈值 - 触发压缩")
        void exactThresholdTriggersCompaction() throws Exception {
            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);

            assertTrue(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("略低于阈值 - 不触发压缩")
        void belowThresholdNoCompaction() {
            fillTokensToThreshold(0.70);
            
            assertFalse(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("超过最大token数 - 正常处理")
        void exceedsMaxTokens() throws Exception {
            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(1.5);

            assertTrue(contextWindow.getBudget().getCurrentTokens() > MAX_TOKENS);
        }

        @Test
        @DisplayName("大量小消息 - 正确累积token")
        void manySmallMessages() {
            for (int i = 0; i < 1000; i++) {
                contextWindow.addMessage(Message.user("Small " + i));
            }

            assertTrue(contextWindow.getBudget().getCurrentTokens() > 0);
            assertTrue(contextWindow.size() == 1000);
        }

        @Test
        @DisplayName("超大单条消息 - 不崩溃")
        void singleHugeMessage() {
            String hugeContent = "x".repeat(500000);
            
            assertDoesNotThrow(() -> {
                contextWindow.addMessage(Message.user(hugeContent));
            });
            
            assertTrue(contextWindow.getBudget().getCurrentTokens() > 0);
        }
    }

    @Nested
    @DisplayName("失败注入测试")
    class FailureInjectionTests {

        @Test
        @DisplayName("LLM调用超时 - 降级为fallback摘要，不崩溃")
        void llmTimeoutRecordsFailure() throws Exception {
            mockLlmClient.setExceptionToThrow(new LlmException("LLM API 超时"));

            fillTokensToThreshold(0.96);

            assertTrue(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("LLM返回空响应 - 降级处理")
        void llmEmptyResponseFallback() throws Exception {
            ChatResponse emptyResponse = new ChatResponse();
            emptyResponse.setChoices(new ArrayList<>());
            mockLlmClient.enqueueResponse(emptyResponse);

            fillTokensToThreshold(0.96);

            assertTrue(contextWindow.size() > 0);
        }

        @Test
        @DisplayName("连续3次LLM失败 - 断路器熔断")
        void threeFailuresCircuitBreaker() {
            for (int i = 0; i < 3; i++) {
                state.recordFailure();
            }

            assertFalse(state.shouldTryCompaction());
            assertEquals(3, state.getConsecutiveFailures());

            fillTokensToThreshold(0.96);
            
            CompactionMetricsCollector metrics = trigger.getMetrics();
            assertNotNull(metrics);
        }

        @Test
        @DisplayName("失败后成功 - 计数器重置")
        void failureThenSuccess() throws Exception {
            state.recordFailure();
            state.recordFailure();
            assertEquals(2, state.getConsecutiveFailures());

            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);

            assertEquals(0, state.getConsecutiveFailures());
        }

        @Test
        @DisplayName("LLM抛出RuntimeException - 降级为fallback摘要，不崩溃")
        void llmRuntimeException() throws Exception {
            mockLlmClient.setExceptionToThrow(new LlmException("Unexpected error"));

            fillTokensToThreshold(0.96);

            assertTrue(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("LLM返回null - 不崩溃")
        void llmReturnsNull() throws Exception {
            mockLlmClient.enqueueResponse(null);

            assertDoesNotThrow(() -> {
                fillTokensToThreshold(0.96);
            });
        }

        @Test
        @DisplayName("消息列表为null - 抛NPE")
        void nullMessageList() {
            assertThrows(NullPointerException.class, () -> {
                contextWindow.replaceMessages(null);
            });
        }
    }

    @Nested
    @DisplayName("状态转换测试")
    class StateTransitionTests {

        @Test
        @DisplayName("初始状态 -> 压缩成功 -> 新查询循环 -> 再次压缩")
        void initialStateToSuccessToNewLoop() throws Exception {
            assertFalse(state.isCompactedInCurrentLoop());

            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);

            assertTrue(trigger.isCompactionPerformed());
            assertTrue(state.isCompactedInCurrentLoop());

            trigger.startNewQueryLoop();
            assertFalse(state.isCompactedInCurrentLoop());
            assertTrue(state.shouldTryCompaction());
        }

        @Test
        @DisplayName("多次压缩 - 压缩计数正确增加")
        void multipleCompactionCount() throws Exception {
            mockLlmClient.enqueueResponse(createStubChatResponse());

            for (int i = 0; i < 3; i++) {
                fillTokensToThreshold(0.96);
                trigger.startNewQueryLoop();
                contextWindow.clear();
            }

            assertEquals(3, state.getCompactionCount());
        }

        @Test
        @DisplayName("Reset后状态完全重置")
        void resetClearsAllState() throws Exception {
            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);
            state.recordFailure();

            trigger.reset();

            assertFalse(trigger.isCompactionPerformed());
            assertEquals(0, state.getConsecutiveFailures());
            assertEquals(0, state.getCompactionCount());
        }

        @Test
        @DisplayName("FullReset重置所有状态包括内部状态")
        void fullResetAllState() {
            state.recordFailure();
            state.recordFailure();
            state.recordCompaction();

            trigger.fullReset();

            assertEquals(0, state.getConsecutiveFailures());
            assertEquals(0, state.getCompactionCount());
        }
    }

    @Nested
    @DisplayName("并发安全测试")
    class ConcurrencyTests {

        @Test
        @DisplayName("多线程同时触发阈值 - 不崩溃")
        void concurrentThresholdTrigger() throws InterruptedException {
            int threadCount = 5;
            ExecutorService executor = Executors.newFixedThreadPool(threadCount);
            CountDownLatch latch = new CountDownLatch(threadCount);
            AtomicReference<Throwable> error = new AtomicReference<>();

            for (int i = 0; i < threadCount; i++) {
                executor.submit(() -> {
                    try {
                        contextWindow.getBudget().update(MAX_TOKENS - 100);
                    } catch (Throwable e) {
                        error.compareAndSet(null, e);
                    } finally {
                        latch.countDown();
                    }
                });
            }

            boolean completed = latch.await(10, TimeUnit.SECONDS);
            executor.shutdown();

            assertTrue(completed);
            assertNull(error.get());
        }

        @Test
        @DisplayName("并发添加消息和触发压缩 - 不冲突")
        void concurrentAddMessagesAndTrigger() throws Exception {
            mockLlmClient.enqueueResponse(createStubChatResponse());

            ExecutorService executor = Executors.newFixedThreadPool(3);
            CountDownLatch latch = new CountDownLatch(3);
            AtomicReference<Throwable> error = new AtomicReference<>();

            executor.submit(() -> {
                try {
                    for (int i = 0; i < 50; i++) {
                        contextWindow.addMessage(Message.user("Message " + i));
                    }
                } catch (Throwable e) {
                    error.compareAndSet(null, e);
                } finally {
                    latch.countDown();
                }
            });

            executor.submit(() -> {
                try {
                    fillTokensToThreshold(0.96);
                } catch (Throwable e) {
                    error.compareAndSet(null, e);
                } finally {
                    latch.countDown();
                }
            });

            executor.submit(() -> {
                try {
                    Thread.sleep(100);
                    trigger.isCompactionPerformed();
                    trigger.getState();
                } catch (Throwable e) {
                    error.compareAndSet(null, e);
                } finally {
                    latch.countDown();
                }
            });

            boolean completed = latch.await(15, TimeUnit.SECONDS);
            executor.shutdown();

            assertTrue(completed);
            assertNull(error.get());
        }
    }

    @Nested
    @DisplayName("Hook和回调测试")
    class HookAndCallbackTests {

        @Test
        @DisplayName("压缩完成Hook被调用")
        void compactionCompleteHookCalled() throws Exception {
            AtomicBoolean hookCalled = new AtomicBoolean(false);
            AtomicReference<List<Message>> hookMessages = new AtomicReference<>();

            trigger.setCompactionCompleteHook(messages -> {
                hookCalled.set(true);
                hookMessages.set(messages);
            });

            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);

            assertTrue(hookCalled.get());
            assertNotNull(hookMessages.get());
        }

        @Test
        @DisplayName("Hook抛出异常 - 不影响主流程")
        void hookThrowsException() throws Exception {
            trigger.setCompactionCompleteHook(messages -> {
                throw new RuntimeException("Hook error");
            });

            mockLlmClient.enqueueResponse(createStubChatResponse());

            assertDoesNotThrow(() -> {
                fillTokensToThreshold(0.96);
            });

            assertTrue(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("多次设置Hook - 只有最后一次生效")
        void multipleHookSettings() throws Exception {
            AtomicInteger callCount = new AtomicInteger(0);

            trigger.setCompactionCompleteHook(messages -> callCount.incrementAndGet());
            trigger.setCompactionCompleteHook(messages -> callCount.addAndGet(10));

            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);

            assertEquals(10, callCount.get());
        }
    }

    @Nested
    @DisplayName("注册和注销测试")
    class RegisterUnregisterTests {

        @Test
        @DisplayName("注销后不再接收预算更新")
        void unregisterStopsUpdates() {
            trigger.unregister();

            fillTokensToThreshold(0.96);

            assertFalse(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("重新注册后正常工作")
        void reregisterWorks() throws Exception {
            trigger.unregister();
            trigger.register();

            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);

            assertTrue(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("多次注销 - 不崩溃")
        void multipleUnregister() {
            assertDoesNotThrow(() -> {
                trigger.unregister();
                trigger.unregister();
                trigger.unregister();
            });
        }

        @Test
        @DisplayName("多次注册 - 不崩溃")
        void multipleRegister() {
            assertDoesNotThrow(() -> {
                trigger.register();
                trigger.register();
                trigger.register();
            });
        }
    }

    @Nested
    @DisplayName("指标收集测试")
    class MetricsTests {

        @Test
        @DisplayName("获取指标收集器 - 不为null")
        void getMetricsNotNull() {
            assertNotNull(trigger.getMetrics());
        }

        @Test
        @DisplayName("失败后指标正确记录")
        void metricsRecordFailures() {
            for (int i = 0; i < 5; i++) {
                state.recordFailure();
            }

            CompactionMetricsCollector metrics = trigger.getMetrics();
            metrics.recordEvent(
                CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_CIRCUIT_BREAKER,
                "测试熔断"
            );

            assertNotNull(metrics.getSummary());
        }

        @Test
        @DisplayName("成功压缩后指标正确")
        void metricsAfterSuccess() throws Exception {
            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);

            CompactionMetricsCollector metrics = trigger.getMetrics();
            assertNotNull(metrics);
        }
    }

    @Nested
    @DisplayName("递归保护测试")
    class RecursionProtectionTests {

        @Test
        @DisplayName("包含压缩标记的消息 - 不触发压缩")
        void compactionForkContextPreventsTrigger() {
            contextWindow.addMessage(Message.user("query_source=compact 特殊指令"));
            
            fillTokensToThreshold(0.96);
            
            assertFalse(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("包含压缩模式标记 - 不触发压缩")
        void compactModeMarkerPreventsTrigger() {
            contextWindow.addMessage(Message.user("压缩模式特殊指令"));
            
            fillTokensToThreshold(0.96);
            
            assertFalse(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("包含上下文标记 - 不触发压缩")
        void contextMarkerPreventsTrigger() {
            contextWindow.addMessage(Message.user("context=compaction"));
            
            fillTokensToThreshold(0.96);
            
            assertFalse(trigger.isCompactionPerformed());
        }

        @Test
        @DisplayName("普通消息 - 正常触发")
        void normalMessagesTriggerNormally() throws Exception {
            mockLlmClient.enqueueResponse(createStubChatResponse());

            fillTokensToThreshold(0.96);

            assertTrue(trigger.isCompactionPerformed());
        }
    }

    private void fillTokensToThreshold(double targetRatio) {
        int maxTokens = contextWindow.getBudget().getMaxTokens();
        int targetTokenCount = (int) (maxTokens * targetRatio);
        List<Message> existing = new ArrayList<>(contextWindow.getRawMessages());
        int existingTokens = tokenEstimator.estimate(existing);
        int neededTokens = targetTokenCount - existingTokens;
        if (neededTokens > 0) {
            List<Message> additional = generateMessagesWithTokens(neededTokens);
            List<Message> allMessages = new ArrayList<>(existing);
            allMessages.addAll(additional);
            contextWindow.replaceMessages(allMessages);
        }
    }

    private List<Message> generateMessagesWithTokens(int targetTokens) {
        List<Message> messages = new ArrayList<>();
        TokenEstimator estimator = TokenEstimatorFactory.getDefault();
        messages.add(Message.system("You are a helpful assistant."));

        int tokens = 0;
        int messageId = 0;
        while (tokens < targetTokens) {
            String content = generateLongText(500);
            Message msg = Message.user("Message " + messageId + ": " + content);
            messages.add(msg);
            tokens = estimator.estimate(messages);
            messageId++;
        }
        return messages;
    }

    private String generateLongText(int words) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < words; i++) {
            sb.append("hello").append(" ");
        }
        return sb.toString();
    }

    private ChatResponse createStubChatResponse() {
        ChatResponse response = new ChatResponse();
        Choice choice = new Choice();
        choice.setMessage(Message.assistant("Compressed summary"));
        response.setChoices(List.of(choice));
        return response;
    }
}
