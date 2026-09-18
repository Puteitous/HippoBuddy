package com.example.agent.mcp.registry;

import com.example.agent.config.Config;
import com.example.agent.mcp.client.McpClient;
import com.example.agent.mcp.model.McpTool;
import com.example.agent.tools.ToolExecutionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@DisplayName("McpToolAdapter：MCP 工具适配器单元测试")
class McpToolAdapterTest {

    private McpClient mockClient;
    private McpTool mcpTool;
    private McpToolAdapter adapter;
    private ObjectMapper objectMapper;

    private static final String SERVER_ID = "test-server";
    private static final String SERVER_NAME = "Test Server";
    private static final String TOOL_NAME = "my_tool";
    private static final String TOOL_DESC = "My test tool";

    @BeforeEach
    void setUp() {
        mockClient = mock(McpClient.class);
        mcpTool = new McpTool();
        mcpTool.setName(TOOL_NAME);
        mcpTool.setDescription(TOOL_DESC);

        lenient().when(mockClient.getServerId()).thenReturn(SERVER_ID);
        lenient().when(mockClient.getServerName()).thenReturn(SERVER_NAME);

        adapter = new McpToolAdapter(mockClient, mcpTool);
        objectMapper = new ObjectMapper();
    }

    // ========== 工具命名 ==========

    @Nested
    @DisplayName("getName() 命名格式")
    class GetName {

        @Test
        @DisplayName("格式为 mcp_{serverId}_{toolName}")
        void usesMcpPrefixFormat() {
            assertEquals("mcp_" + SERVER_ID + "_" + TOOL_NAME, adapter.getName());
        }

        @Test
        @DisplayName("serverId 含下划线也能正确拼接")
        void handlesServerIdWithUnderscore() {
            when(mockClient.getServerId()).thenReturn("my_custom_server");
            McpToolAdapter a = new McpToolAdapter(mockClient, mcpTool);
            assertEquals("mcp_my_custom_server_" + TOOL_NAME, a.getName());
        }

        @Test
        @DisplayName("serverId 自带 mcp- 前缀时不重复拼接")
        void deduplicatesHyphenMcpPrefix() {
            when(mockClient.getServerId()).thenReturn("mcp-memory");
            McpToolAdapter a = new McpToolAdapter(mockClient, mcpTool);
            assertEquals("mcp_memory_" + TOOL_NAME, a.getName());
        }

        @Test
        @DisplayName("serverId 自带 mcp_ 前缀时不重复拼接")
        void deduplicatesUnderscoreMcpPrefix() {
            when(mockClient.getServerId()).thenReturn("mcp_echo");
            McpToolAdapter a = new McpToolAdapter(mockClient, mcpTool);
            assertEquals("mcp_echo_" + TOOL_NAME, a.getName());
        }
    }

    // ========== 工具描述 ==========

    @Nested
    @DisplayName("getDescription() 描述格式")
    class GetDescription {

        @Test
        @DisplayName("标记 MCP 来源并拼接原始描述")
        void marksMcpSource() {
            assertEquals("[MCP:" + SERVER_NAME + "] " + TOOL_DESC, adapter.getDescription());
        }

        @Test
        @DisplayName("工具描述为空时也正确拼接")
        void handlesEmptyToolDescription() {
            mcpTool.setDescription("");
            McpToolAdapter a = new McpToolAdapter(mockClient, mcpTool);
            assertEquals("[MCP:" + SERVER_NAME + "] ", a.getDescription());
        }

        @Test
        @DisplayName("工具描述为 null 时拼接 null 字面")
        void handlesNullToolDescription() {
            mcpTool.setDescription(null);
            McpToolAdapter a = new McpToolAdapter(mockClient, mcpTool);
            assertEquals("[MCP:" + SERVER_NAME + "] null", a.getDescription());
        }
    }

    // ========== 参数 Schema ==========

    @Nested
    @DisplayName("getParametersSchema() Schema 序列化")
    class GetParametersSchema {

        @Test
        @DisplayName("正常 schema 序列化为 JSON")
        void serializesSchema() throws Exception {
            Map<String, Object> schema = new HashMap<>();
            schema.put("type", "object");
            Map<String, Object> props = new HashMap<>();
            props.put("message", Map.of("type", "string"));
            schema.put("properties", props);
            mcpTool.setInputSchema(schema);

            String json = adapter.getParametersSchema();
            JsonNode parsed = objectMapper.readTree(json);
            assertEquals("object", parsed.get("type").asText());
            assertTrue(parsed.has("properties"));
        }

        @Test
        @DisplayName("schema 为 null 时返回 JSON null 字面 \"null\"")
        void handlesNullSchema() {
            mcpTool.setInputSchema(null);
            assertEquals("null", adapter.getParametersSchema());
        }

