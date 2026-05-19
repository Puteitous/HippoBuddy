package com.example.agent.context;

import com.example.agent.context.budget.BudgetListener;
import com.example.agent.context.budget.BudgetThreshold;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

public class TokenBudget {

    private static final Logger logger = LoggerFactory.getLogger(TokenBudget.class);
    
    private final int maxTokens;
    private final AtomicInteger currentTokens;
    private final Set<BudgetThreshold> triggeredThresholds;
    private final List<BudgetListener> listeners;

    public TokenBudget(int maxTokens) {
        if (maxTokens <= 0) {
            throw new IllegalArgumentException("maxTokens must be positive");
        }
        this.maxTokens = maxTokens;
        this.currentTokens = new AtomicInteger(0);
        this.triggeredThresholds = EnumSet.noneOf(BudgetThreshold.class);
        this.listeners = new CopyOnWriteArrayList<>();
        logger.info("TokenBudget 初始化完成：maxTokens={}, 默认阈值配置加载完毕", maxTokens);
    }

    public void update(int newTokenCount) {
        int safeTokens = Math.max(0, newTokenCount);
        int oldTokens = currentTokens.getAndSet(safeTokens);
        
        if (oldTokens == safeTokens) {
            return;
        }
        
        double ratio = getUsageRatio();

        listeners.forEach(listener -> listener.onBudgetUpdated(safeTokens, maxTokens, ratio));

        checkThresholds(ratio);

        if (safeTokens > maxTokens) {
            listeners.forEach(listener -> listener.onBudgetExceeded(safeTokens, maxTokens));
        }
    }

    public void addTokens(int tokensToAdd) {
        update(Math.max(0, currentTokens.get() + tokensToAdd));
    }

    private void checkThresholds(double ratio) {
        BudgetThreshold currentThreshold = BudgetThreshold.fromRatio(ratio);
        
        if (currentThreshold != null) {
            synchronized (triggeredThresholds) {
                if (!triggeredThresholds.contains(currentThreshold)) {
                    triggeredThresholds.add(currentThreshold);
                    logger.info("🔔 达到新阈值：{} (ratio={}%, currentTokens={}, maxTokens={})", 
                        currentThreshold, String.format("%.2f", ratio * 100), currentTokens.get(), maxTokens);
                    notifyThreshold(currentThreshold);
                }
            }
        }
    }

    private void notifyThreshold(BudgetThreshold threshold) {
        logger.debug("通知 {} 个监听器：阈值={}", listeners.size(), threshold);
        listeners.forEach(listener -> 
            listener.onThresholdReached(threshold, currentTokens.get(), maxTokens)
        );
    }

    public void addListener(BudgetListener listener) {
        if (listener != null) {
            listeners.add(listener);
        }
    }

    public void removeListener(BudgetListener listener) {
        listeners.remove(listener);
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public int getCurrentTokens() {
        return currentTokens.get();
    }

    public double getUsageRatio() {
        return (double) currentTokens.get() / maxTokens;
    }

    public boolean isThresholdTriggered(BudgetThreshold threshold) {
        return triggeredThresholds.contains(threshold);
    }

    public BudgetThreshold getHighestThreshold() {
        BudgetThreshold[] thresholds = BudgetThreshold.values();
        for (int i = thresholds.length - 1; i >= 0; i--) {
            if (triggeredThresholds.contains(thresholds[i])) {
                return thresholds[i];
            }
        }
        return null;
    }

    public void reset() {
        currentTokens.set(0);
        synchronized (triggeredThresholds) {
            triggeredThresholds.clear();
        }
    }
}
