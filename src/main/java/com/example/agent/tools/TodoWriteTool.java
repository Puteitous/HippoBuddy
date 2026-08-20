package com.example.agent.tools;

import com.example.agent.console.AgentUi;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.core.todo.TodoManager;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
               "简化传参：所有 todo 节点平铺传入，通过 parentId 表示层级关系。" +
               "parentId 为 null 或不传表示根节点。系统会自动构建树结构。\n\n" +
               "示例：\n" +
               "{\"mode\":\"replace\",\"todos\":[{\"id\":\"1\",\"content\":\"实现用户认证模块\",\"status\":\"in_progress\"}," +
               "{\"id\":\"1.1\",\"content\":\"设计数据库表\",\"status\":\"pending\",\"parentId\":\"1\"}," +
               "{\"id\":\"1.2\",\"content\":\"实现注册API\",\"status\":\"pending\",\"parentId\":\"1\"}]}";
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
                        "description": "任务列表，扁平传入，通过 parentId 表示层级。系统自动构建树",
                        "items": {
                            "$ref": "#/$defs/todoItem"
                        }
                    }
                },
                "required": ["todos"],
                "$defs": {
                    "todoItem": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "任务唯一标识，用于更新时匹配"
                            },
                            "content": {
                                "type": "string",
                                "description": "任务内容描述（replace 模式或新增节点时必须传，merge 模式只更新状态时可省略）"
                            },
                            "status": {
                                "type": "string",
                                "description": "任务状态: pending(待处理), in_progress(进行中), completed(已完成)",
                                "enum": ["pending", "in_progress", "completed"],
                                "default": "pending"
                            },
                            "parentId": {
                                "type": "string",
                                "description": "父任务 ID，null 或不传表示根节点。用于扁平化传参时指定层级关系"
                            },
                            "sessionId": {
                                "type": "string",
                                "description": "关联的会话 ID（可选），用于跳转到对应的分叉会话"
                            }
                        },
                        "required": ["id"]
                    }
                }
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

        // 1. 解析扁平列表
        List<Map<String, Object>> flatTodos = new ArrayList<>();
        for (JsonNode todoNode : todosNode) {
            flatTodos.add(jsonNodeToFlatMap(todoNode));
        }

        // 2. 将扁平列表按 parentId 构建为树结构
        List<Map<String, Object>> treeTodos = buildTreeFromFlatList(flatTodos);

        // 3. 传给 TodoManager（保持后端树接口不变）
        if ("replace".equals(mode)) {
            todoManager.replaceAll(treeTodos);
        } else {
            todoManager.mergeUpdates(treeTodos);
        }

        AgentUi ui = ServiceLocator.getOrNull(AgentUi.class);
        todoManager.renderToUi(ui);

        return todoManager.formatAsMarkdown();
    }

    /**
     * 将扁平列表按 parentId 构建为嵌套树结构。
     * parentId 为 null 或不传 → 根节点。
     * 子节点按 parentId 匹配父节点，挂到父节点的 children 数组中。
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> buildTreeFromFlatList(List<Map<String, Object>> flatTodos) {
        // 按 id 建立索引
        Map<String, Map<String, Object>> nodeMap = new LinkedHashMap<>();
        for (Map<String, Object> item : flatTodos) {
            String id = (String) item.get("id");
            // 确保每个节点都有 children 字段
            if (!item.containsKey("children")) {
                item.put("children", new ArrayList<Map<String, Object>>());
            }
            nodeMap.put(id, item);
        }

        List<Map<String, Object>> roots = new ArrayList<>();

        for (Map<String, Object> item : flatTodos) {
            String parentId = (String) item.get("parentId");
            if (parentId == null || parentId.isEmpty()) {
                roots.add(item);
            } else {
                Map<String, Object> parent = nodeMap.get(parentId);
                // 挂接前做环检测:若 parentId 沿父链上溯能回到本节点(自引用/互引/上溯成环),
                // 说明存在环,会导致渲染/统计递归无限 → 整树丢失。此时将该节点退回为根节点,
                // 而非挂入环,保留内容并保证树始终无环。
                if (wouldCreateCycle(parentId, (String) item.get("id"), nodeMap)) {
                    roots.add(item);
                } else if (parent != null) {
                    ((List<Map<String, Object>>) parent.get("children")).add(item);
                } else {
                    // 父节点不存在，作为根节点
                    roots.add(item);
                }
            }
        }

        return roots;
    }

    /**
     * 沿 parentId 父链上溯,检测把 id 挂到 parentId 下是否会产生环。
     * 自引用(A.parentId=A)、互引用(A↔B)、以及更深的上溯环都会被识别为环。
     */
    private boolean wouldCreateCycle(String parentId, String id, Map<String, Map<String, Object>> nodeMap) {
        String cur = parentId;
        java.util.Set<String> seen = new java.util.HashSet<>();
        seen.add(id);
        while (cur != null && !cur.isEmpty()) {
            if (seen.contains(cur)) {
                return true;
            }
            seen.add(cur);
            Map<String, Object> parent = nodeMap.get(cur);
            if (parent == null) {
                return false;
            }
            Object pid = parent.get("parentId");
            cur = pid == null ? null : pid.toString();
        }
        return false;
    }

    /**
     * 将 JSON 节点解析为扁平的 Map（含 parentId，不含嵌套 children）。
     */
    private Map<String, Object> jsonNodeToFlatMap(JsonNode node) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", node.get("id").asText());
        // content 可选
        if (node.has("content") && !node.get("content").isNull()) {
            item.put("content", node.get("content").asText());
        }
        if (node.has("status")) {
            item.put("status", node.get("status").asText());
        }
        if (node.has("parentId") && !node.get("parentId").isNull()) {
            item.put("parentId", node.get("parentId").asText());
        }
        if (node.has("sessionId") && !node.get("sessionId").isNull()) {
            item.put("sessionId", node.get("sessionId").asText());
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
