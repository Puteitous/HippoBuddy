package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Set;

public class BashDangerousCommandBlocker implements Blocker {

    private static final Set<String> ALLOWED_COMMANDS = Set.of(
        "git", "mvn", "gradle", "npm", "yarn", "pnpm",
        "javac", "java", "jar", "javadoc",
        "ls", "dir", "cat", "type", "more", "pwd", "echo", "mkdir", "touch",
        "grep", "find", "findstr", "wc", "head", "tail", "sort", "uniq",
        "curl", "wget", "where"
    );

    private static final Set<String> BLOCKED_COMMANDS = Set.of(
        "rm", "del", "rmdir", "rd", "format", "fdisk",
        "sudo", "su", "chmod", "chown",
        "shutdown", "reboot", "halt", "poweroff",
        "dd", "mkfs", "fsck"
    );

    private static final Set<String> DANGEROUS_PATTERNS = Set.of(
        "rm -rf", "rm -fr", "rmdir /s", "del /f", "del /s",
        "format", "fdisk", "mkfs", "dd if=",
        "sudo", "su root", "chmod 777", "chown",
        "> /dev/", "shutdown", "reboot", "halt", "poweroff",
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

        if (command == null || command.trim().isEmpty()) {
            return HookResult.allow();
        }
        command = command.trim();

        if (hasShellOperators(command)) {
            return HookResult.validationError(
                "安全限制: 检测到危险的 shell 操作符",
                "禁止使用命令链接（;、&&、||）和命令替换（`、$()）"
            );
        }

        for (String pattern : DANGEROUS_PATTERNS) {
            if (command.contains(pattern)) {
                return HookResult.validationError(
                    String.format("危险命令模式: %s", pattern),
                    "请使用白名单内的安全命令（git、cat、grep、ls 等）"
                );
            }
        }

        String commandName = extractCommandName(command);

        if (BLOCKED_COMMANDS.contains(commandName)) {
            return HookResult.validationError(
                "安全限制: 命令 '" + commandName + "' 被禁止执行",
                "为了系统安全，此类操作被禁止"
            );
        }

        if (!ALLOWED_COMMANDS.contains(commandName)) {
            return HookResult.validationError(
                "安全限制: 命令 '" + commandName + "' 不在允许列表中",
                "允许的命令: " + String.join(", ", ALLOWED_COMMANDS)
            );
        }

        return HookResult.allow();
    }

    private boolean hasShellOperators(String command) {
        return command.contains(";") || command.contains("&&") ||
               command.contains("||") || command.contains("`") ||
               command.contains("$(");
    }

    private String extractCommandName(String command) {
        String firstPart = command.split("\\|")[0].trim();
        firstPart = firstPart.split(">")[0].trim();
        firstPart = firstPart.split(">>")[0].trim();
        String[] parts = firstPart.split("\\s+");
        if (parts.length > 0) {
            String cmd = parts[0];
            int lastSlash = cmd.lastIndexOf('/');
            if (lastSlash >= 0 && lastSlash < cmd.length() - 1) {
                return cmd.substring(lastSlash + 1).toLowerCase();
            }
            return cmd.toLowerCase();
        }
        return command.toLowerCase();
    }
}
