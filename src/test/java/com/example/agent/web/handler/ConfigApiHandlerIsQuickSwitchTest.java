package com.example.agent.web.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证 PUT /api/config/llm 的「快速切换」判定。
 * <p>
 * 快速切换（仅 provider+model）会从历史快照恢复完整配置；
 * 而携带 reasoningEffort / thinkingEnabled / maxTokens 等配置字段的请求
 * （如状态栏调节思考强度）必须走完整保存分支，避免新提交的值被快照覆盖。
 */
@DisplayName("ConfigApiHandler.isQuickSwitch 判定测试")
class ConfigApiHandlerIsQuickSwitchTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode json(String body) {
        try {
            return MAPPER.readTree(body);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    @DisplayName("仅 provider+model：判为快速切换（保持原有语义）")
    void onlyProviderAndModelIsQuickSwitch() {
        assertTrue(ConfigApiHandler.isQuickSwitch(json(
                "{\"provider\":\"deepseek\",\"model\":\"deepseek-chat\"}")));
    }

    @Test
    @DisplayName("带 reasoningEffort：不走快速切换（状态栏调节思考强度的核心场景）")
    void withReasoningEffortIsNotQuickSwitch() {
        assertFalse(ConfigApiHandler.isQuickSwitch(json(
                "{\"provider\":\"deepseek\",\"model\":\"deepseek-chat\",\"reasoningEffort\":\"max\"}")));
    }

    @Test
    @DisplayName("带 thinkingEnabled：不走快速切换")
    void withThinkingEnabledIsNotQuickSwitch() {
        assertFalse(ConfigApiHandler.isQuickSwitch(json(
                "{\"provider\":\"deepseek\",\"model\":\"deepseek-chat\",\"thinkingEnabled\":false}")));
    }

    @Test
    @DisplayName("带 maxTokens：不走快速切换")
    void withMaxTokensIsNotQuickSwitch() {
        assertFalse(ConfigApiHandler.isQuickSwitch(json(
                "{\"provider\":\"deepseek\",\"model\":\"deepseek-chat\",\"maxTokens\":8192}")));
    }

    @Test
    @DisplayName("带 baseUrl：不走快速切换")
    void withBaseUrlIsNotQuickSwitch() {
        assertFalse(ConfigApiHandler.isQuickSwitch(json(
                "{\"provider\":\"deepseek\",\"model\":\"deepseek-chat\",\"baseUrl\":\"https://api.deepseek.com\"}")));
    }

    @Test
    @DisplayName("带 apiKey：不走快速切换")
    void withApiKeyIsNotQuickSwitch() {
        assertFalse(ConfigApiHandler.isQuickSwitch(json(
                "{\"provider\":\"deepseek\",\"model\":\"deepseek-chat\",\"apiKey\":\"sk-test\"}")));
    }

    @Test
    @DisplayName("空请求 / null：不算快速切换（防御性）")
    void nullOrEmptyIsNotQuickSwitch() {
        assertFalse(ConfigApiHandler.isQuickSwitch(null));
        assertFalse(ConfigApiHandler.isQuickSwitch(json("{}")));
    }
}
