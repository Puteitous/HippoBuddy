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
        return allowedTools.contains(toolName);
    }

    public String getFullDisplayName() {
        return icon + " " + displayName;
    }
}
