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
class CancelSubAgentToolTest {

    @Mock
    private SubAgentManager subAgentManager;

    private CancelSubAgentTool tool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tool = new CancelSubAgentTool(subAgentManager);
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        assertEquals("cancel_subagent", tool.getName());
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("task_id"));
        assertTrue(schema.contains("cancel_all"));
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
    void testExecuteMissingTaskIdAndNotCancelAll() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();

        String result = tool.execute(args);

        assertTrue(result.contains("请提供 task_id"));
        verify(subAgentManager, never()).getTask(anyString());
    }

    @Test
    void testExecuteBlankTaskId() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "");

        String result = tool.execute(args);

        assertTrue(result.contains("请提供 task_id"));
    }

    @Test
    void testExecuteTaskNotFound() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "non-existent-id");

        when(subAgentManager.getTask("non-existent-id")).thenReturn(null);

        String result = tool.execute(args);

        assertTrue(result.contains("未找到任务"));
        verify(subAgentManager).getTask("non-existent-id");
    }

    @Test
    void testExecuteTaskAlreadyCompleted() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "completed-task");

        SubAgentTask task = mock(SubAgentTask.class);
        when(subAgentManager.getTask("completed-task")).thenReturn(task);
        when(task.getStatus()).thenReturn(SubAgentStatus.COMPLETED);

        String result = tool.execute(args);

        assertTrue(result.contains("已结束"));
        verify(task, never()).cancel();
    }

    @Test
    void testExecuteTaskAlreadyFailed() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "failed-task");

        SubAgentTask task = mock(SubAgentTask.class);
        when(subAgentManager.getTask("failed-task")).thenReturn(task);
        when(task.getStatus()).thenReturn(SubAgentStatus.FAILED);

        String result = tool.execute(args);

        assertTrue(result.contains("已结束"));
        verify(task, never()).cancel();
    }

    @Test
    void testExecuteTaskCancelledSuccessfully() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "running-task");

        SubAgentTask task = mock(SubAgentTask.class);
        when(subAgentManager.getTask("running-task")).thenReturn(task);
        when(task.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(task.cancel()).thenReturn(true);

        String result = tool.execute(args);

        assertTrue(result.contains("已成功取消"));
        verify(task).cancel();
    }

    @Test
    void testExecuteTaskCancelFailed() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task_id", "stuck-task");

        SubAgentTask task = mock(SubAgentTask.class);
        when(subAgentManager.getTask("stuck-task")).thenReturn(task);
        when(task.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(task.cancel()).thenReturn(false);

        String result = tool.execute(args);

        assertTrue(result.contains("取消失败"));
        verify(task).cancel();
    }

    @Test
    void testExecuteCancelAllNoRunningTasks() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("cancel_all", true);

        SubAgentTask task = mock(SubAgentTask.class);
        when(task.getStatus()).thenReturn(SubAgentStatus.COMPLETED);
        when(subAgentManager.getAllTasks()).thenReturn(List.of(task));

        String result = tool.execute(args);

        assertTrue(result.contains("没有正在运行的子任务"));
        verify(task, never()).cancel();
    }

    @Test
    void testExecuteCancelAllWithRunningTasks() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("cancel_all", true);

        SubAgentTask runningTask = mock(SubAgentTask.class);
        when(runningTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(runningTask.cancel()).thenReturn(true);

        when(subAgentManager.getAllTasks()).thenReturn(List.of(runningTask));

        String result = tool.execute(args);

        assertTrue(result.contains("已批量取消"));
        verify(runningTask).cancel();
    }

    @Test
    void testExecuteCancelAllPartialSuccess() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("cancel_all", true);

        SubAgentTask task1 = mock(SubAgentTask.class);
        when(task1.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(task1.cancel()).thenReturn(true);

        SubAgentTask task2 = mock(SubAgentTask.class);
        when(task2.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(task2.cancel()).thenReturn(false);

        when(subAgentManager.getAllTasks()).thenReturn(List.of(task1, task2));

        String result = tool.execute(args);

        assertTrue(result.contains("1/2"));
    }
}
