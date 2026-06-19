package com.example.agent.core;

import com.example.agent.config.Config;
import com.example.agent.application.ConversationService;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.context.config.ContextConfig;
import com.example.agent.core.di.CoreModule;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.rule.RuleManager;
import com.example.agent.subagent.SubAgentManager;

import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.EventMetricsCollector;
import com.example.agent.logging.TokenMetricsCollector;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.prompt.PromptService;
import com.example.agent.service.TokenEstimator;

import java.util.List;
import com.example.agent.mcp.McpServiceManager;
import com.example.agent.memory.MemoryStore;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.tools.concurrent.ConcurrentToolExecutor;
import com.example.agent.console.AgentUi;
import com.example.agent.console.ConsoleStyle;
import com.example.agent.orchestrator.ToolOrchestrator;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.reader.Reference;
import org.jline.reader.impl.completer.StringsCompleter;
import org.jline.terminal.Terminal;
import org.jline.utils.InfoCmp;
import org.jline.terminal.TerminalBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDate;

public class AgentContext {

    private static final Logger logger = LoggerFactory.getLogger(AgentContext.class);

    private final Config config;
    private final Terminal terminal;
    private final LineReader reader;
    private String sessionId;
    
    private LlmClient llmClient;
    private ToolRegistry toolRegistry;
    private ConcurrentToolExecutor concurrentToolExecutor;
    private ToolOrchestrator toolOrchestrator;
    private TokenEstimator tokenEstimator;
    private ConversationService conversationService;
    private Conversation conversation;
    private TokenMetricsCollector tokenMetricsCollector;
    private EventMetricsCollector eventMetricsCollector;
    private RuleManager ruleManager;
    private McpServiceManager mcpServiceManager;
    // private LspServiceManager lspServiceManager; // 已移除，见 AgentMode/prompt
    private com.example.agent.memory.MemoryRetriever memoryRetriever;
    private AgentMode currentMode = AgentMode.CODING;
    private final java.util.List<java.util.function.Consumer<AgentMode>> modeChangeListeners = new java.util.ArrayList<>();

    public AgentContext() throws IOException {
        this.config = Config.getInstance();
        this.sessionId = String.valueOf(System.currentTimeMillis());
        this.terminal = TerminalBuilder.builder()
                .system(true)
                .encoding(java.nio.charset.StandardCharsets.UTF_8.name())
                .type("ansi")
                .build();
        logger.info("终端类型: {} (强制 ANSI 模式 + UTF-8)", terminal.getType());
        
        this.reader = LineReaderBuilder.builder()
                .terminal(terminal)
                .completer(new StringsCompleter("help", "exit", "quit", "clear", "reset", "retry", "config", "showlog", "tokens", "/mcp", "/mcp list", "/mcp connect", "/mcp disconnect", "/mcp tools", "/chat", "/coding", "/builder", "/mode", "/mode chat", "/mode coding", "/mode builder"))
                .variable(LineReader.HISTORY_FILE, 
                    WorkspaceManager.getHippoRoot().resolve("cli-history"))
                .option(LineReader.Option.DISABLE_EVENT_EXPANSION, true)
                .variable("escape-time", 50)
                .build();

        // ✅ 注册快捷键: Shift+Tab 一键切换 Coding/Chat 模式
        registerModeSwitchShortcut();
        
        // ✅ 注册快捷键: ESC 清空当前输入
        registerEscClearShortcut();
    }

    private void registerEscClearShortcut() {
        final String WIDGET_NAME = "clear-input";
        reader.getWidgets().put(WIDGET_NAME, () -> {
            org.jline.reader.Buffer buffer = reader.getBuffer();
            if (buffer.length() > 0) {
                buffer.clear();
                reader.callWidget(LineReader.REDRAW_LINE);
            }
            return true;
        });

        org.jline.keymap.KeyMap<org.jline.reader.Binding> keyMap = reader.getKeyMaps().get(LineReader.MAIN);
        keyMap.bind(new Reference(WIDGET_NAME), "\033");

        logger.info("ESC 清空输入快捷键已注册");
    }

    private void registerModeSwitchShortcut() {
        final String WIDGET_NAME = "toggle-mode";
        reader.getWidgets().put(WIDGET_NAME, () -> {
            AgentMode newMode = (currentMode == AgentMode.CODING) 
                ? AgentMode.CHAT 
                : AgentMode.CODING;
            
            switchMode(newMode);
            
            terminal.puts(InfoCmp.Capability.carriage_return);
            terminal.writer().println();
            terminal.writer().println(ConsoleStyle.boldCyan(String.format(
                "  ⌨️  Ctrl+B 切换到 %s", newMode.getFullDisplayName()
            )));
            terminal.writer().flush();
            
            reader.callWidget(LineReader.REDRAW_LINE);
            return true;
        });

        org.jline.keymap.KeyMap<org.jline.reader.Binding> keyMap = reader.getKeyMaps().get(LineReader.MAIN);
        keyMap.bind(new Reference(WIDGET_NAME), "\002");

        logger.info("Ctrl+B 快捷键已注册");
    }