        @Test
        @DisplayName("空 schema Map 序列化为空对象 {}")
        void handlesEmptySchema() {
            mcpTool.setInputSchema(Collections.emptyMap());
            assertEquals("{}", adapter.getParametersSchema());
        }

        @Test
        @DisplayName("schema 含复杂嵌套结构也能正确序列化")
        void handlesNestedSchema() throws Exception {
            Map<String, Object> schema = new HashMap<>();
            schema.put("type", "object");
            schema.put("required", new String[]{"files"});

            Map<String, Object> filesProp = new HashMap<>();
            filesProp.put("type", "array");
            Map<String, Object> itemSchema = new HashMap<>();
            itemSchema.put("type", "string");
            filesProp.put("items", itemSchema);

            Map<String, Object> properties = new HashMap<>();
            properties.put("files", filesProp);
            schema.put("properties", properties);

            mcpTool.setInputSchema(schema);

            String json = adapter.getParametersSchema();
            JsonNode parsed = objectMapper.readTree(json);
            assertNotNull(parsed.get("type"));
            assertEquals("object", parsed.get("type").asText());
            assertNotNull(parsed.get("properties"));
            assertNotNull(parsed.get("properties").get("files"));
            assertNotNull(parsed.get("properties").get("files").get("type"));
            assertEquals("array", parsed.get("properties").get("files").get("type").asText());
        }
    }

    // ========== 工具执行 ==========

    @Nested
    @DisplayName("execute() 工具调用执行")
    class Execute {

        private int originalTimeout;

        @BeforeEach
        void saveConfig() {
            originalTimeout = Config.getInstance().getMcp().getRequestTimeout();
        }

        @AfterEach
        void restoreConfig() {
            Config.getInstance().getMcp().setRequestTimeout(originalTimeout);
        }

        @Test
        @DisplayName("成功调用返回序列化的 JSON 结果")
        void success() throws Exception {
            Map<String, Object> result = new HashMap<>();
            result.put("content", "Hello, world!");
            when(mockClient.callTool(eq(TOOL_NAME), anyMap()))
                    .thenReturn(CompletableFuture.completedFuture(result));

            ObjectNode args = objectMapper.createObjectNode();
            args.put("message", "test");
            String output = adapter.execute(args);

            JsonNode parsed = objectMapper.readTree(output);
            assertEquals("Hello, world!", parsed.get("content").asText());
            verify(mockClient).callTool(eq(TOOL_NAME), anyMap());
        }

        @Test
        @DisplayName("callTool 超时时抛出 ToolExecutionException")
        void timeout() {
            // 设置极短超时，使 .get() 立即超时
            Config.getInstance().getMcp().setRequestTimeout(1);
            // 返回一个永不完成的 Future
            when(mockClient.callTool(anyString(), anyMap()))
                    .thenReturn(new CompletableFuture<>());

            ObjectNode args = objectMapper.createObjectNode();
            args.put("message", "test");

            ToolExecutionException ex = assertThrows(
                    ToolExecutionException.class,
                    () -> adapter.execute(args)
            );
            assertTrue(ex.getMessage().contains("超时"),
                    "超时异常消息应包含'超时'，实际: " + ex.getMessage());
            assertTrue(ex.getMessage().contains(TOOL_NAME),
                    "超时异常消息应包含工具名，实际: " + ex.getMessage());
        }

        @Test
        @DisplayName("callTool 异常时抛出 ToolExecutionException")
        void toolCallFails() {
            when(mockClient.callTool(anyString(), anyMap()))
                    .thenReturn(CompletableFuture.failedFuture(new RuntimeException("执行失败")));

            ObjectNode args = objectMapper.createObjectNode();
            args.put("message", "test");

            ToolExecutionException ex = assertThrows(
                    ToolExecutionException.class,
                    () -> adapter.execute(args)
            );
            assertTrue(ex.getMessage().contains("执行失败"),
                    "异常消息应包含根因消息 '执行失败'，实际: " + ex.getMessage());
        }

        @Test
        @DisplayName("callTool 的 arguments 为 Map<String, Object> 格式")
        void argumentsConvertedToMap() throws Exception {
            Map<String, Object> result = new HashMap<>();
            result.put("ok", true);
            when(mockClient.callTool(eq(TOOL_NAME), anyMap()))
                    .thenReturn(CompletableFuture.completedFuture(result));

            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "/tmp/file.txt");
            args.put("recursive", true);
            adapter.execute(args);

            // verify callTool 收到的 Map 包含正确的键值
            verify(mockClient).callTool(eq(TOOL_NAME), argThat(map ->
                    "/tmp/file.txt".equals(map.get("path"))
                            && Boolean.TRUE.equals(map.get("recursive"))
            ));
        }

