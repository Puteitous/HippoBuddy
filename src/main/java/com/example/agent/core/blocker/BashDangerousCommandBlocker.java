package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Set;

public class BashDangerousCommandBlocker implements Blocker {

    /** ✅ 自动放行命令 — 只读/安全/高频开发操作 */
    private static final Set<String> ALLOWED_COMMANDS = Set.of(
        // 版本控制
        "git",
        // 构建工具
        "mvn", "gradle", "npm", "yarn", "pnpm",
        // Java 工具
        "javac", "java", "jar", "javadoc",
        // 脚本语言
        "python", "python3", "node", "deno",
        // 包管理（只读）
        "pip", "pip3",
        // 文件读取/浏览
        "ls", "dir", "cat", "type", "more", "less", "head", "tail",
        // 文件创建（无害）
        "mkdir", "touch",
        // 搜索/过滤
        "grep", "findstr", "find", "wc", "sort", "uniq",
        // 信息查询
        "pwd", "echo", "printf", "which", "where",
        // 网络诊断（只读）
        "ping", "traceroute", "tracert",
        // 目录导航（完全无害）
        "cd", "chdir", "pushd", "popd",
        // 环境变量（只读）
        "set",
        // 网络（只读 GET）
        "curl", "wget",
        // 容器（只读子命令在 ALLOWED，run/build 在确认层）
        "docker"
    );

    /** ❓ 需要用户确认 — 有副作用但使用场景常见 */
    private static final Set<String> REQUIRES_CONFIRMATION = Set.of(
        // 删除操作
        "rm", "del", "rmdir", "rd",
        // 文件操作（可能覆盖）
        "cp", "copy", "xcopy", "mv", "move", "rename", "ren", "ln",
        // 权限修改（非 777 级别已在 DANGEROUS_PATTERNS）
        "chmod", "chown", "attrib",
        // 进程管理
        "kill", "pkill", "taskkill",
        // 压缩/解压
        "tar", "unzip", "zip", "gzip", "gunzip", "7z",
        // 提权
        "sudo", "su",
        // 脚本执行
        "sh", "bash", "zsh"
    );

    /** 🚫 严格禁止 — 系统破坏/不可逆操作 */
    private static final Set<String> STRICTLY_BLOCKED = Set.of(
        "format", "fdisk", "parted", "mkfs", "fsck",
        "shutdown", "reboot", "halt", "poweroff",
        "dd"
    );

    private static final Set<String> DANGEROUS_PATTERNS = Set.of(
        // 毁灭性删除
        "rm -rf /", "rm -fr /", "rm -rf ~",
        "rmdir /s", "del /f", "del /s",
        // 磁盘操作
        "format c:", "fdisk", "parted", "mkfs", "dd if=",
        // 公开权限
        "chmod 777", "chmod -r 777",
        // 系统控制
        "shutdown", "reboot", "halt", "poweroff",
        // 危险设备写入
        "> /dev/",
        // 管道到 shell（curl/wget ... | bash/sh）
        "| bash", "| sh", "| zsh",
        // Fork 炸弹
        ":(){ :|:& };:", "fork bomb"
    );

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        if (!"bash".equals(toolName)) {
            return HookResult.allow();
        }

        if (!arguments.has("command") || arguments.get("command").isNull()) {
            return HookResult.allow();
        }

        String command = arguments.get("command").asText();

        if (command == null || command.trim().isEmpty()) {
            return HookResult.allow();
        }
        command = command.trim().toLowerCase();

        // 一级检查：命令替换注入 — 直接严格禁止
        if (hasCommandSubstitution(command)) {
            return HookResult.block(
                "安全限制: 检测到命令替换操作符（`、$()），禁止执行"
            );
        }

        // 二级检查：高危模式 — 直接严格禁止
        for (String pattern : DANGEROUS_PATTERNS) {
            if (command.contains(pattern)) {
                return HookResult.block(
                    String.format("安全限制: 检测到危险命令模式 '%s'", pattern)
                );
            }
        }

        // 提取命令名前先检查是否以 ./ 或 ../ 开头（本地脚本执行）
        if (command.startsWith("./") || command.startsWith("../")) {
            return HookResult.requireConfirmation(
                "执行本地脚本可能带来未知风险",
                "medium",
                command
            );
        }

        // 提取命令名
        String commandName = extractCommandName(command);

        // 四级检查：严格禁止名单
        if (STRICTLY_BLOCKED.contains(commandName)) {
            return HookResult.block(
                "安全限制: 命令 '" + commandName + "' 被禁止执行"
            );
        }

        // 五级检查：需要确认名单
        if (REQUIRES_CONFIRMATION.contains(commandName)) {
            return HookResult.requireConfirmation(
                "命令 '" + commandName + "' 可能有副作用，请确认是否执行",
                "medium",
                command
            );
        }

        // 六级检查：自动放行名单
        if (ALLOWED_COMMANDS.contains(commandName)) {
            return HookResult.allow();
        }

        // 默认策略：未知命令降级为用户确认（用户可在确认卡片中检查命令内容）
        return HookResult.requireConfirmation(
            "未知命令 '" + commandName + "'，请检查命令内容确认安全后执行",
            "medium",
            command
        );
    }

    /** 检测命令替换注入操作符（`、$()）— 严格禁止 */
    private boolean hasCommandSubstitution(String command) {
        return command.contains("`") || command.contains("$(");
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
                return cmd.substring(lastSlash + 1)
                    .replaceAll("[^a-zA-Z0-9]$", "")
                    .toLowerCase();
            }
            return cmd.replaceAll("[^a-zA-Z0-9]$", "").toLowerCase();
        }
        return command.replaceAll("[^a-zA-Z0-9]$", "").toLowerCase();
    }
}
