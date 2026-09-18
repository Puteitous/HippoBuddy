package com.example.agent.memory;

import com.example.agent.config.Config;
import com.example.agent.domain.rule.HippoRulesParser;
import com.example.agent.web.server.DashboardServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

/**
 * 记忆模块初始化器
 * 
 * 负责：
 * 1. 创建 MemoryStore、MemoryRetriever
 * 2. 注册到 DI 容器
 * 
 * 设计哲学：文件即记忆，不需要向量化。记忆的读写删除由 LLM 通过
 * read_file / edit_file / rm 直接操作 .hippo/memory/ 下的文件完成。
 */
public class MemoryModule {
    
    private static final Logger logger = LoggerFactory.getLogger(MemoryModule.class);
    
    private static MemoryStore memoryStore;
    private static MemoryRetriever memoryRetriever;
    private static MemoryMetricsCollector metricsCollector;
    
    private MemoryModule() {}
    
    /**
     * 初始化记忆模块
     * 
     * @param config 应用配置
     * @param memoryRoot 记忆存储根目录
     * @return MemoryRetriever 实例
     */
    public static MemoryRetriever initialize(Config config, Path memoryRoot) {
        logger.info("========== 初始化记忆模块 ==========");
        
        // 1. 创建指标收集器
        metricsCollector = new MemoryMetricsCollector();
        
        // 2. 创建沙箱和存储
        MemoryToolSandbox sandbox = new MemoryToolSandbox(memoryRoot);
        memoryStore = new MemoryStore(sandbox);
        logger.info("✅ MemoryStore 初始化完成，当前索引大小：{}", memoryStore.getIndexSize());
        
        // 3. 创建检索器
        HippoRulesParser rulesParser = new HippoRulesParser();
        rulesParser.loadFromWorkspace();
        memoryRetriever = new MemoryRetriever(memoryStore, rulesParser, metricsCollector);
        
        // 4. 注册到 DI 容器
        com.example.agent.core.di.ServiceLocator.registerSingleton(MemoryStore.class, memoryStore);
        com.example.agent.core.di.ServiceLocator.registerSingleton(MemoryRetriever.class, memoryRetriever);
        com.example.agent.core.di.ServiceLocator.registerSingleton(MemoryMetricsCollector.class, metricsCollector);
        
        logger.info("========== 记忆模块初始化完成 ==========");
        
        return memoryRetriever;
    }
    
    /**
     * 启动 Dashboard Server（Web UI / API 服务）
     * <p>
     * 由各入口（CLI、Desktop）按需显式调用，不再由 initialize() 隐式启动。
     * 端口号从 {@link com.example.agent.config.Config#getWeb()} 读取。
     */
    public static void startDashboardServer() {
        int port = com.example.agent.config.Config.getInstance().getWeb().getPort();
        startDashboardServer(port);
    }

    /**
     * 启动 Dashboard Server（Web UI / API 服务）
     *
     * @param port HTTP 端口号
     */
    public static void startDashboardServer(int port) {
        try {
            DashboardServer.start(port);
            logger.info("✅ Dashboard 服务器已启动，端口：{}", port);
            logger.info("   Hippo Cockpit (React): http://localhost:{}/app", port);
        } catch (Exception e) {
            logger.warn("Dashboard 服务器启动失败（不影响核心功能）：{}", e.getMessage(), e);
        }
    }
    
    // Getter 方法
    
    public static MemoryStore getMemoryStore() {
        return memoryStore;
    }
    
    public static MemoryRetriever getMemoryRetriever() {
        return memoryRetriever;
    }
    
    public static MemoryMetricsCollector getMetricsCollector() {
        return metricsCollector;
    }
}
