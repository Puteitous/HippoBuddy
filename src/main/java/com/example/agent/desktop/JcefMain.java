package com.example.agent.desktop;

import com.example.agent.core.di.CoreModule;
import com.example.agent.core.concurrency.GracefulShutdown;
import com.example.agent.web.server.DashboardServer;

import me.friwi.jcefmaven.CefAppBuilder;
import me.friwi.jcefmaven.MavenCefAppHandlerAdapter;
import me.friwi.jcefmaven.impl.progress.ConsoleProgressHandler;

import org.cef.CefApp;
import org.cef.CefClient;
import org.cef.browser.CefBrowser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.*;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.File;

/**
 * 桌面端主入口 — 通过 JCEF 内嵌 Chromium 窗口，加载现有 Web UI。
 *
 * <p>
 * 启动流程：
 * <ol>
 *   <li>初始化 DI 容器（CoreModule.configure）</li>
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
public final class JcefMain {

    private static final Logger logger = LoggerFactory.getLogger(JcefMain.class);

    private static final int PORT = 8080;

    private JcefMain() {
    }

    public static void main(String[] args) {
        logger.info("========================================");
        logger.info("  Hippo Code Desktop 启动");
        logger.info("========================================");

        // 1. 初始化 DI 容器（与 CLI 模式共享同一套初始化流程）
        CoreModule.configure();

        // 2. 启动 HTTP Server，等待端口就绪后再初始化 JCEF
        logger.info("正在启动 HTTP Server（端口 {}）...", PORT);
        DashboardServer.start(PORT)
                .thenRun(() -> {
                    logger.info("HTTP Server 已就绪，正在初始化 JCEF...");
                    SwingUtilities.invokeLater(JcefMain::initJcef);
                })
                .exceptionally(throwable -> {
                    logger.error("HTTP Server 启动失败", throwable);
                    System.exit(1);
                    return null;
                });
    }

    private static void initJcef() {
        try {
            // 创建 CefAppBuilder 并设置安装目录
            CefAppBuilder builder = new CefAppBuilder();
            builder.setInstallDir(new File("jcef-bundle"));
            builder.setProgressHandler(new ConsoleProgressHandler());

            // 窗口渲染模式（非 OSR），确保 GPU 加速可用
            builder.getCefSettings().windowless_rendering_enabled = false;

            // 设置 AppHandler（macOS 必需）
            builder.setAppHandler(new MavenCefAppHandlerAdapter() {
            });

            // 构建 CefApp
            CefApp app = builder.build();
            logger.info("JCEF 初始化完成");

            // 创建浏览器客户端
            CefClient client = app.createClient();
            CefBrowser browser = client.createBrowser(
                    "http://localhost:" + PORT + "/cockpit",
                    false, false
            );

            // 创建桌面窗口
            JFrame frame = new JFrame("Hippo Code");
            frame.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
            frame.setSize(1280, 800);
            frame.setLocationRelativeTo(null);

            // 嵌入浏览器组件
            Component browserComponent = browser.getUIComponent();
            frame.add(browserComponent, BorderLayout.CENTER);

            // 窗口关闭时的清理流程
            frame.addWindowListener(new WindowAdapter() {
                @Override
                public void windowClosing(WindowEvent e) {
                    logger.info("正在关闭桌面端...");
                    frame.setVisible(false);

                    browser.close(true);
                    client.dispose();
                    app.dispose();
                    DashboardServer.stop();
                    GracefulShutdown.shutdownAll();

                    System.exit(0);
                }
            });

            frame.setVisible(true);
            logger.info("桌面窗口已打开");

        } catch (Exception e) {
            logger.error("JCEF 初始化失败", e);
            System.exit(1);
        }
    }
}
