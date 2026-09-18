package com.example.agent.mcp;

import com.example.agent.config.Config;
import com.example.agent.mcp.client.McpClient;
import com.example.agent.mcp.config.McpConfig;
import com.example.agent.tools.ToolRegistry;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * McpServiceManager 初始连接失败后的重试行为测试。
 * <p>
 * 覆盖点：失败后按 reconnect_delay_seconds 重试、达到 max_reconnect_attempts 后放弃、
 * auto_reconnect=false 时不重试、显式断开后取消重试。
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
@DisplayName("McpServiceManager：初始连接失败重试")
class McpConnectRetryTest {

    private static final String SERVER_ID = "flaky";
    /** 重试间隔（秒），测试中取最小值以缩短等待 */
    private static final int RETRY_DELAY_SECONDS = 1;

    private Config config;
    private McpServiceManager manager;
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

        manager = new McpServiceManager(config, new ToolRegistry(), cfg -> {
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
}