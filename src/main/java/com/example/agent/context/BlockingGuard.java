package com.example.agent.context;

import com.example.agent.context.budget.BudgetListener;
import com.example.agent.context.budget.BudgetThreshold;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class BlockingGuard implements BudgetListener {

    private static final Logger logger = LoggerFactory.getLogger(BlockingGuard.class);

    private final ContextWindow contextWindow;

    public BlockingGuard(ContextWindow contextWindow) {
        this.contextWindow = contextWindow;
    }

    @Override
    public void onThresholdReached(BudgetThreshold threshold, int currentTokens, int maxTokens) {
        if (threshold == BudgetThreshold.BLOCKING) {
            logger.warn("上下文使用率已达 {}/{} ({}%), 建议总结并开启新会话",
                currentTokens, maxTokens, String.format("%.1f", (double) currentTokens / maxTokens * 100));
        }
    }

    public boolean isBlocked() {
        return false;
    }

    public int getRemainingTokens(int maxTokens) {
        return Math.max(0, maxTokens - contextWindow.getBudget().getCurrentTokens());
    }

    public boolean canAddMessage() {
        return true;
    }

    public boolean canCallTool() {
        return true;
    }

    public String getStatusMessage() {
        return getContextWarningMessage();
    }

    public String getContextWarningMessage() {
        int used = contextWindow.getBudget().getCurrentTokens();
        int max = contextWindow.getBudget().getMaxTokens();
        return String.format(
            "上下文使用 %d / %d tokens (%.1f%%)，建议总结并开启新会话",
            used, max, (double) used / max * 100
        );
    }

    public void reset() {
    }

    public void register() {
        contextWindow.getBudget().addListener(this);
    }

    public void unregister() {
        contextWindow.getBudget().removeListener(this);
    }
}
