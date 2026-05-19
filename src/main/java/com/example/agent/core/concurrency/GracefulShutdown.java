package com.example.agent.core.concurrency;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class GracefulShutdown {

    private static final Logger logger = LoggerFactory.getLogger(GracefulShutdown.class);
    private static final List<ExecutorService> EXECUTORS = new ArrayList<>();
    private static final AtomicBoolean hookRegistered = new AtomicBoolean(false);

    private GracefulShutdown() {}

    public static void register(ExecutorService executor) {
        if (executor == null) {
            return;
        }
        synchronized (EXECUTORS) {
            EXECUTORS.add(executor);
        }
        registerHookIfNeeded();
    }

    private static void registerHookIfNeeded() {
        if (hookRegistered.compareAndSet(false, true)) {
            Runtime.getRuntime().addShutdownHook(
                    new Thread(GracefulShutdown::shutdownAll, "graceful-shutdown"));
            logger.debug("GracefulShutdown hook 已注册");
        }
    }

    private static void shutdownAll() {
        logger.info("GracefulShutdown: 正在关闭 {} 个线程池...", EXECUTORS.size());

        List<ExecutorService> snapshot;
        synchronized (EXECUTORS) {
            snapshot = new ArrayList<>(EXECUTORS);
        }

        for (ExecutorService executor : snapshot) {
            try {
                executor.shutdown();
            } catch (Exception e) {
                logger.warn("executor.shutdown() 失败: {}", e.getMessage());
            }
        }

        for (ExecutorService executor : snapshot) {
            try {
                if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                    logger.warn("线程池未在 5 秒内关闭，强制终止");
                    executor.shutdownNow();
                }
            } catch (InterruptedException e) {
                executor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }

        logger.info("GracefulShutdown: 所有线程池已关闭");
    }
}
