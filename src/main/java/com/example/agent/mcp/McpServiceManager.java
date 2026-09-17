package com.example.agent.mcp;

import com.example.agent.config.Config;
import com.example.agent.core.concurrency.ThreadPools;
import com.example.agent.mcp.client.AbstractMcpClient;
import com.example.agent.mcp.client.McpClient;
import com.example.agent.mcp.client.McpClientFactory;
import com.example.agent.mcp.config.McpConfig;
import com.example.agent.mcp.model.McpPrompt;
import com.example.agent.mcp.model.McpResource;
import com.example.agent.mcp.registry.McpPromptRegistry;
import com.example.agent.mcp.registry.McpResourceRegistry;
import com.example.agent.mcp.registry.McpToolAdapter;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

public class McpServiceManager {

    private static final Logger logger = LoggerFactory.getLogger(McpServiceManager.class);

    private final Config config;
    private final ToolRegistry toolRegistry;
    private final McpResourceRegistry resourceRegistry = new McpResourceRegistry();
    private final McpPromptRegistry promptRegistry = new McpPromptRegistry();
    private final ConcurrentHashMap<String, McpClient> activeClients = new ConcurrentHashMap<>();
    /** serverId → 该 server 已注册到 ToolRegistry 的工具名,用于热断开时注销避免残留失效工具 */
    private final ConcurrentHashMap<String, List<String>> registeredToolNames = new ConcurrentHashMap<>();
    private final AtomicBoolean initialized = new AtomicBoolean(false);
    private final AtomicBoolean shutdownHookRegistered = new AtomicBoolean(false);
    private final List<Runnable> shutdownHooks = new ArrayList<>();
    private ScheduledExecutorService reconnectExecutor;

    public McpServiceManager(Config config, ToolRegistry toolRegistry) {
        this.config = config;
        this.toolRegistry = toolRegistry;
    }

    public McpResourceRegistry getResourceRegistry() {
        return resourceRegistry;
    }

    public McpPromptRegistry getPromptRegistry() {
        return promptRegistry;
    }

    public void initialize() {
        if (!config.getMcp().isEnabled()) {
            logger.info("MCP服务已在配置中禁用");
            return;
        }

        if (initialized.compareAndSet(false, true)) {
            logger.info("初始化MCP服务管理器...");
            logger.info("自动重连: {} (最多 {} 次，间隔 {} 秒)",
                    config.getMcp().isAutoReconnect() ? "启用" : "禁用",
                    config.getMcp().getMaxReconnectAttempts(),
                    config.getMcp().getReconnectDelaySeconds());

            this.reconnectExecutor = ThreadPools.mcpScheduler();

            if (config.getMcp().isAutoConnect()) {
                connectAllConfiguredServers();
            }
        }
    }

    public void connectAllConfiguredServers() {
        List<McpConfig.McpServerConfig> servers = config.getMcp().getServers();
        if (servers == null || servers.isEmpty()) {
            logger.info("没有配置MCP服务器");
            return;
        }

        logger.info("开始连接 {} 个配置的MCP服务器...", servers.size());

        for (McpConfig.McpServerConfig serverConfig : servers) {
            connectServer(serverConfig);
        }
    }

