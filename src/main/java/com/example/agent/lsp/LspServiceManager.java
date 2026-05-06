package com.example.agent.lsp;

import com.example.agent.config.Config;
import com.example.agent.console.AgentUi;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.lsp.config.LspConfig;
import com.example.agent.lsp.tools.*;
import com.example.agent.tools.ToolRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class LspServiceManager {

    private static final Logger logger = LoggerFactory.getLogger(LspServiceManager.class);

    private final Config config;
    private final ToolRegistry toolRegistry;
    private final List<LspClient> activeClients = new ArrayList<>();

    public LspServiceManager(Config config, ToolRegistry toolRegistry) {
        this.config = config;
        this.toolRegistry = toolRegistry;
    }

    public void initialize() {
        LspConfig lspConfig = config.getLsp();

        if (!lspConfig.isEnabled()) {
            logger.info("LSP 功能已禁用");
            return;
        }

        logger.info("========== 初始化 LSP 服务管理器 ==========");

        for (String languageId : lspConfig.getServers().keySet()) {
            if (lspConfig.isServerEnabled(languageId)) {
                initializeLanguageServer(languageId);
            }
        }

        logger.info("LSP 服务管理器初始化完成，共 {} 个语言服务器正在启动...", activeClients.size());
        logger.info("  提示: jdtls 初始化在后台进行，稍后会显示完成状态");
        logger.info("  提示: 首次启动需要 60-120 秒下载依赖和建索引");
        if (!activeClients.isEmpty()) {
            printConsole(" LSP 服务: ℹ " + activeClients.size() + " 个服务器正在启动中...");
        }
    }

    private static final int MAX_RETRIES = 2;
    private static final long RETRY_DELAY_MS = 5000;

    private void initializeLanguageServer(String languageId) {
        initializeLanguageServerWithRetry(languageId, 0);
    }

    private void initializeLanguageServerWithRetry(String languageId, int attempt) {
        try {
            LspClient client = LspClientFactory.create(languageId, config.getLsp());
            if (client == null) {
                return;
            }

            activeClients.add(client);
            String attemptInfo = attempt > 0 ? " (重试 " + attempt + "/" + MAX_RETRIES + ")" : "";
            printConsole("  🔄 正在启动 " + languageId + " LSP 服务器" + attemptInfo + "...");

            client.start()
                    .thenCompose(v -> {
                        logger.info("{} LSP 服务器已启动，正在初始化...", languageId);
                        return client.initialize();
                    })
                    .thenRun(() -> {
                        logger.info("✅ {} LSP 服务器初始化完成，注册工具...", languageId);
                        printConsole("  ✅ " + languageId + " LSP 服务器就绪");
                        registerTools(client, languageId);
                    })
                    .exceptionally(e -> {
                        activeClients.remove(client);
                        try { client.shutdown(); } catch (Exception ignored) {}

                        if (attempt < MAX_RETRIES) {
                            logger.warn("⚠️ {} LSP 初始化失败，{} 秒后重试 ({}/{})",
                                languageId, RETRY_DELAY_MS / 1000, attempt + 1, MAX_RETRIES);
                            printConsole("  ⚠️ " + languageId + " LSP 启动失败，即将重试...");
                            CompletableFuture.delayedExecutor(RETRY_DELAY_MS, java.util.concurrent.TimeUnit.MILLISECONDS)
                                .execute(() -> initializeLanguageServerWithRetry(languageId, attempt + 1));
                        } else {
                            logger.error("❌ {} LSP 服务器初始化失败（已重试 {} 次）: {}", languageId, MAX_RETRIES, e.getMessage());
                            logger.error("  请检查: 1) jdtls.bat 路径是否正确 2) -data/-configuration 参数 3) Java 版本 >= 17");
                            printConsole("  ❌ " + languageId + " LSP 启动失败: " + e.getMessage());
                            printConsole("     💡 提示: 可在 config.yaml 设置 lsp.enabled=false 禁用");
                        }
                        return null;
                    });

        } catch (Exception e) {
            logger.error("创建 {} LSP 客户端失败: {}", languageId, e.getMessage(), e);
        }
    }

    private void registerTools(LspClient client, String languageId) {
        toolRegistry.register(new GoToDefinitionTool(client, languageId));
        toolRegistry.register(new FindReferencesTool(client, languageId));
        toolRegistry.register(new HoverTool(client, languageId));
        toolRegistry.register(new DocumentSymbolTool(client, languageId));
        toolRegistry.register(new WorkspaceSymbolTool(client, languageId));

        logger.info("✅ 已为 {} 注册 5 个 LSP 工具", languageId);
    }

    public void shutdown() {
        logger.info("正在关闭 LSP 服务...");
        for (LspClient client : activeClients) {
            try {
                client.shutdown();
            } catch (Exception e) {
                logger.warn("关闭 LSP 客户端失败: {}", e.getMessage());
            }
        }
        activeClients.clear();
    }

    public List<LspClient> getActiveClients() {
        return activeClients;
    }

    private void printConsole(String message) {
        try {
            AgentUi ui = ServiceLocator.getOrNull(AgentUi.class);
            if (ui != null) {
                ui.println(message);
            } else {
                logger.info(message);
            }
        } catch (Exception e) {
            logger.info(message);
        }
    }
}
