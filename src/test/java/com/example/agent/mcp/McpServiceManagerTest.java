package com.example.agent.mcp;

import com.example.agent.config.Config;
import com.example.agent.mcp.client.McpClient;
import com.example.agent.mcp.config.McpConfig;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DisplayName("McpServiceManager：MCP 服务管理器单元测试")
class McpServiceManagerTest {

    private Config config;
    private ToolRegistry toolRegistry;
    private McpServiceManager manager;
    private ObjectMapper objectMapper;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        config = Config.getInstance();
        config.getMcp().setEnabled(true);
        config.getMcp().setServers(new ArrayList<>());
        config.getMcp().setAutoConnect(false);
        config.getMcp().setAutoReconnect(false);

        toolRegistry = new ToolRegistry();
        manager = new McpServiceManager(config, toolRegistry);
        objectMapper = new ObjectMapper();

        // 注册一个假内置工具，验证断开时不会误伤它
        toolRegistry.register(new ToolExecutor() {
            @Override public String getName() { return "read_file"; }
            @Override public String getDescription() { return "内置读取工具"; }
            @Override public String getParametersSchema() { return "{\"type\":\"object\",\"properties\":{}}"; }
            @Override public String execute(JsonNode arguments) { return ""; }
        });
    }

    @AfterEach
    void tearDown() {
        // 确保每个测试后清理内部状态
        try {
            manager.shutdown();
        } catch (Exception ignored) {
        }
        // 恢复配置
        config.getMcp().setAutoReconnect(true);
    }

    /**
     * 通过反射向 McpServiceManager 的 activeClients 和 registeredToolNames
     * 注入模拟数据，以便测试 disconnectServer / shutdown 方法。
     */
    @SuppressWarnings("unchecked")
    private void injectInternalState(String serverId, McpClient mockClient, List<String> toolNames) throws Exception {
        Field activeClientsField = McpServiceManager.class.getDeclaredField("activeClients");
        activeClientsField.setAccessible(true);
        ConcurrentHashMap<String, McpClient> activeClients =
                (ConcurrentHashMap<String, McpClient>) activeClientsField.get(manager);
        activeClients.put(serverId, mockClient);

        Field registeredNamesField = McpServiceManager.class.getDeclaredField("registeredToolNames");
        registeredNamesField.setAccessible(true);
        ConcurrentHashMap<String, List<String>> registeredToolNames =
                (ConcurrentHashMap<String, List<String>>) registeredNamesField.get(manager);
        registeredToolNames.put(serverId, new ArrayList<>(toolNames));
    }

    // ========== disconnectServer 断开连接 ==========

    @Nested
    @DisplayName("disconnectServer() 断开 MCP 服务器")
    class DisconnectServer {

        @Test
        @DisplayName("注销已注册的 MCP 工具")
        void unregistersMcpTools() throws Exception {
            // 注册 MCP 工具到 ToolRegistry
            toolRegistry.register(new MockMcpTool("mcp_fs_read_file", "MCP 工具"));
            toolRegistry.register(new MockMcpTool("mcp_fs_write_file", "MCP 工具"));
            assertTrue(toolRegistry.hasTool("mcp_fs_read_file"));
            assertTrue(toolRegistry.hasTool("mcp_fs_write_file"));

            McpClient mockClient = mock(McpClient.class);
            when(mockClient.disconnect()).thenReturn(CompletableFuture.completedFuture(null));

            injectInternalState("fs", mockClient, List.of("mcp_fs_read_file", "mcp_fs_write_file"));

            manager.disconnectServer("fs");

            assertFalse(toolRegistry.hasTool("mcp_fs_read_file"),
                    "断开后 MCP 工具应被注销");
            assertFalse(toolRegistry.hasTool("mcp_fs_write_file"),
                    "断开后 MCP 工具应被注销");
        }

        @Test
        @DisplayName("断开后内置工具不受影响")
        void doesNotAffectBuiltinTools() throws Exception {
            toolRegistry.register(new MockMcpTool("mcp_fs_read_file", "MCP 工具"));

            McpClient mockClient = mock(McpClient.class);
            when(mockClient.disconnect()).thenReturn(CompletableFuture.completedFuture(null));

            injectInternalState("fs", mockClient, List.of("mcp_fs_read_file"));

            manager.disconnectServer("fs");

            assertTrue(toolRegistry.hasTool("read_file"),
                    "内置工具不应受 MCP 断开影响");
        }

        @Test
        @DisplayName("调用 client.disconnect() 方法")
        void callsClientDisconnect() throws Exception {
            McpClient mockClient = mock(McpClient.class);
            when(mockClient.disconnect()).thenReturn(CompletableFuture.completedFuture(null));

            injectInternalState("fs", mockClient, List.of("mcp_fs_read_file"));

            manager.disconnectServer("fs");

            verify(mockClient, times(1)).disconnect();
        }

        @Test
        @DisplayName("从 activeClients 中移除")
        void removesFromActiveClients() throws Exception {
            McpClient mockClient = mock(McpClient.class);
            when(mockClient.disconnect()).thenReturn(CompletableFuture.completedFuture(null));

            injectInternalState("fs", mockClient, List.of("mcp_fs_read_file"));

            manager.disconnectServer("fs");

            assertNull(manager.getClient("fs"),
                    "断开后不应再出现在活跃客户端中");
        }

        @Test
        @DisplayName("多次断开同一 serverId 不抛异常（幂等）")
        void idempotentDisconnect() throws Exception {
            McpClient mockClient = mock(McpClient.class);
            when(mockClient.disconnect()).thenReturn(CompletableFuture.completedFuture(null));

            injectInternalState("fs", mockClient, List.of("mcp_fs_read_file"));

            // 第一次断开
            manager.disconnectServer("fs");
            // 第二次断开（已无该 server）
            assertDoesNotThrow(() -> manager.disconnectServer("fs"));
        }

        @Test
        @DisplayName("断开不存在的 serverId 不抛异常")
        void disconnectNonExistentServer() {
            assertDoesNotThrow(() -> manager.disconnectServer("non-existent"));
        }
    }

    // ========== shutdown 关闭 ==========

    /**
     * 通过反射设置 initialized 标志，使 shutdown() 方法进入清理路径。
     */
    private void setInitializedTrue() throws Exception {
        Field initializedField = McpServiceManager.class.getDeclaredField("initialized");
        initializedField.setAccessible(true);
        java.util.concurrent.atomic.AtomicBoolean initialized =
                (java.util.concurrent.atomic.AtomicBoolean) initializedField.get(manager);
        initialized.set(true);
    }

    @Nested
    @DisplayName("shutdown() 关闭服务管理器")
    class Shutdown {

        @BeforeEach
        void markInitialized() throws Exception {
            setInitializedTrue();
        }

        @Test
        @DisplayName("关闭所有活跃连接并注销全部 MCP 工具")
        void removesAllClientsAndUnregistersAllTools() throws Exception {
            // 注册两个 MCP Server 的工具
            toolRegistry.register(new MockMcpTool("mcp_fs_read_file", "MCP 工具"));
            toolRegistry.register(new MockMcpTool("mcp_db_query", "MCP 工具"));

            McpClient mockClient1 = mock(McpClient.class);
            when(mockClient1.disconnect()).thenReturn(CompletableFuture.completedFuture(null));
            McpClient mockClient2 = mock(McpClient.class);
            when(mockClient2.disconnect()).thenReturn(CompletableFuture.completedFuture(null));

            injectInternalState("fs", mockClient1, List.of("mcp_fs_read_file"));
            injectInternalState("db", mockClient2, List.of("mcp_db_query"));

            manager.shutdown();

            assertFalse(toolRegistry.hasTool("mcp_fs_read_file"));
            assertFalse(toolRegistry.hasTool("mcp_db_query"));
            assertNull(manager.getClient("fs"));
            assertNull(manager.getClient("db"));
        }

        @Test
        @DisplayName("内置工具在 shutdown 后仍然存在")
        void builtinToolsSurviveShutdown() throws Exception {
            McpClient mockClient = mock(McpClient.class);
            when(mockClient.disconnect()).thenReturn(CompletableFuture.completedFuture(null));

            injectInternalState("fs", mockClient, List.of("mcp_fs_read_file"));

            manager.shutdown();

            assertTrue(toolRegistry.hasTool("read_file"),
                    "内置工具不应被 shutdown 影响");
        }
    }

    // ========== 辅助 Mock 工具 ==========

    /** 用于注册到 ToolRegistry 的假 MCP 工具，仅验证名称/存在性。 */
    private static class MockMcpTool implements ToolExecutor {
        private final String name;
        private final String description;

        MockMcpTool(String name, String description) {
            this.name = name;
            this.description = description;
        }

        @Override public String getName() { return name; }
        @Override public String getDescription() { return description; }
        @Override public String getParametersSchema() { return "{\"type\":\"object\",\"properties\":{}}"; }
        @Override public String execute(JsonNode arguments) { return ""; }
    }
}
