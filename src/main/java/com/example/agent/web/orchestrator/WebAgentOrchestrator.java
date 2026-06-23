package com.example.agent.web.orchestrator;

import com.example.agent.application.ConversationService;
import com.example.agent.core.blocker.HookResult;
import com.example.agent.core.blocker.RequestContext;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.truncation.TruncationService;
import com.example.agent.execute.AgentTurnResult;
import com.example.agent.execute.StopHook;
import com.example.agent.execute.TaskCompletionHook;
import com.example.agent.llm.client.AbstractLlmClient;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.client.LlmClientFactory;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.service.TokenEstimatorFactory;
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
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class WebAgentOrchestrator {

    private static final Logger logger = LoggerFactory.getLogger(WebAgentOrchestrator.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final int MAX_TURNS = 20;

    private static final List<StopHook> stopHooks = List.of(
        new TaskCompletionHook()
    );

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
    private final ToolRegistry toolRegistry;

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

        List<Tool> tools = toolRegistry.toTools();

        for (int turn = 0; turn < MAX_TURNS; turn++) {
            if (SseWriter.isClientDisconnected() || cancelManager.isCancelled(sessionId)) {
                if (SseWriter.isClientDisconnected()) {
                    logger.info("客户端已断开，提前结束 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                } else {
                    logger.info("收到取消信号，提前结束 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                }
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

            if (cleanupOrphanToolCalls(messages)) {
                // 同步修复 conversation 存储中的消息，避免下一轮重复检出同一个孤立 tool_calls
                List<Message> convMessages = new ArrayList<>(conversation.getMessages());
                cleanupOrphanToolCalls(convMessages);
                conversation.getContextWindow().replaceMessages(convMessages);
            }

            sseWriter.sendSseEvent("thinking", "{\"turn\":" + (turn + 1) + "}");

            if (SseWriter.isClientDisconnected() || cancelManager.isCancelled(sessionId)) {
                if (SseWriter.isClientDisconnected()) {
                    logger.info("客户端已断开，提前结束 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                } else {
                    logger.info("收到取消信号，提前结束 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                }
                return;
            }

            final int currentTurn = turn + 1;

            // 设置流式取消检查器，让 LLM 流式读取线程能感知外部取消信号
            // 通过 SessionCancelManager（共享状态），而非 ThreadLocal 的 aborted 标志
            if (llmClient instanceof AbstractLlmClient) {
                ((AbstractLlmClient) llmClient).setCancelCheck(() -> cancelManager.isCancelled(sessionId));
            }

            ChatResponse response = llmClient.chatStream(messages, tools, (StreamChunk chunk) -> {
                if (SseWriter.isClientDisconnected() || cancelManager.isCancelled(sessionId)) {
                    if (!SseWriter.isClientDisconnected()) {
                        logger.debug("流式回调感知取消信号, 中止 LLM 请求: sessionId={}", sessionId);
                    }
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

                                String toolStartData = "{\"id\":\"" + SseWriter.escapeJson(toolCallId)
                                    + "\",\"name\":\"" + SseWriter.escapeJson(toolName)
                                    + "\",\"args\":" + SseWriter.escapeJsonForValue(arguments) + "}";
                                sseWriter.sendSseEvent("tool_start", toolStartData);
                            }
                        }
                    }
                }
            });

            if (SseWriter.isClientDisconnected() || cancelManager.isCancelled(sessionId)) {
                if (SseWriter.isClientDisconnected()) {
                    logger.info("客户端已断开，跳过工具执行 (sessionId={}, turn={})", sessionId, turn + 1);
                } else {
                    logger.info("收到取消信号，跳过工具执行 (sessionId={}, turn={})", sessionId, turn + 1);
                }
                return;
            }

            Message assistantMessage = response.getFirstMessage();
            if (assistantMessage == null) {
                sseWriter.sendSseEvent("error", "{\"message\":\"未收到有效响应\"}");
                return;
            }

            if (contentBuilder.length() > 0 && (assistantMessage.getContent() == null || assistantMessage.getContent().isBlank())) {
                assistantMessage.setContent(contentBuilder.toString());
            }

            String finalContent = assistantMessage.getContent();
            boolean hasContent = finalContent != null && !finalContent.isBlank();
            boolean hasToolCalls = assistantMessage.getToolCalls() != null && !assistantMessage.getToolCalls().isEmpty();

            if (!hasContent && !hasToolCalls) {
                String finishReason = (response.getChoices() != null && !response.getChoices().isEmpty())
                    ? response.getChoices().get(0).getFinishReason() : "unknown";
                logger.warn("LLM 返回空内容：sessionId={}, turn={}, finishReason={}, contentChunks={}, model={}",
                    sessionId, turn + 1, finishReason, contentBuilder.length(), response.getModel());

                if (reasoningPhase[0] && reasoningBuilder.length() > 0) {
                    reasoningPhase[0] = false;
                    sseWriter.sendSseEvent("reasoning_done", "{}");
                }

                String errorMessage = switch (finishReason) {
                    case "length" -> "响应长度达到限制，请减少上下文或增加 max_tokens";
                    case "content_filter" -> "内容被安全过滤器阻止";
                    default -> "LLM 未返回有效内容，请重试";
                };
                sseWriter.sendSseEvent("error", "{\"message\":\"" + SseWriter.escapeJson(errorMessage) + "\"}");
                return;
            } else {
                logger.info("LLM 响应正常：sessionId={}, turn={}, contentLength={}, hasToolCalls={}",
                    sessionId, turn + 1, hasContent ? finalContent.length() : 0, hasToolCalls);
            }

            if (response.getUsage() != null) {
                SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                stats.addLlmCall(
                    response.getUsage().getPromptTokens(),
                    response.getUsage().getCompletionTokens(),
                    response.getUsage().getTotalTokens(),
                    response.getUsage().getCacheReadInputTokens(),
                    response.getUsage().getPromptCacheMissTokens()
                );
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
                sseWriter.sendSseEvent("done", "{}");
                return;
            }

            boolean allToolsCompleted = executeToolCalls(toolCalls, conversation, sseWriter, sessionId);

            toolRegistry.getBlockerChain().onTurnComplete();

            List<Message> history = getConversationService().getHistory(conversation);
            StopHook.StopHookContext hookCtx = new StopHook.StopHookContext(
                conversation, history, turn + 1, AgentTurnResult.DONE
            );
            for (StopHook hook : stopHooks) {
                StopHook.StopHookResult hookResult = hook.evaluate(hookCtx);
                if (hookResult.isShouldStop()) {
                    logger.warn("StopHook 触发强制终止: {} (sessionId={}, turn={})",
                        hookResult.getReason(), sessionId, turn + 1);
                    sseWriter.sendSseEvent("done", "{}");
                    return;
                } else if (hookResult.isWarning()) {
                    logger.warn("StopHook 发送停滞警告: {} (sessionId={}, turn={})",
                        hookResult.getReason(), sessionId, turn + 1);
                    sseWriter.sendSseEvent("warning", "{\"message\":\"" + SseWriter.escapeJson(hookResult.getReason()) + "\"}");
                }
            }

            if (SseWriter.isClientDisconnected() || cancelManager.isCancelled(sessionId)) {
                if (SseWriter.isClientDisconnected()) {
                    logger.info("客户端已断开，停止下一轮 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                } else {
                    logger.info("收到取消信号，停止下一轮 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                }
                return;
            }

            if (sessionManager.hasPendingToolCall(sessionId)) {
                return;
            }

            if (sessionManager.hasPendingBashConfirmation(sessionId) || sessionManager.hasPendingDeleteConfirmation(sessionId)) {
                return;
            }

            if (turn < MAX_TURNS - 1) {
                sseWriter.sendSseEvent("continue", "{\"reason\":\"tool_complete\",\"nextTurn\":" + (turn + 2) + "}");
            }
        }

        sseWriter.sendSseEvent("done", "{}");
    }

    private boolean executeToolCalls(List<ToolCall> toolCalls, Conversation conversation, SseWriter sseWriter, String sessionId) {
        for (int i = 0; i < toolCalls.size(); i++) {
            ToolCall toolCall = toolCalls.get(i);
            if (SseWriter.isClientDisconnected() || cancelManager.isCancelled(sessionId)) {
                if (SseWriter.isClientDisconnected()) {
                    logger.info("客户端已断开，跳过工具执行 (sessionId={})", sessionId);
                } else {
                    logger.info("收到取消信号，跳过工具执行 (sessionId={})", sessionId);
                }
                return false;
            }

            String toolName = toolCall.getFunction().getName();
            String arguments = toolCall.getFunction().getArguments();

            if (!"ask_user".equals(toolName)) {
                logger.debug("executeToolCalls 发送 tool_start: toolCallId={}, toolName={} (sessionId={})",
                    toolCall.getId(), toolName, sessionId);
                sseWriter.sendSseEvent("tool_start", buildStartJson(toolCall.getId(), toolName, arguments));
            }

            try (var _session = FileChangeTracker.withContext(sessionId, null)) {
                RequestContext.set(RequestContext.ContextType.WEB);

                // 对 bash 工具做预检查：三级安全模型 + session auto-allow
                if ("bash".equals(toolName)) {
                    JsonNode args = objectMapper.readTree(arguments);
                    String command = args.has("command") ? args.get("command").asText() : "";

                    // session 级 auto-allow 检测：用户之前授权过同类命令，直接放行
                    if (!command.isEmpty()) {
                        String commandName = extractCommandName(command);
                        if (sessionManager.isAutoAllowed(sessionId, commandName)) {
                            logger.debug("auto-allow 跳过确认: sessionId={}, command={}", sessionId, commandName);
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
                                                buildProgressJson(toolCall.getId(), line));
                                        }
                                    });
                                    String truncatedResult = truncationService.truncateToolOutput(toolName, rawResult);
                                    getConversationService().addToolResult(conversation, toolCall.getId(), toolName, truncatedResult, true);
                                    sseWriter.sendSseEvent("tool_result",
                                        buildToolResultJson(toolCall.getId(), toolName, true, truncatedResult, null, arguments, toolCall.getId()));
                                    SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                                    stats.addToolCall();
                                } finally {
                                    BashTool.clearCurrentToolCallId();
                                }
                                continue;
                            }
                        } else {
                            HookResult hookResult = toolRegistry.getBlockerChain().check(toolName, args);

                            if (hookResult.isDenied()) {
                                String errorMsg = hookResult.getReason();
                                getConversationService().addToolResult(conversation, toolCall.getId(), toolName, "错误: " + errorMsg, false);
                                sseWriter.sendSseEvent("tool_result",
                                    buildToolResultJson(toolCall.getId(), toolName, false, null, errorMsg, arguments, toolCall.getId()));
                                continue;
                            }

                            if (hookResult.isConfirmationRequired()) {
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
                            String truncatedResult = truncationService.truncateToolOutput(toolName, rawResult);
                            getConversationService().addToolResult(conversation, toolCall.getId(), toolName, truncatedResult, true);
                            sseWriter.sendSseEvent("tool_result",
                                buildToolResultJson(toolCall.getId(), toolName, true, truncatedResult, null, arguments, toolCall.getId()));
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
            } catch (Exception e) {
                String errorMsg = e.getMessage();
                if (errorMsg == null || errorMsg.isEmpty()) {
                    errorMsg = e.getClass().getSimpleName() + " (无详细信息)";
                }
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
        // 执行确认前暂存的剩余工具调用
        // LLM 一次返回的多个 tool call 是并行语义，工具间无依赖，拒绝一个不影响其他
        List<ToolCall> remaining = remainingToolCalls.remove(sessionId);
        if (remaining != null && !remaining.isEmpty()) {
            String remainingIds = remaining.stream()
                .map(tc -> tc.getId() + "(" + tc.getFunction().getName() + ")")
                .collect(java.util.stream.Collectors.joining(", "));
            logger.info("确认弹窗关闭，开始执行剩余工具 (sessionId={}, 数量={}, 列表=[{}])",
                sessionId, remaining.size(), remainingIds);
            executeToolCalls(remaining, conversation, sseWriter, sessionId);
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

    private boolean cleanupOrphanToolCalls(List<Message> messages) {
        return cleanupOrphanToolCalls(messages, null);
    }

    private boolean cleanupOrphanToolCalls(List<Message> messages, Conversation conversation) {
        if (messages == null || messages.isEmpty()) {
            return false;
        }

        boolean foundOrphan = false;

        for (int i = messages.size() - 1; i >= 0; i--) {
            Message msg = messages.get(i);
            if (!msg.isAssistant() || msg.getToolCalls() == null || msg.getToolCalls().isEmpty()) {
                continue;
            }

            List<ToolCall> toolCalls = msg.getToolCalls();
            Set<String> toolCallIds = toolCalls.stream()
                .map(ToolCall::getId)
                .filter(id -> id != null && !id.isEmpty())
                .collect(Collectors.toSet());

            if (toolCallIds.isEmpty()) {
                continue;
            }

            boolean adjacentBroken = false;
            if (i + 1 < messages.size()) {
                Message nextMsg = messages.get(i + 1);
                adjacentBroken = !nextMsg.isTool()
                    || nextMsg.getToolCallId() == null
                    || !toolCallIds.contains(nextMsg.getToolCallId());
            }

            if (adjacentBroken) {
                logger.warn("检测到 tool_calls 相邻性被破坏 (assistant消息索引={}), tool_calls({}) 后不是紧跟着 tool 消息, role={}",
                    i, toolCallIds.size(), i + 1 < messages.size() ? messages.get(i + 1).getRole() : "N/A");
                for (ToolCall tc : toolCalls) {
                    String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
                    logger.warn("  孤立的 ToolCall: id={}, name={}", tc.getId(), toolName);
                }

                Message fixedMsg = msg.shallowCopy();
                if (fixedMsg.getContent() == null || fixedMsg.getContent().isBlank()) {
                    StringBuilder fixContent = new StringBuilder();
                    for (ToolCall tc : toolCalls) {
                        String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
                        fixContent.append("\n  - 待执行的操作: ").append(toolName);
                    }
                    fixedMsg.setContent("[会话中断] 检测到未完成的工具调用：" + fixContent.toString());
                }
                fixedMsg.setToolCalls(null);
                messages.set(i, fixedMsg);
                foundOrphan = true;
                continue;
            }

            Set<String> respondedIds = new HashSet<>();
            for (int j = i + 1; j < messages.size(); j++) {
                Message m = messages.get(j);
                if (m.isTool() && m.getToolCallId() != null && toolCallIds.contains(m.getToolCallId())) {
                    respondedIds.add(m.getToolCallId());
                }
            }

            boolean allResponded = toolCallIds.stream().allMatch(respondedIds::contains);
            if (!allResponded) {
                logger.warn("检测到孤立 tool_calls (assistant消息索引={}), 共 {} 个调用, 仅有 {} 个有响应。将清空 tool_calls 避免 API 400 错误",
                    i, toolCallIds.size(), respondedIds.size());
                for (ToolCall tc : toolCalls) {
                    String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
                    boolean responded = tc.getId() != null && respondedIds.contains(tc.getId());
                    logger.warn("  孤立 ToolCall: id={}, name={}, 有响应={}", tc.getId(), toolName, responded);
                }

                Message fixedMsg = msg.shallowCopy();
                if (fixedMsg.getContent() == null || fixedMsg.getContent().isBlank()) {
                    StringBuilder fixContent = new StringBuilder();
                    for (ToolCall tc : toolCalls) {
                        String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
                        fixContent.append("\n  - 待执行的操作: ").append(toolName);
                    }
                    fixedMsg.setContent("[会话中断] 检测到未完成的工具调用：" + fixContent.toString());
                }
                fixedMsg.setToolCalls(null);
                messages.set(i, fixedMsg);
                foundOrphan = true;
            }
        }

        if (foundOrphan) {
            logger.info("已清理孤立 tool_calls，避免后续 API 调用失败");
        }

        List<Message> toRemove = new ArrayList<>();
        for (int i = 0; i < messages.size(); i++) {
            Message msg = messages.get(i);
            if (!msg.isTool() || msg.getToolCallId() == null || msg.getToolCallId().isEmpty()) {
                continue;
            }

            boolean hasPreceding = false;
            for (int j = i - 1; j >= Math.max(0, i - 10); j--) {
                Message prev = messages.get(j);
                if (prev.isAssistant() && prev.getToolCalls() != null) {
                    boolean match = prev.getToolCalls().stream()
                        .anyMatch(tc -> msg.getToolCallId().equals(tc.getId()));
                    if (match) {
                        hasPreceding = true;
                        break;
                    }
                }
            }

            if (!hasPreceding) {
                logger.warn("检测到孤儿 tool 消息 (索引={}), tool_call_id={}, name={}, 无匹配的 assistant(tool_calls) 在前面，将移除",
                    i, msg.getToolCallId(), msg.getName());
                toRemove.add(msg);
            }
        }

        if (!toRemove.isEmpty()) {
            messages.removeAll(toRemove);
            logger.info("已移除 {} 条孤儿 tool 消息，避免 DeepSeek API 400 错误", toRemove.size());
            foundOrphan = true;
        }

        return foundOrphan;
    }

    private static String extractCommandName(String command) {
        String firstPart = command.split("\\|")[0].trim();
        firstPart = firstPart.split(">")[0].trim();
        firstPart = firstPart.split(">>")[0].trim();
        String[] parts = firstPart.split("\\s+");
        if (parts.length > 0) {
            String cmd = parts[0];
            int lastSlash = cmd.lastIndexOf('/');
            if (lastSlash >= 0 && lastSlash < cmd.length() - 1) {
                return cmd.substring(lastSlash + 1).toLowerCase();
            }
            return cmd.toLowerCase();
        }
        return command.toLowerCase();
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
     */
    private static JsonNode safeArgs(String json, String toolCallId) {
        try {
            if (json != null && !json.trim().isEmpty()) {
                JsonNode node = objectMapper.readTree(json);
                if (node != null && !node.isMissingNode()) return node;
            }
        } catch (Exception e) {
            logger.warn("arguments 非合法 JSON, toolCallId={}, 已转为字符串兜底", toolCallId);
        }
        return objectMapper.getNodeFactory().textNode(json != null ? json : "");
    }

    /**
     * 使用 ObjectMapper 安全构建 tool_start SSE 事件 JSON。
     */
    private static String buildStartJson(String id, String name, String argsJson) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("name", name);
        node.set("args", safeArgs(argsJson, id));
        return node.toString();
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
}
