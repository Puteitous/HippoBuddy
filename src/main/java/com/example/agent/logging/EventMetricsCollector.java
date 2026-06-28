package com.example.agent.logging;

import com.example.agent.core.event.EventBus;
import com.example.agent.core.event.LlmRequestEvent;
import com.example.agent.core.event.MessageEvent;
import com.example.agent.core.event.ToolExecutedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDate;
import java.util.LongSummaryStatistics;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class EventMetricsCollector {
    private static final Logger logger = LoggerFactory.getLogger(EventMetricsCollector.class);
    private static final int MAX_ERROR_HISTORY_PER_TOOL = 5;

    private final AtomicInteger totalToolCalls = new AtomicInteger(0);
    private final AtomicInteger successfulToolCalls = new AtomicInteger(0);
    private final AtomicInteger failedToolCalls = new AtomicInteger(0);
    private final ConcurrentHashMap<String, AtomicInteger> toolUsage = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, LongSummaryStatistics> toolLatency = new ConcurrentHashMap<>();

    // JSON 解析错误专用指标
    private final ConcurrentHashMap<String, AtomicInteger> jsonParseErrorsByTool = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> lastJsonParseErrorDetail = new ConcurrentHashMap<>();
    // 记录完整错误历史（环形缓冲），用于检测反复出现的问题
    private final ConcurrentHashMap<String, java.util.LinkedList<String>> jsonParseErrorHistory = new ConcurrentHashMap<>();
    // 检测重复错误：同一工具在会话中 JSON 解析失败 >= 2 次即视为"反复出现"
    private final AtomicInteger repeatedParseErrorCount = new AtomicInteger(0);
    // 重试恢复跟踪：记录哪些工具有过 JSON 解析失败
    private final ConcurrentHashMap.KeySetView<String, Boolean> toolsWithJsonParseError = ConcurrentHashMap.newKeySet();
    // 重试恢复后成功次数
    private final AtomicInteger rePromptRecoveryCount = new AtomicInteger(0);

    private final AtomicInteger totalLlmRequests = new AtomicInteger(0);
    private final AtomicLong totalPromptTokens = new AtomicLong(0);
    private final AtomicLong totalCompletionTokens = new AtomicLong(0);

    private final LocalDate date;

    public EventMetricsCollector(LocalDate date) {
        this.date = date;
        registerSubscribers();
        logger.info("事件驱动指标收集器已初始化 ✅");
    }

    private void registerSubscribers() {
        EventBus.subscribe(ToolExecutedEvent.class, this::onToolExecuted);
        EventBus.subscribe(LlmRequestEvent.class, this::onLlmRequest);
        EventBus.subscribe(MessageEvent.class, this::onMessage);
    }

    private void onToolExecuted(ToolExecutedEvent event) {
        totalToolCalls.incrementAndGet();
        if (event.success()) {
            successfulToolCalls.incrementAndGet();
            // 如果该工具有过 JSON 解析失败记录，这次成功算一次 re-prompt 恢复
            if (toolsWithJsonParseError.contains(event.toolName())) {
                rePromptRecoveryCount.incrementAndGet();
            }
        } else {
            failedToolCalls.incrementAndGet();

            // 分类：判断是否是 JSON 解析错误
            if (isJsonParseError(event.errorMessage())) {
                recordJsonParseError(event);
            }
        }

        toolUsage.computeIfAbsent(event.toolName(), k -> new AtomicInteger(0)).incrementAndGet();
        toolLatency.computeIfAbsent(event.toolName(), k -> new LongSummaryStatistics())
                .accept(event.durationMs());
    }

    /**
     * 判断错误消息是否为 JSON 解析错误（匹配 ToolArgumentParser 的错误前缀）。
     */
    private boolean isJsonParseError(String errorMessage) {
        return errorMessage != null && errorMessage.contains("JSON 解析失败");
    }

    /**
     * 记录 JSON 解析错误的详细信息。
     */
    private void recordJsonParseError(ToolExecutedEvent event) {
        String tool = event.toolName();
        String errorMsg = event.errorMessage();

        // 1. 按工具计数
        jsonParseErrorsByTool.computeIfAbsent(tool, k -> new AtomicInteger(0)).incrementAndGet();

        // 2. 记录最近一次错误详情
        int count = jsonParseErrorsByTool.get(tool).get();
        lastJsonParseErrorDetail.put(tool, String.format("[第 %d 次] %s", count, errorMsg));

        // 3. 环形缓冲保留最近 N 条历史
        jsonParseErrorHistory.computeIfAbsent(tool, k -> new java.util.LinkedList<>() {{
            add(errorMsg);
        }});
        java.util.LinkedList<String> history = jsonParseErrorHistory.get(tool);
        synchronized (history) {
            history.add(errorMsg);
            if (history.size() > MAX_ERROR_HISTORY_PER_TOOL) {
                history.removeFirst();
            }
        }

        // 4. 标记该工具有过 JSON 解析失败（用于重试恢复统计）
        toolsWithJsonParseError.add(tool);

        // 5. 如果同一工具 >= 2 次，计为"反复出现"
        if (count >= 2) {
            repeatedParseErrorCount.incrementAndGet();
        }
    }

    private void onLlmRequest(LlmRequestEvent event) {
        totalLlmRequests.incrementAndGet();
        totalPromptTokens.addAndGet(event.promptTokens());
        totalCompletionTokens.addAndGet(event.completionTokens());
    }

    private void onMessage(MessageEvent event) {
    }

    public String getSummary() {
        long totalTokens = totalPromptTokens.get() + totalCompletionTokens.get();
        int successRate = totalToolCalls.get() > 0
                ? (int) (successfulToolCalls.get() * 100.0 / totalToolCalls.get())
                : 0;

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("""
                
                === 📊 会话统计 ===
                工具调用: %d 次 (成功率 %d%%)
                  - 成功: %d, 失败: %d
                  - 最常用: %s
                """,
                totalToolCalls.get(),
                successRate,
                successfulToolCalls.get(),
                failedToolCalls.get(),
                getMostUsedTool()));

        int totalJsonErrors = getTotalJsonParseErrors();
        int repeated = getRepeatedParseErrorCount();
        if (totalJsonErrors > 0) {
            int recovery = getRePromptRecoveryCount();
            int recoveryRate = recovery > 0 ? (int) (recovery * 100.0 / totalJsonErrors) : 0;
            sb.append(String.format("""
                  - JSON 解析错误: %d 次 (涉及 %d 个工具)
                  - 反复出现: %d 次
                  - Re-prompt 恢复: %d / %d (%d%%)
                """,
                totalJsonErrors,
                getToolsWithJsonParseErrorCount(),
                repeated,
                recovery, totalJsonErrors, recoveryRate
            ));
        }

        sb.append(String.format("""
                LLM 请求: %d 次
                  - 总 Token: %d (Prompt: %d, Completion: %d)
                """,
                totalLlmRequests.get(),
                totalTokens,
                totalPromptTokens.get(),
                totalCompletionTokens.get()
        ));
        return sb.toString();
    }

    public int getTotalToolCalls() { return totalToolCalls.get(); }
    public int getSuccessfulToolCalls() { return successfulToolCalls.get(); }
    public int getFailedToolCalls() { return failedToolCalls.get(); }
    public Map<String, AtomicInteger> getToolUsage() { return toolUsage; }
    public Map<String, LongSummaryStatistics> getToolLatency() { return toolLatency; }
    public int getTotalLlmRequests() { return totalLlmRequests.get(); }

    // === JSON 解析错误指标 ===

    public int getTotalJsonParseErrors() {
        return jsonParseErrorsByTool.values().stream().mapToInt(AtomicInteger::get).sum();
    }

    public Map<String, AtomicInteger> getJsonParseErrorsByTool() { return jsonParseErrorsByTool; }

    public Map<String, String> getLastJsonParseErrorDetail() { return lastJsonParseErrorDetail; }

    public Map<String, java.util.LinkedList<String>> getJsonParseErrorHistory() { return jsonParseErrorHistory; }

    /** 同一工具反复出现 JSON 解析错误的次数（累计，不是去重工具数）。 */
    public int getRepeatedParseErrorCount() { return repeatedParseErrorCount.get(); }

    /** 有 JSON 解析失败的工具有多少个。 */
    public int getToolsWithJsonParseErrorCount() { return toolsWithJsonParseError.size(); }

    /** JSON 解析失败后，通过 re-prompt 恢复成功的次数。 */
    public int getRePromptRecoveryCount() { return rePromptRecoveryCount.get(); }

    private String getMostUsedTool() {
        return toolUsage.entrySet().stream()
                .max(java.util.Map.Entry.comparingByValue(
                        java.util.Comparator.comparingInt(AtomicInteger::get)))
                .map(e -> e.getKey() + " (" + e.getValue().get() + "次)")
                .orElse("无");
    }
}