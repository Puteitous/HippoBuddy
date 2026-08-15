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

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 测试 {@link WorkspaceApiHandler#inspectCachedSessionPromptsAfterSwitch(String, String)} 监控逻辑：
 * 工作区切换后，已有会话的 system prompt 不应被本次切换改写。
 * <ul>
 *   <li>仍含旧路径且不含新路径 → 合规（返回 0）</li>
 *   <li>不含旧路径也不含新路径 → 合法（会话创建时未固化工作区路径），返回 0</li>
 *   <li>含新路径（被本次切换写入）→ 真违规（返回 > 0）</li>
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

    private String wsA() {
        return tempDir.resolve("ws-a").toString();
    }

    private String wsB() {
        return tempDir.resolve("ws-b").toString();
    }

    @Test
    @DisplayName("会话 prompt 仍含旧路径且不含新路径 → 检查通过（返回 0）")
    void promptKeepsOldPath_passes() {
        createCachedSession("s-ok", "## 当前工作区\n" + wsA());
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB()));
    }

    @Test
    @DisplayName("会话 prompt 被改写为新路径 → 标记异常（返回 1）")
    void promptRewrittenToNewPath_reported() {
        createCachedSession("s-bad", "## 当前工作区\n" + wsB());
        assertEquals(1, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB()));
    }

    @Test
    @DisplayName("会话 prompt 丢失旧路径且不含新路径 → 合法（创建时未固化工作区路径），返回 0")
    void promptLostOldPath_legal() {
        createCachedSession("s-lost", "system prompt 无任何工作区路径");
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB()));
    }

    @Test
    @DisplayName("会话 prompt 固化的是其他历史路径（既非旧也非新）→ 本次切换未触碰，返回 0")
    void promptHasOtherHistoricalPath_legal() {
        createCachedSession("s-other", "## 当前工作区\n" + tempDir.resolve("ws-old").toString());
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB()));
    }

    @Test
    @DisplayName("会话 prompt 同时含旧路径和新路径 → 被意外改写，返回 1")
    void promptHasBothOldAndNewPath_reported() {
        createCachedSession("s-both", "## 当前工作区\n" + wsA() + "\n" + wsB());
        assertEquals(1, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB()));
    }

    @Test
    @DisplayName("无缓存会话 → 返回 0 且不抛异常")
    void noCachedSessions_returnsZero() {
        assertEquals(0, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB()));
    }

    @Test
    @DisplayName("混合场景：一个合规一个异常 → 返回异常数 1")
    void mixedSessions_countsViolations() {
        createCachedSession("s-ok", "## 当前工作区\n" + wsA());
        createCachedSession("s-bad", "## 当前工作区\n" + wsB());
        assertEquals(1, handler.inspectCachedSessionPromptsAfterSwitch(wsA(), wsB()));
    }
}
