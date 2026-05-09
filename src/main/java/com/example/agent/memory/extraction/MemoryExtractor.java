package com.example.agent.memory.extraction;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.config.MemoryConfig;
import com.example.agent.llm.model.Message;
import com.example.agent.memory.MemoryStore;
import com.example.agent.memory.MemoryToolSandbox;
import com.example.agent.service.TokenEstimator;
import com.example.agent.subagent.SubAgentManager;
import com.example.agent.subagent.SubAgentPermission;
import com.example.agent.subagent.SubAgentTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

/**
 * 长期记忆实时提取器
 * 
 * 职责：
 * 1. 监听对话消息，检查提取触发条件
 * 2. 创建 SubAgent 从对话中提取长期记忆
 * 3. 写入 ~/.hippo/memory/ 目录下的记忆文件
 * 
 * 与 SessionMemoryExtractor 的区别：
 * - SessionMemoryExtractor：提取会话内记忆（session-memory.md）
 * - MemoryExtractor：提取跨会话长期记忆（MEMORY.md 索引下的 UUID.md 文件）
 * 
 * 触发时机：每 N 轮对话自动触发
 * 
 * 设计参考：Claude Code 的七层优化
 * - 并发控制：AtomicBoolean + trailing extraction
 * - 权限隔离：SubAgent 只读 memory 目录s
 * - 异步执行：不阻塞主会话线程
 */
public class MemoryExtractor {

    private static final Logger logger = LoggerFactory.getLogger(MemoryExtractor.class);

    // 依赖注入
    private final ExtractionTrigger trigger;
    private final TokenEstimator tokenEstimator;
    private final LlmClient llmClient;
    private final SubAgentManager subAgentManager;
    private final ConversationService conversationService;
    private MemoryStore memoryStore;
    private final String sessionId;

    // 并发控制
    private final AtomicBoolean extractionInProgress = new AtomicBoolean(false);
    private List<Message> trailingContext; // 暂存提取期间的上下文
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    // 游标追踪：记录上次处理到的最后一条消息 UUID
    private String lastMemoryMessageUuid;

    // 配置开关
    private boolean enabled = true;

    // 记忆目录
    private static final Path MEMORY_DIR = Paths.get(".hippo/memory");

    public MemoryExtractor(String sessionId, TokenEstimator tokenEstimator, LlmClient llmClient) {
        this(sessionId, tokenEstimator, llmClient, new MemoryConfig());
    }

    public MemoryExtractor(String sessionId, TokenEstimator tokenEstimator, LlmClient llmClient, int extractionInterval) {
        this(sessionId, tokenEstimator, llmClient, extractionInterval, new MemoryConfig());
    }

    public MemoryExtractor(String sessionId, TokenEstimator tokenEstimator, LlmClient llmClient, MemoryConfig memoryConfig) {
        this(sessionId, tokenEstimator, llmClient, memoryConfig.getExtractionInterval(), memoryConfig);
    }

    public MemoryExtractor(String sessionId, TokenEstimator tokenEstimator, LlmClient llmClient, int extractionInterval, MemoryConfig memoryConfig) {
        this.sessionId = sessionId;
        this.trigger = new ExtractionTrigger(extractionInterval);
        this.tokenEstimator = tokenEstimator;
        this.llmClient = llmClient;
        this.subAgentManager = ServiceLocator.getOrNull(SubAgentManager.class);
        this.conversationService = ServiceLocator.getOrNull(ConversationService.class);
        
        // 从配置读取启用状态（默认关闭）
        this.enabled = memoryConfig.isExtractionEnabled();
        
        // 初始化 MemoryStore（优先使用 DI 容器中的共享实例）
        try {
            this.memoryStore = ServiceLocator.getOrNull(MemoryStore.class);
            if (this.memoryStore == null) {
                MemoryToolSandbox sandbox = new MemoryToolSandbox(MEMORY_DIR);
                this.memoryStore = new MemoryStore(sandbox);
            }
        } catch (Exception e) {
            logger.warn("初始化 MemoryStore 失败，长期记忆提取功能将受限", e);
            this.memoryStore = null;
        }
        
        // 设置游标推进回调：当主 Agent 直接写记忆时，也推进游标
        this.trigger.setOnCursorAdvanceCallback(() -> {
            logger.debug("主 Agent 已直接写记忆，推进游标");
            // 注意：这里无法获取完整的 conversation，所以只记录日志
            // 实际游标会在下次提取时通过 advanceCursorToEnd 推进
        });
    }

