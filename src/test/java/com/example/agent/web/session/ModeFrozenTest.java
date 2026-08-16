package com.example.agent.web.session;

import com.example.agent.logging.WorkspaceManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 契约测试：会话 Mode 冻结闸。
 * <p>
 * 与 system prompt 固化同构 —— mode 首次非空设置后不可再变。
 * mode 是 tools 快照的键之一，若运行中可被改写，会击穿 LLM 前缀缓存
 * （切换 mode → toTools 过滤变化 → tools 参数变化 → 前缀缓存整体 miss）。
 * </p>
 * <p>
 * 语义：忽略而非抛异常（ChatApiHandler 每轮都会调 setMode，抛异常会打断请求）；
 * 同值重复设置幂等；不同值被忽略并 WARN。
 * </p>
 */
class ModeFrozenTest {

    @TempDir
    Path tempDir;

    private WebSessionManager manager;
    private Path originalHippoRoot;

    @BeforeEach
    void setUp() {
        // 隔离 HIPPO_ROOT 到临时目录，避免 getMode 从真实环境磁盘回退读取残留 mode
        originalHippoRoot = WorkspaceManager.getHippoRoot();
        WorkspaceManager.overrideBasePath(tempDir);
        manager = WebSessionManager.getInstance();
        manager.clear();
    }

    @AfterEach
    void tearDown() {
        manager.clear();
        WorkspaceManager.overrideBasePath(originalHippoRoot);
    }

    @Test
    @DisplayName("首次非空设置生效")
    void firstSetTakesEffect() {
        manager.setMode("s1", "coding");
        assertEquals("coding", manager.getMode("s1"));
    }

    @Test
    @DisplayName("同值重复设置幂等（每轮请求都发 mode 不触发 WARN/变更）")
    void sameValueRepeatedSet_isIdempotent() {
        manager.setMode("s1", "coding");
        manager.setMode("s1", "coding");
        manager.setMode("s1", "coding");
        assertEquals("coding", manager.getMode("s1"));
    }

    @Test
    @DisplayName("冻结后不同值被忽略（mode 不可中途更换）")
    void differentValueAfterFreeze_isIgnored() {
        manager.setMode("s1", "coding");
        manager.setMode("s1", "chat");  // 应被忽略
        assertEquals("coding", manager.getMode("s1"), "冻结后 mode 变更必须被忽略");
    }

    @Test
    @DisplayName("空 mode 不触发冻结（未设置状态仍可被后续设置）")
    void blankMode_doesNotFreeze() {
        manager.setMode("s1", null);
        manager.setMode("s1", "");
        assertNull(manager.getMode("s1"));
        manager.setMode("s1", "chat");
        assertEquals("chat", manager.getMode("s1"));
    }

    @Test
    @DisplayName("clear 后冻结状态重置，可重新设置")
    void clear_resetsFreezeState() {
        manager.setMode("s1", "coding");
        manager.setMode("s1", "chat");
        assertEquals("coding", manager.getMode("s1"));

        manager.clear();
        manager.setMode("s1", "office");
        assertEquals("office", manager.getMode("s1"));
    }

    @Test
    @DisplayName("不同会话互不影响（各自独立冻结）")
    void differentSessions_areIndependent() {
        manager.setMode("s1", "coding");
        manager.setMode("s2", "chat");
        manager.setMode("s1", "office");  // 被忽略
        assertEquals("coding", manager.getMode("s1"));
        assertEquals("chat", manager.getMode("s2"));
    }
}
