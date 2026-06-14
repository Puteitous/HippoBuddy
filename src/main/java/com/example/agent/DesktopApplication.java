package com.example.agent;

import com.example.agent.config.Config;
import com.example.agent.core.di.CoreModule;
import com.example.agent.core.concurrency.GracefulShutdown;
import com.example.agent.desktop.WindowManager;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.desktop.bridge.ConfigHandler;
import com.example.agent.desktop.bridge.DevToolsHandler;
import com.example.agent.desktop.bridge.DialogHandler;
import com.example.agent.desktop.bridge.ExternalLinkHandler;
import com.example.agent.desktop.bridge.FileHandler;
import com.example.agent.desktop.bridge.WindowHandler;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.memory.MemoryModule;
import com.example.agent.web.server.DashboardServer;

import me.friwi.jcefmaven.CefAppBuilder;
import me.friwi.jcefmaven.MavenCefAppHandlerAdapter;
import me.friwi.jcefmaven.impl.progress.ConsoleProgressHandler;

import org.cef.CefApp;
import org.cef.CefClient;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefMessageRouter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 桌面端主入口 — 通过 JCEF 内嵌 Chromium 浏览器窗口，加载 Hippo Cockpit Web UI。
 *
 * <p>
 * 启动流程：
 * <ol>
 *   <li>初始化 DI 容器（CoreModule.configure）</li>
 *   <li>清理上次残留的 jcef_helper 进程</li>
 *   <li>初始化记忆模块（MemoryModule.initialize）</li>
 *   <li>启动 HTTP Server（DashboardServer.start），等待端口就绪</li>
 *   <li>初始化 JCEF，创建浏览器窗口加载 /cockpit</li>
 *   <li>窗口关闭时：清理资源 → 等待 CEF 子进程退出 → System.exit(0)</li>
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
 *
 * <p>
 * Bridge Handler 已拆分为独立的类（{@code desktop/bridge/} 包下），
 * 通过 {@link CefMessageRouter} 按 action 路由分发。
 * </p>
 */
public final class DesktopApplication {

    private static final Logger logger = LoggerFactory.getLogger(DesktopApplication.class);

    private static int PORT;
    private static CefApp cefApp;
    private static volatile boolean shutdownStarted = false;

    private DesktopApplication() {
    }

    public static void main(String[] args) {
        logger.info("========================================");
        logger.info("  Hippo Code Desktop 启动");
        logger.info("========================================");

        // 0. 启动前清理上次残留的 jcef_helper 进程
        cleanupResidualJcefProcesses();

        // 1. 初始化 DI 容器（与 CLI / Web 模式共享同一套初始化流程）
        CoreModule.configure();

        // 2. 恢复持久化的工作区路径（桌面端专属，Web 端始终为 null）
        WorkspaceContext.load();

        // 3. 初始化记忆模块
        Config config = Config.getInstance();
        PORT = config.getWeb().getPort();
        Path memoryRoot = WorkspaceManager.getUserMemoryDir();
        MemoryModule.initialize(config, memoryRoot);
        logger.info("记忆模块初始化完成");

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
        // main() 在此自然结束，但 JVM 由 Swing EDT / JCEF 非守护线程保活，
        // 不会退出。窗口关闭时由回调中的 System.exit(0) 终止。
    }

    /**
     * 清理系统中残留的 JCEF Helper 进程（上次异常退出留下的孤儿进程）。
     * 支持 Windows / Linux / macOS。
     */
    private static void cleanupResidualJcefProcesses() {
        String os = System.getProperty("os.name").toLowerCase();
        String targetName;
        if (os.contains("win")) {
            targetName = "jcef_helper.exe";
        } else if (os.contains("linux") || os.contains("mac")) {
            targetName = "jcef_helper";
        } else {
            return;
        }

        ProcessHandle.allProcesses()
                .filter(ph -> ph.info().command()
                        .map(cmd -> {
                            String normalized = cmd.replace('\\', '/').toLowerCase();
                            return normalized.endsWith(targetName.toLowerCase());
                        })
                        .orElse(false))
                .forEach(ph -> {
                    logger.warn("发现残留 {} 进程 (PID: {}), 正在清理...", targetName, ph.pid());
                    ph.destroyForcibly();
                });
    }

