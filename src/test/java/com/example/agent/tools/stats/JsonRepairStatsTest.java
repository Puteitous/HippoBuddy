package com.example.agent.tools.stats;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JsonRepairStatsTest {

    private JsonRepairStats stats;

    @BeforeEach
    void setUp() {
        stats = new JsonRepairStats();
    }

    @Test
    void testInitialState() {
        assertEquals(0, stats.getTotalAttempts());
        assertEquals(0, stats.getTotalRepairs());
        assertEquals(0, stats.getTotalFailures());
        assertEquals(0.0, stats.getRepairRate());
        assertEquals(0.0, stats.getFailureRate());
    }

    @Test
    void testRecordAttempt() {
        stats.recordAttempt();

        assertEquals(1, stats.getTotalAttempts());
    }

    @Test
    void testRecordMultipleAttempts() {
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();

        assertEquals(3, stats.getTotalAttempts());
    }

    @Test
    void testRecordRepair() {
        stats.recordRepair("bash", "unclosed_brace");

        assertEquals(1, stats.getTotalRepairs());
        assertEquals(1, stats.getRepairCountByTool("bash"));
        assertEquals(1, stats.getRepairCountByReason("unclosed_brace"));
    }

    @Test
    void testRecordMultipleRepairsSameTool() {
        stats.recordRepair("bash", "unclosed_brace");
        stats.recordRepair("bash", "missing_quote");

        assertEquals(2, stats.getTotalRepairs());
        assertEquals(2, stats.getRepairCountByTool("bash"));
        assertEquals(1, stats.getRepairCountByReason("unclosed_brace"));
        assertEquals(1, stats.getRepairCountByReason("missing_quote"));
    }

    @Test
    void testRecordRepairsMultipleTools() {
        stats.recordRepair("bash", "unclosed_brace");
        stats.recordRepair("read_file", "missing_quote");

        assertEquals(2, stats.getTotalRepairs());
        assertEquals(1, stats.getRepairCountByTool("bash"));
        assertEquals(1, stats.getRepairCountByTool("read_file"));
    }

    @Test
    void testRecordFailure() {
        stats.recordFailure("bash");

        assertEquals(1, stats.getTotalFailures());
    }

    @Test
    void testRecordMultipleFailures() {
        stats.recordFailure("bash");
        stats.recordFailure("read_file");
        stats.recordFailure("bash");

        assertEquals(3, stats.getTotalFailures());
    }

    @Test
    void testRepairRate() {
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordRepair("bash", "unclosed_brace");

        assertEquals(50.0, stats.getRepairRate());
    }

    @Test
    void testFailureRate() {
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordFailure("bash");

        assertEquals(25.0, stats.getFailureRate());
    }

    @Test
    void testRepairAndFailureRatesTogether() {
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordRepair("bash", "err1");
        stats.recordRepair("bash", "err2");
        stats.recordFailure("bash");

        assertEquals(40.0, stats.getRepairRate());
        assertEquals(20.0, stats.getFailureRate());
    }

    @Test
    void testGetRepairCountByUnknownTool() {
        assertEquals(0, stats.getRepairCountByTool("nonexistent"));
    }

    @Test
    void testGetRepairCountByUnknownReason() {
        assertEquals(0, stats.getRepairCountByReason("nonexistent"));
    }

    @Test
    void testRepairRateWithNoAttempts() {
        assertEquals(0.0, stats.getRepairRate());
    }

    @Test
    void testFailureRateWithNoAttempts() {
        assertEquals(0.0, stats.getFailureRate());
    }

    @Test
    void testGetSummary() {
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordAttempt();
        stats.recordRepair("bash", "unclosed_brace");
        stats.recordRepair("read_file", "missing_quote");
        stats.recordFailure("bash");

        String summary = stats.getSummary();

        assertTrue(summary.contains("5"));
        assertTrue(summary.contains("40.0%"));
        assertTrue(summary.contains("20.0%"));
    }

    @Test
    void testGetDetailedSummary() {
        stats.recordRepair("bash", "unclosed_brace");
        stats.recordRepair("bash", "missing_quote");
        stats.recordRepair("read_file", "missing_quote");

        String detailed = stats.getDetailedSummary();

        assertTrue(detailed.contains("bash"));
        assertTrue(detailed.contains("read_file"));
        assertTrue(detailed.contains("unclosed_brace"));
        assertTrue(detailed.contains("missing_quote"));
    }

    @Test
    void testGetDetailedSummaryEmpty() {
        String detailed = stats.getDetailedSummary();

        assertTrue(detailed.contains("0"));
    }

    @Test
    void testAllZerosInSummary() {
        String summary = stats.getSummary();

        assertTrue(summary.contains("0"));
        assertTrue(summary.contains("0.0%"));
    }

    @Test
    void testSameReasonMultipleTools() {
        stats.recordRepair("bash", "unclosed_brace");
        stats.recordRepair("read_file", "unclosed_brace");

        assertEquals(2, stats.getRepairCountByReason("unclosed_brace"));
        assertEquals(1, stats.getRepairCountByTool("bash"));
        assertEquals(1, stats.getRepairCountByTool("read_file"));
    }
}
