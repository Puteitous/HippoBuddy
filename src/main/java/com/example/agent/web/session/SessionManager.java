package com.example.agent.web.session;

import com.example.agent.domain.conversation.Conversation;

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

    // === Session 级 auto-allow ===

    void addAutoAllowRule(String sessionId, String commandName);

    boolean isAutoAllowed(String sessionId, String commandName);

    // ============================

    boolean tryAcquireSessionLock(String sessionId, long timeout, TimeUnit unit) throws InterruptedException;

    void releaseSessionLock(String sessionId);

    void clear();
}
