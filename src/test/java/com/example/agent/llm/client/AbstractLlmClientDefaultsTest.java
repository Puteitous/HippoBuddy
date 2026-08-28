package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("AbstractLlmClient 默认值契约测试")
class AbstractLlmClientDefaultsTest {

    private Config config;

    @BeforeEach
    void setUp() {
        config = Config.getInstance();
    }

    @Nested
    @DisplayName("🔵 getModel() 默认值回退测试")
    class GetModelDefaultsTests {

        @Test
        @DisplayName("config.model为null时返回getDefaultModel()")
        void testNullModelReturnsDefault() {
            config.getLlm().setModel(null);

            TestableDashScopeClient client = new TestableDashScopeClient();
            String result = client.getModel();

            assertEquals("gpt-4o", result);
            assertNull(config.getLlm().getModel(), "Config对象不应该被修改");
        }

        @Test
        @DisplayName("config.model为空字符串时返回getDefaultModel()")
        void testEmptyModelReturnsDefault() {
            config.getLlm().setModel("");

            TestableDashScopeClient client = new TestableDashScopeClient();
            String result = client.getModel();

            assertEquals("gpt-4o", result);
            assertEquals("", config.getLlm().getModel(), "Config对象不应该被修改");
        }

        @Test
        @DisplayName("config.model为空白字符串时返回getDefaultModel()")
        void testBlankModelReturnsDefault() {
            config.getLlm().setModel("   ");

            TestableDashScopeClient client = new TestableDashScopeClient();
            String result = client.getModel();

            assertEquals("gpt-4o", result);
        }

        @Test
        @DisplayName("config.model有值时原样返回")
        void testExplicitModelPreserved() {
            config.getLlm().setModel("custom-model-v1");

            TestableDashScopeClient client = new TestableDashScopeClient();
            String result = client.getModel();

            assertEquals("custom-model-v1", result);
        }
    }

    @Nested
    @DisplayName("🔵 getBaseUrl() 默认值回退测试")
    class GetBaseUrlDefaultsTests {

        @Test
        @DisplayName("config.baseUrl为null时返回getDefaultBaseUrl()")
        void testNullBaseUrlReturnsDefault() {
            config.getLlm().setBaseUrl(null);

            TestableDashScopeClient client = new TestableDashScopeClient();
            String result = client.getBaseUrl();

            assertEquals("https://api.openai.com/v1", result);
            assertNull(config.getLlm().getBaseUrl(), "Config对象不应该被修改");
        }

        @Test
        @DisplayName("config.baseUrl为空字符串时返回getDefaultBaseUrl()")
        void testEmptyBaseUrlReturnsDefault() {
            config.getLlm().setBaseUrl("");

            TestableDashScopeClient client = new TestableDashScopeClient();
            String result = client.getBaseUrl();

            assertEquals("https://api.openai.com/v1", result);
            assertEquals("", config.getLlm().getBaseUrl(), "Config对象不应该被修改");
        }

        @Test
        @DisplayName("config.baseUrl为空白字符串时返回getDefaultBaseUrl()")
        void testBlankBaseUrlReturnsDefault() {
            config.getLlm().setBaseUrl("   \t\n");

            TestableDashScopeClient client = new TestableDashScopeClient();
            String result = client.getBaseUrl();

            assertEquals("https://api.openai.com/v1", result);
        }

        @Test
        @DisplayName("config.baseUrl有值时原样返回")
        void testExplicitBaseUrlPreserved() {
            config.getLlm().setBaseUrl("https://custom-proxy.example.com");

            TestableDashScopeClient client = new TestableDashScopeClient();
            String result = client.getBaseUrl();

            assertEquals("https://custom-proxy.example.com", result);
        }
    }

    @Nested
    @DisplayName("🔵 所有子类默认值实现契约测试")
    class SubclassImplementationTests {

        @Test
        @DisplayName("OpenAI默认值正确实现")
        void testOpenAiDefaults() {
            OpenAiLlmClient client = new OpenAiLlmClient();

            assertEquals("https://api.openai.com/v1", client.getDefaultBaseUrl());
            assertEquals("gpt-4o", client.getDefaultModel());
        }

        @Test
        @DisplayName("Ollama默认值正确实现")
        void testOllamaDefaults() {
            OllamaLlmClient client = new OllamaLlmClient();

            assertEquals("http://localhost:11434/v1", client.getDefaultBaseUrl());
            assertEquals("qwen2.5:7b", client.getDefaultModel());
        }

        @Test
        @DisplayName("所有子类都正确实现抽象方法，无null返回")
        void testAllSubclassesNoNullDefaults() {
            LlmClient[] clients = {
                new OpenAiLlmClient(),
                new OllamaLlmClient()
            };

            for (LlmClient rawClient : clients) {
                AbstractLlmClient client = (AbstractLlmClient) rawClient;

                assertNotNull(client.getDefaultBaseUrl(),
                    client.getClass().getSimpleName() + ".getDefaultBaseUrl() 不应返回null");
                assertNotNull(client.getDefaultModel(),
                    client.getClass().getSimpleName() + ".getDefaultModel() 不应返回null");

                assertFalse(client.getDefaultBaseUrl().isEmpty(),
                    client.getClass().getSimpleName() + ".getDefaultBaseUrl() 不应为空");
                assertFalse(client.getDefaultModel().isEmpty(),
                    client.getClass().getSimpleName() + ".getDefaultModel() 不应为空");
            }
        }
    }

    @Nested
    @DisplayName("🔵 null与空字符串边界一致性测试")
    class NullEmptyConsistencyTests {

        @Test
        @DisplayName("model的null与空字符串处理逻辑一致")
        void testModelNullEmptyConsistency() {
            TestableDashScopeClient client = new TestableDashScopeClient();

            config.getLlm().setModel(null);
            String nullResult = client.getModel();

            config.getLlm().setModel("");
            String emptyResult = client.getModel();

            assertEquals(nullResult, emptyResult, "null和空字符串处理结果应一致");
            assertEquals("gpt-4o", nullResult);
        }

        @Test
        @DisplayName("baseUrl的null与空字符串处理逻辑一致")
        void testBaseUrlNullEmptyConsistency() {
            TestableDashScopeClient client = new TestableDashScopeClient();

            config.getLlm().setBaseUrl(null);
            String nullResult = client.getBaseUrl();

            config.getLlm().setBaseUrl("");
            String emptyResult = client.getBaseUrl();

            assertEquals(nullResult, emptyResult, "null和空字符串处理结果应一致");
            assertEquals("https://api.openai.com/v1", nullResult);
        }
    }

    static class TestableDashScopeClient extends OpenAiLlmClient {
        public TestableDashScopeClient() {
            super(Config.getInstance());
        }

        @Override
        public String getModel() {
            return super.getModel();
        }

        @Override
        public String getBaseUrl() {
            return super.getBaseUrl();
        }
    }
}
