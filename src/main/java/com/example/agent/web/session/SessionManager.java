package com.example.agent.web.session;

import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.ToolCall;

import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public interface SessionManager {

    Conversation getOrCreateConversation(String sessionId, String systemPromptOverride);

    boolean shouldReloadSession(String sessionId);

    Map<String, Conversation> getSessions();

    SessionTokenStats getSessionTokenStats(String sessionId);

    SessionTokenStats getOrCreateSessionTokenStats(String sessionId);

    boolean hasPendingToolCall(String sessionId);

    PendingToolCall pollPendingToolCall(String sessionId);

    void setPendingToolCall(String sessionId, PendingToolCall pending);

    // === Bash 确认相关 ===

    boolean hasPendingBashConfirmation(String sessionId);

    PendingBashConfirmation pollPendingBashConfirmation(String sessionId);

    void setPendingBashConfirmation(String sessionId, PendingBashConfirmation pending);

    void clearPendingBashConfirmation(String sessionId);

    // ====================

    // === delete_file 确认相关 ===

    boolean hasPendingDeleteConfirmation(String sessionId);

    PendingDeleteConfirmation pollPendingDeleteConfirmation(String sessionId);

    void setPendingDeleteConfirmation(String sessionId, PendingDeleteConfirmation pending);

    void clearPendingDeleteConfirmation(String sessionId);

    // ============================

    // === Mode 存储 ===

    void setMode(String sessionId, String mode);

    String getMode(String sessionId);

    // =================

    boolean tryAcquireSessionLock(String sessionId, long timeout, TimeUnit unit) throws InterruptedException;

    void releaseSessionLock(String sessionId);

    void clear();

    /**
     * 更新会话的最后活跃时间。
     */
    void updateLastActivityAt(String sessionId);

    // === Agent 执行状态 ===

    /**
     * 设置会话的 Agent 执行状态。
     * @param sessionId 会话 ID
     * @param running true=正在执行，false=空闲
     */
    void setSessionRunning(String sessionId, boolean running);

    /**
     * 检查会话的 Agent 是否正在执行。
     */
    boolean isSessionRunning(String sessionId);
}
