package com.example.agent.mcp;

import com.example.agent.config.Config;
import com.example.agent.mcp.client.AbstractMcpClient;
import com.example.agent.mcp.client.McpClient;
import com.example.agent.mcp.config.McpConfig;
import com.example.agent.mcp.model.McpPrompt;
import com.example.agent.mcp.model.McpResource;
import com.example.agent.mcp.model.McpTool;
import com.example.agent.tools.ToolRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * McpServiceManager 的连接重试与掉线重连行为测试。
 * <p>
 * 覆盖点：初始连接失败后按 reconnect_delay_seconds 重试、达到 max_reconnect_attempts 后放弃、
 * auto_reconnect=false 时不重试、显式断开后取消重试；
 * 以及已建连后掉线、客户端自行重连成功时，重新 listTools 并注册工具（含清理失效旧工具）；
 * 掉线重连失败时按 max_reconnect_attempts 多次尝试，且 connect 成功但 initialize 持续失败不会无限循环。
 * </p>
 * <p>
 * 时序说明：重试由调度线程池异步触发，故用轮询等待而非固定 sleep 断言；
 * 断言「不再发生」时需等满至少一个重试间隔再确认次数未增长。
 * </p>
 * <p>
 * 实现说明：客户端构造走注入的工厂而非 mockStatic(McpClientFactory)——Mockito 的静态
 * mock 默认只在创建它的线程生效，调度线程会看到真实实现，从而真的拉起子进程且计数不增加。
 * 调度器同理注入独立实例，避免共用 ThreadPools 的 mcp-scheduler（会被 shutdown 永久关闭）。
 * </p>
 */
@DisplayName("McpServiceManager：连接失败重试与掉线重连")
class McpConnectRetryTest {

    private static final String SERVER_ID = "flaky";
    /** 重试间隔（秒），测试中取最小值以缩短等待 */
    private static final int RETRY_DELAY_SECONDS = 1;

    private Config config;
    private McpServiceManager manager;
    private ToolRegistry toolRegistry;
    private ScheduledExecutorService retryScheduler;
    private final AtomicInteger createCount = new AtomicInteger();

    private boolean originalAutoReconnect;
    private int originalMaxAttempts;
    private int originalDelaySeconds;

