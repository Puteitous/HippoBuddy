package com.example.agent.context.compressor;

import com.example.agent.context.ContextWindow;
import com.example.agent.context.SessionCompactionState;
import com.example.agent.context.budget.BudgetListener;
import com.example.agent.context.budget.BudgetThreshold;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.function.Consumer;

public class AutoCompactTrigger implements BudgetListener {

    private static final Logger logger = LoggerFactory.getLogger(AutoCompactTrigger.class);

    private final ContextWindow contextWindow;
    private final TokenEstimator tokenEstimator;
    private final String sessionId;

    public AutoCompactTrigger(ContextWindow contextWindow, TokenEstimator tokenEstimator) {
        this(contextWindow, tokenEstimator, "default-session");
    }

    public AutoCompactTrigger(ContextWindow contextWindow, TokenEstimator tokenEstimator, String sessionId) {
        this.contextWindow = contextWindow;
        this.tokenEstimator = tokenEstimator;
        this.sessionId = sessionId;
    }

    @Override
    public void onThresholdReached(BudgetThreshold threshold, int currentTokens, int maxTokens) {
        double ratio = (double) currentTokens / maxTokens * 100;
        logger.info("上下文使用率: {}% (threshold={}), 建议总结当前会话并开启新会话",
            String.format("%.1f", ratio), threshold);

        // 达到 90% 时注入建议消息
        if (threshold == BudgetThreshold.SLIDING_WINDOW || threshold == BudgetThreshold.AUTO_COMPACT) {
            injectNewSessionSuggestion();
        }
    }

    private void injectNewSessionSuggestion() {
        String content =
            "<system-reminder>\n" +
            "上下文即将写满，当前会话中的早期内容可能被截断。\n" +
            "建议：总结当前会话的关键信息，然后开启新会话继续。\n" +
            "</system-reminder>";
        contextWindow.injectWarning(Message.system(content));
    }

    public void register() {
        contextWindow.getBudget().addListener(this);
    }

    public void unregister() {
        contextWindow.getBudget().removeListener(this);
    }
}
