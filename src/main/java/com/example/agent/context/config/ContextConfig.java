package com.example.agent.context.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ContextConfig {

    public static final int DEFAULT_MAX_TOKENS = 1000000;
    public static final int DEFAULT_PER_TOOL_SAFE_LIMIT = 20000;
    public static final int DEFAULT_GLOBAL_HARD_LIMIT = 32000;
    public static final int DEFAULT_MAX_AGENT_TURNS = 50;

    @JsonProperty("max_tokens")
    private int maxTokens = DEFAULT_MAX_TOKENS;

    @JsonProperty("per_tool_safe_limit")
    private int perToolSafeLimit = DEFAULT_PER_TOOL_SAFE_LIMIT;

    @JsonProperty("global_hard_limit")
    private int globalHardLimit = DEFAULT_GLOBAL_HARD_LIMIT;

    @JsonProperty("max_agent_turns")
    private int maxAgentTurns = DEFAULT_MAX_AGENT_TURNS;

    public ContextConfig() {
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = Math.max(1000, maxTokens);
    }

    public int getPerToolSafeLimit() {
        return perToolSafeLimit;
    }

    public void setPerToolSafeLimit(int perToolSafeLimit) {
        this.perToolSafeLimit = Math.max(1000, perToolSafeLimit);
    }

    public int getGlobalHardLimit() {
        return globalHardLimit;
    }

    public void setGlobalHardLimit(int globalHardLimit) {
        this.globalHardLimit = Math.max(1000, globalHardLimit);
    }

    public int getMaxAgentTurns() {
        return maxAgentTurns;
    }

    public void setMaxAgentTurns(int maxAgentTurns) {
        // 允许 0（无限制）；正数时至少 1
        this.maxAgentTurns = maxAgentTurns <= 0 ? 0 : Math.max(1, maxAgentTurns);
    }

    @Override
    public String toString() {
        return "ContextConfig{" +
                "maxTokens=" + maxTokens +
                ", perToolSafeLimit=" + perToolSafeLimit +
                ", globalHardLimit=" + globalHardLimit +
                ", maxAgentTurns=" + maxAgentTurns +
                '}';
    }
}