    public void initialize() {
        LocalDate today = LocalDate.now();
        this.tokenMetricsCollector = new TokenMetricsCollector(today);
        this.eventMetricsCollector = new EventMetricsCollector(today);
        logger.info("日志系统已初始化");

        // ✅ 一行代码初始化所有依赖
        CoreModule.configure();
        logger.info("DI 容器初始化完成 ✅");

        // ✅ 注册 AgentContext
        ServiceLocator.registerSingleton(AgentContext.class, this);

        // ✅ 从 DI 容器获取所有依赖
        this.llmClient = ServiceLocator.get(LlmClient.class);
        this.tokenEstimator = ServiceLocator.get(TokenEstimator.class);
        this.ruleManager = ServiceLocator.get(RuleManager.class);
        this.toolRegistry = ServiceLocator.get(ToolRegistry.class);
        this.concurrentToolExecutor = ServiceLocator.get(ConcurrentToolExecutor.class);

        // 初始化 Tool Orchestrator 工具编排引擎
        this.toolOrchestrator = new ToolOrchestrator(concurrentToolExecutor);
        ServiceLocator.registerSingleton(ToolOrchestrator.class, toolOrchestrator);
        logger.info("ToolOrchestrator 初始化完成 ✅ - {}", toolOrchestrator.getStats());

        // 初始化各种管理器
        this.ruleManager.loadHippoRules();
        this.ruleManager.loadMemoryMd();
        logger.info("RuleManager 初始化完成");

        logger.info("代码检索：实时搜索模式（无预构建索引）");

        // 初始化 MCP 服务管理器
        this.mcpServiceManager = new McpServiceManager(config, toolRegistry);
        this.mcpServiceManager.initialize();

        // LSP 服务管理器已移除 — 不再对 LLM 暴露 LSP 工具
        // this.lspServiceManager = new LspServiceManager(config, toolRegistry);
        // this.lspServiceManager.initialize();

        // 初始化记忆模块（带主备切换自动化）
        Path memoryRoot = WorkspaceManager.getUserMemoryDir();
        com.example.agent.memory.MemoryRetriever memoryRetriever = 
            com.example.agent.memory.MemoryModule.initialize(config, memoryRoot);
        this.memoryRetriever = memoryRetriever;
        logger.info("记忆模块初始化完成 ✅");





        // 初始化 PromptLibrary
        PromptService promptService = ServiceLocator.get(PromptService.class);
        logger.info("PromptLibrary 初始化完成 ✅");

        // 初始化会话服务（无状态，全局共享）
        this.conversationService = new ConversationService(tokenEstimator, llmClient, config.getContext());
        ServiceLocator.registerSingleton(ConversationService.class, conversationService);
        
        // 增强系统提示词（使用 PromptLibrary）
        String basePrompt = promptService.getBasePrompt(null);
        String enhancedSystemPrompt = this.ruleManager.enhanceSystemPrompt(basePrompt);
        this.conversation = conversationService.create(enhancedSystemPrompt, config.getContext().getMaxTokens(), sessionId);

        logger.info("✅ 四层架构落地: ConversationService(应用层) + Conversation(领域层)");
        logger.info("   - Service: 无状态，全局共享，编排业务流程");
        logger.info("   - Conversation: 有状态，每个会话一个实例，纯业务逻辑");

        // 模式切换监听器：自动切换 System Prompt + 状态栏，无缝保留上下文
        onModeChanged(newMode -> {
            com.example.agent.prompt.model.TaskMode taskMode = switch (newMode) {
                case CHAT -> com.example.agent.prompt.model.TaskMode.CHAT;
                case CODING -> com.example.agent.prompt.model.TaskMode.CODING;
            };
            String prompt = promptService.getBasePrompt(taskMode);
            String enhancedPrompt = ruleManager.enhanceSystemPrompt(prompt);
            
            // ✅ 核心：preserveHistory = true
            conversationService.setSystemPrompt(conversation, enhancedPrompt, true);
            
            // ✅ 更新 Terminal 状态栏标题
            AgentUi ui = ServiceLocator.getOrNull(AgentUi.class);
            if (ui != null) {
                ui.updateTerminalTitle(newMode);
            }
            
            logger.info("模式无缝切换: {} - 上下文已完整保留", newMode.getFullDisplayName());
        });

        // 默认使用 Chat 模式 Prompt
        String defaultPrompt = promptService.getBasePrompt(com.example.agent.prompt.model.TaskMode.CHAT);
        String enhancedDefaultPrompt = ruleManager.enhanceSystemPrompt(defaultPrompt);
        conversationService.setSystemPrompt(conversation, enhancedDefaultPrompt);
        logger.info("默认启用 Chat 模式 System Prompt ✅");
    }

