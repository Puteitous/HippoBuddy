package com.example.agent.tools.filter;

import java.nio.file.Path;
import java.util.List;

public class IgnoredDirectories {

    /** 单段目录名排除（路径中任意一层匹配即排除） */
    private static final List<String> DIRECTORIES = List.of(
        ".git", ".svn", ".hg", ".bzr",
        "node_modules", "vendor", ".venv", "venv",
        "target", "build", "dist", "out",
        ".next", ".nuxt",
        "__pycache__", ".cache",
        ".idea", ".vscode", ".trae",
        ".gradle", "gradle",
        ".mvn"
    );

    /** 多段路径前缀排除（仅当连续路径段完全匹配时才排除） */
    private static final List<List<String>> IGNORED_PATH_PREFIXES = List.of(
        List.of(".hippo", "sessions"),
        List.of(".hippo", "subagents"),
        List.of(".hippo", "logs")
    );

    public boolean isIgnored(Path path) {
        for (int i = 0; i < path.getNameCount(); i++) {
            String segment = path.getName(i).toString();
            if (DIRECTORIES.contains(segment)) {
                return true;
            }
        }
        // 检查多段路径前缀
        for (List<String> prefix : IGNORED_PATH_PREFIXES) {
            if (pathContainsPrefix(path, prefix)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 检查路径中是否包含指定的连续路径段序列。
     * 例如 prefix=["a","b"] 会匹配 /x/a/b/y 但不会匹配 /a/x/b/y。
     */
    private static boolean pathContainsPrefix(Path path, List<String> prefix) {
        int maxStart = path.getNameCount() - prefix.size();
        for (int start = 0; start <= maxStart; start++) {
            boolean match = true;
            for (int j = 0; j < prefix.size(); j++) {
                if (!path.getName(start + j).toString().equals(prefix.get(j))) {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
        return false;
    }

    public static List<String> getDefaultDirectories() {
        return DIRECTORIES;
    }
}
