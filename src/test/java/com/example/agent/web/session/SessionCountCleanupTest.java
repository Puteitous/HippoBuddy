package com.example.agent.web.session;

import com.example.agent.application.ConversationService;
import com.example.agent.config.Config;
import com.example.agent.config.SessionConfig;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.skill.SkillManager;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 会话数量上限清理（max_saved_sessions）语义测试。
 *
 * <p>在新会话创建时，若磁盘总会话数（活跃 + 历史）超出上限，则清理最旧的历史会话，
 * 同时保护活跃、运行中、置顶会话。本测试通过反射触发私有方法 {@code cleanupSessionsIfNeeded}
 * 来验证清理行为，避免依赖完整会话创建链路。</p>
 */
@DisplayName("会话数量上限清理契约测试")
class SessionCountCleanupTest {

    @TempDir
    Path tempDir;

    private WebSessionManager manager;
    private Path originalHippoRoot;
    private ObjectMapper mapper;
    private long savedMaxSavedSessions;

    @BeforeEach
    void setUp() throws Exception {
        manager = WebSessionManager.getInstance();
        manager.clear();

        originalHippoRoot = WorkspaceManager.getHippoRoot();
        WorkspaceManager.overrideBasePath(tempDir);

        mapper = new ObjectMapper();

        // 记录并压低配置上限（测试后恢复），避免依赖真实 config.yaml
        SessionConfig sessionConfig = Config.getInstance().getSession();
        savedMaxSavedSessions = sessionConfig.getMaxSavedSessions();

        ConversationService mockConversationService = mock(ConversationService.class);
        when(mockConversationService.create(anyString(), anyInt(), anyString()))
            .thenAnswer(inv -> new Conversation(inv.getArgument(1), mock(TokenEstimator.class))); // 仅测试用，不会走到创建
        ServiceLocator.clear();
        ServiceLocator.registerSingleton(ConversationService.class, mockConversationService);
        ServiceLocator.registerSingleton(SkillManager.class, new SkillManager());
    }

    @AfterEach
    void tearDown() {
        SessionConfig sc = Config.getInstance().getSession();
        sc.setMaxSavedSessions((int) savedMaxSavedSessions);
        sc.setEnableMaxSavedCleanup(true);
        manager.clear();
        ServiceLocator.clear();
        WorkspaceManager.overrideBasePath(originalHippoRoot);
    }

    // ==================== 测试辅助 ====================

    /** 触发私有清理方法 */
    private void triggerCleanup() throws Exception {
        Method m = WebSessionManager.class.getDeclaredMethod("cleanupSessionsIfNeeded");
        m.setAccessible(true);
        m.invoke(manager);
    }

    /** 在当前 hippo root 下构造一个磁盘会话目录 */
    private Path createSessionOnDisk(String sessionId, long lastActivityAt) throws Exception {
        Path sessionDir = WorkspaceManager.getSessionDir(sessionId);
        Files.createDirectories(sessionDir);
        Files.writeString(sessionDir.resolve("conversation.jsonl"), "{\"type\":\"custom-title\",\"timestamp\":\"2026-01-01T00:00:00Z\"}\n");
        // 写入 lastActivityAt，便于按活跃时间排序
        Files.writeString(sessionDir.resolve("session.json"),
            mapper.writeValueAsString(Map.of("lastActivityAt", String.valueOf(lastActivityAt))));
        return sessionDir;
    }

    private boolean existsOnDisk(String sessionId) {
        return Files.exists(WorkspaceManager.getSessionDir(sessionId).resolve("conversation.jsonl"));
    }

    private long activeSessionCount() {
        return manager.getSessions().size();
    }

    // ==================== 用例 ====================

    @Nested
    @DisplayName("未超上限")
    class UnderLimitTests {

        @Test
        @DisplayName("磁盘会话数 ≤ 上限时，不清理任何会话")
        void noDeletionWhenUnderLimit() throws Exception {
            Config.getInstance().getSession().setMaxSavedSessions(5);
            createSessionOnDisk("s1", 1000);
            createSessionOnDisk("s2", 2000);
            createSessionOnDisk("s3", 3000);

            triggerCleanup();

            assertTrue(existsOnDisk("s1"));
            assertTrue(existsOnDisk("s2"));
            assertTrue(existsOnDisk("s3"));
        }

        @Test
        @DisplayName("上限为 0（禁用持久化）时，跳过清理")
        void noCleanupWhenDisabled() throws Exception {
            Config.getInstance().getSession().setMaxSavedSessions(0);
            createSessionOnDisk("s1", 1000);

            triggerCleanup();

            assertTrue(existsOnDisk("s1"));
        }

