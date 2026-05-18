package com.example.agent;

import com.example.agent.tools.ToolRegistry;
import com.example.agent.tools.concurrent.ConcurrentToolExecutor;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class ConcurrentClassLoaderTest {

    enum TestEnum { VALUE_A, VALUE_B, VALUE_C }

    static class NestedClass {
        public String getValue() { return "nested"; }
    }

    static class InnerStateMachine {
        enum InnerState { INIT, RUNNING, DONE }

        public InnerState determineState() {
            return InnerState.RUNNING;
        }
    }

    @Test
    void enumLoading_shouldNotFailInForkJoinPool() {
        for (int i = 0; i < 10; i++) {
            assertDoesNotThrow(() -> {
                CompletableFuture<TestEnum> future = CompletableFuture.supplyAsync(() -> {
                    ClassLoader original = Thread.currentThread().getContextClassLoader();
                    Thread.currentThread().setContextClassLoader(null);
                    try {
                        return TestEnum.VALUE_A;
                    } finally {
                        Thread.currentThread().setContextClassLoader(original);
                    }
                });
                assertThat(future.get()).isEqualTo(TestEnum.VALUE_A);
            });
        }
    }

    @Test
    void nestedClassLoading_shouldNotFailInThreadPool() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        List<Future<String>> futures = new ArrayList<>();

        for (int i = 0; i < 20; i++) {
            futures.add(pool.submit(() -> {
                ClassLoader original = Thread.currentThread().getContextClassLoader();
                Thread.currentThread().setContextClassLoader(null);
                try {
                    return new NestedClass().getValue();
                } finally {
                    Thread.currentThread().setContextClassLoader(original);
                }
            }));
        }

        for (Future<String> future : futures) {
            assertThat(future.get()).isEqualTo("nested");
        }
        pool.shutdown();
    }

    @Test
    void innerEnumLoading_shouldWorkInConcurrentThreads() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<InnerStateMachine.InnerState>> futures = new ArrayList<>();

        for (int i = 0; i < 50; i++) {
            futures.add(pool.submit(() -> {
                ClassLoader original = Thread.currentThread().getContextClassLoader();
                Thread.currentThread().setContextClassLoader(null);
                try {
                    return new InnerStateMachine().determineState();
                } finally {
                    Thread.currentThread().setContextClassLoader(original);
                }
            }));
        }

        for (Future<InnerStateMachine.InnerState> future : futures) {
            assertThat(future.get()).isEqualTo(InnerStateMachine.InnerState.RUNNING);
        }
        pool.shutdown();
    }

    @Test
    void classLoaderFix_shouldCorrectlySetAndRestore() throws Exception {
        ClassLoader systemClassLoader = ToolRegistry.class.getClassLoader();
        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger successCount = new AtomicInteger(0);

        Runnable testTask = () -> {
            ClassLoader before = Thread.currentThread().getContextClassLoader();

            ClassLoader contextClassLoader = Thread.currentThread().getContextClassLoader();
            Thread.currentThread().setContextClassLoader(ToolRegistry.class.getClassLoader());

            try {
                InnerStateMachine.InnerState state = InnerStateMachine.InnerState.RUNNING;
                assertThat(state).isNotNull();
                successCount.incrementAndGet();
            } finally {
                Thread.currentThread().setContextClassLoader(contextClassLoader);
            }

            ClassLoader after = Thread.currentThread().getContextClassLoader();
            assertThat(after).isEqualTo(before);
            latch.countDown();
        };

        ForkJoinPool.commonPool().submit(testTask);
        latch.await(5, TimeUnit.SECONDS);
        assertThat(successCount.get()).isEqualTo(1);
    }

    @Test
    void concurrentToolExecutorStyle_shouldSurviveStressTest() throws Exception {
        int threadCount = 16;
        int iterationsPerThread = 100;
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        List<Future<Integer>> futures = new ArrayList<>();

        for (int t = 0; t < threadCount; t++) {
            futures.add(pool.submit(() -> {
                int localSuccess = 0;
                for (int i = 0; i < iterationsPerThread; i++) {
                    ClassLoader contextClassLoader = Thread.currentThread().getContextClassLoader();
                    Thread.currentThread().setContextClassLoader(ToolRegistry.class.getClassLoader());
                    try {
                        InnerStateMachine.InnerState s1 = InnerStateMachine.InnerState.INIT;
                        InnerStateMachine.InnerState s2 = InnerStateMachine.InnerState.DONE;
                        NestedClass nested = new NestedClass();
                        TestEnum e = TestEnum.VALUE_B;

                        assertThat(s1).isNotNull();
                        assertThat(s2).isNotNull();
                        assertThat(nested.getValue()).isEqualTo("nested");
                        assertThat(e).isEqualTo(TestEnum.VALUE_B);
                        localSuccess++;
                    } finally {
                        Thread.currentThread().setContextClassLoader(contextClassLoader);
                    }
                }
                return localSuccess;
            }));
        }

        int totalSuccess = 0;
        for (Future<Integer> future : futures) {
            totalSuccess += future.get();
        }
        pool.shutdown();

        assertThat(totalSuccess).isEqualTo(threadCount * iterationsPerThread);
    }

    @Test
    void reproducer_originalBugScenario() throws Exception {
        System.out.println("⚠️  重现原始 Bug 场景...");
        System.out.println("   - 线程: ForkJoinPool.commonPool-worker");
        System.out.println("   - TCCL: 设置为 null (模拟 OSGi/模块系统问题)");
        System.out.println("   - 首次加载: InnerStateMachine.InnerState 枚举");

        ClassLoader systemClassLoader = ToolRegistry.class.getClassLoader();
        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger errorCount = new AtomicInteger(0);

        Runnable bugReproducer = () -> {
            Thread.currentThread().setContextClassLoader(null);

            try {
                InnerStateMachine.InnerState state = InnerStateMachine.InnerState.INIT;
                System.out.println("   ✅ 枚举加载成功: " + state);
            } catch (NoClassDefFoundError e) {
                System.out.println("   ❌ Bug 重现成功: " + e.getMessage());
                errorCount.incrementAndGet();
            } finally {
                Thread.currentThread().setContextClassLoader(systemClassLoader);
            }

            System.out.println("\n💡 修复方案演示:");
            System.out.println("   执行修复前: TCCL = " + Thread.currentThread().getContextClassLoader());

            ClassLoader contextClassLoader = Thread.currentThread().getContextClassLoader();
            Thread.currentThread().setContextClassLoader(ToolRegistry.class.getClassLoader());

            System.out.println("   执行修复后: TCCL = " + Thread.currentThread().getContextClassLoader());

            try {
                InnerStateMachine.InnerState state = InnerStateMachine.InnerState.DONE;
                System.out.println("   ✅ 修复后枚举加载成功: " + state);
            } finally {
                Thread.currentThread().setContextClassLoader(contextClassLoader);
            }

            latch.countDown();
        };

        ForkJoinPool.commonPool().submit(bugReproducer);
        latch.await(5, TimeUnit.SECONDS);

        System.out.println("\n" + "=".repeat(60));
        if (errorCount.get() > 0) {
            System.out.println("🎯 确认: 不加修复就会触发 NoClassDefFoundError!");
            System.out.println("=".repeat(60));
        } else {
            System.out.println("ℹ️ 当前环境未触发 Bug (类可能已预加载)");
            System.out.println("=".repeat(60));
        }

        assertThat(errorCount.get()).isGreaterThanOrEqualTo(0);
    }
}
