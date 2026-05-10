package com.example.agent.llm.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class Usage {

    private int promptTokens;
    private int completionTokens;
    private int totalTokens;
    
    // DashScope/OpenAI 缓存指标（嵌套在 prompt_tokens_details 中）
    @JsonProperty("prompt_tokens_details")
    private PromptTokensDetails promptTokensDetails;
    
    // DeepSeek 缓存指标（直接顶层字段）
    @JsonProperty("prompt_cache_hit_tokens")
    private int promptCacheHitTokens;
    
    @JsonProperty("prompt_cache_miss_tokens")
    private int promptCacheMissTokens;

    public int getPromptTokens() {
        return promptTokens;
    }

    public void setPromptTokens(int promptTokens) {
        this.promptTokens = promptTokens;
    }

    public int getCompletionTokens() {
        return completionTokens;
    }

    public void setCompletionTokens(int completionTokens) {
        this.completionTokens = completionTokens;
    }

    public int getTotalTokens() {
        return totalTokens;
    }

    public void setTotalTokens(int totalTokens) {
        this.totalTokens = totalTokens;
    }
    
    public PromptTokensDetails getPromptTokensDetails() {
        return promptTokensDetails;
    }
    
    public void setPromptTokensDetails(PromptTokensDetails promptTokensDetails) {
        this.promptTokensDetails = promptTokensDetails;
    }
    
    public int getPromptCacheHitTokens() {
        return promptCacheHitTokens;
    }
    
    public void setPromptCacheHitTokens(int promptCacheHitTokens) {
        this.promptCacheHitTokens = promptCacheHitTokens;
    }
    
    public int getPromptCacheMissTokens() {
        return promptCacheMissTokens;
    }
    
    public void setPromptCacheMissTokens(int promptCacheMissTokens) {
        this.promptCacheMissTokens = promptCacheMissTokens;
    }
    
    /**
     * 获取命中缓存的 Token 数（兼容 DashScope/OpenAI 的 nested 和 DeepSeek 的 direct 格式）
     */
    public int getCacheReadInputTokens() {
        if (promptCacheHitTokens > 0) {
            return promptCacheHitTokens;
        }
        return promptTokensDetails != null ? promptTokensDetails.getCachedTokens() : 0;
    }
    
    /**
     * 获取创建缓存的 Token 数
     */
    public int getCacheCreationInputTokens() {
        return promptTokensDetails != null ? promptTokensDetails.getCacheCreationInputTokens() : 0;
    }
    
    /**
     * 计算缓存命中率（同时兼容 DeepSeek 和 DashScope/OpenAI 格式）
     * prompt_tokens = cache_hit + cache_miss（DeepSeek 官方 API）
     * @return 缓存命中率百分比 (0-100)
     */
    public double getCacheHitRate() {
        int cacheRead = getCacheReadInputTokens();
        if (cacheRead == 0) return 0.0;
        int totalInput = promptTokens;
        if (totalInput == 0) {
            return 0.0;
        }
        return ((double) cacheRead / totalInput) * 100;
    }

    @Override
    public String toString() {
        return "Usage{" +
                "promptTokens=" + promptTokens +
                ", completionTokens=" + completionTokens +
                ", totalTokens=" + totalTokens +
                ", cacheHitTokens=" + promptCacheHitTokens +
                ", cacheMissTokens=" + promptCacheMissTokens +
                ", cacheHitRate=" + String.format("%.1f", getCacheHitRate()) + "%" +
                '}';
    }
}
