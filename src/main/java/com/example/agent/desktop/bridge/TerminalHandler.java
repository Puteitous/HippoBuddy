package com.example.agent.desktop.bridge;

import com.example.agent.desktop.WorkspaceContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefQueryCallback;
import org.cef.handler.CefMessageRouterHandlerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * 终端 Bridge Handler — 在系统原生终端中打开指定工作目录。
 *
 * <p>
 * 跨平台支持：
 * <ul>
 *   <li>Windows: cmd.exe（新窗口）</li>
 *   <li>macOS: Terminal.app（通过 open 命令）</li>
 *   <li>Linux: 依次探测 gnome-terminal / konsole / xterm</li>
 * </ul>
 * </p>
 *
 * <p>
 * 前端通过 cefQuery({action: 'openTerminal', path?: '...'}) 调用。
 * path 可选，不传时使用当前工作区目录；工作区为空时使用用户主目录。
 * </p>
 */
public class TerminalHandler extends CefMessageRouterHandlerAdapter {

    private static final Logger logger = LoggerFactory.getLogger(TerminalHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId,
                           String request, boolean persistent, CefQueryCallback callback) {
        try {
            JsonNode json = MAPPER.readTree(request);
            String action = json.has("action") ? json.get("action").asText() : "";

            if (!"openTerminal".equals(action)) {
                return false;
            }

            // 获取目标目录：优先取前端传入的 path，否则使用当前工作区，兜底用用户主目录
            String path = json.has("path") ? json.get("path").asText() : null;
            if (path == null || path.isBlank()) {
                path = WorkspaceContext.getCurrentFolder();
            }
            if (path == null || path.isBlank()) {
                path = System.getProperty("user.home");
            }

            logger.info("在原生终端中打开目录: {}", path);

            String osName = System.getProperty("os.name").toLowerCase();
            boolean success;

            if (osName.contains("win")) {
                success = openWindowsTerminal(path);
            } else if (osName.contains("mac")) {
                success = openMacTerminal(path);
            } else if (osName.contains("nix") || osName.contains("nux") || osName.contains("aix")) {
                success = openLinuxTerminal(path);
            } else {
                logger.warn("不支持的操作系统: {}", osName);
                callback.failure(500, "Unsupported OS: " + osName);
                return true;
            }

            if (success) {
                callback.success("{}");
            } else {
                callback.failure(500, "Failed to open terminal");
            }
            return true;

        } catch (Exception e) {
            logger.error("打开终端失败", e);
            callback.failure(500, e.getMessage());
            return true;
        }
    }

    /**
     * Windows：启动 cmd.exe 新窗口，cd 到目标目录。
     */
    private boolean openWindowsTerminal(String path) {
        try {
            // cmd /c start "Terminal" cmd /K "cd /d <path>"
            // /K 保持窗口打开，/d 支持跨盘符切换目录
            List<String> cmd = new ArrayList<>();
            cmd.add("cmd.exe");
            cmd.add("/c");
            cmd.add("start");
            cmd.add("\"Terminal\"");
            cmd.add("cmd.exe");
            cmd.add("/K");
            cmd.add("cd /d \"" + path + "\"");

            new ProcessBuilder(cmd).start();
            return true;
        } catch (IOException e) {
            logger.error("打开 Windows 终端失败", e);
            return false;
        }
    }

    /**
     * macOS：使用 open 命令在 Terminal.app 中打开目录。
     * Terminal.app 会自动在新窗口中 cd 到指定目录。
     */
    private boolean openMacTerminal(String path) {
        try {
            // open -a Terminal <directory>
            new ProcessBuilder("open", "-a", "Terminal", path).start();
            return true;
        } catch (IOException e) {
            logger.error("打开 macOS 终端失败", e);
            return false;
        }
    }

    /**
     * Linux：依次探测 gnome-terminal / konsole / xterm。
     */
    private boolean openLinuxTerminal(String path) {
        File dir = new File(path);
        if (!dir.isDirectory()) {
            logger.warn("目录不存在: {}", path);
            return false;
        }

        // 尝试 gnome-terminal
        if (isCommandAvailable("gnome-terminal")) {
            try {
                new ProcessBuilder("gnome-terminal", "--working-directory=" + path).start();
                return true;
            } catch (IOException e) {
                logger.warn("gnome-terminal 启动失败，尝试下一个", e);
            }
        }

        // 尝试 konsole
        if (isCommandAvailable("konsole")) {
            try {
                new ProcessBuilder("konsole", "--workdir", path).start();
                return true;
            } catch (IOException e) {
                logger.warn("konsole 启动失败，尝试下一个", e);
            }
        }

        // 尝试 xterm
        if (isCommandAvailable("xterm")) {
            try {
                new ProcessBuilder("xterm", "-e", "cd", path, ";", "exec", "$SHELL", "-i").start();
                return true;
            } catch (IOException e) {
                logger.warn("xterm 启动失败", e);
            }
        }

        logger.error("未找到可用的 Linux 终端模拟器");
        return false;
    }

    /**
     * 检查系统中是否存在指定命令。
     */
    private boolean isCommandAvailable(String cmd) {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                // Windows 下用 where 命令检测
                Process p = new ProcessBuilder("where", cmd)
                        .redirectErrorStream(true)
                        .start();
                p.waitFor();
                return p.exitValue() == 0;
            } else {
                // Unix-like 下用 which 命令检测
                Process p = new ProcessBuilder("which", cmd)
                        .redirectErrorStream(true)
                        .start();
                p.waitFor();
                return p.exitValue() == 0;
            }
        } catch (Exception e) {
            return false;
        }
    }
}
