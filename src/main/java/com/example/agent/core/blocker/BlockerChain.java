package com.example.agent.core.blocker;

import com.example.agent.core.concurrency.GracefulShutdown;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public class BlockerChain implements Blocker {

    private static final Logger logger = LoggerFactory.getLogger(BlockerChain.class);
    private static final long SLOW_BLOCKER_THRESHOLD_MS = 10;
    private static final long SLOW_CHAIN_THRESHOLD_MS = 50;
    private static final long STATS_LOG_INTERVAL_MINUTES = 10;

    private static final AtomicLong totalChecks = new AtomicLong(0);
    private static final AtomicLong slowBlockerCount = new AtomicLong(0);
    private static final AtomicLong slowChainCount = new AtomicLong(0);
    private static final AtomicLong blockedCount = new AtomicLong(0);
    private static final Map<String, AtomicLong> toolBlockCounts = new ConcurrentHashMap<>();
    private static final Map<String, AtomicLong> toolCheckCounts = new ConcurrentHashMap<>();
    private static final Map<String, SlowOperationSample> slowOperationSamples = new ConcurrentHashMap<>();

    private static final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "BlockerChain-StatsLogger");
        t.setDaemon(true);
        return t;
    });

    private static final AtomicBoolean statsLoggerStarted = new AtomicBoolean(false);

    static {
        startStatsLoggerIfNeeded();
    }

    private static void startStatsLoggerIfNeeded() {
        if (statsLoggerStarted.compareAndSet(false, true)) {
            scheduler.scheduleAtFixedRate(
                BlockerChain::logPeriodicStats,
                STATS_LOG_INTERVAL_MINUTES,
                STATS_LOG_INTERVAL_MINUTES,
                TimeUnit.MINUTES
            );
            GracefulShutdown.register(scheduler);
            logger.info("BlockerChain 定时统计已启动（每 {} 分钟）", STATS_LOG_INTERVAL_MINUTES);
        }
    }

    private final List<Blocker> blockers = new ArrayList<>();

    public BlockerChain add(Blocker blocker) {
        blockers.add(blocker);
        return this;
    }

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        totalChecks.incrementAndGet();
        
        if (toolName != null) {
            toolCheckCounts.computeIfAbsent(toolName, k -> new AtomicLong(0)).incrementAndGet();
        }
        
        long chainStart = System.nanoTime();
        HookResult lastWarning = null;
        
        for (Blocker blocker : blockers) {
            long blockerStart = System.nanoTime();
            HookResult result = Objects.requireNonNull(
                blocker.check(toolName, arguments),
                "Blocker " + blocker.getClass().getSimpleName() + " returned null"
            );
            long blockerTimeMs = (System.nanoTime() - blockerStart) / 1_000_000;
            
            if (blockerTimeMs > SLOW_BLOCKER_THRESHOLD_MS) {
                slowBlockerCount.incrementAndGet();
                recordSlowOperationSample(blocker.getClass().getSimpleName(), toolName, arguments, blockerTimeMs);
                if (logger.isWarnEnabled()) {
                    logger.warn("Blocker {} 耗时异常：{}ms (阈值：{}ms) [tool={}, 累计慢 {} 次]", 
                        blocker.getClass().getSimpleName(), 
                        blockerTimeMs, 
                        SLOW_BLOCKER_THRESHOLD_MS,
                        toolName,
                        slowBlockerCount.get());
                }
            }
            
            if (result.isWarning()) {
                logger.info("BLOCKER WARN from {} for tool={}: {}", 
                    blocker.getClass().getSimpleName(), toolName, result.getReason());
                lastWarning = result;
                continue;
            }
            
            if (!result.isAllowed()) {
                long totalMs = (System.nanoTime() - chainStart) / 1_000_000;
                long currentBlocked = blockedCount.incrementAndGet();
                if (toolName != null) {
                    toolBlockCounts.computeIfAbsent(toolName, k -> new AtomicLong(0)).incrementAndGet();
                }
                
                String argsSummary = arguments != null ? arguments.toString().substring(0, Math.min(100, arguments.toString().length())) : "null";
                logger.info("BLOCKED by {} for tool={}, args={}, totalChainTime={}ms [累计拦截 {} 次]", 
                    blocker.getClass().getSimpleName(), 
                    toolName,
                    argsSummary,
                    totalMs,
                    currentBlocked);
                return result;
            }
        }
        
        if (lastWarning != null) {
            return lastWarning;
        }
        
        long totalMs = (System.nanoTime() - chainStart) / 1_000_000;
        if (totalMs > SLOW_CHAIN_THRESHOLD_MS) {
            slowChainCount.incrementAndGet();
            if (logger.isWarnEnabled()) {
                logger.warn("BlockerChain 总耗时 {}ms (阈值：{}ms) [tool={}, 累计慢 {} 次]，考虑优化", 
                    totalMs, SLOW_CHAIN_THRESHOLD_MS, toolName, slowChainCount.get());
            }
        }
        
        return HookResult.allow();
    }

    private static void recordSlowOperationSample(String blockerName, String toolName, JsonNode arguments, long elapsedMs) {
        String key = blockerName + ":" + toolName;
        SlowOperationSample existing = slowOperationSamples.get(key);
        if (existing == null || elapsedMs > existing.elapsedMs) {
            slowOperationSamples.put(key, new SlowOperationSample(
                blockerName,
                toolName,
                arguments != null ? arguments.toString() : "null",
                elapsedMs,
                System.currentTimeMillis()
            ));
        }
    }

    private static void logPeriodicStats() {
        long total = totalChecks.get();
        long blocked = blockedCount.get();
        double blockRate = total > 0 ? (double) blocked / total * 100 : 0;
        long slowBlockers = slowBlockerCount.get();
        long slowChains = slowChainCount.get();

        logger.info("[BlockerStats] totalChecks={}, blocked={} ({}%), slowBlockers={}, slowChains={}",
            total, blocked, String.format("%.2f", blockRate), slowBlockers, slowChains);

        if (!toolBlockCounts.isEmpty()) {
            logger.info("[BlockerStats] 工具拦截排名:");
            toolBlockCounts.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().get(), a.getValue().get()))
                .limit(5)
                .forEach(entry -> {
                    String toolName = entry.getKey();
                    long blockCount = entry.getValue().get();
                    long checkCount = toolCheckCounts.getOrDefault(toolName, new AtomicLong(0)).get();
                    double rate = checkCount > 0 ? (double) blockCount / checkCount * 100 : 0;
                    logger.info("  - {}: 拦截 {}/{} ({}%)", toolName, blockCount, checkCount, String.format("%.2f", rate));
                });
        }

        if (!slowOperationSamples.isEmpty()) {
            logger.info("[BlockerStats] 慢操作采样 (最近 {} 条):", slowOperationSamples.size());
            slowOperationSamples.values().stream()
                .sorted((a, b) -> Long.compare(b.elapsedMs, a.elapsedMs))
                .limit(5)
                .forEach(sample -> {
                    logger.info("  - {}:{} 耗时 {}ms, 参数={}",
                        sample.blockerName, sample.toolName, sample.elapsedMs,
                        sample.arguments.substring(0, Math.min(80, sample.arguments.length())));
                });
        }
    }

    private static class SlowOperationSample {
        final String blockerName;
        final String toolName;
        final String arguments;
        final long elapsedMs;
        final long timestamp;

        SlowOperationSample(String blockerName, String toolName, String arguments, long elapsedMs, long timestamp) {
            this.blockerName = blockerName;
            this.toolName = toolName;
            this.arguments = arguments;
            this.elapsedMs = elapsedMs;
            this.timestamp = timestamp;
        }
    }

    public void onTurnComplete() {
    }

    public List<Blocker> getBlockers() {
        return new ArrayList<>(blockers);
    }

    public static long getSlowBlockerCount() {
        return slowBlockerCount.get();
    }

    public static long getSlowChainCount() {
        return slowChainCount.get();
    }

    public static long getBlockedCount() {
        return blockedCount.get();
    }

    public static long getTotalChecks() {
        return totalChecks.get();
    }

    public static Map<String, Long> getToolBlockCounts() {
        return toolBlockCounts.entrySet().stream()
            .collect(java.util.stream.Collectors.toMap(
                Map.Entry::getKey,
                e -> e.getValue().get()
            ));
    }

    public static Map<String, Long> getToolCheckCounts() {
        return toolCheckCounts.entrySet().stream()
            .collect(java.util.stream.Collectors.toMap(
                Map.Entry::getKey,
                e -> e.getValue().get()
            ));
    }

    public static void resetMetrics() {
        slowBlockerCount.set(0);
        slowChainCount.set(0);
        blockedCount.set(0);
        totalChecks.set(0);
        toolBlockCounts.clear();
        toolCheckCounts.clear();
        slowOperationSamples.clear();
        logger.info("BlockerChain 指标已重置");
    }
}
