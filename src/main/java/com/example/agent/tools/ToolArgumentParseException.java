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
        StringBuilder sb = new StringBuilder();
        sb.append(String.format("工具 %s 的参数 JSON 格式有误，请检查并修正后重新调用。\n", toolName));
        sb.append(String.format("错误信息：%s\n", getMessage()));
        sb.append("建议：请检查字符串字段的引号是否完整、特殊字符（双引号、反斜杠、换行符）是否正确转义。");
        sb.append("对于 write_file 等包含长内容的工具，建议使用 append=true 分多次追加写入，以降低 JSON 格式错误的概率。");
        return sb.toString();
    }
}
