package com.example.agent;

import com.example.agent.config.Config;
import com.example.agent.core.concurrency.GracefulShutdown;
import com.example.agent.core.di.CoreModule;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.memory.MemoryModule;
import com.example.agent.web.server.DashboardServer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.management.ManagementFactory;
import java.util.concurrent.CountDownLatch;

/**
 * 纯 Web 服务入口 — 仅启动 HTTP Server，不启动 CLI 或桌面窗口。
 *
 * <p>
 * 适用于：
 * <ul>
 *   <li>只通过浏览器访问 Hippo Cockpit / Web Chat 的场景</li>
 *   <li>部署为后台服务（配合 --port 参数）</li>
 *   <li>前端开发调试（配合 Chrome 调试配置）</li>
 * </ul>
 * </p>
 *
 * <p>
 * 启动流程：
 * <ol>
 *   <li>初始化 DI 容器（CoreModule.configure）</li>
 *   <li>初始化记忆模块（MemoryModule.initialize）</li>
 *   <li>启动 HTTP Server（DashboardServer.start），阻塞等待</li>
 * </ol>
 * </p>
 */
public final class WebApplication {

    private static final Logger logger = LoggerFactory.getLogger(WebApplication.class);

    private WebApplication() {
    }

    public static void main(String[] args) {
        int portArg = 0;
        for (int i = 0; i < args.length; i++) {
            if ("--port".equals(args[i]) && i + 1 < args.length) {
                portArg = Integer.parseInt(args[++i]);
            }
        }

        System.setProperty("java.awt.headless", "true");

        // 1. 初始化 DI 容器
        CoreModule.configure();

        // 2. 初始化记忆模块
        Config config = Config.getInstance();
        MemoryModule.initialize(config, WorkspaceManager.getUserMemoryDir());

        // 3. 确定端口：CLI 参数优先，否则从配置读取
        final int port = portArg > 0 ? portArg : config.getWeb().getPort();

        logger.info("========================================");
        logger.info("  HippoBuddy Web 服务启动");
        logger.info("  端口: {}", port);
        logger.info("========================================");

        // 4. 注册关闭钩子
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            String osName = ManagementFactory.getRuntimeMXBean().getName();
            long pid = Long.parseLong(osName.split("@")[0]);
            logger.info("Web 服务正在退出 (PID: {}), 清理资源...", pid);

            DashboardServer.stop();
            GracefulShutdown.shutdownAll();

            try {
                Thread.sleep(100);
            } catch (InterruptedException ignored) {
            }
        }, "web-shutdown-hook"));

        // 5. 启动 HTTP Server（阻塞等待）
        logger.info("正在启动 HTTP Server（端口 {}）...", port);
        CountDownLatch latch = new CountDownLatch(1);
        try {
            DashboardServer.start(port)
                    .thenRun(() -> {
                        logger.info("Web 服务已就绪: http://localhost:{}/cockpit", port);
                    })
                    .exceptionally(throwable -> {
                        logger.error("HTTP Server 启动失败", throwable);
                        System.exit(1);
                        return null;
                    });

            latch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.info("Web 服务主线程被中断");
        }
    }
}
