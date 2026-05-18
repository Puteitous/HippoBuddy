package com.example.agent.core.blocker;

public class HookResult {

    private final boolean allowed;
    private final String reason;
    private final String suggestion;
    private final boolean warning;
    private final boolean confirmationRequired;
    private final String riskLevel;
    private final String commandDetail;

    private HookResult(boolean allowed, String reason, String suggestion, boolean warning) {
        this.allowed = allowed;
        this.reason = reason;
        this.suggestion = suggestion;
        this.warning = warning;
        this.confirmationRequired = false;
        this.riskLevel = null;
        this.commandDetail = null;
    }

    private HookResult(boolean allowed, String reason, String suggestion, boolean warning,
                       boolean confirmationRequired, String riskLevel, String commandDetail) {
        this.allowed = allowed;
        this.reason = reason;
        this.suggestion = suggestion;
        this.warning = warning;
        this.confirmationRequired = confirmationRequired;
        this.riskLevel = riskLevel;
        this.commandDetail = commandDetail;
    }

    public static HookResult allow() {
        return new HookResult(true, null, null, false);
    }

    public static HookResult warn(String reason, String suggestion) {
        return new HookResult(true, reason, suggestion, true);
    }

    public static HookResult validationError(String reason, String example) {
        return new HookResult(false, reason, example, false);
    }

    /**
     * 逻辑/状态错误专用 - 只报错误码，不给指导
     * 所有 Blocker 的默认选择
     */
    public static HookResult block(String errorCode) {
        return new HookResult(false, errorCode, null, false);
    }

    /**
     * 需要用户确认 - 命令有中等风险，需要用户决定是否执行
     *
     * @param reason       风险原因描述
     * @param riskLevel    风险等级：low / medium / high
     * @param commandDetail 完整的命令原文（用于前端展示）
     */
    public static HookResult requireConfirmation(String reason, String riskLevel, String commandDetail) {
        return new HookResult(false, reason, null, false, true, riskLevel, commandDetail);
    }

    public boolean isAllowed() {
        return allowed;
    }

    public boolean isConfirmationRequired() {
        return confirmationRequired;
    }

    /**
     * 是否被严格禁止（区别于"需要确认"）
     */
    public boolean isDenied() {
        return !allowed && !confirmationRequired;
    }

    public String getRiskLevel() {
        return riskLevel;
    }

    public String getCommandDetail() {
        return commandDetail;
    }

    public String getReason() {
        return reason;
    }

    public String getSuggestion() {
        return suggestion;
    }

    public boolean isWarning() {
        return warning;
    }

    public String formatErrorMessage() {
        if (allowed && !warning) {
            return "";
        }
        if (confirmationRequired) {
            return String.format("""
                ⛔ 等待用户确认
                ❓ %s
                💡 请在页面确认卡片中操作，无需额外确认
                """, reason);
        }
        if (suggestion != null) {
            return String.format("""
                ⛔ 执行被阻断
                ❌ 原因: %s
                💡 示例: %s
                """, reason, suggestion);
        }
        return String.format("""
            ⛔ 执行被阻断
            ❌ %s
            """, reason);
    }

    public String formatWarningMessage() {
        if (!warning) {
            return "";
        }
        if (suggestion != null) {
            return String.format("⚠️ %s (%s)", reason, suggestion);
        }
        return String.format("⚠️ %s", reason);
    }
}
