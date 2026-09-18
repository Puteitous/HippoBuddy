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
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
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
    /** serverId → 挂起的连接重试任务,显式断开/关闭时需取消,否则会在用户卸载后自动连回来 */
    private final ConcurrentHashMap<String, ScheduledFuture<?>> pendingConnectRetries = new ConcurrentHashMap<>();
    /**
     * 被显式断开（用户卸载插件/手动断开）的 serverId。
     * <p>
     * 仅取消 ScheduledFuture 不足以阻止重试：任务可能恰好已在执行中，
     * 此时断开会让 connectServer 的异步链失败并再次排一次重试。
     * 用该标记在重试入口与 connectServer 入口双重拦截，显式 connect 时清除。
     * </p>
     */
    private final java.util.Set<String> explicitlyDisconnected = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean initialized = new AtomicBoolean(false);
    private final AtomicBoolean shutdownHookRegistered = new AtomicBoolean(false);
    private final List<Runnable> shutdownHooks = new ArrayList<>();
    private ScheduledExecutorService reconnectExecutor;
    /** MCP 客户端工厂；默认走 McpClientFactory，注入点便于测试构造失败/成功的假客户端 */
    private final java.util.function.Function<McpConfig.McpServerConfig, McpClient> clientFactory;

    public McpServiceManager(Config config, ToolRegistry toolRegistry) {
        this(config, toolRegistry, McpClientFactory::create);
    }

    public McpServiceManager(Config config, ToolRegistry toolRegistry,
                             java.util.function.Function<McpConfig.McpServerConfig, McpClient> clientFactory) {
        this.config = config;
        this.toolRegistry = toolRegistry;
        this.clientFactory = clientFactory;
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
        // 显式连接请求：清除"已断开"标记，允许重试链正常工作
        explicitlyDisconnected.remove(serverConfig.getId());
        cancelPendingConnectRetry(serverConfig.getId());
        connectServer(serverConfig, 0);
    }

    /** 取消挂起的连接重试（若有）。 */
    private void cancelPendingConnectRetry(String serverId) {
        ScheduledFuture<?> pending = pendingConnectRetries.remove(serverId);
        if (pending != null && pending.cancel(false)) {
            logger.info("已取消MCP服务器 {} 的挂起重试", serverId);
        }
    }

    /**
     * 建立连接并注册工具，失败时按 max_reconnect_attempts 延迟重试。
     * <p>
     * 初始连接失败（而非已建连后断开）原先只做清理、本次运行不再重试；而 npx/uvx 类
     * 服务器首次启动要下载包，握手超时或下载中断都会落到这条路径，表现为「MCP 工具时有时无」。
     * 重试会重建客户端：失败时进程可能仍存活但已失联，复用状态不明的实例不可靠。
     * </p>
     *
     * @param attempt 已失败次数，0 表示首次尝试
     */
    private void connectServer(McpConfig.McpServerConfig serverConfig, int attempt) {
        String serverId = serverConfig.getId();

        if (explicitlyDisconnected.contains(serverId)) {
            logger.info("MCP服务器 {} 已被显式断开，放弃连接", serverId);
            return;
        }

        if (activeClients.containsKey(serverId)) {
            logger.warn("MCP服务器 {} 已连接，跳过", serverId);
            return;
        }

        McpClient client;
        try {
            client = clientFactory.apply(serverConfig);
        } catch (Exception e) {
            logger.error("创建MCP客户端失败: {} - {}", serverId, e.getMessage(), e);
            scheduleConnectRetry(serverConfig, attempt, e.getMessage());
            return;
        }

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
                    logger.error("MCP服务器 {} 连接/初始化失败（第 {} 次尝试）: {}",
                            serverId,
                            attempt + 1,
                            e.getMessage(),
                            e);
                    activeClients.remove(serverId);
                    try {
                        // 必须先主动断开：markUserInitiatedDisconnect 会阻止
                        // AbstractMcpClient 内部的连接丢失回调再触发一轮重复重试
                        client.disconnect().get(5, TimeUnit.SECONDS);
                    } catch (Exception ignored) {
                    }
                    scheduleConnectRetry(serverConfig, attempt, e.getMessage());
                    return null;
                });
    }

    /**
     * 安排一次连接重试；已达上限或自动重连关闭时放弃。
     */
    private void scheduleConnectRetry(McpConfig.McpServerConfig serverConfig, int attempt, String reason) {
        String serverId = serverConfig.getId();

        if (explicitlyDisconnected.contains(serverId)) {
            logger.info("MCP服务器 {} 已被显式断开，不再排重试", serverId);
            return;
        }

        if (!config.getMcp().isAutoReconnect()) {
            logger.warn("MCP服务器 {} 连接失败，自动重连已禁用，不再重试: {}", serverId, reason);
            return;
        }

        int maxAttempts = config.getMcp().getMaxReconnectAttempts();
        if (attempt >= maxAttempts) {
            logger.error("MCP服务器 {} 连接失败且已达最大重试次数 {}，放弃: {}",
                    serverId, maxAttempts, reason);
            return;
        }

        int nextAttempt = attempt + 1;
        long delaySeconds = Math.max(1, config.getMcp().getReconnectDelaySeconds());
        logger.warn("MCP服务器 {} 将在 {} 秒后进行第 {}/{} 次连接重试",
                serverId, delaySeconds, nextAttempt, maxAttempts);

        if (reconnectExecutor == null) {
            logger.warn("MCP服务器 {} 无可用调度器，跳过重试", serverId);
            return;
        }

        ScheduledFuture<?> future = reconnectExecutor.schedule(
                () -> {
                    pendingConnectRetries.remove(serverId);
                    connectServer(serverConfig, nextAttempt);
                },
                delaySeconds,
                TimeUnit.SECONDS);
        pendingConnectRetries.put(serverId, future);
    }

    public void disconnectServer(String serverId) {
        // 标记显式断开并取消挂起重试：否则重试链会把刚卸载的 server 又连回来。
        // 必须在移除 client 之前登记，才能拦住正在执行中的那次重试。
        explicitlyDisconnected.add(serverId);
        cancelPendingConnectRetry(serverId);

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
