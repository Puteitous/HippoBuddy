package com.example.agent.tools;

import com.example.agent.core.todo.TodoManager;
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
        assertEquals("First task", todoManager.findById("task-1").get().getContent());
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
        assertTrue(todoManager.findById("task-1").isEmpty());
        assertTrue(todoManager.findById("task-2").isPresent());
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
        assertEquals("Updated task", todoManager.findById("task-1").get().getContent());
        assertTrue(todoManager.findById("task-1").get().getStatus().getKey().equals("in_progress"));
        assertTrue(todoManager.findById("task-2").isPresent());
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

        assertEquals("completed", todoManager.findById("task-1").get().getStatus().getKey());
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
        assertTrue(todoManager.findById("task-1").isPresent());
        assertEquals("", todoManager.findById("task-1").get().getContent());
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
