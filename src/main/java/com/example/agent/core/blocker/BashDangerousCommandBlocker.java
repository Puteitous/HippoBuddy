package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.regex.Pattern;

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
        // 删除操作（含 Windows 别名，对齐 del/rmdir）
        "rm", "del", "rmdir", "rd", "erase",
        // 文件操作（可能覆盖）
        "cp", "copy", "xcopy", "mv", "move", "rename", "ren", "ln",
        // 权限修改（非 777 级别已在 DANGEROUS_PATTERNS/签名层）
        "chmod", "chown", "attrib",
        // 进程管理
        "kill", "pkill", "taskkill",
        // 压缩/解压
        "tar", "unzip", "zip", "gzip", "gunzip", "7z",
        // 提权
        "sudo", "su",
        // 脚本执行
        "sh", "bash", "zsh",
        // Windows 注册表 / 磁盘工具（危险子命令在签名层严格禁止）
        "reg", "cipher",
        // 数据擦除
        "wipe"
    );

    /** 🚫 严格禁止 — 系统破坏/不可逆操作 */
    private static final Set<String> STRICTLY_BLOCKED = Set.of(
        "format", "fdisk", "parted", "mkfs", "fsck",
        "shutdown", "reboot", "halt", "poweroff",
        "dd",
        // 磁盘分区工具：clean/format/delete 等子命令均不可逆，整体禁止
        "diskpart"
    );

    private static final Set<String> DANGEROUS_PATTERNS = Set.of(
        // 毁灭性删除
        "rm -rf /", "rm -fr /", "rm -rf ~",
        "rmdir /s", "del /f", "del /s",
        // Windows 递归删除别名（与 rmdir /s、del /s 对齐）
        "rd /s", "erase /s",
        // 磁盘操作
        "format c:", "fdisk", "parted", "mkfs", "dd if=",
        // 公开权限
        "chmod 777", "chmod -r 777",
        // 系统控制
        "shutdown", "reboot", "halt", "poweroff",
        // 注册表删除
        "reg delete",
        // 磁盘覆写（cipher /w 覆写删除数据）
        "cipher /w",
        // 磁盘分区工具
        "diskpart",
        // 危险设备写入
        "> /dev/",
        // 管道到 shell（curl/wget ... | bash/sh）
        "| bash", "| sh", "| zsh",
        // Fork 炸弹
        ":(){ :|:& };:", "fork bomb"
    );

    /**
     * 未知命令的破坏性特征：内容级兜底检查（不依赖命令名）。
     * <p>
     * 语义：未知命令（不在任何名单）默认放行，避免卡死新工具/冷门命令
     * （如 bun、uv、jq、rg 等）；但命中"明显破坏行为"特征时仍然严格拒绝。
     * 这些特征按<b>命令内容</b>判断而非命令名，可覆盖"未知命令 + 危险参数"
     * 的组合场景（如 powershell -Command "taskkill /f /im explorer.exe"）。
     * 已知命令已有 ALLOWED / REQUIRES_CONFIRMATION / STRICTLY_BLOCKED
     * 名单及 token 级签名精细管控，此处仅兜底未知命令。
     */
    private static final List<Pattern> DESTRUCTIVE_FEATURES = List.of(
        // 1. 重定向写入 Windows 系统路径（> C:\Windows\...、> C:\Program Files\...）
        Pattern.compile("(?i)>\\s*[a-z]:\\\\windows(\\\\|\\s|$)"),
        Pattern.compile("(?i)>\\s*[a-z]:\\\\program\\s+files(\\\\|\\s|$)"),
        // 2. 重定向写入 Unix 系统路径（> /etc/...、> /usr/...）
        Pattern.compile("(?i)>\\s*/(etc|usr|var|boot|bin|sbin|lib)(/|\\s|$)"),
        // 3. 路径穿越 + 写入/删除（..\..\ 逃出工作区配合破坏操作，无序匹配）
        Pattern.compile("(?i)(?=.*\\.\\.(\\\\|/))(?=.*(>|>>|del\\s|rm\\s|remove|delete|erase))"),
        // 4. Windows 系统配置修改（注册表/防火墙/服务/引导/计划任务）
        Pattern.compile("(?i)reg\\s+add\\s+HKLM"),
        Pattern.compile("(?i)netsh\\s+(advfirewall|firewall)"),
        Pattern.compile("(?i)sc\\s+config"),
        Pattern.compile("(?i)bcdedit\\s+/"),
        Pattern.compile("(?i)schtasks\\s+/create"),
        // 5. 系统用户/权限管理
        Pattern.compile("(?i)net\\s+(user|localgroup)(\\s|$)"),
        Pattern.compile("(?i)(usermod|passwd)(\\s+|$)"),
        // 6. 系统关键进程强杀（含嵌入未知命令的组合场景）
        Pattern.compile("(?i)taskkill\\s+/f\\s+/im\\s+(explorer|winlogon|lsass|svchost|csrss|services)(\\.exe)?"),
        Pattern.compile("(?i)kill\\s+-9\\s+[123](\\s|$)"),
        // wmic 进程终止（Windows 弃用但部分环境仍可用）
        Pattern.compile("(?i)wmic\\s+process.*call\\s+terminate"),
        // 7. 防火墙全局规则清空/禁用
        Pattern.compile("(?i)iptables\\s+-[FX]"),
        Pattern.compile("(?i)ufw\\s+(disable|reset)"),
        // 8. 磁盘级数据擦除
        Pattern.compile("(?i)(shred|sdelete|secure\\s+erase)(\\s+|$)")
    );

    /**
     * token 级危险签名：命令名 + 必须出现的参数组合。
     * 解决子串黑名单挡不住"参数顺序变体 / 合并参数"的问题
     * （如 rm -r -f /、del /q /s F:\*、chmod -R 777）。
     * <p>
     * 匹配规则：段参数（含合并 flag 展开，如 -rf → -r、-f）必须包含全部
     * requiredTokens；若指定 targetPattern，则至少一个位置参数命中。
     */
    private static final class DangerSignature {
        private final Set<String> requiredTokens;
        private final Pattern targetPattern;

        DangerSignature(Set<String> requiredTokens, Pattern targetPattern) {
            this.requiredTokens = requiredTokens;
            this.targetPattern = targetPattern;
        }

        boolean matches(CommandParser.Segment seg) {
            List<String> args = seg.getArgs();
            // 合并 flag 展开：-rf → -r、-f；/sq → /s、/q（保留原始 token）
            Set<String> expanded = new HashSet<>(args);
            for (String a : args) {
                if (isExpandableFlag(a)) {
                    char prefix = a.charAt(0);
                    for (int i = 1; i < a.length(); i++) {
                        expanded.add(String.valueOf(prefix) + a.charAt(i));
                    }
                }
            }
            if (!expanded.containsAll(requiredTokens)) {
                return false;
            }
            if (targetPattern == null) {
                return true;
            }
            // 不按 "-/开头" 排除 token：DANGEROUS_TARGET 本身足够精确
            // （只匹配根/家目录/系统目录/盘符根），普通 flag（如 /s、-r）不会误命中。
            for (String a : args) {
                if (targetPattern.matcher(a).matches()) {
                    return true;
                }
            }
            return false;
        }

        private static boolean isExpandableFlag(String a) {
            return a.length() > 2 && (a.startsWith("-") || a.startsWith("/"))
                    && !a.startsWith("--") && !a.startsWith("//");
        }
    }

    /** 危险删除目标：根、家目录、系统目录、Windows 盘符根 */
    private static final Pattern DANGEROUS_TARGET = Pattern.compile(
        "(?i)^(/|/(home|etc|usr|var|boot|bin|sbin|lib|lib64)(/.*)?|[a-z]:[\\\\/]|~(/.*)?)$"
    );

    /** 命令名 → 危险签名列表（任一命中即严格禁止） */
    private static final Map<String, List<DangerSignature>> DANGEROUS_SIGNATURES = new HashMap<>();

    static {
        // Unix：rm 递归强制删除危险目标（rm -rf /、rm -r -f /home、rm -rf ~ 等变体）
        DANGEROUS_SIGNATURES.put("rm", List.of(
            new DangerSignature(Set.of("-r", "-f"), DANGEROUS_TARGET)
        ));
        // Windows：递归删除（任意目标都不可逆，与子串 rmdir /s、del /s 对齐）
        DANGEROUS_SIGNATURES.put("del", List.of(new DangerSignature(Set.of("/s"), null)));
        DANGEROUS_SIGNATURES.put("erase", List.of(new DangerSignature(Set.of("/s"), null)));
        DANGEROUS_SIGNATURES.put("rmdir", List.of(new DangerSignature(Set.of("/s"), null)));
        DANGEROUS_SIGNATURES.put("rd", List.of(new DangerSignature(Set.of("/s"), null)));
        // 注册表删除（reg query 等只读子命令仍走需确认）
        DANGEROUS_SIGNATURES.put("reg", List.of(new DangerSignature(Set.of("delete"), null)));
        // 磁盘覆写删除
        DANGEROUS_SIGNATURES.put("cipher", List.of(new DangerSignature(Set.of("/w"), null)));
        // 公开权限（chmod 777 任意目标；-R 组合在参数展开后同样命中）
        DANGEROUS_SIGNATURES.put("chmod", List.of(new DangerSignature(Set.of("777"), null)));
    }

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

        // 三级检查：逐段解析 — 链式命令的每一段都独立走完整分级。
        // 任一段严格禁止 → 整条禁止；无禁止但任一段需确认 → 整条需确认。
        List<CommandParser.Segment> segments = CommandParser.parse(command);
        if (segments.isEmpty()) {
            return HookResult.allow();
        }
        if (segments.size() == 1) {
            return checkSegment(segments.get(0));
        }

        boolean anyConfirmation = false;
        for (CommandParser.Segment seg : segments) {
            HookResult result = checkSegment(seg);
            if (result.isDenied()) {
                return result;
            }
            if (result.isConfirmationRequired()) {
                anyConfirmation = true;
            }
        }
        if (anyConfirmation) {
            return HookResult.requireConfirmation(
                "i18n:blocker.bash.chainedCommand",
                "medium",
                command
            );
        }
        return HookResult.allow();
    }

    /** 对单个命令段执行完整分级检查 */
    private HookResult checkSegment(CommandParser.Segment seg) {
        String raw = seg.getRaw();

        // 本地脚本执行
        if (raw.startsWith("./") || raw.startsWith("../")) {
            return HookResult.requireConfirmation(
                "i18n:blocker.bash.localScript",
                "medium",
                raw
            );
        }

        String commandName = seg.getCommandName();
        if (commandName.isEmpty()) {
            return HookResult.allow();
        }

        // 四级检查：严格禁止名单
        if (STRICTLY_BLOCKED.contains(commandName)) {
            return HookResult.block(
                "安全限制: 命令 '" + commandName + "' 被禁止执行"
            );
        }

        // 五级检查：token 级危险签名（防参数变体绕过）
        List<DangerSignature> signatures = DANGEROUS_SIGNATURES.get(commandName);
        if (signatures != null) {
            for (DangerSignature sig : signatures) {
                if (sig.matches(seg)) {
                    return HookResult.block(
                        "安全限制: 检测到危险命令用法 '" + commandName + "'"
                    );
                }
            }
        }

        // 六级检查：需要确认名单
        if (REQUIRES_CONFIRMATION.contains(commandName)) {
            return HookResult.requireConfirmation(
                "i18n:blocker.bash.sideEffect:cmd=" + URLEncoder.encode(commandName, StandardCharsets.UTF_8),
                "medium",
                raw
            );
        }

        // 七级检查：自动放行名单
        if (ALLOWED_COMMANDS.contains(commandName)) {
            return HookResult.allow();
        }

        // 默认策略：未知命令降级为用户确认（用户可在确认卡片中检查命令内容）。
        // 命中破坏性特征 → 严格拒绝（不受 require_confirmation 开关影响）；
        // 未命中 → 需确认（关闭开关后放行，避免卡死新工具/冷门命令）。
        if (hasDestructiveFeatures(raw)) {
            return HookResult.block(
                "安全限制: 检测到破坏性操作特征，禁止执行"
            );
        }
        return HookResult.requireConfirmation(
            "i18n:blocker.bash.unknownCommand:cmd=" + URLEncoder.encode(commandName, StandardCharsets.UTF_8),
            "medium",
            raw
        );
    }

    /** 检测命令替换注入操作符（`、$()）— 严格禁止 */
    private boolean hasCommandSubstitution(String command) {
        return command.contains("`") || command.contains("$(");
    }

    /**
     * 未知命令的破坏性特征检查。
     * <p>
     * 语义：未知命令默认可执行（不因"未被评审"而卡死新工具/冷门命令），
     * 但命中明显破坏行为（写系统路径、改系统配置、管理用户、清防火墙、
     * 擦除磁盘、逃出工作区配合写删等）时仍严格拒绝。
     */
    private boolean hasDestructiveFeatures(String command) {
        for (Pattern p : DESTRUCTIVE_FEATURES) {
            if (p.matcher(command).find()) {
                return true;
            }
        }
        return false;
    }
}
