package com.example.agent.web.server;

import com.example.agent.config.Config;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.application.ConversationService;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.web.session.WebSessionManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

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
        tokenCacheInitialized = true;
    }
}
