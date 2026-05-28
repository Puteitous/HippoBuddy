package com.example.agent;

import com.example.agent.config.Config;
import com.example.agent.core.di.CoreModule;
import com.example.agent.core.concurrency.GracefulShutdown;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.memory.MemoryModule;
import com.example.agent.desktop.NativeFolderPicker;
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
 */
public final class DesktopApplication {

    private static final Logger logger = LoggerFactory.getLogger(DesktopApplication.class);

    private static int PORT;
    private static JFrame mainFrame;

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

            mainFrame = new JFrame("Hippo Code");
            mainFrame.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
            mainFrame.setSize(1280, 800);
            mainFrame.setLocationRelativeTo(null);

            Component browserComponent = browser.getUIComponent();
            mainFrame.add(browserComponent, BorderLayout.CENTER);

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
            });

            mainFrame.setVisible(true);
            logger.info("桌面窗口已打开");

            browser.executeJavaScript(
                "console.log('DesktopBridge available:', typeof window.cefQuery !== 'undefined')",
                "", 0
            );

        } catch (Exception e) {
            logger.error("JCEF 初始化失败", e);
            System.exit(1);
        }
    }

    private static final class DesktopBridgeHandler extends CefMessageRouterHandlerAdapter {
        private static final ObjectMapper MAPPER = new ObjectMapper();

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
                    default:
                        callback.failure(404, "Unknown action: " + action);
                }
            } catch (Exception e) {
                logger.error("DesktopBridge query failed", e);
                callback.failure(500, e.getMessage());
            }
            return true;
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

        private void handleOpenFileDialog(CefQueryCallback callback) {
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
