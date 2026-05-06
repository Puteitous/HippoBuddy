package com.example.agent.context.compressor;

import com.example.agent.console.ConsoleStyle;
import com.example.agent.context.ContextWindow;
import com.example.agent.context.SessionCompactionState;
import com.example.agent.context.budget.BudgetListener;
import com.example.agent.context.budget.BudgetThreshold;
import com.example.agent.logging.CompactionMetricsCollector;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.memory.SessionMemoryManager;
import com.example.agent.service.TokenEstimator;
import com.example.agent.session.SessionTranscript;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.function.Consumer;

public class AutoCompactTrigger implements BudgetListener {

    private static final Logger logger = LoggerFactory.getLogger(AutoCompactTrigger.class);

    private final ContextWindow contextWindow;
    private final ContextClipper clipper;
    private final ContextSummarizer summarizer;
    private final TokenEstimator tokenEstimator;
    private final SessionCompactionState state;
    private final SessionMemoryManager memoryManager;
    private final CompactionMetricsCollector metrics;
    private final String sessionId;
    private final SessionTranscript transcript;
    private boolean compactionPerformed;
    private boolean resumeWindowBuilt = false;
    private Consumer<List<Message>> compactionCompleteHook;

    public AutoCompactTrigger(ContextWindow contextWindow, TokenEstimator tokenEstimator, LlmClient llmClient) {
        this(contextWindow, tokenEstimator, llmClient, "default-session", new SessionTranscript("default-session"));
    }

    public AutoCompactTrigger(ContextWindow contextWindow, TokenEstimator tokenEstimator, LlmClient llmClient, String sessionId) {
        this(contextWindow, tokenEstimator, llmClient, sessionId, new SessionTranscript(sessionId));
    }

    public AutoCompactTrigger(
            ContextWindow contextWindow, 
            TokenEstimator tokenEstimator, 
            LlmClient llmClient, 
            String sessionId,
            SessionTranscript transcript) {
        this(contextWindow, tokenEstimator, llmClient, sessionId, transcript, new SessionCompactionState());
    }

    public AutoCompactTrigger(
            ContextWindow contextWindow, 
            TokenEstimator tokenEstimator, 
            LlmClient llmClient, 
            String sessionId,
            SessionTranscript transcript,
            SessionCompactionState state) {
        this.contextWindow = contextWindow;
        this.tokenEstimator = tokenEstimator;
        this.sessionId = sessionId;
        this.transcript = transcript;
        this.clipper = new ContextClipper(tokenEstimator, sessionId, llmClient);
        this.summarizer = new ContextSummarizer(tokenEstimator, llmClient, sessionId);
        this.memoryManager = new SessionMemoryManager(sessionId);
        this.metrics = new CompactionMetricsCollector();
        this.state = state;
        this.compactionPerformed = false;
    }

    public AutoCompactTrigger(
            ContextWindow contextWindow, 
            TokenEstimator tokenEstimator, 
            CompactForkExecutor forkExecutor,
            String sessionId,
            SessionTranscript transcript,
            SessionCompactionState state) {
        this.contextWindow = contextWindow;
        this.tokenEstimator = tokenEstimator;
        this.sessionId = sessionId;
        this.transcript = transcript;
        this.clipper = new ContextClipper(tokenEstimator, forkExecutor);
        this.summarizer = new ContextSummarizer(tokenEstimator, forkExecutor);
        this.memoryManager = new SessionMemoryManager(sessionId);
        this.metrics = new CompactionMetricsCollector();
        this.state = state;
        this.compactionPerformed = false;
    }

    @Override
    public void onThresholdReached(BudgetThreshold threshold, int currentTokens, int maxTokens) {
        logger.info("📊 收到阈值通知：threshold={}, currentTokens={}, maxTokens={}, ratio={:.2f}%", 
            threshold, currentTokens, maxTokens, (double) currentTokens / maxTokens * 100);
        
        if (isCompactionForkContext()) {
            logger.warn("🚫 检测到压缩 Fork 上下文，递归保护已触发，跳过压缩");
            metrics.recordEvent(
                CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_RECURSION_PROTECTED,
                "检测到压缩 Fork 上下文，递归保护已触发"
            );
            return;
        }
        
        if (threshold == BudgetThreshold.AUTO_COMPACT && !compactionPerformed && state.shouldTryCompaction()) {
            logger.info("🚀 触发 AUTO_COMPACT 压缩：currentTokens={}, maxTokens={}, ratio={:.2f}%", 
                currentTokens, maxTokens, (double) currentTokens / maxTokens * 100);
            performSmartCompaction(currentTokens, maxTokens);
            compactionPerformed = true;
        } else {
            logger.debug("不满足压缩条件：threshold={}, isAutoCompact={}, compactionPerformed={}, shouldTryCompaction={}", 
                threshold, threshold == BudgetThreshold.AUTO_COMPACT, compactionPerformed, state.shouldTryCompaction());
        }
    }
    
