package com.example.agent.web.server;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.web.session.WebSessionManager;
import com.example.agent.web.session.SessionTokenStats;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

@DisplayName("WebInitializer 单元测试")
class WebInitializerTest {

    private Path originalHippoRoot;
    private String originalProjectKey;
    private String originalUserDir;
    private WebSessionManager sessionManager;

    @BeforeEach
    void setUp(@TempDir Path tempDir) throws Exception {
        originalHippoRoot = getStaticField(WorkspaceManager.class, "HIPPO_ROOT");
        originalProjectKey = getStaticField(WorkspaceManager.class, "CURRENT_PROJECT_KEY");
        originalUserDir = System.getProperty("user.dir");

        System.setProperty("user.dir", tempDir.toAbsolutePath().toString());
        WorkspaceManager.overrideBasePath(tempDir);

        sessionManager = WebSessionManager.getInstance();
        sessionManager.clear();

        resetMemoryInitialized(false);
    }

    @AfterEach
    void tearDown() throws Exception {
        setStaticField(WorkspaceManager.class, "HIPPO_ROOT", originalHippoRoot);
        setStaticField(WorkspaceManager.class, "CURRENT_PROJECT_KEY", originalProjectKey);
        System.setProperty("user.dir", originalUserDir);
        ServiceLocator.clear();
        sessionManager.clear();
    }

    @SuppressWarnings("unchecked")
    private static <T> T getStaticField(Class<?> clazz, String fieldName) throws Exception {
        Field field = clazz.getDeclaredField(fieldName);
        field.setAccessible(true);
        return (T) field.get(null);
    }

    private static void setStaticField(Class<?> clazz, String fieldName, Object value) throws Exception {
        Field field = clazz.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(null, value);
    }

    private static void resetMemoryInitialized(boolean value) throws Exception {
        Field field = WebInitializer.class.getDeclaredField("memoryInitialized");
        field.setAccessible(true);
        field.set(null, value);
    }

    private Path createLogFile(String sessionId, String... lines) throws Exception {
        Path logRoot = Paths.get(System.getProperty("user.dir"), ".hippo", "logs", "conversations");
        Files.createDirectories(logRoot);
        Path logFile = logRoot.resolve(sessionId + ".log");
        Files.writeString(logFile, String.join("\n", lines));
        return logFile;
    }

    @Nested
    @DisplayName("initializeTokenCache")
    class InitializeTokenCacheTests {

        @Test
        @DisplayName("日志目录不存在时应为无操作")
        void noLogsDirectoryDoesNothing() {
            WebInitializer.initializeTokenCache(sessionManager);

            assertNull(sessionManager.getSessionTokenStats("any-session"),
                "无日志目录时不应加载任何 Token 缓存");
        }

        @Test
        @DisplayName("存在有效日志文件时应解析并加载 Token 统计")
        void loadsTokenStatsFromLogFiles() throws Exception {
            createLogFile("session-one",
                "对话摘要",
                "总输入 Token: 500",
                "总输出 Token: 300",
                "总 Token: 800",
                "LLM 调用次数：10",
                "工具调用次数：3"
            );
            createLogFile("session-two",
                "对话摘要",
                "总输入 Token: 1000",
                "总输出 Token: 700",
                "总 Token: 1700",
                "LLM 调用次数：25",
                "工具调用次数：8"
            );

            WebInitializer.initializeTokenCache(sessionManager);

            SessionTokenStats stats1 = sessionManager.getSessionTokenStats("session-one");
            assertNotNull(stats1, "应加载 session-one 的 Token 统计");
            assertEquals(500, stats1.totalInputTokens);
            assertEquals(300, stats1.totalOutputTokens);
            assertEquals(800, stats1.totalTokens);
            assertEquals(10, stats1.llmCalls);
            assertEquals(3, stats1.toolCalls);

            SessionTokenStats stats2 = sessionManager.getSessionTokenStats("session-two");
            assertNotNull(stats2, "应加载 session-two 的 Token 统计");
            assertEquals(1000, stats2.totalInputTokens);
            assertEquals(700, stats2.totalOutputTokens);
            assertEquals(1700, stats2.totalTokens);
            assertEquals(25, stats2.llmCalls);
            assertEquals(8, stats2.toolCalls);
        }

        @Test
        @DisplayName("日志文件无摘要时应跳过")
        void skipsLogFilesWithoutSummary() throws Exception {
            createLogFile("no-summary",
                "会话 ID: no-summary",
                "开始时间：2024-01-15 10:30:00"
            );

            WebInitializer.initializeTokenCache(sessionManager);

            SessionTokenStats stats = sessionManager.getSessionTokenStats("no-summary");
            assertNull(stats, "无摘要的日志文件应跳过");
        }

        @Test
        @DisplayName("totalToken 为 0 的日志文件应跳过")
        void skipsZeroTokenStats() throws Exception {
            createLogFile("zero-tokens",
                "对话摘要",
                "总输入 Token: 0",
                "总输出 Token: 0",
                "总 Token: 0",
                "LLM 调用次数：0",
                "工具调用次数：0"
            );

            WebInitializer.initializeTokenCache(sessionManager);

            SessionTokenStats stats = sessionManager.getSessionTokenStats("zero-tokens");
            assertNull(stats, "totalTokens 为 0 的日志文件应跳过");
        }

        @Test
        @DisplayName("混合有效和无效日志文件时应只加载有效文件")
        void loadsOnlyValidFiles() throws Exception {
            createLogFile("valid-session",
                "对话摘要",
                "总输入 Token: 100",
                "总输出 Token: 50",
                "总 Token: 150",
                "LLM 调用次数：3",
                "工具调用次数：1"
            );
            createLogFile("invalid-empty");

            WebInitializer.initializeTokenCache(sessionManager);

            SessionTokenStats validStats = sessionManager.getSessionTokenStats("valid-session");
            assertNotNull(validStats, "应加载有效的日志文件");
            assertEquals(150, validStats.totalTokens);

            SessionTokenStats invalidStats = sessionManager.getSessionTokenStats("invalid-empty");
            assertNull(invalidStats, "无效的日志文件应跳过");
        }
    }

    @Nested
    @DisplayName("ensureMemoryInitialized")
    class EnsureMemoryInitializedTests {

        @Test
        @DisplayName("MemoryRetriever 已在 DI 中时应标记为已初始化")
        void memoryRetrieverAlreadyRegistered() {
            ServiceLocator.registerSingleton(
                com.example.agent.memory.MemoryRetriever.class,
                mock(com.example.agent.memory.MemoryRetriever.class)
            );

            WebInitializer.ensureMemoryInitialized();

            assertDoesNotThrow(() -> WebInitializer.ensureMemoryInitialized());
        }

        @Test
        @DisplayName("重复调用应幂等")
        void repeatedCallsAreIdempotent() throws Exception {
            resetMemoryInitialized(true);

            assertDoesNotThrow(() -> {
                WebInitializer.ensureMemoryInitialized();
                WebInitializer.ensureMemoryInitialized();
                WebInitializer.ensureMemoryInitialized();
            });
        }

        @Test
        @DisplayName("初始化失败不应抛出异常")
        void initializationFailureDoesNotThrow() {
            assertDoesNotThrow(() -> WebInitializer.ensureMemoryInitialized());
        }
    }
}
