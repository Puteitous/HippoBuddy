package com.example.agent.web.session;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("WebSessionManager 单元测试")
class WebSessionManagerTest {

    private WebSessionManager manager;

    @BeforeEach
    void setUp() {
        manager = WebSessionManager.getInstance();
        manager.clear();
    }

    @AfterEach
    void tearDown() {
        manager.clear();
    }

    @Nested
    @DisplayName("单例模式")
    class SingletonTests {

        @Test
        @DisplayName("getInstance() 应返回同一实例")
        void getInstanceReturnsSameInstance() {
            WebSessionManager instance1 = WebSessionManager.getInstance();
            WebSessionManager instance2 = WebSessionManager.getInstance();
            assertSame(instance1, instance2);
        }
    }

    @Nested
    @DisplayName("会话缓存管理")
    class SessionCacheTests {

        @Test
        @DisplayName("getSessions() 应返回可变的会话映射")
        void getSessionsReturnsMutableMap() {
            assertNotNull(manager.getSessions());
            assertTrue(manager.getSessions().isEmpty());
        }
    }

    @Nested
    @DisplayName("Token 统计")
    class TokenStatsTests {

        @Test
        @DisplayName("getSessionTokenStats 对不存在的会话应返回 null")
        void getSessionTokenStatsReturnsNullForUnknown() {
            assertNull(manager.getSessionTokenStats("unknown-session"));
        }

        @Test
        @DisplayName("getOrCreateSessionTokenStats 应自动创建新的统计")
        void getOrCreateSessionTokenStatsCreatesNew() {
            SessionTokenStats stats = manager.getOrCreateSessionTokenStats("test-session");
            assertNotNull(stats);
            assertEquals(0, stats.totalTokens);
            assertEquals(0, stats.llmCalls);
        }

        @Test
        @DisplayName("多次调用 getOrCreateSessionTokenStats 应返回同一实例")
        void getOrCreateSessionTokenStatsReturnsSameInstance() {
            SessionTokenStats stats1 = manager.getOrCreateSessionTokenStats("test-session");
            SessionTokenStats stats2 = manager.getOrCreateSessionTokenStats("test-session");
            assertSame(stats1, stats2);
        }

        @Test
        @DisplayName("SessionTokenStats 累加统计应正确")
        void sessionTokenStatsAccumulates() {
            SessionTokenStats stats = manager.getOrCreateSessionTokenStats("accumulate-test");
            stats.addLlmCall(100, 50, 150, 30, 70);
            assertEquals(100, stats.totalInputTokens);
            assertEquals(50, stats.totalOutputTokens);
            assertEquals(150, stats.totalTokens);
            assertEquals(1, stats.llmCalls);

            stats.addLlmCall(200, 100, 300, 50, 150);
            assertEquals(300, stats.totalInputTokens);
            assertEquals(150, stats.totalOutputTokens);
            assertEquals(450, stats.totalTokens);
            assertEquals(2, stats.llmCalls);
        }

        @Test
        @DisplayName("SessionTokenStats 缓存命中率计算应正确")
        void sessionTokenStatsCacheHitRate() {
            SessionTokenStats stats = manager.getOrCreateSessionTokenStats("cache-rate-test");
            assertEquals(0.0, stats.getSessionCacheHitRate());

            stats.addLlmCall(100, 50, 150, 30, 70);
            assertEquals(30.0, stats.getSessionCacheHitRate(), 0.001);

            stats.addLlmCall(200, 100, 300, 50, 150);
            assertEquals(26.666, stats.getSessionCacheHitRate(), 0.001);
        }

        @Test
        @DisplayName("SessionTokenStats addToolCall 应累加")
        void sessionTokenStatsAddToolCall() {
            SessionTokenStats stats = manager.getOrCreateSessionTokenStats("toolcall-test");
            assertEquals(0, stats.toolCalls);

            stats.addToolCall();
            assertEquals(1, stats.toolCalls);

            stats.addToolCall();
            assertEquals(2, stats.toolCalls);
        }
    }