    private boolean isCompactionForkContext() {
        List<Message> messages = contextWindow.getRawMessages();
        if (messages.isEmpty()) {
            return false;
        }
        
        for (Message msg : messages) {
            if (msg.isUser() && msg.getContent() != null) {
                String content = msg.getContent();
                if (content.contains("query_source=compact") 
                    || content.contains("压缩模式特殊指令")
                    || content.contains("context=compaction")) {
                    return true;
                }
            }
        }
        
        return false;
    }

    private void performSmartCompaction(int currentTokens, int maxTokens) {
        logger.info("🔧 开始执行智能压缩：currentTokens={}, maxTokens={}, targetTokens={}", 
            currentTokens, maxTokens, (int) (BudgetThreshold.WARNING_75.getThresholdTokens(maxTokens) * 0.9));
        
        if (!state.shouldTryCompaction()) {
            logger.warn("🚫 断路器已熔断，跳过压缩：连续失败 {} 次", state.getConsecutiveFailures());
            metrics.recordEvent(
                CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_CIRCUIT_BREAKER,
                String.format("断路器已熔断: 连续失败 %d 次, 本会话不再尝试", state.getConsecutiveFailures())
            );
            return;
        }

        int targetTokens = (int) (BudgetThreshold.WARNING_75.getThresholdTokens(maxTokens) * 0.9);
        logger.info("🎯 压缩目标：targetTokens={} (75% 阈值的 90%)", targetTokens);

        List<Message> currentMessages = contextWindow.getRawMessages();
        logger.info("📋 当前消息数：{} 条", currentMessages.size());

        waitForSessionMemoryExtraction();

        if (state.canIncrementalCompact()) {
            logger.debug("尝试增量压缩...");
            ContextClipper.CompactionResult incremental = tryIncrementalCompact(
                currentMessages, targetTokens, maxTokens
            );
            if (incremental != null) {
                logger.info("✅ 增量压缩成功：移除 {} 轮，节省 {} tokens", 
                    incremental.getRemovedTurns(), incremental.getSavedTokens());
                applyResult(incremental, true);
                return;
            }
            logger.debug("增量压缩无效，尝试其他方法");
        }

        logger.debug("尝试滑动窗口截断...");
        ContextClipper.CompactionResult windowResult = tryClippingFirst(
            currentMessages, targetTokens, maxTokens
        );

        if (windowResult != null) {
            logger.info("✅ 滑动窗口截断成功：移除 {} 轮，节省 {} tokens", 
                windowResult.getRemovedTurns(), windowResult.getSavedTokens());
            applyResult(windowResult, false);
            return;
        }
        logger.debug("滑动窗口截断无效，准备使用 LLM 摘要");

        try {
            List<Message> compacted = summarizer.compact(currentMessages, targetTokens);
            contextWindow.clearInjectedWarnings();
            contextWindow.replaceMessages(compacted);
            state.recordCompaction();
            state.recordSuccess();

            writeBoundaryMarker(compacted);

            ContextSummarizer.CompactionResult llmResult = summarizer.getLastResult();
            injectSummarySuccess(llmResult, currentTokens, maxTokens);
            printSummarySuccessToConsole(llmResult, currentTokens, maxTokens);

            if (compactionCompleteHook != null) {
                compactionCompleteHook.accept(contextWindow.getRawMessages());
            }
        } catch (Exception e) {
            state.recordFailure();
            metrics.recordEvent(
                CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_ERROR,
                String.format("LLM 摘要压缩失败: %s, 连续失败 %d 次", 
                    e.getMessage(), state.getConsecutiveFailures())
            );
        }
    }

    private ContextClipper.CompactionResult tryIncrementalCompact(
            List<Message> messages, int targetTokens, int maxTokens) {
        return tryClippingFirst(messages, targetTokens, maxTokens);
    }

