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
        // 0. 迁移旧配置：当使用 hippo.data.dir（用户数据目录）且目录下无配置时，
        //    尝试从旧的安装目录（user.dir / JAR 目录）复制现成配置
        String hippoDataDir = System.getProperty("hippo.data.dir");
        if (hippoDataDir != null && !hippoDataDir.isEmpty()) {
            migrateFromOldLocation();
        }

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

    /** 从旧的安装目录迁移 config.yaml 到当前 configDir（用户数据目录） */
    private void migrateFromOldLocation() {
        // 先判断当前 configDir 下是否已有配置
        for (String fileName : CONFIG_FILE_NAMES) {
            if (new File(configDir, fileName).exists()) {
                return; // 已有配置，不需要迁移
            }
        }

        // 尝试从旧位置查找并复制
        String userDir = System.getProperty("user.dir");
        File oldDir = null;
        if (userDir != null) {
            oldDir = new File(userDir);
        }
        // 也检查 JAR（resources）目录
        try {
            java.net.URI uri = ConfigLoader.class.getProtectionDomain()
                .getCodeSource().getLocation().toURI();
            File file = new File(uri);
            String jarDir = file.isFile() ? file.getParent() : file.getAbsolutePath();
            if (jarDir != null && !jarDir.equals(userDir)) {
                for (String fileName : CONFIG_FILE_NAMES) {
                    File oldConfig = new File(jarDir, fileName);
                    if (oldConfig.exists()) {
                        try {
                            Files.createDirectories(new File(configDir).toPath());
                            Files.copy(oldConfig.toPath(), new File(configDir, fileName).toPath());
                            logger.info("配置已从旧位置迁移: {} → {}", oldConfig.getAbsolutePath(), configDir);
                            return;
                        } catch (IOException e) {
                            logger.warn("配置迁移失败: {}", e.getMessage());
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("检查旧配置位置失败: {}", e.getMessage());
        }
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
        // 1. 优先使用 hippo.data.dir（桌面端由 DesktopApplication.initDataDir() 设置为
        //    %APPDATA%/HippoBuddy，不会被更新覆盖，跨版本持久化）
        String hippoDataDir = System.getProperty("hippo.data.dir");
        if (hippoDataDir != null && !hippoDataDir.isEmpty()) {
            logger.info("Using hippo.data.dir: {}", hippoDataDir);
            return hippoDataDir;
        }

        // 2. 检查 user.dir 下是否有现成配置（兼容老版本、开发模式）
        String userDir = System.getProperty("user.dir");
        if (userDir != null) {
            for (String fileName : CONFIG_FILE_NAMES) {
                if (new File(userDir, fileName).exists()) {
                    return userDir;
                }
            }
        }
        
        // 3. 回退到 JAR 所在目录
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
