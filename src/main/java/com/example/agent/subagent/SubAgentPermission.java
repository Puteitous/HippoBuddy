package com.example.agent.subagent;

import java.util.Set;

public class SubAgentPermission {
    private final Set<String> allowedTools;
    private final boolean requireToolCalls;
    private final String name;

    public static final SubAgentPermission DEFAULT = new SubAgentPermission(
        "DEFAULT",
        Set.of("read_file", "glob", "grep", "list_directory", "list_subagents"),
        true
    );

    public static final SubAgentPermission MEMORY_EXTRACTOR = new SubAgentPermission(
        "MEMORY_EXTRACTOR",
        Set.of("read_file", "write_file", "edit_file"),
        true
    );

    public static final SubAgentPermission MEMORY_CONSOLIDATOR = new SubAgentPermission(
        "MEMORY_CONSOLIDATOR",
        Set.of("read_file", "write_file", "edit_file"),
        true
    );

    public static final SubAgentPermission SESSION_MEMORY_UPDATER = new SubAgentPermission(
        "SESSION_MEMORY_UPDATER",
        Set.of("edit_file"),
        true
    );

    public static final SubAgentPermission READ_ONLY = new SubAgentPermission(
        "READ_ONLY",
        Set.of("read_file", "glob", "grep", "list_directory"),
        true
    );

    private SubAgentPermission(String name, Set<String> allowedTools, boolean requireToolCalls) {
        this.name = name;
        this.allowedTools = allowedTools;
        this.requireToolCalls = requireToolCalls;
    }

    public boolean isToolAllowed(String toolName) {
        return allowedTools.contains(toolName);
    }

    public Set<String> getAllowedTools() {
        return allowedTools;
    }

    public boolean isRequireToolCalls() {
        return requireToolCalls;
    }

    public String getName() {
        return name;
    }
}
