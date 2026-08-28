package com.example.agent.llm.client;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * LlmModelFetcher 纯逻辑测试（不触网）。
 * 网络成功/失败路径需依赖真实厂商服务，因此测试覆盖：
 * - isSupported 厂商支持判断
 * - buildModelsUrl URL 拼接规则
 * - fetchModels 缺 API Key 时的参数校验
 */
@DisplayName("LlmModelFetcher 拉取模型工具测试")
class LlmModelFetcherTest {

    // ==================== isSupported ====================

    @Nested
    @DisplayName("isSupported 厂商支持判断")
    class IsSupported {

        @Test
        @DisplayName("空值应判定为不支持")
        void testIsSupported_blankReturnsFalse() {
            assertFalse(LlmModelFetcher.isSupported(null));
            assertFalse(LlmModelFetcher.isSupported(""));
            assertFalse(LlmModelFetcher.isSupported("  "));
        }

        @Test
        @DisplayName("OpenAI 兼容厂商应支持拉取")
        void testIsSupported_openaiCompatReturnsTrue() {
            assertTrue(LlmModelFetcher.isSupported("deepseek"));
            assertTrue(LlmModelFetcher.isSupported("zhipu"));
            assertTrue(LlmModelFetcher.isSupported("dashscope"));
            assertTrue(LlmModelFetcher.isSupported("openai"));
        }

        @Test
        @DisplayName("不支持 /v1/models 的厂商应被拒绝")
        void testIsSupported_unsupportedProvidersReturnsFalse() {
            // 大小写不敏感（后端 provider 传入可能为任意大小写）
            assertFalse(LlmModelFetcher.isSupported("ANTHROPIC"));
            assertFalse(LlmModelFetcher.isSupported("OLLAMA"));
            assertFalse(LlmModelFetcher.isSupported("LOCAL"));
            assertFalse(LlmModelFetcher.isSupported("azure"));
            assertFalse(LlmModelFetcher.isSupported("local"));
        }
    }

    // ==================== buildModelsUrl ====================

    @Nested
    @DisplayName("buildModelsUrl URL 拼接")
    class BuildModelsUrl {

        @Test
        @DisplayName("带 /v1 的 baseUrl 应直接追加 /models")
        void testBuildModelsUrl_withV1() {
            assertEquals(
                    "https://api.deepseek.com/v1/models",
                    LlmModelFetcher.buildModelsUrl("https://api.deepseek.com/v1"));
        }

        @Test
        @DisplayName("带尾部斜杠的 baseUrl 应去尾斜杠后再拼接")
        void testBuildModelsUrl_stripTrailingSlash() {
            assertEquals(
                    "https://api.deepseek.com/v1/models",
                    LlmModelFetcher.buildModelsUrl("https://api.deepseek.com/v1/"));
        }

        @Test
        @DisplayName("不带 /v1 的 baseUrl 也应正确追加 /models")
        void testBuildModelsUrl_withoutVersionPath() {
            assertEquals(
                    "https://api.deepseek.com/models",
                    LlmModelFetcher.buildModelsUrl("https://api.deepseek.com"));
        }

        @Test
        @DisplayName("空 baseUrl 应仅返回 /models")
        void testBuildModelsUrl_blankBaseUrl() {
            assertEquals("/models", LlmModelFetcher.buildModelsUrl(""));
            assertEquals("/models", LlmModelFetcher.buildModelsUrl(null));
        }
    }

    // ==================== fetchModels 参数校验 ====================

    @Nested
    @DisplayName("fetchModels 参数校验")
    class FetchModels {

        @Test
        @DisplayName("缺少 API Key 时应抛出 IllegalArgumentException")
        void testFetchModels_missingApiKeyThrows() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> LlmModelFetcher.fetchModels("https://api.deepseek.com/v1", null));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> LlmModelFetcher.fetchModels("https://api.deepseek.com/v1", "  "));
        }
    }
}