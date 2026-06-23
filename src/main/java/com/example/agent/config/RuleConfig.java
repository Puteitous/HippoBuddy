package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 规则加载配置。
 * <p>
 * 规则来源唯一路径：{@code .hippo/rules/*.md}，不再支持自定义文件名。
 * </p>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class RuleConfig {

    public static final int DEFAULT_MAX_TOKENS = 8000;

    @JsonProperty("max_tokens")
    private int maxTokens = DEFAULT_MAX_TOKENS;

    @JsonProperty("inject_at_startup")
    private boolean injectAtStartup = true;

    public RuleConfig() {
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = maxTokens;
    }

    public boolean isInjectAtStartup() {
        return injectAtStartup;
    }

    public void setInjectAtStartup(boolean injectAtStartup) {
        this.injectAtStartup = injectAtStartup;
    }

    @Override
    public String toString() {
        return "RuleConfig{" +
                "maxTokens=" + maxTokens +
                ", injectAtStartup=" + injectAtStartup +
                '}';
    }
}
