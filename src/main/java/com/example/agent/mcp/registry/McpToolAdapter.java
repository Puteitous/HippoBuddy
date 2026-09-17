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
        this.fullToolName = "mcp_" + client.getServerId() + "_" + tool.getName();
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
            throw new com.example.agent.tools.ToolExecutionException("MCP工具执行失败: " + tool.getName(), e);
        }
    }
}
