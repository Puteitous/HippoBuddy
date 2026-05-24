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
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.tools.BashTool;
import com.example.agent.tools.FileChangeTracker;
import com.example.agent.snapshot.FileSnapshotManager;
import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.logging.SessionLogger;
import com.example.agent.web.session.PendingBashConfirmation;
import com.example.agent.web.session.PendingToolCall;
import com.example.agent.web.session.SessionManager;
import com.example.agent.web.session.SessionTokenStats;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

public class WebAgentOrchestrator {

    private static final Logger logger = LoggerFactory.getLogger(WebAgentOrchestrator.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final int MAX_TURNS = 20;

    private static final List<StopHook> stopHooks = List.of(
        new TaskCompletionHook()
    );

    private static final TruncationService truncationService = new TruncationService(TokenEstimatorFactory.getDefault());

    private final SessionManager sessionManager;
    private final LlmClient llmClient;
    private final ToolRegistry toolRegistry;

    public WebAgentOrchestrator(SessionManager sessionManager) {
        this.sessionManager = sessionManager;
        this.llmClient = ServiceLocator.get(LlmClient.class);
        this.toolRegistry = ServiceLocator.get(ToolRegistry.class);
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
        List<Tool> tools = toolRegistry.toTools();

        for (int turn = 0; turn < MAX_TURNS; turn++) {
            if (SseWriter.isClientDisconnected()) {
                logger.info("客户端已断开，提前结束 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                return;
            }

            List<Message> messages = new ArrayList<>(getConversationService().getContextForInference(conversation));

            messages = ensureSystemMessageFirst(messages);

            StringBuilder contentBuilder = new StringBuilder();
            StringBuilder reasoningBuilder = new StringBuilder();
            boolean[] reasoningPhase = {true};
            List<Map<String, Object>> streamToolCalls = new ArrayList<>();
            boolean[] hasAskUser = {false};

            cleanupOrphanToolCalls(messages);

            sseWriter.sendSseEvent("thinking", "{\"turn\":" + (turn + 1) + "}");

            if (SseWriter.isClientDisconnected()) {
                logger.info("客户端已断开，提前结束 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                return;
            }

            final int currentTurn = turn + 1;

            ChatResponse response = llmClient.chatStream(messages, tools, (StreamChunk chunk) -> {
                if (SseWriter.isClientDisconnected()) {
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
                        String toolName = delta.getFunction().getName();
                        String arguments = delta.getFunction().getArguments();
                        String toolCallId = delta.getId();

                        boolean alreadySent = streamToolCalls.stream()
                            .anyMatch(tc -> tc.get("id").equals(toolCallId));

                        if (!alreadySent) {
                            if (reasoningPhase[0]) {
                                reasoningPhase[0] = false;
                                if (reasoningBuilder.length() > 0) {
                                    sseWriter.sendSseEvent("reasoning_done", "{}");
                                }
                            }

                            Map<String, Object> toolCall = new HashMap<>();
                            toolCall.put("id", toolCallId);
                            toolCall.put("name", toolName);
                            toolCall.put("args", arguments);
                            streamToolCalls.add(toolCall);

                            String toolStartData = "{\"id\":\"" + SseWriter.escapeJson(toolCallId)
                                + "\",\"name\":\"" + SseWriter.escapeJson(toolName)
                                + "\",\"args\":" + SseWriter.escapeJsonForValue(arguments) + "}";
                            sseWriter.sendSseEvent("tool_start", toolStartData);

                            if ("ask_user".equals(toolName)) {
                                hasAskUser[0] = true;
                                sseWriter.sendSseEvent("clear_content", "{}");
                            }
                        }
                    }
                }
            });

            if (SseWriter.isClientDisconnected()) {
                logger.info("客户端已断开，跳过工具执行 (sessionId={}, turn={})", sessionId, turn + 1);
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

            SessionLogger.logLlmResponse(sessionId, turn + 1, response.getUsage(),
                hasContent ? finalContent : null);

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

            executeToolCalls(toolCalls, conversation, sseWriter, sessionId);

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

            if (SseWriter.isClientDisconnected()) {
                logger.info("客户端已断开，停止下一轮 Agent 循环 (sessionId={}, turn={})", sessionId, turn + 1);
                return;
            }

            if (sessionManager.hasPendingToolCall(sessionId)) {
                return;
            }

            if (sessionManager.hasPendingBashConfirmation(sessionId)) {
                return;
            }

            if (turn < MAX_TURNS - 1) {
                sseWriter.sendSseEvent("continue", "{\"reason\":\"tool_complete\",\"nextTurn\":" + (turn + 2) + "}");
            }
        }

        sseWriter.sendSseEvent("done", "{}");
    }

    private void executeToolCalls(List<ToolCall> toolCalls, Conversation conversation, SseWriter sseWriter, String sessionId) {
        for (ToolCall toolCall : toolCalls) {
            if (SseWriter.isClientDisconnected()) {
                logger.info("客户端已断开，跳过工具执行 (sessionId={})", sessionId);
                return;
            }

            String toolName = toolCall.getFunction().getName();
            String arguments = toolCall.getFunction().getArguments();

            if (!"ask_user".equals(toolName)) {
                sseWriter.sendSseEvent("tool_start", "{\"id\":\"" + SseWriter.escapeJson(toolCall.getId())
                    + "\",\"name\":\"" + SseWriter.escapeJson(toolName)
                    + "\",\"args\":" + SseWriter.escapeJsonForValue(arguments) + "}");
            }

            try {
                RequestContext.set(RequestContext.ContextType.WEB);
                FileChangeTracker.setCurrentSessionId(sessionId);
                FileSnapshotManager.setCurrentSessionId(sessionId);

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
                                                "{\"id\":\"" + SseWriter.escapeJson(toolCall.getId())
                                                + "\",\"line\":\"" + SseWriter.escapeJson(line) + "\"}");
                                        }
                                    });
                                    String truncatedResult = truncationService.truncateToolOutput(toolName, rawResult);
                                    getConversationService().addToolResult(conversation, toolCall.getId(), toolName, truncatedResult, true);
                                    sseWriter.sendSseEvent("tool_result", "{\"id\":\"" + SseWriter.escapeJson(toolCall.getId())
                                        + "\",\"name\":\"" + SseWriter.escapeJson(toolName)
                                        + "\",\"success\":true,\"result\":\"" + SseWriter.escapeJson(truncatedResult) + "\"}");
                                    SessionLogger.logToolCall(sessionId, toolName, arguments, truncatedResult, true);
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
                                sseWriter.sendSseEvent("tool_result", "{\"id\":\"" + SseWriter.escapeJson(toolCall.getId())
                                    + "\",\"name\":\"" + SseWriter.escapeJson(toolName)
                                    + "\",\"success\":false,\"error\":\"" + SseWriter.escapeJson(errorMsg) + "\"}");
                                SessionLogger.logToolCall(sessionId, toolName, arguments, errorMsg, false);
                                continue;
                            }

                            if (hookResult.isConfirmationRequired()) {
                                String confirmId = java.util.UUID.randomUUID().toString();

                                PendingBashConfirmation pending = new PendingBashConfirmation(
                                    confirmId, toolCall.getId(), toolName,
                                    command, arguments, hookResult.getRiskLevel(), hookResult.getReason()
                                );
                                sessionManager.setPendingBashConfirmation(sessionId, pending);

                                String confirmJson = "{\"confirmId\":\"" + SseWriter.escapeJson(confirmId)
                                    + "\",\"command\":\"" + SseWriter.escapeJson(command)
                                    + "\",\"riskLevel\":\"" + SseWriter.escapeJson(hookResult.getRiskLevel())
                                    + "\",\"riskReason\":\"" + SseWriter.escapeJson(hookResult.getReason()) + "\"}";
                                sseWriter.sendSseEvent("tool_confirmation", confirmJson);
                                logger.info("发送 tool_confirmation 事件: confirmId={}, command={}, riskLevel={}",
                                    confirmId, command, hookResult.getRiskLevel());
                                return;
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
                            sseWriter.sendSseEvent("tool_result", "{\"id\":\"" + SseWriter.escapeJson(toolCall.getId())
                                + "\",\"name\":\"" + SseWriter.escapeJson(toolName)
                                + "\",\"success\":true,\"result\":\"" + SseWriter.escapeJson(truncatedResult) + "\"}");
                            SessionLogger.logToolCall(sessionId, toolName, arguments, truncatedResult, true);
                            SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                            stats.addToolCall();
                        } finally {
                            BashTool.clearCurrentToolCallId();
                        }
                        continue;
                    }
                }

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
                    return;
                }

                String truncatedResult = truncationService.truncateToolOutput(toolName, rawResult);

                getConversationService().addToolResult(conversation, toolCall.getId(), toolName, truncatedResult, true);
                sseWriter.sendSseEvent("tool_result", "{\"id\":\"" + SseWriter.escapeJson(toolCall.getId())
                    + "\",\"name\":\"" + SseWriter.escapeJson(toolName)
                    + "\",\"success\":true,\"result\":\"" + SseWriter.escapeJson(truncatedResult) + "\"}");

                SessionLogger.logToolCall(sessionId, toolName, arguments, truncatedResult, true);
                SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                stats.addToolCall();
            } catch (Exception e) {
                String errorMsg = e.getMessage();
                if (errorMsg == null || errorMsg.isEmpty()) {
                    errorMsg = e.getClass().getSimpleName() + " (无详细信息)";
                }
                getConversationService().addToolResult(conversation, toolCall.getId(), toolName, "错误: " + errorMsg, false);
                sseWriter.sendSseEvent("tool_result", "{\"id\":\"" + SseWriter.escapeJson(toolCall.getId())
                    + "\",\"name\":\"" + SseWriter.escapeJson(toolName)
                    + "\",\"success\":false,\"error\":\"" + SseWriter.escapeJson(errorMsg) + "\"}");

                SessionLogger.logToolCall(sessionId, toolName, arguments, errorMsg, false);
            } finally {
                FileChangeTracker.clearCurrentSessionId();
                FileSnapshotManager.clearCurrentSessionId();
                RequestContext.clear();
            }
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

    private void cleanupOrphanToolCalls(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return;
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

                if (msg.getContent() == null || msg.getContent().isBlank()) {
                    StringBuilder fixContent = new StringBuilder();
                    for (ToolCall tc : toolCalls) {
                        String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
                        fixContent.append("\n  - 待执行的操作: ").append(toolName);
                    }
                    msg.setContent("[会话中断] 检测到未完成的工具调用：" + fixContent.toString());
                }
                msg.setToolCalls(null);
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

                if (msg.getContent() == null || msg.getContent().isBlank()) {
                    StringBuilder fixContent = new StringBuilder();
                    for (ToolCall tc : toolCalls) {
                        String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
                        fixContent.append("\n  - 待执行的操作: ").append(toolName);
                    }
                    msg.setContent("[会话中断] 检测到未完成的工具调用：" + fixContent.toString());
                }
                msg.setToolCalls(null);
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
        }
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
}
