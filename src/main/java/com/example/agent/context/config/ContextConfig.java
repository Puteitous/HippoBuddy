package com.example.agent.context.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ContextConfig {

    public static final int DEFAULT_MAX_TOKENS = 1000000;

    @JsonProperty("max_tokens")
    private int maxTokens = DEFAULT_MAX_TOKENS;

    public ContextConfig() {
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = Math.max(1000, maxTokens);
    }

    @Override
    public String toString() {
        return "ContextConfig{" +
                "maxTokens=" + maxTokens +
                '}';
    }
}
