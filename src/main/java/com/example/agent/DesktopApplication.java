package com.example.agent;

import com.example.agent.config.Config;
import com.example.agent.core.di.CoreModule;
import com.example.agent.core.concurrency.GracefulShutdown;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.memory.MemoryModule;
import com.example.agent.desktop.NativeFolderPicker;
import com.example.agent.desktop.WindowCornerUtil;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.web.server.DashboardServer;

import me.friwi.jcefmaven.CefAppBuilder;
import me.friwi.jcefmaven.MavenCefAppHandlerAdapter;
import me.friwi.jcefmaven.impl.progress.ConsoleProgressHandler;

import org.cef.CefApp;
import org.cef.CefClient;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.browser.CefMessageRouter;
import org.cef.callback.CefQueryCallback;
import org.cef.handler.CefMessageRouterHandlerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.*;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * 桌面端主入口 — 通过 JCEF 内嵌 Chromium 浏览器窗口，加载 Hippo Cockpit Web UI。
 *
 * <p>
 * 启动流程：
 * <ol>
 *   <li>初始化 DI 容器（CoreModule.configure）</li>
 *   <li>初始化记忆模块（MemoryModule.initialize）</li>
 *   <li>启动 HTTP Server（DashboardServer.start），等待端口就绪</li>
 *   <li>初始化 JCEF，创建浏览器窗口加载 /cockpit</li>
 * </ol>
 * </p>
 *
 * <p>
 * JVM 参数（JDK 21）：
 * <pre>
 * --add-exports java.base/java.lang=ALL-UNNAMED
 * --add-opens java.desktop/sun.awt=ALL-UNNAMED
 * --add-opens java.desktop/sun.java2d=ALL-UNNAMED
 * </pre>
 * </p>
 *
 * <p>
 * 窗口样式：无原生标题栏（undecorated），窗口控制按钮由 Web UI 渲染，
 * 通过 JS↔Java Bridge 通信控制最小化/最大化/关闭等操作。
 * </p>
 */
public final class DesktopApplication {

    private static final Logger logger = LoggerFactory.getLogger(DesktopApplication.class);

    private static int PORT;
    private static JFrame mainFrame;
    private static boolean maximized = false;

    private DesktopApplication() {
    }

    public static void main(String[] args) {
        logger.info("========================================");
        logger.info("  Hippo Code Desktop 启动");
        logger.info("========================================");

        // 1. 初始化 DI 容器（与 CLI / Web 模式共享同一套初始化流程）
        CoreModule.configure();

        // 2. 恢复持久化的工作区路径（桌面端专属，Web 端始终为 null）
        WorkspaceContext.load();

        // 3. 初始化记忆模块
        Config config = Config.getInstance();
        PORT = config.getWeb().getPort();
        java.nio.file.Path memoryRoot = WorkspaceManager.getUserMemoryDir();
        MemoryModule.initialize(config, memoryRoot);
        logger.info("记忆模块初始化完成 ✅");

        // 4. 启动 HTTP Server，等待端口就绪后再初始化 JCEF
        logger.info("正在启动 HTTP Server（端口 {}）...", PORT);
        DashboardServer.start(PORT)
                .thenRun(() -> {
                    logger.info("HTTP Server 已就绪，正在初始化 JCEF...");
                    SwingUtilities.invokeLater(DesktopApplication::initJcef);
                })
                .exceptionally(throwable -> {
                    logger.error("HTTP Server 启动失败", throwable);
                    System.exit(1);
                    return null;
                });
    }

