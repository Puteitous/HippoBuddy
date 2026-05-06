package com.example.agent.execute;

import com.example.agent.application.ConversationService;
import com.example.agent.console.AgentUi;
import com.example.agent.console.ConsoleStyle;
import com.example.agent.console.InputHandler;
import com.example.agent.core.AgentContext;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.exception.LlmApiException;
import com.example.agent.llm.exception.LlmConnectionException;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.exception.LlmTimeoutException;
import com.example.agent.logging.ConversationLogger;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimator;
import com.example.agent.session.SessionData;
import com.example.agent.session.SessionStorage;
import org.jline.reader.UserInterruptException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

import java.nio.file.Path;
import java.time.format.DateTimeFormatter;
import java.util.List;

public class ConversationLoop {

    private static final Logger logger = LoggerFactory.getLogger(ConversationLoop.class);
    private static final int MAX_EMPTY_RESPONSE_RETRIES = 3;
    private static final int DEFAULT_MAX_TURNS_PER_SESSION = 50;

    private final List<StopHook> stopHooks = List.of(
        new RepetitionPatternHook(),
        new TaskCompletionHook()
    );

    private final AgentContext context;
    private final AgentTurnExecutor turnExecutor;
    private final ConversationService conversationService;
    private final Conversation conversation;
    private final TokenEstimator tokenEstimator;
    private final InputHandler inputHandler;
    private final AgentUi ui;
    private final SessionStorage sessionStorage;

    private int conversationRound = 1;
    private String currentSessionId;
    private ConversationLogger conversationLogger;
    private volatile boolean processing = false;

    public ConversationLoop(AgentContext context, AgentTurnExecutor turnExecutor,
                            InputHandler inputHandler, AgentUi ui) {
        this(context, turnExecutor, inputHandler, ui, null);
    }

    public ConversationLoop(AgentContext context, AgentTurnExecutor turnExecutor,
                            InputHandler inputHandler, AgentUi ui,
                            SessionStorage sessionStorage) {
        this.context = context;
        this.turnExecutor = turnExecutor;
        this.conversationService = context.getConversationService();
        this.conversation = context.getConversation();
        this.tokenEstimator = context.getTokenEstimator();
        this.inputHandler = inputHandler;
        this.ui = ui;
        this.sessionStorage = sessionStorage != null ? sessionStorage : new SessionStorage();
    }

    private void ensureConversationInitialized() {
        boolean managerWasReset = conversationService.getMessageCount(conversation) == 1 
                && conversationService.getHistory(conversation).get(0).isSystem();
        
        if (currentSessionId == null || conversationLogger == null || managerWasReset) {
            startNewConversation();
        }
    }

    public void startNewConversation() {
        conversationRound = 1;
        conversationService.reset(conversation);
        conversationService.ensureSessionComponents(conversation);
        String sessionId = conversation.getSessionId();
        currentSessionId = sessionId;
        context.setSessionId(sessionId);
        conversationService.registerConversation(sessionId, conversation);

        MDC.put("sessionId", sessionId.substring(0, Math.min(12, sessionId.length())));
        Path logFile = WorkspaceManager.getSessionLogFile(
            WorkspaceManager.getCurrentProjectKey(), sessionId
        );
        conversationLogger = new ConversationLogger(sessionId, logFile);
        logger.info("新会话已启动: {}", sessionId);
    }

    public void processUserInput(String userInput) {
        if (userInput == null || userInput.isBlank()) {
            return;
        }

        processing = true;
        turnExecutor.setInterrupted(false);

        ensureConversationInitialized();
        MDC.put("turn", String.valueOf(conversationRound));

        int inputTokens = tokenEstimator.estimateTextTokens(userInput);
        if (inputTokens > inputHandler.getMaxInputTokens()) {
            userInput = inputHandler.handleLongInput(userInput, inputTokens);
            if (userInput == null) {
                conversationRound--;
                return;
            }
        }

        conversationLogger.logUserInput(userInput, inputTokens);

        conversationService.addUserMessage(conversation, userInput);

        // ✅ 四层架构：Conversation 自动压缩处理
        //    - 90% → ContextClipper 零成本裁剪
        //    - 95% → LLM 深度摘要
        //    - 压缩仅在工作窗口执行，真相源永不删除

        ui.println();
        ui.println(ConsoleStyle.conversationDivider(conversationRound));
        ui.println();
        ui.println(ConsoleStyle.userLabel() + ": " + ConsoleStyle.white(userInput));
        ui.println();

        try {

            processAgentLoop();

        } finally {
            conversationRound++;
            processing = false;
            MDC.clear();
        }
    }

    public boolean isProcessing() {
        return processing;
    }

