package com.example.agent.web.orchestrator;

import com.example.agent.core.AgentMode;
import com.example.agent.application.ConversationService;
import com.example.agent.config.Config;
import com.example.agent.core.blocker.BashDangerousCommandBlocker;
import com.example.agent.core.blocker.HookResult;
import com.example.agent.core.blocker.RequestContext;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.truncation.TruncationService;
import com.example.agent.execute.AgentTurnResult;
import com.example.agent.execute.StopHook;
import com.example.agent.llm.client.AbstractLlmClient;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.client.LlmClientFactory;
import com.example.agent.llm.exception.LlmErrorClassifier;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Usage;
import com.example.agent.llm.model.WebSearchAction;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.tools.BashProcessManager;
import com.example.agent.tools.BashTool;
import com.example.agent.tools.DeleteFileTool;
import com.example.agent.tools.FileChangeTracker;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.session.PendingBashConfirmation;
import com.example.agent.web.session.PendingDeleteConfirmation;
import com.example.agent.web.session.PendingToolCall;
import com.example.agent.web.session.SessionCancelManager;
import com.example.agent.web.session.SessionManager;
import com.example.agent.web.session.SessionTokenStats;
import com.example.agent.web.session.WebSessionManager;
import com.example.agent.web.util.MessageSanitizer;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class WebAgentOrchestrator {

    private static final Logger logger = LoggerFactory.getLogger(WebAgentOrchestrator.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * LLM 前缀缓存命中率告警阈值（百分比）。单次响应命中率低于该值时 WARN 提醒。
     * <p>
     * 前缀缓存（system + tools 逐字节一致）是长会话成本的关键，正常应稳定 90%+，
     * 异常跌落（曾观测 96% → 6.7%）通常是 prompt/tools 动态源复活、切工作区、
     * 重启恢复或 mode 变更导致（详见 .hippo/doc/fix 三不变式文档）。低于阈值只提醒，
     * 不干预请求——新会话首轮（无历史前缀可命中）经 cacheRead==0 过滤，不会误报。
     * </p>
     */
    static final double CACHE_HIT_RATE_WARN_THRESHOLD = 40.0;

    /**
     * 相对突降告警阈值（百分点）。上次为正常命中率（≥ {@link #CACHE_HIT_RATE_WARN_THRESHOLD}）时，
     * 本次较上次下跌超过该值即告警——即使本次仍高于绝对阈值（如 96% → 50%），
     * 大幅下跌同样说明前缀缓存被击穿，不应等到跌破绝对线才暴露。
     */
    static final double CACHE_HIT_RATE_DROP_THRESHOLD_PP = 40.0;

    /** 同会话缓存告警冷却时间（毫秒），防止低命中率期间每轮刷屏 */
    private static final long CACHE_HIT_RATE_WARN_COOLDOWN_MS = 5 * 60_000L;

    /** 各会话最近一次缓存告警时间戳（冷却去抖） */
    private final Map<String, Long> lastCacheWarnAt = new ConcurrentHashMap<>();

    /** 各会话最近一次响应命中率（相对突降判定依据，每次响应后更新） */
    private final Map<String, Double> lastCacheHitRates = new ConcurrentHashMap<>();

    private static final List<StopHook> stopHooks = List.of();

    private static final TruncationService truncationService = new TruncationService(TokenEstimatorFactory.getDefault());
    private static final SessionCancelManager cancelManager = SessionCancelManager.getInstance();

    private static final WebAgentOrchestrator INSTANCE = new WebAgentOrchestrator(WebSessionManager.getInstance());

    private final SessionManager sessionManager;
    private volatile LlmClient llmClient;

    /**
     * 暂存因 bash 确认弹窗而尚未执行的剩余 tool calls。
     * key=sessionId, value=剩余工具列表（当前轮确认点之后的部分）。
     * 生命周期：executeToolCalls 遇到确认时写入 → continueAfterConfirmation 消费后清除。
     * 覆盖语义：后续写入会覆盖前一次残留（execute() 入口也会主动清理防止幽灵队列）。
     */
    private final Map<String, List<ToolCall>> remainingToolCalls = new ConcurrentHashMap<>();

    /**
     * 会话级 Tools 快照（与 system prompt 固化同构）。
     * <p>
     * LLM 服务端前缀缓存要求每次请求的 tools 参数逐字节一致。若每轮重建
     * （toolRegistry.toTools(mode) 每次调用 getDescription()），任何动态描述
     * （日期/工作区路径/技能清单）或工具注册时序（MCP 异步注册）都会导致
     * 前缀缓存整体 miss（曾观测到 cacheHitRate 96% → 6.7%）。
     * </p>
     * <p>
     * 快照在会话首次 execute 时拍下，之后同 mode 复用，不再调用 getDescription()。
     * 失效条件仅两个：新建会话 / mode 变化。切换工作区、跨天、规则/技能变更、
     * MCP 后续注册均不影响已有会话的快照（与"技能变更后新会话生效"同语义）。
     * </p>
     */
    private final Map<String, FrozenToolsEntry> toolsSnapshots = new ConcurrentHashMap<>();

    private final ToolRegistry toolRegistry;

    /**
     * 会话级 Tools 快照条目。
     * @param mode 拍快照时的 AgentMode（快照键的一部分，mode 变化即失效重建）
     * @param tools 冻结的 Tool 列表（immutable 语义，调用方不得修改）
     */
    private record FrozenToolsEntry(AgentMode mode, List<Tool> tools) {}

    public static WebAgentOrchestrator getInstance() {
        return INSTANCE;
    }

    public WebAgentOrchestrator(SessionManager sessionManager) {
        this.sessionManager = sessionManager;
        this.llmClient = ServiceLocator.get(LlmClient.class);
        this.toolRegistry = ServiceLocator.get(ToolRegistry.class);
    }

    /**
     * 刷新 LLM 客户端实例。当用户切换 Provider 时调用，
     * 重新创建 LlmClient 并更新 DI 容器和本实例的引用。
     * <p>
     * 同 Provider 内换 model 不需要调用此方法，
     * AbstractLlmClient.getModel() 每次请求都动态读取 Config。
     * </p>
     */
    public void refreshClient() {
        LlmClient newClient = LlmClientFactory.create();
        ServiceLocator.registerSingleton(LlmClient.class, newClient);
        this.llmClient = newClient;
        logger.info("LLM 客户端已刷新: provider={}, model={}",
            newClient.getProviderName(), newClient.getModel());
    }

    /**
     * 获取会话级 Tools 快照（无则创建）。
     * <p>
     * 快照语义与 system prompt 固化一致：会话创建后 tools 参数不再变化，
     * 只有新建会话或 mode 变化才重建。这保证 LLM 服务端前缀缓存稳定命中。
     * </p>
     * <p>
     * 注意：快照不持久化，重启后首次 execute 重建。由于工具描述被契约测试
     * （ToolDescriptionStabilityTest）强制为进程内静态，重建结果与历史逐字节一致。
     * 唯一边界：若 MCP 工具在快照时尚未注册，该会话将不含 MCP 工具（直到 mode 变化
     * 或新会话），与"技能变更后新会话生效"同语义。
     * </p>
     *
     * @param sessionId 会话 ID
     * @param mode      当前解析出的 AgentMode（快照键的一部分）
     * @return 冻结的 Tool 列表（调用方不得修改）
     */
    List<Tool> getOrCreateToolsSnapshot(String sessionId, AgentMode mode) {
        FrozenToolsEntry existing = toolsSnapshots.get(sessionId);
        if (existing != null && existing.mode() == mode) {
            return existing.tools();
        }
        // 新建快照：mode 变化或该会话首次 execute
        List<Tool> tools = toolRegistry.toTools(mode);
        FrozenToolsEntry entry = new FrozenToolsEntry(mode, List.copyOf(tools));
        toolsSnapshots.put(sessionId, entry);
        logger.info("会话 Tools 快照已固化: sessionId={}, mode={}, toolCount={}（后续同 mode 请求复用，不再重建）",
            sessionId, mode.getDisplayName(), tools.size());
        return entry.tools();
    }

    private ConversationService getConversationService() {
        // 每次调用都从 ServiceLocator 动态获取，而非在构造函数中缓存字段。
        // 原因：DashboardServer 启动时，WebInitializer.ensureMemoryInitialized()
        // 会在 handler 构造之后注册 ConversationService 实例。如果构造函数中缓存，
        // 拿到的是自动创建的临时实例，其 componentRegistry 永远为空，
        // 导致 addAssistantMessage() 等方法的 transcript 写入被静默跳过。
        // 历史教训：.hippo/snapshots/lessons-2026-05-13-di-constructor-capture.md
        return ServiceLocator.get(ConversationService.class);
    }

    public void execute(String sessionId, Conversation conversation, SseWriter sseWriter) throws LlmException {
        // 每轮新 Agent 循环开始时，清理上一轮因确认弹窗残留的剩余工具队列
        remainingToolCalls.remove(sessionId);

        // 从 session 读取模式，默认 CODING
        AgentMode mode = resolveMode(sessionManager.getMode(sessionId));

        // 会话级 Tools 快照：首次 execute 时拍下，同 mode 复用（不再调用 getDescription()），
        // 切换工作区/跨天/MCP 后续注册均不影响已有会话；mode 变化或新建会话才重建。
        List<Tool> tools = getOrCreateToolsSnapshot(sessionId, mode);

        // 自动执行轮数上限，可配置（context.max_agent_turns）。0 表示不限制。
        int maxAgentTurns = Config.getInstance().getContext().getMaxAgentTurns();
        boolean unlimitedAgentTurns = maxAgentTurns <= 0;

        for (int turn = 0; unlimitedAgentTurns || turn < maxAgentTurns; turn++) {
            if (cancelManager.isCancelled(sessionId)) {
                logger.info("收到取消信号，提前结束 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                return;
            }

            // 防御：如果已有挂起的确认弹窗，不进入新一轮 LLM 调用
            if (sessionManager.hasPendingBashConfirmation(sessionId) || sessionManager.hasPendingDeleteConfirmation(sessionId)) {
                if (sessionManager.hasPendingBashConfirmation(sessionId)) {
                    logger.info("检测到挂起的 bash 确认，暂停当前 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                } else {
                    logger.info("检测到挂起的 delete_file 确认，暂停当前 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                }
                return;
            }

            List<Message> messages = new ArrayList<>(getConversationService().getContextForInference(conversation));

            messages = ensureSystemMessageFirst(messages);

            StringBuilder contentBuilder = new StringBuilder();
            StringBuilder reasoningBuilder = new StringBuilder();
            boolean[] reasoningPhase = {true};
            List<Map<String, Object>> streamToolCalls = new ArrayList<>();
            boolean[] hasAskUser = {false};
            boolean[] webSearched = {false};
            // 流式 output_item.done 事件收集的联网搜索动作明细（唯一携带 action 的流式事件）
            List<WebSearchAction>[] streamWebSearchActions = new List[]{new ArrayList<>()};

            MessageSanitizer.removeOrphanToolCalls(messages);

            sseWriter.sendSseEvent("thinking", "{\"turn\":" + (turn + 1) + "}");

            if (cancelManager.isCancelled(sessionId)) {
                logger.info("收到取消信号，提前结束 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                return;
            }

            final int currentTurn = turn + 1;

            // 设置流式取消检查器，让 LLM 流式读取线程能感知外部取消信号
            // 通过 SessionCancelManager（共享状态），而非 ThreadLocal 的 aborted 标志
            if (llmClient instanceof AbstractLlmClient) {
                ((AbstractLlmClient) llmClient).setCancelCheck(() -> cancelManager.isCancelled(sessionId));
            }

            ChatResponse response = llmClient.chatStream(messages, tools, (StreamChunk chunk) -> {
                if (cancelManager.isCancelled(sessionId)) {
                    logger.debug("流式回调感知取消信号, 中止 LLM 请求: sessionId={}", sessionId);
                    llmClient.abortCurrentRequest();
                    return;
                }

                if (hasAskUser[0]) {
                    return;
                }

                if (chunk.getReasoning() != null && !chunk.getReasoning().isEmpty()) {
                    if (reasoningPhase[0] && reasoningBuilder.length() == 0) {
                        logger.debug("接收思考过程: sessionId={}, turn={}", sessionId, currentTurn);
                    }
                    reasoningBuilder.append(chunk.getReasoning());
                    sseWriter.sendSseEvent("reasoning", "{\"reasoning\":\"" + SseWriter.escapeJson(chunk.getReasoning()) + "\"}");
                }

                if (chunk.getContent() != null && !chunk.getContent().isEmpty()) {
                    if (reasoningPhase[0]) {
                        reasoningPhase[0] = false;
                        if (reasoningBuilder.length() > 0) {
                            logger.debug("思考过程结束, 共 {} 字符: sessionId={}, turn={}",
                                reasoningBuilder.length(), sessionId, currentTurn);
                            sseWriter.sendSseEvent("reasoning_done", "{}");
                        } else {
                            logger.debug("模型未输出思考过程, 直接输出内容: sessionId={}, turn={}",
                                sessionId, currentTurn);
                        }
                    }
                    contentBuilder.append(chunk.getContent());
                    sseWriter.sendSseEvent("content", "{\"content\":\"" + SseWriter.escapeJson(chunk.getContent()) + "\"}");
                }

                if (chunk.isToolCall() && chunk.getToolCallDeltas() != null) {
                    for (var delta : chunk.getToolCallDeltas()) {
                        String toolCallId = delta.getId();
                        // 续 delta（无 id）只包含更多参数内容，已在 AbstractLlmClient
                        // 通过 mergeToolCallDeltas 合并，无需重复处理 SSE 事件
                        if (toolCallId == null) continue;

                        String toolName = delta.getFunction().getName();
                        String arguments = delta.getFunction().getArguments();

                        boolean alreadySent = streamToolCalls.stream()
                            .anyMatch(tc -> toolCallId.equals(tc.get("id")));

                        if (!alreadySent) {
                            if (reasoningPhase[0]) {
                                reasoningPhase[0] = false;
                                if (reasoningBuilder.length() > 0) {
                                    sseWriter.sendSseEvent("reasoning_done", "{}");
                                }
                            }

                            if ("ask_user".equals(toolName)) {
                                hasAskUser[0] = true;
                            } else {
                                Map<String, Object> toolCall = new HashMap<>();
                                toolCall.put("id", toolCallId);
                                toolCall.put("name", toolName);
                                toolCall.put("args", arguments);
                                streamToolCalls.add(toolCall);

                                String toolStartData = buildStartJson(toolCallId, toolName, arguments);
                                sseWriter.sendSseEvent("tool_start", toolStartData);
                            }
                        }
                    }
                }

                // 实时推送 Token usage：
                // - Anthropic 协议：message_start 推送 input_tokens 真实值，message_delta 持续推送 output_tokens 累计值
                // - Responses API：response.completed / incomplete 终态推送完整 usage（回合结束立即校准）
                // - Chat Completions 兼容：最后一个 chunk 推送完整 usage
                if (chunk.hasUsage()) {
                    pushTokenUpdate(sseWriter, chunk.getUsage());
                }

                // 服务端联网搜索（Responses API web_search 内置工具）：转发状态标记 + 动作详情。
                // 前端展示「正在联网搜索…」→「已联网搜索」（含完成态聚合摘要），不模拟 tool_start/tool_result 卡片。
                // 注意：in_progress/searching/completed 事件不含 action，仅 output_item.done 携带，
                // 因此 started 事件 payload 恒为空，done 事件在 output_item.done 到达时携带 action。
                if (chunk.isWebSearchStarted()) {
                    webSearched[0] = true;
                    sseWriter.sendSseEvent("web_search_start", buildWebSearchPayload(null));
                }
                if (chunk.isWebSearchDone()) {
                    webSearched[0] = true;
                    WebSearchAction action = chunk.getWebSearchAction();
                    if (action != null) {
                        streamWebSearchActions[0].add(action);
                    }
                    sseWriter.sendSseEvent("web_search_done", buildWebSearchPayload(action));
                }
            });

            if (cancelManager.isCancelled(sessionId)) {
                logger.info("收到取消信号，跳过工具执行 (sessionId={}, turn={})", sessionId, turn + 1);
                return;
            }

            Message assistantMessage = response.getFirstMessage();
            if (assistantMessage == null) {
                sseWriter.sendSseEvent("error", buildErrorPayload(
                    LlmErrorClassifier.CODE_EMPTY_RESPONSE, "未收到有效响应", null));
                return;
            }

            if (contentBuilder.length() > 0 && (assistantMessage.getContent() == null || assistantMessage.getContent().isBlank())) {
                assistantMessage.setContent(contentBuilder.toString());
            }

            String finalContent = assistantMessage.getContent();
            boolean hasContent = finalContent != null && !finalContent.isBlank();
            boolean hasToolCalls = assistantMessage.getToolCalls() != null && !assistantMessage.getToolCalls().isEmpty();
            String finishReason = (response.getChoices() != null && !response.getChoices().isEmpty())
                ? response.getChoices().get(0).getFinishReason() : "unknown";

            if (!hasContent && !hasToolCalls) {
                logger.warn("LLM 返回空内容：sessionId={}, turn={}, finishReason={}, contentChunks={}, model={}",
                    sessionId, turn + 1, finishReason, contentBuilder.length(), response.getModel());

                if (reasoningPhase[0] && reasoningBuilder.length() > 0) {
                    reasoningPhase[0] = false;
                    sseWriter.sendSseEvent("reasoning_done", "{}");
                }

                String errorCode;
                String errorMessage;
                switch (finishReason) {
                    case "length" -> {
                        errorCode = LlmErrorClassifier.CODE_RESPONSE_LENGTH_EXCEEDED;
                        errorMessage = "响应长度达到限制，请减少上下文或增加 max_tokens";
                    }
                    case "content_filter" -> {
                        errorCode = LlmErrorClassifier.CODE_CONTENT_FILTERED;
                        errorMessage = "内容被安全过滤器阻止";
                    }
                    default -> {
                        errorCode = LlmErrorClassifier.CODE_EMPTY_RESPONSE;
                        errorMessage = "LLM 未返回有效内容，请重试";
                    }
                }
                sseWriter.sendSseEvent("error", buildErrorPayload(errorCode, errorMessage, null));
                return;
            } else {
                logger.info("LLM 响应正常：sessionId={}, turn={}, contentLength={}, hasToolCalls={}, finishReason={}",
                    sessionId, turn + 1, hasContent ? finalContent.length() : 0, hasToolCalls, finishReason);
            }

            if (response.getUsage() != null) {
                Usage usage = response.getUsage();
                SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                stats.addLlmCall(
                    usage.getPromptTokens(),
                    usage.getCompletionTokens(),
                    usage.getTotalTokens(),
                    usage.getCacheReadInputTokens(),
                    usage.getPromptCacheMissTokens()
                );
                warnIfCacheHitRateLow(sessionId, usage, turn + 1);
            }

            // 流式路径：web_search 状态经 StreamChunk 传递；非流式路径：parseResponsesBody 已置标记。
            // 此处统一合并，确保落库的 assistant 消息携带 web_searched 标记（随 JSONL 持久化）。
            if (webSearched[0] || assistantMessage.isWebSearched()) {
                assistantMessage.setWebSearched(true);
            }
            // 合并流式（output_item.done 收集）与非流式（parseResponsesBody 收集）的联网搜索动作明细，
            // 去重后随消息落库，刷新后前端据此恢复聚合摘要。
            List<WebSearchAction> mergedActions = mergeWebSearchActions(
                streamWebSearchActions[0], assistantMessage.getWebSearchActions());
            if (mergedActions != null && !mergedActions.isEmpty()) {
                assistantMessage.setWebSearchActions(mergedActions);
            }

            getConversationService().addAssistantMessage(conversation, assistantMessage, response.getUsage());

            List<ToolCall> toolCalls = assistantMessage.getToolCalls();
            if (toolCalls == null || toolCalls.isEmpty()) {
                if (reasoningPhase[0]) {
                    reasoningPhase[0] = false;
                    if (reasoningBuilder.length() > 0) {
                        sseWriter.sendSseEvent("reasoning_done", "{}");
                    }
                }
                // 防御：有内容但 finishReason=length —— 模型可能未完整输出结论就被截断
                // （"工具调用后静默终止"问题族：工具跑完但总结被截断/结论缺失）
                if ("length".equals(finishReason)) {
                    logger.warn("[AgentLoop] 正常完成但响应被截断(finishReason=length): sessionId={}, turn={}, contentChars={}, reasoningChars={}",
                        sessionId, turn + 1, contentBuilder.length(), reasoningBuilder.length());
                    sseWriter.sendSseEvent("done", "{\"reason\":\"length\"}");
                } else {
                    // 诊断：正常完成（模型给出最终回复、不再调用工具）
                    logger.info("[AgentLoop] 正常完成: sessionId={}, turn={}, contentChars={}, reasoningChars={}, finishReason={}",
                        sessionId, turn + 1, contentBuilder.length(), reasoningBuilder.length(), finishReason);
                    sseWriter.sendSseEvent("done", "{}");
                }
                return;
            }

            boolean allToolsCompleted = executeToolCalls(toolCalls, conversation, sseWriter, sessionId, mode);

            // 诊断：工具执行完成后的状态（allToolsCompleted=false 表示有确认弹窗/用户中断/ask_user 挂起）
            logger.info("[AgentLoop] 工具执行完毕: sessionId={}, turn={}, toolCount={}, allCompleted={}, hasContent={}, contentChars={}",
                sessionId, turn + 1, toolCalls.size(), allToolsCompleted, hasContent, contentBuilder.length());

            toolRegistry.getBlockerChain().onTurnComplete();

            List<Message> history = getConversationService().getHistory(conversation);
            StopHook.StopHookContext hookCtx = new StopHook.StopHookContext(
                conversation, history, turn + 1, AgentTurnResult.DONE
            );
            for (StopHook hook : stopHooks) {
                StopHook.StopHookResult hookResult = hook.evaluate(hookCtx);
                if (hookResult.isShouldStop()) {
                    logger.warn("[AgentLoop] StopHook 触发强制终止: sessionId={}, turn={}, reason={}",
                        sessionId, turn + 1, hookResult.getReason());
                    sseWriter.sendSseEvent("done", "{\"reason\":\"stop_hook\"}");
                    return;
                } else if (hookResult.isWarning()) {
                    logger.warn("[AgentLoop] StopHook 发送停滞警告: sessionId={}, turn={}, reason={}",
                        sessionId, turn + 1, hookResult.getReason());
                    sseWriter.sendSseEvent("warning", "{\"message\":\"" + SseWriter.escapeJson(hookResult.getReason()) + "\"}");
                }
            }

            if (cancelManager.isCancelled(sessionId)) {
                logger.info("收到取消信号，停止下一轮 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                return;
            }

            if (sessionManager.hasPendingToolCall(sessionId)) {
                return;
            }

            if (sessionManager.hasPendingBashConfirmation(sessionId) || sessionManager.hasPendingDeleteConfirmation(sessionId)) {
                return;
            }

            // 未达到轮数上限（或无限制）时，发送 continue 让前端进入下一轮
            if (unlimitedAgentTurns || turn < maxAgentTurns - 1) {
                sseWriter.sendSseEvent("continue", "{\"reason\":\"tool_complete\",\"nextTurn\":" + (turn + 2) + "}");
            }
        }

        // 诊断：循环耗尽（达到轮数上限），工具调用可能未完成
        logger.warn("[AgentLoop] 达到最大轮数被截断: sessionId={}, maxAgentTurns={}", sessionId, maxAgentTurns);
        sseWriter.sendSseEvent("done", "{\"reason\":\"max_turns\"}");
    }

    /**
     * 构建并推送 token_update SSE 事件（实时 Token 统计快照）。
     * <p>
     * 与 {@code /api/sessions/{id}/tokens} 接口返回结构保持一致，但标注 live=true，
     * 前端据此识别为流式实时推送，直接渲染而不污染趋势图历史记录。
     * </p>
     */
    /**
     * 判断单次 LLM 响应的缓存命中率是否触发告警（纯函数，便于单测）。
     * <p>
     * 过滤规则：usage 为空或 cacheRead==0（新会话首轮、无历史前缀可命中）不告警，
     * 避免首轮请求误报。
     * </p>
     * <p>
     * 双路判定（任一触发即告警）：
     * <ul>
     *   <li><b>绝对低值</b>：命中率严格低于 {@code thresholdPercent}</li>
     *   <li><b>相对突降</b>：上次为正常命中率（≥ 阈值）时，本次较上次下跌 ≥ {@code dropThresholdPp} 个百分点</li>
     * </ul>
     * 突降判定要求"上次正常"，避免已在低位持续告警时重复报警；首次响应（无上次记录，
     * {@code lastRatePercent <= 0}）只走绝对判定。
     * </p>
     *
     * @param usage            单次响应的 Usage（可空）
     * @param thresholdPercent 绝对低值告警阈值（百分比，0-100）
     * @param lastRatePercent  该会话上一次响应的命中率（0 表示无历史记录）
     * @param dropThresholdPp  相对突降告警阈值（百分点）
     * @return true 表示命中率异常，应 WARN
     */
    static boolean shouldWarnOnCacheHitRate(Usage usage, double thresholdPercent,
                                            double lastRatePercent, double dropThresholdPp) {
        if (usage == null) return false;
        if (usage.getCacheReadInputTokens() <= 0) return false;
        double rate = usage.getCacheHitRate();
        if (rate < thresholdPercent) {
            return true;
        }
        // 相对突降：仅当上次命中率正常（≥ 阈值）时才判定，避免低位持续告警时重复报警。
        // 用 epsilon 容忍浮点误差：命中率由 (hit/prompt*100) 计算，除法会产生 0.000000000000005
        // 级误差，导致恰好在阈值线上的值（如 96% → 56%，恰跌 40pp）被误判为未达线。
        return lastRatePercent >= thresholdPercent
            && (lastRatePercent - rate) >= dropThresholdPp - 1e-9;
    }

    /**
     * 缓存命中率异常时 WARN 提醒（带同会话冷却去抖，避免低值期间每轮刷屏）。
     * 每次响应都会更新该会话的历史命中率（相对突降判定依据）；冷却期内不重复
     * 告警，冷却期后若仍异常会再次提醒。
     */
    private void warnIfCacheHitRateLow(String sessionId, Usage usage, int turn) {
        if (usage == null || usage.getCacheReadInputTokens() <= 0) {
            return;
        }
        double rate = usage.getCacheHitRate();
        Double last = lastCacheHitRates.get(sessionId);
        double lastRate = last != null ? last : 0.0;
        // 先更新历史命中率，保证每次响应都记录（无论是否告警）
        lastCacheHitRates.put(sessionId, rate);

        if (!shouldWarnOnCacheHitRate(usage, CACHE_HIT_RATE_WARN_THRESHOLD,
                lastRate, CACHE_HIT_RATE_DROP_THRESHOLD_PP)) {
            return;
        }
        long now = System.currentTimeMillis();
        Long lastWarn = lastCacheWarnAt.get(sessionId);
        if (lastWarn != null && now - lastWarn < CACHE_HIT_RATE_WARN_COOLDOWN_MS) {
            return;
        }
        lastCacheWarnAt.put(sessionId, now);

        String reason = rate < CACHE_HIT_RATE_WARN_THRESHOLD
            ? String.format("低于绝对阈值 %.0f%%", CACHE_HIT_RATE_WARN_THRESHOLD)
            : String.format("较上次 %.1f%% 突降 %.1fpp", lastRate, lastRate - rate);
        logger.warn("⚠️ LLM 前缀缓存命中率异常: sessionId={}, turn={}, cacheHitRate={}%, "
                + "cacheHit={}, cacheMiss={}, prompt={}（判定: {}；正常长会话应稳定 90%+。"
                + "异常跌落通常是 prompt/tools 动态变化、切换工作区、重启恢复或 mode 变更，"
                + "请排查，详见 .hippo/doc/fix 三不变式文档）",
            sessionId, turn, String.format("%.1f", rate),
            usage.getCacheReadInputTokens(), usage.getPromptCacheMissTokens(), usage.getPromptTokens(),
            reason);
    }

    private void pushTokenUpdate(SseWriter sseWriter, Usage usage) {
        try {
            if (usage == null) return;
            int prompt = usage.getPromptTokens();
            int completion = usage.getCompletionTokens();
            int total = usage.getTotalTokens() > 0 ? usage.getTotalTokens() : (prompt + completion);
            // 防御：无有效 token 计数的帧（如 Chat Completions 中间 chunk 的空 usage `{}`）不推送给前端，
            // 否则前端会把累计值覆盖为 0（"数字闪现后归零"）。
            if (total <= 0) {
                return;
            }
            ObjectNode node = objectMapper.createObjectNode();
            node.put("live", true);
            node.put("hasKnownUsage", true);
            node.put("promptTokens", prompt);
            node.put("completionTokens", completion);
            node.put("totalTokens", total);
            node.put("cacheHitTokens", usage.getCacheReadInputTokens());
            node.put("cacheHitRate", Math.round(usage.getCacheHitRate() * 10.0) / 10.0);
            sseWriter.sendSseEvent("token_update", node.toString());
        } catch (Exception e) {
            logger.debug("推送 token_update 失败: {}", e.getMessage());
        }
    }

    private boolean executeToolCalls(List<ToolCall> toolCalls, Conversation conversation, SseWriter sseWriter, String sessionId, AgentMode mode) {
        for (int i = 0; i < toolCalls.size(); i++) {
            ToolCall toolCall = toolCalls.get(i);
            if (cancelManager.isCancelled(sessionId)) {
                logger.info("收到取消信号，跳过工具执行 (sessionId={})", sessionId);
                return false;
            }

            String toolName = toolCall.getFunction().getName();
            String arguments = toolCall.getFunction().getArguments();

            // 模式权限检查：当前模式不允许的工具直接拒绝
            if (mode != null && !mode.isToolAllowed(toolName)) {
                String msg = String.format("[%s] 模式下不允许使用工具 '%s'",
                    mode.getDisplayName(), toolName);
                logger.warn("模式权限拦截: sessionId={}, tool={}, mode={}", sessionId, toolName, mode);
                getConversationService().addToolResult(conversation, toolCall.getId(), toolName, "错误: " + msg, false);
                sseWriter.sendSseEvent("tool_result",
                    buildToolResultJson(toolCall.getId(), toolName, false, null, msg, arguments, toolCall.getId()));
                continue;
            }

            if (!"ask_user".equals(toolName)) {
                logger.debug("executeToolCalls 发送 tool_start: toolCallId={}, toolName={} (sessionId={})",
                    toolCall.getId(), toolName, sessionId);
                sseWriter.sendSseEvent("tool_start", buildStartJson(toolCall.getId(), toolName, arguments));
            }

            try (var _session = FileChangeTracker.withContext(sessionId, null)) {
                RequestContext.set(RequestContext.ContextType.WEB);

                // 对 bash 工具做预检查：三级安全模型
                if ("bash".equals(toolName)) {
                    JsonNode args = objectMapper.readTree(arguments);
                    String command = args.has("command") ? args.get("command").asText() : "";

                    if (!command.isEmpty()) {
                        HookResult hookResult = toolRegistry.getBlockerChain().check(toolName, args);

                        if (hookResult.isDenied()) {
                            String errorMsg = hookResult.getReason();
                            getConversationService().addToolResult(conversation, toolCall.getId(), toolName, "错误: " + errorMsg, false);
                            sseWriter.sendSseEvent("tool_result",
                                buildToolResultJson(toolCall.getId(), toolName, false, null, errorMsg, arguments, toolCall.getId()));
                            continue;
                        }

                        if (hookResult.isConfirmationRequired()) {
                            // 是否弹确认卡片完全由 bash 的"需要确认"开关决定；权限范围（仅工作区/全目录）不影响确认。
                            // 严格禁止（denied）的命令不受影响，无论什么范围仍会被拦截。
                            boolean skipConfirm = !Config.getInstance().getTools().getBash().isRequireConfirmation();
                            if (skipConfirm) {
                                logger.warn("bash 确认已跳过（require_confirmation=false），" +
                                        "需确认命令直接执行: sessionId={}, command={}, riskLevel={}",
                                    sessionId, command, hookResult.getRiskLevel());
                                // 放行，走到下方的流式执行逻辑
                            } else {
                                String confirmId = java.util.UUID.randomUUID().toString();

                                PendingBashConfirmation pending = new PendingBashConfirmation(
                                    confirmId, toolCall.getId(), toolName,
                                    command, arguments, hookResult.getRiskLevel(), hookResult.getReason()
                                );
                                sessionManager.setPendingBashConfirmation(sessionId, pending);

                                String confirmJson = buildBashConfirmJson(confirmId, command,
                                    hookResult.getRiskLevel(), hookResult.getReason());
                                sseWriter.sendSseEvent("tool_confirmation", confirmJson);
                                logger.info("发送 tool_confirmation 事件: confirmId={}, command={}, riskLevel={}",
                                    confirmId, command, hookResult.getRiskLevel());
                                // 保存当前轮中尚未执行的剩余工具，确认弹窗关闭后继续执行
                                // LLM 一次返回的多个 tool call 是并行语义，工具间无依赖，确认/拒绝一个不影响其他
                                if (i < toolCalls.size() - 1) {
                                    List<ToolCall> remaining = toolCalls.subList(i + 1, toolCalls.size());
                                    String remainingIds = remaining.stream()
                                        .map(tc -> tc.getId() + "(" + tc.getFunction().getName() + ")")
                                        .collect(java.util.stream.Collectors.joining(", "));
                                    remainingToolCalls.put(sessionId, remaining);
                                    logger.info("暂存剩余工具调用: sessionId={}, 数量={}, 列表=[{}]",
                                        sessionId, remaining.size(), remainingIds);
                                }
                                return false;
                            }
                        }
                    }

                    // 放行：继续执行，blockerChain 在 toolRegistry.execute() 内部会再次检查
                }

                // bash：使用流式执行 + 逐行进度推送
                if ("bash".equals(toolName)) {
                    JsonNode args = objectMapper.readTree(arguments);
                    ToolExecutor executor = toolRegistry.getExecutor(toolName);
                    if (executor != null) {
                        long[] lastProgressTime = {0};
                        BashTool.setCurrentToolCallId(toolCall.getId());
                        try {
                            String rawResult = executor.execute(args, line -> {
                                long now = System.currentTimeMillis();
                                if (now - lastProgressTime[0] > 200) {
                                    lastProgressTime[0] = now;
                                    sseWriter.sendSseEvent("tool_progress",
                                        "{\"id\":\"" + SseWriter.escapeJson(toolCall.getId())
                                        + "\",\"line\":\"" + SseWriter.escapeJson(line) + "\"}");
                                }
                            });
                            // 终止失败（进程未能被终止，转入后台）：tool_result 标记为非成功
                            boolean cancelFailed = BashProcessManager.getInstance().consumeCancelFailed(toolCall.getId());
                            boolean toolSuccess = !cancelFailed;
                            String truncatedResult = truncationService.truncateToolOutput(toolName, rawResult);
                            getConversationService().addToolResult(conversation, toolCall.getId(), toolName, truncatedResult, toolSuccess);
                            sseWriter.sendSseEvent("tool_result",
                                buildToolResultJson(toolCall.getId(), toolName, toolSuccess, truncatedResult, null, arguments, toolCall.getId()));
                            SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                            stats.addToolCall();
                        } finally {
                            BashTool.clearCurrentToolCallId();
                        }
                        continue;
                    }
                }

                // delete_file：预览 → 保护文件检查 → 需要用户确认
                if ("delete_file".equals(toolName)) {
                    JsonNode args = objectMapper.readTree(arguments);
                    DeleteFileTool.PreviewResult preview = DeleteFileTool.preview(args);

                    if (preview.hasErrors()) {
                        String errorMsg = "预览删除文件失败:\n" + String.join("\n", preview.getErrors());
                        getConversationService().addToolResult(conversation, toolCall.getId(), toolName, "错误: " + errorMsg, false);
                        sseWriter.sendSseEvent("tool_result",
                            buildToolResultJson(toolCall.getId(), toolName, false, null, errorMsg, arguments, toolCall.getId()));
                        continue;
                    }

                    if (preview.hasProtectedFiles()) {
                        String errorMsg = "删除被拒绝：路径中包含受保护的文件（.git, node_modules, .env 等），已自动跳过。\n"
                            + "受保护文件 " + preview.getSkippedProtected().size() + " 个:\n"
                            + preview.getSkippedProtected().stream().map(f -> "  - " + f).collect(java.util.stream.Collectors.joining("\n"));
                        getConversationService().addToolResult(conversation, toolCall.getId(), toolName, "错误: " + errorMsg, false);
                        sseWriter.sendSseEvent("tool_result",
                            buildToolResultJson(toolCall.getId(), toolName, false, null, errorMsg, arguments, toolCall.getId()));
                        continue;
                    }

                    if (preview.totalCount() == 0) {
                        String errorMsg = "没有找到需要删除的文件。";
                        getConversationService().addToolResult(conversation, toolCall.getId(), toolName, "错误: " + errorMsg, false);
                        sseWriter.sendSseEvent("tool_result",
                            buildToolResultJson(toolCall.getId(), toolName, false, null, errorMsg, arguments, toolCall.getId()));
                        continue;
                    }

                    // 检查配置：是否需要用户确认（完全由"需要确认"开关决定，权限范围不影响）
                    boolean requireConfirm = Config.getInstance().getTools().getDeleteFile().isRequireConfirmation();

                    if (requireConfirm) {
                        // 需要用户确认
                        String confirmId = java.util.UUID.randomUUID().toString();

                        String[] filePaths = preview.getFiles().toArray(new String[0]);
                        String[] dirPaths = preview.getEmptyDirs().toArray(new String[0]);
                        PendingDeleteConfirmation pending = new PendingDeleteConfirmation(
                            confirmId, toolCall.getId(), toolName,
                            args, filePaths, preview.totalCount()
                        );
                        sessionManager.setPendingDeleteConfirmation(sessionId, pending);

                        // 构建 SSE 确认消息
                        String confirmJson = buildDeleteConfirmJson(confirmId, filePaths, dirPaths, preview.totalCount());
                        sseWriter.sendSseEvent("tool_confirmation", confirmJson);
                        logger.info("发送 delete_file 确认事件: confirmId={}, totalCount={} (files={}, dirs={})",
                            confirmId, preview.totalCount(), preview.getFiles().size(), preview.getEmptyDirs().size());

                        // 保存同一轮中尚未执行的剩余工具
                        if (i < toolCalls.size() - 1) {
                            List<ToolCall> remaining = toolCalls.subList(i + 1, toolCalls.size());
                            remainingToolCalls.put(sessionId, remaining);
                            logger.info("暂存剩余工具调用: sessionId={}, 数量={}", sessionId, remaining.size());
                        }
                        return false;
                    }

                    // 不需要确认，直接执行（走下方统一的工具执行逻辑）
                    logger.info("delete_file 无需确认，直接执行: sessionId={}, totalCount={}",
                        sessionId, preview.totalCount());
                }

                // 设置 toolCallId 供 FileChangeTracker.recordChange 使用
                try (var _tool = FileChangeTracker.withContext(null, toolCall.getId())) {
                    String rawResult = toolRegistry.execute(toolName, arguments);

                    if ("ask_user".equals(toolName)) {
                        JsonNode resultNode = objectMapper.readTree(rawResult);
                        String question = resultNode.get("question").asText();
                        List<String> options = new ArrayList<>();
                        if (resultNode.has("options")) {
                            for (JsonNode opt : resultNode.get("options")) {
                                options.add(opt.asText());
                            }
                        }
                        boolean allowCustomInput = resultNode.get("allow_custom_input").asBoolean();

                        logger.info("发送 waiting_user 事件: question={}, options={}", question, options);

                        sessionManager.setPendingToolCall(sessionId, new PendingToolCall(
                            toolCall.getId(), toolName, question, options, allowCustomInput
                        ));

                        sseWriter.sendSseEvent("waiting_user", rawResult);
                        logger.info("waiting_user 事件已发送");
                        return false;
                    }

                    String truncatedResult = truncationService.truncateToolOutput(toolName, rawResult);

                    getConversationService().addToolResult(conversation, toolCall.getId(), toolName, truncatedResult, true);
                    sseWriter.sendSseEvent("tool_result",
                        buildToolResultJson(toolCall.getId(), toolName, true, truncatedResult, null, arguments, toolCall.getId()));

                    SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                    stats.addToolCall();
                }
            } catch (Throwable t) {
                // 兜底：捕获 Error（StackOverflow 等）也补一条 tool_result 落盘，
                // 避免已发 tool_start 的调用在会话历史中成为孤儿（下次请求靠 MessageSanitizer 清理）
                String errorMsg = t.getMessage();
                if (errorMsg == null || errorMsg.isEmpty()) {
                    errorMsg = t.getClass().getSimpleName() + " (无详细信息)";
                }
                logger.warn("工具执行异常/错误，已补 tool_result 落盘: sessionId={}, tool={}, error={}",
                    sessionId, toolName, errorMsg);
                getConversationService().addToolResult(conversation, toolCall.getId(), toolName, "错误: " + errorMsg, false);
                sseWriter.sendSseEvent("tool_result",
                    buildToolResultJson(toolCall.getId(), toolName, false, null, errorMsg, arguments, toolCall.getId()));
            } finally {
                RequestContext.clear();
            }
        }
        return true;
    }

    /**
     * 确认弹窗（bash 安全性确认）关闭后，统一恢复执行路径。
     * 1. 执行确认前暂存的剩余工具调用
     * 2. 进入下一轮 Agent 循环（新一轮 LLM 调用）
     *
     * 调用方（ToolConfirmHandler）不需要关心内部编排顺序。
     */
    public void continueAfterConfirmation(String sessionId, Conversation conversation, SseWriter sseWriter) throws LlmException {
        // 标记会话为"正在运行"
        sessionManager.setSessionRunning(sessionId, true);
        try {
            // 从 session 读取模式（确认弹窗期间模式不变）
            AgentMode mode = resolveMode(sessionManager.getMode(sessionId));

            // 执行确认前暂存的剩余工具调用
            // LLM 一次返回的多个 tool call 是并行语义，工具间无依赖，拒绝一个不影响其他
            List<ToolCall> remaining = remainingToolCalls.remove(sessionId);
            if (remaining != null && !remaining.isEmpty()) {
                String remainingIds = remaining.stream()
                    .map(tc -> tc.getId() + "(" + tc.getFunction().getName() + ")")
                    .collect(java.util.stream.Collectors.joining(", "));
                logger.info("确认弹窗关闭，开始执行剩余工具 (sessionId={}, 数量={}, 列表=[{}])",
                    sessionId, remaining.size(), remainingIds);
                executeToolCalls(remaining, conversation, sseWriter, sessionId, mode);
                // 执行剩余工具时又触发了新的确认弹窗（如第二个 bash/delete_file 也需确认），
                // 等待用户确认，不进入下一轮 Agent 循环
                if (sessionManager.hasPendingBashConfirmation(sessionId) || sessionManager.hasPendingDeleteConfirmation(sessionId)) {
                    logger.info("剩余工具执行中触发了新的确认弹窗，等待用户确认 (sessionId={})", sessionId);
                    return;
                }
            } else {
                logger.info("确认弹窗关闭，无剩余工具 (sessionId={})", sessionId);
            }
            // 进入下一轮 Agent 循环
            logger.info("确认弹窗关闭后，进入下一轮 Agent 循环 (sessionId={})", sessionId);
            execute(sessionId, conversation, sseWriter);
        } finally {
            sessionManager.setSessionRunning(sessionId, false);
        }
    }

    private List<Message> ensureSystemMessageFirst(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return messages;
        }

        List<Message> nonSystemMessages = new ArrayList<>();
        Message firstSystem = null;
        for (Message msg : messages) {
            if ("system".equals(msg.getRole())) {
                if (firstSystem == null) {
                    firstSystem = msg;
                }
            } else {
                nonSystemMessages.add(msg);
            }
        }

        if (firstSystem != null) {
            List<Message> result = new ArrayList<>();
            result.add(firstSystem);
            result.addAll(nonSystemMessages);
            return result;
        }

        return nonSystemMessages;
    }

    /**
     * 将 session 中存储的 mode 字符串解析为 AgentMode 枚举。
     * null / 空 / 无法识别时返回默认的 CODING 模式。
     */
    private static AgentMode resolveMode(String modeStr) {
        if (modeStr == null || modeStr.isBlank()) {
            return AgentMode.CODING;
        }
        try {
            return AgentMode.valueOf(modeStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            logger.warn("无法识别的 mode: {}, 使用默认 CODING 模式", modeStr);
            return AgentMode.CODING;
        }
    }

    // ========== JSON 构建辅助（使用 ObjectMapper，杜绝手拼） ==========

    /**
     * 使用 ObjectMapper 安全构建 tool_result SSE 事件 JSON，避免手拼字符串导致的格式错误。
     * @param resultContent success=true 时的 result 字段内容，传 null 则不包含
     * @param errorContent  success=false 时的 error 字段内容，传 null 则不包含
     */
    private static String buildToolResultJson(String id, String name, boolean success,
                                               String resultContent, String errorContent,
                                               String argsJson, String toolCallId) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("name", name);
        node.put("success", success);
        if (resultContent != null) {
            node.put("result", resultContent);
        }
        if (errorContent != null) {
            node.put("error", errorContent);
        }
        node.set("args", safeArgs(argsJson, toolCallId));
        return node.toString();
    }

    /**
     * 安全解析 arguments JSON，非法时降级为文本节点，避免整个 tool_result 事件断裂。
     * <p>
     * 流式场景下，tool_start 在 arguments delta 拼接完成前就会被调用（如仅 "{\"pa" 残缺片段），
     * 这类"未闭合"的片段属正常增量过程，打 DEBUG 即可，避免每轮工具都刷两条 WARN 噪音；
     * 只有以 } / ] 结尾（看似完整）但语法错误的参数才值得 WARN 提示。
     */
    private static JsonNode safeArgs(String json, String toolCallId) {
        try {
            if (json != null && !json.trim().isEmpty()) {
                JsonNode node = objectMapper.readTree(json);
                if (node != null && !node.isMissingNode()) return node;
            }
        } catch (Exception e) {
            String trimmed = json != null ? json.trim() : "";
            boolean looksComplete = trimmed.endsWith("}") || trimmed.endsWith("]");
            if (looksComplete) {
                logger.warn("arguments 非合法 JSON, toolCallId={}, 已转为字符串兜底", toolCallId);
            } else {
                // 流式增量中的残缺片段（未闭合），属正常过程，仅 DEBUG
                logger.debug("arguments 为流式残缺片段, toolCallId={}, 已转为字符串兜底", toolCallId);
            }
        }
        return objectMapper.getNodeFactory().textNode(json != null ? json : "");
    }

    /**
     * 使用 ObjectMapper 安全构建 tool_start SSE 事件 JSON。
     */
    private static String buildStartJson(String id, String name, String argsJson) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("name", name != null ? name : "");
        node.set("args", safeArgs(argsJson, id));
        return node.toString();
    }

    /**
     * 构建 web_search SSE 事件 payload。
     * <p>
     * 进行中（web_search_start）恒为空对象（流式 in_progress/searching 事件不含 action）；
     * 完成（web_search_done）在 output_item.done 到达时携带 action 明细（可能为 null 时回退空对象）。
     * </p>
     */
    private static String buildWebSearchPayload(WebSearchAction action) {
        if (action == null) {
            return "{}";
        }
        return objectMapper.valueToTree(action).toString();
    }

    /**
     * 合并流式与非流式来源的联网搜索动作明细。
     * <p>
     * 两条路径可能收集到相同动作（同轮请求同时走流式输出与最终响应解析），
     * 按动作指纹去重：type + queries（search）/ type + url + pattern（open_page / find_in_page）。
     * 返回新的合并列表，不修改入参。
     * </p>
     */
    private static List<WebSearchAction> mergeWebSearchActions(
            List<WebSearchAction> streamActions, List<WebSearchAction> nonStreamActions) {
        List<WebSearchAction> merged = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        if (streamActions != null) {
            for (WebSearchAction action : streamActions) {
                String key = webSearchActionFingerprint(action);
                if (key != null && seen.add(key)) {
                    merged.add(action);
                }
            }
        }
        if (nonStreamActions != null) {
            for (WebSearchAction action : nonStreamActions) {
                String key = webSearchActionFingerprint(action);
                if (key != null && seen.add(key)) {
                    merged.add(action);
                }
            }
        }
        return merged;
    }

    /** 生成动作去重指纹；关键字段缺失时返回 null（跳过该动作，避免空指纹误合并）。 */
    private static String webSearchActionFingerprint(WebSearchAction action) {
        if (action == null || action.getType() == null) {
            return null;
        }
        String type = action.getType();
        if ("search".equals(type)) {
            List<String> queries = action.getQueries();
            return "search:" + (queries == null ? "" : String.join("|", queries));
        }
        String url = action.getUrl() != null ? action.getUrl() : "";
        String pattern = action.getPattern() != null ? action.getPattern() : "";
        return type + ":" + url + "#" + pattern;
    }

    /**
     * 使用 ObjectMapper 安全构建 tool_progress SSE 事件 JSON。
     */
    private static String buildProgressJson(String id, String line) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("line", line);
        return node.toString();
    }

    /**
     * 使用 ObjectMapper 安全构建 tool_confirmation（bash）SSE 事件 JSON。
     */
    private static String buildBashConfirmJson(String confirmId, String command,
                                                String riskLevel, String riskReason) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("confirmId", confirmId);
        node.put("command", command);
        node.put("riskLevel", riskLevel);
        node.put("riskReason", riskReason);
        return node.toString();
    }

    /**
     * 使用 ObjectMapper 安全构建 delete_file 确认 SSE 事件 JSON。
     * 文件列表超过 10 个则截断显示。
     */
    private static String buildDeleteConfirmJson(String confirmId, String[] filePaths,
                                                  String[] dirPaths, int totalCount) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("confirmId", confirmId);
        node.put("toolType", "delete_file");
        node.put("totalCount", totalCount);

        ArrayNode filesArray = node.putArray("files");
        int displayCount = Math.min(filePaths.length, 10);
        for (int i = 0; i < displayCount; i++) {
            filesArray.add(filePaths[i]);
        }

        ArrayNode dirsArray = node.putArray("directories");
        int dirDisplayCount = Math.min(dirPaths.length, 10);
        for (int i = 0; i < dirDisplayCount; i++) {
            dirsArray.add(dirPaths[i]);
        }

        node.put("truncated", totalCount > 10);
        return node.toString();
    }

    /**
     * 构建 SSE error 事件的 JSON 负载（code/detail 可为 null，向后兼容旧前端）。
     */
    private static String buildErrorPayload(String code, String message, String detail) {
        ObjectNode node = objectMapper.createObjectNode();
        if (code != null) {
            node.put("code", code);
        }
        node.put("message", message != null ? message : "");
        if (detail != null) {
            node.put("detail", detail);
        }
        return node.toString();
    }
}
