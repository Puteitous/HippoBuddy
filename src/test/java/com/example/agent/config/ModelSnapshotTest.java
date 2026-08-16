package com.example.agent.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ModelSnapshotTest {

    @Test
    void testFromLlmConfig() {
        LlmConfig config = new LlmConfig();
        config.setProvider("openai");
        config.setModel("gpt-4o");
        config.setBaseUrl("https://api.openai.com");
        config.setApiKey("sk-test-key-12345678");
        config.setMaxTokens(4096);
        config.setThinkingEnabled(false);
        config.setReasoningEffort("low");

        ModelSnapshot snap = ModelSnapshot.from(config);

        assertEquals("openai", snap.getProvider());
        assertEquals("gpt-4o", snap.getModel());
        assertEquals("https://api.openai.com", snap.getBaseUrl());
        assertEquals("sk-test-key-12345678", snap.getApiKey());
        assertEquals(4096, snap.getMaxTokens());
        assertFalse(snap.isThinkingEnabled());
        assertEquals("low", snap.getReasoningEffort());
    }

    @Test
    void testGetKey() {
        ModelSnapshot snap = new ModelSnapshot();
        snap.setProvider("dashscope");
        snap.setModel("qwen-max");
        assertEquals("dashscope:qwen-max", snap.getKey());
    }

    @Test
    void testGetKeyWithNullFields() {
        ModelSnapshot snap = new ModelSnapshot();
        assertEquals(":", snap.getKey());
    }

    @Test
    void testApplyTo() {
        // 创建快照
        ModelSnapshot snap = new ModelSnapshot();
        snap.setProvider("openai");
        snap.setModel("gpt-4o");
        snap.setBaseUrl("https://api.openai.com");
        snap.setApiKey("sk-applied-key-12345678");
        snap.setMaxTokens(8192);
        snap.setThinkingEnabled(false);
        snap.setReasoningEffort("max");

        // 应用到目标 config
        LlmConfig target = new LlmConfig();
        snap.applyTo(target);

        assertEquals("openai", target.getProvider());
        assertEquals("gpt-4o", target.getModel());
        assertEquals("https://api.openai.com", target.getBaseUrl());
        assertEquals("sk-applied-key-12345678", target.getApiKey());
        assertEquals(8192, target.getMaxTokens());
        assertFalse(target.isThinkingEnabled());
        assertEquals("max", target.getReasoningEffort());
    }

    @Test
    void testApplyToOverwritesExistingValues() {
        LlmConfig target = new LlmConfig();
        target.setProvider("dashscope");
        target.setModel("qwen-max");
        target.setBaseUrl("https://dashscope.aliyuncs.com");
        target.setApiKey("sk-old-key");
        target.setMaxTokens(2048);
        target.setThinkingEnabled(true);
        target.setReasoningEffort("high");

        ModelSnapshot snap = new ModelSnapshot();
        snap.setProvider("ollama");
        snap.setModel("llama3");
        snap.setBaseUrl("http://localhost:11434");
        snap.setApiKey("");
        snap.setMaxTokens(4096);
        snap.setThinkingEnabled(false);
        snap.setReasoningEffort("low");

        snap.applyTo(target);

        assertEquals("ollama", target.getProvider());
        assertEquals("llama3", target.getModel());
        assertEquals("http://localhost:11434", target.getBaseUrl());
        assertEquals("", target.getApiKey());
        assertEquals(4096, target.getMaxTokens());
        assertFalse(target.isThinkingEnabled());
        assertEquals("low", target.getReasoningEffort());
    }

    @Test
    void testMaskApiKeyWithNull() {
        ModelSnapshot snap = new ModelSnapshot();
        snap.setApiKey(null);
        assertEquals("****", snap.maskApiKey());
    }

    @Test
    void testMaskApiKeyWithShortKey() {
        ModelSnapshot snap = new ModelSnapshot();
        snap.setApiKey("abc");
        assertEquals("****", snap.maskApiKey());
    }

    @Test
    void testMaskApiKeyWithLongKey() {
        ModelSnapshot snap = new ModelSnapshot();
        snap.setApiKey("sk-1234567890abcdefghijklmnop");
        assertEquals("sk-1****mnop", snap.maskApiKey());
    }

    @Test
    void testRoundTripSerializationViaLlmConfig() {
        // 模拟完整场景：从 config 创建快照 → 应用到另一个 config
        LlmConfig source = new LlmConfig();
        source.setProvider("openai");
        source.setModel("gpt-4-turbo");
        source.setBaseUrl("https://api.openai.com/v1");
        source.setApiKey("sk-roundtrip-key");
        source.setMaxTokens(4096);
        source.setThinkingEnabled(true);
        source.setReasoningEffort("high");

        ModelSnapshot snap = ModelSnapshot.from(source);

        LlmConfig target = new LlmConfig();
        snap.applyTo(target);

        assertEquals(source.getProvider(), target.getProvider());
        assertEquals(source.getModel(), target.getModel());
        assertEquals(source.getBaseUrl(), target.getBaseUrl());
        assertEquals(source.getApiKey(), target.getApiKey());
        assertEquals(source.getMaxTokens(), target.getMaxTokens());
        assertEquals(source.isThinkingEnabled(), target.isThinkingEnabled());
        assertEquals(source.getReasoningEffort(), target.getReasoningEffort());
    }

    @Test
    void testSnapshotWithDefaults() {
        // LlmConfig 是纯 POJO，默认值来自 config.yaml / LlmClientFactory（见 LlmConfigTest.testDefaultValues），
        // ModelSnapshot.from 逐字段拷贝，因此空配置生成的是 null/0/空串
        LlmConfig config = new LlmConfig();
        ModelSnapshot snap = ModelSnapshot.from(config);

        assertNull(snap.getProvider());
        assertNull(snap.getModel());
        assertNull(snap.getBaseUrl());
        assertEquals(0, snap.getMaxTokens());
        assertTrue(snap.isThinkingEnabled());
        assertEquals("", snap.getReasoningEffort());
        assertNull(snap.getApiKey());
    }

    @Test
    void testSnapshotOwnDefaults() {
        // ModelSnapshot 无参构造的字段默认值（反序列化 modelHistory 时的兜底）
        ModelSnapshot snap = new ModelSnapshot();

        assertNull(snap.getProvider());
        assertNull(snap.getModel());
        assertEquals(2048, snap.getMaxTokens());
        assertTrue(snap.isThinkingEnabled());
        assertEquals("high", snap.getReasoningEffort());
        assertNull(snap.getApiKey());
    }
}
