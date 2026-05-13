package com.example.agent.tools;

import com.example.agent.subagent.SubAgentManager;
import com.example.agent.subagent.SubAgentStatus;
import com.example.agent.subagent.SubAgentTask;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
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
class ForkAgentsToolTest {

    @Mock
    private SubAgentManager subAgentManager;

    private ForkAgentsTool tool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tool = new ForkAgentsTool(subAgentManager);
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        assertEquals("fork_agents", tool.getName());
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("tasks"));
        assertTrue(schema.contains("wait_for_all"));
        assertTrue(schema.contains("wait_timeout_seconds"));
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
    void testExecuteMissingTasks() {
        ObjectNode args = objectMapper.createObjectNode();

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testExecuteTasksNotArray() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("tasks", "not an array");

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testExecuteEmptyTasksArray() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.putArray("tasks");

        String result = tool.execute(args);

        assertTrue(result.contains("没有有效的任务"));
        verify(subAgentManager, never()).createSubAgent(anyString(), any(), anyInt(), anyList(), any());
    }

    @Test
    void testExecuteSingleTask() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode tasks = args.putArray("tasks");
        ObjectNode taskNode = tasks.addObject();
        taskNode.put("task", "analyze module A");

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("analyze module A", null, 300, List.of(), null)).thenReturn(subTask);

        String result = tool.execute(args);

        assertNotNull(result);
        verify(subAgentManager).createSubAgent("analyze module A", null, 300, List.of(), null);
    }

    @Test
    void testExecuteMultipleTasks() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode tasks = args.putArray("tasks");

        ObjectNode task1 = tasks.addObject();
        task1.put("task", "task one");
        ObjectNode task2 = tasks.addObject();
        task2.put("task", "task two");

        SubAgentTask subTask1 = mock(SubAgentTask.class);
        when(subTask1.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        SubAgentTask subTask2 = mock(SubAgentTask.class);
        when(subTask2.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("task one", null, 300, List.of(), null)).thenReturn(subTask1);
        when(subAgentManager.createSubAgent("task two", null, 300, List.of(), null)).thenReturn(subTask2);

        String result = tool.execute(args);

        assertNotNull(result);
        verify(subAgentManager, times(2)).createSubAgent(anyString(), any(), anyInt(), anyList(), any());
    }

    @Test
    void testExecuteTaskWithoutTaskFieldIsSkipped() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode tasks = args.putArray("tasks");

        ObjectNode invalid = tasks.addObject();
        invalid.put("id", "something");
        ObjectNode valid = tasks.addObject();
        valid.put("task", "actual task");

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("actual task", null, 300, List.of(), null)).thenReturn(subTask);

        String result = tool.execute(args);

        assertNotNull(result);
        verify(subAgentManager, times(1)).createSubAgent(anyString(), any(), anyInt(), anyList(), any());
    }

    @Test
    void testExecuteWithCustomTimeout() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode tasks = args.putArray("tasks");
        ObjectNode taskNode = tasks.addObject();
        taskNode.put("task", "heavy task");
        taskNode.put("timeout_seconds", 600);

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("heavy task", null, 600, List.of(), null)).thenReturn(subTask);

        tool.execute(args);

        verify(subAgentManager).createSubAgent("heavy task", null, 600, List.of(), null);
    }

    @Test
    void testExecuteTimeoutClamped() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode tasks = args.putArray("tasks");
        ObjectNode taskNode = tasks.addObject();
        taskNode.put("task", "task");
        taskNode.put("timeout_seconds", 5);

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("task", null, 30, List.of(), null)).thenReturn(subTask);

        tool.execute(args);

        verify(subAgentManager).createSubAgent("task", null, 30, List.of(), null);
    }

    @Test
    void testExecuteWithSubagentType() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        ArrayNode tasks = args.putArray("tasks");
        ObjectNode taskNode = tasks.addObject();
        taskNode.put("task", "verify results");
        taskNode.put("subagent_type", "verification");

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("verify results", "verification", 300, List.of(), null)).thenReturn(subTask);

        tool.execute(args);

        verify(subAgentManager).createSubAgent("verify results", "verification", 300, List.of(), null);
    }
}
