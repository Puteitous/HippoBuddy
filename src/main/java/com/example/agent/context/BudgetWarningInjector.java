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
            injectNewSessionSuggestion();
        }
    }

    private void injectNewSessionSuggestion() {
        String content =
            "<system-reminder>\n" +
            "上下文即将写满。建议总结当前对话的关键信息，\n" +
            "然后开启一个新会话继续工作。\n" +
            "</system-reminder>";
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
