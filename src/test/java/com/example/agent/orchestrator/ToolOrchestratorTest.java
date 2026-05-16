package com.example.agent.orchestrator;

import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.orchestrator.analyzer.RuleBasedAnalyzer;
import com.example.agent.orchestrator.model.ToolDependencyType;
import com.example.agent.orchestrator.model.ToolExecutionPlan;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ToolOrchestratorTest {

    private RuleBasedAnalyzer analyzer;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        analyzer = new RuleBasedAnalyzer();
        objectMapper = new ObjectMapper();
    }

    private ToolCall createToolCall(String id, String name, Map<String, Object> arguments) {
        try {
            String argsJson = objectMapper.writeValueAsString(arguments);
            ToolCall toolCall = new ToolCall();
            toolCall.setId(id);
            toolCall.setFunction(new FunctionCall(name, argsJson));
            return toolCall;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void shouldDetectReadThenEditSameFile() {
        ToolCall readFile = createToolCall("call_1", "read_file",
                Map.of("path", "/tmp/test.java"));

        ToolCall editFile = createToolCall("call_2", "edit_file",
                Map.of("path", "/tmp/test.java"));

        ToolExecutionPlan plan = analyzer.analyze(List.of(readFile, editFile));

        assertEquals(2, plan.getNodeCount());
        assertEquals(1, plan.getDependencyCount());
        assertTrue(plan.getDetectedDependencies().stream()
                .anyMatch(d -> d.getType() == ToolDependencyType.READ_THEN_EDIT_SAME_FILE));
    }

    @Test
    void shouldDetectMultipleEditsSameFile() {
        ToolCall edit1 = createToolCall("call_1", "edit_file",
                Map.of("path", "/tmp/test.java"));
        ToolCall edit2 = createToolCall("call_2", "edit_file",
                Map.of("path", "/tmp/test.java"));
        ToolCall edit3 = createToolCall("call_3", "edit_file",
                Map.of("path", "/tmp/test.java"));

        ToolExecutionPlan plan = analyzer.analyze(List.of(edit1, edit2, edit3));

        assertEquals(3, plan.getNodeCount());
        assertEquals(2, plan.getDependencyCount());
    }

    @Test
    void shouldDetectSearchThenEdit() {
        ToolCall search = createToolCall("call_1", "grep",
                Map.of("pattern", "test"));
        ToolCall edit = createToolCall("call_2", "edit_file",
                Map.of("path", "/tmp/test.java"));

        ToolExecutionPlan plan = analyzer.analyze(List.of(search, edit));

        assertEquals(1, plan.getDependencyCount());
        assertTrue(plan.getDetectedDependencies().stream()
                .anyMatch(d -> d.getType() == ToolDependencyType.SEARCH_THEN_EDIT));
    }

    @Test
    void shouldNotAddDependencyForDifferentFiles() {
        ToolCall readA = createToolCall("call_1", "read_file",
                Map.of("path", "/tmp/A.java"));
        ToolCall editB = createToolCall("call_2", "edit_file",
                Map.of("path", "/tmp/B.java"));

        ToolExecutionPlan plan = analyzer.analyze(List.of(readA, editB));

        assertEquals(0, plan.getDependencyCount());
    }

    @Test
    void shouldDetectNoCycle() {
        ToolCall read = createToolCall("call_1", "read_file",
                Map.of("path", "/tmp/test.java"));
        ToolCall edit = createToolCall("call_2", "edit_file",
                Map.of("path", "/tmp/test.java"));

        ToolExecutionPlan plan = analyzer.analyze(List.of(read, edit));

        assertFalse(plan.hasCycle());
    }

    @Test
    void orchestratorShouldToggleEnabled() {
        ToolOrchestrator orchestrator = new ToolOrchestrator(null);
        assertTrue(orchestrator.isEnabled());

        orchestrator.setEnabled(false);
        assertFalse(orchestrator.isEnabled());

        orchestrator.setEnabled(true);
        assertTrue(orchestrator.isEnabled());
    }

    @Test
    void orchestratorShouldHaveCorrectStats() {
        ToolOrchestrator orchestrator = new ToolOrchestrator(null);
        String stats = orchestrator.getStats();

        assertTrue(stats.contains("enabled=true"));
        assertTrue(stats.contains("analysisEnabled=true"));
    }

    @Test
    void shouldGetRunnableNodes() {
        ToolCall readA = createToolCall("call_1", "read_file",
                Map.of("path", "/tmp/A.java"));
        ToolCall readB = createToolCall("call_2", "read_file",
                Map.of("path", "/tmp/B.java"));
        ToolCall editA = createToolCall("call_3", "edit_file",
                Map.of("path", "/tmp/A.java"));

        ToolExecutionPlan plan = analyzer.analyze(List.of(readA, readB, editA));

        assertEquals(2, plan.getRunnableNodes().size());
    }
}
