package com.example.agent.tools.stats;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ToolExecutionStatsTest {

    private ToolExecutionStats stats;

    @BeforeEach
    void setUp() {
        stats = new ToolExecutionStats();
    }

    @Test
    void testInitialState() {
        assertEquals(0, stats.getTotalCalls());
        assertEquals(0, stats.getSuccessCalls());
        assertEquals(0, stats.getFailureCalls());
        assertEquals(0, stats.getTotalExecutionTimeMs());
        assertEquals(0, stats.getAverageExecutionTimeMs());
        assertEquals(0, stats.getTotalJsonRepairs());
        assertEquals(0, stats.getTotalNormalizations());
        assertEquals(0, stats.getTotalValidationErrors());
    }

    @Test
    void testRecordSuccessfulCall() {
        stats.recordCall("bash", true, 100);

        assertEquals(1, stats.getTotalCalls());
        assertEquals(1, stats.getSuccessCalls());
        assertEquals(0, stats.getFailureCalls());
        assertEquals(100, stats.getTotalExecutionTimeMs());
        assertEquals(100, stats.getAverageExecutionTimeMs());
        assertEquals(1, stats.getToolCallCount("bash"));
        assertEquals(100, stats.getToolExecutionTime("bash"));
    }

    @Test
    void testRecordFailedCall() {
        stats.recordCall("bash", false, 50);

        assertEquals(1, stats.getTotalCalls());
        assertEquals(0, stats.getSuccessCalls());
        assertEquals(1, stats.getFailureCalls());
        assertEquals(50, stats.getTotalExecutionTimeMs());
    }

    @Test
    void testRecordMultipleCallsToSameTool() {
        stats.recordCall("bash", true, 100);
        stats.recordCall("bash", true, 200);
        stats.recordCall("bash", false, 50);

        assertEquals(3, stats.getTotalCalls());
        assertEquals(2, stats.getSuccessCalls());
        assertEquals(1, stats.getFailureCalls());
        assertEquals(350, stats.getTotalExecutionTimeMs());
        assertEquals(116, stats.getAverageExecutionTimeMs());
        assertEquals(3, stats.getToolCallCount("bash"));
        assertEquals(350, stats.getToolExecutionTime("bash"));
    }

    @Test
    void testRecordMultipleTools() {
        stats.recordCall("bash", true, 100);
        stats.recordCall("read_file", true, 50);
        stats.recordCall("bash", false, 30);

        assertEquals(3, stats.getTotalCalls());
        assertEquals(2, stats.getToolCallCount("bash"));
        assertEquals(1, stats.getToolCallCount("read_file"));
        assertEquals(130, stats.getToolExecutionTime("bash"));
        assertEquals(50, stats.getToolExecutionTime("read_file"));
    }

    @Test
    void testRecordJsonRepair() {
        stats.recordJsonRepair("bash");

        assertEquals(1, stats.getTotalJsonRepairs());
        assertEquals(1, stats.getToolJsonRepairCount("bash"));
    }

    @Test
    void testRecordJsonRepairMultipleTools() {
        stats.recordJsonRepair("bash");
        stats.recordJsonRepair("bash");
        stats.recordJsonRepair("read_file");

        assertEquals(3, stats.getTotalJsonRepairs());
        assertEquals(2, stats.getToolJsonRepairCount("bash"));
        assertEquals(1, stats.getToolJsonRepairCount("read_file"));
    }

    @Test
    void testRecordNormalization() {
        stats.recordNormalization("bash");

        assertEquals(1, stats.getTotalNormalizations());
    }

    @Test
    void testRecordMultipleNormalizations() {
        stats.recordNormalization("bash");
        stats.recordNormalization("read_file");
        stats.recordNormalization("bash");

        assertEquals(3, stats.getTotalNormalizations());
    }

    @Test
    void testRecordValidationError() {
        stats.recordValidationError("bash");

        assertEquals(1, stats.getTotalValidationErrors());
    }

    @Test
    void testGetToolCallCountForUnknownTool() {
        assertEquals(0, stats.getToolCallCount("nonexistent"));
    }

    @Test
    void testGetToolExecutionTimeForUnknownTool() {
        assertEquals(0, stats.getToolExecutionTime("nonexistent"));
    }

    @Test
    void testGetToolJsonRepairCountForUnknownTool() {
        assertEquals(0, stats.getToolJsonRepairCount("nonexistent"));
    }

    @Test
    void testAverageExecutionTimeWhenNoCalls() {
        assertEquals(0, stats.getAverageExecutionTimeMs());
    }

    @Test
    void testGetSummary() {
        stats.recordCall("bash", true, 100);
        stats.recordCall("bash", false, 300);
        stats.recordJsonRepair("bash");
        stats.recordNormalization("bash");
        stats.recordValidationError("bash");

        String summary = stats.getSummary();

        assertTrue(summary.contains("2"));
        assertTrue(summary.contains("50.0%"));
        assertTrue(summary.contains("200"));
        assertTrue(summary.contains("1"));
    }

    @Test
    void testGetDetailedSummary() {
        stats.recordCall("bash", true, 100);
        stats.recordCall("bash", false, 300);
        stats.recordCall("read_file", true, 50);
        stats.recordJsonRepair("bash");
        stats.recordNormalization("bash");

        String detailed = stats.getDetailedSummary();

        assertTrue(detailed.contains("bash"));
        assertTrue(detailed.contains("read_file"));
    }

    @Test
    void testGetDetailedSummaryEmpty() {
        String detailed = stats.getDetailedSummary();

        assertTrue(detailed.contains("0"));
    }

    @Test
    void testGetSummaryEmpty() {
        String summary = stats.getSummary();

        assertTrue(summary.contains("0"));
        assertTrue(summary.contains("0.0%"));
    }

    @Test
    void testMixedOperations() {
        stats.recordCall("bash", true, 150);
        stats.recordCall("bash", false, 50);
        stats.recordJsonRepair("bash");
        stats.recordJsonRepair("bash");
        stats.recordNormalization("bash");
        stats.recordValidationError("bash");

        assertEquals(2, stats.getTotalCalls());
        assertEquals(1, stats.getSuccessCalls());
        assertEquals(1, stats.getFailureCalls());
        assertEquals(200, stats.getTotalExecutionTimeMs());
        assertEquals(2, stats.getTotalJsonRepairs());
        assertEquals(1, stats.getTotalNormalizations());
        assertEquals(1, stats.getTotalValidationErrors());
        assertEquals(100, stats.getAverageExecutionTimeMs());
    }
}