    public void connectServer(McpConfig.McpServerConfig serverConfig) {
        String serverId = serverConfig.getId();

        if (activeClients.containsKey(serverId)) {
            logger.warn("MCP服务器 {} 已连接，跳过", serverId);
            return;
        }

        try {
            McpClient client = McpClientFactory.create(serverConfig);

            activeClients.put(serverId, client);

            if (client instanceof AbstractMcpClient) {
                AbstractMcpClient abstractClient = (AbstractMcpClient) client;
                abstractClient.setReconnectExecutor(reconnectExecutor);
                abstractClient.setDisconnectListener(disconnectedClient -> {
                    logger.warn("MCP服务器 {} 连接已丢失，将不再重试", disconnectedClient.getServerId());
                    activeClients.remove(disconnectedClient.getServerId());
                });
            }

            client.connect()
                    .thenCompose(v -> {
                        logger.info("MCP服务器 {} 连接成功，正在初始化...", serverId);
                        return client.initialize();
                    })
                    .thenCompose(v -> {
                        logger.info("MCP服务器 {} 初始化成功，正在获取工具列表...", serverId);
                        return client.listTools();
                    })
                    .thenAccept(tools -> {
                        if (serverConfig.isAutoRegisterTools()) {
                            List<String> names = new ArrayList<>();
                            tools.forEach(tool -> {
                                McpToolAdapter adapter = new McpToolAdapter(client, tool);
                                toolRegistry.register(adapter);
                                names.add(adapter.getName());
                                logger.info("已注册MCP工具: {} ({})",
                                        adapter.getName(),
                                        tool.getDescription());
                            });
                            registeredToolNames.put(serverId, names);
                        }

                        client.listResources()
                                .thenAccept(resources -> {
                                    if (!resources.isEmpty()) {
                                        resourceRegistry.registerResources(client, resources);
                                        logger.info("MCP服务器 {} 共注册了 {} 个资源",
                                                serverConfig.getName(),
                                                resources.size());
                                    }
                                })
                                .exceptionally(e -> {
                                    logger.debug("MCP服务器 {} 不支持 Resources 或获取失败: {}",
                                            serverId, e.getMessage());
                                    return null;
                                });

                        client.listPrompts()
                                .thenAccept(prompts -> {
                                    if (!prompts.isEmpty()) {
                                        promptRegistry.registerPrompts(client, prompts);
                                        logger.info("MCP服务器 {} 共注册了 {} 个提示词",
                                                serverConfig.getName(),
                                                prompts.size());
                                    }
                                })
                                .exceptionally(e -> {
                                    logger.debug("MCP服务器 {} 不支持 Prompts 或获取失败: {}",
                                            serverId, e.getMessage());
                                    return null;
                                });

                        logger.info("MCP服务器 {} 就绪！共注册了 {} 个工具",
                                serverConfig.getName(),
                                tools.size());
                    })
                    .exceptionally(e -> {
                        logger.error("MCP服务器 {} 连接/初始化失败: {}",
                                serverId,
                                e.getMessage(),
                                e);
                        activeClients.remove(serverId);
                        try {
                            client.disconnect().get(5, java.util.concurrent.TimeUnit.SECONDS);
                        } catch (Exception ignored) {
                        }
                        return null;
                    });

        } catch (Exception e) {
            logger.error("创建MCP客户端失败: {} - {}", serverId, e.getMessage(), e);
            activeClients.remove(serverId);
        }
    }

    public void disconnectServer(String serverId) {
        // 先注销该 server 已注册到 ToolRegistry 的工具,避免残留已失效的 mcp_* 工具仍暴露给 LLM
        List<String> names = registeredToolNames.remove(serverId);
        if (names != null) {
            for (String name : names) {
                try {
                    toolRegistry.unregister(name);
                    logger.info("已注销MCP工具: {}", name);
                } catch (Exception e) {
                    logger.warn("注销MCP工具失败: {} - {}", name, e.getMessage());
                }
            }
        }

        McpClient client = activeClients.remove(serverId);
        if (client != null) {
            try {
                client.disconnect().get();
                resourceRegistry.unregisterResources(serverId);
                promptRegistry.unregisterPrompts(serverId);
                logger.info("MCP服务器 {} 已断开连接", serverId);
            } catch (Exception e) {
                logger.warn("断开MCP服务器 {} 连接时出错: {}", serverId, e.getMessage());
            }
        }
    }

    public List<McpClient> getActiveClients() {
        return new ArrayList<>(activeClients.values());
    }

    public McpClient getClient(String serverId) {
        return activeClients.get(serverId);
    }

    public void shutdown() {
        if (initialized.get()) {
            logger.info("关闭MCP服务管理器...");

            if (reconnectExecutor != null) {
                reconnectExecutor.shutdownNow();
            }

            List<String> serverIds = new ArrayList<>(activeClients.keySet());
            for (String serverId : serverIds) {
                disconnectServer(serverId);
            }

            for (Runnable hook : shutdownHooks) {
                try {
                    hook.run();
                } catch (Exception e) {
                    logger.warn("执行关闭钩子时出错", e);
                }
            }

            initialized.set(false);
            shutdownHookRegistered.set(false);
            logger.info("MCP服务管理器已关闭");
        }
    }

    public boolean isInitialized() {
        return initialized.get();
    }

    public void addShutdownHook(Runnable hook) {
        shutdownHooks.add(hook);
    }
}
