package com.example.agent.application;

import com.example.agent.config.Config;
import com.example.agent.config.MemoryConfig;
import com.example.agent.context.BudgetWarningInjector;
import com.example.agent.context.ContextWindow;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.context.SessionCompactionState;
import com.example.agent.context.compressor.AutoCompactTrigger;
import com.example.agent.context.config.ContextConfig;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.truncation.TruncationService;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Usage;
import com.example.agent.memory.MemoryRetriever;
import com.example.agent.memory.MemoryStore;
import com.example.agent.memory.MemoryToolSandbox;
import com.example.agent.memory.extraction.MemoryExtractor;
import com.example.agent.memory.consolidation.MemoryConsolidator;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.memory.session.SessionMemoryExtractor;
import com.example.agent.service.TokenEstimator;
import java.nio.file.Path;
import com.example.agent.session.SessionData;
import com.example.agent.session.SessionTranscript;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

public class ConversationService {

    private static final Logger logger = LoggerFactory.getLogger(ConversationService.class);
    private final TokenEstimator tokenEstimator;
    private final LlmClient llmClient;
    private final ContextConfig defaultConfig;
    private final TruncationService truncationService;
    private final MemoryStore globalMemoryStore;

    private final Map<String, Conversation> conversationRegistry = new ConcurrentHashMap<>();
    private final Map<String, ConversationComponents> componentRegistry = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionLastAccessTime = new ConcurrentHashMap<>();

    private Consumer<Message> messageListener;
    private Consumer<Message> messageSyncListener;

    private static class ConversationComponents {
        final BudgetWarningInjector warningInjector;
        final AutoCompactTrigger autoCompactTrigger;
        final MemoryRetriever memoryRetriever;
        final SessionMemoryExtractor sessionMemoryExtractor;
        final MemoryExtractor memoryExtractor;
        final MemoryConsolidator memoryConsolidator;
        final SessionTranscript transcript;
        final SessionCompactionState compactionState;

        ConversationComponents(BudgetWarningInjector warningInjector,
                                AutoCompactTrigger autoCompactTrigger,
                                MemoryRetriever memoryRetriever,
                                SessionMemoryExtractor sessionMemoryExtractor,
                                MemoryExtractor memoryExtractor,
                                MemoryConsolidator memoryConsolidator,
                                SessionTranscript transcript,
                                SessionCompactionState compactionState) {
            this.warningInjector = warningInjector;
            this.autoCompactTrigger = autoCompactTrigger;
            this.memoryRetriever = memoryRetriever;
            this.sessionMemoryExtractor = sessionMemoryExtractor;
            this.memoryExtractor = memoryExtractor;
            this.memoryConsolidator = memoryConsolidator;
            this.transcript = transcript;
            this.compactionState = compactionState;
        }
    }

    public ConversationService(TokenEstimator tokenEstimator, LlmClient llmClient) {
        this(tokenEstimator, llmClient, new ContextConfig());
    }

    public ConversationService(TokenEstimator tokenEstimator, LlmClient llmClient, ContextConfig config) {
        if (tokenEstimator == null) {
            throw new IllegalArgumentException("tokenEstimator 不能为 null");
        }
        if (llmClient == null) {
            throw new IllegalArgumentException("llmClient 不能为 null");
        }
        this.tokenEstimator = tokenEstimator;
        this.llmClient = llmClient;
        this.defaultConfig = config != null ? config : new ContextConfig();
        this.truncationService = new TruncationService(tokenEstimator);
        
        // 优先使用 DI 容器中的 MemoryStore（由 MemoryModule 初始化）
        // 避免创建多个 MemoryStore 实例导致索引不一致
        MemoryStore store = null;
        try {
            store = com.example.agent.core.di.ServiceLocator.get(MemoryStore.class);
            logger.info("✅ 使用 DI 容器中的 MemoryStore 实例");
        } catch (Exception e) {
            logger.info("DI 容器中未找到 MemoryStore，创建新实例");
        }
        
        if (store == null) {
            MemoryToolSandbox sandbox = new MemoryToolSandbox(WorkspaceManager.getUserMemoryDir());
            store = new MemoryStore(sandbox);
        }
        this.globalMemoryStore = store;
    }

