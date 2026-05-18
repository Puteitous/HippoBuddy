package com.example.agent.web.session;

public class PendingBashConfirmation {
    public final String confirmId;
    public final String toolCallId;
    public final String toolName;
    public final String command;
    public final String arguments;
    public final String riskLevel;
    public final String riskReason;
    public final long createdAt;

    public PendingBashConfirmation(String confirmId, String toolCallId, String toolName,
                                    String command, String arguments,
                                    String riskLevel, String riskReason) {
        this.confirmId = confirmId;
        this.toolCallId = toolCallId;
        this.toolName = toolName;
        this.command = command;
        this.arguments = arguments;
        this.riskLevel = riskLevel;
        this.riskReason = riskReason;
        this.createdAt = System.currentTimeMillis();
    }

    public boolean isExpired(long timeoutMs) {
        return System.currentTimeMillis() - createdAt > timeoutMs;
    }
}
