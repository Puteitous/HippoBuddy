package com.example.agent.tools;

import com.example.agent.desktop.WorkspaceContext;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class PathSecurityUtils {

    /** 访问语义：READ=只读工具（balanced 模式下工作区外放行）；WRITE=写工具/命令工作目录（始终限工作区内） */
    public enum AccessKind {
        READ, WRITE
    }

    private static final Path PROJECT_ROOT = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize();

    /**
     * 前缀型黑名单（strict 模式，工作区内也不可访问的系统目录）。
     * <p>
     * 注意：不包含 /home、/Users、\AppData —— 桌面版数据目录与默认工作区天然落在用户主目录下
     * （Linux: ~/.local/share/HippoBuddy，macOS: ~/Library/Application Support/HippoBuddy，
     * Windows: %APPDATA%\HippoBuddy），把它们列入黑名单会导致默认配置下全部文件操作被拒。
     * <p>
     * 只按前缀匹配根级/盘根级系统目录；凭据目录（.ssh/.gnupg）见 {@link #SENSITIVE_SEGMENTS}，
     * 它们常出现在用户主目录下，前缀匹配拦不住，需按任意路径段名匹配。
     */
    private static final List<String> PREFIX_RESTRICTED_UNIX = List.of(
            "/etc",
            "/root",
            "/System"
    );

    /**
     * Windows 无前缀型黑名单：系统目录（C:\Windows、D:\Program Files 等）带盘符前缀，
     * 用 startsWith("\\Windows") 匹配不到 C:\Windows。改为按"盘根下第一级段名"匹配，
     * 见 {@link #isUnderWindowsSystemRoot} 与 {@link #WINDOWS_SYSTEM_ROOT_SEGMENTS}。
     */
    private static final List<String> PREFIX_RESTRICTED_WINDOWS = List.of();

    /**
     * Windows 系统根目录段名：固定出现于任意盘符根下第一级（C:\Windows、D:\Program Files ...）。
     */
    private static final List<String> WINDOWS_SYSTEM_ROOT_SEGMENTS = List.of(
            "Windows",
            "Program Files",
            "Program Files (x86)"
    );

    /**
     * 前缀型高危护栏（balanced 读模式与 relaxed 全目录模式下，仍一律拦截的根级特权目录）。
     */
    private static final List<String> HIGH_SENSITIVE_PREFIX_UNIX = List.of(
            "/root"
    );

    private static final List<String> HIGH_SENSITIVE_PREFIX_WINDOWS = List.of();

    /**
     * 任意层级的凭据目录名：出现在路径任何一级即拦截（.ssh/.gnupg 常位于用户主目录下，
     * 前缀匹配会漏拦，故按段名匹配）。所有权限模式均强制执行，凭据目录任何时候都不可访问。
     */
    private static final List<String> SENSITIVE_SEGMENTS = List.of(
            ".ssh",
            ".gnupg"
    );

    private static Path getEffectiveRoot() {
        String workspacePath = WorkspaceContext.getCurrentFolder();
        if (workspacePath != null && !workspacePath.isBlank()) {
            return Paths.get(workspacePath).toAbsolutePath().normalize();
        }
        return PROJECT_ROOT;
    }

    /** 返回当前生效的根目录（工作区目录或项目目录），用于安全检查 */
    public static Path getAllowedRoot() {
        return getEffectiveRoot();
    }

    /** 当前是否为宽松权限模式（可从配置读取） */
    private static boolean isRelaxedMode() {
        return com.example.agent.config.Config.getInstance().getTools().isModeRelaxed();
    }

    /** 当前是否为折中权限模式（读放行 / 写受限，可从配置读取） */
    private static boolean isBalancedMode() {
        return com.example.agent.config.Config.getInstance().getTools().isModeBalanced();
    }

    /**
     * 写语义校验（默认）：strict 仅工作区内；balanced 同 strict；relaxed 全目录（保留高危护栏）。
     * 用于 Write/Edit/Delete/Undo/Office 写工具以及 BashTool 的工作目录。
     */
    public static Path validateAndResolve(String filePath) throws ToolExecutionException {
        return validateAndResolve(filePath, AccessKind.WRITE);
    }

    /**
     * 读语义校验：strict 仅工作区内；balanced 工作区外只读放行（保留高危护栏）；relaxed 全目录。
     * 用于 Read/List/Glob/Grep/Office 读工具。
     */
    public static Path validateAndResolveRead(String filePath) throws ToolExecutionException {
        return validateAndResolve(filePath, AccessKind.READ);
    }

    private static Path validateAndResolve(String filePath, AccessKind kind) throws ToolExecutionException {
        if (filePath == null || filePath.trim().isEmpty()) {
            return getEffectiveRoot();
        }

        filePath = filePath.trim();

        Path path = Paths.get(filePath);

        if (!path.isAbsolute()) {
            path = getEffectiveRoot().resolve(path);
        }

        path = path.normalize();

        // 宽松模式：全目录放行，但仍保留高危护栏（根级特权目录 + 任意层级的凭据目录）
        if (isRelaxedMode()) {
            checkSensitive(path, getHighSensitivePrefixPathsForOS(), "安全限制: 不允许访问系统敏感目录: ");
            return path;
        }

        if (isWithinAllowedPath(path)) {
            // 工作区内：strict/balanced 一律受黑名单约束（如工作区被设为系统目录时兜底拦截）
            checkSensitive(path, getRestrictedPathsForOS(), "安全限制: 不允许访问系统敏感目录: ");
            return path;
        }

        // 工作区外
        if (kind == AccessKind.READ && isBalancedMode()) {
            // balanced 读：只读放行，保留高危护栏
            checkSensitive(path, getHighSensitivePrefixPathsForOS(), "安全限制: 不允许访问系统敏感目录: ");
            return path;
        }

        throw buildOutOfWorkspaceError(path);
    }

    private static ToolExecutionException buildOutOfWorkspaceError(Path path) {
        String workspacePath = WorkspaceContext.getCurrentFolder();
        StringBuilder sb = new StringBuilder();
        sb.append("安全限制: 只能访问项目目录或工作区目录内的文件。\n");
        sb.append("项目目录: ").append(PROJECT_ROOT).append("\n");
        if (workspacePath != null && !workspacePath.isBlank()) {
            sb.append("工作区目录: ").append(Paths.get(workspacePath).toAbsolutePath().normalize()).append("\n");
        }
        sb.append("请求路径: ").append(path);
        return new ToolExecutionException(sb.toString());
    }

    /**
     * 同时检查前缀型系统目录、Windows 根系统目录与任意层级的凭据目录（.ssh/.gnupg）。
     * <p>
     * 额外做一次符号链接加固：对已存在的路径解析真实路径（toRealPath）后复检同一套护栏，
     * 防止工作区内符号链接指向凭据/系统目录时，仅凭原始路径段匹配被绕过。
     * 解析失败或路径不存在时忽略，回退到原始路径的检查结果（不改变既有范围语义）。
     */
    private static void checkSensitive(Path path, List<String> prefixPaths, String messagePrefix) throws ToolExecutionException {
        checkSensitiveOnce(path, prefixPaths, messagePrefix);
        if (Files.exists(path)) {
            try {
                checkSensitiveOnce(path.toRealPath(), prefixPaths, messagePrefix);
            } catch (IOException ignored) {
                // 无法解析真实路径：保持原始路径检查结果
            }
        }
    }

    /** 单次护栏检查：前缀型系统目录（Unix / Windows）+ 任意层级凭据目录 */
    private static void checkSensitiveOnce(Path path, List<String> prefixPaths, String messagePrefix) throws ToolExecutionException {
        // 1. 前缀型系统目录（Unix 根级）
        if (isUnderPrefix(path, prefixPaths)) {
            throw new ToolExecutionException(messagePrefix + "系统敏感目录");
        }
        // 2. Windows 盘根下第一级系统目录（C:\Windows 带盘符，前缀匹配拦不住）
        if (isUnderWindowsSystemRoot(path)) {
            throw new ToolExecutionException(messagePrefix + "系统敏感目录");
        }
        // 3. 任意层级的凭据目录
        for (Path component : path) {
            String name = component.toString();
            if (SENSITIVE_SEGMENTS.contains(name)) {
                throw new ToolExecutionException(messagePrefix + name);
            }
        }
    }

    /** 前缀匹配：路径以任意前缀条目开头 */
    private static boolean isUnderPrefix(Path path, List<String> prefixPaths) {
        String pathString = path.toString();
        String normalizedPath = pathString.replace("/", File.separator).replace("\\", File.separator);
        for (String restricted : prefixPaths) {
            String normalizedRestricted = restricted.replace("/", File.separator).replace("\\", File.separator);
            if (normalizedPath.startsWith(normalizedRestricted)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Windows 系统根目录检测：绝对路径的 name elements 不含盘符（根由 getRoot() 单独表示），
     * 因此第 0 级 name 就是盘根下第一级目录（如 C:\ 下的 Windows、Program Files）。
     * 命中系统段名即拦截，与分区无关（C:\Windows、D:\Windows 都能覆盖）。
     */
    private static boolean isUnderWindowsSystemRoot(Path path) {
        if (File.separator.equals("/")) {
            return false;
        }
        return path.getNameCount() > 0
                && WINDOWS_SYSTEM_ROOT_SEGMENTS.contains(path.getName(0).toString());
    }

    public static boolean isWithinAllowedPath(Path path) {
        // 宽松模式：允许访问全目录
        if (isRelaxedMode()) {
            return true;
        }
        if (path == null) {
            return false;
        }
        Path absolute = path.toAbsolutePath();
        if (absolute == null) {
            return false;
        }
        Path normalizedPath = absolute.normalize();

        if (normalizedPath.startsWith(PROJECT_ROOT)) {
            return true;
        }

        String workspacePath = WorkspaceContext.getCurrentFolder();
        if (workspacePath != null && !workspacePath.isBlank()) {
            Path workspaceRoot = Paths.get(workspacePath).toAbsolutePath().normalize();
            return normalizedPath.startsWith(workspaceRoot);
        }

        return false;
    }

    private static List<String> getRestrictedPathsForOS() {
        return File.separator.equals("/") ? PREFIX_RESTRICTED_UNIX : PREFIX_RESTRICTED_WINDOWS;
    }

    private static List<String> getHighSensitivePrefixPathsForOS() {
        return File.separator.equals("/") ? HIGH_SENSITIVE_PREFIX_UNIX : HIGH_SENSITIVE_PREFIX_WINDOWS;
    }

    public static boolean isWithinProject(Path path) {
        return isWithinAllowedPath(path);
    }

    public static Path getProjectRoot() {
        return PROJECT_ROOT;
    }

    public static String getRelativePath(Path path) {
        if (path == null) {
            return "null";
        }

        Path normalized = path.toAbsolutePath().normalize();

        String workspacePath = WorkspaceContext.getCurrentFolder();
        if (workspacePath != null && !workspacePath.isBlank()) {
            Path workspaceRoot = Paths.get(workspacePath).toAbsolutePath().normalize();
            if (normalized.startsWith(workspaceRoot)) {
                return workspaceRoot.relativize(normalized).toString();
            }
        }

        if (normalized.startsWith(PROJECT_ROOT)) {
            return PROJECT_ROOT.relativize(normalized).toString();
        }

        return path.toString();
    }
}
