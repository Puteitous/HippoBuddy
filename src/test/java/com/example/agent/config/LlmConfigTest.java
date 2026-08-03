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
        // 默认值已在 config.yaml 中配置（见 config.yaml.example 的 llm 段），
        // LlmConfig 作为 POJO 的字段初始值为空/0
        assertNull(llmConfig.getProvider());
        assertNull(llmConfig.getModel());
        assertNull(llmConfig.getBaseUrl());
        assertEquals(0, llmConfig.getMaxTokens());
        assertEquals(0.7, llmConfig.getTemperature());
        assertEquals(60000, llmConfig.getTimeout());
        assertNull(llmConfig.getApiKey());
        assertTrue(llmConfig.isThinkingEnabled());
        assertEquals("", llmConfig.getReasoningEffort());
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
        // 默认空串 = 使用模型默认思考强度（配置默认值见 config.yaml 的 reasoning_effort）
        assertEquals("", llmConfig.getReasoningEffort());
        
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
        llmConfig.setProvider("dashscope");
        llmConfig.setApiKey("sk-test-key-12345678");
        llmConfig.setModel("qwen-max");
        llmConfig.setBaseUrl("https://api.test.com");
        llmConfig.setMaxTokens(2048);
        
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

    // ========== 模型历史快照 ==========

    @Test
    void testModelHistoryDefaultsToEmpty() {
        assertNotNull(llmConfig.getModelHistory());
        assertTrue(llmConfig.getModelHistory().isEmpty());
    }

    @Test
    void testSnapshotToHistory() {
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.setBaseUrl("https://api.openai.com");
        llmConfig.setApiKey("sk-test-key");

        llmConfig.snapshotToHistory();

        assertEquals(1, llmConfig.getModelHistory().size());
        ModelSnapshot snap = llmConfig.getModelHistory().get(0);
        assertEquals("openai", snap.getProvider());
        assertEquals("gpt-4o", snap.getModel());
        assertEquals("https://api.openai.com", snap.getBaseUrl());
        assertEquals("sk-test-key", snap.getApiKey());
    }

    @Test
    void testSnapshotToHistoryReplacesDuplicate() {
        // 第一次快照
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.snapshotToHistory();

        // 修改配置后再次快照（相同 key）
        llmConfig.setMaxTokens(8192);
        llmConfig.setThinkingEnabled(false);
        llmConfig.snapshotToHistory();

        // 应该只有 1 条（覆盖旧快照）
        assertEquals(1, llmConfig.getModelHistory().size());
        ModelSnapshot snap = llmConfig.getModelHistory().get(0);
        assertEquals(8192, snap.getMaxTokens());
        assertFalse(snap.isThinkingEnabled());
    }

    @Test
    void testSnapshotToHistoryMultipleModels() {
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.setApiKey("sk-openai-key");
        llmConfig.snapshotToHistory();

        llmConfig.setProvider("dashscope");
        llmConfig.setModel("qwen-max");
        llmConfig.setApiKey("sk-dashscope-key");
        llmConfig.snapshotToHistory();

        assertEquals(2, llmConfig.getModelHistory().size());
        assertEquals("openai:gpt-4o", llmConfig.getModelHistory().get(0).getKey());
        assertEquals("dashscope:qwen-max", llmConfig.getModelHistory().get(1).getKey());
    }

    @Test
    void testFindSnapshotFound() {
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.setBaseUrl("https://api.openai.com");
        llmConfig.snapshotToHistory();

        ModelSnapshot found = llmConfig.findSnapshot("openai", "gpt-4o");
        assertNotNull(found);
        assertEquals("https://api.openai.com", found.getBaseUrl());
    }

    @Test
    void testFindSnapshotNotFound() {
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.snapshotToHistory();

        ModelSnapshot found = llmConfig.findSnapshot("dashscope", "qwen-max");
        assertNull(found);
    }

    @Test
    void testFindSnapshotWithNullModel() {
        // 空 provider/model 时 snapshotToHistory 不应保存空快照（key 为 ":" 无意义）
        assertFalse(llmConfig.snapshotToHistory());
        assertTrue(llmConfig.getModelHistory().isEmpty());
        assertNull(llmConfig.findSnapshot(null, null));
    }

    @Test
    void testSnapshotToHistoryPreservesApiKey() {
        String apiKey = "sk-very-secret-key-12345678";
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.setApiKey(apiKey);
        llmConfig.snapshotToHistory();

        ModelSnapshot snap = llmConfig.getModelHistory().get(0);
        assertEquals(apiKey, snap.getApiKey());
    }

    @Test
    void testFindSnapshotRestoresAllFields() {
        // 保存完整配置
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.setBaseUrl("https://api.openai.com/v1");
        llmConfig.setApiKey("sk-restore-key");
        llmConfig.setMaxTokens(16384);
        llmConfig.setThinkingEnabled(false);
        llmConfig.setReasoningEffort("max");
        llmConfig.snapshotToHistory();

        // 切换到另一个模型
        llmConfig.setProvider("dashscope");
        llmConfig.setModel("qwen-turbo");
        llmConfig.setBaseUrl("https://dashscope.aliyuncs.com");
        llmConfig.setApiKey("sk-other-key");
        llmConfig.setMaxTokens(2048);
        llmConfig.setThinkingEnabled(true);
        llmConfig.setReasoningEffort("high");

        // 从历史恢复
        ModelSnapshot snap = llmConfig.findSnapshot("openai", "gpt-4o");
        assertNotNull(snap);
        snap.applyTo(llmConfig);

        // 验证所有字段已恢复
        assertEquals("openai", llmConfig.getProvider());
        assertEquals("gpt-4o", llmConfig.getModel());
        assertEquals("https://api.openai.com/v1", llmConfig.getBaseUrl());
        assertEquals("sk-restore-key", llmConfig.getApiKey());
        assertEquals(16384, llmConfig.getMaxTokens());
        assertFalse(llmConfig.isThinkingEnabled());
        assertEquals("max", llmConfig.getReasoningEffort());
    }

    @Test
    void testRemoveSnapshotByKey() {
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.snapshotToHistory();
        llmConfig.setProvider("dashscope");
        llmConfig.setModel("qwen-max");
        llmConfig.snapshotToHistory();
        assertEquals(2, llmConfig.getModelHistory().size());

        // 移除已存在条目
        assertTrue(llmConfig.removeSnapshotByKey("dashscope:qwen-max"));
        assertEquals(1, llmConfig.getModelHistory().size());
        assertNull(llmConfig.findSnapshot("dashscope", "qwen-max"));

        // 移除不存在的条目
        assertFalse(llmConfig.removeSnapshotByKey("openai:gpt-5"));
        assertEquals(1, llmConfig.getModelHistory().size());

        // 空 key 安全处理
        assertFalse(llmConfig.removeSnapshotByKey(null));
        assertFalse(llmConfig.removeSnapshotByKey(""));
    }

    @Test
    void testEditHistorySnapshotReplacesOldEntry() {
        // 模拟场景：
        // 当前生效配置 = openai:gpt-4o（已在历史中）
        // 历史中还有一条 deepseek:reasoner（非当前生效，用户点击编辑它）
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.setApiKey("sk-openai");
        llmConfig.snapshotToHistory();

        llmConfig.setProvider("deepseek");
        llmConfig.setModel("reasoner");
        llmConfig.setApiKey("sk-deepseek");
        llmConfig.snapshotToHistory();

        // 用户切换到 openai:gpt-4o（模拟快速切换恢复）
        llmConfig.findSnapshot("openai", "gpt-4o").applyTo(llmConfig);
        assertEquals(2, llmConfig.getModelHistory().size());

        // ===== 编辑历史条目 deepseek:reasoner，改名为 deepseek:new =====
        // 1. 前端携带 editingKey = 旧 key
        String editingKey = "deepseek:reasoner";
        // 2. 后端先移除旧快照
        assertTrue(llmConfig.removeSnapshotByKey(editingKey));
        // 3. 后端快照当前生效配置（openai:gpt-4o，保留切换前记录）
        llmConfig.snapshotToHistory();
        // 4. 后端应用新字段并快照
        llmConfig.setProvider("deepseek");
        llmConfig.setModel("new");
        llmConfig.setApiKey("sk-deepseek-new");
        llmConfig.snapshotToHistory();

        // 旧条目 deepseek:reasoner 不应再存在，新条目 deepseek:new 已加入
        assertNull(llmConfig.findSnapshot("deepseek", "reasoner"));
        assertNotNull(llmConfig.findSnapshot("deepseek", "new"));
        // 当前生效配置 openai:gpt-4o 仍在历史中
        assertNotNull(llmConfig.findSnapshot("openai", "gpt-4o"));
        // 总共 2 条：openai:gpt-4o + deepseek:new，无重复
        assertEquals(2, llmConfig.getModelHistory().size());
        assertEquals("sk-deepseek-new", llmConfig.findSnapshot("deepseek", "new").getApiKey());
    }

    @Test
    void testEditHistorySnapshotSameKeyNoDuplicate() {
        // 编辑历史条目但 provider:model 不变（只改 API Key 等字段），
        // 移除旧快照后重新快照，不应产生重复
        llmConfig.setProvider("openai");
        llmConfig.setModel("gpt-4o");
        llmConfig.setApiKey("sk-old");
        llmConfig.snapshotToHistory();

        String editingKey = "openai:gpt-4o";
        llmConfig.removeSnapshotByKey(editingKey);
        llmConfig.snapshotToHistory(); // 当前配置仍为 openai:gpt-4o（旧值）
        llmConfig.setApiKey("sk-new");
        llmConfig.snapshotToHistory(); // 新值覆盖

        assertEquals(1, llmConfig.getModelHistory().size());
        assertEquals("sk-new", llmConfig.getModelHistory().get(0).getApiKey());
    }
}
