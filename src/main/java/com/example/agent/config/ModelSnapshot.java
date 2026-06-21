package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 模型配置快照，用于在 modelHistory 中保存完整的模型配置。
 * 切换历史模型时，从快照恢复所有配置字段，无需用户重新填写。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ModelSnapshot {

    private String provider;
    private String model;

    @JsonProperty("base_url")
    private String baseUrl;

    @JsonProperty("api_key")
    private String apiKey;

    @JsonProperty("max_tokens")
    private int maxTokens = 2048;

    @JsonProperty("thinking_enabled")
    private boolean thinkingEnabled = true;

    @JsonProperty("reasoning_effort")
    private String reasoningEffort = "high";

    public ModelSnapshot() {
    }

    /** 从当前 LlmConfig 创建快照 */
    public static ModelSnapshot from(LlmConfig config) {
        ModelSnapshot snap = new ModelSnapshot();
        snap.provider = config.getProvider();
        snap.model = config.getModel();
        snap.baseUrl = config.getBaseUrl();
        snap.apiKey = config.getApiKey();
        snap.maxTokens = config.getMaxTokens();
        snap.thinkingEnabled = config.isThinkingEnabled();
        snap.reasoningEffort = config.getReasoningEffort();
        return snap;
    }

    /** 将此快照的所有字段应用到 LlmConfig */
    public void applyTo(LlmConfig config) {
        config.setProvider(this.provider);
        config.setModel(this.model);
        config.setBaseUrl(this.baseUrl);
        config.setApiKey(this.apiKey);
        config.setMaxTokens(this.maxTokens);
        config.setThinkingEnabled(this.thinkingEnabled);
        config.setReasoningEffort(this.reasoningEffort);
    }

    /** 快照唯一标识 provider:model */
    @JsonIgnore
    public String getKey() {
        return (provider != null ? provider : "") + ":" + (model != null ? model : "");
    }

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public int getMaxTokens() { return maxTokens; }
    public void setMaxTokens(int maxTokens) { this.maxTokens = maxTokens; }

    public boolean isThinkingEnabled() { return thinkingEnabled; }
    public void setThinkingEnabled(boolean thinkingEnabled) { this.thinkingEnabled = thinkingEnabled; }

    public String getReasoningEffort() { return reasoningEffort; }
    public void setReasoningEffort(String reasoningEffort) { this.reasoningEffort = reasoningEffort; }

    /** 遮掩 API Key 中间部分（同 LlmConfig.maskApiKey） */
    public String maskApiKey() {
        if (apiKey == null || apiKey.length() < 8) return "****";
        return apiKey.substring(0, 4) + "****" + apiKey.substring(apiKey.length() - 4);
    }
}