    /**
     * 消息添加回调
     */
    public void onMessageAdded(Message message, List<Message> fullConversation) {
        if (!enabled) {
            return;
        }
        
        if (!trigger.shouldExtract(fullConversation)) {
            return;
        }

        checkAndExtract(fullConversation);
    }

    /**
     * 检查并执行提取
     */
    public void checkAndExtract(List<Message> fullConversation) {
        if (!enabled) {
            return;
        }
        
        if (fullConversation == null || fullConversation.isEmpty()) {
            return;
        }

        // 并发控制：如果正在提取，暂存上下文
        if (!extractionInProgress.compareAndSet(false, true)) {
            trailingContext = fullConversation;
            logger.debug("提取进行中，暂存上下文用于 trailing extraction");
            return;
        }

        EXECUTOR.submit(() -> {
            try {
                performExtraction(fullConversation);
            } finally {
                extractionInProgress.set(false);
                
                // 检查是否有暂存的上下文需要处理
                List<Message> pending = trailingContext;
                if (pending != null && !pending.isEmpty()) {
                    trailingContext = null;
                    logger.info("执行 trailing extraction");
                    checkAndExtract(pending);
                }
            }
        });
    }

    /**
     * 执行提取（SubAgent 模式）
     */
    private void performExtraction(List<Message> fullConversation) {
        if (subAgentManager == null) {
            logger.warn("SubAgentManager 不可用，跳过长期记忆提取");
            return;
        }

        if (memoryStore == null) {
            logger.warn("MemoryStore 不可用，跳过长期记忆提取");
            return;
        }

        // 计算自上次提取以来的新消息数量
        int newMessageCount = countNewMessagesSince(fullConversation);
        
        // 如果没有新消息，跳过提取
        if (newMessageCount == 0) {
            logger.debug("没有新消息，跳过提取");
            advanceCursorToEnd(fullConversation);
            extractionInProgress.set(false);
            return;
        }

        int currentTokens = tokenEstimator.estimate(fullConversation);
        logger.info("开始提取长期记忆（SubAgent模式），新消息: {}, 总 Token: {}", newMessageCount, currentTokens);

        try {
            Conversation parentConversation = conversationService.getConversation(sessionId);
            if (parentConversation == null) {
                logger.warn("找不到会话 {}，跳过提取", sessionId);
                return;
            }
            
            // 扫描现有记忆文件数量
            int memoryCount = countMemoryFiles();
            
            // 获取现有记忆索引
            String existingMemories = getExistingMemoryIndex();
            
            // 构建 Prompt（传递新消息数量）
            String prompt = ExtractionPromptBuilder.buildExtractionPrompt(
                newMessageCount, 
                existingMemories
            );
            
            String taskDescription = String.format(
                "长期记忆提取: 新消息 %d 条, 总 %d tokens, %d 条记忆",
                newMessageCount, currentTokens, memoryCount
            );

            SubAgentTask task = subAgentManager.forkAgent(
                parentConversation,
                taskDescription,
                prompt,
                120,
                null,
                SubAgentPermission.MEMORY_EXTRACTOR,
                () -> onExtractionCompleted(fullConversation),
                builder -> {
                    // 配置 SubAgent
                    builder.maxTurns(5);
                }
            );

            logger.info("✅ 长期记忆提取任务已提交给 SubAgent: taskId={}", task.getTaskId());

            // 异步等待完成
            EXECUTOR.submit(() -> {
                try {
                    task.awaitCompletion(150, java.util.concurrent.TimeUnit.SECONDS);
                } catch (Exception e) {
                    logger.warn("⏱️ 长期记忆提取任务看门狗超时: taskId={}", task.getTaskId());
                } finally {
                    if (extractionInProgress.get()) {
                        extractionInProgress.set(false);
                        logger.warn("🔓 看门狗强制释放长期记忆提取锁");
                    }
                }
            });

        } catch (Exception e) {
            extractionInProgress.set(false);
            logger.error("❌ 提交长期记忆提取任务失败", e);
        }
    }

