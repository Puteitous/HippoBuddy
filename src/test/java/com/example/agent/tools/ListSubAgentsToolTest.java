package com.example.agent.tools;

import com.example.agent.subagent.SubAgentManager;
import com.example.agent.subagent.SubAgentStatus;
import com.example.agent.subagent.SubAgentTask;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ListSubAgentsToolTest {

    @Mock
    private SubAgentManager subAgentManager;

    private ListSubAgentsTool tool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tool = new ListSubAgentsTool(subAgentManager);
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        assertEquals("list_subagents", tool.getName());
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("status"));
        assertTrue(schema.contains("task_id"));
    }

    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testGetAffectedPaths() {
        ObjectNode args = objectMapper.createObjectNode();
        assertEquals(1, tool.getAffectedPaths(args).size());
    }

    @Test
    void testExecuteWithTaskIdFound() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "task-123");

        SubAgentTask task = mock(SubAgentTask.class);
        when(subAgentManager.getTask("task-123")).thenReturn(task);
        when(task.getTaskId()).thenReturn("task-123");
        when(task.getStatus()).thenReturn(SubAgentStatus.COMPLETED);
        when(task.getDescription()).thenReturn("analyze code");
        when(task.getResultSummary()).thenReturn("Found 3 bugs");
        when(task.getOutputLog()).thenReturn(List.of("log1", "log2"));

        String result = tool.execute(args);

        assertTrue(result.contains("task-123"));
        assertTrue(result.contains("COMPLETED"));
        assertTrue(result.contains("Found 3 bugs"));
        verify(subAgentManager).getTask("task-123");
    }

    @Test
    void testExecuteWithTaskIdNotFound() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "unknown");

        when(subAgentManager.getTask("unknown")).thenReturn(null);

        String result = tool.execute(args);

        assertTrue(result.contains("未找到任务"));
        verify(subAgentManager).getTask("unknown");
    }

    @Test
    void testExecuteStatusFilterAll() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("status", "ALL");

        SubAgentTask task = mock(SubAgentTask.class);
        when(task.getStatus()).thenReturn(SubAgentStatus.COMPLETED);
        when(task.getTaskId()).thenReturn("task-1");
        when(task.getDescription()).thenReturn("test task");

        when(subAgentManager.getAllTasks()).thenReturn(List.of(task));

        String result = tool.execute(args);

        assertTrue(result.contains("task-1"));
        assertTrue(result.contains("总计: 1"));
    }

    @Test
    void testExecuteStatusFilterRunning() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("status", "RUNNING");

        SubAgentTask runningTask = mock(SubAgentTask.class);
        when(runningTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(runningTask.getTaskId()).thenReturn("task-r1");
        when(runningTask.getDescription()).thenReturn("active task");

        SubAgentTask completedTask = mock(SubAgentTask.class);
        when(completedTask.getStatus()).thenReturn(SubAgentStatus.COMPLETED);

        when(subAgentManager.getAllTasks()).thenReturn(List.of(runningTask, completedTask));

        String result = tool.execute(args);

        assertTrue(result.contains("task-r1"));
        assertFalse(result.contains("task-c1"));
    }

    @Test
    void testExecuteStatusFilterFailed() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("status", "FAILED");

        SubAgentTask failedTask = mock(SubAgentTask.class);
        when(failedTask.getStatus()).thenReturn(SubAgentStatus.FAILED);
        when(failedTask.getTaskId()).thenReturn("task-f1");
        when(failedTask.getDescription()).thenReturn("failed task");
        when(failedTask.getError()).thenReturn(new RuntimeException("timeout"));

        when(subAgentManager.getAllTasks()).thenReturn(List.of(failedTask));

        String result = tool.execute(args);

        assertTrue(result.contains("task-f1"));
        assertTrue(result.contains("timeout"));
    }

    @Test
    void testExecuteEmptyResult() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("status", "RUNNING");

        SubAgentTask completedTask = mock(SubAgentTask.class);
        when(completedTask.getStatus()).thenReturn(SubAgentStatus.COMPLETED);

        when(subAgentManager.getAllTasks()).thenReturn(List.of(completedTask));

        String result = tool.execute(args);

        assertTrue(result.contains("暂无 RUNNING 状态的子任务"));
    }

    @Test
    void testExecuteDefaultStatusFilter() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();

        when(subAgentManager.getAllTasks()).thenReturn(List.of());

        String result = tool.execute(args);

        assertTrue(result.contains("暂无 ALL 状态的子任务"));
    }

    @Test
    void testExecuteTaskWithError() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "errored-task");

        SubAgentTask task = mock(SubAgentTask.class);
        when(subAgentManager.getTask("errored-task")).thenReturn(task);
        when(task.getTaskId()).thenReturn("errored-task");
        when(task.getStatus()).thenReturn(SubAgentStatus.FAILED);
        when(task.getDescription()).thenReturn("risky task");
        when(task.getError()).thenReturn(new RuntimeException("NullPointerException"));
        when(task.getOutputLog()).thenReturn(List.of("step1", "step2"));

        String result = tool.execute(args);

        assertTrue(result.contains("NullPointerException"));
    }

    @Test
    void testExecuteTaskWithDependencies() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("status", "ALL");

        SubAgentTask task = mock(SubAgentTask.class);
        when(task.getStatus()).thenReturn(SubAgentStatus.WAITING);
        when(task.getTaskId()).thenReturn("task-dep");
        when(task.getDescription()).thenReturn("dependent task");
        when(task.hasDependencies()).thenReturn(true);
        when(task.getDependsOn()).thenReturn(List.of("task-1", "task-2"));

        when(subAgentManager.getAllTasks()).thenReturn(List.of(task));

        String result = tool.execute(args);

        assertTrue(result.contains("task-dep"));
        assertTrue(result.contains("依赖"));
    }

    @Test
    void testExecuteTaskWithResultSummary() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("status", "ALL");

        SubAgentTask task = mock(SubAgentTask.class);
        when(task.getStatus()).thenReturn(SubAgentStatus.COMPLETED);
        when(task.getTaskId()).thenReturn("task-res");
        when(task.getDescription()).thenReturn("task with result");
        when(task.getResultSummary()).thenReturn("All tests passed");

        when(subAgentManager.getAllTasks()).thenReturn(List.of(task));

        String result = tool.execute(args);

        assertTrue(result.contains("All tests passed"));
    }
}
