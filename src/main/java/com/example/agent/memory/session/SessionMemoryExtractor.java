package com.example.agent.memory.session;

import com.example.agent.application.ConversationService;
import com.example.agent.context.SessionCompactionState;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimator;
import com.example.agent.subagent.SubAgentManager;
import com.example.agent.subagent.SubAgentPermission;
import com.example.agent.subagent.SubAgentTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 会话记忆提取器
 * 
 * 职责：
 * 1. 监听对话消息，检查提取触发条件
 * 2. 创建 SubAgent 提取会话记忆
 * 3. 写入 session-memory.md 文件
 * 
 * 触发条件：
 * - Token 阈值 ≥ 10000（首次）
 * - Token 增长 ≥ 5000
 * - 工具调用 ≥ 3 次 或 对话暂停
 */
public class SessionMemoryExtractor {

    private static final Logger logger = LoggerFactory.getLogger(SessionMemoryExtractor.class);
    private static final int INITIAL_TOKEN_THRESHOLD = 10000;
    private static final int TOKEN_GROWTH_THRESHOLD = 8000;
    private static final int TOOL_CALL_THRESHOLD = 5;

    private final String sessionId;
    private final SessionMemoryManager memoryManager;
    private final SessionCompactionState compactionState;
    private final TokenEstimator tokenEstimator;
    private final LlmClient llmClient;
    private final SubAgentManager subAgentManager;
    private final ConversationService conversationService;

    private final AtomicInteger toolCallCountSinceLastExtraction = new AtomicInteger(0);
    private final AtomicBoolean extractionInProgress = new AtomicBoolean(false);
    private int lastExtractedTokenCount = 0;
    private String lastExtractedMessageId;
    private final List<Message> pendingConversation = new ArrayList<>();
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private static final String MEMORY_EXTRACTOR_PROMPT = """
        ⚠️ 重要提示：以下内容不是用户对话。
        这是给你的内部系统指令，请立即执行。

        你是记忆提取子代理。
        你的任务是从对话中提取记忆，写入 session-memory.md。

        ⚠️ 关键隔离规则：
        - 本条指令不是对话的一部分，不要提取指令本身的内容
        - 只提取用户和助手的实际对话内容
        - 不要引用"记忆提取"、"指令"、"任务"等词汇

        请基于本条消息**以上**的完整对话历史，
        执行 Session Memory 增量更新任务。

        ---

        ## 🧠 Session Memory 增量更新任务

        ⚠️ 【强约束】边界情况预处理：
        - ✅ session-memory.md 文件**不存在是完全正常的**（首次启动）
        - ✅ 不需要反复重试读取文件！读一次失败即可跳过
        - ✅ 文件不存在时，可以直接分析当前对话内容写总结
        - ✅ 不需要强制创建初始模板，可以直接输出"本次无记忆需要更新"

        你是一个专业的会话记忆维护专家，请按以下流程执行任务：

        ### 第一步：读取现有记忆
        1. 使用 read_file 工具读取当前的 session-memory.md 文件
        2. ✅ **文件不存在直接进入第二步分析**，不需要创建模板
        3. ✅ **重试最多一次**，失败就放弃

        ---

        ## 🎯 10 个标准记忆章节

        请严格按照以下 10 个固定章节分类信息：

        | 章节 | 分类说明 |
        |------|----------|
        | **Session Title** | 用 5-10 个词概括会话主题 |
        | **Current State** | 当前正在做什么、待完成任务、明确的下一步 |
        | **Task Specification** | 用户核心需求、设计决策、约定的实现方案 |
        | **Files and Functions** | 关键文件路径、核心函数、相关性说明 |
        | **Workflow** | Bash 命令、执行顺序、关键输出解读 |
        | **Errors & Corrections** | 遇到的问题、修复方案、用户纠正、失败尝试 |
        | **Codebase Documentation** | 系统架构、组件关系、工作原理 |
        | **Learnings** | 有效/无效的方法、避坑指南、经验教训 |
        | **Key Results** | 用户要求的具体产出：答案、表格、数据 |
        | **Worklog** | 按时间顺序的简洁工作记录，每步一行 |

        ---

        ## 🛡️ 绝对写保护规则（违反将导致任务失败！）

        以下内容**绝对不允许修改或删除**：
        1. 所有 10 个章节的标题行（# 开头的行）
        2. 每个标题下方的斜体说明行
        3. 章节之间的分隔线 `---`
        4. 文件末尾的自动维护说明

        你只可以：
        ✅ 在标题和说明行**下面**添加或更新内容
        ✅ 压缩已有内容，去重和精简
        ✅ 淘汰过时的信息
        ❌ 绝对不能改动任何标题、说明行、分隔线

        ---

        ### 第三步：增量更新记忆
        - 只保留真正重要的，不要记录临时调试信息
        - 相同/相似的内容合并去重
        - 每条信息归类到对应章节
        - 超过 100 行的章节主动压缩淘汰旧信息

        ---

        ## ✏️ 精准编辑指南

        ### 第四步：使用 edit_file 工具进行增量更新

        ⚠️ **绝对禁止使用 write_file 全量覆写！必须使用 edit_file 进行行级编辑！**

        #### 编辑原则：
        1. **只编辑需要变化的章节** - 不需要修改的章节绝对不要碰
        2. **精确匹配上下文** - 找到该章节说明行下面的内容区
        3. **保留结构不动** - 标题、说明行、分隔线必须原封不动

        #### 标准编辑模式：
        ```markdown
        # Current State
        _当前正在做什么、待完成任务、明确的下一步_
        
        <<< 在这里编辑：只替换这部分内容区域 >>>
        
        ---
        ```

        #### 每个章节独立调用一次 edit_file
        - 需要更新 3 个章节就调用 3 次 edit_file
        - 每次只修改一个章节的内容区
        - 没有变化的章节跳过不处理

        #### ⚠️ old_text 精准匹配规则（违反将导致编辑失败！）
        1. **old_text 必须是文件中的原文，一个字都不能改！** 不能脑补、不能省略、不能改写
        2. **old_text 越短越好！** 只需包含要替换的那几行，不要包含大段上下文
        3. **不要包含分隔线 `---`**，只替换分隔线之间的内容区
        4. **最佳实践**：只选 1-3 行精确原文作为 old_text，替换为新的 1-3 行
        5. **反面教材**：old_text 跨越多个章节、包含分隔线、超过 5 行 → 大概率匹配失败

        #### 如果没有实质性更新：
        ✅ 可以跳过所有编辑，直接输出"本次对话无重要记忆需要更新"即可

        ---

        ⚡ 基于以上对话，立即执行。
        """;

