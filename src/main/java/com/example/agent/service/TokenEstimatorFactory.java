package com.example.agent.service;

import com.example.agent.config.Config;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class TokenEstimatorFactory {

    private static final Logger logger = LoggerFactory.getLogger(TokenEstimatorFactory.class);

    private static final String DEFAULT_TYPE = "tiktoken";
    private static final int DEFAULT_CACHE_MAX_SIZE = 1000;

    public static TokenEstimator getDefault() {
        return create(DEFAULT_TYPE, null, true, DEFAULT_CACHE_MAX_SIZE);
    }

    public static TokenEstimator create(Config config) {
        String modelName = config != null && config.getLlm() != null ? config.getLlm().getModel() : null;
        return create(DEFAULT_TYPE, modelName, true, DEFAULT_CACHE_MAX_SIZE);
    }

    public static TokenEstimator create(String tokenizerType, String modelName) {
        return create(tokenizerType, modelName, true, DEFAULT_CACHE_MAX_SIZE);
    }

    public static TokenEstimator create(String tokenizerType, String modelName, boolean cacheEnabled, int cacheMaxSize) {
        if (tokenizerType == null || tokenizerType.isEmpty()) {
            tokenizerType = DEFAULT_TYPE;
        }

        logger.info("创建TokenEstimator: type={}, model={}, cacheEnabled={}, cacheMaxSize={}",
            tokenizerType, modelName, cacheEnabled, cacheMaxSize);

        if ("tiktoken".equalsIgnoreCase(tokenizerType)) {
            try {
                return new TiktokenEstimator(modelName, cacheEnabled, cacheMaxSize);
            } catch (Exception e) {
                logger.warn("Tiktoken初始化失败，回退到SimpleTokenEstimator: {}", e.getMessage());
                return new SimpleTokenEstimator();
            }
        }

        return new SimpleTokenEstimator();
    }

    public static TokenEstimator createDefault() {
        return new SimpleTokenEstimator();
    }
}
