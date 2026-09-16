package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class AskUserTool implements ToolExecutor {

    @Override
    public String getName() {
        return "ask_user";
    }

    @Override
    public String getDescription() {
        return "向用户提问并等待回答。用于在不确定的情况下获取用户确认或选择。" +
               "支持开放式问题和选项列表。这是实现人在回路的关键工具，" +
               "确保 Agent 在执行危险或不确定操作前征得用户同意。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "要向用户提出的问题"
                    },
                    "options": {
                        "type": "array",
                        "description": "可选的选项列表（如果提供，用户只能选择其中一个）",
                        "items": {
                            "type": "string"
                        }
                    },
                    "allow_custom_input": {
                        "type": "boolean",
                        "description": "是否允许用户输入自定义答案（默认 true，仅在提供选项时有效）",
                        "default": true
                    }
                },
                "required": ["question"]
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        return Collections.emptyList();
    }

    @Override
    public boolean requiresFileLock() {
        return false;
    }

    @Override
    public boolean shouldRunInBackground() {
        return false;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (!arguments.has("question") || arguments.get("question").isNull()) {
            throw new ToolExecutionException("缺少必需参数: question");
        }

        String question = arguments.get("question").asText();
        if (question == null || question.trim().isEmpty()) {
            throw new ToolExecutionException("question 参数不能为空");
        }
        
        List<String> options = new ArrayList<>();
        
        if (arguments.has("options") && arguments.get("options").isArray()) {
            for (JsonNode option : arguments.get("options")) {
                if (!option.isNull()) {
                    String optionText = option.asText();
                    if (optionText != null && !optionText.trim().isEmpty()) {
                        options.add(optionText);
                    }
                }
            }
        }

        boolean allowCustomInput = true;
        if (arguments.has("allow_custom_input") && !arguments.get("allow_custom_input").isNull()) {
            allowCustomInput = arguments.get("allow_custom_input").asBoolean();
        }

        // 返回交互式数据，由前端渲染成交互式卡片并回传用户响应（人在回路）
        return formatWebResult(question, options, allowCustomInput);
    }

    /**
     * 格式化 Web 环境的返回结果
     * 返回 JSON 格式，前端会渲染成交互式卡片
     */
    private String formatWebResult(String question, List<String> options, boolean allowCustomInput) {
        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\"question\":").append(escapeJson(question)).append(",");
        
        if (!options.isEmpty()) {
            json.append("\"options\":[");
            for (int i = 0; i < options.size(); i++) {
                if (i > 0) json.append(",");
                json.append(escapeJson(options.get(i)));
            }
            json.append("],");
        }
        
        json.append("\"allow_custom_input\":").append(allowCustomInput);
        json.append("}");
        
        return json.toString();
    }

    private String escapeJson(String text) {
        if (text == null) return "null";
        return "\"" + text
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t") + "\"";
    }

}
