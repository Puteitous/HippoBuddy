package com.example.agent.mcp.client;

import com.example.agent.config.Config;
import com.example.agent.mcp.config.McpConfig;
import com.example.agent.mcp.exception.McpException;
import com.example.agent.mcp.exception.McpTimeoutException;
import com.example.agent.mcp.model.GetPromptResult;
import com.example.agent.mcp.model.InitializeResult;
import com.example.agent.mcp.model.ListPromptsResult;
import com.example.agent.mcp.model.ListResourcesResult;
import com.example.agent.mcp.model.ListToolsResult;
import com.example.agent.mcp.model.McpPrompt;
import com.example.agent.mcp.model.McpResource;
import com.example.agent.mcp.model.McpTool;
import com.example.agent.mcp.model.ReadResourceResult;
import com.example.agent.mcp.protocol.JsonRpcHandler;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

public abstract class AbstractMcpClient implements McpClient {

    protected static final Logger logger = LoggerFactory.getLogger(AbstractMcpClient.class);

    protected final McpConfig.McpServerConfig serverConfig;
    protected final McpConfig globalConfig;
    protected final JsonRpcHandler jsonRpcHandler;
    protected final int requestTimeoutMs;

    protected volatile boolean connected = false;
    protected String serverName;
    protected InitializeResult.ServerInfo serverInfo;

    private final AtomicBoolean userInitiatedDisconnect = new AtomicBoolean(false);
    private final AtomicInteger reconnectAttempts = new AtomicInteger(0);
    private final AtomicBoolean connectionLossHandling = new AtomicBoolean(false);
    private Consumer<McpClient> disconnectListener;
    protected ScheduledExecutorService reconnectExecutor;

    protected AbstractMcpClient(McpConfig.McpServerConfig config) {
        this.serverConfig = config;
        this.globalConfig = Config.getInstance().getMcp();
        this.jsonRpcHandler = new JsonRpcHandler();

        int timeout = globalConfig.getRequestTimeout();
        this.requestTimeoutMs = timeout > 0 ? timeout : 60000;

        if (globalConfig.getMaxReconnectAttempts() < 0) {
            globalConfig.setMaxReconnectAttempts(5);
        }
        if (globalConfig.getReconnectDelaySeconds() <= 0) {
            globalConfig.setReconnectDelaySeconds(5);
        }

        this.serverName = config.getName() != null ? config.getName() : config.getId();
    }

    public void setDisconnectListener(Consumer<McpClient> listener) {
        this.disconnectListener = listener;
    }

    public void setReconnectExecutor(ScheduledExecutorService executor) {
        this.reconnectExecutor = executor;
    }

