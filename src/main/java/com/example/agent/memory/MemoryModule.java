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
 * 3. 注册记忆工具到 ToolRegistry
 * 
 * 设计哲学：文件即记忆，不需要向量化
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
        
        // 5. 注册记忆工具到 ToolRegistry
        registerMemoryTools();
        
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
            logger.info("   Hippo Cockpit: http://localhost:{}/cockpit", port);
            logger.info("   Web Chat:      http://localhost:{}/chat", port);
        } catch (Exception e) {
            logger.warn("Dashboard 服务器启动失败（不影响核心功能）：{}", e.getMessage(), e);
        }
    }
    
    /**
     * 注册记忆工具到 ToolRegistry
     * 
     * 设计哲学：不注册 forget_memory 工具
     * LLM 应使用标准文件操作（read_file + edit_file + rm）管理记忆
     * 这样 LLM 能看到每一步操作，失败后可以自主重试
     */
    private static void registerMemoryTools() {
        try {
            com.example.agent.tools.ToolRegistry toolRegistry = 
                com.example.agent.core.di.ServiceLocator.get(com.example.agent.tools.ToolRegistry.class);
            
            toolRegistry.register(new com.example.agent.tools.RecallMemoryTool(memoryStore));
            
            logger.info("✅ 记忆工具已注册：recall_memory");
            logger.info("ℹ️  记忆删除：LLM 使用 read_file + edit_file + rm 自主操作");
        } catch (Exception e) {
            logger.warn("注册记忆工具失败（ToolRegistry 可能未初始化）：{}", e.getMessage());
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
