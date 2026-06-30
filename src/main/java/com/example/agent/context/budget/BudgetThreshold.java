package com.example.agent.context.budget;

public enum BudgetThreshold {

    WARNING_75(0.75, "上下文使用 75%，注意控制输出长度"),
    WARNING_85(0.85, "上下文使用 85%，建议总结当前会话并开启新会话"),
    SLIDING_WINDOW(0.90, "上下文使用 90%，请及时总结并开启新会话"),
    AUTO_COMPACT(0.95, "上下文即将写满"),
    BLOCKING(0.975, "上下文即将用尽");

    private final double ratio;
    private final String message;

    BudgetThreshold(double ratio, String message) {
        this.ratio = ratio;
        this.message = message;
    }

    public double getRatio() {
        return ratio;
    }

    public String getMessage() {
        return message;
    }

    public int getThresholdTokens(int maxTokens) {
        return (int) (maxTokens * ratio);
    }

    public static BudgetThreshold fromRatio(double ratio) {
        if (Double.isNaN(ratio) || Double.isInfinite(ratio) || ratio < 0) {
            return null;
        }
        double clampedRatio = Math.min(ratio, 1.0);
        BudgetThreshold[] thresholds = values();
        for (int i = thresholds.length - 1; i >= 0; i--) {
            if (clampedRatio >= thresholds[i].ratio) {
                return thresholds[i];
            }
        }
        return null;
    }
}