    /**
     * 获取现有记忆索引（MEMORY.md 内容）
     */
    private String getExistingMemoryIndex() {
        Path memoryIndexPath = MEMORY_DIR.resolve("MEMORY.md");
        if (!Files.exists(memoryIndexPath)) {
            return "";
        }
        
        try {
            String content = Files.readString(memoryIndexPath);
            // 限制索引大小，避免 Prompt 过大
            if (content.length() > 5000) {
                return content.substring(0, 5000) + "\n... [已截断]";
            }
            return content;
        } catch (IOException e) {
            logger.warn("读取 MEMORY.md 失败", e);
            return "";
        }
    }

    /**
     * 统计记忆文件数量
     */
    private int countMemoryFiles() {
        if (!Files.exists(MEMORY_DIR)) {
            return 0;
        }
        
        try (Stream<Path> stream = Files.list(MEMORY_DIR)) {
            return (int) stream
                .filter(Files::isRegularFile)
                .filter(p -> p.toString().endsWith(".md"))
                .filter(p -> !p.toString().equals("MEMORY.md"))
                .count();
        } catch (IOException e) {
            logger.warn("统计记忆文件失败", e);
            return 0;
        }
    }

    /**
     * 计算自上次提取以来的新消息数量
     * 
     * 参考 Claude Code countModelVisibleMessagesSince 函数：
     * - 从游标 UUID 之后开始统计
     * - 只统计 user 和 assistant 类型的消息
     * - 如果游标丢失（上下文压缩），回退到全量统计
     * 
     * @param messages 完整对话历史
     * @return 新消息数量
     */
    private int countNewMessagesSince(List<Message> messages) {
        // 如果游标为空，统计所有消息
        if (lastMemoryMessageUuid == null || lastMemoryMessageUuid.isEmpty()) {
            return countModelVisibleMessages(messages);
        }

        boolean foundStart = false;
        int count = 0;

        for (Message message : messages) {
            // 找到游标位置
            if (!foundStart) {
                if (message.getId() != null && message.getId().equals(lastMemoryMessageUuid)) {
                    foundStart = true;
                }
                continue;
            }

            // 统计游标之后的可见消息
            if (isModelVisibleMessage(message)) {
                count++;
            }
        }

        // 如果游标未找到（被上下文压缩移除），回退到全量统计
        if (!foundStart) {
            logger.debug("游标 UUID 未找到，回退到全量统计");
            return countModelVisibleMessages(messages);
        }

        return count;
    }

    /**
     * 统计所有可见消息（user + assistant）
     */
    private int countModelVisibleMessages(List<Message> messages) {
        int count = 0;
        for (Message message : messages) {
            if (isModelVisibleMessage(message)) {
                count++;
            }
        }
        return count;
    }

    /**
     * 判断消息是否对模型可见（user 和 assistant 类型）
     */
    private boolean isModelVisibleMessage(Message message) {
        return message.isUser() || message.isAssistant();
    }

    /**
     * 推进游标到最后一条消息
     */
    private void advanceCursorToEnd(List<Message> messages) {
        if (messages != null && !messages.isEmpty()) {
            Message lastMessage = messages.get(messages.size() - 1);
            if (lastMessage.getId() != null) {
                lastMemoryMessageUuid = lastMessage.getId();
                logger.debug("游标推进到: {}", lastMemoryMessageUuid);
            }
        }
    }

