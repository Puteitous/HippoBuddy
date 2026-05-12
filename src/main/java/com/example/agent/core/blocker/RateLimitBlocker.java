package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class RateLimitBlocker implements Blocker {

    private static final Duration DEFAULT_WINDOW = Duration.ofMinutes(1);
    private static final int DEFAULT_MAX_CALLS_PER_WINDOW = 30;

    private final Duration window;
    private final int maxCallsPerWindow;

    private final Map<String, RateLimiterWindow> limiters = new ConcurrentHashMap<>();

    public RateLimitBlocker() {
        this(DEFAULT_WINDOW, DEFAULT_MAX_CALLS_PER_WINDOW);
    }

    public RateLimitBlocker(Duration window, int maxCallsPerWindow) {
        this.window = window;
        this.maxCallsPerWindow = maxCallsPerWindow;
    }

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        RateLimiterWindow limiter = limiters.computeIfAbsent(toolName,
                k -> new RateLimiterWindow(window));

        if (!limiter.tryAcquire(maxCallsPerWindow)) {
            return HookResult.validationError(
                String.format("工具调用过于频繁: %s（每分钟上限 %d 次）", toolName, maxCallsPerWindow),
                "请等待一段时间后再试，或减少不必要的重复调用"
            );
        }

        return HookResult.allow();
    }

    public void reset() {
        limiters.clear();
    }

    public int getCurrentCallCount(String toolName) {
        RateLimiterWindow limiter = limiters.get(toolName);
        return limiter != null ? limiter.getCount() : 0;
    }

    private static class RateLimiterWindow {
        private final Duration window;
        private final AtomicInteger count = new AtomicInteger(0);
        private final AtomicLong windowStart = new AtomicLong(System.currentTimeMillis());

        RateLimiterWindow(Duration window) {
            this.window = window;
        }

        synchronized boolean tryAcquire(int maxCalls) {
            long now = System.currentTimeMillis();
            long windowStartMs = windowStart.get();

            if (now - windowStartMs > window.toMillis()) {
                count.set(0);
                windowStart.set(now);
            }

            if (count.incrementAndGet() > maxCalls) {
                count.decrementAndGet();
                return false;
            }

            return true;
        }

        int getCount() {
            long now = System.currentTimeMillis();
            if (now - windowStart.get() > window.toMillis()) {
                return 0;
            }
            return count.get();
        }
    }
}
