package com.example.agent.memory;

import java.util.Set;

/**
 * Bash 工具安全性检查器
 * 
 * 用于判断 Bash 命令是否为只读操作，防止记忆系统执行写操作或危险命令
 */
public class BashTool {

    private static final Set<String> SAFE_COMMANDS = Set.of(
        "ls", "cat", "grep", "find", "stat", "wc", "head", "tail",
        "dir", "type", "more", "less", "echo", "pwd", "tree", "printf",
        "awk", "sed", "sort", "uniq", "cut", "tr", "xargs",
        "python", "python3", "node", "deno",
        "pip", "pip3", "which", "where",
        "ping", "traceroute", "tracert",
        "cd", "chdir", "pushd", "popd", "set",
        "docker"
    );

    private static final Set<String> DANGEROUS_COMMANDS = Set.of(
        "rm", "mv", "cp", "chmod", "chown", "ln", "mkdir", "rmdir",
        "touch", "git", "svn", "npm", "mvn", "gradle", "./",
        "curl", "wget", "scp", "rsync", "tar", "zip", "unzip",
        "dd", "sh", "bash", "zsh", "fish", "ksh", "csh", "tcsh",
        "tee"  // tee 会写文件
    );

    /**
     * 判断命令是否为只读操作
     * 
     * @param command 要检查的 Bash 命令
     * @return true 如果是只读命令，false 如果包含写操作或危险操作
     */
    public static boolean isReadOnly(String command) {
        SafetyLevel level = assessSafetyLevel(command);
        // 只有 SAFE 和 LOW_RISK（管道）被认为是只读的
        return level == SafetyLevel.SAFE || level == SafetyLevel.LOW_RISK;
    }

    /**
     * 检测命令是否包含危险命令词
     */
    private static boolean containsDangerousCommand(String command) {
        String[] tokens = command.split("\\s+");
        for (String token : tokens) {
            // 检查完整词匹配
            if (DANGEROUS_COMMANDS.contains(token)) {
                return true;
            }
            // 检查路径中的危险命令（如 ./script.sh）
            if (token.startsWith("./") || token.startsWith("../")) {
                return true;
            }
        }
        return false;
    }

    /**
     * 检查命令是否为安全命令
     */
    private static boolean isSafeCommand(String command) {
        String[] tokens = command.split("\\s+");
        if (tokens.length == 0) {
            return false;
        }

        // 获取基础命令名（处理路径）
        String baseCommand = tokens[0];
        int lastSlash = baseCommand.lastIndexOf('/');
        if (lastSlash >= 0 && lastSlash < baseCommand.length() - 1) {
            baseCommand = baseCommand.substring(lastSlash + 1);
        }

        return SAFE_COMMANDS.contains(baseCommand);
    }

    /**
     * 安全等级枚举
     */
    public enum SafetyLevel {
        SAFE,           // 完全安全的只读操作
        LOW_RISK,       // 低风险（如管道操作）
        MEDIUM_RISK,    // 中风险（如复杂命令组合）
        HIGH_RISK       // 高风险（重定向、命令替换）
    }

    /**
     * 获取命令的安全等级（决策树模型）
     * 
     * 决策优先级：
     * 1. 空命令 → HIGH_RISK
     * 2. 包含重定向、命令替换或命令链 → HIGH_RISK（写操作前兆）
     * 3. 包含危险命令 → HIGH_RISK
     * 4. 包含管道 → LOW_RISK（数据处理）
     * 5. 白名单命令 → SAFE
     * 6. 其他 → MEDIUM_RISK
     */
    public static SafetyLevel assessSafetyLevel(String command) {
        if (command == null || command.trim().isEmpty()) {
            return SafetyLevel.HIGH_RISK;
        }

        String trimmed = command.trim();

        // 第一级：检测最高风险操作（重定向、命令替换、命令链）
        if (hasRedirect(trimmed) || hasCommandSubstitution(trimmed) || hasCommandChain(trimmed)) {
            return SafetyLevel.HIGH_RISK;
        }

        // 第二级：检测危险命令
        if (containsDangerousCommand(trimmed)) {
            return SafetyLevel.HIGH_RISK;
        }

        // 第三级：检测管道（通常是安全的，但需要警惕）
        if (hasPipe(trimmed)) {
            // 管道 + 白名单命令 → SAFE
            // 管道 + 非白名单命令 → LOW_RISK
            if (isAllSafeCommands(trimmed)) {
                return SafetyLevel.SAFE;
            } else {
                return SafetyLevel.LOW_RISK;
            }
        }

        // 第四级：检测是否为白名单命令
        if (isSafeCommand(trimmed)) {
            return SafetyLevel.SAFE;
        }

        // 默认：中等风险
        return SafetyLevel.MEDIUM_RISK;
    }

    /**
     * 检测是否包含重定向操作符
     */
    private static boolean hasRedirect(String command) {
        // 检测 > >> < 等重定向
        return command.matches(".*[>].*") || command.matches(".*\\s<\\s.*");
    }

    /**
     * 检测是否包含管道操作符
     */
    private static boolean hasPipe(String command) {
        return command.contains("|");
    }

    /**
     * 检测是否包含命令替换
     */
    private static boolean hasCommandSubstitution(String command) {
        return command.contains("$(") || command.contains("`");
    }

    /**
     * 检测是否包含命令链操作符
     */
    private static boolean hasCommandChain(String command) {
        // 检测 && || ; & 等命令链操作符
        return command.contains("&&") || command.contains("||") || 
               command.matches(".*\\s;\\s.*") || command.matches(".*\\s&\\s.*");
    }

    /**
     * 检测管道中的所有命令是否都是安全的
     */
    private static boolean isAllSafeCommands(String command) {
        String[] parts = command.split("\\|");
        for (String part : parts) {
            if (!isSafeCommand(part.trim())) {
                return false;
            }
        }
        return true;
    }

    /**
     * 获取命令的安全等级描述（向后兼容）
     */
    public static String getSafetyLevel(String command) {
        SafetyLevel level = assessSafetyLevel(command);
        return level.name();
    }
}
