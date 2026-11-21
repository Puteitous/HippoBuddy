package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 上下文压缩工具。
 * <p>
 * 由当前会话的大模型自己生成交接笔记（summary），Web 层拦截后弹出确认卡片，
 * 用户点击确认才真正替换上下文。因此本类的 {@link #execute(JsonNode)} 只做参数校验，
 * 实际替换动作在 WebAgentOrchestrator / ToolConfirmHandler 中完成。
 */
public class CompactContextTool implements ToolExecutor {

    @Override
    public String getName() {
        return "compact_context";
    }

    @Override
    public String getDescription() {
        return "压缩当前会话的上下文。调用后会弹出确认卡片，只有用户点击确认才会生效。\n" +
            "summary 是你的交接笔记：压缩完成后，原始对话将不再进入上下文，你只能看到这份笔记。\n" +
            "因此必须完整保留：当前目标与用户纠正、关键结论与文件路径、已完成的操作、进行中的状态、下一步。\n" +
            "约束：必须单独调用，不能与其他工具放在同一轮并行调用。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "压缩后的唯一上下文。写成结构化交接笔记，保留目标、关键结论、文件路径、已完成操作、当前状态和下一步；不要保留工具输出的冗余细节。"
                    }
                },
                "required": ["summary"]
            }
            """;
    }

    @Override
    public boolean shouldRunInBackground() {
        return false;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (arguments == null || !arguments.hasNonNull("summary")) {
            throw new ToolExecutionException("缺少必需参数: summary");
        }
        String summary = arguments.get("summary").asText();
        if (summary == null || summary.trim().isEmpty()) {
            throw new ToolExecutionException("summary 参数不能为空");
        }
        throw new ToolExecutionException("compact_context 需要用户在界面中点击确认，请在 Web 会话中使用");
    }
}