    private void waitForSessionMemoryExtraction() {
        long start = System.currentTimeMillis();
        long timeout = 15000;

        while (System.currentTimeMillis() - start < timeout) {
            long lastExtractTime = state.getLastExtractionTime();
            if (lastExtractTime > 0 && System.currentTimeMillis() - lastExtractTime > 1000) {
                break;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private ContextClipper.CompactionResult tryClippingFirst(
            List<Message> messages, int targetTokens, int maxTokens) {

        if (!shouldTryClippingFirst(messages)) {
            return null;
        }

        if (!memoryManager.exists()) {
            metrics.recordEvent(CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_NO_SESSION_MEMORY);
            return null;
        }

        if (!memoryManager.hasActualContent()) {
            metrics.recordEvent(CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_EMPTY_TEMPLATE);
            return null;
        }

        if (!state.hasValidSummaryBoundary()) {
            metrics.recordEvent(CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_SUMMARIZED_ID_NOT_FOUND);
            return null;
        }

        ContextClipper.BoundaryResult boundary = 
            clipper.findSummaryBoundaryWithValidation(messages, state);

        if (!boundary.isValid && "resumed_session".equals(boundary.reason)) {
            metrics.recordEvent(CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_RESUMED_SESSION,
                "边界ID在当前会话中不存在 → 恢复旧会话场景，优雅降级");
        }

        if ("tool_call_in_progress".equals(boundary.reason)) {
            metrics.recordEvent(CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_TOOL_CALL_IN_PROGRESS,
                "检测到未完成工具调用，冻结截断边界");
        }

        if ("resumed_session".equals(boundary.reason)) {
            metrics.recordEvent(CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_RESUMED_SESSION,
                "恢复会话模式：锚点ID不存在，从尾部向左重建窗口");
        }

        ContextClipper.CompactionResult result = clipper.compact(messages, targetTokens, state);

        int tokensAfter = tokenEstimator.estimateConversationTokens(result.getMessages());

        if (tokensAfter >= BudgetThreshold.SLIDING_WINDOW.getThresholdTokens(maxTokens)
            || !result.isWithinOptimalRange()) {
            metrics.recordEvent(CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_THRESHOLD_EXCEEDED,
                String.format("tokensAfter=%d, withinRange=%b", tokensAfter, result.isWithinOptimalRange()));
            return null;
        }

        metrics.recordEvent(CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_SUCCESS,
            String.format("removed=%d turns, saved=%d tokens", result.getRemovedTurns(), result.getSavedTokens()));

        return result;
    }

    public void setCompactionCompleteHook(Consumer<List<Message>> hook) {
        this.compactionCompleteHook = hook;
    }

    private void applyResult(ContextClipper.CompactionResult result, boolean incremental) {
        contextWindow.clearInjectedWarnings();
        contextWindow.replaceMessages(result.getMessages());
        state.recordCompaction();
        state.recordSuccess();

        writeBoundaryMarker(result.getMessages());

        injectClippingSuccess(result, incremental);

        if (compactionCompleteHook != null) {
            compactionCompleteHook.accept(contextWindow.getRawMessages());
        }
        printClippingSuccessToConsole(result, incremental);
    }

    private void printClippingSuccessToConsole(ContextClipper.CompactionResult result, boolean incremental) {
        System.out.println();
        System.out.println(ConsoleStyle.cyan("✅ " + (incremental ? "增量" : "") + "零成本裁剪完成（动态滑动窗口）"));
        System.out.println(ConsoleStyle.info("   算法：动态 token 范围（10K-40K），无 LLM 调用"));
        System.out.println(ConsoleStyle.info("   保留 " + (result.getTotalTurns() - result.getRemovedTurns()) + " / " + result.getTotalTurns() + " 个完整对话回合"));
        System.out.println(ConsoleStyle.info("   释放 " + result.getSavedTokens() + " tokens"));
        System.out.println();
    }

    private void writeBoundaryMarker(List<Message> messages) {
        if (messages.size() < 2) {
            return;
        }

        Message summaryMessage = null;
        for (int i = 1; i < messages.size(); i++) {
            Message msg = messages.get(i);
            if (msg.isSystem() && msg.getContent().contains("摘要")) {
                summaryMessage = msg;
                break;
            }
        }

        if (summaryMessage != null) {
            String boundaryUuid = summaryMessage.getId();
            transcript.appendCompactBoundary(boundaryUuid);
            state.recordMemoryExtraction(boundaryUuid);

            metrics.recordEvent(
                CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_BOUNDARY_PERSISTED,
                "压缩边界已持久化到 Transcript: " + boundaryUuid.substring(0, 8)
            );
        }
    }

    private boolean shouldTryClippingFirst(List<Message> messages) {
        long toolMessageCount = messages.stream().filter(Message::isTool).count();
        
        return toolMessageCount > 5
            && messages.size() > 20;
    }

    public CompactionMetricsCollector getMetrics() {
        return metrics;
    }

    private void injectClippingSuccess(ContextClipper.CompactionResult result, boolean incremental) {
        String content = String.format(
            "<system-reminder>\n" +
            "✅ %s零成本裁剪完成（动态滑动窗口）\n" +
            "• 算法：动态 token 范围（10K-40K），无 LLM 调用\n" +
            "• 保留 %d / %d 个完整对话回合\n" +
            "• 保留 %d 条含文本的推理消息\n" +
            "• 释放 %d tokens\n" +
            "• 状态：本次压缩 #%d\n" +
            "</system-reminder>",
            incremental ? "增量" : "",
            result.getTotalTurns() - result.getRemovedTurns(),
            result.getTotalTurns(),
            result.getPreservedTextBlocks(),
            result.getSavedTokens(),
            state.getCompactionCount()
        );
        contextWindow.injectWarning(Message.system(content));
    }

    private void injectSummarySuccess(ContextSummarizer.CompactionResult result, int beforeTokens, int maxTokens) {
        int savedTokens = beforeTokens - result.getTokenCountAfter();
        String content = String.format(
            "<system-reminder>\n" +
            "🔄 智能摘要压缩完成（第 %d 次压缩）\n" +
            "• 算法：LLM 结构化摘要\n" +
            "• 融合 %d 条早期历史为摘要\n" +
            "• 释放 %d tokens (节省 %.1f%%)\n" +
            "• 注：动态滑动窗口无效，已降级为深度压缩\n" +
            "</system-reminder>",
            state.getCompactionCount(),
            result.getMergedCount(),
            savedTokens,
            (double) savedTokens / beforeTokens * 100
        );
        contextWindow.injectWarning(Message.system(content));
    }

    private void printSummarySuccessToConsole(ContextSummarizer.CompactionResult result, int beforeTokens, int maxTokens) {
        int savedTokens = beforeTokens - result.getTokenCountAfter();
        double savedPercent = (double) savedTokens / beforeTokens * 100;
        System.out.println();
        System.out.println(ConsoleStyle.yellow("🔄 智能摘要压缩完成（第 " + state.getCompactionCount() + " 次压缩）"));
        System.out.println(ConsoleStyle.info("   算法：LLM 结构化摘要"));
        System.out.println(ConsoleStyle.info("   融合 " + result.getMergedCount() + " 条早期历史为摘要"));
        System.out.println(ConsoleStyle.info("   释放 " + savedTokens + " tokens (节省 " + String.format("%.1f", savedPercent) + "%)"));
        System.out.println(ConsoleStyle.gray("   注：动态滑动窗口无效，已降级为深度压缩"));
        System.out.println();
    }

    public void reset() {
        compactionPerformed = false;
        resumeWindowBuilt = false;
        state.reset();
    }

    public void fullReset() {
        reset();
        state.reset();
    }

    public void startNewQueryLoop() {
        compactionPerformed = false;
        state.startNewQueryLoop();
    }

    public void register() {
        contextWindow.getBudget().addListener(this);
    }

    public void unregister() {
        contextWindow.getBudget().removeListener(this);
    }

    public boolean isCompactionPerformed() {
        return compactionPerformed;
    }

    public SessionCompactionState getState() {
        return state;
    }

    public void ensureResumeWindowIfNeeded() {
        if (resumeWindowBuilt || !state.hasValidSummaryBoundary()) {
            return;
        }

        List<Message> messages = contextWindow.getRawMessages();
        ContextClipper.BoundaryResult boundary = 
            clipper.findSummaryBoundaryWithValidation(messages, state);

        if ("resumed_session".equals(boundary.reason)) {
            metrics.recordEvent(
                CompactionMetricsCollector.CompactionEvent.TENGU_SM_COMPACT_RESUMED_SESSION,
                "检测到恢复会话，立即强制构建滑动窗口"
            );

            int maxTokens = contextWindow.getBudget().getMaxTokens();
            int currentTokens = tokenEstimator.estimate(messages);
            performSmartCompaction(currentTokens, maxTokens);

            resumeWindowBuilt = true;
        }
    }
}