    public SessionMemoryExtractor(String sessionId, TokenEstimator tokenEstimator, LlmClient llmClient) {
        this(sessionId, tokenEstimator, llmClient, new SessionCompactionState(), null);
    }

    public SessionMemoryExtractor(String sessionId, TokenEstimator tokenEstimator, LlmClient llmClient,
                                   SessionCompactionState compactionState) {
        this(sessionId, tokenEstimator, llmClient, compactionState, null);
    }

    public SessionMemoryExtractor(String sessionId, TokenEstimator tokenEstimator, LlmClient llmClient,
                                   SessionCompactionState compactionState, java.nio.file.Path baseDir) {
        this.sessionId = sessionId;
        this.memoryManager = new SessionMemoryManager(sessionId, baseDir);
        this.compactionState = compactionState;
        this.tokenEstimator = tokenEstimator;
        this.llmClient = llmClient;
        this.subAgentManager = ServiceLocator.getOrNull(SubAgentManager.class);
        this.conversationService = ServiceLocator.getOrNull(ConversationService.class);
    }

    /**
     * 消息添加回调
     */
    public void onMessageAdded(Message message, List<Message> fullConversation) {
        if (message.isTool() || message.getRole().equals("tool")) {
            toolCallCountSinceLastExtraction.incrementAndGet();
        }

        checkAndExtract(fullConversation);
    }

    /**
     * 检查并执行提取
     */
    public void checkAndExtract(List<Message> fullConversation) {
        if (fullConversation == null || fullConversation.isEmpty()) {
            return;
        }

        if (!extractionInProgress.compareAndSet(false, true)) {
            return;
        }

        if (!shouldExtract(fullConversation)) {
            extractionInProgress.set(false);
            return;
        }

        EXECUTOR.submit(() -> {
            try {
                performExtraction(fullConversation);
            } finally {
                extractionInProgress.set(false);
            }
        });
    }

