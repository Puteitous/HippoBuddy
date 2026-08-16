package com.example.agent.web.handler;

import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.web.session.WebSessionManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 测试 {@link WorkspaceApiHandler#inspectCachedSessionPromptsAfterSwitch(String, String, Map)} 监控逻辑：
 * 工作区切换后，已有会话的 system prompt 不应被本次切换改写。
 *
 * <p>违规判定依据是「切换前后 prompt 内容是否发生变化」，而非「prompt 是否包含新路径」。
 * 这能避免误报：会话在创建时按当时工作区状态固化路径快照，当切回创建时的原工作区时，
 * prompt 虽包含新路径（即原路径），但内容未变，属于合法固化，不应告警。</p>
 * <ul>
 *   <li>切换前后 prompt 内容一致（含仍保留旧路径/切回原工作区等场景）→ 合规（返回 0）</li>
 *   <li>切换后 prompt 内容被改写 → 真违规（返回 &gt; 0）</li>
 * </ul>
 */
@DisplayName("工作区切换后 prompt 快照监控测试")
class WorkspacePromptSnapshotMonitorTest {

    @TempDir
    Path tempDir;

    private WebSessionManager manager;
    private WorkspaceApiHandler handler;

    @BeforeEach
    void setUp() {
        WorkspaceManager.overrideBasePath(tempDir);
        manager = WebSessionManager.getInstance();
        manager.clear();
        WorkspaceContext.clear();
        handler = new WorkspaceApiHandler();
    }

    @AfterEach
    void tearDown() {
        manager.clear();
        WorkspaceContext.clear();
    }

    private void createCachedSession(String sessionId, String prompt) {
        Conversation conv = new Conversation(1_000_000, TokenEstimatorFactory.getDefault(), sessionId);
        conv.setSystemPrompt(prompt);
        if (prompt != null && !prompt.isEmpty()) {
            conv.addMessage(Message.system(prompt));
        }
        manager.getSessions().put(sessionId, conv);
    }

    private Conversation getCachedSession(String sessionId) {
        return manager.getSessions().get(sessionId);
    }

    /**
     * 模拟"冻结被绕过"的 prompt 改写（反射写字段）。
     * 真实代码中冻结闸会在二次 setSystemPrompt 时抛 {@link IllegalStateException}，
     * 但监控器要防御的正是"绕过冻结"的违规改写——测试用反射模拟这种异常路径。
     */
    private static void forceRewritePrompt(Conversation conv, String newPrompt) {
        try {
            java.lang.reflect.Field f = Conversation.class.getDeclaredField("systemPrompt");
            f.setAccessible(true);
            f.set(conv, newPrompt);
        } catch (Exception e) {
            throw new RuntimeException("反射改写 systemPrompt 失败（测试基建问题）", e);
        }
    }

    /** 模拟切换前的 prompt 快照（与 handler 内部 snapshotSessionPrompts 语义一致）。 */
    private Map<String, String> snapshotPrompts() {
        Map<String, String> snapshots = new HashMap<>();
        for (Map.Entry<String, Conversation> entry : manager.getSessions().entrySet()) {
            snapshots.put(entry.getKey(), entry.getValue().getSystemPrompt());
        }
        return snapshots;
    }

    private String wsA() {
        return tempDir.resolve("ws-a").toString();
    }

    private String wsB() {
        return tempDir.resolve("ws-b").toString();
    }

    @Test
    @DisplayName("会话 prompt 仍含旧路径且切换前后内容不变 → 检查通过（返回 0）")
    void promptKeepsOldPath_passes() {
        createCachedSession("s-ok", "## 当前工作区\n" + wsA());
        Map<String, String> before = snapshotPrompts();
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB(), before));
    }

    @Test
    @DisplayName("会话 prompt 被本次切换改写为新路径 → 标记异常（返回 1）")
    void promptRewrittenToNewPath_reported() {
        createCachedSession("s-bad", "## 当前工作区\n" + wsA());
        Map<String, String> before = snapshotPrompts();
        // 模拟切换过程把 prompt 改写成了新路径（绕过冻结闸，反射写字段）
        forceRewritePrompt(getCachedSession("s-bad"), "## 当前工作区\n" + wsB());
        assertEquals(1, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB(), before));
    }

    @Test
    @DisplayName("会话 prompt 无任何工作区路径且切换前后不变 → 合法（创建时未固化路径），返回 0")
    void promptLostOldPath_legal() {
        createCachedSession("s-lost", "system prompt 无任何工作区路径");
        Map<String, String> before = snapshotPrompts();
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB(), before));
    }

    @Test
    @DisplayName("会话 prompt 固化的是其他历史路径且切换前后不变 → 本次切换未触碰，返回 0")
    void promptHasOtherHistoricalPath_legal() {
        createCachedSession("s-other", "## 当前工作区\n" + tempDir.resolve("ws-old").toString());
        Map<String, String> before = snapshotPrompts();
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB(), before));
    }

    @Test
    @DisplayName("切回会话创建时的原工作区：prompt 含新路径但切换前后内容不变 → 合法固化，返回 0")
    void switchBackToOriginalWorkspace_notRewritten() {
        // 会话创建于工作区 A，prompt 合法固化 A 路径
        createCachedSession("s-orig", "## 当前工作区\n" + wsA());
        Map<String, String> before = snapshotPrompts();
        // 从 B 切回 A：prompt 包含新路径（A），但内容未被本次切换改写 → 不应误报
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsB(), wsA(), before));
    }

    @Test
    @DisplayName("切回原工作区时 prompt 确实被改写为新路径 → 标记异常（返回 1）")
    void switchBackAfterRealRewrite_reported() {
        createCachedSession("s-rw", "## 当前工作区\n" + wsB());
        Map<String, String> before = snapshotPrompts();
        // 模拟切回 A 时 prompt 被改写成了 A 路径（内容变化 → 真违规，即使路径相同也要捕获）
        forceRewritePrompt(getCachedSession("s-rw"), "## 当前工作区\n" + wsA());
        assertEquals(1, handler.inspectCachedSessionPromptsAfterSwitch(wsB(), wsA(), before));
    }

    @Test
    @DisplayName("会话 prompt 同时含旧路径和新路径但切换前后内容不变 → 未被本次切换改写，返回 0")
    void promptHasBothPathsButUnchanged_notReported() {
        createCachedSession("s-both", "## 当前工作区\n" + wsA() + "\n" + wsB());
        Map<String, String> before = snapshotPrompts();
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB(), before));
    }

    @Test
    @DisplayName("无缓存会话 → 返回 0 且不抛异常")
    void noCachedSessions_returnsZero() {
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB(), snapshotPrompts()));
    }

    @Test
    @DisplayName("无切换前快照 → 无法证明改写，不告警（返回 0）")
    void missingBeforeSnapshot_notReported() {
        createCachedSession("s-unknown", "## 当前工作区\n" + wsA());
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB(), null));
    }

    @Test
    @DisplayName("混合场景：一个合规一个异常 → 返回异常数 1")
    void mixedSessions_countsViolations() {
        createCachedSession("s-ok", "## 当前工作区\n" + wsA());
        createCachedSession("s-bad", "## 当前工作区\n" + wsA());
        Map<String, String> before = snapshotPrompts();
        // 仅 s-bad 被改写为新路径（绕过冻结闸，反射写字段）
        forceRewritePrompt(getCachedSession("s-bad"), "## 当前工作区\n" + wsB());
        assertEquals(1, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB(), before));
    }
}
