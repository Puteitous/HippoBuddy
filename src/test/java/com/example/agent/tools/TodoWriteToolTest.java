package com.example.agent.tools;

import com.example.agent.core.todo.TodoManager;
import com.example.agent.core.todo.TodoTreeNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TodoWriteToolTest {

    private TodoWriteTool tool;
    private TodoManager todoManager;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        todoManager = new TodoManager();
        tool = new TodoWriteTool(todoManager);
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        assertEquals("todo_write", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("任务"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("todos"));
        assertTrue(schema.contains("mode"));
        assertTrue(schema.contains("children"));
    }

    @Test
    void testExecuteMergeDefaultMode() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode todos = args.putArray("todos");
        ObjectNode item = todos.addObject();
        item.put("id", "task-1");
        item.put("content", "First task");
        item.put("status", "pending");

        String result = tool.execute(args);

        assertFalse(todoManager.isEmpty());
        assertEquals(1, todoManager.size());
        TodoTreeNode found = todoManager.findById("task-1");
        assertNotNull(found);
        assertEquals("First task", found.getContent());
        assertTrue(result.contains("First task"));
    }

    @Test
    void testExecuteReplaceMode() throws ToolExecutionException {
        ObjectNode args1 = objectMapper.createObjectNode();
        ArrayNode todos1 = args1.putArray("todos");
        ObjectNode item1 = todos1.addObject();
        item1.put("id", "task-1");
        item1.put("content", "First task");

        tool.execute(args1);
        assertEquals(1, todoManager.size());

        ObjectNode args2 = objectMapper.createObjectNode();
        args2.put("mode", "replace");
        ArrayNode todos2 = args2.putArray("todos");
        ObjectNode item2 = todos2.addObject();
        item2.put("id", "task-2");
        item2.put("content", "Replaced task");

        tool.execute(args2);

        assertEquals(1, todoManager.size());
        assertNull(todoManager.findById("task-1"));
        assertNotNull(todoManager.findById("task-2"));
    }

    @Test
    void testExecuteMergeExistingTask() throws ToolExecutionException {
        ObjectNode args1 = objectMapper.createObjectNode();
        ArrayNode todos1 = args1.putArray("todos");
        ObjectNode item1 = todos1.addObject();
        item1.put("id", "task-1");
        item1.put("content", "First task");
        item1.put("status", "pending");
        tool.execute(args1);

        ObjectNode args2 = objectMapper.createObjectNode();
        ArrayNode todos2 = args2.putArray("todos");
        ObjectNode item2 = todos2.addObject();
        item2.put("id", "task-1");
        item2.put("content", "Updated task");
        item2.put("status", "in_progress");
        ObjectNode item3 = todos2.addObject();
        item3.put("id", "task-2");
        item3.put("content", "Second task");
        tool.execute(args2);

        assertEquals(2, todoManager.size());
        TodoTreeNode found = todoManager.findById("task-1");
        assertNotNull(found);
        assertEquals("Updated task", found.getContent());
        assertEquals("in_progress", found.getStatus().getKey());
        assertNotNull(todoManager.findById("task-2"));
    }

    @Test
    void testExecuteTodosNotArray() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("todos", "not an array");

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testExecuteWithCompletedStatus() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode todos = args.putArray("todos");
        ObjectNode item = todos.addObject();
        item.put("id", "task-1");
        item.put("content", "Done task");
        item.put("status", "completed");

        tool.execute(args);

        TodoTreeNode found = todoManager.findById("task-1");
        assertNotNull(found);
        assertEquals("completed", found.getStatus().getKey());
    }

    @Test
    void testExecuteMultipleTodos() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode todos = args.putArray("todos");
        for (int i = 0; i < 5; i++) {
            ObjectNode item = todos.addObject();
            item.put("id", "task-" + i);
            item.put("content", "Task " + i);
            item.put("status", i == 0 ? "in_progress" : "pending");
        }

        String result = tool.execute(args);

        assertEquals(5, todoManager.size());
        assertTrue(result.contains("Task 0"));
        assertTrue(result.contains("Task 4"));
    }

    @Test
    void testExecuteWithoutContentField() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode todos = args.putArray("todos");
        ObjectNode item = todos.addObject();
        item.put("id", "task-1");
        item.put("status", "pending");

        String result = tool.execute(args);

        assertEquals(1, todoManager.size());
        TodoTreeNode found = todoManager.findById("task-1");
        assertNotNull(found);
        assertEquals("", found.getContent());
    }

    @Test
    void testExecuteWithNestedChildren() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode todos = args.putArray("todos");

        // 根节点
        ObjectNode root = todos.addObject();
        root.put("id", "1");
        root.put("content", "用户模块");
        root.put("status", "in_progress");
        ArrayNode children = root.putArray("children");

        ObjectNode child1 = children.addObject();
        child1.put("id", "1.1");
        child1.put("content", "数据库设计");
        child1.put("status", "pending");

        ObjectNode child2 = children.addObject();
        child2.put("id", "1.2");
        child2.put("content", "登录 API");
        child2.put("status", "completed");

        String result = tool.execute(args);

        assertEquals(3, todoManager.size()); // 1 root + 2 children
        TodoTreeNode rootNode = todoManager.findById("1");
        assertNotNull(rootNode);
        assertTrue(rootNode.hasChildren());
        assertEquals(2, rootNode.getChildren().size());

        TodoTreeNode subNode = todoManager.findById("1.1");
        assertNotNull(subNode);
        assertEquals("数据库设计", subNode.getContent());
        assertEquals("pending", subNode.getStatus().getKey());

        TodoTreeNode subNode2 = todoManager.findById("1.2");
        assertNotNull(subNode2);
        assertEquals("登录 API", subNode2.getContent());
        assertEquals("completed", subNode2.getStatus().getKey());

        assertTrue(result.contains("用户模块"));
        assertTrue(result.contains("数据库设计"));
        assertTrue(result.contains("登录 API"));
    }

    @Test
    void testMergeDeepChildren() throws ToolExecutionException {
        // 第一次：创建完整树
        ObjectNode args1 = objectMapper.createObjectNode();
        ArrayNode todos1 = args1.putArray("todos");
        ObjectNode root1 = todos1.addObject();
        root1.put("id", "1");
        root1.put("content", "用户模块");
        ArrayNode children1 = root1.putArray("children");
        ObjectNode c1 = children1.addObject();
        c1.put("id", "1.1");
        c1.put("content", "数据库设计");
        c1.put("status", "pending");
        ObjectNode c2 = children1.addObject();
        c2.put("id", "1.2");
        c2.put("content", "登录 API");
        c2.put("status", "pending");

        tool.execute(args1);
        assertEquals(3, todoManager.size());

        // 第二次：只更新 1.1 的状态（流式增量）
        ObjectNode args2 = objectMapper.createObjectNode();
        ArrayNode todos2 = args2.putArray("todos");
        ObjectNode root2 = todos2.addObject();
        root2.put("id", "1");
        ArrayNode children2 = root2.putArray("children");
        ObjectNode c1Update = children2.addObject();
        c1Update.put("id", "1.1");
        c1Update.put("status", "completed");

        tool.execute(args2);

        // 验证：总数不变，1.1 状态更新，1.2 仍保留
        assertEquals(3, todoManager.size(), "子节点不应丢失");

        TodoTreeNode updated = todoManager.findById("1.1");
        assertNotNull(updated);
        assertEquals("completed", updated.getStatus().getKey());

        TodoTreeNode kept = todoManager.findById("1.2");
        assertNotNull(kept);
        assertEquals("pending", kept.getStatus().getKey());
    }

    @Test
    void testGetAffectedPaths() {
        ObjectNode args = objectMapper.createObjectNode();
        assertTrue(tool.getAffectedPaths(args).isEmpty());
    }

    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }
}
