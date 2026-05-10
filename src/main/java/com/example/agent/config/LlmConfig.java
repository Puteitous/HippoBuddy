package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Locale;

@JsonIgnoreProperties(ignoreUnknown = true)
public class LlmConfig {

    private static final int DEFAULT_MAX_TOKENS = 2048;
    private static final double DEFAULT_TEMPERATURE = 0.7;
    private static final int DEFAULT_TIMEOUT = 60000;

    private String provider = "dashscope";
    
    @JsonProperty("api_key")
    private String apiKey;
    
    @JsonProperty("server_cache")
    private boolean serverCache = false;
    
    private String model = "qwen3.5-plus";
    
    @JsonProperty("base_url")
    private String baseUrl = "https://dashscope.aliyuncs.com";
    
    @JsonProperty("max_tokens")
    private int maxTokens = DEFAULT_MAX_TOKENS;
    
    private double temperature = DEFAULT_TEMPERATURE;
    private int timeout = DEFAULT_TIMEOUT;
    
    @JsonProperty("thinking_enabled")
    private boolean thinkingEnabled = true;
    
    @JsonProperty("reasoning_effort")
    private String reasoningEffort = "high";
    
    @JsonProperty("response_format")
    private String responseFormat;

    public LlmConfig() {
    }

    public boolean isServerCache() {
        return serverCache;
    }

    public void setServerCache(boolean serverCache) {
        this.serverCache = serverCache;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = maxTokens;
    }

    public double getTemperature() {
        return temperature;
    }

    public void setTemperature(double temperature) {
        if (temperature < 0 || temperature > 2) {
            throw new IllegalArgumentException("Temperature must be between 0 and 2");
        }
        this.temperature = temperature;
    }

    public int getTimeout() {
        return timeout;
    }

    public void setTimeout(int timeout) {
        if (timeout <= 0) {
            throw new IllegalArgumentException("Timeout must be greater than 0");
        }
        this.timeout = timeout;
    }

    public boolean isThinkingEnabled() {
        return thinkingEnabled;
    }

    public void setThinkingEnabled(boolean thinkingEnabled) {
        this.thinkingEnabled = thinkingEnabled;
    }

    public String getReasoningEffort() {
        return reasoningEffort;
    }

    public void setReasoningEffort(String reasoningEffort) {
        this.reasoningEffort = reasoningEffort;
    }

    public String getResponseFormat() {
        return responseFormat;
    }

    public void setResponseFormat(String responseFormat) {
        this.responseFormat = responseFormat;
    }

    public boolean isValid() {
        if (isLocalProvider()) {
            return true;
        }
        return apiKey != null 
            && !apiKey.isEmpty() 
            && !apiKey.equals("your-api-key-here");
    }

    @JsonIgnore
    public boolean isLocalProvider() {
        if (provider == null) {
            return false;
        }
        String normalized = provider.trim().toLowerCase(Locale.ROOT);
        return normalized.equals("ollama") || normalized.equals("local");
    }

    public String maskApiKey() {
        if (apiKey == null || apiKey.length() < 8) {
            return "****";
        }
        return apiKey.substring(0, 4) + "****" + apiKey.substring(apiKey.length() - 4);
    }

    @Override
    public String toString() {
        return "LlmConfig{" +
                "provider='" + provider + '\'' +
                ", apiKey='" + maskApiKey() + '\'' +
                ", model='" + model + '\'' +
                ", baseUrl='" + baseUrl + '\'' +
                ", maxTokens=" + maxTokens +
                ", temperature=" + temperature +
                ", timeout=" + timeout +
                ", thinkingEnabled=" + thinkingEnabled +
                ", reasoningEffort='" + reasoningEffort + '\'' +
                ", responseFormat='" + responseFormat + '\'' +
                '}';
    }
}
