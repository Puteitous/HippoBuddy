package com.example.agent.tools;

import com.example.agent.desktop.WorkspaceContext;

import java.io.File;
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
     * strict 模式黑名单（工作区内也不可访问的系统敏感目录）。
     * <p>
     * 注意：不包含 /home、/Users、\AppData —— 桌面版数据目录与默认工作区天然落在用户主目录下
     * （Linux: ~/.local/share/HippoBuddy，macOS: ~/Library/Application Support/HippoBuddy，
     * Windows: %APPDATA%\HippoBuddy），把它们列入黑名单会导致默认配置下全部文件操作被拒。
     */
    private static final List<String> RESTRICTED_PATHS_UNIX = List.of(
            "/etc",
            "/root",
            "/System",
            "/.ssh",
            "/.gnupg"
    );

    private static final List<String> RESTRICTED_PATHS_WINDOWS = List.of(
            "\\Windows",
            "\\Program Files",
            "\\Program Files (x86)",
            "\\.ssh",
            "\\.gnupg"
    );

    /**
     * 高危护栏：balanced 读模式与 relaxed 全目录模式下，仍一律拦截的路径（凭据/特权目录）。
     */
    private static final List<String> HIGH_SENSITIVE_UNIX = List.of(
            "/root",
            "/.ssh",
            "/.gnupg"
    );

    private static final List<String> HIGH_SENSITIVE_WINDOWS = List.of(
            "\\.ssh",
            "\\.gnupg"
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

        // 宽松模式：全目录放行，但仍保留高危护栏（凭据/特权目录）
        if (isRelaxedMode()) {
            checkSensitive(path, getHighSensitivePathsForOS(), "安全限制: 不允许访问系统敏感目录: ");
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
            checkSensitive(path, getHighSensitivePathsForOS(), "安全限制: 不允许访问系统敏感目录: ");
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

    private static void checkSensitive(Path path, List<String> restrictedPaths, String messagePrefix) throws ToolExecutionException {
        String pathString = path.toString();
        String normalizedPath = pathString.replace("/", File.separator).replace("\\", File.separator);

        for (String restricted : restrictedPaths) {
            String normalizedRestricted = restricted.replace("/", File.separator).replace("\\", File.separator);
            if (normalizedPath.startsWith(normalizedRestricted)) {
                throw new ToolExecutionException(messagePrefix + restricted);
            }
        }
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
        return File.separator.equals("/") ? RESTRICTED_PATHS_UNIX : RESTRICTED_PATHS_WINDOWS;
    }

    private static List<String> getHighSensitivePathsForOS() {
        return File.separator.equals("/") ? HIGH_SENSITIVE_UNIX : HIGH_SENSITIVE_WINDOWS;
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
