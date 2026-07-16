package com.example.agent;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.config.ToolsConfig;
import com.example.agent.config.SessionConfig;
import com.example.agent.config.UiConfig;
import com.example.agent.context.config.ContextConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ConfigTest {

    @TempDir
    Path tempDir;

    private File testConfigFile;
    private ObjectMapper jsonMapper;
    private ObjectMapper yamlMapper;

    @BeforeEach
    void setUp() throws Exception {
        resetConfigInstance();
        testConfigFile = tempDir.resolve("config.json").toFile();
        jsonMapper = new ObjectMapper();
        jsonMapper.enable(SerializationFeature.INDENT_OUTPUT);
        yamlMapper = new ObjectMapper(new YAMLFactory());
        yamlMapper.enable(SerializationFeature.INDENT_OUTPUT);
    }

    @AfterEach
    void tearDown() throws Exception {
        resetConfigInstance();
    }

    private void resetConfigInstance() throws Exception {
        Field instanceField = Config.class.getDeclaredField("instance");
        instanceField.setAccessible(true);
        instanceField.set(null, null);
    }

    private Config createConfigInstance() throws Exception {
        Constructor<Config> constructor = Config.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        Config config = constructor.newInstance();
        
        Field llmField = Config.class.getDeclaredField("llm");
        llmField.setAccessible(true);
        llmField.set(config, new LlmConfig());
        
        Field toolsField = Config.class.getDeclaredField("tools");
        toolsField.setAccessible(true);
        toolsField.set(config, new ToolsConfig());
        
        Field sessionField = Config.class.getDeclaredField("session");
        sessionField.setAccessible(true);
        sessionField.set(config, new SessionConfig());
        
        Field uiField = Config.class.getDeclaredField("ui");
        uiField.setAccessible(true);
        uiField.set(config, new UiConfig());
        
        Field contextField = Config.class.getDeclaredField("context");
        contextField.setAccessible(true);
        contextField.set(config, new ContextConfig());
        
        return config;
    }

    @Test
    void testDefaultValues() throws Exception {
        Config config = createConfigInstance();
        
        assertEquals("qwen3.5-plus", config.getLlm().getModel());
        assertEquals("https://dashscope.aliyuncs.com", config.getLlm().getBaseUrl());
        assertEquals(2048, config.getLlm().getMaxTokens());
        assertNull(config.getLlm().getApiKey());
    }

    @Test
    void testSettersAndGetters() throws Exception {
        Config config = createConfigInstance();
        
        config.getLlm().setApiKey("test-api-key");
        config.getLlm().setModel("qwen-max");
        config.getLlm().setBaseUrl("https://custom.api.com");
        config.getLlm().setMaxTokens(4096);
        
        assertEquals("test-api-key", config.getLlm().getApiKey());
        assertEquals("qwen-max", config.getLlm().getModel());
        assertEquals("https://custom.api.com", config.getLlm().getBaseUrl());
        assertEquals(4096, config.getLlm().getMaxTokens());
    }

    @Test
    void testLlmConfigDefaults() throws Exception {
        Config config = createConfigInstance();
        LlmConfig llm = config.getLlm();
        
        assertEquals("dashscope", llm.getProvider());
        assertEquals(0.7, llm.getTemperature());
        assertEquals(60000, llm.getTimeout());
    }

    @Test
    void testToolsConfigDefaults() throws Exception {
        Config config = createConfigInstance();
        ToolsConfig tools = config.getTools();
        
        assertTrue(tools.getBash().isEnabled());
        assertTrue(tools.getBash().isRequireConfirmation());
        assertTrue(tools.getBash().getWhitelist().contains("git"));
        assertTrue(tools.getBash().getWhitelist().contains("mvn"));
    }

    @Test
    void testUiConfigDefaults() throws Exception {
        Config config = createConfigInstance();
        UiConfig ui = config.getUi();
        
        assertEquals("dark", ui.getTheme());
        assertEquals("agent>", ui.getPrompt());
        assertTrue(ui.isSyntaxHighlight());
        assertTrue(ui.isShowTokenUsage());
        assertTrue(ui.isColorOutput());
    }

    @Test
    void testIsValidWithNullApiKey() throws Exception {
        Config config = createConfigInstance();
        assertFalse(config.isValid());
    }

    @Test
    void testIsValidWithEmptyApiKey() throws Exception {
        Config config = createConfigInstance();
        config.getLlm().setApiKey("");
        assertFalse(config.isValid());
    }

    @Test
    void testIsValidWithDefaultPlaceholder() throws Exception {
        Config config = createConfigInstance();
        config.getLlm().setApiKey("your-api-key-here");
        assertFalse(config.isValid());
    }

    @Test
    void testIsValidWithValidApiKey() throws Exception {
        Config config = createConfigInstance();
        config.getLlm().setApiKey("sk-1234567890abcdef");
        assertTrue(config.isValid());
    }

    @Test
    void testMaskApiKeyWithNull() throws Exception {
        Config config = createConfigInstance();
        config.getLlm().setApiKey(null);
        String masked = config.getLlm().maskApiKey();
        assertEquals("****", masked);
    }

    @Test
    void testMaskApiKeyWithShortKey() throws Exception {
        Config config = createConfigInstance();
        config.getLlm().setApiKey("abc");
        String masked = config.getLlm().maskApiKey();
        assertEquals("****", masked);
    }

    @Test
    void testMaskApiKeyWithLongKey() throws Exception {
        Config config = createConfigInstance();
        config.getLlm().setApiKey("sk-1234567890abcdefghijklmnop");
        String masked = config.getLlm().maskApiKey();
        assertEquals("sk-1****mnop", masked);
    }

    @Test
    void testBashToolCommandAllowed() throws Exception {
        Config config = createConfigInstance();
        ToolsConfig.BashToolConfig bash = config.getTools().getBash();
        
        assertTrue(bash.isCommandAllowed("git status"));
        assertTrue(bash.isCommandAllowed("mvn compile"));
        assertFalse(bash.isCommandAllowed("rm -rf /"));
        assertFalse(bash.isCommandAllowed("format c:"));
    }

    @Test
    void testYamlSerialization() throws Exception {
        Config config = createConfigInstance();
        config.getLlm().setApiKey("test-key-123");
        config.getLlm().setModel("qwen-max");
        config.getLlm().setBaseUrl("https://test.api.com");
        config.getLlm().setMaxTokens(8192);
        
        String yaml = yamlMapper.writeValueAsString(config);
        
        assertNotNull(yaml);
        assertFalse(yaml.isEmpty());
        
        Config deserialized = yamlMapper.readValue(yaml, Config.class);
        assertEquals("test-key-123", deserialized.getLlm().getApiKey());
        assertEquals("qwen-max", deserialized.getLlm().getModel());
        assertEquals("https://test.api.com", deserialized.getLlm().getBaseUrl());
        assertEquals(8192, deserialized.getLlm().getMaxTokens());
    }

    @Test
    void testYamlDeserialization() throws IOException {
        String yaml = """
            llm:
              provider: openai
              api_key: yaml-test-key
              model: gpt-4
              base_url: https://api.openai.com/v1
              max_tokens: 4096
              temperature: 0.5
              timeout: 30000
            tools:
              bash:
                enabled: false
                whitelist: [git, npm]
                require_confirmation: false
            session:
            ui:
              theme: light
              prompt: "ai>"
              syntax_highlight: false
            """;
        
        Config config = yamlMapper.readValue(yaml, Config.class);
        
        assertEquals("openai", config.getLlm().getProvider());
        assertEquals("yaml-test-key", config.getLlm().getApiKey());
        assertEquals("gpt-4", config.getLlm().getModel());
        assertEquals("https://api.openai.com/v1", config.getLlm().getBaseUrl());
        assertEquals(4096, config.getLlm().getMaxTokens());
        assertEquals(0.5, config.getLlm().getTemperature());
        assertEquals(30000, config.getLlm().getTimeout());
        
        assertFalse(config.getTools().getBash().isEnabled());
        assertFalse(config.getTools().getBash().isRequireConfirmation());
        
        assertEquals("light", config.getUi().getTheme());
        assertEquals("ai>", config.getUi().getPrompt());
        assertFalse(config.getUi().isSyntaxHighlight());
    }

    @Test
    void testJsonDeserializationWithMissingFields() throws IOException {
        String json = """
            {
                "llm": {
                    "api_key": "partial-key"
                }
            }
            """;
        
        Config config = jsonMapper.readValue(json, Config.class);
        
        assertEquals("partial-key", config.getLlm().getApiKey());
        assertEquals("qwen3.5-plus", config.getLlm().getModel());
        assertEquals("https://dashscope.aliyuncs.com", config.getLlm().getBaseUrl());
        assertEquals(2048, config.getLlm().getMaxTokens());
    }

    @Test
    void testJsonDeserializationIgnoresUnknownFields() throws IOException {
        String json = """
            {
                "llm": {
                    "api_key": "test-key",
                    "unknownField": "should be ignored"
                },
                "anotherUnknown": 12345
            }
            """;
        
        assertDoesNotThrow(() -> jsonMapper.readValue(json, Config.class));
    }

    @Test
    void testBackwardCompatibility() throws Exception {
        Config config = createConfigInstance();
        
        config.getLlm().setApiKey("test-key");
        assertEquals("test-key", config.getLlm().getApiKey());
        assertEquals("test-key", config.getLlm().getApiKey());
        
        config.getLlm().setApiKey("new-key");
        assertEquals("new-key", config.getLlm().getApiKey());
    }
}
