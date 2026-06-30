package com.example.agent.context.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ContextConfig {

    public static final int DEFAULT_MAX_TOKENS = 1000000;
    public static final int DEFAULT_MAX_MESSAGES = 20;
    public static final int DEFAULT_KEEP_RECENT_TURNS = 6;
    public static final int DEFAULT_TOOL_RESULT_MAX_TOKENS = 80000;
    public static final String DEFAULT_POLICY = "simple";

    @JsonProperty("max_tokens")
    private int maxTokens = DEFAULT_MAX_TOKENS;

    @JsonProperty("max_messages")
    private int maxMessages = DEFAULT_MAX_MESSAGES;

    @JsonProperty("keep_recent_turns")
    private int keepRecentTurns = DEFAULT_KEEP_RECENT_TURNS;

    @JsonProperty("tool_result")
    private ToolResultConfig toolResult = new ToolResultConfig();

    @JsonProperty("policy")
    private String policy = DEFAULT_POLICY;

    public ContextConfig() {
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = Math.max(1000, maxTokens);
    }

    public int getMaxMessages() {
        return maxMessages;
    }

    public void setMaxMessages(int maxMessages) {
        this.maxMessages = Math.max(2, maxMessages);
    }

    public int getKeepRecentTurns() {
        return keepRecentTurns;
    }

    public void setKeepRecentTurns(int keepRecentTurns) {
        this.keepRecentTurns = Math.max(1, keepRecentTurns);
    }

    public ToolResultConfig getToolResult() {
        return toolResult;
    }

    public void setToolResult(ToolResultConfig toolResult) {
        this.toolResult = toolResult;
    }

    public String getPolicy() {
        return policy;
    }

    public void setPolicy(String policy) {
        this.policy = policy;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ToolResultConfig {
        
        public static final String DEFAULT_TRUNCATE_STRATEGY = "tail";

        @JsonProperty("max_tokens")
        private int maxTokens = DEFAULT_TOOL_RESULT_MAX_TOKENS;

        @JsonProperty("truncate_strategy")
        private String truncateStrategy = DEFAULT_TRUNCATE_STRATEGY;

        public ToolResultConfig() {
        }

        public int getMaxTokens() {
            return maxTokens;
        }

        public void setMaxTokens(int maxTokens) {
            this.maxTokens = Math.max(100, maxTokens);
        }

        public String getTruncateStrategy() {
            return truncateStrategy;
        }

        public void setTruncateStrategy(String truncateStrategy) {
            this.truncateStrategy = truncateStrategy;
        }
    }

    @Override
    public String toString() {
        return "ContextConfig{" +
                "maxTokens=" + maxTokens +
                ", maxMessages=" + maxMessages +
                ", keepRecentTurns=" + keepRecentTurns +
                ", toolResult=" + toolResult +
                ", policy='" + policy + '\'' +
                '}';
    }
}