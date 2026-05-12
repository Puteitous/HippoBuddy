package com.example.agent.web.util;

import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.web.logging.SessionLogger;
import com.example.agent.web.session.SessionTokenStats;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class TokenStatsResponseBuilder {

    public Map<String, Object> build(Conversation conversation, int maxTokens,
                                      SessionTokenStats stats,
                                      SessionLogger.SessionTokenStats legacyStats) {
        if (conversation == null) {
            return buildEmptyResponse(maxTokens);
        }

        int currentTokens;
        boolean hasKnownUsage = conversation.hasKnownUsage();

        if (hasKnownUsage) {
            currentTokens = conversation.getLastKnownTotalTokens();
        } else {
            List<Message> fullContext = conversation.getMessages();
            int messageTokens = TokenEstimatorFactory.getDefault().estimateConversationTokens(fullContext);
            currentTokens = messageTokens + 2400;
        }

        double usageRatio = currentTokens * 100.0 / maxTokens;

        Map<String, Object> response = new HashMap<>();
        response.put("currentTokens", currentTokens);
        response.put("maxTokens", maxTokens);
        response.put("usagePercent", Math.round(usageRatio * 10.0) / 10.0);
        response.put("messageCount", conversation.getMessages().size());
        response.put("hasKnownUsage", hasKnownUsage);

        if (hasKnownUsage) {
            var usage = conversation.getLastKnownUsage();
            response.put("promptTokens", usage.getPromptTokens());
            response.put("completionTokens", usage.getCompletionTokens());
            response.put("totalTokens", conversation.getLastKnownTotalTokens());
            response.put("cacheHitTokens", usage.getCacheReadInputTokens());
            response.put("cacheHitRate", Math.round(usage.getCacheHitRate() * 10.0) / 10.0);
        }

        if (stats != null) {
            response.put("sessionTotalInput", stats.totalInputTokens);
            response.put("sessionTotalOutput", stats.totalOutputTokens);
            response.put("sessionTotalTokens", stats.totalTokens);
            response.put("sessionLlmCalls", stats.llmCalls);
            response.put("sessionToolCalls", stats.toolCalls);
            response.put("sessionCacheHitTokens", stats.totalCacheHitTokens);
            response.put("sessionCacheHitRate", Math.round(stats.getSessionCacheHitRate() * 10.0) / 10.0);
        } else if (legacyStats != null) {
            response.put("sessionTotalInput", legacyStats.totalInputTokens);
            response.put("sessionTotalOutput", legacyStats.totalOutputTokens);
            response.put("sessionTotalTokens", legacyStats.totalTokens);
            response.put("sessionLlmCalls", legacyStats.llmCalls);
            response.put("sessionToolCalls", legacyStats.toolCalls);
        }

        return response;
    }

    private static Map<String, Object> buildEmptyResponse(int maxTokens) {
        Map<String, Object> response = new HashMap<>();
        response.put("currentTokens", 0);
        response.put("maxTokens", maxTokens);
        response.put("usagePercent", 0.0);
        response.put("messageCount", 0);
        response.put("hasKnownUsage", false);
        response.put("sessionTotalInput", 0);
        response.put("sessionTotalOutput", 0);
        response.put("sessionTotalTokens", 0);
        response.put("sessionLlmCalls", 0);
        response.put("sessionToolCalls", 0);
        response.put("cacheHitTokens", 0);
        response.put("cacheHitRate", 0.0);
        return response;
    }
}
