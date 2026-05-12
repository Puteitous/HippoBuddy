package com.example.agent.web.session;

public class SessionTokenStats {
    public int totalInputTokens = 0;
    public int totalOutputTokens = 0;
    public int totalTokens = 0;
    public int llmCalls = 0;
    public int toolCalls = 0;
    public int totalCacheHitTokens = 0;
    public int totalCacheMissTokens = 0;

    public synchronized void addLlmCall(int prompt, int completion, int total) {
        this.totalInputTokens += prompt;
        this.totalOutputTokens += completion;
        this.totalTokens += total;
        this.llmCalls++;
    }

    public synchronized void addLlmCall(int prompt, int completion, int total, int cacheHit, int cacheMiss) {
        this.totalInputTokens += prompt;
        this.totalOutputTokens += completion;
        this.totalTokens += total;
        this.totalCacheHitTokens += cacheHit;
        this.totalCacheMissTokens += cacheMiss;
        this.llmCalls++;
    }

    public synchronized void addToolCall() {
        this.toolCalls++;
    }

    public double getSessionCacheHitRate() {
        int total = totalCacheHitTokens + totalCacheMissTokens;
        if (total == 0) return 0.0;
        return ((double) totalCacheHitTokens / total) * 100;
    }
}
