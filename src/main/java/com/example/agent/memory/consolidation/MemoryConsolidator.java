package com.example.agent.memory.consolidation;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.memory.MemoryStore;
import com.example.agent.memory.MemoryToolSandbox;
import com.example.agent.memory.session.SessionMemoryManager;
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
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 记忆后台整合器
 * 
 * 职责：
 * 1. 监听新会话，注册到 ConsolidationGate
 * 2. 当三重门条件满足时，触发记忆整合
 * 3. 创建 SubAgent 执行四阶段整合流程（Orient → Gather → Consolidate → Prune）
 * 
 * 与 SessionMemoryExtractor 的区别：
 * - SessionMemoryExtractor：会话内的实时提取（session-memory.md）
 * - MemoryConsolidator：跨会话的后台整合（MEMORY.md 索引更新）
 * 
 * 触发时机：三重门条件满足时（时间门 + 会话门 + 锁门）
 */
public class MemoryConsolidator {

    private static final Logger logger = LoggerFactory.getLogger(MemoryConsolidator.class);

    private final ConsolidationGate consolidationGate;
    private final LlmClient llmClient;
    private final SubAgentManager subAgentManager;
    private final ConversationService conversationService;
    private MemoryStore memoryStore;

    private final AtomicBoolean consolidationInProgress = new AtomicBoolean(false);
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "memory-consolidator");
        t.setDaemon(true);
        return t;
    });

    public MemoryConsolidator(LlmClient llmClient) {
        this.llmClient = llmClient;
        
        // 初始化 ConsolidationGate
        Path memoryDir = Paths.get(".hippo/memory");
        try {
            Files.createDirectories(memoryDir);
            this.consolidationGate = new ConsolidationGate(memoryDir);
        } catch (IOException e) {
            logger.error("初始化 ConsolidationGate 失败", e);
            throw new RuntimeException("初始化 ConsolidationGate 失败", e);
        }
        
        this.subAgentManager = ServiceLocator.getOrNull(SubAgentManager.class);
        this.conversationService = ServiceLocator.getOrNull(ConversationService.class);
        
        // 初始化 MemoryStore（优先使用 DI 容器中的共享实例）
        try {
            this.memoryStore = ServiceLocator.getOrNull(MemoryStore.class);
            if (this.memoryStore == null) {
                MemoryToolSandbox sandbox = new MemoryToolSandbox(memoryDir);
                this.memoryStore = new MemoryStore(sandbox);
            }
        } catch (Exception e) {
            logger.warn("初始化 MemoryStore 失败，记忆整合功能将受限", e);
            this.memoryStore = null;
        }
    }

    /**
     * 注册新会话
     * 
     * 在会话创建时调用，用于累积会话数量
     */
    public void registerSession(String sessionId) {
        consolidationGate.registerSession(sessionId);
    }

    /**
     * 检查并触发整合
     * 
     * 在会话结束时调用，检查是否满足整合条件
     */
    public void checkAndConsolidate(String currentSessionId) {
        if (!consolidationGate.shouldConsolidate()) {
            logger.debug("三重门条件不满足，跳过整合");
            return;
        }

        if (!consolidationInProgress.compareAndSet(false, true)) {
            logger.debug("整合正在进行中，跳过");
            return;
        }

        EXECUTOR.submit(() -> {
            try {
                performConsolidation(currentSessionId);
            } finally {
                consolidationInProgress.set(false);
            }
        });
    }

    /**
     * 执行整合（SubAgent 模式）
     */
    private void performConsolidation(String currentSessionId) {
        if (subAgentManager == null) {
            logger.warn("SubAgentManager 不可用，跳过记忆整合");
            consolidationGate.markConsolidationFailed();
            return;
        }

        if (memoryStore == null) {
            logger.warn("MemoryStore 不可用，跳过记忆整合");
            consolidationGate.markConsolidationFailed();
            return;
        }

        logger.info("开始执行记忆整合（SubAgent模式）");

        try {
            // 收集未处理的会话记忆
            List<String> unprocessedSessions = collectUnprocessedSessions(currentSessionId);
            
            // 获取现有记忆索引
            String indexText = memoryStore.getIndexText();

            // 构建整合 Prompt
            String consolidationPrompt = ConsolidationPromptBuilder.buildConsolidationPrompt(
                indexText, unprocessedSessions
            );

            Conversation parentConversation = conversationService.getConversation(currentSessionId);
            
            String taskInstruction = """
                ⚠️ 【核心任务】你是记忆整合专家！
                你的唯一任务是：将单会话的 Session Memory 提炼为跨会话的长期记忆！
                
                🚨 重要规则：
                - 使用 MemoryStore API 进行所有写操作
                - 不要直接修改文件
                - 按照四阶段流程执行：Orient → Gather → Consolidate → Prune
                - 完成所有操作后，输出 "DONE" 并结束任务
                
                请立即开始执行整合任务。
                """;
            
            String taskDescription = String.format(
                "记忆整合: %d 个未处理会话",
                unprocessedSessions.size()
            );

            SubAgentTask task = subAgentManager.forkAgent(
                parentConversation,
                taskDescription,
                taskInstruction + "\n\n" + consolidationPrompt,
                300, // 5 分钟超时
                null,
                SubAgentPermission.MEMORY_CONSOLIDATOR,
                () -> onConsolidationCompleted(),
                builder -> {
                }
            );

            logger.info("✅ 记忆整合任务已提交给 SubAgent: taskId={}", task.getTaskId());

            // 提交看门狗任务
            EXECUTOR.submit(() -> {
                try {
                    task.awaitCompletion(330, java.util.concurrent.TimeUnit.SECONDS);
                } catch (Exception e) {
                    logger.warn("⏱️ 记忆整合任务看门狗超时: taskId={}", task.getTaskId());
                } finally {
                    if (consolidationInProgress.get()) {
                        consolidationInProgress.set(false);
                        consolidationGate.markConsolidationFailed();
                        logger.warn("🔓 看门狗强制释放记忆整合锁");
                    }
                }
            });

        } catch (Exception e) {
            consolidationInProgress.set(false);
            consolidationGate.markConsolidationFailed();
            logger.error("❌ 提交记忆整合任务失败", e);
        }
    }

    /**
     * 收集未处理的会话记忆
     */
    private List<String> collectUnprocessedSessions(String currentSessionId) {
        List<String> sessions = new ArrayList<>();
        
        // 扫描 .hippo/projects/*/sessions/*/memory/session-memory.md
        Path projectsDir = Paths.get(".hippo/projects");
        if (!Files.exists(projectsDir)) {
            return sessions;
        }

        try {
            Files.walk(projectsDir, 5)
                .filter(path -> path.toString().endsWith("session-memory.md"))
                .filter(path -> !path.toString().contains(currentSessionId)) // 排除当前会话
                .forEach(path -> {
                    try {
                        String content = Files.readString(path);
                        if (content != null && !content.isBlank()) {
                            sessions.add(content);
                        }
                    } catch (IOException e) {
                        logger.warn("读取会话记忆失败: {}", path, e);
                    }
                });
            
            // 同时收集 logs/ 目录下的日志文件
            Path logsDir = Paths.get(".hippo/logs");
            if (Files.exists(logsDir)) {
                Files.walk(logsDir, 2)
                    .filter(path -> path.toString().endsWith(".log") || path.toString().endsWith(".md"))
                    .forEach(path -> {
                        try {
                            String content = Files.readString(path);
                            if (content != null && !content.isBlank()) {
                                sessions.add("[日志文件: " + path.getFileName() + "]\n" + content);
                            }
                        } catch (IOException e) {
                            logger.warn("读取日志文件失败: {}", path, e);
                        }
                    });
            }
        } catch (IOException e) {
            logger.error("扫描会话记忆失败", e);
        }

        logger.info("收集到 {} 个未处理的会话记忆", sessions.size());
        return sessions;
    }

    /**
     * 整合完成回调
     */
    private void onConsolidationCompleted() {
        try {
            consolidationGate.markConsolidationComplete();
            logger.info("✅ 记忆整合完成");
        } catch (Exception e) {
            logger.error("❌ 记忆整合完成回调异常", e);
            consolidationGate.markConsolidationFailed();
        } finally {
            consolidationInProgress.set(false);
        }
    }

    /**
     * 获取 ConsolidationGate
     */
    public ConsolidationGate getConsolidationGate() {
        return consolidationGate;
    }

    /**
     * 是否正在整合
     */
    public boolean isConsolidationInProgress() {
        return consolidationInProgress.get();
    }
}