        @Test
        @DisplayName("关闭「清理历史会话」开关时，超限也不清理（会话仍落盘保留）")
        void noCleanupWhenCleanupDisabled() throws Exception {
            Config.getInstance().getSession().setMaxSavedSessions(2);
            Config.getInstance().getSession().setEnableMaxSavedCleanup(false);

            createSessionOnDisk("s1", 1000);
            createSessionOnDisk("s2", 2000);
            createSessionOnDisk("s3", 3000);

            triggerCleanup();

            assertTrue(existsOnDisk("s1"), "关闭清理开关后，最旧会话也应保留");
            assertTrue(existsOnDisk("s2"));
            assertTrue(existsOnDisk("s3"));
        }
    }

    @Nested
    @DisplayName("超上限")
    class OverLimitTests {

        @Test
        @DisplayName("总会话数超上限时，按最近活跃时间升序清理最旧的历史会话")
        void deletesOldestSessions() throws Exception {
            Config.getInstance().getSession().setMaxSavedSessions(2);
            createSessionOnDisk("oldest", 1000);
            createSessionOnDisk("middle", 2000);
            createSessionOnDisk("newest", 3000);

            // 无活跃内存会话，3 个磁盘会话，上限 2 → 清 1 个最旧的
            triggerCleanup();

            assertFalse(existsOnDisk("oldest"), "最旧的历史会话应被清理");
            assertTrue(existsOnDisk("middle"));
            assertTrue(existsOnDisk("newest"));
        }

        @Test
        @DisplayName("保护活跃内存会话：只清理磁盘上的最旧历史会话")
        void protectsActiveSessions() throws Exception {
            Config.getInstance().getSession().setMaxSavedSessions(2);
            // 磁盘上有 3 个历史会话（其中最旧的 disked-oldest）
            createSessionOnDisk("disked-oldest", 1000);
            createSessionOnDisk("disked-newer", 3000);
            createSessionOnDisk("disked-latest", 4000);

            // 模拟一个活跃内存会话（归入 protected）
            manager.getSessions().put("active-in-mem", mock(Conversation.class));

            // 总数 = 1 活跃 + 3 磁盘 = 4，上限 2 → 需清 2 个最旧磁盘会话
            triggerCleanup();

            assertTrue(manager.getSessions().containsKey("active-in-mem"), "活跃内存会话不应被清理");
            assertFalse(existsOnDisk("disked-oldest"), "最旧磁盘会话应被清理");
            assertFalse(existsOnDisk("disked-newer"), "次旧磁盘会话应被清理");
            assertTrue(existsOnDisk("disked-latest"), "较新的磁盘会话应保留");
        }

        @Test
        @DisplayName("保护置顶会话：置顶的历史会话不被清理")
        void protectsPinnedSessions() throws Exception {
            Config.getInstance().getSession().setMaxSavedSessions(2);
            createSessionOnDisk("pinned-old", 1000);
            // 将 pinned-old 标记为置顶
            Path metadata = WorkspaceManager.getSessionDir("pinned-old").resolve("session.json");
            var map = mapper.readValue(Files.readString(metadata), Map.class);
            map.put("pinned", true);
            mapper.writeValue(metadata.toFile(), map);

            createSessionOnDisk("normal-1", 2000);
            createSessionOnDisk("normal-2", 3000);

            triggerCleanup();

            assertTrue(existsOnDisk("pinned-old"), "置顶会话不应被清理");
            assertFalse(existsOnDisk("normal-1"), "非置顶的最旧会话应被清理");
            assertTrue(existsOnDisk("normal-2"));
        }

        @Test
        @DisplayName("只计数真实存在的会话：无 conversation.jsonl 的目录不纳入数量")
        void ignoresIncompleteDirectories() throws Exception {
            Config.getInstance().getSession().setMaxSavedSessions(2);
            // 一个只有 session.json、没有 conversation.jsonl 的空目录，不应被计数
            Path incomplete = WorkspaceManager.getSessionDir("incomplete-dir");
            Files.createDirectories(incomplete);
            Files.writeString(incomplete.resolve("session.json"), "{}");

            createSessionOnDisk("real-1", 1000);
            createSessionOnDisk("real-2", 2000);
            createSessionOnDisk("real-3", 3000);

            triggerCleanup();

            // 有效会话 = 3，上限 2 → 清 1 个最旧，empty/incomplete 目录本身不被清理也不计数
            assertTrue(Files.exists(incomplete));
            assertFalse(existsOnDisk("real-1"));
            assertTrue(existsOnDisk("real-2"));
            assertTrue(existsOnDisk("real-3"));
        }
    }
}