    private static void initJcef() {
        try {
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception ignored) {
            }

            // ====== JCEF 初始化 ======
            CefAppBuilder builder = new CefAppBuilder();
            builder.setInstallDir(new File("jcef-bundle"));
            builder.setProgressHandler(new ConsoleProgressHandler());
            builder.getCefSettings().windowless_rendering_enabled = false;

            // 设置持久化缓存路径，使 localStorage / IndexDB 等跨重启保留
            Path browserCacheDir = WorkspaceManager.getGlobalCacheDir().resolve("jcef");
            try {
                Files.createDirectories(browserCacheDir);
            } catch (IOException e) {
                logger.warn("创建 JCEF 缓存目录失败，localStorage 可能无法持久化", e);
            }
            builder.getCefSettings().cache_path = browserCacheDir.toString();
            builder.setAppHandler(new MavenCefAppHandlerAdapter() {
            });

            cefApp = builder.build();
            logger.info("JCEF 初始化完成");

            // ====== 注册 ShutdownHook（兜底清理残留进程，防止非正常退出时子进程成为孤儿）======
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                cleanupResidualJcefProcesses();
            }, "jcef-shutdown-hook"));

            CefClient client = cefApp.createClient();

            // ====== 创建浏览器 ======
            CefBrowser browser = client.createBrowser(
                    "http://localhost:" + PORT + "/cockpit",
                    false, false
            );

            // ====== 窗口管理器（提前创建 JFrame，供 handler 注册时使用）=======
            WindowManager windowManager = new WindowManager(() -> {
                if (shutdownStarted) return;
                shutdownStarted = true;
                logger.info("执行桌面端关闭流程...");
                browser.close(true);
                client.dispose();
                cefApp.dispose();
                DashboardServer.stop();
                GracefulShutdown.shutdownAll();
                // 给 CEF 子进程 3 秒窗口完成清理，再退出 JVM
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                System.exit(0);
            });

            // ====== 注册 Bridge Handler ======
            CefMessageRouter router = CefMessageRouter.create(
                    new CefMessageRouter.CefMessageRouterConfig());
            router.addHandler(new FileHandler(), true);
            router.addHandler(new ConfigHandler(
                    windowManager.getThemeConfigPath(),
                    windowManager.getRecentFoldersConfigPath(),
                    windowManager.getWorkspaceSessionConfigPath()), true);
            router.addHandler(new DevToolsHandler(windowManager.getMainFrame()), true);
            router.addHandler(new DialogHandler(windowManager.getMainFrame()), true);
            router.addHandler(new WindowHandler(windowManager), true);
            router.addHandler(new ExternalLinkHandler(), true);
            client.addMessageRouter(router);

            // ====== 显示桌面窗口 ======
            windowManager.showWindow(browser.getUIComponent());

            // ====== 注册 F12 快捷键（打开 DevTools）=======
            browser.executeJavaScript(
                "document.addEventListener('keydown',function(e){if(e.key==='F12'){window.cefQuery({request:JSON.stringify({action:'openDevTools'}),onSuccess:function(r){},onFailure:function(){}});}});",
                "", 0
            );

            // ====== 应用持久化的主题 ======
            try {
                Path themeFile = windowManager.getThemeConfigPath();
                if (Files.exists(themeFile)) {
                    String savedTheme = Files.readString(themeFile).trim();
                    if (savedTheme.equals("dark") || savedTheme.equals("light")) {
                        browser.executeJavaScript(
                            "try{localStorage.setItem('hippo-theme','" + savedTheme + "');" +
                            "document.cookie='hippo-theme=" + savedTheme + ";path=/;max-age=2592000;SameSite=Lax';" +
                            "}catch(e){}",
                            "", 0
                        );
                        logger.info("已注入持久化主题: {}", savedTheme);
                    }
                }
            } catch (Exception e) {
                logger.debug("未找到持久化主题配置，使用默认主题", e);
            }

        } catch (Exception e) {
            logger.error("JCEF 初始化失败", e);
            System.exit(1);
        }
    }
}
