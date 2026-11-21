package com.example.agent.context;

import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimator;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

public class ContextWindow {

    private final TokenBudget budget;
    private final List<Message> messages;
    private final TokenEstimator tokenEstimator;
    private final List<Message> injectedWarnings;
    private boolean isRecalculating;
    /** 模型上下文起始下标：压缩后旧消息保留在 UI 历史中，但不再参与推理与预算统计 */
    private volatile int effectiveStartIndex;

    public ContextWindow(int maxTokens, TokenEstimator tokenEstimator) {
        if (tokenEstimator == null) {
            throw new IllegalArgumentException("tokenEstimator must not be null");
        }
        this.budget = new TokenBudget(maxTokens);
        this.messages = new CopyOnWriteArrayList<>();
        this.tokenEstimator = tokenEstimator;
        this.injectedWarnings = new CopyOnWriteArrayList<>();
        this.isRecalculating = false;
    }

    public void addMessage(Message message) {
        if (message == null) {
            throw new IllegalArgumentException("message must not be null");
        }
        messages.add(message);
        recalculateBudget();
    }

    public void addMessages(List<Message> newMessages) {
        if (newMessages == null || newMessages.isEmpty()) {
            return;
        }
        newMessages.forEach(msg -> {
            if (msg != null) {
                messages.add(msg);
            }
        });
        recalculateBudget();
    }

    private void recalculateBudget() {
        if (isRecalculating) {
            return;
        }
        try {
            isRecalculating = true;
            doRecalculate();
        } finally {
            isRecalculating = false;
        }
    }

    private void doRecalculate() {
        List<Message> allMessages = new ArrayList<>();
        allMessages.addAll(sliceFromStart());
        allMessages.addAll(injectedWarnings);
        
        int totalTokens = tokenEstimator.estimateConversationTokens(allMessages);
        budget.update(totalTokens);
    }

    /**
     * 返回模型实际可见的消息（不含注入警告）。
     * 当 {@link #effectiveStartIndex} > 0 时，始终保留首条 system 消息，
     * 其余从起始下标开始；旧消息仅用于 UI 历史。
     */
    private List<Message> sliceFromStart() {
        List<Message> result = new ArrayList<>();
        int start = Math.min(Math.max(0, effectiveStartIndex), messages.size());
        if (start > 0 && !messages.isEmpty() && messages.get(0).isSystem()) {
            result.add(messages.get(0));
        }
        for (int i = start; i < messages.size(); i++) {
            result.add(messages.get(i));
        }
        return result;
    }

    public void injectWarning(Message warningMessage) {
        if (warningMessage == null) {
            return;
        }
        injectedWarnings.add(warningMessage);
        recalculateBudget();
    }

    public void clearInjectedWarnings() {
        injectedWarnings.clear();
        recalculateBudget();
    }

    public List<Message> getEffectiveMessages() {
        List<Message> result = new ArrayList<>(sliceFromStart());
        result.addAll(injectedWarnings);
        
        return result.stream()
            .filter(m -> !m.isMemorySaved())
            .collect(Collectors.toList());
    }

    public List<Message> getAllMessagesForUI() {
        List<Message> result = new ArrayList<>(messages);
        result.addAll(injectedWarnings);
        return Collections.unmodifiableList(result);
    }

    public List<Message> getRawMessages() {
        return Collections.unmodifiableList(messages);
    }

    public void replaceMessages(List<Message> newMessages) {
        messages.clear();
        messages.addAll(newMessages);
        effectiveStartIndex = 0;
        recalculateBudget();
    }

    public void removeMessage(int index) {
        if (index < 0 || index >= messages.size()) {
            throw new IndexOutOfBoundsException(
                String.format("Cannot remove message at index %d, size is %d", 
                    index, messages.size())
            );
        }
        messages.remove(index);
        if (index < effectiveStartIndex) {
            effectiveStartIndex--;
        }
        recalculateBudget();
    }

    public TokenBudget getBudget() {
        return budget;
    }

    public int size() {
        return messages.size();
    }

    public boolean isEmpty() {
        return messages.isEmpty();
    }

    public void clear() {
        messages.clear();
        injectedWarnings.clear();
        effectiveStartIndex = 0;
        budget.reset();
    }

    public int getEffectiveStartIndex() {
        return effectiveStartIndex;
    }

    /** 设置模型上下文的起始下标；用于压缩后让旧消息只保留在 UI 历史中。 */
    public void setEffectiveStartIndex(int index) {
        this.effectiveStartIndex = Math.max(0, Math.min(index, messages.size()));
        // 起点变化后使用率会跳变，重置已触发阈值，避免压缩后不再提醒
        budget.reset();
        recalculateBudget();
    }

    public void forceRecalculate() {
        boolean wasRecalculating = isRecalculating;
        try {
            isRecalculating = false;
            recalculateBudget();
        } finally {
            isRecalculating = wasRecalculating;
        }
    }
}
