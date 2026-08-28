package com.example.agent;

import com.example.agent.config.Config;
import com.example.agent.core.di.CoreModule;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.memory.MemoryModule;
import com.example.agent.web.server.DashboardServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;

/**
 * 桌面端后端入口 — 启动 HTTP Server 供 Electron 壳加载。
 *
 * <p>
 * 启动流程：
 * <ol>
 *   <li>设置数据目录</li>
 *   <li>初始化 DI 容器</li>
 *   <li>恢复工作区路径</li>
 *   <li>初始化记忆模块</li>
 *   <li>启动 HTTP Server</li>
 *   <li>等待（由 Electron 管理窗口生命周期）</li>
 * </ol>
 * </p>
 */
public final class DesktopApplication {

    private static final Logger logger = LoggerFactory.getLogger(DesktopApplication.class);

    private DesktopApplication() {
    }

    public static void main(String[] args) {
        initDataDir();

        logger.info("========================================");
        logger.info("  HippoBuddy Desktop 启动");
        logger.info("========================================");

        // 1. 初始化 DI 容器
        CoreModule.configure();

        // 2. 恢复持久化的工作区路径
        WorkspaceContext.load();

        // 3. 初始化记忆模块
        Config config = Config.getInstance();
        int port = config.getWeb().getPort();
        Path memoryRoot = WorkspaceManager.getUserMemoryDir();
        MemoryModule.initialize(config, memoryRoot);
        logger.info("记忆模块初始化完成");

        // 4. 启动 HTTP Server
        logger.info("正在启动 HTTP Server（端口 {}）...", port);
        DashboardServer.start(port)
                .thenRun(() -> {
                    logger.info("HTTP Server 已就绪: http://localhost:{}/app", port);
                    logger.info("Electron 壳连接后自动加载此地址");
                })
                .exceptionally(throwable -> {
                    logger.error("HTTP Server 启动失败", throwable);
                    System.exit(1);
                    return null;
                });

        // 5. 保持 JVM 运行（由 Electron 管理窗口生命周期）
        CountDownLatch latch = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(latch::countDown));
        try {
            latch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * 初始化桌面端数据目录。
     * <p>
     * 优先级（高 → 低）：
     * <ol>
     *   <li>JVM 参数 {@code -Dhippo.data.dir=...}（用户手工指定）</li>
     *   <li>本地 {@code .hippo} 目录存在 → 开发模式，不切换（和 CLI/Web 共享数据）</li>
     *   <li>操作系统用户数据目录（打包后自动检测）</li>
     * </ol>
     */
    private static void initDataDir() {
        if (System.getProperty("hippo.data.dir") != null) return;
        if (java.nio.file.Files.exists(java.nio.file.Paths.get(".hippo"))) return;

        String os = System.getProperty("os.name").toLowerCase();
        String dataDir;
        if (os.contains("win")) {
            dataDir = System.getenv("APPDATA") + "/HippoBuddy/.hippo";
        } else if (os.contains("mac")) {
            dataDir = System.getProperty("user.home") + "/Library/Application Support/HippoBuddy/.hippo";
        } else {
            String xdgData = System.getenv("XDG_DATA_HOME");
            dataDir = (xdgData != null && !xdgData.isBlank() ? xdgData : System.getProperty("user.home") + "/.local/share")
                    + "/HippoBuddy/.hippo";
        }
        System.setProperty("hippo.data.dir", dataDir);
    }
}
