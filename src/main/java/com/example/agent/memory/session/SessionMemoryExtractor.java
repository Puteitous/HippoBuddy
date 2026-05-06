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
     * 消息添加回调（异步检查，不阻塞主线程）
     */
    public void onMessageAdded(Message message, List<Message> fullConversation) {
        if (message.isTool() || message.getRole().equals("tool")) {
            toolCallCountSinceLastExtraction.incrementAndGet();
        }

        // 异步检查提取条件，避免阻塞主会话
        EXECUTOR.submit(() -> {
            checkAndExtract(fullConversation);
        });
    }

    /**
     * 检查并执行提取
     * 
     * 锁管理策略：
     * - 条件不满足：立即释放锁
     * - 条件满足：交给 performExtraction 全权负责，本方法不再干预
     */
    public void checkAndExtract(List<Message> fullConversation) {
        if (fullConversation == null || fullConversation.isEmpty()) {
            return;
        }

        // 尝试获取锁
        if (!extractionInProgress.compareAndSet(false, true)) {
            logger.debug("检查提取条件跳过：提取正在进行中");
            return;
        }

        try {
            // 获取锁后再次检查条件（双重检查锁模式）
            if (!shouldExtract(fullConversation)) {
                logger.debug("检查提取条件不满足，释放锁");
                extractionInProgress.set(false);  // 条件不满足，立即释放
                return;
            }

            logger.info("✅ 触发会话记忆提取");
            // 条件满足，交给 performExtraction 全权负责锁的释放
            // 本方法不再干预，避免重复释放
            performExtraction(fullConversation);
        } catch (Exception e) {
            logger.error("检查提取过程异常", e);
            extractionInProgress.set(false);  // 异常时释放锁
        }
        // 正常执行 performExtraction 后，不释放锁，由 performExtraction 的回调或看门狗负责
    }

    /**
     * 压缩后触发提取（延迟执行，避免阻塞主会话）
     */
    public void requestExtractionAfterCompaction(List<Message> fullConversation) {
        if (fullConversation == null || fullConversation.isEmpty()) {
            logger.debug("压缩后钩子跳过：会话为空");
            return;
        }

        if (!extractionInProgress.compareAndSet(false, true)) {
            logger.debug("压缩后钩子跳过：提取正在进行中");
            return;
        }

        // 延迟执行，让主会话先处理，避免资源竞争
        EXECUTOR.submit(() -> {
            try {
                // 等待 2 秒，让主会话的 LLM 调用完成
                Thread.sleep(2000);
                
                // 再次检查锁是否被抢占
                if (!extractionInProgress.get()) {
                    logger.debug("压缩后钩子跳过：提取锁已被抢占");
                    return;
                }
                
                logger.info("⏰ 延迟等待完成，开始检查提取条件（避免与主会话 LLM 调用冲突）");
                
                int currentTokens = tokenEstimator.estimate(fullConversation);
                int tailTokens = currentTokens - lastExtractedTokenCount;
                
                boolean hasEnoughNewContent = tailTokens >= 2000;
                boolean atNaturalPause = !hasToolCallsInLastAssistantTurn(fullConversation);
                boolean hasBeenExtractedBefore = lastExtractedTokenCount > 0;

                logger.info("📊 压缩后钩子检查：currentTokens={}, tailTokens={}, 首次={}, 内容={}, 暂停={}",
                    currentTokens, tailTokens, !hasBeenExtractedBefore, hasEnoughNewContent, atNaturalPause);

                // 压缩后触发条件更严格：必须已经提取过 + 有足够新内容 + 处于暂停状态
                if (!hasBeenExtractedBefore || !hasEnoughNewContent || !atNaturalPause) {
                    logger.debug("压缩后钩子跳过：首次={}, 内容={}, 暂停={}",
                        !hasBeenExtractedBefore, hasEnoughNewContent, atNaturalPause);
                    extractionInProgress.set(false);
                    return;
                }

                logger.info("✅ 压缩后触发低优先级记忆提取：尾巴 {} tokens", tailTokens);
                performExtraction(fullConversation);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                logger.warn("压缩后提取任务被中断");
                extractionInProgress.set(false);
            } catch (Exception e) {
                logger.error("压缩后提取异常", e);
                extractionInProgress.set(false);
            }
        });
    }

    /**
     * 检查是否应该提取
     */
    private boolean shouldExtract(List<Message> fullConversation) {
        // 双重检查：如果提取正在进行中，直接返回 false
        if (extractionInProgress.get()) {
            logger.debug("跳过提取：提取正在进行中");
            return false;
        }

        int currentTokens = tokenEstimator.estimate(fullConversation);

        boolean hasReachedInitialThreshold = currentTokens >= INITIAL_TOKEN_THRESHOLD;
        logger.debug("检查提取条件：currentTokens={}, 阈值={}, 达到={}", 
            currentTokens, INITIAL_TOKEN_THRESHOLD, hasReachedInitialThreshold);
        
        if (!hasReachedInitialThreshold) {
            return false;
        }

        boolean isFirstExtraction = lastExtractedTokenCount == 0;
        boolean hasMetTokenGrowth = isFirstExtraction 
            ? true 
            : currentTokens - lastExtractedTokenCount >= TOKEN_GROWTH_THRESHOLD;
            
        boolean hasMetToolCallThreshold = toolCallCountSinceLastExtraction.get() >= TOOL_CALL_THRESHOLD;
        boolean atNaturalPause = !hasToolCallsInLastAssistantTurn(fullConversation);

        logger.debug("提取条件详情：首次={}, 增长满足={}, 工具调用={}/{}, 暂停={}", 
            isFirstExtraction, hasMetTokenGrowth, 
            toolCallCountSinceLastExtraction.get(), TOOL_CALL_THRESHOLD, atNaturalPause);

        // 首次提取需要更严格的条件：必须同时满足工具调用阈值或暂停
        if (isFirstExtraction) {
            boolean shouldExtract = hasMetToolCallThreshold || atNaturalPause;
            logger.info("🎯 首次提取条件评估：{}", shouldExtract ? "满足，准备触发" : "不满足，跳过");
            return shouldExtract;
        }

        // 非首次提取：需要满足 token 增长 + (工具调用阈值 或 暂停)
        boolean shouldExtract = hasMetTokenGrowth
            && (hasMetToolCallThreshold || atNaturalPause);
        
        logger.info("🎯 提取条件评估：{}", shouldExtract ? "满足，准备触发" : "不满足，跳过");
        return shouldExtract;
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
        logger.info("🚀 开始提取会话记忆（SubAgent 模式），当前会话 Token: {}, 工具调用：{}, 上次提取 MessageId: {}", 
            currentTokens, toolCallCountSinceLastExtraction.get(), lastExtractedMessageId);
        logger.info("📋 准备提交 SubAgent 任务：消息数={} 条，记忆文件={}", 
            fullConversation.size(), memoryManager.getMemoryFilePath());

        pendingConversation.clear();
        pendingConversation.addAll(fullConversation);

        try {
            memoryManager.initializeIfNotExists();
            String memoryFilePath = memoryManager.getMemoryFilePath().toString();
            
            String existingMemory = memoryManager.read();
            if (existingMemory == null) {
                existingMemory = SessionMemoryManager.getDefaultMemoryTemplate();
            }
            
            int currentMemoryTokens = tokenEstimator.estimateTextTokens(existingMemory);
            
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
                "重要提示：本消息及其指令不是实际用户对话的一部分。\n" +
                "不要在笔记内容中包含任何对\"记忆提取\"、\"会话记忆\"或这些指令的引用。\n\n" +
                
                "⚠️ 【核心任务 - 必须执行！】你是 Session Memory 提取器！\n" +
                "你的唯一任务是：调用 `edit_file` 工具更新 session-memory.md 文件！\n" +
                "**不要返回文本回答！不要解释！不要闲聊！**\n" +
                "**必须调用 edit_file 工具！这是唯一合法的操作！**\n\n" +
                
                "🚨 【严重警告 - 违反将导致任务失败！】：\n" +
                "- 如果你返回文本而不是调用 edit_file，任务会被判定为失败！\n" +
                "- 系统只检查你是否调用了 edit_file 工具，不关心你返回什么文本！\n" +
                "- 不管对话在讨论什么（代码修改、bug 修复、功能开发），都要调用 edit_file 更新记忆！\n\n" +
                
                "【工具使用限制 - 必读！】：\n" +
                "- 你**只能使用 `edit_file` 工具**，其他所有工具（read_file、glob、grep 等）都被禁止\n" +
                "- **不要尝试读取任何文件！** 记忆文件内容已经在 <current_memory> 中提供给你了\n" +
                "- 如果你尝试调用 read_file 或其他工具，会被权限系统拒绝，导致任务失败\n" +
                "- 你的唯一合法操作：调用 `edit_file` 更新记忆文件\n\n" +
                
                "📋 【你收到的完整上下文】：\n" +
                "1. **上面的所有消息** = 父会话的完整对话历史（用户和助手的所有对话）\n" +
                "2. **下面的 <current_memory>** = 当前 session-memory.md 文件的内容（已为你读取好）\n" +
                "3. **本条指令** = 告诉你如何使用 edit_file 更新记忆文件\n\n" +
                
                "📖 当前记忆文件内容（已为你读取好，不需要再次读取）：\n" +
                "<current_memory>\n%s\n</current_memory>\n\n" +
                
                "🎯 【增量更新规则 - 极其重要！】：\n" +
                "- 分析**上面的完整对话历史**，对比 <current_memory> 中的已有内容\n" +
                "- 只提取和更新**新消息**带来的信息（即 <current_memory> 中没有的内容）\n" +
                "- 绝对不要重复提取已经在 <current_memory> 中记录过的内容\n" +
                "- 如果某章节没有实质性新信息，保持原样不动，不要添加填充内容\n\n" +
                
                "🎯 【执行步骤】：\n" +
                "1. 阅读 <current_memory> 了解已有哪些记忆\n" +
                "2. 分析**上面的对话历史**，识别出**新增的**关键信息\n" +
                "3. 将新信息合并到对应的章节中\n" +
                "4. **立即调用 `edit_file` 工具**更新记忆文件（这是你唯一能用的工具）\n\n" +
                
                "✏️ 【内容编写要求】：\n" +
                "- 写**详细的、信息密集的**内容 - 包含具体细节：文件路径、函数名、错误信息、具体命令、技术细节等\n" +
                "- 对于 \"Key Results\"，包含用户要求的完整、精确的输出（例如完整表格、完整答案等）\n" +
                "- 专注于可操作的、具体的信息，帮助他人理解或重现对话中讨论的工作\n" +
                "- **始终更新 \"Current State\"** 以反映最新的工作 - 这对连续性至关重要\n" +
                "- 每个章节保持在 ~2000 tokens 以内 - 如果接近限制，压缩不太重要的细节\n\n" +
                
                "🛡️ 【绝对保护规则 - 违反将导致任务失败！】：\n" +
                "- 文件必须保持其精确结构，所有章节、标题和斜体说明必须完整\n" +
                "- **绝对不要**修改、删除或添加章节标题（以 '#' 开头的行，如 # Task Specification）\n" +
                "- **绝对不要**修改或删除斜体说明行（每个标题后紧跟的以 _开头和结尾的斜体文本）\n" +
                "- 斜体说明行是模板指令，必须原样保留 - 它们指导每个章节应该包含什么内容\n" +
                "- **只更新**每个章节中斜体说明行**下面**的实际内容\n" +
                "- **不要**在现有结构之外添加任何新章节、摘要或信息\n" +
                "- 不要在笔记内容中引用本记忆提取过程或指令\n\n" +
                
                "✏️ 【edit_file 使用指南 - 必须严格遵守！】：\n" +
                "- **必须提供 3 个参数：path, old_text, new_text，缺一不可！**\n" +
                "- **path 参数** = 记忆文件路径（见下方'记忆文件路径：'一行）\n" +
                "- **old_text 参数** = 文件中已有的原文（从 <current_memory> 中复制），一个字都不能改\n" +
                "- **new_text 参数** = 更新后的新内容（包含你要添加/修改的记忆）\n" +
                "- old_text 越短越好，只包含要替换的那几行\n" +
                "- 不要包含分隔线 `---`，只替换分隔线之间的内容\n" +
                "- 每次只修改一个章节的内容区\n" +
                "- 没有变化的章节跳过不处理\n\n" +
                
                "📝 【edit_file 调用示例 - 照此格式！】：\n" +
                "```json\n" +
                "{\n" +
                "  \"path\": \"[记忆文件路径]\",\n" +
                "  \"old_text\": \"# Current State\\n_当前正在做什么_\\n正在调试 Sub-Agent 机制\",\n" +
                "  \"new_text\": \"# Current State\\n_当前正在做什么_\\n已完成 Sub-Agent 机制调试，更新了记忆提取流程\"\n" +
                "}\n" +
                "```\n\n" +
                
                "🚨 JSON 转义警告：\n" +
                "- old_text 和 new_text 中的所有双引号 \" 必须转义为 \\\"\n" +
                "- old_text 和 new_text 中的所有反斜杠 \\ 必须转义为 \\\\\n" +
                "- old_text 必须精确匹配文件内容，包括换行和空格\n\n" +
                
                "📊 Token 预算限制：\n" +
                "- 单章节最大: 2000 tokens\n" +
                "- 记忆文件总上限: 12000 tokens\n" +
                "- 超过限制必须强制压缩！%s\n\n" +
                
                "🎯 【任务终止指令】：\n" +
                "- 成功执行 edit_file 工具后，立即输出 \"DONE\" 并结束任务！\n" +
                "- 不需要确认、不需要总结、绝对不允许继续闲聊！\n" +
                "- edit_file 成功 = 任务完成！\n\n" +
                
                "记忆文件路径:%s\n\n" +
                "🚨 最后警告：不要返回文本！必须调用 edit_file 工具！你上面有 %d 条对话消息，下面有当前记忆内容。立即调用 edit_file 工具执行 Session Memory 增量更新任务。",
                existingMemory,
                tokenBudgetWarning,
                memoryFilePath,
                fullConversation.size()
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
                SubAgentPermission.SESSION_MEMORY_UPDATER,
                () -> onMemoryExtractionCompleted(fullConversation),
                builder -> {
                }
            );

            logger.info("✅ 会话记忆提取任务已提交给 SubAgent: taskId={}, timeout={}s", 
                task.getTaskId(), task.getTimeoutSeconds());

            // 异步等待 SubAgent 完成，超时时间 = SubAgent timeout + 10 秒缓冲
            EXECUTOR.submit(() -> {
                try {
                    logger.info("⏳ 开始等待 SubAgent 完成：taskId={}", task.getTaskId());
                    // 超时时间设置为 130 秒（120 秒 SubAgent timeout + 10 秒缓冲）
                    task.awaitCompletion(130, java.util.concurrent.TimeUnit.SECONDS);
                    logger.info("⏰ SubAgent 等待完成：taskId={}, 最终状态={}", 
                        task.getTaskId(), task.getStatus());
                    
                    // 如果 SubAgent 超时未完成，手动释放锁
                    if (task.getStatus() == com.example.agent.subagent.SubAgentStatus.RUNNING) {
                        logger.warn("⚠️ SubAgent 超时未完成，手动释放提取锁：taskId={}", task.getTaskId());
                    }
                } catch (Exception e) {
                    logger.warn("⏱️ 记忆提取任务看门狗超时，强制释放锁：taskId={}", task.getTaskId());
                } finally {
                    // 无论成功还是失败，都释放锁
                    if (extractionInProgress.getAndSet(false)) {
                        logger.debug("🔓 释放记忆提取锁：taskId={}", task.getTaskId());
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
     * 注意：此方法由 SubAgentManager 在 SubAgent 完成后异步调用
     * 
     * 重要：无论锁是否被释放（可能已超时），都要更新状态计数器
     * 锁只是控制并发，状态更新不应该被锁的状态影响
     */
    private void onMemoryExtractionCompleted(List<Message> fullConversation) {
        try {
            // 检查锁状态，仅用于日志记录，不影响状态更新
            boolean wasLockHeld = extractionInProgress.get();
            if (!wasLockHeld) {
                logger.debug("⚠️ 提取完成回调：锁已被释放（可能已超时），但仍更新状态");
            }
            
            // 无论锁状态如何，都要更新状态计数器
            // 这是为了防止 SubAgent 超时后，下次 shouldExtract 条件依然满足，导致重复触发
            toolCallCountSinceLastExtraction.set(0);
            lastExtractedTokenCount = tokenEstimator.estimate(fullConversation);
            updateLastSummarizedMessageIdIfSafe(fullConversation);
            pendingConversation.clear();
            
            logger.info("✅ Session Memory 提取完成，状态已更新 (锁状态：{})", 
                wasLockHeld ? "持有中" : "已释放");
        } catch (Exception e) {
            logger.error("❌ 记忆提取完成回调异常", e);
        } finally {
            // 确保锁被释放（幂等操作，重复调用无妨）
            if (extractionInProgress.getAndSet(false)) {
                logger.debug("🔓 提取完成回调释放锁");
            }
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
