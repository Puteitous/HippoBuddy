package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

public class DuplicateToolCallBlocker implements Blocker {

    private static final Logger logger = LoggerFactory.getLogger(DuplicateToolCallBlocker.class);

    private static final int DEFAULT_WINDOW_SIZE = 5;
    private static final int DEFAULT_MAX_ALLOWED_DUPLICATION = 2;

    private static final Map<String, Integer> TOOL_THRESHOLDS = Map.of(
        "read_file", 3,
        "list_directory", 3
    );

    private static final Set<String> SELF_PROTECTED_TOOLS = Set.of(
        "read_file",
        "list_directory"
    );

    private final Map<String, Integer> recentCalls = new ConcurrentHashMap<>();
    private final Queue<String> callHistory = new ConcurrentLinkedQueue<>();
    private final int windowSize;
    private final ObjectMapper sortedMapper = new ObjectMapper()
        .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);

    public DuplicateToolCallBlocker() {
        this(DEFAULT_WINDOW_SIZE);
    }

    public DuplicateToolCallBlocker(int windowSize) {
        this.windowSize = windowSize;
    }

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        if (toolName == null || arguments == null) {
            return HookResult.allow();
        }

        String signature = buildCallSignature(toolName, arguments);
        int maxAllowed = getMaxAllowedForTool(toolName);
        int count = recentCalls.getOrDefault(signature, 0);

        if (count == 0) {
            recentCalls.put(signature, 1);
            callHistory.offer(signature);
            pruneHistory();
            return HookResult.allow();
        }

        if (count < maxAllowed) {
            logger.warn("检测到重复工具调用: {} (第{}次)", signature, count + 1);
            recentCalls.put(signature, count + 1);
            return HookResult.allow();
        }

        logger.error("阻止重复工具调用: {} (第{}次)", signature, count + 1);
        return HookResult.validationError(
            String.format(
                "重复工具调用: %s 已调用 %d 次（上限 %d 次）",
                toolName, count + 1, maxAllowed
            ),
            "请使用之前的结果，或提供不同的参数调用其他工具"
        );
    }

    public void onTurnComplete() {
        recentCalls.clear();
        callHistory.clear();
    }

    public void reset() {
        recentCalls.clear();
        callHistory.clear();
        logger.info("重置重复调用拦截器状态");
    }

    public int getActiveCallCount() {
        return recentCalls.size();
    }

    private void pruneHistory() {
        while (callHistory.size() > windowSize) {
            String oldest = callHistory.poll();
            if (oldest != null) {
                recentCalls.computeIfPresent(oldest, (k, v) -> v > 1 ? v - 1 : null);
            }
        }
    }

    private String buildCallSignature(String toolName, JsonNode arguments) {
        try {
            String normalized = sortedMapper.writeValueAsString(arguments);
            return toolName + ":" + normalized;
        } catch (Exception e) {
            logger.warn("参数规范化失败，降级使用原始签名", e);
            return toolName + ":" + arguments.toString();
        }
    }

    private int getMaxAllowedForTool(String toolName) {
        return TOOL_THRESHOLDS.getOrDefault(toolName, DEFAULT_MAX_ALLOWED_DUPLICATION);
    }
}