    @BeforeEach
    void setUp() throws Exception {
        config = Config.getInstance();
        // 只改本测试需要的字段并记录原值，避免污染同 JVM 内其他依赖 config 的测试
        originalAutoReconnect = config.getMcp().isAutoReconnect();
        originalMaxAttempts = config.getMcp().getMaxReconnectAttempts();
        originalDelaySeconds = config.getMcp().getReconnectDelaySeconds();
        config.getMcp().setAutoReconnect(true);
        config.getMcp().setMaxReconnectAttempts(3);
        config.getMcp().setReconnectDelaySeconds(RETRY_DELAY_SECONDS);

        toolRegistry = new ToolRegistry();
        manager = new McpServiceManager(config, toolRegistry, cfg -> {
            createCount.incrementAndGet();
            return failingClient();
        });

        retryScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "test-mcp-retry");
            t.setDaemon(true);
            return t;
        });
        injectReconnectExecutor(manager);
    }

    @AfterEach
    void tearDown() {
        retryScheduler.shutdownNow();
        config.getMcp().setAutoReconnect(originalAutoReconnect);
        config.getMcp().setMaxReconnectAttempts(originalMaxAttempts);
        config.getMcp().setReconnectDelaySeconds(originalDelaySeconds);
    }

    // ========== 重试行为 ==========

    @Test
    @DisplayName("首次连接失败后自动重试并成功")
    void retriesAfterInitialConnectFailure() throws Exception {
        manager = new McpServiceManager(config, new ToolRegistry(), cfg ->
                createCount.incrementAndGet() == 1 ? failingClient() : successClient());
        injectReconnectExecutor(manager);

        manager.connectServer(serverConfig());

        awaitTrue(() -> createCount.get() >= 2, 5000);
        assertEquals(2, createCount.get(), "首次失败后应重试一次并成功，不应多余重试");
        assertNotNull(manager.getClient(SERVER_ID), "重试成功后应留存活跃客户端");
    }

    @Test
    @DisplayName("达到 max_reconnect_attempts 后放弃，不再继续重试")
    void givesUpAfterMaxAttempts() throws Exception {
        config.getMcp().setMaxReconnectAttempts(2);

        manager.connectServer(serverConfig());

        // 首次 + 2 次重试 = 3，等待重试链走完
        awaitTrue(() -> createCount.get() >= 3, 8000);
        // 再等满一个重试间隔，确认没有第 4 次
        awaitTrue(() -> createCount.get() > 3, RETRY_DELAY_SECONDS * 1000L + 1000);
        assertEquals(3, createCount.get(), "达到最大重试次数后应停止重试");
    }

    @Test
    @DisplayName("auto_reconnect=false 时首次失败不重试")
    void doesNotRetryWhenAutoReconnectDisabled() throws Exception {
        config.getMcp().setAutoReconnect(false);

        manager.connectServer(serverConfig());

        awaitTrue(() -> createCount.get() >= 1, 5000);
        awaitTrue(() -> createCount.get() > 1, RETRY_DELAY_SECONDS * 1000L + 1000);
        assertEquals(1, createCount.get(), "自动重连关闭时不应重试");
    }

    @Test
    @DisplayName("显式断开后取消挂起重试，不会把已卸载的 server 连回来")
    void explicitDisconnectCancelsPendingRetry() throws Exception {
        manager.connectServer(serverConfig());
        awaitTrue(() -> createCount.get() >= 1, 5000);

        // 在重试触发前显式断开
        manager.disconnectServer(SERVER_ID);

        awaitTrue(() -> createCount.get() > 1, RETRY_DELAY_SECONDS * 1000L + 1000);
        assertEquals(1, createCount.get(), "显式断开后不应再有重试");
    }

    // ========== 掉线后重连重新注册工具 ==========

    @Test
    @DisplayName("掉线重连成功后重新 listTools 并注册工具")
    void testReregistersToolsAfterReconnect() throws Exception {
        // 首次连接返回空工具列表（模拟工具尚未就绪），重连后返回 1 个工具
        FakeReconnectClient client = new FakeReconnectClient(serverConfig());
        client.toolListOnFirstCall(List.of());
        client.toolListAfterReconnect(List.of(mcpTool("echo")));

        manager = new McpServiceManager(config, toolRegistry, cfg -> client);
        injectReconnectExecutor(manager);

        manager.connectServer(serverConfig());
        awaitTrue(() -> client.listToolsCalls() >= 1, 5000);
        assertFalse(toolRegistry.hasTool("mcp_flaky_echo"), "首次未返回工具时不应注册");

        // 模拟已建连后进程掉线，由客户端自行重连
        client.onConnectionLost();

        awaitTrue(() -> toolRegistry.hasTool("mcp_flaky_echo"), 5000);
        assertTrue(toolRegistry.hasTool("mcp_flaky_echo"), "重连成功后应重新注册工具");
        assertEquals(2, client.listToolsCalls(), "重连后应重新 listTools 一次");
    }

    @Test
    @DisplayName("重连后服务端工具集变化时，旧工具被注销")
    void testRemovesStaleToolsAfterReconnect() throws Exception {
        FakeReconnectClient client = new FakeReconnectClient(serverConfig());
        client.toolListOnFirstCall(List.of(mcpTool("old")));
        client.toolListAfterReconnect(List.of(mcpTool("new")));

        manager = new McpServiceManager(config, toolRegistry, cfg -> client);
        injectReconnectExecutor(manager);

        manager.connectServer(serverConfig());
        awaitTrue(() -> toolRegistry.hasTool("mcp_flaky_old"), 5000);

        client.onConnectionLost();

        awaitTrue(() -> toolRegistry.hasTool("mcp_flaky_new"), 5000);
        assertFalse(toolRegistry.hasTool("mcp_flaky_old"), "重连后不应残留失效的旧工具");
    }

    // ========== 掉线重连失败路径 ==========

    @Test
    @DisplayName("掉线重连失败时按 max_reconnect_attempts 多次尝试，而非只试一次")
    void retriesMultipleTimesAfterReconnectFailure() throws Exception {
        AtomicInteger connectCalls = new AtomicInteger();
        FakeReconnectClient client = new FakeReconnectClient(serverConfig()) {
            @Override
            public CompletableFuture<Void> connect() {
                if (connectCalls.incrementAndGet() == 1) {
                    // 初次连接成功，让 manager 正常建立会话
                    connected = true;
                    resetReconnectState();
                    return CompletableFuture.completedFuture(null);
                }
                return CompletableFuture.failedFuture(new RuntimeException("重连时子进程启动失败"));
            }
        };

        manager = new McpServiceManager(config, toolRegistry, cfg -> client);
        injectReconnectExecutor(manager);

        manager.connectServer(serverConfig());
        awaitTrue(() -> connectCalls.get() >= 1, 5000);

        // 模拟已建连后进程掉线；重连时 connect 持续失败
        client.onConnectionLost();

        // maxReconnectAttempts=3：初次 1 次 + 3 次重连，第 4 次触发放弃，manager 移除客户端
        awaitTrue(() -> manager.getClient(SERVER_ID) == null, 8000);
        assertEquals(4, connectCalls.get(), "初次连接 + 3 次重连失败后应停止");

        // 再等满一个重试间隔，确认没有多余的尝试
        awaitTrue(() -> connectCalls.get() > 4, RETRY_DELAY_SECONDS * 1000L + 1000);
        assertEquals(4, connectCalls.get(), "达到最大重试次数后不应再尝试");
    }

    @Test
    @DisplayName("connect 成功但 initialize 持续失败时，重连次数有上限，不会无限循环")
    void stopsRetryingWhenConnectSucceedsButInitKeepsFailing() throws Exception {
        AtomicInteger connectCalls = new AtomicInteger();
        AtomicInteger initCalls = new AtomicInteger();
        FakeReconnectClient client = new FakeReconnectClient(serverConfig()) {
            @Override
            public CompletableFuture<Void> connect() {
                connectCalls.incrementAndGet();
                connected = true;
                resetReconnectState();
                return CompletableFuture.completedFuture(null);
            }

            @Override
            public CompletableFuture<Void> initialize() {
                if (initCalls.incrementAndGet() == 1) {
                    return CompletableFuture.completedFuture(null);
                }
                return CompletableFuture.failedFuture(new RuntimeException("initialize 持续失败"));
            }
        };

        manager = new McpServiceManager(config, toolRegistry, cfg -> client);
        injectReconnectExecutor(manager);

        manager.connectServer(serverConfig());
        awaitTrue(() -> initCalls.get() >= 1, 5000);

        client.onConnectionLost();

        // 初次 initialize 1 次 + 3 次重连各 1 次，第 4 次触发放弃
        awaitTrue(() -> manager.getClient(SERVER_ID) == null, 8000);
        assertEquals(4, connectCalls.get(), "connect 每次成功但 initialize 持续失败，仍应受次数上限约束");
        assertEquals(4, initCalls.get(), "initialize 失败次数同样受 max_reconnect_attempts 限制");

        // 再等满一个重试间隔，确认没有第 5 次
        awaitTrue(() -> initCalls.get() > 4, RETRY_DELAY_SECONDS * 1000L + 1000);
        assertEquals(4, initCalls.get(), "达到上限后不应无限重试");
    }

    // ========== 辅助方法 ==========

    private void injectReconnectExecutor(McpServiceManager target) throws Exception {
        Field executorField = McpServiceManager.class.getDeclaredField("reconnectExecutor");
        executorField.setAccessible(true);
        executorField.set(target, retryScheduler);
    }

    private McpConfig.McpServerConfig serverConfig() {
        McpConfig.McpServerConfig cfg = new McpConfig.McpServerConfig();
        cfg.setId(SERVER_ID);
        cfg.setName("Flaky Server");
        cfg.setType("stdio");
        cfg.setCommand("npx");
        cfg.setArgs(List.of("-y", "some-mcp-package"));
        cfg.setAutoRegisterTools(true);
        return cfg;
    }

    /** connect() 即失败的客户端。 */
    private McpClient failingClient() {
        McpClient client = mock(McpClient.class);
        when(client.getServerId()).thenReturn(SERVER_ID);
        when(client.connect()).thenReturn(
                CompletableFuture.failedFuture(new RuntimeException("启动MCP子进程失败")));
        when(client.disconnect()).thenReturn(CompletableFuture.completedFuture(null));
        return client;
    }

    /** connect → initialize → listTools/Resources/Prompts 全成功的客户端。 */
    private McpClient successClient() {
        McpClient client = mock(McpClient.class);
        when(client.getServerId()).thenReturn(SERVER_ID);
        when(client.getServerName()).thenReturn("Flaky Server");
        when(client.connect()).thenReturn(CompletableFuture.completedFuture(null));
        when(client.initialize()).thenReturn(CompletableFuture.completedFuture(null));
        when(client.listTools()).thenReturn(CompletableFuture.completedFuture(List.of()));
        when(client.listResources()).thenReturn(CompletableFuture.completedFuture(List.of()));
        when(client.listPrompts()).thenReturn(CompletableFuture.completedFuture(List.of()));
        when(client.disconnect()).thenReturn(CompletableFuture.completedFuture(null));
        return client;
    }

    /** 轮询等待，直到条件成立或超时；超时后不抛异常，交由调用方的断言给出失败信息。 */
    private void awaitTrue(BooleanSupplier condition, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(50);
        }
    }

    private McpTool mcpTool(String name) {
        McpTool tool = new McpTool();
        tool.setName(name);
        tool.setDescription(name + " 工具");
        return tool;
    }

    /**
     * 可控制 listTools 返回值的假客户端，用于触发「已建连后掉线 → 自行重连」路径。
     * <p>
     * 必须继承 {@link AbstractMcpClient}：重连监听器只对 AbstractMcpClient 实例装配，
     * 且 {@code onConnectionLost}/{@code attemptReconnect} 逻辑本身就在该类中。
     * </p>
     */
    private static class FakeReconnectClient extends AbstractMcpClient {

        private final AtomicInteger listToolsCalls = new AtomicInteger();
        private List<McpTool> firstCallTools = List.of();
        private List<McpTool> laterCallTools = List.of();

        FakeReconnectClient(McpConfig.McpServerConfig config) {
            super(config);
        }

        void toolListOnFirstCall(List<McpTool> tools) {
            this.firstCallTools = tools;
        }

        void toolListAfterReconnect(List<McpTool> tools) {
            this.laterCallTools = tools;
        }

        int listToolsCalls() {
            return listToolsCalls.get();
        }

        @Override
        public CompletableFuture<Void> connect() {
            connected = true;
            resetReconnectState();
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public CompletableFuture<Void> initialize() {
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public CompletableFuture<Void> disconnect() {
            markUserInitiatedDisconnect();
            connected = false;
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public CompletableFuture<List<McpTool>> listTools() {
            boolean first = listToolsCalls.incrementAndGet() == 1;
            return CompletableFuture.completedFuture(first ? firstCallTools : laterCallTools);
        }

        @Override
        public CompletableFuture<List<McpResource>> listResources() {
            return CompletableFuture.completedFuture(List.of());
        }

        @Override
        public CompletableFuture<List<McpPrompt>> listPrompts() {
            return CompletableFuture.completedFuture(List.of());
        }

        @Override
        protected CompletableFuture<JsonNode> sendRequestInternal(String method, Object params) {
            return CompletableFuture.completedFuture(null);
        }

        @Override
        protected void doSendMessage(String messageJson) {
            // 假客户端不落地真实子进程，无需发送
        }
    }
}