    private void processAgentLoop() {
        int emptyResponseRetries = 0;
        boolean completed = false;

        try {
            while (!turnExecutor.isInterrupted()) {
                if (conversationRound > DEFAULT_MAX_TURNS_PER_SESSION) {
                    ui.println(ConsoleStyle.red("  └─ 达到最大轮次限制 (" + DEFAULT_MAX_TURNS_PER_SESSION + ")，强制终止"));
                    logger.warn("会话达到最大轮次限制: {}", DEFAULT_MAX_TURNS_PER_SESSION);
                    break;
                }

                try {
                    AgentTurnResult result = turnExecutor.execute(conversationLogger, currentSessionId);

                    if (result == AgentTurnResult.EMPTY_RESPONSE) {
                        emptyResponseRetries++;
                        if (emptyResponseRetries < MAX_EMPTY_RESPONSE_RETRIES) {
                            ui.println(ConsoleStyle.gray("  │"));
                            ui.println(ConsoleStyle.yellow("  │  检测到空响应，正在重试 (" + emptyResponseRetries + "/" + MAX_EMPTY_RESPONSE_RETRIES + ")..."));
                            ui.println(ConsoleStyle.gray("  │"));
                            continue;
                        } else {
                            ui.println(ConsoleStyle.gray("  │"));
                            ui.println(ConsoleStyle.yellow("  └─ AI 多次返回空响应，请尝试重新描述您的需求。"));
                            ui.println();
                            break;
                        }
                    }

                    emptyResponseRetries = 0;

                    if (result == null || result == AgentTurnResult.DONE || result == AgentTurnResult.ERROR) {
                        completed = (result == AgentTurnResult.DONE);
                        break;
                    }

                    StopHook.StopHookResult hookResult = evaluateStopHooks(result);
                    if (hookResult.isShouldStop()) {
                        ui.println(ConsoleStyle.gray("  │"));
                        ui.println(ConsoleStyle.red("  └─ " + hookResult.getReason()));
                        logger.warn("StopHook 触发强制终止: {}", hookResult.getReason());
                        completed = false;
                        break;
                    } else if (hookResult.isWarning()) {
                        ui.println(ConsoleStyle.gray("  │"));
                        ui.println(ConsoleStyle.yellow("  ├─ " + hookResult.getReason()));
                        ui.println(ConsoleStyle.gray("  │"));
                        logger.warn("StopHook 发送停滞警告: {}", hookResult.getReason());
                    }

                } catch (LlmException e) {
                    handleApiError(e);
                    break;
                } catch (RuntimeException e) {
                    if ("Interrupted".equals(e.getMessage())) {
                        throw new UserInterruptException("User interrupted");
                    }
                    ui.println();
                    ui.println(ConsoleStyle.gray("  │"));
                    ui.println(ConsoleStyle.gray("  └─ ") + ConsoleStyle.red("处理错误: " + e.getMessage()));
                    logger.error("处理用户输入时发生RuntimeException", e);
                    break;
                } catch (Exception e) {
                    ui.println();
                    ui.println(ConsoleStyle.gray("  │"));
                    ui.println(ConsoleStyle.gray("  └─ ") + ConsoleStyle.red("处理错误: " + e.getMessage()));
                    logger.error("处理用户输入时发生异常", e);
                    break;
                }
            }
        } finally {
            saveSession(completed);
            
            if (conversationLogger != null) {
                if (completed) {
                    conversationLogger.logSummary();
                } else {
                    conversationLogger.logInterruptedSummary();
                }
            }
            
            if (context.getConfig().getUi().isShowTokenUsage()) {
                printContextProgressBar();
            }
        }
    }

    private void printContextProgressBar() {
        int currentTokens;
        boolean isEstimated = false;
        
        if (conversation.hasKnownUsage()) {
            currentTokens = conversation.getLastKnownTotalTokens();
        } else {
            List<Message> fullContext = conversationService.prepareForInference(conversation);
            int messageTokens = tokenEstimator.estimateConversationTokens(fullContext);
            int toolDefinitionOverhead = 2400;
            currentTokens = messageTokens + toolDefinitionOverhead;
            isEstimated = true;
        }
        
        int maxTokens = context.getConfig().getContext().getMaxTokens();
        double ratio = (double) currentTokens / maxTokens;
        
        int percent = (int) (ratio * 100);
        String bar = ConsoleStyle.progressBar(ratio, 20);
        
        String status;
        if (ratio < 0.7) {
            status = "✓ 正常";
        } else if (ratio < 0.85) {
            status = "⚡ 良好";
        } else if (ratio < 0.95) {
            status = "⚠️ 警告";
        } else {
            status = "🔄 压缩中";
        }
        
        String label = ConsoleStyle.gray("上下文: ");
        String accuracyMark = isEstimated ? ConsoleStyle.gray("~") : ConsoleStyle.green("✓");
        String tokenInfo = ConsoleStyle.gray(String.format(" %,d/%,d tokens (%d%%) ", 
            currentTokens, maxTokens, percent));
        
        ui.println();
        ui.println(accuracyMark + " " + label + bar + tokenInfo + ConsoleStyle.gray(status));
        ui.println();
    }