    /**
     * 压缩后触发提取
     */
    public void requestExtractionAfterCompaction(List<Message> fullConversation) {
        if (fullConversation == null || fullConversation.isEmpty()) {
            return;
        }

        if (!extractionInProgress.compareAndSet(false, true)) {
            return;
        }

        int currentTokens = tokenEstimator.estimate(fullConversation);
        int tailTokens = currentTokens - lastExtractedTokenCount;
        
        boolean hasEnoughNewContent = tailTokens >= 2000;
        boolean atNaturalPause = !hasToolCallsInLastAssistantTurn(fullConversation);
        boolean hasBeenExtractedBefore = lastExtractedTokenCount > 0;

        if (!hasBeenExtractedBefore || !hasEnoughNewContent || !atNaturalPause) {
            extractionInProgress.set(false);
            logger.debug("压缩后钩子跳过：首次={}, 内容={}, 暂停={}",
                !hasBeenExtractedBefore, hasEnoughNewContent, atNaturalPause);
            return;
        }

        logger.info("✅ 压缩后触发低优先级记忆提取：尾巴 {} tokens", tailTokens);
        EXECUTOR.submit(() -> {
            try {
                performExtraction(fullConversation);
            } finally {
                extractionInProgress.set(false);
            }
        });
    }

    /**
     * 检查是否应该提取
     */
    private boolean shouldExtract(List<Message> fullConversation) {
        int currentTokens = tokenEstimator.estimate(fullConversation);

        boolean hasReachedInitialThreshold = currentTokens >= INITIAL_TOKEN_THRESHOLD;
        if (!hasReachedInitialThreshold) {
            return false;
        }

        boolean isFirstExtraction = lastExtractedTokenCount == 0;
        boolean hasMetTokenGrowth = isFirstExtraction 
            ? true 
            : currentTokens - lastExtractedTokenCount >= TOKEN_GROWTH_THRESHOLD;
            
        boolean hasMetToolCallThreshold = toolCallCountSinceLastExtraction.get() >= TOOL_CALL_THRESHOLD;
        boolean atNaturalPause = !hasToolCallsInLastAssistantTurn(fullConversation);

        return hasMetTokenGrowth
            && (hasMetToolCallThreshold || atNaturalPause);
    }