    public Conversation create(String systemPrompt) {
        return create(systemPrompt, defaultConfig.getMaxTokens(), String.valueOf(System.currentTimeMillis()));
    }

    public Conversation create(String systemPrompt, int maxTokens) {
        return create(systemPrompt, maxTokens, String.valueOf(System.currentTimeMillis()));
    }

    public Conversation create(String systemPrompt, int maxTokens, String sessionId) {
        Conversation conversation = new Conversation(maxTokens, tokenEstimator, sessionId);
        conversation.setSystemPrompt(systemPrompt != null ? systemPrompt : "");

        initializeComponents(conversation);

        if (systemPrompt != null && !systemPrompt.isEmpty()) {
            conversation.addMessage(Message.system(systemPrompt));
        }

        conversationRegistry.put(sessionId, conversation);
        
        logger.debug("创建新会话: sessionId={}, systemPrompt长度={}", 
            sessionId, systemPrompt != null ? systemPrompt.length() : 0);
        return conversation;
    }

    public Conversation getConversation(String sessionId) {
        return conversationRegistry.get(sessionId);
    }

    public void registerConversation(String sessionId, Conversation conversation) {
        conversationRegistry.put(sessionId, conversation);
        logger.info("✅ 会话已注册到全局注册表: {}", sessionId);
    }

    public Conversation createSubAgentConversation(String userInstruction, String parentSessionId) {
        String subSessionId = parentSessionId != null 
            ? parentSessionId + "_sub_" + System.nanoTime() % 1000000
            : "sub_" + System.currentTimeMillis();
            
        Conversation conversation = new Conversation(
            defaultConfig.getMaxTokens(), 
            tokenEstimator, 
            subSessionId
        );

        if (userInstruction != null && !userInstruction.isEmpty()) {
            conversation.addMessage(Message.user(userInstruction));
        }

        logger.debug("创建 Sub-Agent 轻量级会话: sessionId={}, parent={}", 
            subSessionId, parentSessionId);
        return conversation;
    }



    public void ensureSessionComponents(Conversation conversation) {
        if (!componentRegistry.containsKey(conversation.getSessionId())) {
            createSessionComponents(conversation, new SessionCompactionState());
        }
    }

    private void createSessionComponents(Conversation conversation, SessionCompactionState compactionState) {
        String sessionId = conversation.getSessionId();
        ContextWindow contextWindow = conversation.getContextWindow();
        SessionTranscript transcript = new SessionTranscript(sessionId);
        BudgetWarningInjector warningInjector = new BudgetWarningInjector(contextWindow);
        warningInjector.register();

        AutoCompactTrigger autoCompactTrigger = new AutoCompactTrigger(
            contextWindow,
            tokenEstimator,
            sessionId
        );
        autoCompactTrigger.register();

        // 使用 DI 容器中的 MemoryRetriever（由 MemoryModule 初始化）
        MemoryRetriever memoryRetriever;
        try {
            memoryRetriever = com.example.agent.core.di.ServiceLocator.get(MemoryRetriever.class);
        } catch (Exception e) {
            // 降级：如果 DI 容器中没有，使用简化版本
            logger.warn("DI 容器中未找到 MemoryRetriever，使用简化版本（无向量检索能力）");
            memoryRetriever = new MemoryRetriever(globalMemoryStore);
        }

        // 创建会话记忆提取器
        MemoryConfig memoryConfig = Config.getInstance().getMemory();
        SessionMemoryExtractor sessionMemoryExtractor = new SessionMemoryExtractor(
            sessionId,
            tokenEstimator,
            llmClient,
            compactionState,
            null,
            memoryConfig
        );

        // 创建长期记忆提取器
        MemoryExtractor memoryExtractor = new MemoryExtractor(
            sessionId,
            tokenEstimator,
            llmClient,
            memoryConfig
        );

        // 创建后台记忆整合器
        MemoryConsolidator memoryConsolidator = new MemoryConsolidator(llmClient);
        
        // 注册新会话到整合器
        memoryConsolidator.registerSession(sessionId);
        
        // 将 consolidator 注入到 MemoryStore，打通 AutoDream 触发链路
        globalMemoryStore.setConsolidator(memoryConsolidator);

        componentRegistry.put(sessionId, new ConversationComponents(
            warningInjector,
            autoCompactTrigger,
            memoryRetriever,
            sessionMemoryExtractor,
            memoryExtractor,
            memoryConsolidator,
            transcript,
            compactionState
        ));
        
        sessionLastAccessTime.put(sessionId, System.currentTimeMillis());
    }

