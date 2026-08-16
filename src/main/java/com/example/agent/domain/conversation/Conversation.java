package com.example.agent.domain.conversation;

import com.example.agent.context.BlockingGuard;
import com.example.agent.context.ContextWindow;
import com.example.agent.context.TokenBudget;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Usage;
import com.example.agent.service.TokenEstimator;

import java.util.List;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class Conversation {

    private final ContextWindow contextWindow;
    private final BlockingGuard blockingGuard;
    private final String sessionId;
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    private String systemPrompt;
    /** System Prompt 冻结标志：首次 set 后不可再变（会话创建时固化） */
    private boolean systemPromptFrozen;
    private volatile Usage lastKnownUsage;

    public Conversation(int maxTokens, TokenEstimator tokenEstimator) {
        this(maxTokens, tokenEstimator, String.valueOf(System.currentTimeMillis()));
    }

    public Conversation(int maxTokens, TokenEstimator tokenEstimator, String sessionId) {
        this.sessionId = sessionId;
        this.contextWindow = new ContextWindow(maxTokens, tokenEstimator);
        this.blockingGuard = new BlockingGuard(contextWindow);
    }

    public void addMessage(Message message) {
        lock.writeLock().lock();
        try {
            if (!blockingGuard.canAddMessage()) {
                throw new IllegalStateException(blockingGuard.getStatusMessage());
            }
            contextWindow.addMessage(message);
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void addMessages(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return;
        }
        lock.writeLock().lock();
        try {
            if (!blockingGuard.canAddMessage()) {
                throw new IllegalStateException(blockingGuard.getStatusMessage());
            }
            contextWindow.addMessages(messages);
        } finally {
            lock.writeLock().unlock();
        }
    }

    public List<Message> getMessages() {
        lock.readLock().lock();
        try {
            return contextWindow.getRawMessages();
        } finally {
            lock.readLock().unlock();
        }
    }

    public int getMessageCount() {
        lock.readLock().lock();
        try {
            return contextWindow.getRawMessages().size();
        } finally {
            lock.readLock().unlock();
        }
    }

    public List<Message> getEffectiveMessages() {
        lock.readLock().lock();
        try {
            return contextWindow.getEffectiveMessages();
        } finally {
            lock.readLock().unlock();
        }
    }

    public List<Message> getAllMessages() {
        lock.readLock().lock();
        try {
            return contextWindow.getAllMessagesForUI();
        } finally {
            lock.readLock().unlock();
        }
    }

    public TokenBudget getBudget() {
        lock.readLock().lock();
        try {
            return contextWindow.getBudget();
        } finally {
            lock.readLock().unlock();
        }
    }

    public double getUsageRatio() {
        lock.readLock().lock();
        try {
            return contextWindow.getBudget().getUsageRatio();
        } finally {
            lock.readLock().unlock();
        }
    }

    public int getTokenCount() {
        lock.readLock().lock();
        try {
            return contextWindow.getBudget().getCurrentTokens();
        } finally {
            lock.readLock().unlock();
        }
    }

    public void clear() {
        lock.writeLock().lock();
        try {
            contextWindow.clear();
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void replaceMessages(List<Message> newMessages) {
        lock.writeLock().lock();
        try {
            contextWindow.clearInjectedWarnings();
            contextWindow.replaceMessages(newMessages);
        } finally {
            lock.writeLock().unlock();
        }
    }

    public int size() {
        lock.readLock().lock();
        try {
            return contextWindow.size();
        } finally {
            lock.readLock().unlock();
        }
    }

    public void clearInjectedWarnings() {
        lock.writeLock().lock();
        try {
            contextWindow.clearInjectedWarnings();
        } finally {
            lock.writeLock().unlock();
        }
    }

    public ContextWindow getContextWindow() {
        return contextWindow;
    }

    public BlockingGuard getBlockingGuard() {
        return blockingGuard;
    }

    public void updateLastKnownUsage(Usage usage) {
        this.lastKnownUsage = usage;
    }

    public Usage getLastKnownUsage() {
        return lastKnownUsage;
    }

    public boolean hasKnownUsage() {
        return lastKnownUsage != null;
    }

    public int getLastKnownTotalTokens() {
        return lastKnownUsage != null ? lastKnownUsage.getTotalTokens() : 0;
    }

    public String getSessionId() {
        return sessionId;
    }

    public String getSystemPrompt() {
        return systemPrompt;
    }

    /**
     * 设置 System Prompt（仅会话创建时允许调用一次）。
     * <p>
     * 冻结语义：会话创建后 system prompt 不可变。LLM 服务端前缀缓存要求
     * 每次请求的 system 字段逐字节一致，运行中任何改写（切工作区/重启/
     * 规则变更/前端改 prompt）都会击穿缓存（曾观测到 cacheHitRate 96% → 6.7%）。
     * 如需更换 prompt，必须新建会话。
     * </p>
     *
     * @throws IllegalStateException 会话创建后再次调用（冻结违规）
     */
    public void setSystemPrompt(String systemPrompt) {
        if (systemPromptFrozen) {
            throw new IllegalStateException(
                "System Prompt 已冻结：会话创建后不可变更（固化以保证 LLM 前缀缓存稳定命中）。"
                    + "如需更换提示词请新建会话。");
        }
        this.systemPrompt = systemPrompt;
        this.systemPromptFrozen = true;
    }

    public boolean shouldMarkForMemory(Message message) {
        return message.isUser() && message.getContent() != null 
            && message.getContent().length() > 20;
    }
}