    /**
     * 执行提取（SubAgent 模式）
     */
    private void performExtraction(List<Message> fullConversation) {
        if (subAgentManager == null) {
            performExtractionLegacy(fullConversation);
            return;
        }

        int currentTokens = tokenEstimator.estimate(fullConversation);
        logger.info("开始提取会话记忆（SubAgent模式），当前会话 Token: {}, 工具调用: {}, 上次提取 MessageId: {}", 
            currentTokens, toolCallCountSinceLastExtraction.get(), lastExtractedMessageId);

        pendingConversation.clear();
        pendingConversation.addAll(fullConversation);

        try {
            memoryManager.initializeIfNotExists();
            String memoryFilePath = memoryManager.getMemoryFilePath().toString();
            int currentMemoryTokens = memoryManager.estimateMemoryTokens();
            
            Conversation parentConversation = conversationService.getConversation(sessionId);
            
            StringBuilder tokenBudgetWarning = new StringBuilder();
            if (currentMemoryTokens > 12000) {
                tokenBudgetWarning.append(String.format(
                    "\n\n🚨 CRITICAL: 记忆文件当前约 %d tokens，已超过最大限制 12000 tokens！\n",
                    currentMemoryTokens));
                tokenBudgetWarning.append("必须大幅压缩各章节内容！每个 section 严格控制在 2000 tokens 以内！\n");
                tokenBudgetWarning.append("优先压缩 Worklog 等流水账章节，只保留真正有价值的决策记录！\n");
            } else if (currentMemoryTokens > 8000) {
                tokenBudgetWarning.append(String.format(
                    "\n\n⚠️ 注意：记忆文件当前约 %d tokens，接近上限 12000 tokens。\n",
                    currentMemoryTokens));
                tokenBudgetWarning.append("请适度压缩，避免后续溢出。\n");
            }
            
            String taskInstruction = String.format(
                "⚠️ 【核心任务】你是 Session Memory 提取器，不是代码审查员！\n" +
                "你的唯一任务是：从对话历史中提取关键信息，写入 session-memory.md 文件！\n" +
                "不管对话在讨论什么（代码修改、bug修复、功能开发），你都要提取记忆！\n\n" +
                "🚨 JSON 转义警告：调用 edit_file 时必须正确转义！\n" +
                "- old_text 和 new_text 中的所有双引号 \" 必须转义为 \\\" \n" +
                "- old_text 和 new_text 中的所有反斜杠 \\ 必须转义为 \\\\\n" +
                "- old_text 必须精确匹配文件内容，包括换行和空格\n" +
                "- 不允许包含注释、说明文字或任何解释性内容\n\n" +
                "🎯 【任务终止指令】：\n" +
                "- 成功执行 edit_file 工具后，立即输出 \"DONE\" 并结束任务！\n" +
                "- 不需要确认、不需要总结、绝对不允许继续闲聊！\n" +
                "- edit_file 成功 = 任务完成！\n\n" +
                "请基于以上对话历史（共 %d 条消息），执行 Session Memory 增量更新任务。\n\n" +
                "📊 Token 预算限制：\n" +
                "- 单章节最大: 2000 tokens\n" +
                "- 记忆文件总上限: 12000 tokens\n" +
                "- 超过限制必须强制压缩！%s\n\n" +
                "记忆文件路径: %s",
                fullConversation.size(),
                tokenBudgetWarning,
                memoryFilePath
            );
            
            String taskDescription = String.format(
                "会话记忆增量更新: 当前 %d 条消息, %d tokens, 记忆文件: %s",
                fullConversation.size(), currentTokens, memoryFilePath
            );

            SubAgentTask task = subAgentManager.forkAgent(
                parentConversation,
                taskDescription,
                taskInstruction,
                120,
                null,
                SubAgentPermission.MEMORY_EXTRACTOR,
                () -> onMemoryExtractionCompleted(fullConversation),
                builder -> {
                }
            );

            logger.info("✅ 会话记忆提取任务已提交给 SubAgent: taskId={}", task.getTaskId());

            EXECUTOR.submit(() -> {
                try {
                    task.awaitCompletion(150, java.util.concurrent.TimeUnit.SECONDS);
                } catch (Exception e) {
                    logger.warn("⏱️ 记忆提取任务看门狗超时，强制释放锁: taskId={}", task.getTaskId());
                } finally {
                    if (extractionInProgress.get()) {
                        extractionInProgress.set(false);
                        logger.warn("🔓 看门狗强制释放记忆提取锁");
                    }
                }
            });

        } catch (Exception e) {
            extractionInProgress.set(false);
            logger.error("❌ 提交记忆提取任务到 SubAgent 失败，回退到传统模式", e);
            performExtractionLegacy(fullConversation);
        }
    }

    /**
     * 提取完成回调
     */
    private void onMemoryExtractionCompleted(List<Message> fullConversation) {
        try {
            toolCallCountSinceLastExtraction.set(0);
            lastExtractedTokenCount = tokenEstimator.estimate(fullConversation);
            updateLastSummarizedMessageIdIfSafe(fullConversation);
            pendingConversation.clear();
            logger.info("✅ Session Memory 提取完成，状态已更新");
        } catch (Exception e) {
            logger.error("❌ 记忆提取完成回调异常", e);
        } finally {
            extractionInProgress.set(false);
        }
    }

    /**
     * 传统模式提取（无 SubAgent 时）
     */
    private void performExtractionLegacy(List<Message> fullConversation) {
        int currentTokens = tokenEstimator.estimate(fullConversation);
        logger.info("开始提取会话记忆（传统兼容模式），当前会话 Token: {}", currentTokens);

        List<Message> extractionMessages = buildExtractionContext(fullConversation);

        try {
            ChatResponse response = llmClient.chat(extractionMessages);
            if (response == null || response.getMessage() == null) {
                logger.warn("LLM 返回空响应，跳过记忆提取");
                return;
            }
            String extractedMemory = response.getMessage().getContent();
            if (extractedMemory == null) {
                logger.warn("LLM 返回空内容，跳过记忆提取");
                return;
            }

            String existingMemory = memoryManager.read();
            String finalMemory = mergeMemories(existingMemory, extractedMemory);

            memoryManager.write(finalMemory);

            toolCallCountSinceLastExtraction.set(0);
            lastExtractedTokenCount = tokenEstimator.estimate(fullConversation);

            updateLastSummarizedMessageIdIfSafe(fullConversation);
            
            logger.info("✅ 会话记忆提取成功，写入: {}", memoryManager.getMemoryFilePath());

        } catch (Exception e) {
            logger.error("❌ 会话记忆提取失败", e);
        } finally {
            extractionInProgress.set(false);
        }
    }