    @Nested
    @DisplayName("待处理工具调用 (PendingToolCall)")
    class PendingToolCallTests {

        @Test
        @DisplayName("hasPendingToolCall 对不存在的会话应返回 false")
        void hasPendingToolCallReturnsFalseForUnknown() {
            assertFalse(manager.hasPendingToolCall("unknown"));
        }

        @Test
        @DisplayName("setPendingToolCall 后 hasPendingToolCall 应返回 true")
        void hasPendingToolCallReturnsTrueAfterSet() {
            manager.setPendingToolCall("session-1", new PendingToolCall("call-1", "ask_user", "测试问题?", Arrays.asList("是", "否"), true));
            assertTrue(manager.hasPendingToolCall("session-1"));
        }

        @Test
        @DisplayName("pollPendingToolCall 应返回并移除待处理调用")
        void pollPendingToolCallReturnsAndRemoves() {
            PendingToolCall pending = new PendingToolCall("call-1", "ask_user", "测试问题?", Arrays.asList("是", "否"), true);
            manager.setPendingToolCall("session-1", pending);

            PendingToolCall retrieved = manager.pollPendingToolCall("session-1");
            assertSame(pending, retrieved);
            assertEquals("call-1", retrieved.toolCallId);
            assertEquals("ask_user", retrieved.toolName);
            assertEquals("测试问题?", retrieved.question);
            assertEquals(2, retrieved.options.size());
            assertTrue(retrieved.allowCustomInput);

            assertFalse(manager.hasPendingToolCall("session-1"));
        }

        @Test
        @DisplayName("pollPendingToolCall 对不存在的会话应返回 null")
        void pollPendingToolCallReturnsNullForUnknown() {
            assertNull(manager.pollPendingToolCall("unknown"));
        }

        @Test
        @DisplayName("不同会话的 pendingToolCall 应互不干扰")
        void pendingToolCallsAreIsolatedBySession() {
            manager.setPendingToolCall("session-a", new PendingToolCall("call-a", "ask_user", "问题A", null, false));
            manager.setPendingToolCall("session-b", new PendingToolCall("call-b", "ask_user", "问题B", null, true));

            assertTrue(manager.hasPendingToolCall("session-a"));
            assertTrue(manager.hasPendingToolCall("session-b"));

            PendingToolCall retrievedA = manager.pollPendingToolCall("session-a");
            assertEquals("call-a", retrievedA.toolCallId);
            assertEquals("问题A", retrievedA.question);

            assertFalse(manager.hasPendingToolCall("session-a"));
            assertTrue(manager.hasPendingToolCall("session-b"));
        }
    }

    @Nested
    @DisplayName("会话级锁")
    class SessionLockTests {

        @Test
        @DisplayName("获取并释放锁应成功")
        void acquireAndReleaseLock() throws Exception {
            boolean acquired = manager.tryAcquireSessionLock("test-session", 1, TimeUnit.SECONDS);
            assertTrue(acquired);
            manager.releaseSessionLock("test-session");
        }

        @Test
        @DisplayName("同一会话的锁应使临界区互斥")
        void sessionLocksAreMutualExclusive() throws Exception {
            manager.tryAcquireSessionLock("mutex-test", 1, TimeUnit.SECONDS);

            CountDownLatch threadStarted = new CountDownLatch(1);
            CountDownLatch threadAboutToLock = new CountDownLatch(1);
            AtomicBoolean threadEntered = new AtomicBoolean(false);
            AtomicBoolean threadCompleted = new AtomicBoolean(false);

            Thread secondThread = new Thread(() -> {
                threadStarted.countDown();
                try {
                    // 用长 timeout（10秒）确保不会触发死锁恢复的 lock.lock()
                    boolean locked = manager.tryAcquireSessionLock("mutex-test", 10, TimeUnit.SECONDS);
                    if (locked) {
                        threadEntered.set(true);
                        manager.releaseSessionLock("mutex-test");
                    }
                } catch (Exception e) {
                } finally {
                    threadCompleted.set(true);
                }
            });

            secondThread.start();
            threadStarted.await(1, TimeUnit.SECONDS);
            Thread.sleep(200);
            assertFalse(threadEntered.get(), "锁被持有时第二个线程不应进入临界区");

            manager.releaseSessionLock("mutex-test");

            Thread.sleep(500);
            assertTrue(threadEntered.get(), "锁释放后第二个线程应能获取锁");
            assertTrue(threadCompleted.get(), "第二个线程应已完成");
        }

