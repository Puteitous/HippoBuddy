package com.example.agent.core.blocker;

public class HookResult {

    private final boolean allowed;
    private final String reason;
    private final String suggestion;
    private final boolean warning;

    private HookResult(boolean allowed, String reason, String suggestion, boolean warning) {
        this.allowed = allowed;
        this.reason = reason;
        this.suggestion = suggestion;
        this.warning = warning;
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

    public boolean isAllowed() {
        return allowed;
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
