package com.example.agent.web.server;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.web.session.WebSessionManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.reflect.Field;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

@DisplayName("WebInitializer 单元测试")
class WebInitializerTest {

    private Path originalHippoRoot;
    private String originalUserDir;
    private WebSessionManager sessionManager;

    @BeforeEach
    void setUp(@TempDir Path tempDir) throws Exception {
        originalHippoRoot = getStaticField(WorkspaceManager.class, "HIPPO_ROOT");
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