        @Test
        @DisplayName("不同会话的锁应互不阻塞")
        void differentSessionLocksDoNotBlock() throws Exception {
            manager.tryAcquireSessionLock("session-a-lock", 1, TimeUnit.SECONDS);

            AtomicBoolean lockBAcquired = new AtomicBoolean(false);
            CountDownLatch doneLatch = new CountDownLatch(1);

            Thread threadB = new Thread(() -> {
                try {
                    boolean acquired = manager.tryAcquireSessionLock("session-b-lock", 1, TimeUnit.SECONDS);
                    lockBAcquired.set(acquired);
                    manager.releaseSessionLock("session-b-lock");
                } catch (Exception e) {
                } finally {
                    doneLatch.countDown();
                }
            });

            threadB.start();
            doneLatch.await(2, TimeUnit.SECONDS);
            assertTrue(lockBAcquired.get(), "不同会话的锁应互不阻塞");

            manager.releaseSessionLock("session-a-lock");
        }
    }

    @Nested
    @DisplayName("clear()")
    class ClearTests {

        @Test
        @DisplayName("clear() 应清除所有状态")
        void clearClearsAllState() {
            manager.getOrCreateSessionTokenStats("session-1");
            manager.setPendingToolCall("session-2", new PendingToolCall("call-1", "ask_user", "?", null, false));

            manager.clear();

            assertTrue(manager.getSessions().isEmpty());
            assertNull(manager.getSessionTokenStats("session-1"));
            assertFalse(manager.hasPendingToolCall("session-2"));
        }
    }

    @Nested
    @DisplayName("loadTokenCache")
    class LoadTokenCacheTests {

        @Test
        @DisplayName("loadTokenCache null 不抛异常")
        void loadTokenCacheNullDoesNotThrow() {
            manager.loadTokenCache(null);
        }

        @Test
        @DisplayName("loadTokenCache 应正确加载预构建的缓存")
        void loadTokenCacheLoadsPrebuiltCache() {
            Map<String, SessionTokenStats> preloaded = new java.util.HashMap<>();
            SessionTokenStats stats = new SessionTokenStats();
            stats.addLlmCall(100, 50, 150);
            preloaded.put("session-1", stats);

            manager.loadTokenCache(preloaded);

            SessionTokenStats retrieved = manager.getSessionTokenStats("session-1");
            assertNotNull(retrieved);
            assertEquals(100, retrieved.totalInputTokens);
            assertEquals(50, retrieved.totalOutputTokens);
            assertEquals(150, retrieved.totalTokens);
        }

        @Test
        @DisplayName("loadTokenCache 应合并而非替换已有缓存")
        void loadTokenCacheMergesWithExisting() {
            Map<String, SessionTokenStats> preloaded = new java.util.HashMap<>();
            SessionTokenStats stats = new SessionTokenStats();
            stats.addLlmCall(100, 50, 150);
            preloaded.put("session-1", stats);
            manager.loadTokenCache(preloaded);

            Map<String, SessionTokenStats> more = new java.util.HashMap<>();
            SessionTokenStats stats2 = new SessionTokenStats();
            stats2.addLlmCall(200, 100, 300);
            more.put("session-2", stats2);
            manager.loadTokenCache(more);

            assertNotNull(manager.getSessionTokenStats("session-1"));
            assertNotNull(manager.getSessionTokenStats("session-2"));
            assertEquals(150, manager.getSessionTokenStats("session-1").totalTokens);
            assertEquals(300, manager.getSessionTokenStats("session-2").totalTokens);
        }
    }
}
