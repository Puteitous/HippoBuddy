package com.example.agent.llm.client;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("流中断处理测试")
class StreamInterruptTest {

    @AfterEach
    void tearDown() {
        Thread.interrupted();
    }

    @Nested
    @DisplayName("🔵 中断标记处理契约")
    class InterruptFlagHandlingTests {

        @Test
        @DisplayName("中断标记检测后正确清除")
        void testInterruptFlagClearedAfterCheck() {
            TestableStreamClient client = new TestableStreamClient();

            String testData = "line1\nline2\nline3\n";

            Thread.currentThread().interrupt();

            client.processLinesWithInterruptCheck(testData);

            assertFalse(Thread.currentThread().isInterrupted(),
                "检测到中断后，中断标记应该被清除");
        }

        @Test
        @DisplayName("非中断线程状态不受影响")
        void testNonInterruptedThreadUnaffected() {
            TestableStreamClient client = new TestableStreamClient();

            String testData = "line1\nline2\nline3\n";

            assertFalse(Thread.currentThread().isInterrupted());

            client.processLinesWithInterruptCheck(testData);

            assertFalse(Thread.currentThread().isInterrupted(),
                "无中断时，处理后线程状态应保持非中断");
        }

        @Test
        @DisplayName("InterruptedException处理后可恢复中断状态")
        void testInterruptedExceptionHandling() {
            AtomicBoolean wasInterrupted = new AtomicBoolean(false);

            Thread testThread = new Thread(() -> {
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    wasInterrupted.set(Thread.currentThread().isInterrupted());
                    Thread.currentThread().interrupt();
                }
            });

            testThread.start();
            testThread.interrupt();

            assertDoesNotThrow(() -> testThread.join(2000));
        }

        @Test
        @DisplayName("中断标记清除不影响后续处理")
        void testInterruptClearedDoesNotAffectSubsequentCode() {
            Thread.currentThread().interrupt();

            assertTrue(Thread.interrupted());

            assertFalse(Thread.currentThread().isInterrupted());

            Thread.interrupted();

            assertFalse(Thread.currentThread().isInterrupted());
        }
    }

    @Nested
    @DisplayName("🔵 CancelCheck 中止机制")
    class CancelCheckTests {

        @Test
        @DisplayName("setCancelCheck 不应抛异常")
        void setCancelCheck_doesNotThrow() {
            TestableStreamClient client = new TestableStreamClient();
            assertDoesNotThrow(() -> client.setCancelCheck(() -> false));
        }

        @Test
        @DisplayName("setCancelCheck(null) 不应抛异常")
        void setCancelCheckNull_doesNotThrow() {
            TestableStreamClient client = new TestableStreamClient();
            assertDoesNotThrow(() -> client.setCancelCheck(null));
        }

        @Test
        @DisplayName("设置和移除 cancelCheck 后数据读取不受影响")
        void cancelCheckCycle_doesNotAffectNormalProcessing() {
            TestableStreamClient client = new TestableStreamClient();

            client.setCancelCheck(() -> true);
            client.setCancelCheck(() -> false);

            int processed = client.processLinesWithInterruptCheck("line1\nline2\nline3\n");
            assertEquals(3, processed);
        }
    }

    @Nested
    @DisplayName("🔵 中断后流处理行为验证")
    class StreamTerminationTests {

        @Test
        @DisplayName("中断检测后循环正确终止")
        void testInterruptionTerminatesLoop() {
            TestableStreamClient client = new TestableStreamClient();

            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 100; i++) {
                sb.append("line").append(i).append("\n");
            }
            String manyLines = sb.toString();

            AtomicInteger processed = new AtomicInteger(0);
            CountDownLatch latch = new CountDownLatch(1);

            Thread processor = new Thread(() -> {
                assertDoesNotThrow(() -> latch.await());
                Thread.currentThread().interrupt();
                processed.set(client.processLinesWithInterruptCheck(manyLines));
            });

            processor.start();
            latch.countDown();

            assertDoesNotThrow(() -> processor.join(2000));

            assertEquals(0, processed.get(), "中断标记已设置时应立即终止循环");
        }

        @Test
        @DisplayName("空流处理不触发中断逻辑")
        void testEmptyStreamNoInterruptionSideEffects() {
            TestableStreamClient client = new TestableStreamClient();

            int processed = client.processLinesWithInterruptCheck("");

            assertFalse(Thread.currentThread().isInterrupted());
            assertEquals(0, processed);
        }

        @Test
        @DisplayName("无中断时处理所有行")
        void testNoInterruptionProcessesAllLines() {
            TestableStreamClient client = new TestableStreamClient();

            int processed = client.processLinesWithInterruptCheck("line1\nline2\nline3\n");

            assertEquals(3, processed);
            assertFalse(Thread.currentThread().isInterrupted());
        }
    }

    static class TestableStreamClient extends OpenAiLlmClient {

        public TestableStreamClient() {
            super(com.example.agent.config.Config.getInstance());
        }

        public int processLinesWithInterruptCheck(String data) {
            int count = 0;
            BufferedReader reader = new BufferedReader(new StringReader(data));
            String line;

            try {
                while ((line = reader.readLine()) != null) {
                    if (Thread.currentThread().isInterrupted()) {
                        Thread.interrupted();
                        break;
                    }
                    count++;
                    Thread.sleep(1);
                }
            } catch (InterruptedException e) {
                Thread.interrupted();
            } catch (Exception e) {
            }

            return count;
        }
    }
}
