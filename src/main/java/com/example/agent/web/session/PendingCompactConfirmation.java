package com.example.agent.web.session;

/**
 * compact_context 工具的待确认数据。
 * 用户点击确认后，由 ToolConfirmHandler 用 summary 替换当前会话上下文。
 */
public class PendingCompactConfirmation {
    public final String confirmId;
    public final String toolCallId;
    public final String toolName;
    public final String summary;
    public final String arguments;
    public final int currentTokens;
    public final int summaryTokens;
    public final long createdAt;

    public PendingCompactConfirmation(String confirmId, String toolCallId, String toolName,
                                      String summary, String arguments,
                                      int currentTokens, int summaryTokens) {
        this.confirmId = confirmId;
        this.toolCallId = toolCallId;
        this.toolName = toolName;
        this.summary = summary;
        this.arguments = arguments;
        this.currentTokens = currentTokens;
        this.summaryTokens = summaryTokens;
        this.createdAt = System.currentTimeMillis();
    }

    public boolean isExpired(long timeoutMs) {
        return System.currentTimeMillis() - createdAt > timeoutMs;
    }
}