    private void saveSession(boolean completed) {
        if (sessionStorage == null) {
            return;
        }
        
        if (context == null || context.getConfig() == null || 
            context.getConfig().getSession() == null ||
            !context.getConfig().getSession().isPersistSessions()) {
            return;
        }
        
        try {
            SessionData.Status status = completed ? SessionData.Status.COMPLETED : SessionData.Status.INTERRUPTED;
            SessionData sessionData = conversationService.exportSession(conversation, currentSessionId, status);
            SessionData saved = sessionStorage.saveSession(sessionData);
            
            if (saved != null) {
                logger.debug("会话已保存: {}, 状态: {}", currentSessionId, status);
            } else {
                ui.println();
                ui.println(ConsoleStyle.yellow("  ⚠ 会话保存失败，历史记录可能丢失"));
                ui.println(ConsoleStyle.gray("    提示: 请检查磁盘空间或会话存储目录权限"));
                ui.println();
                logger.warn("会话保存失败: {}", currentSessionId);
            }
        } catch (Exception e) {
            logger.warn("保存会话失败: {}", e.getMessage());
            ui.println();
            ui.println(ConsoleStyle.yellow("  ⚠ 会话保存失败: " + e.getMessage()));
            ui.println(ConsoleStyle.gray("    提示: 请检查磁盘空间或会话存储目录权限"));
            ui.println();
        }
    }

    private void handleApiError(LlmException e) throws UserInterruptException {
        String message = e.getMessage();
        if (message != null && message.contains("Interrupted")) {
            ui.println();
            ui.println(ConsoleStyle.yellow("用户已终止对话"));
            ui.println();
            throw new UserInterruptException("User interrupted");
        }

        ui.println();
        ui.println(ConsoleStyle.red("╔══════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.red("║                  API 调用失败                    ║"));
        ui.println(ConsoleStyle.red("╚══════════════════════════════════════════════════╝"));
        ui.println();
        ui.println(ConsoleStyle.red("错误信息: " + e.getMessage()));
        ui.println();

        if (isRetryableError(e)) {
            ui.println(ConsoleStyle.yellow("您可以:"));
            ui.println(ConsoleStyle.gray("  1. 输入 'retry' 重试"));
            ui.println(ConsoleStyle.gray("  2. 输入 'reset' 重置会话"));
            ui.println(ConsoleStyle.gray("  3. 输入 'config' 检查配置"));
            ui.println(ConsoleStyle.gray("  4. 继续输入其他内容"));
            ui.println();
        }
    }

    private boolean isRetryableError(LlmException e) {
        if (e instanceof LlmTimeoutException) {
            return true;
        }

        if (e instanceof LlmConnectionException) {
            return true;
        }

        if (e instanceof LlmApiException) {
            LlmApiException apiException = (LlmApiException) e;
            return apiException.isServerError() || apiException.isRateLimited();
        }

        return false;
    }

    public void interrupt() {
        turnExecutor.setInterrupted(true);
    }

    public String getCurrentSessionId() {
        return currentSessionId;
    }

    public SessionStorage getSessionStorage() {
        return sessionStorage;
    }

    public void resumeSession(SessionData session) {
        if (session == null) {
            return;
        }
        
        String sessionId = session.getSessionId();
        
        ConversationService.ResumeResult resumeResult = conversationService.resumeConversation(conversation, sessionId);
        
        if (!resumeResult.isResumed()) {
            conversationService.importSession(conversation, session);
        }
        
        currentSessionId = sessionId;
        context.setSessionId(sessionId);
        conversationRound = countUserMessages(conversationService.getHistory(conversation));
        
        MDC.put("sessionId", sessionId.substring(0, Math.min(12, sessionId.length())));
        Path logFile = WorkspaceManager.getSessionLogFile(
            WorkspaceManager.getCurrentProjectKey(), sessionId
        );
        conversationLogger = new ConversationLogger(sessionId, logFile);
        
        logger.info("恢复会话: {}, {} 轮对话, mode={}", sessionId, conversationRound, resumeResult.getStatus());
    }

    private StopHook.StopHookResult evaluateStopHooks(AgentTurnResult result) {
        List<Message> recentMessages = conversationService.getHistory(conversation);
        StopHook.StopHookContext context = new StopHook.StopHookContext(
            conversation, recentMessages, conversationRound, result
        );

        for (StopHook hook : stopHooks) {
            StopHook.StopHookResult hookResult = hook.evaluate(context);
            if (hookResult.isShouldStop()) {
                return hookResult;
            }
        }

        return StopHook.StopHookResult.continueExecution();
    }

    private int countUserMessages(List<Message> messages) {
        int count = 0;
        for (Message msg : messages) {
            if (msg.isUser()) {
                count++;
            }
        }
        return Math.max(1, count);
    }
}
