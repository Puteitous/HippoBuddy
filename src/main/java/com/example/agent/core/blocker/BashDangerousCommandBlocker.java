package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Set;

public class BashDangerousCommandBlocker implements Blocker {

    private static final Set<String> DANGEROUS_PATTERNS = Set.of(
        "rm -rf", "rm -fr", "rmdir /s", "del /f", "del /s",
        "format", "fdisk", "mkfs", "dd if=",
        "sudo", "su root", "chmod 777", "chown",
        "> /dev/", "shutdown", "reboot", "halt",
        ":(){ :|:& };:", "fork bomb"
    );

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        if (!"bash".equals(toolName)) {
            return HookResult.allow();
        }

        if (!arguments.has("command")) {
            return HookResult.allow();
        }

        String command = arguments.get("command").asText().toLowerCase();

        for (String pattern : DANGEROUS_PATTERNS) {
            if (command.contains(pattern)) {
                return HookResult.validationError(
                    String.format("危险命令模式: %s", pattern),
                    "请使用白名单内的安全命令（git、cat、grep、ls 等）"
                );
            }
        }

        return HookResult.allow();
    }
}
