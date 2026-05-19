package com.example.agent;

import com.example.agent.console.AgentUi;
import com.example.agent.console.CommandDispatcher;
import com.example.agent.console.InputHandler;
import com.example.agent.console.ConsoleStyle;
import com.example.agent.core.AgentContext;
import com.example.agent.core.concurrency.GracefulShutdown;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.execute.AgentTurnExecutor;
import com.example.agent.execute.ConversationLoop;
import com.example.agent.execute.ToolCallProcessor;
import com.example.agent.logging.WorkspaceManager;

import com.example.agent.service.TokenEstimator;
import com.example.agent.session.SessionData;
import com.example.agent.session.SessionStorage;
import com.example.agent.session.SessionStorageFactory;
import com.example.agent.session.TranscriptLister;
import com.example.agent.session.TranscriptLoader;
import org.jline.reader.EndOfFileException;
import org.jline.reader.LineReader;
import org.jline.reader.UserInterruptException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.PrintStream;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

public class AgentApplication {

    private static final Logger logger = LoggerFactory.getLogger(AgentApplication.class);



    public static void main(String[] args) {
        System.setOut(new PrintStream(System.out, true, StandardCharsets.UTF_8));
        AgentApplication app = new AgentApplication();
        app.run();
    }

    public void run() {
        ServiceLocator.clear();
        AgentContext context = null;
        try {
            context = new AgentContext();

            registerShutdownHook(context);

            context.initialize();

            runTranscriptHealthCheck();

            AgentUi ui = new AgentUi(context.getTerminal(), context.getConfig());
            ServiceLocator.registerSingleton(AgentUi.class, ui);
            ServiceLocator.registerSingleton(LineReader.class, context.getReader());
            ServiceLocator.freeze();
            logger.info("DI 容器已冻结，后续 registerSingleton 调用将抛出异常");
            
            // ✅ 初始化 Terminal 状态栏标题
            ui.updateTerminalTitle(context.getCurrentMode());
            
            TokenEstimator tokenEstimator = context.getTokenEstimator();
            InputHandler inputHandler = new InputHandler(context.getReader(), tokenEstimator);
            
            SessionStorage sessionStorage = SessionStorageFactory.create(context.getConfig().getSession());

            if (context.getConfig().getSession().isEnableBackgroundCleanup()) {
                sessionStorage.startBackgroundCleanup();
            }

            CommandDispatcher dispatcher = new CommandDispatcher(context, ui, inputHandler, sessionStorage);

            if (!dispatcher.validateConfig()) {
                return;
            }

            ToolCallProcessor toolCallProcessor = new ToolCallProcessor(
                    context,
                    context.getConcurrentToolExecutor(),
                    context.getConversationService(),
                    context.getConversation(),
                    ui
            );

            AgentTurnExecutor turnExecutor = new AgentTurnExecutor(context, toolCallProcessor, ui);

            ConversationLoop conversationLoop = new ConversationLoop(
                    context, turnExecutor, inputHandler, ui,
                    sessionStorage
            );

            final AgentContext finalContext = context;
            final AgentUi finalUi = ui;
            final ConversationLoop finalLoop = conversationLoop;

            context.getTerminal().handle(org.jline.terminal.Terminal.Signal.INT, signal -> {
                if (!finalLoop.isProcessing()) {
                    finalUi.printCtrlC();
                    System.exit(0);
                } else {
                    finalUi.println("\n🛑 正在中断当前任务，请稍候...");
                    finalLoop.interrupt();
                }
            });

            ui.printWelcome();
            
            if (context.getConfig().getSession().isAutoResume()) {
                checkAndPromptResume(ui, sessionStorage, conversationLoop, inputHandler);
            }

            while (true) {
                try {
                    String line = inputHandler.readLineWithPasteDetection(ConsoleStyle.prompt());

                    CommandDispatcher.CommandResult result = dispatcher.dispatch(line);

                    if (result.getType() == CommandDispatcher.CommandResult.Type.EXIT) {
                        break;
                    }

                    if (result.getType() == CommandDispatcher.CommandResult.Type.CONTINUE) {
                        continue;
                    }

                    if (result.getType() == CommandDispatcher.CommandResult.Type.RESUME_SESSION) {
                        SessionData session = result.getSessionToResume();
                        if (session != null) {
                            conversationLoop.resumeSession(session);
                            dispatcher.setCurrentSessionId(session.getSessionId());
                        }
                        continue;
                    }

                    if (result.getType() == CommandDispatcher.CommandResult.Type.PROCESS_INPUT) {
                        String actualInput = result.getInput();
                        conversationLoop.processUserInput(actualInput);
                        dispatcher.setCurrentSessionId(conversationLoop.getCurrentSessionId());
                    }

                } catch (UserInterruptException e) {
                    if (turnExecutor.isInterrupted()) {
                        ui.printInterrupted();
                        turnExecutor.setInterrupted(false);
                    } else {
                        ui.printCtrlC();
                        ui.printGoodbye();
                        break;
                    }
                } catch (EndOfFileException e) {
                    ui.printGoodbye();
                    break;
                } catch (IllegalStateException e) {
                    break;
                }
            }

        } catch (IOException e) {
            logger.error("终端错误: {}", e.getMessage());
        } finally {
            if (context != null) {
                try {
                    context.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private void checkAndPromptResume(AgentUi ui, SessionStorage sessionStorage, 
                                       ConversationLoop conversationLoop, InputHandler inputHandler) {
        sessionStorage.cleanupExpiredSessions(72);
        
        Optional<SessionData> latestSession = sessionStorage.findLatestResumableSession();
        
        if (!latestSession.isPresent()) {
            return;
        }
        
        SessionData session = latestSession.get();
        
        ui.println();
        ui.println(ConsoleStyle.yellow("╔══════════════════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.yellow("║                  🔄 检测到未完成的会话                        ║"));
        ui.println(ConsoleStyle.yellow("╠══════════════════════════════════════════════════════════════╣"));
        
        String shortId = session.getSessionId().substring(0, Math.min(12, session.getSessionId().length()));
        String time = session.getLastActiveAt().format(DateTimeFormatter.ofPattern("MM-dd HH:mm"));
        
        ui.println(ConsoleStyle.yellow("║") + 
            String.format("  会话: %-52s", shortId) + 
            ConsoleStyle.yellow("║"));
        ui.println(ConsoleStyle.yellow("║") + 
            String.format("  时间: %-52s", time) + 
            ConsoleStyle.yellow("║"));
        ui.println(ConsoleStyle.yellow("║") + 
            String.format("  消息: %-52d", session.getMessageCount()) + 
            ConsoleStyle.yellow("║"));
        
        String preview = session.getLastUserMessage();
        if (preview != null) {
            if (preview.length() > 40) {
                preview = preview.substring(0, 40) + "...";
            }
            ui.println(ConsoleStyle.yellow("║") + 
                String.format("  预览: %-52s", preview) + 
                ConsoleStyle.yellow("║"));
        }
        
        String toolCalls = session.getLastToolCalls();
        if (toolCalls != null && !toolCalls.isEmpty()) {
            ui.println(ConsoleStyle.yellow("║") + 
                String.format("  待执行: %-50s", toolCalls) + 
                ConsoleStyle.yellow("║"));
        }
        
        ui.println(ConsoleStyle.yellow("╚══════════════════════════════════════════════════════════════╝"));
        ui.println();
        ui.println(ConsoleStyle.gray("是否恢复该会话？(y/n，默认 n): "));
        
        try {
            String response = inputHandler.readLine("").trim();
            if ("y".equalsIgnoreCase(response) || "yes".equalsIgnoreCase(response)) {
                conversationLoop.resumeSession(session);
            } else {
                sessionStorage.markAsIgnored(session.getSessionId());
                conversationLoop.startNewConversation();
                ui.println(ConsoleStyle.gray("开始新会话..."));
                ui.println();
            }
        } catch (Exception e) {
            sessionStorage.markAsIgnored(session.getSessionId());
            conversationLoop.startNewConversation();
            ui.println(ConsoleStyle.gray("开始新会话..."));
            ui.println();
        }
    }

    private void registerShutdownHook(AgentContext context) {
        final AgentContext finalContext = context;
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            String osName = ManagementFactory.getRuntimeMXBean().getName();
            long pid = Long.parseLong(osName.split("@")[0]);
            logger.info("Agent 正在退出 (PID: {} 正在清理资源...", pid);

            try {
                finalContext.close();
            } catch (Exception ignored) {
            }

            GracefulShutdown.shutdownAll();

            try {
                Thread.sleep(100);
            } catch (InterruptedException ignored) {
            }
        }, "agent-shutdown-hook"));

        logger.debug("ShutdownHook 已注册");
    }

    private static void runTranscriptHealthCheck() {
        try {
            logger.info("🔍 启动 Transcript 健康检查...");
            
            int repairedCount = 0;
            var sessions = TranscriptLister.listSessions();
            
            for (var session : sessions) {
                if (session.isHasCrashMarker()) {
                    try {
                        Path transcriptFile = WorkspaceManager.getSessionMessagesFile(
                            WorkspaceManager.getCurrentProjectKey(),
                            session.getSessionId()
                        );
                        int lines = TranscriptLoader.repairAndCompact(transcriptFile);
                        if (lines > 0) {
                            repairedCount++;
                            logger.warn("🛠️  修复会话 {}: 移除了 {} 损坏行", 
                                session.getSessionId(), lines);
                        }
                    } catch (Exception e) {
                        logger.debug("修复会话失败: {}", session.getSessionId(), e);
                    }
                }
            }
            
            if (repairedCount > 0) {
                logger.info("✅ Transcript 健康检查完成: 修复了 {} 个会话", repairedCount);
            } else {
                logger.info("✅ Transcript 健康检查完成: 所有会话状态良好");
            }
            
        } catch (Exception e) {
            logger.warn("Transcript 健康检查失败，继续启动", e);
        }
    }
}
