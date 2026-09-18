package com.example.agent.mcp.registry;

import com.example.agent.config.Config;
import com.example.agent.mcp.client.McpClient;
import com.example.agent.mcp.model.McpTool;
import com.example.agent.tools.ToolExecutor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.concurrent.TimeUnit;

public class McpToolAdapter implements ToolExecutor {

    private final McpClient client;
    private final McpTool tool;
    private final String fullToolName;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public McpToolAdapter(McpClient client, McpTool tool) {
        this.client = client;
        this.tool = tool;
        this.fullToolName = "mcp_" + normalizeServerId(client.getServerId()) + "_" + tool.getName();
    }

    /**
     * 归一化 serverId，去掉多余的 mcp 前缀。
     * <p>
     * 工具名约定为 {@code mcp_{serverId}_{toolName}}，而 serverId 往往自带 mcp 前缀
     * （配置与插件市场里普遍写作 {@code mcp-memory}、{@code mcp-fetch}），
     * 不去重就会拼出 {@code mcp_mcp-memory_create_entities} 这类重复前缀。
     * </p>
     */
    private static String normalizeServerId(String serverId) {
        if (serverId.length() > 4
                && (serverId.regionMatches(true, 0, "mcp_", 0, 4)
                    || serverId.regionMatches(true, 0, "mcp-", 0, 4))) {
            return serverId.substring(4);
        }
        return serverId;
    }

    @Override
    public String getName() {
        return fullToolName;
    }

    @Override
    public String getDescription() {
        return "[MCP:" + client.getServerName() + "] " + tool.getDescription();
    }

    @Override
    public String getParametersSchema() {
        try {
            return objectMapper.writeValueAsString(tool.getInputSchema());
        } catch (Exception e) {
            return "{}";
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public String execute(JsonNode arguments) throws com.example.agent.tools.ToolExecutionException {
        // 工具调用超时优先读 config.mcp.request_timeout（ms），缺失时回退 60 秒
        long timeoutMs = Config.getInstance().getMcp().getRequestTimeout();
        if (timeoutMs <= 0) {
            timeoutMs = 60000;
        }
        try {
            Map<String, Object> args = objectMapper.convertValue(arguments, Map.class);
            Object result = client.callTool(tool.getName(), args)
                    .get(timeoutMs, TimeUnit.MILLISECONDS);
            return objectMapper.writeValueAsString(result);
        } catch (java.util.concurrent.TimeoutException e) {
            throw new com.example.agent.tools.ToolExecutionException("MCP工具执行超时: " + tool.getName(), e);
        } catch (Exception e) {
            // 提取根因消息，LLM 据此判断是重试、改参数还是报给用户
            String detail = extractRootCauseMessage(e);
            throw new com.example.agent.tools.ToolExecutionException(
                    "MCP工具执行失败: " + tool.getName() + " - " + detail, e);
        }
    }

    /**
     * 从异常链中提取最内层的可读消息，用于生成 LLM 友好的错误描述。
     * <p>
     * CompletableFuture.get() 抛出的 ExecutionException 会把原始异常包装一层，
     * 直接取 getMessage() 得到的是 "java.lang.RuntimeException: xxx" 类名前缀，
     * 剥离后才是真正的错误描述。
     * </p>
     */
    private static String extractRootCauseMessage(Exception e) {
        Throwable t = e;
        // 沿 cause 链走到最内层
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        String msg = t.getMessage();
        if (msg != null && !msg.isBlank()) {
            // 截断超长消息，防止撑爆上下文
            return msg.length() <= 200 ? msg : msg.substring(0, 200) + "…";
        }
        // 无消息文本时回退到类名
        return t.getClass().getSimpleName();
    }
}
