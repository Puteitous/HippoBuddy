package com.example.agent.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class LlmConfigTest {

    private LlmConfig llmConfig;

    @BeforeEach
    void setUp() {
        llmConfig = new LlmConfig();
    }

    @Test
    void testDefaultValues() {
        assertEquals("dashscope", llmConfig.getProvider());
        assertEquals("qwen3.5-plus", llmConfig.getModel());
        assertEquals("https://dashscope.aliyuncs.com", llmConfig.getBaseUrl());
        assertEquals(2048, llmConfig.getMaxTokens());
        assertEquals(0.7, llmConfig.getTemperature());
        assertEquals(60000, llmConfig.getTimeout());
        assertNull(llmConfig.getApiKey());
        assertTrue(llmConfig.isThinkingEnabled());
        assertEquals("high", llmConfig.getReasoningEffort());
    }

    @Test
    void testSetApiKey() {
        llmConfig.setApiKey("sk-test-key");
        assertEquals("sk-test-key", llmConfig.getApiKey());
    }

    @Test
    void testSetModel() {
        llmConfig.setModel("qwen-max");
        assertEquals("qwen-max", llmConfig.getModel());
    }

    @Test
    void testSetBaseUrl() {
        llmConfig.setBaseUrl("https://api.openai.com");
        assertEquals("https://api.openai.com", llmConfig.getBaseUrl());
    }

    @Test
    void testSetMaxTokens() {
        llmConfig.setMaxTokens(4096);
        assertEquals(4096, llmConfig.getMaxTokens());
    }

    @Test
    void testSetProvider() {
        llmConfig.setProvider("openai");
        assertEquals("openai", llmConfig.getProvider());
    }

    @Test
    void testSetTimeout() {
        llmConfig.setTimeout(30000);
        assertEquals(30000, llmConfig.getTimeout());
    }

    @Test
    void testSetTimeoutZero() {
        assertThrows(IllegalArgumentException.class, () -> llmConfig.setTimeout(0));
    }

    @Test
    void testSetTimeoutNegative() {
        assertThrows(IllegalArgumentException.class, () -> llmConfig.setTimeout(-1));
        assertThrows(IllegalArgumentException.class, () -> llmConfig.setTimeout(-1000));
    }

    @Test
    void testSetTimeoutPositive() {
        llmConfig.setTimeout(1);
        assertEquals(1, llmConfig.getTimeout());
        
        llmConfig.setTimeout(Integer.MAX_VALUE);
        assertEquals(Integer.MAX_VALUE, llmConfig.getTimeout());
    }

    @Test
    void testThinkingEnabled() {
        llmConfig.setThinkingEnabled(false);
        assertFalse(llmConfig.isThinkingEnabled());
        
        llmConfig.setThinkingEnabled(true);
        assertTrue(llmConfig.isThinkingEnabled());
    }

    @Test
    void testReasoningEffort() {
        assertEquals("high", llmConfig.getReasoningEffort());
        
        llmConfig.setReasoningEffort("max");
        assertEquals("max", llmConfig.getReasoningEffort());
        
        llmConfig.setReasoningEffort("low");
        assertEquals("low", llmConfig.getReasoningEffort());
    }

    @Test
    void testSetTemperatureZero() {
        llmConfig.setTemperature(0.0);
        assertEquals(0.0, llmConfig.getTemperature());
    }

    @Test
    void testSetTemperatureMax() {
        llmConfig.setTemperature(2.0);
        assertEquals(2.0, llmConfig.getTemperature());
    }

    @Test
    void testSetTemperatureMiddle() {
        llmConfig.setTemperature(1.0);
        assertEquals(1.0, llmConfig.getTemperature());
        
        llmConfig.setTemperature(0.5);
        assertEquals(0.5, llmConfig.getTemperature());
        
        llmConfig.setTemperature(1.5);
        assertEquals(1.5, llmConfig.getTemperature());
    }

    @Test
    void testSetTemperatureNegative() {
        assertThrows(IllegalArgumentException.class, () -> llmConfig.setTemperature(-0.1));
        assertThrows(IllegalArgumentException.class, () -> llmConfig.setTemperature(-1.0));
    }

    @Test
    void testSetTemperatureExceedsMax() {
        assertThrows(IllegalArgumentException.class, () -> llmConfig.setTemperature(2.1));
        assertThrows(IllegalArgumentException.class, () -> llmConfig.setTemperature(3.0));
    }

    @Test
    void testSetTemperatureBoundaryValues() {
        llmConfig.setTemperature(0.001);
        assertEquals(0.001, llmConfig.getTemperature());
        
        llmConfig.setTemperature(1.999);
        assertEquals(1.999, llmConfig.getTemperature());
    }

    @Test
    void testIsValidWithNullApiKey() {
        llmConfig.setApiKey(null);
        assertFalse(llmConfig.isValid());
    }

    @Test
    void testIsValidWithEmptyApiKey() {
        llmConfig.setApiKey("");
        assertFalse(llmConfig.isValid());
    }

    @Test
    void testIsValidWithPlaceholderApiKey() {
        llmConfig.setApiKey("your-api-key-here");
        assertFalse(llmConfig.isValid());
    }

    @Test
    void testIsValidWithValidApiKey() {
        llmConfig.setApiKey("sk-valid-key-12345");
        assertTrue(llmConfig.isValid());
    }

    @Test
    void testIsValidWithShortApiKey() {
        llmConfig.setApiKey("abc");
        assertTrue(llmConfig.isValid());
    }

    @Test
    void testMaskApiKeyWithNull() {
        llmConfig.setApiKey(null);
        assertEquals("****", llmConfig.maskApiKey());
    }

    @Test
    void testMaskApiKeyWithEmpty() {
        llmConfig.setApiKey("");
        assertEquals("****", llmConfig.maskApiKey());
    }

    @Test
    void testMaskApiKeyWithShortKey() {
        llmConfig.setApiKey("abc");
        assertEquals("****", llmConfig.maskApiKey());
        
        llmConfig.setApiKey("1234567");
        assertEquals("****", llmConfig.maskApiKey());
    }

    @Test
    void testMaskApiKeyWithMinimumLength() {
        llmConfig.setApiKey("12345678");
        assertEquals("1234****5678", llmConfig.maskApiKey());
    }

    @Test
    void testMaskApiKeyWithLongKey() {
        llmConfig.setApiKey("sk-1234567890abcdefghijklmnopqrstuvwxyz");
        assertEquals("sk-1****wxyz", llmConfig.maskApiKey());
    }

    @Test
    void testMaskApiKeyPreservesFirstAndLastFour() {
        llmConfig.setApiKey("ABCDEFGHIJKLMNOP");
        String masked = llmConfig.maskApiKey();
        assertTrue(masked.startsWith("ABCD"));
        assertTrue(masked.endsWith("MNOP"));
        assertTrue(masked.contains("****"));
    }

    @Test
    void testToStringDoesNotExposeApiKey() {
        llmConfig.setApiKey("sk-secret-key-12345678");
        String str = llmConfig.toString();
        
        assertFalse(str.contains("sk-secret-key-12345678"));
        assertTrue(str.contains("****"));
    }

    @Test
    void testToStringContainsExpectedFields() {
        llmConfig.setApiKey("sk-test-key-12345678");
        llmConfig.setModel("qwen-max");
        llmConfig.setBaseUrl("https://api.test.com");
        
        String str = llmConfig.toString();
        
        assertTrue(str.contains("LlmConfig"));
        assertTrue(str.contains("provider='dashscope'"));
        assertTrue(str.contains("model='qwen-max'"));
        assertTrue(str.contains("baseUrl='https://api.test.com'"));
        assertTrue(str.contains("maxTokens=2048"));
        assertTrue(str.contains("temperature=0.7"));
        assertTrue(str.contains("timeout=60000"));
    }

    @Test
    void testSetMaxTokensBoundaryValues() {
        llmConfig.setMaxTokens(1);
        assertEquals(1, llmConfig.getMaxTokens());
        
        llmConfig.setMaxTokens(Integer.MAX_VALUE);
        assertEquals(Integer.MAX_VALUE, llmConfig.getMaxTokens());
    }

    @Test
    void testSetMaxTokensZero() {
        llmConfig.setMaxTokens(0);
        assertEquals(0, llmConfig.getMaxTokens());
    }

    @Test
    void testSetMaxTokensNegative() {
        llmConfig.setMaxTokens(-1);
        assertEquals(-1, llmConfig.getMaxTokens());
    }
}
