package com.example.agent.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ConfigLoader {

    private static final Logger logger = LoggerFactory.getLogger(ConfigLoader.class);

    private static final String[] CONFIG_FILE_NAMES = {
        "config.yaml",
        "config.yml",
        "config.json"
    };

    private final String configDir;

    public ConfigLoader() {
        this.configDir = getConfigDirectory();
    }

    public ConfigLoader(String configDir) {
        this.configDir = configDir;
    }

    public Config load() {
        for (String fileName : CONFIG_FILE_NAMES) {
            File configFile = new File(configDir, fileName);
            if (configFile.exists()) {
                Config config = loadFromFile(configFile);
                if (config != null) {
                    logger.info("Configuration loaded from: {}", configFile.getAbsolutePath());
                    return config;
                }
            }
        }
        
        // No config file found — try to scaffold from example
        File exampleFile = new File(configDir, "config.yaml.example");
        if (exampleFile.exists()) {
            try {
                File target = new File(configDir, "config.yaml");
                Files.copy(exampleFile.toPath(), target.toPath());
                logger.info("Scaffolded config.yaml from config.yaml.example");
                Config config = loadYaml(target);
                if (config != null) {
                    logger.info("Configuration loaded from: {}", target.getAbsolutePath());
                    return config;
                }
            } catch (IOException e) {
                logger.warn("Failed to copy config.yaml.example: {}", e.getMessage());
            }
        } else {
            logger.info("config.yaml.example not found, creating default config.");
        }
        
        Config defaultConfig = createDefaultConfig();
        saveDefaultConfig(defaultConfig);
        return defaultConfig;
    }

    private Config loadFromFile(File file) {
        String fileName = file.getName().toLowerCase();
        
        try {
            if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
                return loadYaml(file);
            } else if (fileName.endsWith(".json")) {
                return loadJson(file);
            } else if (fileName.endsWith(".properties")) {
                return loadProperties(file);
            }
        } catch (IOException e) {
            logger.error("Error loading config file: {}", e.getMessage());
        }
        
        return null;
    }

    private Config loadYaml(File file) throws IOException {
        ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
        mapper.findAndRegisterModules();
        Config config = mapper.readValue(file, Config.class);
        resolveEnvVariables(config);
        return config;
    }

    private Config loadJson(File file) throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        mapper.enable(SerializationFeature.INDENT_OUTPUT);
        Config config = mapper.readValue(file, Config.class);
        resolveEnvVariables(config);
        return config;
    }

    private Config loadProperties(File file) throws IOException {
        Properties props = new Properties();
        try (InputStreamReader reader = new InputStreamReader(
                new FileInputStream(file), StandardCharsets.UTF_8)) {
            props.load(reader);
        }
        
        Config config = new Config();
        config.getLlm().setApiKey(props.getProperty("api.key", props.getProperty("llm.api_key")));
        config.getLlm().setBaseUrl(props.getProperty("api.url", props.getProperty("llm.base_url")));
        config.getLlm().setModel(props.getProperty("model.name", props.getProperty("llm.model")));
        
        if (props.containsKey("llm.max_tokens")) {
            config.getLlm().setMaxTokens(Integer.parseInt(props.getProperty("llm.max_tokens")));
        }
        
        resolveEnvVariables(config);
        return config;
    }

    private void resolveEnvVariables(Config config) {
        LlmConfig llm = config.getLlm();
        if (llm != null) {
            llm.setApiKey(EnvVariableResolver.resolve(llm.getApiKey()));
            llm.setBaseUrl(EnvVariableResolver.resolve(llm.getBaseUrl()));
            llm.setModel(EnvVariableResolver.resolve(llm.getModel()));
            
            logger.info("=== 配置调试信息 ===");
            logger.info("Provider: {}", config.getLlm().getProvider());
            logger.info("API Key: {}...", llm.getApiKey() != null && llm.getApiKey().length() > 10 ? llm.getApiKey().substring(0, 10) : "null");
            logger.info("Model: {}", llm.getModel());
            logger.info("Base URL: {}", llm.getBaseUrl());
            logger.info("====================");
        }
    }

    private Config createDefaultConfig() {
        Config config = new Config();
        logger.info("No configuration file found. Creating default configuration.");
        return config;
    }

    private void saveDefaultConfig(Config config) {
        File configFile = new File(configDir, "config.yaml");
        try {
            ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
            mapper.enable(SerializationFeature.INDENT_OUTPUT);
            mapper.writeValue(configFile, config);
            logger.info("Default configuration created at: {}", configFile.getAbsolutePath());
        } catch (IOException e) {
            logger.error("Error creating default config file: {}", e.getMessage());
        }
    }

    private String getConfigDirectory() {
        String userDir = System.getProperty("user.dir");
        if (userDir != null) {
            for (String fileName : CONFIG_FILE_NAMES) {
                if (new File(userDir, fileName).exists()) {
                    return userDir;
                }
            }
        }
        
        try {
            java.net.URI uri = ConfigLoader.class.getProtectionDomain()
                .getCodeSource().getLocation().toURI();
            File file = new File(uri);
            String jarDir = file.isFile() ? file.getParent() : file.getAbsolutePath();
            
            if (jarDir != null && jarDir.endsWith("target")) {
                File parentDir = new File(jarDir).getParentFile();
                if (parentDir != null) {
                    return parentDir.getAbsolutePath();
                }
            }
            
            if (jarDir != null) {
                return jarDir;
            }
        } catch (Exception e) {
            logger.warn("Could not determine config directory: {}", e.getMessage());
        }
        
        return userDir;
    }

    public File getConfigFile() {
        for (String fileName : CONFIG_FILE_NAMES) {
            File file = new File(configDir, fileName);
            if (file.exists()) {
                return file;
            }
        }
        return new File(configDir, "config.yaml");
    }

    public String getConfigFilePath() {
        return getConfigFile().getAbsolutePath();
    }
}
