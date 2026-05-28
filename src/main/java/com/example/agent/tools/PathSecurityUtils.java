package com.example.agent.tools;

import com.example.agent.desktop.WorkspaceContext;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class PathSecurityUtils {

    private static final Path PROJECT_ROOT = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize();

    private static final List<String> RESTRICTED_PATHS_UNIX = List.of(
            "/etc",
            "/root",
            "/home",
            "/Users",
            "/System",
            "/.ssh",
            "/.gnupg"
    );

    private static final List<String> RESTRICTED_PATHS_WINDOWS = List.of(
            "\\Windows",
            "\\Program Files",
            "\\Program Files (x86)",
            "\\AppData",
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

    public static Path validateAndResolve(String filePath) throws ToolExecutionException {
        if (filePath == null || filePath.trim().isEmpty()) {
            return getEffectiveRoot();
        }

        filePath = filePath.trim();

        Path path = Paths.get(filePath);

        if (!path.isAbsolute()) {
            path = getEffectiveRoot().resolve(path);
        }

        path = path.normalize();

        if (!isWithinAllowedPath(path)) {
            String workspacePath = WorkspaceContext.getCurrentFolder();
            StringBuilder sb = new StringBuilder();
            sb.append("安全限制: 只能访问项目目录或工作区目录内的文件。\n");
            sb.append("项目目录: ").append(PROJECT_ROOT).append("\n");
            if (workspacePath != null && !workspacePath.isBlank()) {
                sb.append("工作区目录: ").append(Paths.get(workspacePath).toAbsolutePath().normalize()).append("\n");
            }
            sb.append("请求路径: ").append(path);
            throw new ToolExecutionException(sb.toString());
        }

        String pathString = path.toString();
        String normalizedPath = pathString.replace("/", File.separator).replace("\\", File.separator);

        for (String restricted : getRestrictedPathsForOS()) {
            String normalizedRestricted = restricted.replace("/", File.separator).replace("\\", File.separator);
            if (normalizedPath.startsWith(normalizedRestricted)) {
                throw new ToolExecutionException("安全限制: 不允许访问系统敏感目录: " + restricted);
            }
        }

        return path;
    }

    private static List<String> getRestrictedPathsForOS() {
        return File.separator.equals("/") ? RESTRICTED_PATHS_UNIX : RESTRICTED_PATHS_WINDOWS;
    }

    public static boolean isWithinAllowedPath(Path path) {
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
