package com.example.agent.web.server;

import com.example.agent.config.Config;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.application.ConversationService;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.web.logging.SessionLogger;
import com.example.agent.web.session.SessionTokenStats;
import com.example.agent.web.session.WebSessionManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

public final class WebInitializer {

    private static final Logger logger = LoggerFactory.getLogger(WebInitializer.class);
    private static volatile boolean memoryInitialized = false;
    private static volatile boolean tokenCacheInitialized = false;

    private WebInitializer() {
    }

    public static void ensureMemoryInitialized() {
        if (memoryInitialized) {
            return;
        }
        synchronized (WebInitializer.class) {
            if (memoryInitialized) {
                return;
            }
            try {
                ServiceLocator.get(com.example.agent.memory.MemoryRetriever.class);
                memoryInitialized = true;
                logger.info("Web 端 Memory 模块已就绪（由 CLI 初始化）");
            } catch (Exception e) {
                logger.info("Web 端独立启动，初始化 Memory 模块...");
                try {
                    Config config = Config.getInstance();
                    Path memoryRoot = WorkspaceManager.getUserMemoryDir();
                    com.example.agent.memory.MemoryModule.initialize(config, memoryRoot);

                    if (ServiceLocator.getOrNull(ConversationService.class) == null) {
                        logger.info("DI 容器中未找到 ConversationService，创建新实例...");
                        var tokenEstimator = TokenEstimatorFactory.getDefault();
                        var llmClient = ServiceLocator.get(LlmClient.class);
                        ConversationService conversationService = new ConversationService(
                            tokenEstimator,
                            llmClient,
                            config.getContext()
                        );
                        ServiceLocator.registerSingleton(ConversationService.class, conversationService);
                        logger.info("ConversationService 已创建并注册到 DI 容器");
                    }

                    memoryInitialized = true;
                    logger.info("Web 端 Memory 模块初始化完成");
                } catch (Exception initEx) {
                    logger.error("Web 端 Memory 模块初始化失败", initEx);
                }
            }
        }
    }

    public static void initializeTokenCache(WebSessionManager sessionManager) {
        if (tokenCacheInitialized) {
            return;
        }
        synchronized (WebInitializer.class) {
            if (tokenCacheInitialized) {
                return;
            }
            try {
                Path logsDir = Paths.get(System.getProperty("user.dir"), ".hippo", "logs", "conversations");
                if (!Files.exists(logsDir)) {
                    tokenCacheInitialized = true;
                    return;
                }

                Map<String, SessionTokenStats> preloaded = new HashMap<>();

                try (var stream = Files.list(logsDir)) {
                    var recentFiles = stream
                        .filter(p -> p.toString().endsWith(".log"))
                        .sorted((a, b) -> {
                            try {
                                return Long.compare(
                                    Files.getLastModifiedTime(b).toMillis(),
                                    Files.getLastModifiedTime(a).toMillis()
                                );
                            } catch (Exception e) {
                                return 0;
                            }
                        })
                        .limit(100)
                        .toList();

                    for (Path logFile : recentFiles) {
                        try {
                            String fileName = logFile.getFileName().toString();
                            String id = fileName.replace(".log", "");

                            var stats = SessionLogger.getTokenStats(id);
                            if (stats != null && stats.totalTokens > 0) {
                                SessionTokenStats cachedStats = new SessionTokenStats();
                                cachedStats.totalInputTokens = stats.totalInputTokens;
                                cachedStats.totalOutputTokens = stats.totalOutputTokens;
                                cachedStats.totalTokens = stats.totalTokens;
                                cachedStats.llmCalls = stats.llmCalls;
                                cachedStats.toolCalls = stats.toolCalls;
                                preloaded.put(id, cachedStats);
                            }
                        } catch (Exception e) {
                        }
                    }
                }

                sessionManager.loadTokenCache(preloaded);
                logger.info("初始化会话 Token 缓存完成，共加载 {} 个会话", preloaded.size());
            } catch (Exception e) {
                logger.warn("初始化会话 Token 缓存失败", e);
            } finally {
                tokenCacheInitialized = true;
            }
        }
    }
}
