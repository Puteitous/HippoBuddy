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

        // 三级检查：命令链操作符 — 需用户确认（提供观察窗，让用户看到完整命令意图）
        if (hasCommandChaining(command)) {
            return HookResult.requireConfirmation(
                "命令链中使用操作符串联多条命令，请确认是否执行",
                "medium",
                command
            );
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
            // 参数感知检测：部分 ALLOWED 命令的特定子命令/参数需确认
            HookResult paramResult = checkParameterLevel(command, commandName);
            if (paramResult != null) {
                return paramResult;
            }
            return HookResult.allow();
        }

        // 默认策略：未知命令降级为用户确认（用户可在确认卡片中检查命令内容）
        return HookResult.requireConfirmation(
            "未知命令 '" + commandName + "'，请检查命令内容确认安全后执行",
            "medium",
            command
        );
    }

    /**
     * 参数感知检测 — 对白名单命令检查子命令/参数，判断是否需要用户确认
     *
     * @param command     完整命令原文
     * @param commandName 提取出的命令名
     * @return 需要确认时返回 HookResult，无需额外检查时返回 null
     */
    private static HookResult checkParameterLevel(String command, String commandName) {
        switch (commandName) {
            case "curl":
                if (hasOutputFlag(command)) {
                    return HookResult.requireConfirmation(
                        "curl 写文件操作可能覆盖文件或下载未知内容",
                        "medium",
                        command
                    );
                }
                return null;

            case "wget":
                if (hasOutputFlag(command)) {
                    return HookResult.requireConfirmation(
                        "wget 写文件操作可能下载未知内容",
                        "medium",
                        command
                    );
                }
                return null;

            case "git":
                if (isGitWriteOperation(command)) {
                    return HookResult.requireConfirmation(
                        "git 写操作可能修改提交历史或推送代码到远程仓库",
                        "medium",
                        command
                    );
                }
                return null;

            case "mvn":
                if (isMvnDeploy(command)) {
                    return HookResult.requireConfirmation(
                        "mvn deploy 会将构建产物推送到远程仓库",
                        "medium",
                        command
                    );
                }
                return null;

            case "docker":
                if (isDockerWriteOperation(command)) {
                    return HookResult.requireConfirmation(
                        "docker 写操作可能运行容器、构建镜像或删除资源",
                        "medium",
                        command
                    );
                }
                return null;

            case "npm":
            case "yarn":
            case "pnpm":
                if (isNpmWriteOperation(command)) {
                    return HookResult.requireConfirmation(
                        "包管理器写操作可能安装/卸载依赖或发布包",
                        "medium",
                        command
                    );
                }
                return null;

            case "pip":
            case "pip3":
                if (isPipWriteOperation(command)) {
                    return HookResult.requireConfirmation(
                        "pip 写操作可能安装/卸载 Python 包",
                        "medium",
                        command
                    );
                }
                return null;

            default:
                return null;
        }
    }

    // ==================== 参数感知辅助方法 ====================

    private static boolean hasOutputFlag(String command) {
        return command.matches(".*\\b(curl|wget)\\b.*\\s(-o\\s+|--output\\s+|-O(\\s|$)).*");
    }

    private static boolean isGitWriteOperation(String command) {
        return command.matches(".*\\bgit\\b.*\\b(push|commit|reset|rebase|merge|tag|stash\\s+save|checkout\\s+-b)\\b.*");
    }

    private static boolean isMvnDeploy(String command) {
        return command.matches(".*\\bmvn\\b.*\\bdeploy\\b.*");
    }

    private static boolean isDockerWriteOperation(String command) {
        return command.matches(".*\\bdocker\\b.*\\b(run|build|push|rm|rmi|stop|kill)\\b.*");
    }

    private static boolean isNpmWriteOperation(String command) {
        if (command.matches(".*\\b(npm|yarn|pnpm)\\b.*\\b(install|uninstall|publish|add|remove)\\b.*")) {
            return true;
        }
        if (command.matches(".*\\b(npm|yarn|pnpm)\\b.*\\brun\\s+(build|start|lint|test|dev)\\b.*")) {
            return false;
        }
        return command.matches(".*\\b(npm|yarn|pnpm)\\b.*\\brun\\s+\\S+\\b.*");
    }

    private static boolean isPipWriteOperation(String command) {
        return command.matches(".*\\b(pip|pip3)\\b.*\\b(install|uninstall)\\b.*");
    }

    /** 检测命令替换注入操作符（`、$()）— 严格禁止 */
    private boolean hasCommandSubstitution(String command) {
        return command.contains("`") || command.contains("$(");
    }

    /** 检测命令链操作符（;、&&、||）— 需用户确认，提供观察窗 */
    private boolean hasCommandChaining(String command) {
        return command.contains(";") || command.contains("&&") ||
               command.contains("||");
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
