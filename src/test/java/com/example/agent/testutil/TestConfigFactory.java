package com.example.agent.testutil;

import com.example.agent.config.Config;
import com.example.agent.context.config.ContextConfig;

import java.util.List;

public final class TestConfigFactory {

    private TestConfigFactory() {
    }

    public static class Llm {
        public static final String TEST_API_KEY = "test-api-key-12345";
        public static final String TEST_MODEL = "test-model";
        public static final String TEST_BASE_URL = "https://test.api.example.com";
        public static final int TEST_MAX_TOKENS = 2048;
        public static final double TEST_TEMPERATURE = 0.7;
        public static final int TEST_TIMEOUT = 60000;

        public static Config createTestConfig() {
            Config config = Config.getInstance();
            config.getLlm().setApiKey(TEST_API_KEY);
            config.getLlm().setModel(TEST_MODEL);
            config.getLlm().setBaseUrl(TEST_BASE_URL);
            config.getLlm().setMaxTokens(TEST_MAX_TOKENS);
            config.getLlm().setTemperature(TEST_TEMPERATURE);
            return config;
        }
    }

    public static class Context {
        public static ContextConfig createDefaultContextConfig() {
            ContextConfig config = new ContextConfig();
            config.setMaxTokens(30000);
            return config;
        }

        public static ContextConfig createSmallContextConfig() {
            ContextConfig config = new ContextConfig();
            config.setMaxTokens(5000);
            return config;
        }

        public static ContextConfig createLargeContextConfig() {
            ContextConfig config = new ContextConfig();
            config.setMaxTokens(100000);
            return config;
        }
    }

    public static class Tools {
    }

    public static class Session {
    }
}