    /**
     * 构建提取上下文
     */
    private List<Message> buildExtractionContext(List<Message> fullConversation) {
        List<Message> result = new ArrayList<>();

        result.add(Message.user(MEMORY_EXTRACTOR_PROMPT));

        String existing = memoryManager.read();
        if (existing != null && !existing.isBlank()) {
            result.add(Message.user("这是当前已有的记忆内容，请基于此进行增量更新：\n\n" + existing));
        }

        int startIndex = findBoundaryIndex(fullConversation);
        logger.debug("记忆提取对话范围: [{} - {}] 条消息", startIndex, fullConversation.size());

        for (int i = startIndex; i < fullConversation.size(); i++) {
            Message msg = fullConversation.get(i);
            if (!msg.isSystem()) {
                result.add(msg);
            }
        }

        return result;
    }

    /**
     * 查找边界索引
     */
    private int findBoundaryIndex(List<Message> messages) {
        if (lastExtractedMessageId == null) {
            return Math.max(0, messages.size() - 100);
        }

        for (int i = 0; i < messages.size(); i++) {
            Message msg = messages.get(i);
            if (lastExtractedMessageId.equals(msg.getId())) {
                return Math.max(0, i - 5);
            }
        }

        return Math.max(0, messages.size() - 100);
    }

    /**
     * 合并记忆
     */
    private String mergeMemories(String existing, String extracted) {
        if (existing == null || existing.isBlank()) {
            return "# Session Memory\n\n" + extracted + "\n\n---\n> Auto-extracted at " + System.currentTimeMillis();
        }

        String cleanExtracted = removeSessionMemoryHeader(extracted);

        int splitPos = existing.lastIndexOf("---\n> Auto-extracted at ");
        if (splitPos > 0) {
            String baseContent = existing.substring(0, splitPos).trim();
            return baseContent + "\n\n---\n\n" + cleanExtracted + "\n\n---\n> Auto-extracted at " + System.currentTimeMillis();
        }

        return existing + "\n\n---\n\n" + cleanExtracted + "\n\n---\n> Auto-extracted at " + System.currentTimeMillis();
    }

    /**
     * 移除 Session Memory 头部
     */
    private String removeSessionMemoryHeader(String extracted) {
        String result = extracted;
        if (result.startsWith("# ")) {
            int firstNewline = result.indexOf("\n");
            if (firstNewline > 0) {
                result = result.substring(firstNewline).trim();
            }
        }
        while (result.startsWith("---\n> Auto-extracted")) {
            int endOfLine = result.indexOf("\n", 20);
            if (endOfLine > 0) {
                result = result.substring(endOfLine).trim();
            } else {
                break;
            }
        }
        return result;
    }

    /**
     * 安全更新最后提取的消息 ID
     */
    private void updateLastSummarizedMessageIdIfSafe(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return;
        }

        if (hasToolCallsInLastAssistantTurn(messages)) {
            return;
        }

        Message lastMsg = messages.get(messages.size() - 1);
        if (lastMsg != null && lastMsg.getId() != null) {
            lastExtractedMessageId = lastMsg.getId();
            compactionState.recordMemoryExtraction(lastExtractedMessageId);
        }
    }

    /**
     * 检查最后一个 Assistant 轮次是否有工具调用
     */
    private boolean hasToolCallsInLastAssistantTurn(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return false;
        }

        for (int i = messages.size() - 1; i >= 0; i--) {
            Message msg = messages.get(i);
            if (msg == null) {
                continue;
            }
            if (msg.isAssistant()) {
                return msg.getToolCalls() != null && !msg.getToolCalls().isEmpty();
            }
            if (msg.isUser()) {
                break;
            }
        }
        return false;
    }

    /**
     * 是否有记忆
     */
    public boolean hasMemory() {
        return memoryManager.hasActualContent();
    }

    /**
     * 获取记忆管理器
     */
    public SessionMemoryManager getMemoryManager() {
        return memoryManager;
    }

    /**
     * 获取最后提取的消息 ID
     */
    public String getLastExtractedMessageId() {
        return lastExtractedMessageId;
    }

    /**
     * 获取提取状态
     */
    public boolean isExtractionInProgress() {
        return extractionInProgress.get();
    }
}
