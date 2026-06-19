package com.example.agent.tools;

import com.example.agent.console.AgentUi;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.core.todo.TodoManager;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class TodoWriteTool implements ToolExecutor {

    private final TodoManager todoManager;

    public TodoWriteTool(TodoManager todoManager) {
        this.todoManager = todoManager;
    }

    @Override
    public String getName() {
        return "todo_write";
    }

    @Override
    public String getDescription() {
        return "创建和管理任务清单，用于跟踪执行进度。支持新增、更新、标记任务状态。\n\n" +
               "使用规范：每次执行重要操作前后都应该调用此工具来更新任务进度。" +
               "开始前用 mode: 'replace' 建立完整清单，执行中每步开始前标记 status: 'in_progress'，" +
               "完成后标记 status: 'completed'（均用 mode: 'merge'），计划变更也用 mode: 'merge'。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "mode": {
                        "type": "string",
                        "description": "操作模式: replace(覆盖整个任务列表) / merge(合并更新，默认)",
                        "enum": ["replace", "merge"],
                        "default": "merge"
                    },
                    "todos": {
                        "type": "array",
                        "description": "任务列表数组，每个任务包含以下字段",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "description": "任务唯一标识，用于更新时匹配"
                                },
                                "content": {
                                    "type": "string",
                                    "description": "任务内容描述"
                                },
                                "status": {
                                    "type": "string",
                                    "description": "任务状态: pending(待处理), in_progress(进行中), completed(已完成)",
                                    "enum": ["pending", "in_progress", "completed"],
                                    "default": "pending"
                                }
                            },
                            "required": ["id", "content"]
                        }
                    }
                },
                "required": ["todos"]
            }
            """;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        String mode = arguments.has("mode") ? arguments.get("mode").asText() : "merge";
        JsonNode todosNode = arguments.get("todos");

        if (!todosNode.isArray()) {
            throw new ToolExecutionException("todos 必须是数组");
        }

        List<Map<String, Object>> todos = new ArrayList<>();
        for (JsonNode todoNode : todosNode) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", todoNode.get("id").asText());
            item.put("content", todoNode.has("content") ? todoNode.get("content").asText() : "");
            item.put("status", todoNode.has("status") ? todoNode.get("status").asText() : "pending");
            todos.add(item);
        }

        if ("replace".equals(mode)) {
            todoManager.replaceAll(todos);
        } else {
            todoManager.mergeUpdates(todos);
        }

        AgentUi ui = ServiceLocator.getOrNull(AgentUi.class);
        todoManager.renderToUi(ui);

        return todoManager.formatAsMarkdown();
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        return List.of();
    }

    @Override
    public boolean requiresFileLock() {
        return false;
    }
}