    /**
     * 提取完成回调
     */
    private void onExtractionCompleted(List<Message> fullConversation) {
        try {
            // 检查是否有写入的记忆文件
            List<String> writtenPaths = extractWrittenPaths(fullConversation);
            
            // 过滤掉 MEMORY.md（索引文件）
            List<String> memoryPaths = new ArrayList<>();
            for (String path : writtenPaths) {
                String fileName = Paths.get(path).getFileName().toString();
                if (!fileName.equals("MEMORY.md")) {
                    memoryPaths.add(path);
                }
            }
            
            // 只有真正写入了记忆文件，才通知主 Agent
            if (!memoryPaths.isEmpty()) {
                logger.info("✅ 长期记忆提取完成，写入 {} 条记忆: {}", memoryPaths.size(), memoryPaths);
                
                // 通知触发器：记忆已写入
                trigger.notifyMemoryWritten("extraction-" + System.currentTimeMillis());
            } else {
                logger.debug("[MemoryExtractor] no memories saved this run");
            }
            
            // 成功完成后推进游标
            advanceCursorToEnd(fullConversation);
            
        } catch (Exception e) {
            logger.error("❌ 长期记忆提取完成回调异常", e);
        } finally {
            extractionInProgress.set(false);
        }
    }

    /**
     * 提取 SubAgent 写入的文件路径
     * 
     * 判断逻辑：
     * - 扫描 SubAgent 的所有消息
     * - 检查是否有 write_file 或 edit_file 工具调用
     * - 如果没有调用这些工具 → 返回空列表
     * 
     * @param fullConversation 完整对话历史
     * @return 写入的文件路径列表
     */
    private List<String> extractWrittenPaths(List<Message> fullConversation) {
        Set<String> paths = new HashSet<>();
        
        if (fullConversation == null) {
            return new ArrayList<>();
        }
        
        for (Message message : fullConversation) {
            // 只检查 Assistant 消息
            if (!message.isAssistant()) {
                continue;
            }
            
            // 检查工具调用
            if (message.getToolCalls() != null) {
                for (var toolCall : message.getToolCalls()) {
                    String filePath = getWrittenFilePath(toolCall);
                    if (filePath != null) {
                        paths.add(filePath);
                    }
                }
            }
        }
        
        return new ArrayList<>(paths);
    }

    /**
     * 从工具调用中提取写入的文件路径
     * 
     * @param toolCall 工具调用
     * @return 文件路径，如果不是写入工具则返回 null
     */
    private String getWrittenFilePath(com.example.agent.llm.model.ToolCall toolCall) {
        if (toolCall == null || toolCall.getFunction() == null) {
            return null;
        }
        
        String toolName = toolCall.getFunction().getName();
        
        // 只检查 write_file 和 edit_file 工具
        if (!"write_file".equals(toolName) && !"edit_file".equals(toolName)) {
            return null;
        }
        
        // 从参数中提取 file_path
        String arguments = toolCall.getFunction().getArguments();
        if (arguments == null || arguments.isEmpty()) {
            return null;
        }
        
        try {
            // 简单解析 JSON 参数
            com.fasterxml.jackson.databind.JsonNode jsonNode = 
                new com.fasterxml.jackson.databind.ObjectMapper().readTree(arguments);
            
            if (jsonNode.has("path")) {
                return jsonNode.get("path").asText();
            } else if (jsonNode.has("file_path")) {
                return jsonNode.get("file_path").asText();
            }
        } catch (Exception e) {
            logger.debug("解析工具参数失败: {}", e.getMessage());
        }
        
        return null;
    }

    /**
     * 通知主 Agent 已直接写记忆
     */
    public void notifyMemoryWritten(String messageUuid) {
        trigger.notifyMemoryWritten(messageUuid);
    }

    /**
     * 获取提取触发器
     */
    public ExtractionTrigger getTrigger() {
        return trigger;
    }

    /**
     * 获取 MemoryStore
     */
    public MemoryStore getMemoryStore() {
        return memoryStore;
    }

    /**
     * 是否正在提取
     */
    public boolean isExtractionInProgress() {
        return extractionInProgress.get();
    }

    /**
     * 设置提取开关
     */
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    /**
     * 获取提取开关状态
     */
    public boolean isEnabled() {
        return enabled;
    }
}