        @Test
        @DisplayName("非超时的 Future 异常包装为执行失败")
        void futureCompletesExceptionally() {
            when(mockClient.callTool(anyString(), anyMap()))
                    .thenReturn(CompletableFuture.failedFuture(
                            new IllegalStateException("连接断开")));

            ObjectNode args = objectMapper.createObjectNode();
            ToolExecutionException ex = assertThrows(
                    ToolExecutionException.class,
                    () -> adapter.execute(args)
            );
            // 改进后：异常消息应包含根因消息 "连接断开"
            assertTrue(ex.getMessage().contains("连接断开"),
                    "异常消息应包含根因消息 '连接断开'，实际: " + ex.getMessage());
        }

        @Test
        @DisplayName("ExecutionException 包装时提取内层根因消息")
        void unwrapsExecutionException() {
            // ExecutionException 是 CompletableFuture.get() 抛出的包装，内层是真正的原因
            when(mockClient.callTool(anyString(), anyMap()))
                    .thenReturn(CompletableFuture.failedFuture(
                            new ExecutionException(new IllegalArgumentException("无效参数: path不能为空"))));

            ObjectNode args = objectMapper.createObjectNode();
            ToolExecutionException ex = assertThrows(
                    ToolExecutionException.class,
                    () -> adapter.execute(args)
            );
            assertTrue(ex.getMessage().contains("path不能为空"),
                    "应从 ExecutionException 中提取内层根因消息，实际: " + ex.getMessage());
        }

        @Test
        @DisplayName("根因异常无消息时回退到类名")
        void fallbackToClassNameWhenNoMessage() {
            when(mockClient.callTool(anyString(), anyMap()))
                    .thenReturn(CompletableFuture.failedFuture(
                            new RuntimeException()));  // 无消息文本

            ObjectNode args = objectMapper.createObjectNode();
            ToolExecutionException ex = assertThrows(
                    ToolExecutionException.class,
                    () -> adapter.execute(args)
            );
            assertTrue(ex.getMessage().contains("RuntimeException"),
                    "无消息时应回退到异常类名，实际: " + ex.getMessage());
        }

        @Test
        @DisplayName("config.requestTimeout <= 0 时回退 60 秒默认值")
        void fallbackTimeout() throws Exception {
            Config.getInstance().getMcp().setRequestTimeout(0);

            Map<String, Object> result = Map.of("ok", true);
            when(mockClient.callTool(anyString(), anyMap()))
                    .thenReturn(CompletableFuture.completedFuture(result));

            ObjectNode args = objectMapper.createObjectNode();
            // 不应超时（回退到 60s）
            String output = adapter.execute(args);
            assertNotNull(output);
        }

        @Test
        @DisplayName("参数为 null（NullNode）时不会抛 NPE")
        void handlesNullArguments() throws Exception {
            Map<String, Object> result = Map.of("ok", true);
            when(mockClient.callTool(eq(TOOL_NAME), isNull()))
                    .thenReturn(CompletableFuture.completedFuture(result));

            // 传入 NullNode
            JsonNode nullArgs = objectMapper.nullNode();
            String output = adapter.execute(nullArgs);
            assertNotNull(output);
        }
    }

    // ========== ToolExecutor 默认接口方法 ==========

    @Nested
    @DisplayName("ToolExecutor 默认接口方法")
    class DefaultMethods {

        @Test
        @DisplayName("getAffectedPaths 返回空列表（MCP 工具默认不声明影响路径）")
        void getAffectedPathsReturnsEmpty() {
            ObjectNode args = objectMapper.createObjectNode();
            args.put("path", "test.txt");
            List<String> paths = adapter.getAffectedPaths(args);
            assertTrue(paths.isEmpty(), "MCP 工具应默认返回空影响路径列表");
        }

        @Test
        @DisplayName("getFilePaths 委托给 getAffectedPaths 返回空列表")
        void getFilePathsReturnsEmpty() {
            ObjectNode args = objectMapper.createObjectNode();
            List<String> paths = adapter.getFilePaths(args);
            assertTrue(paths.isEmpty(), "getFilePaths 应委托给 getAffectedPaths");
        }

        @Test
        @DisplayName("requiresFileLock 返回 false（MCP 工具默认不加文件锁）")
        void requiresFileLockReturnsFalse() {
            assertFalse(adapter.requiresFileLock());
        }

        @Test
        @DisplayName("shouldRunInBackground 返回 true（MCP 工具默认后台运行）")
        void shouldRunInBackgroundReturnsTrue() {
            assertTrue(adapter.shouldRunInBackground());
        }
    }
}
