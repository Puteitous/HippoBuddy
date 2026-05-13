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

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ForkAgentToolTest {

    @Mock
    private SubAgentManager subAgentManager;

    private ForkAgentTool tool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tool = new ForkAgentTool(subAgentManager);
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        assertEquals("fork_agent", tool.getName());
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("task"));
        assertTrue(schema.contains("subagent_type"));
        assertTrue(schema.contains("wait_for_result"));
        assertTrue(schema.contains("timeout_seconds"));
    }

    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testShouldRunInBackground() {
        assertFalse(tool.shouldRunInBackground());
    }

    @Test
    void testGetAffectedPaths() {
        ObjectNode args = objectMapper.createObjectNode();
        assertEquals(1, tool.getAffectedPaths(args).size());
    }

    @Test
    void testExecuteMissingTask() {
        ObjectNode args = objectMapper.createObjectNode();

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testExecuteNullTask() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("task");

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testExecuteBlankTask() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task", "");

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent(eq(""), isNull(), eq(300), isNull(), isNull())).thenReturn(subTask);

        String result = tool.execute(args);

        assertNotNull(result);
        verify(subAgentManager).createSubAgent(eq(""), isNull(), eq(300), isNull(), isNull());
    }

    @Test
    void testExecuteWithCustomTimeout() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task", "analyze code");
        args.put("timeout_seconds", 120);

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("analyze code", null, 120, null, null)).thenReturn(subTask);

        tool.execute(args);

        verify(subAgentManager).createSubAgent("analyze code", null, 120, null, null);
    }

    @Test
    void testExecuteTimeoutClampedToMinimum() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task", "quick task");
        args.put("timeout_seconds", 10);

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("quick task", null, 30, null, null)).thenReturn(subTask);

        tool.execute(args);

        verify(subAgentManager).createSubAgent("quick task", null, 30, null, null);
    }

    @Test
    void testExecuteTimeoutClampedToMaximum() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task", "long task");
        args.put("timeout_seconds", 5000);

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("long task", null, 3600, null, null)).thenReturn(subTask);

        tool.execute(args);

        verify(subAgentManager).createSubAgent("long task", null, 3600, null, null);
    }

    @Test
    void testExecuteWithSubagentType() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("task", "search code");
        args.put("subagent_type", "explore");

        SubAgentTask subTask = mock(SubAgentTask.class);
        when(subTask.getStatus()).thenReturn(SubAgentStatus.RUNNING);
        when(subAgentManager.createSubAgent("search code", "explore", 300, null, null)).thenReturn(subTask);

        tool.execute(args);

        verify(subAgentManager).createSubAgent("search code", "explore", 300, null, null);
    }
}
