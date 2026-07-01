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
        return "创建和管理树状任务清单，用于跟踪执行进度。支持嵌套子任务、增量更新状态。\n\n" +
               "使用规范：每次执行重要操作前后都应调用此工具来更新任务进度。" +
               "开始前用 mode: 'replace' 建立完整的树状任务结构，" +
               "执行中每步开始前标记 status: 'in_progress'，" +
               "完成后标记 status: 'completed'（均用 mode: 'merge'），" +
               "计划变更也用 mode: 'merge'。\n" +
               "树结构规范：根节点为总体目标，子节点为可执行的子任务。" +
               "兄弟节点表示可独立完成的任务。最多嵌套3层。每个节点必须有唯一id。\n\n" +
               "示例：\n" +
               "{\"mode\":\"replace\",\"todos\":[{\"id\":\"1\",\"content\":\"实现用户认证模块\",\"status\":\"in_progress\"," +
               "\"children\":[{\"id\":\"1.1\",\"content\":\"设计数据库表\",\"status\":\"pending\"}," +
               "{\"id\":\"1.2\",\"content\":\"实现注册API\",\"status\":\"pending\"}]}]}";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "mode": {
                        "type": "string",
                        "description": "操作模式: replace(覆盖整个任务树) / merge(深度合并更新，默认)",
                        "enum": ["replace", "merge"],
                        "default": "merge"
                    },
                    "todos": {
                        "type": "array",
                        "description": "树状任务列表，支持递归嵌套 children",
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
                                },
                                "sessionId": {
                                    "type": "string",
                                    "description": "关联的会话 ID（可选），用于跳转到对应的分叉会话"
                                },
                                "children": {
                                    "type": "array",
                                    "description": "子任务列表，递归嵌套相同结构。兄弟节点互不依赖，可独立执行",
                                    "items": {
                                        "$ref": "#/properties/todos/items"
                                    }
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
            todos.add(jsonNodeToMap(todoNode));
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

    @SuppressWarnings("unchecked")
    private Map<String, Object> jsonNodeToMap(JsonNode node) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", node.get("id").asText());
        item.put("content", node.has("content") ? node.get("content").asText() : "");
        if (node.has("status")) {
            item.put("status", node.get("status").asText());
        }
        if (node.has("sessionId") && !node.get("sessionId").isNull()) {
            item.put("sessionId", node.get("sessionId").asText());
        }
        if (node.has("children") && node.get("children").isArray()) {
            List<Map<String, Object>> children = new ArrayList<>();
            for (JsonNode child : node.get("children")) {
                children.add(jsonNodeToMap(child));
            }
            item.put("children", children);
        }
        return item;
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
