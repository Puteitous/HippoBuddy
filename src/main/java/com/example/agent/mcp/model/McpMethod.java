package com.example.agent.mcp.model;

/**
 * MCP 协议方法枚举，统一管理所有 JSON-RPC method 名称。
 */
public enum McpMethod {

    // ── 生命周期 ──
    INITIALIZE("initialize"),
    INITIALIZED("initialized", true),
    PING("ping"),
    PONG("pong", true),

    // ── 工具 ──
    TOOLS_LIST("tools/list"),
    TOOLS_CALL("tools/call"),

    // ── 资源 ──
    RESOURCES_LIST("resources/list"),
    RESOURCES_READ("resources/read"),
    RESOURCES_SUBSCRIBE("resources/subscribe"),
    RESOURCES_UNSUBSCRIBE("resources/unsubscribe"),

    // ── 提示模板 ──
    PROMPTS_LIST("prompts/list"),
    PROMPTS_GET("prompts/get"),

    // ── 日志 ──
    LOGGING_SET_LEVEL("logging/setLevel"),

    // ── 采样 ──
    SAMPLING_CREATE_MESSAGE("sampling/createMessage", true),

    // ── 根资源 ──
    ROOTS_LIST("roots/list", true),

    // ── 完成 ──
    COMPLETION_COMPLETE("completion/complete"),

    // ── 取消 ──
    CANCEL_REQUEST("$/cancelRequest", true),
    ;

    private final String method;
    private final boolean notification;

    McpMethod(String method) {
        this(method, false);
    }

    McpMethod(String method, boolean notification) {
        this.method = method;
        this.notification = notification;
    }

    /** 获取 JSON-RPC method 字符串。 */
    public String getMethod() {
        return method;
    }

    /** 是否为通知（无需响应）。 */
    public boolean isNotification() {
        return notification;
    }

    @Override
    public String toString() {
        return method;
    }
}
