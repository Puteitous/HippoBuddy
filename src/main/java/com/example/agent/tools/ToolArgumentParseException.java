package com.example.agent.tools;

/**
 * 工具参数 JSON 解析失败时抛出的异常。
 * 携带原始参数字符串和工具名称，便于调用方做 re-prompt 或记录日志。
 */
public class ToolArgumentParseException extends Exception {

    private final String rawArguments;
    private final String toolName;

    public ToolArgumentParseException(String rawArguments, String toolName, String message) {
        super(message);
        this.rawArguments = rawArguments;
        this.toolName = toolName;
    }

    public ToolArgumentParseException(String rawArguments, String toolName, String message, Throwable cause) {
        super(message, cause);
        this.rawArguments = rawArguments;
        this.toolName = toolName;
    }

    /**
     * 获取原始的 tool_call 参数字符串（未解析的 JSON 文本）。
     */
    public String getRawArguments() {
        return rawArguments;
    }

    /**
     * 获取工具名称。
     */
    public String getToolName() {
        return toolName;
    }

    /**
     * 构造适合喂回给 LLM 的纠错提示。
     */
    public String toLlmPrompt() {
        return String.format(
                "工具 %s 的参数 JSON 格式有误，请检查并修正后重新调用。\n错误信息：%s",
                toolName, getMessage()
        );
    }
}
