package com.example.agent.core.blocker;

import java.util.ArrayList;
import java.util.List;

/**
 * 命令结构解析器：把整条命令字符串切分为多个"命令段"（segment）。
 * <p>
 * 设计动机：安全检查必须与实际执行语义对齐。shell/cmd 会把链式操作符
 * （&amp;&amp;、||、;、&amp;、|）连接的每一段都执行，因此安全模型必须逐段检查，
 * 而不能只分析第一个 token —— 否则 `echo ok &amp;&amp; rm -rf /` 会被误判为安全。
 * <p>
 * 本解析器是纯字符串解析，不执行任何命令；引号内的分隔符不生效。
 * 解析结果仅用于安全判断，不改变原命令的执行方式。
 */
public final class CommandParser {

    private CommandParser() {
    }

    /** 单个命令段：命令名（小写、去路径/去扩展名）+ 参数数组 + 原始文本 */
    public static final class Segment {
        private final String raw;
        private final String commandName;
        private final List<String> args;

        Segment(String raw, String commandName, List<String> args) {
            this.raw = raw;
            this.commandName = commandName;
            this.args = args;
        }

        public String getRaw() {
            return raw;
        }

        public String getCommandName() {
            return commandName;
        }

        public List<String> getArgs() {
            return args;
        }
    }

    /**
     * 切分命令为多个命令段。空白段被忽略，段按出现顺序返回。
     * 分隔符：&amp; | ;（含 &amp;&amp;、|| 双字符形式），引号内的分隔符不生效。
     */
    public static List<Segment> parse(String command) {
        List<Segment> segments = new ArrayList<>();
        if (command == null || command.trim().isEmpty()) {
            return segments;
        }
        for (String part : splitByOperators(command)) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            segments.add(buildSegment(trimmed));
        }
        return segments;
    }

    /**
     * 规范化命令名：去引号、去路径前缀（/ 和 \）、去 Windows 可执行扩展名、
     * 去尾部非法字符、转小写。
     * <p>例如：/usr/bin/rm → rm；C:\Windows\System32\shutdown.exe → shutdown
     */
    public static String normalizeCommandName(String token) {
        if (token == null) {
            return "";
        }
        String cmd = token.replace("\"", "").replace("'", "");
        int lastSlash = Math.max(cmd.lastIndexOf('/'), cmd.lastIndexOf('\\'));
        if (lastSlash >= 0 && lastSlash < cmd.length() - 1) {
            cmd = cmd.substring(lastSlash + 1);
        }
        String lower = cmd.toLowerCase();
        if (lower.endsWith(".exe") || lower.endsWith(".com")
                || lower.endsWith(".bat") || lower.endsWith(".cmd")) {
            cmd = cmd.substring(0, cmd.length() - 4);
        }
        return cmd.replaceAll("[^a-zA-Z0-9]$", "").toLowerCase();
    }

    private static List<String> splitByOperators(String command) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        char quote = 0;
        int n = command.length();
        for (int i = 0; i < n; i++) {
            char c = command.charAt(i);
            if (quote != 0) {
                current.append(c);
                if (c == quote) {
                    quote = 0;
                }
                continue;
            }
            if (c == '\'' || c == '"') {
                quote = c;
                current.append(c);
                continue;
            }
            if (c == '&' || c == '|' || c == ';') {
                parts.add(current.toString());
                current.setLength(0);
                if (i + 1 < n && command.charAt(i + 1) == c) {
                    i++; // 跳过 && || 的第二个字符
                }
                continue;
            }
            current.append(c);
        }
        parts.add(current.toString());
        return parts;
    }

    private static Segment buildSegment(String raw) {
        String[] tokens = raw.split("\\s+");
        String name = "";
        List<String> args = new ArrayList<>();
        for (int i = 0; i < tokens.length; i++) {
            String t = tokens[i];
            if (t.isEmpty()) {
                continue;
            }
            if (i == 0) {
                name = normalizeCommandName(t);
            } else {
                args.add(t);
            }
        }
        return new Segment(raw, name, args);
    }
}