    public void resetConversation() {
        PromptService promptService = ServiceLocator.get(PromptService.class);
        String basePrompt = promptService.getBasePrompt(null);

        // 重新加载规则（确保文件有更新时能重新加载）
        if (this.ruleManager != null) {
            this.ruleManager.reload();
            String enhancedSystemPrompt = this.ruleManager.enhanceSystemPrompt(basePrompt);
            this.conversation = conversationService.create(enhancedSystemPrompt, config.getContext().getMaxTokens(), sessionId);
        } else {
            this.conversation = conversationService.create(basePrompt, config.getContext().getMaxTokens(), sessionId);
        }
    }

    public void addUserMessage(String content) {
        conversation.addMessage(Message.user(content));
    }

    public void addAssistantMessage(String content) {
        conversation.addMessage(Message.assistant(content));
    }

    public void addSystemMessage(String content) {
        conversation.addMessage(Message.system(content));
    }

    public void AgentContext(String toolCallId, String toolName, String content) {
        String compressed = conversationService.getToolResultCompressor().compress(content);
        conversation.addMessage(Message.toolResult(toolCallId, toolName, compressed));
    }

    public List<Message> prepareForInference() {
        return conversationService.prepareForInference(conversation);
    }

    public int getTokenCount() {
        return conversation.getTokenCount();
    }

    public double getTokenUsageRatio() {
        return conversation.getUsageRatio();
    }

    public int getMessageCount() {
        return conversation.size();
    }

    public ConversationService getConversationService() {
        return conversationService;
    }

    public Conversation getConversation() {
        return conversation;
    }

    public Config getConfig() {
        return config;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public Terminal getTerminal() {
        return terminal;
    }

    public LineReader getReader() {
        return reader;
    }

    public LlmClient getLlmClient() {
        return llmClient;
    }

    public ToolRegistry getToolRegistry() {
        return toolRegistry;
    }

    public ConcurrentToolExecutor getConcurrentToolExecutor() {
        return concurrentToolExecutor;
    }

    public TokenEstimator getTokenEstimator() {
        return tokenEstimator;
    }



    public TokenMetricsCollector getTokenMetricsCollector() {
        return tokenMetricsCollector;
    }

    public EventMetricsCollector getEventMetricsCollector() {
        return eventMetricsCollector;
    }

    public RuleManager getRuleManager() {
        return ruleManager;
    }





    public com.example.agent.memory.MemoryRetriever getMemoryRetriever() {
        return memoryRetriever;
    }

    public ToolOrchestrator getToolOrchestrator() {
        return toolOrchestrator;
    }



    public McpServiceManager getMcpServiceManager() {
        return mcpServiceManager;
    }

    public AgentMode getCurrentMode() {
        return currentMode;
    }

    public void switchMode(AgentMode newMode) {
        if (currentMode != newMode) {
            AgentMode oldMode = currentMode;
            currentMode = newMode;
            logger.info("模式切换: {} -> {}", oldMode.getDisplayName(), newMode.getDisplayName());
            modeChangeListeners.forEach(listener -> listener.accept(newMode));
        }
    }

    public void onModeChanged(java.util.function.Consumer<AgentMode> listener) {
        modeChangeListeners.add(listener);
    }

    public void close() {
        logger.info("开始清理 AgentContext 资源...");

        SubAgentManager subAgentManager = ServiceLocator.getOrNull(SubAgentManager.class);
        if (subAgentManager != null) {
            subAgentManager.shutdown();
        }

        if (mcpServiceManager != null) {
            mcpServiceManager.shutdown();
        }

        MemoryStore memoryStore = ServiceLocator.getOrNull(MemoryStore.class);
        if (memoryStore != null) {
            memoryStore.close();
        }

        try {
            if (terminal != null) {
                terminal.close();
            }
        } catch (IOException e) {
            logger.error("关闭终端失败", e);
        }

        logger.info("AgentContext 资源清理完成 ✅");
    }
}
