package com.example.agent.prompt.loader;

import com.example.agent.prompt.model.Prompt;
import com.example.agent.prompt.model.PromptType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class ClasspathPromptLoader implements PromptLoader {

    private static final Logger logger = LoggerFactory.getLogger(ClasspathPromptLoader.class);
    private static final String PROMPTS_BASE = "prompts";
    private static final String CONFIG_FILE = "prompts/prompts.yaml";

    private final ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());

    @Override
    public List<Prompt> loadAll() {
        List<Prompt> prompts = new ArrayList<>();

        try {
            JsonNode config = loadConfig();
            if (config != null && config.has("prompts")) {
                for (JsonNode promptConfig : config.get("prompts")) {
                    Optional<Prompt> prompt = loadPrompt(promptConfig);
                    prompt.ifPresent(prompts::add);
                }
            }
        } catch (Exception e) {
            logger.warn("Failed to load prompts config: {}", e.getMessage());
        }

        if (prompts.isEmpty()) {
            throw new IllegalStateException(
                "No prompts loaded! Please check resources/prompts/prompts.yaml exists " +
                "and the referenced prompt files (core/role.md, mode/coding.md, etc.) are properly configured"
            );
        }

        logger.info("Loaded {} prompts from classpath", prompts.size());
        return prompts;
    }

    private JsonNode loadConfig() throws IOException {
        InputStream inputStream = getClass().getClassLoader().getResourceAsStream(CONFIG_FILE);
        if (inputStream == null) {
            logger.warn("Prompt config file not found: {}", CONFIG_FILE);
            return null;
        }
        return yamlMapper.readTree(inputStream);
    }

    private Optional<Prompt> loadPrompt(JsonNode config) {
        try {
            String typeStr = config.get("type").asText();
            PromptType type = PromptType.valueOf(typeStr);
            String file = config.has("file") ? config.get("file").asText() : null;
            String version = config.has("version") ? config.get("version").asText() : "1.0.0";
            boolean enabled = !config.has("enabled") || config.get("enabled").asBoolean();
            int priority = config.has("priority") ? config.get("priority").asInt() : 0;

            String content = "";
            if (file != null) {
                content = loadContentFromFile(PROMPTS_BASE + "/" + file);
            }

            return Optional.of(Prompt.builder()
                    .type(type)
                    .content(content)
                    .version(version)
                    .enabled(enabled)
                    .priority(priority)
                    .build());
        } catch (Exception e) {
            logger.warn("Failed to load prompt: {}", e.getMessage());
            return Optional.empty();
        }
    }

    private String loadContentFromFile(String resourcePath) {
        try (InputStream is = getClass().getClassLoader().getResourceAsStream(resourcePath)) {
            if (is == null) {
                logger.warn("Prompt file not found: {}", resourcePath);
                return "";
            }
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            logger.warn("Failed to read prompt file {}: {}", resourcePath, e.getMessage());
            return "";
        }
    }

}
