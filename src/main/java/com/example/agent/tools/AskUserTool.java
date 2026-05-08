package com.example.agent.tools;

import com.example.agent.console.AgentUi;
import com.example.agent.console.ConsoleStyle;
import com.example.agent.core.blocker.RequestContext;
import com.example.agent.core.di.ServiceLocator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.jline.reader.EndOfFileException;
import org.jline.reader.LineReader;
import org.jline.reader.UserInterruptException;

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

        // 在 Web 环境中，返回交互式数据，等待用户响应
        if (RequestContext.isWeb()) {
            return formatWebResult(question, options, allowCustomInput);
        }

        // 在 CLI 环境中，使用终端交互
        try {
            String answer = promptUser(question, options, allowCustomInput);
            return formatResult(question, answer);
        } catch (UserInterruptException | EndOfFileException e) {
            throw new ToolExecutionException("用户取消了输入", e);
        } catch (Exception e) {
            throw new ToolExecutionException("用户交互失败：" + e.getMessage(), e);
        }
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

    private String promptUser(String question, List<String> options, boolean allowCustomInput) {
        LineReader reader = ServiceLocator.get(LineReader.class);
        AgentUi ui = ServiceLocator.get(AgentUi.class);
        com.example.agent.progress.SpinnerManager spinnerManager = com.example.agent.progress.SpinnerManager.getInstance();

        spinnerManager.pauseAll();
        try {
        ui.println();
        ui.println(ConsoleStyle.gray("┌─────────────────────────────────────────────────────────────┐"));
        ui.println(ConsoleStyle.gray("│   ") + ConsoleStyle.boldYellow("Agent 需要您的确认") + ConsoleStyle.gray("                                      │"));
        ui.println(ConsoleStyle.gray("└─────────────────────────────────────────────────────────────┘"));
        ui.println();
        ui.println(ConsoleStyle.bold("问题: ") + question);
        ui.println();

        if (!options.isEmpty()) {
            ui.println(ConsoleStyle.bold("选项:"));
            for (int i = 0; i < options.size(); i++) {
                ui.println("  " + ConsoleStyle.cyan(String.valueOf(i + 1)) + ". " + options.get(i));
            }
            if (allowCustomInput) {
                ui.println("  " + ConsoleStyle.cyan("0") + ". 输入自定义答案");
            }
            ui.println();
            String prompt = ConsoleStyle.yellow("请选择 (输入数字");

            if (allowCustomInput) {
                prompt += "或直接输入答案";
            }
            prompt += "): ";

            String input = reader.readLine(prompt).trim();

            try {
                int choice = Integer.parseInt(input);
                if (choice >= 1 && choice <= options.size()) {
                    return options.get(choice - 1);
                } else if (choice == 0 && allowCustomInput) {
                    return reader.readLine(ConsoleStyle.yellow("请输入您的答案: ")).trim();
                } else {
                    ui.println(ConsoleStyle.yellow("无效的选择，请重新输入。"));
                    return promptUser(question, options, allowCustomInput);
                }
            } catch (NumberFormatException e) {
                if (allowCustomInput) {
                    return input;
                } else {
                    ui.println(ConsoleStyle.yellow("请输入有效的数字选项。"));
                    return promptUser(question, options, allowCustomInput);
                }
            }
        } else {
            String input = reader.readLine(ConsoleStyle.yellow("您的回答: "));
            return input != null ? input.trim() : "";
        }
        } finally {
            spinnerManager.resumeAll();
        }
    }

    private String formatResult(String question, String answer) {
        StringBuilder result = new StringBuilder();
        
        result.append("用户回答\n");
        result.append("─────────────────────────────────────────────────────────────\n");
        result.append("问题: ").append(question).append("\n");
        result.append("回答: ").append(answer).append("\n");
        result.append("─────────────────────────────────────────────────────────────\n");
        
        return result.toString();
    }
}
