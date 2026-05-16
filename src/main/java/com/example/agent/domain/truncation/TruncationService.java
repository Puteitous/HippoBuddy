package com.example.agent.domain.truncation;

import com.example.agent.domain.truncation.strategy.CodeTruncation;
import com.example.agent.domain.truncation.strategy.DiffTruncation;
import com.example.agent.domain.truncation.strategy.HeadTailTruncation;
import com.example.agent.domain.truncation.strategy.ListTruncation;
import com.example.agent.domain.truncation.strategy.LogTruncation;
import com.example.agent.domain.truncation.strategy.TreeTruncation;
import com.example.agent.service.TokenEstimator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;

public class TruncationService {

    private static final Logger logger = LoggerFactory.getLogger(TruncationService.class);
    public static final int GLOBAL_HARD_LIMIT = 4096;
    public static final int PER_TOOL_SAFE_LIMIT = 2048;

    private final TokenEstimator tokenEstimator;
    private final Map<ContentType, TruncationStrategy> strategies;
    private final TruncationStrategy defaultStrategy;

    public TruncationService(TokenEstimator tokenEstimator) {
        this.tokenEstimator = tokenEstimator;
        this.strategies = new HashMap<>();
        this.defaultStrategy = new CodeTruncation(tokenEstimator);
        registerStrategy(ContentType.CODE, new CodeTruncation(tokenEstimator));
        registerStrategy(ContentType.LOG, new LogTruncation(tokenEstimator));
        registerStrategy(ContentType.DIFF, new DiffTruncation(tokenEstimator));
        registerStrategy(ContentType.LIST, new ListTruncation(tokenEstimator));
        registerStrategy(ContentType.TREE, new TreeTruncation(tokenEstimator));
        registerStrategy(ContentType.PLAIN_TEXT, new HeadTailTruncation(tokenEstimator));
    }

    public void registerStrategy(ContentType type, TruncationStrategy strategy) {
        strategies.put(type, strategy);
        logger.debug("注册截断策略: {} -> {}", type, strategy.getClass().getSimpleName());
    }

    public String truncate(String content, ContentType type, int maxTokens) {
        if (content == null || content.isEmpty()) {
            return content;
        }
        int effectiveMax = Math.max(1, Math.min(maxTokens, GLOBAL_HARD_LIMIT));
        int originalTokens = tokenEstimator.estimateTextTokens(content);
        if (originalTokens <= effectiveMax) {
            return content;
        }
        TruncationStrategy strategy = strategies.getOrDefault(type, defaultStrategy);
        String result = strategy.truncate(content, effectiveMax);
        logger.debug("截断完成: 类型={}, 策略={}, 原={}tokens, 目标={}tokens",
                type,
                strategy.getClass().getSimpleName(),
                originalTokens,
                effectiveMax);
        return result;
    }

    public String truncateToolOutput(String toolName, String content) {
        return truncateToolOutput(toolName, content, PER_TOOL_SAFE_LIMIT);
    }

    public String truncateToolOutput(String toolName, String content, int maxTokens) {
        if (content == null || content.isEmpty()) {
            return content;
        }

        if ("read_file".equals(toolName)) {
            return content;
        }

        boolean alreadyTruncated = content.contains("输出过长，已截断");

        int effectiveMax = Math.max(1, Math.min(maxTokens, GLOBAL_HARD_LIMIT));
        int originalTokens = tokenEstimator.estimateTextTokens(content);
        if (originalTokens <= effectiveMax) {
            return content;
        }
        ContentType type = ContentClassifier.detect(toolName, content);
        if (alreadyTruncated) {
            logger.warn("工具输出已被上游截断，但 token 仍超限，继续下游截断: tool={}, 类型={}, 原={}tokens, 限制={}",
                    toolName, type, originalTokens, effectiveMax);
        } else {
            logger.warn("工具输出超限，自动截断: tool={}, 类型={}, 原={}tokens, 限制={}",
                    toolName, type, originalTokens, effectiveMax);
        }
        return forceTruncate(content, type, effectiveMax);
    }

    public String forceTruncate(String content, ContentType type, int maxTokens) {
        if (maxTokens <= 0) {
            return content.substring(0, Math.min(content.length(), 100)) + "\n... [强制截断] ...";
        }

        String result = truncate(content, type, maxTokens);
        int tokens = tokenEstimator.estimateTextTokens(result);
        int iteration = 0;
        final int maxIterations = 5;
        final String truncateMarker = "\n... [强制截断] ...";

        while (tokens > maxTokens && result.length() > 100 && iteration < maxIterations) {
            int cutIndex = result.length() * 70 / 100;
            int markerPos = result.lastIndexOf(truncateMarker);
            if (markerPos > 0) {
                result = result.substring(0, markerPos);
            }
            result = result.substring(0, cutIndex) + truncateMarker;
            tokens = tokenEstimator.estimateTextTokens(result);
            iteration++;
        }

        if (tokens > maxTokens) {
            int safeLength = Math.max(50, maxTokens * 2);
            if (result.length() > safeLength) {
                result = result.substring(0, safeLength) + truncateMarker;
            }
        }

        return result;
    }

}
