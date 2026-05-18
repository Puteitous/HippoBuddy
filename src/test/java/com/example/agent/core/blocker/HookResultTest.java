package com.example.agent.core.blocker;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class HookResultTest {

    @Test
    void allow_shouldCreateAllowedResult() {
        HookResult result = HookResult.allow();
        assertTrue(result.isAllowed());
        assertFalse(result.isConfirmationRequired());
        assertFalse(result.isDenied());
        assertNull(result.getReason());
        assertNull(result.getSuggestion());
        assertEquals("", result.formatErrorMessage());
    }

    @Test
    void deny_shouldCreateDeniedResultWithReasonAndSuggestion() {
        HookResult result = HookResult.validationError("测试原因", "测试建议");

        assertFalse(result.isAllowed());
        assertFalse(result.isConfirmationRequired());
        assertTrue(result.isDenied());
        assertEquals("测试原因", result.getReason());
        assertEquals("测试建议", result.getSuggestion());

        String errorMessage = result.formatErrorMessage();
        assertTrue(errorMessage.contains("执行被阻断"));
        assertTrue(errorMessage.contains("测试原因"));
        assertTrue(errorMessage.contains("测试建议"));
    }

    @Test
    void block_shouldCreateStrictlyDeniedResult() {
        HookResult result = HookResult.block("严格禁止");

        assertFalse(result.isAllowed());
        assertFalse(result.isConfirmationRequired());
        assertTrue(result.isDenied());
        assertEquals("严格禁止", result.getReason());
        assertNull(result.getSuggestion());
    }

    @Test
    void requireConfirmation_shouldCreateConfirmationResult() {
        HookResult result = HookResult.requireConfirmation("风险原因", "medium", "rm file.txt");

        assertFalse(result.isAllowed());
        assertTrue(result.isConfirmationRequired());
        assertFalse(result.isDenied());
        assertEquals("风险原因", result.getReason());
        assertEquals("medium", result.getRiskLevel());
        assertEquals("rm file.txt", result.getCommandDetail());

        String errorMessage = result.formatErrorMessage();
        assertTrue(errorMessage.contains("等待用户确认"));
        assertTrue(errorMessage.contains("无需额外确认"));
    }

    @Test
    void requireConfirmation_withDifferentRiskLevels() {
        HookResult low = HookResult.requireConfirmation("低风险", "low", "echo test");
        HookResult high = HookResult.requireConfirmation("高风险", "high", "rm -rf /data");

        assertEquals("low", low.getRiskLevel());
        assertEquals("high", high.getRiskLevel());
        assertTrue(low.isConfirmationRequired());
        assertTrue(high.isConfirmationRequired());
    }

    @Test
    void warn_shouldCreateAllowedResultWithWarning() {
        HookResult result = HookResult.warn("警告原因", "警告建议");

        assertTrue(result.isAllowed());
        assertFalse(result.isConfirmationRequired());
        assertFalse(result.isDenied());
        assertTrue(result.isWarning());
    }
}