    private void initializeComponents(Conversation conversation) {
        createSessionComponents(conversation, new SessionCompactionState());
    }

    private ConversationComponents getComponents(Conversation conversation) {
        if (conversation == null) {
            logger.warn("conversation 为 null");
            return null;
        }
        String sessionId = conversation.getSessionId();
        if (sessionId == null) {
            logger.warn("sessionId 为 null");
            return null;
        }
        sessionLastAccessTime.put(sessionId, System.currentTimeMillis());
        return componentRegistry.get(sessionId);
    }

    public void destroy(Conversation conversation) {
        String sessionId = conversation.getSessionId();
        ConversationComponents components = componentRegistry.get(sessionId);
        
        // 会话结束时触发最终提取
        if (components != null) {
            try {
                components.memoryExtractor.checkAndExtract(conversation.getMessages());
                logger.debug("会话结束，触发最终长期记忆提取: sessionId={}", sessionId);
            } catch (Exception e) {
                logger.warn("会话结束时触发记忆提取失败: sessionId={}", sessionId, e);
            }
            
            // 触发 AutoDream（三重门会自动判断是否真正执行整合）
            try {
                components.memoryConsolidator.checkAndConsolidate(sessionId);
                logger.debug("会话结束，触发 AutoDream 记忆整合: sessionId={}", sessionId);
            } catch (Exception e) {
                logger.warn("会话结束时触发 AutoDream 失败: sessionId={}", sessionId, e);
            }
            
            // 刷盘并关闭 Transcript，确保异步队列中的消息全部写入文件
            try {
                components.transcript.forceFlush();
                components.transcript.close();
            } catch (Exception e) {
                logger.warn("关闭 Transcript 失败: sessionId={}", sessionId, e);
            }
        }
        
        componentRegistry.remove(sessionId);
        sessionLastAccessTime.remove(sessionId);
        conversation.clear();
        logger.debug("销毁会话: sessionId={}", sessionId);
    }

    public void cleanupIdleSessions(long idleTimeoutMs) {
        long now = System.currentTimeMillis();
        int cleanedCount = 0;
        
        Iterator<Map.Entry<String, Long>> iterator = sessionLastAccessTime.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, Long> entry = iterator.next();
            if (now - entry.getValue() > idleTimeoutMs) {
                String sessionId = entry.getKey();
                componentRegistry.remove(sessionId);
                iterator.remove();
                cleanedCount++;
                logger.debug("清理空闲会话: sessionId={}", sessionId);
            }
        }
        