    private static void initJcef() {
        try {
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception ignored) {
            }

            CefAppBuilder builder = new CefAppBuilder();
            builder.setInstallDir(new File("jcef-bundle"));
            builder.setProgressHandler(new ConsoleProgressHandler());

            builder.getCefSettings().windowless_rendering_enabled = false;

            // 设置持久化缓存路径，使 localStorage / IndexedDB 等跨重启保留
            Path browserCacheDir = WorkspaceManager.getGlobalCacheDir().resolve("jcef");
            try {
                Files.createDirectories(browserCacheDir);
            } catch (IOException e) {
                logger.warn("创建 JCEF 缓存目录失败，localStorage 可能无法持久化", e);
            }
            builder.getCefSettings().cache_path = browserCacheDir.toString();

            builder.setAppHandler(new MavenCefAppHandlerAdapter() {
            });

            CefApp app = builder.build();
            logger.info("JCEF 初始化完成");

            CefClient client = app.createClient();

            CefMessageRouter router = CefMessageRouter.create(new CefMessageRouter.CefMessageRouterConfig());
            router.addHandler(new DesktopBridgeHandler(), true);
            client.addMessageRouter(router);

            CefBrowser browser = client.createBrowser(
                    "http://localhost:" + PORT + "/cockpit",
                    false, false
            );

            // ====== 创建无标题栏窗口 ======
            mainFrame = new JFrame("Hippo Code");
            mainFrame.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
            mainFrame.setUndecorated(true);
            mainFrame.setBackground(new Color(0xED, 0xEF, 0xF2));
            mainFrame.setSize(1280, 800);
            mainFrame.setLocationRelativeTo(null);

            Component browserComponent = browser.getUIComponent();
            mainFrame.add(browserComponent, BorderLayout.CENTER);

            mainFrame.setResizable(true);

            // 窗口大小变化时重新应用圆角
            mainFrame.addComponentListener(new java.awt.event.ComponentAdapter() {
                @Override
                public void componentResized(java.awt.event.ComponentEvent e) {
                    applyRoundedCorners();
                }
            });

            mainFrame.addWindowListener(new WindowAdapter() {
                @Override
                public void windowClosing(WindowEvent e) {
                    logger.info("正在关闭桌面端...");
                    mainFrame.setVisible(false);

                    browser.close(true);
                    client.dispose();
                    app.dispose();
                    DashboardServer.stop();
                    GracefulShutdown.shutdownAll();

                    System.exit(0);
                }

                @Override
                public void windowStateChanged(WindowEvent e) {
                    int newState = e.getNewState();
                    // 最小化时不改变 maximized 状态，等还原时自动恢复
                    if ((newState & Frame.ICONIFIED) != 0) return;
                    maximized = (newState & Frame.MAXIMIZED_BOTH) != 0;
                    SwingUtilities.invokeLater(DesktopApplication::applyRoundedCorners);
                }
            });

            mainFrame.setVisible(true);
            // 窗口显示后首次应用圆角
            SwingUtilities.invokeLater(DesktopApplication::applyRoundedCorners);
            logger.info("桌面窗口已打开");

            // 注册 F12 快捷键
            browser.executeJavaScript(
                "document.addEventListener('keydown',function(e){if(e.key==='F12'){window.cefQuery({request:JSON.stringify({action:'openDevTools'}),onSuccess:function(r){},onFailure:function(){}});}});",
                "", 0
            );

        } catch (Exception e) {
            logger.error("JCEF 初始化失败", e);
            System.exit(1);
        }
    }

    // ========== 窗口控制（供 Bridge 调用） ==========

    private static void minimizeWindow() {
        mainFrame.setExtendedState(Frame.ICONIFIED);
    }

    /**
     * 最大化窗口到可用屏幕区域（排除任务栏）。
     * 对 undecorated 窗口，使用 setMaximizedBounds + setExtendedState 组合，
     * 避免手动 setBounds 导致 JCEF 渲染异常。
     */
    private static void maximizeWindow() {
        if (!maximized) {
            GraphicsConfiguration gc = mainFrame.getGraphicsConfiguration();
            Insets insets = Toolkit.getDefaultToolkit().getScreenInsets(gc);
            Rectangle screen = gc.getBounds();
            int x = screen.x + insets.left;
            int y = screen.y + insets.top;
            int w = screen.width - insets.left - insets.right;
            int h = screen.height - insets.top - insets.bottom;
            mainFrame.setMaximizedBounds(new Rectangle(x, y, w, h));
            mainFrame.setExtendedState(Frame.MAXIMIZED_BOTH);
            maximized = true;
        }
    }

    private static void restoreWindow() {
        if (maximized) {
            mainFrame.setExtendedState(Frame.NORMAL);
            maximized = false;
        }
    }

    private static void toggleMaximize() {
        if (maximized) {
            restoreWindow();
        } else {
            maximizeWindow();
        }
    }

    private static void closeWindow() {
        mainFrame.dispatchEvent(new WindowEvent(mainFrame, WindowEvent.WINDOW_CLOSING));
    }

    private static void moveWindow(int x, int y) {
        mainFrame.setLocation(x, y);
    }

    /**
     * 应用窗口圆角形状。最大化时恢复直角，还原后重新切圆角。
     * 优先使用 Windows DWM API（硬件抗锯齿），兜底 setShape。
     */
    private static void applyRoundedCorners() {
        WindowCornerUtil.apply(mainFrame, maximized);
    }

    // ========== Bridge Handler ==========

    private static final class DesktopBridgeHandler extends CefMessageRouterHandlerAdapter {
        private static final ObjectMapper MAPPER = new ObjectMapper();

        /** 持有异步回调的强引用，防止被 GC 导致 "Unexpected call to finalize" */
        private static final List<CefQueryCallback> pendingCallbacks = new ArrayList<>();

        @Override
        public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId,
                               String request, boolean persistent, CefQueryCallback callback) {
            logger.debug("DesktopBridge onQuery: {}", request);
            try {
                JsonNode json = MAPPER.readTree(request);
                String action = json.has("action") ? json.get("action").asText() : "";

                switch (action) {
                    case "readDir":
                        handleReadDir(json, callback);
                        break;
                    case "readFile":
                        handleReadFile(json, callback);
                        break;
                    case "writeFile":
                        handleWriteFile(json, callback);
                        break;
                    case "openFileDialog":
                        handleOpenFileDialog(callback);
                        break;
                    case "getCurrentFolder":
                        callback.success(MAPPER.writeValueAsString(
                                MAPPER.createObjectNode().put("path", WorkspaceContext.getCurrentFolder() != null ? WorkspaceContext.getCurrentFolder() : "")));
                        break;
                    case "setCurrentFolder":
                        WorkspaceContext.setCurrentFolder(json.has("path") ? json.get("path").asText() : null);
                        WorkspaceContext.save();
                        callback.success(MAPPER.writeValueAsString(
                                MAPPER.createObjectNode().put("path", WorkspaceContext.getCurrentFolder())));
                        break;
                    case "clearCurrentFolder":
                        WorkspaceContext.clear();
                        WorkspaceContext.save();
                        callback.success(MAPPER.writeValueAsString(
                                MAPPER.createObjectNode().put("path", "")));
                        break;
                    case "openDevTools":
                        handleOpenDevTools(browser, callback);
                        break;
                    // ===== 窗口控制 =====
                    case "windowMinimize":
                        SwingUtilities.invokeLater(DesktopApplication::minimizeWindow);
                        callback.success("{}");
                        break;
                    case "windowMaximize":
                        SwingUtilities.invokeLater(DesktopApplication::maximizeWindow);
                        callback.success("{}");
                        break;
                    case "windowRestore":
                        SwingUtilities.invokeLater(DesktopApplication::restoreWindow);
                        callback.success("{}");
                        break;
                    case "windowToggleMaximize":
                        SwingUtilities.invokeLater(DesktopApplication::toggleMaximize);
                        callback.success("{}");
                        break;
                    case "windowClose":
                        SwingUtilities.invokeLater(DesktopApplication::closeWindow);
                        callback.success("{}");
                        break;
                    case "windowIsMaximized":
                        callback.success(MAPPER.writeValueAsString(
                                MAPPER.createObjectNode().put("maximized", maximized)));
                        break;
                    case "windowMove":
                        if (json.has("x") && json.has("y")) {
                            int wx = json.get("x").asInt();
                            int wy = json.get("y").asInt();
                            SwingUtilities.invokeLater(() -> moveWindow(wx, wy));
                        }
                        callback.success("{}");
                        break;
                    case "windowGetState":
                        ObjectNode state = MAPPER.createObjectNode();
                        state.put("maximized", maximized);
                        state.put("x", mainFrame.getX());
                        state.put("y", mainFrame.getY());
                        state.put("width", mainFrame.getWidth());
                        state.put("height", mainFrame.getHeight());
                        callback.success(MAPPER.writeValueAsString(state));
                        break;
                    default:
                        callback.failure(404, "Unknown action: " + action);
                }
            } catch (Exception e) {
                logger.error("DesktopBridge query failed", e);
                callback.failure(500, e.getMessage());
            }
            return true;
        }

        private void handleOpenDevTools(CefBrowser browser, CefQueryCallback callback) {
            logger.info("正在打开 DevTools 窗口...");
            pendingCallbacks.add(callback);
            CefBrowser devTools = browser.getDevTools();
            SwingUtilities.invokeLater(() -> {
                try {
                    JFrame devFrame = new JFrame("Hippo Code - DevTools");
                    devFrame.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
                    devFrame.setSize(960, 640);
                    devFrame.setLocationRelativeTo(mainFrame);
                    devFrame.add(devTools.getUIComponent(), BorderLayout.CENTER);
                    devFrame.setVisible(true);
                    logger.info("DevTools 窗口已打开");
                    callback.success("{}");
                } catch (Exception e) {
                    logger.error("打开 DevTools 失败", e);
                    callback.failure(500, e.getMessage());
                } finally {
                    pendingCallbacks.remove(callback);
                }
            });
        }

        private void handleReadDir(JsonNode json, CefQueryCallback callback) throws Exception {
            String path = json.has("path") ? json.get("path").asText() : null;
            if (path == null || path.isBlank()) {
                callback.failure(400, "path is required");
                return;
            }
            Path dir = Paths.get(path);
            if (!Files.isDirectory(dir)) {
                callback.failure(404, "Directory not found: " + path);
                return;
            }
            ArrayNode entries = MAPPER.createArrayNode();
            Files.list(dir)
                    .sorted((a, b) -> {
                        boolean aDir = Files.isDirectory(a);
                        boolean bDir = Files.isDirectory(b);
                        if (aDir != bDir) return aDir ? -1 : 1;
                        return a.getFileName().toString().compareToIgnoreCase(b.getFileName().toString());
                    })
                    .forEach(p -> {
                        ObjectNode entry = MAPPER.createObjectNode();
                        entry.put("name", p.getFileName().toString());
                        entry.put("isDirectory", Files.isDirectory(p));
                        try {
                            entry.put("size", Files.isDirectory(p) ? 0 : Files.size(p));
                        } catch (IOException e) {
                            entry.put("size", 0);
                        }
                        entries.add(entry);
                    });

            ObjectNode result = MAPPER.createObjectNode();
            result.put("path", path);
            result.set("entries", entries);
            callback.success(MAPPER.writeValueAsString(result));
        }

        private void handleReadFile(JsonNode json, CefQueryCallback callback) throws Exception {
            String path = json.has("path") ? json.get("path").asText() : null;
            if (path == null || path.isBlank()) {
                callback.failure(400, "path is required");
                return;
            }
            Path file = Paths.get(path);
            if (!Files.isRegularFile(file)) {
                callback.failure(404, "File not found: " + path);
                return;
            }
            String content = Files.readString(file);
            ObjectNode result = MAPPER.createObjectNode();
            result.put("path", path);
            result.put("content", content);
            callback.success(MAPPER.writeValueAsString(result));
        }

        private void handleWriteFile(JsonNode json, CefQueryCallback callback) throws Exception {
            String path = json.has("path") ? json.get("path").asText() : null;
            String content = json.has("content") ? json.get("content").asText() : null;
            if (path == null || path.isBlank()) {
                callback.failure(400, "path is required");
                return;
            }
            if (content == null) {
                callback.failure(400, "content is required");
                return;
            }
            Path file = Paths.get(path);
            Files.createDirectories(file.getParent());
            Files.writeString(file, content);
            ObjectNode result = MAPPER.createObjectNode();
            result.put("path", path);
            result.put("size", Files.size(file));
            callback.success(MAPPER.writeValueAsString(result));
        }

        private void handleOpenFileDialog(CefQueryCallback callback) {
            // 加入列表防止 callback 在异步操作期间被 GC
            pendingCallbacks.add(callback);
            Runnable task = () -> {
                try {
                    String path = NativeFolderPicker.chooseFolder(mainFrame);
                    if (path != null) {
                        WorkspaceContext.setCurrentFolder(path);
                        WorkspaceContext.save();
                        callback.success(MAPPER.writeValueAsString(
                                MAPPER.createObjectNode().put("path", path)));
                    } else {
                        callback.success(MAPPER.writeValueAsString(
                                MAPPER.createObjectNode().putNull("path")));
                    }
                } catch (Exception e) {
                    logger.error("DesktopBridge: openFileDialog failed", e);
                    callback.failure(500, e.getMessage());
                } finally {
                    pendingCallbacks.remove(callback);
                }
            };

            if (SwingUtilities.isEventDispatchThread()) {
                task.run();
            } else {
                SwingUtilities.invokeLater(task);
            }
        }
    }
}
