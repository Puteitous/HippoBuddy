package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.llm.retry.RetryPolicy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ExecutionException;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("LlmClientFactory - Config不变性测试")
class LlmClientFactoryImmutabilityTest {

    @Nested
    @DisplayName("🔴 Config对象不变性测试")
    class ImmutabilityTests {

        @Test
        @DisplayName("create()不修改传入的Config对象 - baseUrl")
        void testFactoryDoesNotModifyConfig_BaseUrl() {
            Config config = Config.getInstance();
            String originalBaseUrl = config.getLlm().getBaseUrl();
            config.getLlm().setBaseUrl(null);
            config.getLlm().setProvider("dashscope");
            config.getLlm().setModel("explicit-model");

            LlmClientFactory.create(config);

            assertNull(config.getLlm().getBaseUrl(),
                "为null的字段应该保持null，工厂不应该修改");
        }

        @Test
        @DisplayName("create()不修改传入的Config对象 - model")
        void testFactoryDoesNotModifyConfig_Model() {
            Config config = Config.getInstance();
            config.getLlm().setProvider("ollama");
            config.getLlm().setBaseUrl("http://custom:11434");
            config.getLlm().setModel(null);

            LlmClientFactory.create(config);

            assertNull(config.getLlm().getModel(),
                "为null的字段应该保持null，工厂不应该修改");
        }

        @Test
        @DisplayName("多次调用create()不改变Config状态")
        void testMultipleCallsDontChangeConfig() {
            Config config = Config.getInstance();
            config.getLlm().setProvider("openai");
            config.getLlm().setBaseUrl(null);
            config.getLlm().setModel(null);

            LlmClientFactory.create(config);
            String baseUrlAfterFirst = config.getLlm().getBaseUrl();
            String modelAfterFirst = config.getLlm().getModel();

            LlmClientFactory.create(config);
            String baseUrlAfterSecond = config.getLlm().getBaseUrl();
            String modelAfterSecond = config.getLlm().getModel();

            assertEquals(baseUrlAfterFirst, baseUrlAfterSecond,
                "第二次调用不应该改变baseUrl");
            assertEquals(modelAfterFirst, modelAfterSecond,
                "第二次调用不应该改变model");
        }
    }

    @Nested
    @DisplayName("🔴 并发安全测试")
    class ConcurrencyTests {

        @Test
        @DisplayName("多线程并发创建Client无竞态条件")
        void testConcurrentCreateNoRaceCondition() throws InterruptedException, ExecutionException {
            Config sharedConfig = Config.getInstance();
            sharedConfig.getLlm().setProvider("dashscope");
            sharedConfig.getLlm().setBaseUrl(null);
            sharedConfig.getLlm().setModel(null);

            int threadCount = 20;
            int iterationsPerThread = 50;
            ExecutorService pool = Executors.newFixedThreadPool(threadCount);
            CountDownLatch latch = new CountDownLatch(threadCount);

            List<Callable<Void>> tasks = new ArrayList<>();
            for (int i = 0; i < threadCount; i++) {
                tasks.add(() -> {
                    latch.countDown();
                    latch.await();
                    for (int j = 0; j < iterationsPerThread; j++) {
                        LlmClient client = LlmClientFactory.create(sharedConfig, RetryPolicy.defaultPolicy());
                        assertNotNull(client);
                    }
                    return null;
                });
            }

            List<Future<Void>> futures = pool.invokeAll(tasks);
            pool.shutdown();
            assertTrue(pool.awaitTermination(30, TimeUnit.SECONDS));

            for (Future<Void> future : futures) {
                future.get();
            }

            assertNull(sharedConfig.getLlm().getBaseUrl(),
                "并发执行后Config.baseUrl仍应为null");
            assertNull(sharedConfig.getLlm().getModel(),
                "并发执行后Config.model仍应为null");
        }

        @Test
        @DisplayName("相同Config在多线程下创建行为一致")
        void testConsistentBehaviorAcrossThreads() throws InterruptedException {
            Config sharedConfig = Config.getInstance();
            sharedConfig.getLlm().setProvider("ollama");
            sharedConfig.getLlm().setBaseUrl("");
            sharedConfig.getLlm().setModel("");

            int threadCount = 10;
            ExecutorService pool = Executors.newFixedThreadPool(threadCount);
            CountDownLatch latch = new CountDownLatch(threadCount);

            List<Class<?>> results = Collections.synchronizedList(new ArrayList<>());

            for (int i = 0; i < threadCount; i++) {
                pool.submit(() -> {
                    try {
                        latch.countDown();
                        latch.await();
                        LlmClient client = LlmClientFactory.create(sharedConfig);
                        results.add(client.getClass());
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                });
            }

            pool.shutdown();
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));

            assertEquals(threadCount, results.size(), "所有线程都应该成功创建");

            Class<?> firstClass = results.get(0);
            assertTrue(results.stream().allMatch(c -> c == firstClass),
                "所有线程创建的Client类型应该一致");
        }
    }

    @Nested
    @DisplayName("🔴 默认值逻辑验证")
    class DefaultValueTests {

        @Test
        @DisplayName("getDefaultBaseUrl正确映射")
        void testGetDefaultBaseUrlMapping() {
            assertEquals("https://dashscope.aliyuncs.com/compatible-mode/v1",
                LlmClientFactory.getDefaultBaseUrl("dashscope"));
            assertEquals("https://api.openai.com/v1",
                LlmClientFactory.getDefaultBaseUrl("openai"));
            assertEquals("http://localhost:11434/v1",
                LlmClientFactory.getDefaultBaseUrl("ollama"));
            assertEquals("https://dashscope.aliyuncs.com/compatible-mode/v1",
                LlmClientFactory.getDefaultBaseUrl(null));
            assertEquals("https://dashscope.aliyuncs.com/compatible-mode/v1",
                LlmClientFactory.getDefaultBaseUrl(""));
            assertEquals("https://dashscope.aliyuncs.com/compatible-mode/v1",
                LlmClientFactory.getDefaultBaseUrl("unknown"));
        }

        @Test
        @DisplayName("getDefaultModel正确映射")
        void testGetDefaultModelMapping() {
            assertEquals("qwen3.5-plus",
                LlmClientFactory.getDefaultModel("dashscope"));
            assertEquals("gpt-4o",
                LlmClientFactory.getDefaultModel("openai"));
            assertEquals("qwen2.5:7b",
                LlmClientFactory.getDefaultModel("ollama"));
            assertEquals("qwen3.5-plus",
                LlmClientFactory.getDefaultModel(null));
        }
    }
}
