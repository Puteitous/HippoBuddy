package com.example.agent.core;

import java.util.Set;

public enum AgentMode {

    CHAT("💬", "聊天模式", "只读探索，提供建议，不修改文件",
        Set.of(
            "read_file", "read_office_file",
            "list_directory", "glob", "grep",
            "ask_user",
            "skill",
            "web_search", "web_fetch"
        )
    ),

    CODING("🛠️", "构建模式", "全权限执行，自动完成任务",
        Set.of(
            "read_file", "read_office_file",
            "write_file", "edit_file", "undo_file", "delete_file",
            "list_directory", "glob", "grep",
            "ask_user",
            "bash",
            "todo_write",
            "skill",
            "web_search", "web_fetch",
            "lint_diagnostics",
            "fork_agent", "fork_agents", "list_subagents", "cancel_subagent"
        )
    ),

    OFFICE("📊", "办公模式", "办公效率助手，擅长文档/表格/演示文稿处理",
        Set.of(
            "read_file", "read_office_file",
            "write_file", "edit_file", "undo_file", "delete_file",
            "list_directory", "glob", "grep",
            "ask_user",
            "bash",
            "todo_write",
            "skill",
            "web_search", "web_fetch",
            "lint_diagnostics",
            "fork_agent", "fork_agents", "list_subagents", "cancel_subagent"
        )
    );

    /**
     * MCP 工具名前缀。
     * <p>
     * McpToolAdapter 生成的工具名固定为 {@code mcp_{serverId}_{toolName}}。
     * 这类工具来自用户显式安装并配置的 MCP Server，不属于模式白名单的管控范围
     * （白名单只圈定内置工具，用于区分只读/可写能力），故所有模式一律放行；
     * 其可用性由 MCP 连接状态与 Server 自身配置决定。
     * </p>
     */
    private static final String MCP_TOOL_PREFIX = "mcp_";

    private final String icon;
    private final String displayName;
    private final String description;
    private final Set<String> allowedTools;

    AgentMode(String icon, String displayName, String description, Set<String> allowedTools) {
        this.icon = icon;
        this.displayName = displayName;
        this.description = description;
        this.allowedTools = allowedTools;
    }

    public String getIcon() {
        return icon;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getDescription() {
        return description;
    }

    public Set<String> getAllowedTools() {
        return allowedTools;
    }

    public boolean isToolAllowed(String toolName) {
        if (toolName == null) {
            return false;
        }
        // MCP 工具不参与模式白名单：否则注册进 ToolRegistry 后会被过滤掉，
        // 既进不了 LLM 的 tools 参数，也会在 executeToolCalls 被当成越权调用拒绝。
        return allowedTools.contains(toolName) || toolName.startsWith(MCP_TOOL_PREFIX);
    }

    public String getFullDisplayName() {
        return icon + " " + displayName;
    }
}