    public void onConnectionLost() {
        if (userInitiatedDisconnect.get()) {
            logger.info("MCP服务器 {} 已主动断开，不进行重连", getServerId());
            return;
        }

        if (!connectionLossHandling.compareAndSet(false, true)) {
            return;
        }

        this.connected = false;

        if (!globalConfig.isAutoReconnect()) {
            logger.info("MCP服务器 {} 连接断开，自动重连已禁用", getServerId());
            notifyDisconnect();
            return;
        }

        int maxAttempts = globalConfig.getMaxReconnectAttempts();
        int currentAttempt = reconnectAttempts.incrementAndGet();

        if (currentAttempt > maxAttempts) {
            logger.warn("MCP服务器 {} 已达到最大重连次数 ({})，停止重连", getServerId(), maxAttempts);
            notifyDisconnect();
            return;
        }

        int delay = globalConfig.getReconnectDelaySeconds();
        logger.warn("MCP服务器 {} 连接异常断开，将在 {} 秒后尝试重连 (第 {}/{} 次)",
                getServerId(), delay, currentAttempt, maxAttempts);

        if (reconnectExecutor != null) {
            reconnectExecutor.schedule(this::attemptReconnect, delay, TimeUnit.SECONDS);
        } else {
            Thread reconnectThread = new Thread(() -> {
                try {
                    Thread.sleep(delay * 1000L);
                    attemptReconnect();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "mcp-reconnect-fallback-" + getServerId());
            reconnectThread.setDaemon(true);
            reconnectThread.start();
        }
    }

    private void attemptReconnect() {
        try {
            logger.info("正在重连 MCP 服务器 {}...", getServerId());

            connect()
                    .thenCompose(v -> initialize())
                    .thenAccept(v -> {
                        logger.info("✅ MCP服务器 {} 重连成功！", getServerId());
                        reconnectAttempts.set(0);
                        connectionLossHandling.set(false);
                    })
                    .exceptionally(e -> {
                        logger.warn("MCP服务器 {} 重连失败: {}", getServerId(), e.getMessage());
                        onConnectionLost();
                        return null;
                    });

        } catch (Exception e) {
            logger.warn("MCP服务器 {} 重连异常: {}", getServerId(), e.getMessage());
            onConnectionLost();
        }
    }

    protected void markUserInitiatedDisconnect() {
        userInitiatedDisconnect.set(true);
    }

    protected void resetReconnectState() {
        reconnectAttempts.set(0);
        userInitiatedDisconnect.set(false);
    }

    private void notifyDisconnect() {
        if (disconnectListener != null) {
            disconnectListener.accept(this);
        }
    }

    @Override
    public String getServerId() {
        return serverConfig.getId();
    }

    @Override
    public String getServerName() {
        return serverName;
    }

    @Override
    public boolean isConnected() {
        return connected;
    }

    protected abstract CompletableFuture<JsonNode> sendRequestInternal(String method, Object params);

    protected <T> CompletableFuture<T> sendRequest(String method, Object params, Class<T> resultType) {
        return sendRequestInternal(method, params)
                .orTimeout(requestTimeoutMs, TimeUnit.MILLISECONDS)
                .exceptionally(ex -> {
                    if (ex instanceof java.util.concurrent.TimeoutException) {
                        throw new McpTimeoutException("请求超时: " + method);
                    }
                    throw new McpException("请求失败: " + method, ex);
                })
                .thenApply(result -> jsonRpcHandler.parseResult(result, resultType));
    }

    @Override
    public CompletableFuture<Void> initialize() {
        Map<String, Object> params = new HashMap<>();
        params.put("protocolVersion", "2024-11-05");
        Map<String, Object> clientInfo = new HashMap<>();
        clientInfo.put("name", "hippo-agent");
        clientInfo.put("version", "1.0.2");
        params.put("clientInfo", clientInfo);
        Map<String, Object> capabilities = new HashMap<>();
        params.put("capabilities", capabilities);

        return sendRequest("initialize", params, InitializeResult.class)
                .thenAccept(result -> {
                    this.serverInfo = result.getServerInfo();
                    if (serverInfo != null) {
                        if (serverInfo.getName() != null) {
                            this.serverName = serverInfo.getName();
                        }
                        logger.info("MCP服务器初始化成功: {} v{}",
                                serverInfo.getName() != null ? serverInfo.getName() : getServerId(),
                                serverInfo.getVersion() != null ? serverInfo.getVersion() : "unknown");
                    } else {
                        logger.info("MCP服务器初始化成功: {}", getServerId());
                    }
                })
                .thenCompose(v -> sendNotification("initialized", null));
    }

    protected abstract void doSendMessage(String messageJson);

    protected CompletableFuture<Void> sendNotification(String method, Object params) {
        return CompletableFuture.runAsync(() -> {
            try {
                String requestJson = jsonRpcHandler.createNotification(method, params);
                logger.debug("发送通知: {}", requestJson);
                doSendMessage(requestJson);
            } catch (Exception e) {
                logger.warn("发送通知失败", e);
            }
        });
    }

    @Override
    public CompletableFuture<List<McpTool>> listTools() {
        return sendRequest("tools/list", null, ListToolsResult.class)
                .thenApply(ListToolsResult::getTools);
    }

    @Override
    public CompletableFuture<Object> callTool(String toolName, Map<String, Object> arguments) {
        Map<String, Object> params = new HashMap<>();
        params.put("name", toolName);
        params.put("arguments", arguments);
        return sendRequest("tools/call", params, Object.class);
    }

    @Override
    public CompletableFuture<List<McpResource>> listResources() {
        return sendRequest("resources/list", null, ListResourcesResult.class)
                .thenApply(ListResourcesResult::getResources);
    }

    @Override
    public CompletableFuture<ReadResourceResult> readResource(String uri) {
        Map<String, Object> params = new HashMap<>();
        params.put("uri", uri);
        return sendRequest("resources/read", params, ReadResourceResult.class);
    }

    @Override
    public CompletableFuture<List<McpPrompt>> listPrompts() {
        return sendRequest("prompts/list", null, ListPromptsResult.class)
                .thenApply(ListPromptsResult::getPrompts);
    }

    @Override
    public CompletableFuture<GetPromptResult> getPrompt(String name, Map<String, String> arguments) {
        Map<String, Object> params = new HashMap<>();
        params.put("name", name);
        if (arguments != null && !arguments.isEmpty()) {
            params.put("arguments", arguments);
        }
        return sendRequest("prompts/get", params, GetPromptResult.class);
    }
}
