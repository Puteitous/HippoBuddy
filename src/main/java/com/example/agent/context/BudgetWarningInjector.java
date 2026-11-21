package com.example.agent.context;

import com.example.agent.context.budget.BudgetListener;
import com.example.agent.context.budget.BudgetThreshold;
import com.example.agent.llm.model.Message;

public class BudgetWarningInjector implements BudgetListener {

    private final ContextWindow contextWindow;

    public BudgetWarningInjector(ContextWindow contextWindow) {
        this.contextWindow = contextWindow;
    }

    @Override
    public void onBudgetUpdated(int currentTokens, int maxTokens, double usageRatio) {
    }

    @Override
    public void onThresholdReached(BudgetThreshold threshold, int currentTokens, int maxTokens) {
        if (threshold == BudgetThreshold.SLIDING_WINDOW || threshold == BudgetThreshold.AUTO_COMPACT) {
            injectNewSessionSuggestion(currentTokens, maxTokens);
        }
    }

    private void injectNewSessionSuggestion(int currentTokens, int maxTokens) {
        double percent = maxTokens > 0 ? currentTokens * 100.0 / maxTokens : 0;
        String content =
            "<system-reminder>\n" +
            String.format("当前上下文已使用 %.1f%%（%d / %d tokens）。\n", percent, currentTokens, maxTokens) +
            "如需释放上下文空间，请先征询用户意见，再压缩上下文或开启新会话。\n" +
            "不要未经用户同意自行压缩。\n" +
            "</system-reminder>";
        // 同一时刻只保留一条使用率提醒，避免提醒累积反过来推高 token 占用
        contextWindow.clearInjectedWarnings();
        contextWindow.injectWarning(Message.system(content));
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
