package com.example.agent.llm.client;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("buildUrl边界条件测试")
class BuildUrlTest {

    private TestableLlmClient client;

    static class TestableLlmClient extends OpenAiLlmClient {
        public TestableLlmClient() {
            super(com.example.agent.testutil.TestConfigFactory.Llm.createTestConfig());
        }

        @Override
        public String buildUrl(String baseUrl, String path) {
            return super.buildUrl(baseUrl, path);
        }
    }

    private boolean hasUnexpectedDoubleSlash(String url) {
        if (url == null) return false;
        String withoutProtocol = url.replaceFirst("^https?://", "");
        return withoutProtocol.contains("//");
    }

    @BeforeEach
    void setUp() {
        client = new TestableLlmClient();
    }

    @Nested
    @DisplayName("🔴 双斜杠修复测试")
    class DoubleSlashTests {

        @Test
        @DisplayName("baseUrl结尾有/ + path开头有/ → 合并为单斜杠")
        void testBothHaveSlash() {
            String result = client.buildUrl("https://api.example.com/", "/v1/chat");

            assertEquals("https://api.example.com/v1/chat", result);
            assertFalse(hasUnexpectedDoubleSlash(result), "路径部分不应该包含双斜杠: " + result);
        }

        @ParameterizedTest
        @CsvSource(delimiter = '|', value = {
            "https://a.com/  | /path  | https://a.com/path",
            "https://b.com   | /path  | https://b.com/path",
            "https://c.com/  | path   | https://c.com/path",
            "https://d.com   | path   | https://d.com/path",
        })
        @DisplayName("各种斜杠组合正确拼接")
        void testVariousSlashCombinations(String baseUrl, String path, String expected) {
            String result = client.buildUrl(baseUrl.trim(), path.trim());
            assertEquals(expected, result);
            assertFalse(hasUnexpectedDoubleSlash(result), "结果不应该包含路径双斜杠: " + result);
        }

        @Test
        @DisplayName("多级路径不破坏中间斜杠")
        void testMultiLevelPath() {
            String result = client.buildUrl("https://api.example.com/", "/v1/api/chat/completions");

            assertEquals("https://api.example.com/v1/api/chat/completions", result);
            assertFalse(result.contains("v1//api"), "不应该破坏中间的路径结构");
        }
    }

    @Nested
    @DisplayName("🔴 null/空边界测试")
    class NullEmptyTests {

        @ParameterizedTest
        @NullAndEmptySource
        @DisplayName("baseUrl null/空时返回path（path非null时）")
        void testNullBaseUrlReturnsPath(String baseUrl) {
            String result = client.buildUrl(baseUrl, "/v1/chat");
            assertEquals("/v1/chat", result);
        }

        @ParameterizedTest
        @NullAndEmptySource
        @DisplayName("path null/空时返回baseUrl")
        void testNullPathReturnsBaseUrl(String path) {
            String result = client.buildUrl("https://api.example.com", path);
            assertEquals("https://api.example.com", result);
        }

        @Test
        @DisplayName("两者都为空返回空字符串")
        void testBothEmpty() {
            assertEquals("", client.buildUrl("", ""));
            assertEquals("", client.buildUrl(null, null));
            assertEquals("", client.buildUrl(null, ""));
            assertEquals("", client.buildUrl("", null));
        }
    }

    @Nested
    @DisplayName("🔴 边缘场景测试")
    class EdgeCaseTests {

        @Test
        @DisplayName("localhost域名正确拼接")
        void testLocalhost() {
            String result = client.buildUrl("http://localhost:11434/", "/v1/chat");
            assertEquals("http://localhost:11434/v1/chat", result);
            assertFalse(hasUnexpectedDoubleSlash(result));
        }

        @Test
        @DisplayName("带端口号的URL正确拼接")
        void testUrlWithPort() {
            String result = client.buildUrl("http://127.0.0.1:8080/api/", "v1/chat");
            assertEquals("http://127.0.0.1:8080/api/v1/chat", result);
            assertFalse(hasUnexpectedDoubleSlash(result));
        }

        @Test
        @DisplayName("查询参数不受影响")
        void testQueryParameters() {
            String result = client.buildUrl("https://api.example.com/", "/v1/chat?debug=true&version=1");
            assertEquals("https://api.example.com/v1/chat?debug=true&version=1", result);
        }

        @Test
        @DisplayName("多个结尾斜杠只保留一个")
        void testMultipleTrailingSlashes() {
            String result = client.buildUrl("https://api.example.com////", "///v1/chat");
            assertFalse(hasUnexpectedDoubleSlash(result), "路径部分应该处理多斜杠");
        }
    }

    @Nested
    @DisplayName("实际Provider场景验证")
    class ProviderScenarioTests {

        @Test
        @DisplayName("Ollama默认配置正确拼接")
        void testOllamaDefault() {
            String baseUrl = "http://localhost:11434";
            String path = "/v1/chat/completions";

            String result = client.buildUrl(baseUrl, path);

            assertEquals("http://localhost:11434/v1/chat/completions", result);
            assertFalse(hasUnexpectedDoubleSlash(result));
        }

        @Test
        @DisplayName("OpenAI默认配置正确拼接")
        void testOpenAiDefault() {
            String baseUrl = "https://api.openai.com";
            String path = "/v1/chat/completions";

            String result = client.buildUrl(baseUrl, path);

            assertEquals("https://api.openai.com/v1/chat/completions", result);
            assertFalse(hasUnexpectedDoubleSlash(result));
        }

        @Test
        @DisplayName("DashScope默认配置正确拼接")
        void testDashScopeDefault() {
            String baseUrl = "https://dashscope.aliyuncs.com";
            String path = "/compatible-mode/v1/chat/completions";

            String result = client.buildUrl(baseUrl, path);

            assertEquals("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", result);
            assertFalse(hasUnexpectedDoubleSlash(result));
        }

        @Test
        @DisplayName("用户baseUrl带结尾/也能正确处理")
        void testUserConfigWithTrailingSlash() {
            String userConfiguredBaseUrl = "https://my-proxy.example.com/";
            String path = "/v1/chat/completions";

            String result = client.buildUrl(userConfiguredBaseUrl, path);

            assertEquals("https://my-proxy.example.com/v1/chat/completions", result);
            assertFalse(hasUnexpectedDoubleSlash(result), "用户配置带结尾斜杠的情况必须处理");
        }
    }
}