        if (cleanedCount > 0) {
            logger.info("空闲会话清理完成: 清理 {} 个，剩余活跃会话 {}", 
                cleanedCount, componentRegistry.size());
        }
    }

    public int getActiveSessionCount() {
        return componentRegistry.size();
    }

    public void reset(Conversation conversation) {
        if (conversation == null) {
            logger.warn("尝试重置 null 的 conversation");
            return;
        }
        String sessionId = conversation.getSessionId();
        conversation.clear();
        componentRegistry.remove(sessionId);
        sessionLastAccessTime.remove(sessionId);
        initializeComponents(conversation);
        
        String systemPrompt = conversation.getSystemPrompt();
        if (systemPrompt != null && !systemPrompt.isEmpty()) {
            conversation.addMessage(Message.system(systemPrompt));
        }
    }

    public void setSystemPrompt(Conversation conversation, String newSystemPrompt) {
        throw new UnsupportedOperationException(
            "System Prompt 已冻结：会话创建后不可变更。如需更换提示词请新建会话。"
                + "（此方法已废弃，请勿在会话存活期改写 prompt，否则会击穿 LLM 前缀缓存）");
    }

    /**
     * 从会话历史（transcript JSONL）中恢复最初固化的 System Prompt。
     * <p>
     * 重启后恢复历史会话时，必须沿用会话创建时固化的 prompt（含当时的工作区/
     * 规则/技能快照），而不是用当前工作区重算——否则恢复后 prompt 内容变化，
     * 前缀缓存 miss 且 LLM 以为仍在旧工作区。transcript 第一条 system 消息
     * 即会话创建时固化的 prompt。
     * </p>
     *
     * @param sessionId 会话 ID
     * @return 历史 system prompt；无历史或无 system 消息时返回 null
     */
    public String findSystemPromptFromHistory(String sessionId) {
        if (sessionId == null) {
            return null;
        }
        try {
            com.example.agent.session.TranscriptLoader.LoadResult loadResult =
                com.example.agent.session.TranscriptLoader.load(sessionId);
            for (Message msg : loadResult.getMessages()) {
                if (msg != null && "system".equals(msg.getRole())
                        && msg.getContent() != null && !msg.getContent().isBlank()) {
                    return msg.getContent();
                }
            }
            return null;
        } catch (Exception e) {
            logger.warn("从历史恢复 System Prompt 失败: sessionId={}, 回退到默认 prompt", sessionId, e);
            return null;
        }
    }

    public Message addUserMessage(Conversation conversation, String content) {
        Message message = Message.user(content);
        addMessage(conversation, message);
        return message;
    }

    public int truncateMessagesAfter(Conversation conversation, String messageId) {
        if (conversation == null || messageId == null) {
            return 0;
        }
        List<Message> messages = conversation.getMessages();
        int targetIndex = -1;
        for (int i = 0; i < messages.size(); i++) {
            if (messageId.equals(messages.get(i).getId())) {
                targetIndex = i;
                break;
            }
        }
        if (targetIndex < 0) {
            logger.warn("未找到消息 ID: {}", messageId);
            return 0;
        }
        List<Message> remaining = new ArrayList<>(messages.subList(0, targetIndex));
        int removed = messages.size() - targetIndex;
        conversation.getContextWindow().replaceMessages(remaining);
        logger.info("截断消息: 保留前 {} 条, 移除 {} 条", targetIndex, removed);
        return removed;
    }

    /**
     * 强制刷盘 Transcript 并返回其文件路径
     */
    public Path flushTranscript(String sessionId) {
        ConversationComponents components = componentRegistry.get(sessionId);
        if (components != null) {
            components.transcript.forceFlush();
            return components.transcript.getTranscriptFile();
        }
        return null;
    }

    /**
     * 销毁 Transcript 组件（强制刷盘 + 关闭 + 从注册表移除）
     * 调用后需通过 ensureSessionComponents() 重建
     */
    public void destroyTranscript(String sessionId) {
        ConversationComponents components = componentRegistry.remove(sessionId);
        if (components != null) {
            try {
                components.transcript.forceFlush();
                components.transcript.close();
                logger.debug("已销毁 Transcript 组件: sessionId={}", sessionId);
            } catch (Exception e) {
                logger.warn("销毁 Transcript 组件失败: sessionId={}", sessionId, e);
            }
        }
        sessionLastAccessTime.remove(sessionId);
    }

    public Message editUserMessage(Conversation conversation, String messageId, String newContent) {
        if (conversation == null || messageId == null || newContent == null) {
            return null;
        }
        int removed = truncateMessagesAfter(conversation, messageId);
        if (removed == 0) {
            return null;
        }
        return addUserMessage(conversation, newContent);
    }

    public void addAssistantMessage(Conversation conversation, String content) {
        addMessage(conversation, Message.assistant(content));
    }

    public void addAssistantMessage(Conversation conversation, Message message, Usage usage) {
        // 先更新 lastKnownUsage 再落库：transcript 写入 assistant 消息时读取
        // conversation.getLastKnownUsage()（见 addMessage），若后更新会把上一次的
        // usage 写进本次消息，导致 jsonl 中每条 assistant 的 usage 滞后一条
        // （前端 Token 趋势图 / 会话恢复统计偏差）。
        if (usage != null) {
            conversation.updateLastKnownUsage(usage);
            logger.debug("已保存 usage: prompt={}, completion={}, total={}, cacheHit={}",
                usage.getPromptTokens(), usage.getCompletionTokens(), usage.getTotalTokens(),
                usage.getCacheReadInputTokens());
        } else {
            logger.warn("LLM 返回的 usage 为 null");
        }

        addMessage(conversation, message);
    }

    public void addToolResult(Conversation conversation, String toolCallId, String toolName, String content) {
        addToolResult(conversation, toolCallId, toolName, content, true);
    }

    public void addToolResult(Conversation conversation, String toolCallId, String toolName, String content, boolean success) {
        String truncated = truncationService.truncateToolOutput(toolName, content);
        Message message = Message.toolResult(toolCallId, toolName, truncated);
        message.setToolSuccess(success);
        addMessage(conversation, message, success);
    }

    public void addMessage(Conversation conversation, Message message) {
        addMessage(conversation, message, true);
    }

    private void addMessage(Conversation conversation, Message message, boolean toolSuccess) {
        if (conversation == null) {
            logger.warn("conversation 为 null，跳过添加消息");
            return;
        }
        if (message == null) {
            logger.warn("message 为 null，跳过添加");
            return;
        }
        
        ConversationComponents components = getComponents(conversation);
        
        conversation.addMessage(message);
        notifyMessageAdded(message);

        if (components != null) {
            components.sessionMemoryExtractor.onMessageAdded(message, conversation.getMessages());
            components.memoryExtractor.onMessageAdded(message, conversation.getMessages());
            
            if (message.getContent() != null && conversation.shouldMarkForMemory(message)) {
                components.memoryRetriever.markForMemory(message.getContent());
            }
            
            if (message.isUser()) {
                logger.debug("addMessage: user message to transcript, multimodal={}, contentLength={}, contentPreview={}",
                    message.isMultimodal(),
                    message.getContent() != null ? message.getContent().length() : 0,
                    message.getContent() != null ? message.getContent().substring(0, Math.min(message.getContent().length(), 50)) : "null");
                components.transcript.appendUserMessage(message);
            } else if (message.isAssistant()) {
                components.transcript.appendAssistantMessage(message, conversation.getLastKnownUsage());
            } else if (message.isTool()) {
                components.transcript.appendToolResult(message, message.getName(), 0, toolSuccess);
            } else if (message.isSystem()) {
                components.transcript.appendSystemMessage(message.getContent());
            }
        }
    }

    public String findLastUserMessageId(Conversation conversation) {
        List<Message> messages = conversation.getMessages();
        for (int i = messages.size() - 1; i >= 0; i--) {
            Message msg = messages.get(i);
            if (msg.isUser() && msg.getId() != null && !msg.getId().isEmpty()) {
                return msg.getId();
            }
        }
        return null;
    }

    public List<Message> prepareForInference(Conversation conversation) {
        ConversationComponents components = getComponents(conversation);
        
        List<Message> effectiveMessages = conversation.getEffectiveMessages();
        
        if (components != null) {
            effectiveMessages = components.memoryRetriever.prepareContextHeader(effectiveMessages);
        }
        
        return effectiveMessages;
    }

    public List<Message> getMessagesForUI(Conversation conversation) {
        return conversation.getAllMessages();
    }

    public String getCompactionStats(Conversation conversation) {
        return getCompactionSummary(conversation);
    }

    public String getCompactionSummary(Conversation conversation) {
        int used = conversation.getTokenCount();
        int max = getConfig().getMaxTokens();
        return String.format("上下文: %d / %d tokens (%.1f%%)", used, max, (double) used / max * 100);
    }

    public int getTokenCount(Conversation conversation) {
        return conversation.getTokenCount();
    }

    public double getTokenUsageRatio(Conversation conversation) {
        return conversation.getUsageRatio();
    }

    public SessionData exportSession(Conversation conversation, String sessionId, SessionData.Status status) {
        SessionData data = SessionData.create(sessionId, new ArrayList<>(conversation.getMessages()), status);
        String workspacePath = WorkspaceContext.getCurrentFolder();
        if (workspacePath != null && !workspacePath.isBlank()) {
            data.setWorkspacePath(workspacePath);
        }
        return data;
    }

    public boolean importSession(Conversation conversation, SessionData sessionData) {
        if (sessionData == null || sessionData.getMessages() == null) {
            return false;
        }
        
        try {
            conversation.clear();
            conversation.addMessages(sessionData.getMessages());
            return true;
        } catch (Exception e) {
            logger.error("导入会话失败", e);
            return false;
        }
    }

    public List<Message> getContextForInference(Conversation conversation) {
        return prepareForInference(conversation);
    }

    public ResumeResult resumeConversation(Conversation conversation, String sessionId) {
        logger.info("========== 开始恢复会话：{} ==========", sessionId);
        
        ResumeResult result = new ResumeResult(sessionId);

        com.example.agent.memory.session.SessionMemoryManager memoryManager =
            new com.example.agent.memory.session.SessionMemoryManager(sessionId);
        boolean hasMemory = memoryManager.exists() && memoryManager.hasActualContent();
        logger.info("Session Memory 检查：exists={}, hasActualContent={}", 
            memoryManager.exists(), memoryManager.hasActualContent());

        com.example.agent.session.TranscriptLoader.LoadResult loadResult =
            com.example.agent.session.TranscriptLoader.load(sessionId);
        
        logger.info("Transcript 加载结果：isEmpty={}, messageCount={}, recoveredFromCrash={}", 
            loadResult.isEmpty(), loadResult.getMessageCount(), loadResult.isRecoveredFromCrash());
        
        if (loadResult.isEmpty()) {
            logger.warn("会话 {} 无 Transcript 数据", sessionId);
            result.status = ResumeResult.Status.NO_TRANSCRIPT;
            return result;
        }

        List<Message> allMessages = loadResult.getMessages();
        logger.debug("加载到 {} 条消息", allMessages.size());
        if (!allMessages.isEmpty()) {
            for (int i = 0; i < Math.min(allMessages.size(), 10); i++) {
                Message msg = allMessages.get(i);
                logger.debug("  [{}] role={}, contentPreview={}", 
                    i, msg.getRole(), 
                    msg.getContent() != null && msg.getContent().length() > 50 
                        ? msg.getContent().substring(0, 50) + "..." 
                        : msg.getContent());
            }
        }
        
        if (allMessages.isEmpty()) {
            logger.warn("会话 {} Transcript 中无消息", sessionId);
            result.status = ResumeResult.Status.NO_TRANSCRIPT;
            return result;
        }

        int totalTokens = tokenEstimator.estimate(allMessages);
        int maxTokens = conversation.getContextWindow().getBudget().getMaxTokens();
        int tokenThreshold = (int) (maxTokens * 0.7);
        logger.info("Token 统计：totalTokens={}, maxTokens={}, threshold={}", totalTokens, maxTokens, tokenThreshold);

        if (hasMemory && totalTokens > tokenThreshold) {
            logger.info("使用智能恢复模式（记忆 + 最近对话）");
            String memoryContent = memoryManager.read();
            int memoryTokens = tokenEstimator.estimateTextTokens(memoryContent);

            List<Message> recentMessages = extractRecentMessages(allMessages, maxTokens - memoryTokens - 500);
            int recentTokens = tokenEstimator.estimate(recentMessages);

            conversation.clear();
            conversation.addMessage(Message.system(conversation.getSystemPrompt()));
            conversation.addMessage(Message.user(
                "## [会话恢复] 早期对话摘要\n\n" +
                "> 来源：✅ session-memory.md | 已合并早期对话\n\n" +
                memoryContent + "\n\n---\n\n" +
                "> 以上为早期会话摘要，最近对话完整保留"
            ));
            conversation.addMessages(recentMessages);

            result.status = ResumeResult.Status.RESUMED_WITH_MEMORY;
            result.totalMessages = allMessages.size();
            result.loadedMessages = recentMessages.size() + 2;
            result.usedMemory = true;
            result.savedTokens = totalTokens - tokenEstimator.estimate(conversation.getMessages());

            logger.info("智能恢复完成：sessionId={}, 全部{}条/{}tokens → 记忆+最近{}条/{}tokens, 节省{}tokens",
                sessionId, allMessages.size(), totalTokens,
                recentMessages.size(), tokenEstimator.estimate(conversation.getMessages()),
                result.savedTokens);
        } else {
            logger.info("使用完整恢复模式");
            conversation.clear();
            conversation.addMessage(Message.system(conversation.getSystemPrompt()));
            conversation.addMessages(allMessages);

            result.status = ResumeResult.Status.RESUMED_FULL;
            result.totalMessages = allMessages.size();
            result.loadedMessages = allMessages.size() + 1;
            result.usedMemory = false;

            logger.info("完整恢复完成：sessionId={}, {}条消息/{}tokens (含 system message)",
                sessionId, allMessages.size() + 1, totalTokens);
        }

        detectAndFixInterruption(conversation);

        // 恢复最后一条 assistant 的 usage，确保重启后上下文统计准确
        Usage restoredUsage = loadResult.getLastKnownUsage();
        if (restoredUsage != null) {
            conversation.updateLastKnownUsage(restoredUsage);
            logger.info("已恢复 usage: prompt={}, completion={}, total={}",
                restoredUsage.getPromptTokens(), restoredUsage.getCompletionTokens(),
                restoredUsage.getTotalTokens());
        }

        if (loadResult.isRecoveredFromCrash()) {
            logger.info("会话 {} 从崩溃中恢复，截断了 {} 行损坏数据",
                sessionId, loadResult.getTruncatedLines());
        }
        
        logger.info("恢复后 conversation 消息数：{}", conversation.getMessages().size());
        logger.info("========== 会话恢复完成：{} ==========", sessionId);

        return result;
    }

    private List<Message> extractRecentMessages(List<Message> allMessages, int tokenBudget) {
        if (tokenBudget <= 0 || allMessages.isEmpty()) {
            return allMessages;
        }

        List<Message> recent = new ArrayList<>();
        int usedTokens = 0;

        for (int i = allMessages.size() - 1; i >= 0; i--) {
            Message msg = allMessages.get(i);
            if (msg.isSystem()) continue;

            int msgTokens = tokenEstimator.estimateMessageTokens(msg);
            if (usedTokens + msgTokens > tokenBudget && !recent.isEmpty()) {
                break;
            }
            recent.add(0, msg);
            usedTokens += msgTokens;
        }

        while (!recent.isEmpty() && recent.get(0).isTool()) {
            recent.remove(0);
        }

        return recent;
    }

    private void detectAndFixInterruption(Conversation conversation) {
        List<Message> messages = conversation.getMessages();
        if (messages.isEmpty()) {
            return;
        }

        Message lastMsg = messages.get(messages.size() - 1);

        if (lastMsg.isAssistant() && lastMsg.getToolCalls() != null && !lastMsg.getToolCalls().isEmpty()) {
            boolean hasToolResult = false;
            for (int i = messages.size() - 2; i >= Math.max(0, messages.size() - 5); i--) {
                if (messages.get(i).isTool()) {
                    hasToolResult = true;
                    break;
                }
            }
            if (!hasToolResult) {
                StringBuilder fixContent = new StringBuilder();
                String existing = lastMsg.getContent() != null ? lastMsg.getContent() : "";
                if (!existing.isEmpty()) {
                    fixContent.append(existing).append("\n\n");
                }
                fixContent.append("[会话中断] 检测到未完成的工具调用：");
                for (com.example.agent.llm.model.ToolCall call : lastMsg.getToolCalls()) {
                    fixContent.append("\n  - 待执行的操作: ").append(call.getFunction().getName());
                }
                lastMsg.setContent(fixContent.toString());
                lastMsg.setToolCalls(null);
                logger.info("检测到 interrupted_turn，已修复未完成的工具调用");
            }
        } else if (lastMsg.isUser()) {
            conversation.addMessage(Message.assistant(
                "[会话恢复提示] 之前的回复被中断，请继续。"
            ));
            logger.info("检测到 interrupted_prompt，已添加恢复提示");
        }
    }

    public static class ResumeResult {
        public enum Status {
            NO_TRANSCRIPT, RESUMED_FULL, RESUMED_WITH_MEMORY
        }

        private final String sessionId;
        public Status status;
        public int totalMessages;
        public int loadedMessages;
        public boolean usedMemory;
        public int savedTokens;

        public ResumeResult(String sessionId) {
            this.sessionId = sessionId;
        }

        public boolean isResumed() {
            return status == Status.RESUMED_FULL || status == Status.RESUMED_WITH_MEMORY;
        }

        public Status getStatus() { return status; }
        public int getTotalMessages() { return totalMessages; }
        public int getLoadedMessages() { return loadedMessages; }
        public boolean isUsedMemory() { return usedMemory; }
        public int getSavedTokens() { return savedTokens; }
    }

    public void cleanupInterruptedToolCalls(Conversation conversation) {
        List<Message> messages = conversation.getMessages();
        if (messages.isEmpty()) {
            return;
        }

        Message lastMessage = messages.get(messages.size() - 1);
        if (!lastMessage.isAssistant() || lastMessage.getToolCalls() == null || lastMessage.getToolCalls().isEmpty()) {
            return;
        }

        boolean hasToolResult = false;
        for (int i = messages.size() - 2; i >= Math.max(0, messages.size() - 5); i--) {
            Message msg = messages.get(i);
            if (msg.isTool()) {
                hasToolResult = true;
                break;
            }
        }

        if (!hasToolResult) {
            StringBuilder fixContent = new StringBuilder();
            String existingContent = lastMessage.getContent() != null ? lastMessage.getContent() : "";
            if (!existingContent.isEmpty()) {
                fixContent.append(existingContent).append("\n\n");
            }
            fixContent.append("[会话中断] 检测到未完成的工具调用：");
            for (com.example.agent.llm.model.ToolCall call : lastMessage.getToolCalls()) {
                fixContent.append("\n  - 待执行的操作: ").append(call.getFunction().getName());
            }
            lastMessage.setContent(fixContent.toString());
            lastMessage.setToolCalls(null);
        }
    }

    public void setMessageListener(Consumer<Message> listener) {
        this.messageListener = listener;
    }

    public void setMessageSyncListener(Consumer<Message> listener) {
        this.messageSyncListener = listener;
    }

    public int getMessageCount(Conversation conversation) {
        return conversation.getMessageCount();
    }

    public List<Message> getHistory(Conversation conversation) {
        return conversation.getMessages();
    }

    public void fixUnfinishedToolCall(Conversation conversation) {
        cleanupInterruptedToolCalls(conversation);
    }

    public ContextConfig getConfig() {
        return defaultConfig;
    }

    private void notifyMessageAdded(Message message) {
        if (messageListener != null) {
            messageListener.accept(message);
        }
        if (messageSyncListener != null) {
            messageSyncListener.accept(message);
        }
    }
}
