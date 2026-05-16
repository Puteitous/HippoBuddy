package com.example.agent.core.di;

import com.example.agent.config.Config;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.core.blocker.DuplicateToolCallBlocker;
import com.example.agent.core.blocker.EditBeforeReadBlocker;
import com.example.agent.core.blocker.FileOperationStateMachine;
import com.example.agent.core.concurrency.ThreadPools;
import com.example.agent.core.todo.TodoManager;
import com.example.agent.tools.TodoWriteTool;

import com.example.agent.core.health.ConfigHealthIndicator;
import com.example.agent.core.health.HealthCheckRegistry;
import com.example.agent.core.health.LlmHealthIndicator;
import com.example.agent.core.health.SystemHealthIndicator;

import com.example.agent.domain.rule.RuleManager;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.client.LlmClientFactory;
import com.example.agent.llm.retry.RetryPolicy;
import com.example.agent.logging.CostMetricsCollector;

import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.prompt.PromptLibrary;
import com.example.agent.prompt.PromptService;
import com.example.agent.tools.*;
import com.example.agent.tools.concurrent.ConcurrentToolExecutor;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class CoreModule {
    private static final Logger logger = LoggerFactory.getLogger(CoreModule.class);

    private CoreModule() {}

    public static void configure() {
        logger.info("========== 按层级初始化 DI 容器 ==========");

        Config config = Config.getInstance();

        ThreadPools.initialize();
        logger.info("✅ [Level 0] 基础设施: 线程池管理器");

        ObjectMapper objectMapper = createConfiguredObjectMapper();
        ServiceLocator.registerSingleton(ObjectMapper.class, objectMapper);
        logger.info("✅ [Level 0] 基础设施: ObjectMapper");

        ServiceLocator.registerSingleton(Config.class, config);
        ServiceLocator.registerSingleton(RetryPolicy.class, RetryPolicy.defaultPolicy());
        logger.info("✅ [Level 1] 基础服务: Config, RetryPolicy");

        TokenEstimator tokenEstimator = TokenEstimatorFactory.create(config);
        ServiceLocator.registerSingleton(TokenEstimator.class, tokenEstimator);
        logger.info("✅ [Level 1] 基础服务: TokenEstimator");

        CostMetricsCollector costMetrics = new CostMetricsCollector();
        ServiceLocator.registerSingleton(CostMetricsCollector.class, costMetrics);
        logger.info("✅ [Level 1] 基础服务: 成本计算器");

        HealthCheckRegistry healthRegistry = new HealthCheckRegistry();
        healthRegistry.register(new SystemHealthIndicator());
        healthRegistry.register(new ConfigHealthIndicator(config));
        ServiceLocator.registerSingleton(HealthCheckRegistry.class, healthRegistry);
        logger.info("✅ [Level 1] 基础服务: 健康检查注册中心 ({} 个检查器)", healthRegistry.getIndicatorNames().size());

        RuleManager ruleManager = new RuleManager(tokenEstimator, config.getRule());
        ServiceLocator.registerSingleton(RuleManager.class, ruleManager);
        logger.info("✅ [Level 2] 领域服务: RuleManager");

        TodoManager todoManager = new TodoManager();
        ServiceLocator.registerSingleton(TodoManager.class, todoManager);
        logger.info("✅ [Level 2] 领域服务: TodoManager");

        LlmClient llmClient = LlmClientFactory.create(config, ServiceLocator.get(RetryPolicy.class));
        ServiceLocator.registerSingleton(LlmClient.class, llmClient);
        logger.info("✅ [Level 2] 领域服务: LlmClient");

        PromptService promptService = new PromptService();
        ServiceLocator.registerSingleton(PromptService.class, promptService);
        ServiceLocator.registerSingleton(PromptLibrary.class, PromptLibrary.getInstance());
        logger.info("✅ [Level 2] 领域服务: PromptService, PromptLibrary");

        ToolRegistry toolRegistry = createConfiguredToolRegistry(objectMapper);
        ServiceLocator.registerSingleton(ToolRegistry.class, toolRegistry);
        logger.info("✅ [Level 3] 工具层: ToolRegistry");

        com.example.agent.subagent.SubAgentManager subAgentManager = new com.example.agent.subagent.SubAgentManager();
        ServiceLocator.registerSingleton(com.example.agent.subagent.SubAgentManager.class, subAgentManager);
        logger.info("✅ [Level 3] 工具层: SubAgentManager");

        toolRegistry.register(new ForkAgentTool(subAgentManager));
        toolRegistry.register(new ForkAgentsTool(subAgentManager));
        toolRegistry.register(new ListSubAgentsTool(subAgentManager));
        toolRegistry.register(new CancelSubAgentTool(subAgentManager));
        logger.info("✅ [Level 3] 工具层: 4 个 SubAgent 工具");

        ConcurrentToolExecutor concurrentToolExecutor = new ConcurrentToolExecutor(toolRegistry, objectMapper);
        ServiceLocator.registerSingleton(ConcurrentToolExecutor.class, concurrentToolExecutor);
        logger.info("✅ [Level 3] 工具层: ConcurrentToolExecutor");

        healthRegistry.register(new LlmHealthIndicator(llmClient, costMetrics));
        logger.info("✅ [收尾] LLM 健康检查器已注册");

        logger.info("========== DI 容器初始化完成，共 {} 个服务 ==========", ServiceLocator.countSingletons());
    }

    private static ToolRegistry createConfiguredToolRegistry(ObjectMapper objectMapper) {
        ToolRegistry registry = new ToolRegistry(objectMapper);

        registry.register(new ReadFileTool());
        registry.register(new WriteFileTool());
        registry.register(new EditFileTool());

        registry.register(new ListDirectoryTool());
        registry.register(new GlobTool());
        registry.register(new GrepTool());
        registry.register(new AskUserTool());
        registry.register(new BashTool());
        registry.register(new TodoWriteTool(ServiceLocator.get(TodoManager.class)));

        FileOperationStateMachine stateMachine = new FileOperationStateMachine();
        EditBeforeReadBlocker editBeforeReadBlocker = new EditBeforeReadBlocker();
        editBeforeReadBlocker.setStateMachine(stateMachine);
        DuplicateToolCallBlocker duplicateBlocker = new DuplicateToolCallBlocker();

        registry.getBlockerChain().add(duplicateBlocker);
        registry.getBlockerChain().add(stateMachine);
        registry.getBlockerChain().add(new com.example.agent.core.blocker.SchemaValidationBlocker(registry));
        registry.getBlockerChain().add(new com.example.agent.core.blocker.ConcurrentEditBlocker());
        registry.getBlockerChain().add(editBeforeReadBlocker);
        registry.getBlockerChain().add(new com.example.agent.core.blocker.SyntaxValidationBlocker());
        registry.getBlockerChain().add(new com.example.agent.core.blocker.BashDangerousCommandBlocker());
        registry.getBlockerChain().add(new com.example.agent.core.blocker.EditCountBlocker());
        registry.getBlockerChain().add(new com.example.agent.core.blocker.RateLimitBlocker());
        registry.getBlockerChain().add(new com.example.agent.core.blocker.ContextAwareBlocker());

        return registry;
    }

    private static ObjectMapper createConfiguredObjectMapper() {
        return new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);
    }
}
