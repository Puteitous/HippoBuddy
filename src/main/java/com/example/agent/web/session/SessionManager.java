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

    boolean tryAcquireSessionLock(String sessionId, long timeout, TimeUnit unit) throws InterruptedException;

    void releaseSessionLock(String sessionId);

    void clear();
}
