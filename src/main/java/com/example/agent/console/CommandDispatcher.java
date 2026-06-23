package com.example.agent.console;

import com.example.agent.config.Config;
import com.example.agent.context.ManualCompactor;
import com.example.agent.core.AgentContext;
import com.example.agent.domain.rule.RuleLoader;
import com.example.agent.domain.rule.RuleManager;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.TokenMetricsCollector;
import com.example.agent.mcp.McpServiceManager;
import com.example.agent.mcp.client.McpClient;
import com.example.agent.mcp.config.McpConfig;
import com.example.agent.mcp.model.McpTool;
import com.example.agent.application.ConversationService;
import com.example.agent.domain.conversation.Conversation;

import java.util.concurrent.TimeUnit;
import com.example.agent.session.SessionData;
import com.example.agent.session.SessionStorage;
import org.jline.reader.EndOfFileException;
import org.jline.reader.UserInterruptException;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Scanner;
import java.util.function.Consumer;



public class CommandDispatcher {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("MM-dd HH:mm");

    public static class CommandResult {
        public enum Type {
            CONTINUE,
            EXIT,
            PROCESS_INPUT,
            RESUME_SESSION
        }
        
        private final Type type;
        private final String input;
        private final SessionData sessionToResume;
        
        private CommandResult(Type type, String input) {
            this(type, input, null);
        }
        
        private CommandResult(Type type, String input, SessionData session) {
            this.type = type;
            this.input = input;
            this.sessionToResume = session;
        }
        
        public static CommandResult continueExecution() {
            return new CommandResult(Type.CONTINUE, null);
        }
        
        public static CommandResult exit() {
            return new CommandResult(Type.EXIT, null);
        }
        
        public static CommandResult processInput(String input) {
            return new CommandResult(Type.PROCESS_INPUT, input);
        }
        
        public static CommandResult resumeSession(SessionData session) {
            return new CommandResult(Type.RESUME_SESSION, null, session);
        }
        
        public Type getType() {
            return type;
        }
        
        public String getInput() {
            return input;
        }
        
        public SessionData getSessionToResume() {
            return sessionToResume;
        }
    }

    private final AgentUi ui;
    private final Config config;
    private final AgentContext context;
    private final InputHandler inputHandler;
    private final ConversationService conversationService;
    private final Conversation conversation;
    private final TokenMetricsCollector tokenMetricsCollector;
    private final SessionStorage sessionStorage;
    private final McpServiceManager mcpServiceManager;
    private String currentSessionId;

    public CommandDispatcher(AgentContext context, AgentUi ui, InputHandler inputHandler) {
        this.ui = ui;
        this.config = context.getConfig();
        this.context = context;
        this.inputHandler = inputHandler;
        this.conversationService = context.getConversationService();
        this.conversation = context.getConversation();
        this.tokenMetricsCollector = context.getTokenMetricsCollector();
        this.sessionStorage = new SessionStorage();
        this.mcpServiceManager = context.getMcpServiceManager();
    }

    public CommandDispatcher(AgentContext context, AgentUi ui, InputHandler inputHandler, SessionStorage sessionStorage) {
        this.ui = ui;
        this.config = context.getConfig();
        this.context = context;
        this.inputHandler = inputHandler;
        this.conversationService = context.getConversationService();
        this.conversation = context.getConversation();
        this.tokenMetricsCollector = context.getTokenMetricsCollector();
        this.sessionStorage = sessionStorage;
        this.mcpServiceManager = context.getMcpServiceManager();
    }

    public CommandResult dispatch(String line) throws UserInterruptException, EndOfFileException {
        if (line == null) {
            return CommandResult.continueExecution();
        }
        
        line = line.trim();

        if (line.isEmpty()) {
            return CommandResult.continueExecution();
        }

        if ("exit".equalsIgnoreCase(line) || "quit".equalsIgnoreCase(line)) {
            ui.printGoodbye();
            return CommandResult.exit();
        }

        if ("help".equalsIgnoreCase(line)) {
            ui.printHelp();
            return CommandResult.continueExecution();
        }

        if ("clear".equalsIgnoreCase(line)) {
            ui.clearScreen();
            return CommandResult.continueExecution();
        }

        if ("reset".equalsIgnoreCase(line)) {
            conversationService.reset(conversation);
            com.example.agent.progress.SpinnerManager.getInstance().clear();
            ui.println(ConsoleStyle.success("会话已重置"));
            ui.println();
            return CommandResult.continueExecution();
        }

        if ("/rules".equalsIgnoreCase(line)) {
            handleShowRules();
            return CommandResult.continueExecution();
        }

        if ("/reload".equalsIgnoreCase(line)) {
            handleReloadRules();
            return CommandResult.continueExecution();
        }

        if ("config".equalsIgnoreCase(line)) {
            ui.printConfig();
            return CommandResult.continueExecution();
        }

        if ("tokens".equalsIgnoreCase(line)) {
            printTokenDashboard();
            tokenMetricsCollector.printDailySummary();
            return CommandResult.continueExecution();
        }

        if ("showlog".equalsIgnoreCase(line)) {
            if (currentSessionId == null) {
                ui.println(ConsoleStyle.yellow("还没有对话记录"));
                ui.println(ConsoleStyle.gray("提示：开始一次对话后，可以使用 showlog 查看日志"));
                ui.println();
            } else {
                ui.showLastConversationLog(currentSessionId);
            }
            return CommandResult.continueExecution();
        }

        if ("sessions".equalsIgnoreCase(line)) {
            return handleListSessions();
        }

        if (line.toLowerCase().startsWith("resume")) {
            return handleResumeCommand(line);
        }

        if (line.toLowerCase().startsWith("delete-session")) {
            return handleDeleteSessionCommand(line);
        }

        if ("\"\"\"".equals(line) || "multi".equalsIgnoreCase(line)) {
            return handleMultilineInput();
        }

        if (line.toLowerCase().startsWith("/mcp")) {
            return handleMcpCommand(line);
        }

        if ("/chat".equalsIgnoreCase(line) || "/mode chat".equalsIgnoreCase(line)) {
            context.switchMode(com.example.agent.core.AgentMode.CHAT);
            ui.printModeInfo(context.getCurrentMode());
            return CommandResult.continueExecution();
        }

        if ("/coding".equalsIgnoreCase(line) || "/mode coding".equalsIgnoreCase(line)
                || "/builder".equalsIgnoreCase(line) || "/mode builder".equalsIgnoreCase(line)) {
            context.switchMode(com.example.agent.core.AgentMode.CODING);
            ui.printModeInfo(context.getCurrentMode());
            return CommandResult.continueExecution();
        }

        if ("/mode".equalsIgnoreCase(line)) {
            ui.printModeInfo(context.getCurrentMode());
            ui.println(ConsoleStyle.gray("  使用 /chat 切换到聊天模式， /builder 切换到构建模式"));
            ui.println();
            return CommandResult.continueExecution();
        }

        if (line.toLowerCase().startsWith("/compact")) {
            return handleCompactCommand(line);
        }

        return CommandResult.processInput(line);
    }

    private CommandResult handleCompactCommand(String line) {
        ui.println(ConsoleStyle.cyan("🗜️ 正在压缩上下文..."));
        ui.println();
        
        try {
            String userInstruction = null;
            int spaceIndex = line.indexOf(' ');
            if (spaceIndex > 0) {
                userInstruction = line.substring(spaceIndex).trim();
            }

            int maxTokens = context.getConfig().getLlm().getMaxTokens();
            ManualCompactor compactor = new ManualCompactor(
                context.getTokenEstimator(),
                context.getLlmClient()
            );

            var originalMessages = conversation.getMessages();
            int originalCount = originalMessages.size();
            int originalTokens = context.getTokenEstimator().estimateConversationTokens(originalMessages);
            
            var result = compactor.compact(originalMessages, userInstruction, maxTokens);

            conversation.replaceMessages(result.getMessages());

            int compactedCount = result.getMessages().size();
            int savedTokens = result.getSavedTokens();

            ui.println(ConsoleStyle.success("✅ 压缩完成!"));
            ui.println(ConsoleStyle.info("   算法: " + result.getMethod().getDisplayName()));
            ui.println(ConsoleStyle.info("   原消息数: " + originalCount));
            ui.println(ConsoleStyle.info("   压缩后: " + compactedCount));
            ui.println(ConsoleStyle.info("   减少: " + (originalCount - compactedCount) + " 条消息"));
            
            if (savedTokens > 0) {
                double savedPercent = savedTokens * 100.0 / Math.max(1, originalTokens);
                ui.println(ConsoleStyle.info(String.format("   释放: %d tokens (节省 %.1f%%)", 
                    savedTokens, savedPercent)));
            }
            
            ui.println(ConsoleStyle.gray("   " + result.getSummary()));
            ui.println();
        } catch (Exception e) {
            ui.println(ConsoleStyle.error("❌ 压缩失败: " + e.getMessage()));
            ui.println();
        }
        
        return CommandResult.continueExecution();
    }

    private void printTokenDashboard() {
        final int LINE_WIDTH = 58;
        ui.println();
        ui.println(ConsoleStyle.boldCyan("╔══════════════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.boldCyan("║                    📊 Token 仪表盘                      ║"));
        ui.println(ConsoleStyle.boldCyan("╠══════════════════════════════════════════════════════════╣"));
        
        int maxTokens = context.getConfig().getContext().getMaxTokens();
        String accuracyMark = ConsoleStyle.gray("~");
        int currentTokens;
        
        if (conversation.hasKnownUsage()) {
            accuracyMark = ConsoleStyle.green("✓");
            var usage = conversation.getLastKnownUsage();
            currentTokens = conversation.getLastKnownTotalTokens();
            
            int prompt = usage.getPromptTokens();
            int completion = usage.getCompletionTokens();
            
            double ratio = Math.min(1.0, (double) currentTokens / maxTokens);
            int percent = (int) (ratio * 100);
            String bar = ConsoleStyle.progressBar(ratio, 36);
            
            String line1 = "  " + accuracyMark + ConsoleStyle.gray("  当前上下文: ") + 
                String.format("%,d / %,d tokens", currentTokens, maxTokens);
            ui.println(ConsoleStyle.boldCyan("║") + line1 + pad(LINE_WIDTH - line1.length()) + ConsoleStyle.boldCyan("║"));
            
            String line2 = "     " + bar + String.format(" %d%%", percent);
            ui.println(ConsoleStyle.boldCyan("║") + line2 + pad(LINE_WIDTH - line2.length()) + ConsoleStyle.boldCyan("║"));
            
            String line3 = ConsoleStyle.gray("     ├─ Prompt:     ") + String.format("%,d", prompt);
            ui.println(ConsoleStyle.boldCyan("║") + line3 + pad(LINE_WIDTH - line3.length()) + ConsoleStyle.boldCyan("║"));
            String line4 = ConsoleStyle.gray("     └─ Completion: ") + String.format("%,d", completion);
            ui.println(ConsoleStyle.boldCyan("║") + line4 + pad(LINE_WIDTH - line4.length()) + ConsoleStyle.boldCyan("║"));
        } else {
            List<Message> fullContext = conversationService.prepareForInference(conversation);
            int messageTokens = context.getTokenEstimator().estimateConversationTokens(fullContext);
            currentTokens = messageTokens + 2400;
            
            double ratio = Math.min(1.0, (double) currentTokens / maxTokens);
            int percent = (int) (ratio * 100);
            String bar = ConsoleStyle.progressBar(ratio, 36);
            
            String line1 = "  " + accuracyMark + ConsoleStyle.gray("  当前上下文: ") + 
                String.format("%,d / %,d tokens", currentTokens, maxTokens);
            ui.println(ConsoleStyle.boldCyan("║") + line1 + pad(LINE_WIDTH - line1.length()) + ConsoleStyle.boldCyan("║"));
            
            String line2 = "     " + bar + String.format(" %d%%", percent);
            ui.println(ConsoleStyle.boldCyan("║") + line2 + pad(LINE_WIDTH - line2.length()) + ConsoleStyle.boldCyan("║"));
            
            String line3 = ConsoleStyle.gray("     (估算值，首轮回退模式)");
            ui.println(ConsoleStyle.boldCyan("║") + line3 + pad(LINE_WIDTH - line3.length()) + ConsoleStyle.boldCyan("║"));
        }
        
        var metrics = conversationService.getCompactionMetrics(conversation);
        if (metrics != null && metrics.getTotalCompactions() > 0) {
            ui.println(ConsoleStyle.boldCyan("╠══════════════════════════════════════════════════════════╣"));
            String header = ConsoleStyle.cyan("  🗜️  压缩统计");
            ui.println(ConsoleStyle.boldCyan("║") + header + pad(LINE_WIDTH - header.length()) + ConsoleStyle.boldCyan("║"));
            
            String stats = String.format("     滑动窗口 %d 次, LLM摘要 %d 次", 
                metrics.getSlidingWindowSuccess(), metrics.getLlmSummaryFallback());
            ui.println(ConsoleStyle.boldCyan("║") + stats + pad(LINE_WIDTH - stats.length()) + ConsoleStyle.boldCyan("║"));
        }
        
        ui.println(ConsoleStyle.boldCyan("╚══════════════════════════════════════════════════════════╝"));
        ui.println();
        ui.println(ConsoleStyle.gray("  ✓ = 真实值，来自 LLM 返回； ~ = 估算值"));
        ui.println();
    }
    
    private String pad(int spaces) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < spaces; i++) sb.append(' ');
        return sb.toString();
    }

    private CommandResult handleMultilineInput() {
        String multilineInput = inputHandler.readMultilineInput();
        if (multilineInput == null || multilineInput.trim().isEmpty()) {
            return CommandResult.continueExecution();
        }
        return CommandResult.processInput(multilineInput);
    }

    private CommandResult handleListSessions() {
        List<SessionData> sessions = sessionStorage.listSessions();
        
        if (sessions.isEmpty()) {
            ui.println(ConsoleStyle.yellow("没有保存的会话"));
            ui.println();
            return CommandResult.continueExecution();
        }
        
        ui.println(ConsoleStyle.cyan("╔══════════════════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.cyan("║                      📋 已保存的会话                          ║"));
        ui.println(ConsoleStyle.cyan("╠══════════════════════════════════════════════════════════════╣"));
        
        int index = 1;
        for (SessionData session : sessions) {
            String statusIcon = getStatusIcon(session.getStatus());
            String shortId = session.getSessionId().substring(0, Math.min(10, session.getSessionId().length()));
            String time = session.getLastActiveAt().format(TIME_FORMAT);
            
            String preview = session.getLastUserMessage();
            if (preview != null && preview.length() > 35) {
                preview = preview.substring(0, 35) + "...";
            } else if (preview == null) {
                preview = "(无预览)";
            }
            
            ui.println(ConsoleStyle.cyan("║") + 
                ConsoleStyle.bold(String.format(" %2d.", index++)) +
                String.format(" %s %-10s | %s | %d条", 
                    statusIcon, shortId, time, session.getMessageCount()) +
                ConsoleStyle.cyan("                    ║"));
            
            ui.println(ConsoleStyle.cyan("║") + 
                String.format("      %s", preview) +
                ConsoleStyle.cyan("                                          ").substring(0, Math.max(0, 50 - preview.length())) + 
                ConsoleStyle.cyan("║"));
            
            String toolCalls = session.getLastToolCalls();
            if (toolCalls != null && !toolCalls.isEmpty()) {
                String toolInfo = "工具: " + toolCalls;
                if (toolInfo.length() > 45) {
                    toolInfo = toolInfo.substring(0, 45) + "...";
                }
                ui.println(ConsoleStyle.cyan("║") + 
                    ConsoleStyle.yellow(String.format("      %s", toolInfo)) +
                    ConsoleStyle.cyan("                                          ").substring(0, Math.max(0, 50 - toolInfo.length())) + 
                    ConsoleStyle.cyan("║"));
            }
        }
        
        ui.println(ConsoleStyle.cyan("╚══════════════════════════════════════════════════════════════╝"));
        ui.println();
        ui.println(ConsoleStyle.gray("提示: 使用 'resume <序号>' 恢复会话，'delete-session <序号>' 删除会话"));
        ui.println();
        
        return CommandResult.continueExecution();
    }

    private CommandResult handleResumeCommand(String line) {
        String[] parts = line.split("\\s+", 2);
        
        if (parts.length < 2) {
            List<SessionData> sessions = sessionStorage.listResumableSessions();
            if (sessions.isEmpty()) {
                ui.println(ConsoleStyle.yellow("没有可恢复的会话"));
                ui.println();
                return CommandResult.continueExecution();
            }
            
            SessionData latest = sessions.get(0);
            ui.println(ConsoleStyle.green("将恢复最近的会话: " + latest.getSessionId()));
            ui.println(ConsoleStyle.gray("  消息数: " + latest.getMessageCount() + " | 状态: " + latest.getStatus()));
            ui.println();
            return CommandResult.resumeSession(latest);
        }
        
        String arg = parts[1].trim();
        List<SessionData> sessions = sessionStorage.listSessions();
        
        SessionData session = sessionStorage.loadSession(arg).orElse(null);
        
        if (session == null) {
            try {
                int index = Integer.parseInt(arg);
                
                if (index < 1 || index > sessions.size()) {
                    ui.println(ConsoleStyle.red("无效的会话序号/ID: " + arg));
                    ui.println();
                    return CommandResult.continueExecution();
                }
                
                session = sessions.get(index - 1);
            } catch (NumberFormatException e) {
                ui.println(ConsoleStyle.red("找不到会话: " + arg));
                ui.println();
                return CommandResult.continueExecution();
            }
        }
        
        if (!session.canResume()) {
            ui.println(ConsoleStyle.yellow("该会话已完成，无法恢复"));
            ui.println();
            return CommandResult.continueExecution();
        }
        
        return CommandResult.resumeSession(session);
    }

    private CommandResult handleDeleteSessionCommand(String line) {
        String[] parts = line.split("\\s+", 2);
        
        if (parts.length < 2) {
            ui.println(ConsoleStyle.yellow("用法: delete-session <序号或会话ID>"));
            ui.println();
            return CommandResult.continueExecution();
        }
        
        String arg = parts[1].trim();
        List<SessionData> sessions = sessionStorage.listSessions();
        
        boolean deleted = sessionStorage.deleteSession(arg);
        if (deleted) {
            ui.println(ConsoleStyle.green("会话已删除: " + arg));
            ui.println();
            return CommandResult.continueExecution();
        }
        
        try {
            int index = Integer.parseInt(arg);
            
            if (index < 1 || index > sessions.size()) {
                ui.println(ConsoleStyle.red("无效的会话序号/ID: " + arg));
                ui.println();
                return CommandResult.continueExecution();
            }
            
            SessionData session = sessions.get(index - 1);
            sessionStorage.deleteSession(session.getSessionId());
            ui.println(ConsoleStyle.green("已删除会话: " + session.getSessionId()));
            ui.println();
            return CommandResult.continueExecution();
            
        } catch (NumberFormatException e) {
            ui.println(ConsoleStyle.red("找不到会话: " + arg));
            ui.println();
            return CommandResult.continueExecution();
        }
    }

    private String getStatusIcon(SessionData.Status status) {
        switch (status) {
            case ACTIVE:
                return ConsoleStyle.green("●");
            case INTERRUPTED:
                return ConsoleStyle.yellow("○");
            case COMPLETED:
                return ConsoleStyle.gray("✓");
            default:
                return "?";
        }
    }

    private CommandResult handleMcpCommand(String line) {
        String[] parts = line.split("\\s+", 3);
        String subCommand = parts.length > 1 ? parts[1].toLowerCase() : "help";

        switch (subCommand) {
            case "list":
                printMcpServerList();
                break;
            case "tools":
                printMcpTools();
                break;
            case "resources":
                printMcpResources();
                break;
            case "read":
                if (parts.length < 3) {
                    ui.println(ConsoleStyle.yellow("用法: /mcp read <资源URI>"));
                } else {
                    readMcpResource(parts[2].trim());
                }
                break;
            case "prompts":
                printMcpPrompts();
                break;
            case "prompt":
                if (parts.length < 3) {
                    ui.println(ConsoleStyle.yellow("用法: /mcp prompt <提示词名称> [参数名=值...]"));
                } else {
                    renderMcpPrompt(parts[2].trim());
                }
                break;
            case "connect":
                if (parts.length < 3) {
                    ui.println(ConsoleStyle.yellow("用法: /mcp connect <serverId>"));
                } else {
                    connectMcpServer(parts[2].trim());
                }
                break;
            case "disconnect":
                if (parts.length < 3) {
                    ui.println(ConsoleStyle.yellow("用法: /mcp disconnect <serverId>"));
                } else {
                    disconnectMcpServer(parts[2].trim());
                }
                break;
            case "reconnect":
                if (parts.length < 3) {
                    ui.println(ConsoleStyle.yellow("用法: /mcp reconnect <serverId>"));
                } else {
                    reconnectMcpServer(parts[2].trim());
                }
                break;
            case "help":
            default:
                printMcpHelp();
                break;
        }
        ui.println();
        return CommandResult.continueExecution();
    }

    private void printMcpHelp() {
        ui.println(ConsoleStyle.cyan("╔═══════════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.cyan("║                  📡 MCP 服务命令                       ║"));
        ui.println(ConsoleStyle.cyan("╠═══════════════════════════════════════════════════════╣"));
        ui.println(ConsoleStyle.cyan("║  /mcp list          - 列出所有MCP服务器状态            ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp tools         - 列出所有已注册的MCP工具           ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp resources     - 列出所有可用的MCP资源            ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp read <uri>    - 读取指定资源内容                 ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp prompts       - 列出所有可用的MCP提示词           ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp prompt <name> - 渲染指定提示词(支持参数)          ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp connect <id>  - 连接指定的MCP服务器              ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp disconnect <id> - 断开指定的MCP服务器            ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp reconnect <id> - 重新连接指定的MCP服务器         ║"));
        ui.println(ConsoleStyle.cyan("║  /mcp help          - 显示此帮助信息                   ║"));
        ui.println(ConsoleStyle.cyan("╚═══════════════════════════════════════════════════════╝"));
    }

    private void printMcpTools() {
        List<McpClient> clients = mcpServiceManager.getActiveClients();

        ui.println(ConsoleStyle.cyan("╔══════════════════════════════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.cyan("║                           🔧 MCP 工具列表                                 ║"));
        ui.println(ConsoleStyle.cyan("╠══════════════════════════════════════════════════════════════════════════╣"));

        int count = 0;
        for (McpClient client : clients) {
            try {
                List<McpTool> tools = client.listTools().get(10, TimeUnit.SECONDS);
                if (!tools.isEmpty()) {
                    ui.println(ConsoleStyle.cyan("║ ") + ConsoleStyle.bold("[" + client.getServerId() + "]") + " " + client.getServerName());
                    for (McpTool tool : tools) {
                        String name = tool.getName();
                        String desc = tool.getDescription();
                        if (desc.length() > 45) desc = desc.substring(0, 45) + "...";
                        ui.println(String.format("║     %-20s %s", name, desc));
                        count++;
                    }
                    ui.println(ConsoleStyle.cyan("║                                                                      ║"));
                }
            } catch (Exception e) {
                ui.println(ConsoleStyle.yellow("║  获取工具列表失败: " + e.getMessage()));
            }
        }

        if (count == 0) {
            ui.println(ConsoleStyle.yellow("║  暂无可用工具，请先连接MCP服务器                                      ║"));
        } else {
            ui.println(String.format("║  总计: %d 个工具                                                     ║", count));
        }
        ui.println(ConsoleStyle.cyan("╚══════════════════════════════════════════════════════════════════════════╝"));
    }

    private void printMcpResources() {
        var resourceRegistry = mcpServiceManager.getResourceRegistry();
        var allResources = resourceRegistry.getAllResources();

        ui.println(ConsoleStyle.cyan("╔═══════════════════════════════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.cyan("║                           📄 MCP 资源列表                                  ║"));
        ui.println(ConsoleStyle.cyan("╠═══════════════════════════════════════════════════════════════════════════╣"));

        if (allResources.isEmpty()) {
            ui.println(ConsoleStyle.yellow("║  暂无可用资源，请先连接支持Resources的MCP服务器                          ║"));
        } else {
            for (var entry : allResources) {
                String serverId = entry.client().getServerId();
                String uri = entry.getFullUri();
                String name = entry.resource().getName();
                String desc = entry.resource().getDescription();
                if (desc == null) desc = "";
                if (desc.length() > 35) desc = desc.substring(0, 35) + "...";

                ui.println(String.format("║  [%s] %s",
                        ConsoleStyle.green(serverId),
                        uri));
                if (!desc.isEmpty()) {
                    ui.println(String.format("║        %s", desc));
                }
                ui.println(ConsoleStyle.cyan("║                                                                       ║"));
            }
            ui.println(String.format("║  总计: %d 个资源                                                      ║", allResources.size()));
        }
        ui.println(ConsoleStyle.cyan("╚═══════════════════════════════════════════════════════════════════════════╝"));
    }

    private void readMcpResource(String uri) {
        var resourceRegistry = mcpServiceManager.getResourceRegistry();

        try {
            ui.println(ConsoleStyle.cyan("读取资源: ") + uri);
            ui.println();
            String content = resourceRegistry.readResourceContent(uri);
            ui.println(ConsoleStyle.gray("────────────────────────────────────────────────────────"));
            ui.println(content);
            ui.println(ConsoleStyle.gray("────────────────────────────────────────────────────────"));
        } catch (Exception e) {
            ui.println(ConsoleStyle.red("读取资源失败: " + e.getMessage()));
        }
    }

    private void printMcpPrompts() {
        var promptRegistry = mcpServiceManager.getPromptRegistry();
        var allPrompts = promptRegistry.getAllPrompts();

        ui.println(ConsoleStyle.cyan("╔═══════════════════════════════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.cyan("║                           💡 MCP 提示词列表                                ║"));
        ui.println(ConsoleStyle.cyan("╠═══════════════════════════════════════════════════════════════════════════╣"));

        if (allPrompts.isEmpty()) {
            ui.println(ConsoleStyle.yellow("║  暂无可用提示词，请先连接支持Prompts的MCP服务器                          ║"));
        } else {
            for (var entry : allPrompts) {
                String serverId = entry.client().getServerId();
                String fullName = entry.getFullName();
                String desc = entry.prompt().getDescription();
                if (desc == null) desc = "";
                if (desc.length() > 40) desc = desc.substring(0, 40) + "...";

                ui.println(String.format("║  [%s] %s",
                        ConsoleStyle.cyan(serverId),
                        fullName));
                if (!desc.isEmpty()) {
                    ui.println(String.format("║        %s", desc));
                }
                if (!entry.prompt().getArguments().isEmpty()) {
                    ui.print("║        参数: ");
                    entry.prompt().getArguments().forEach(arg -> {
                        ui.print(ConsoleStyle.yellow(arg.getName()));
                        if (arg.isRequired()) ui.print("*");
                        ui.print(" ");
                    });
                    ui.println();
                }
                ui.println(ConsoleStyle.cyan("║                                                                       ║"));
            }
            ui.println(String.format("║  总计: %d 个提示词                                                    ║", allPrompts.size()));
        }
        ui.println(ConsoleStyle.cyan("╚═══════════════════════════════════════════════════════════════════════════╝"));
    }

    private void renderMcpPrompt(String argStr) {
        var promptRegistry = mcpServiceManager.getPromptRegistry();

        String[] parts = argStr.split("\\s+");
        String promptName = parts[0];
        java.util.Map<String, String> args = new java.util.HashMap<>();

        for (int i = 1; i < parts.length; i++) {
            String[] keyValue = parts[i].split("=", 2);
            if (keyValue.length == 2) {
                args.put(keyValue[0], keyValue[1]);
            }
        }

        try {
            ui.println(ConsoleStyle.cyan("渲染提示词: ") + promptName);
            if (!args.isEmpty()) {
                ui.println(ConsoleStyle.cyan("参数: ") + args);
            }
            ui.println();
            String content = promptRegistry.renderPromptAsText(promptName, args);
            ui.println(ConsoleStyle.gray("────────────────────────────────────────────────────────"));
            ui.println(content);
            ui.println(ConsoleStyle.gray("────────────────────────────────────────────────────────"));
        } catch (Exception e) {
            ui.println(ConsoleStyle.red("渲染提示词失败: " + e.getMessage()));
        }
    }

    private void printMcpServerList() {
        List<McpClient> clients = mcpServiceManager.getActiveClients();
        List<McpConfig.McpServerConfig> configuredServers = config.getMcp().getServers();

        ui.println(ConsoleStyle.cyan("╔═══════════════════════════════════════════════════════════════╗"));
        ui.println(ConsoleStyle.cyan("║                     📡 MCP 服务器列表                           ║"));
        ui.println(ConsoleStyle.cyan("╠═══════════════════════════════════════════════════════════════╣"));

        if (configuredServers == null || configuredServers.isEmpty()) {
            ui.println(ConsoleStyle.yellow("║  没有配置MCP服务器，请在config.yaml中配置                      ║"));
        } else {
            for (McpConfig.McpServerConfig server : configuredServers) {
                McpClient client = mcpServiceManager.getClient(server.getId());
                String status = client != null && client.isConnected()
                        ? ConsoleStyle.green("✓ 已连接")
                        : ConsoleStyle.gray("○ 未连接");
                String type = server.getType().toUpperCase();
                ui.println(String.format("║  %-12s %-8s %-18s %s    ║",
                        server.getId(),
                        type,
                        status,
                        server.getName()));
            }
        }

        ui.println(ConsoleStyle.cyan("╠═══════════════════════════════════════════════════════════════╣"));
        ui.println(String.format("║  总计: %d 个已配置, %d 个已连接                               ║",
                configuredServers != null ? configuredServers.size() : 0,
                clients.size()));
        ui.println(ConsoleStyle.cyan("╚═══════════════════════════════════════════════════════════════╝"));
    }

    private void connectMcpServer(String serverId) {
        McpConfig.McpServerConfig serverConfig = config.getMcp().getServers().stream()
                .filter(s -> serverId.equals(s.getId()))
                .findFirst()
                .orElse(null);

        if (serverConfig == null) {
            ui.println(ConsoleStyle.red("找不到MCP服务器: " + serverId));
            return;
        }

        if (mcpServiceManager.getClient(serverId) != null) {
            ui.println(ConsoleStyle.yellow("MCP服务器已连接: " + serverId));
            return;
        }

        ui.println(ConsoleStyle.cyan("正在连接MCP服务器: " + serverId + "..."));
        mcpServiceManager.connectServer(serverConfig);
        ui.println(ConsoleStyle.green("连接命令已发送，请稍候..."));
    }

    private void disconnectMcpServer(String serverId) {
        McpClient client = mcpServiceManager.getClient(serverId);
        if (client == null) {
            ui.println(ConsoleStyle.yellow("MCP服务器未连接: " + serverId));
            return;
        }

        ui.println(ConsoleStyle.cyan("正在断开MCP服务器: " + serverId + "..."));
        mcpServiceManager.disconnectServer(serverId);
        ui.println(ConsoleStyle.green("已断开MCP服务器: " + serverId));
    }

    private void reconnectMcpServer(String serverId) {
        ui.println(ConsoleStyle.cyan("正在重新连接MCP服务器: " + serverId + "..."));
        disconnectMcpServer(serverId);
        try {
            Thread.sleep(500);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        McpConfig.McpServerConfig serverConfig = config.getMcp().getServers().stream()
                .filter(s -> serverId.equals(s.getId()))
                .findFirst()
                .orElse(null);
        if (serverConfig != null) {
            mcpServiceManager.connectServer(serverConfig);
            ui.println(ConsoleStyle.green("重新连接命令已发送"));
        }
    }

    private void handleShowRules() {
        ui.println(ConsoleStyle.cyan("\n📚 已加载的规则文件:"));
        ui.println(ConsoleStyle.cyan("═══════════════════════════════════════"));
        
        java.util.List<java.nio.file.Path> ruleFiles = RuleLoader.findAllRuleFiles();
        
        ui.println(ConsoleStyle.cyan("\n📋 规则文件 (" + ruleFiles.size() + "):"));
        for (java.nio.file.Path file : ruleFiles) {
            ui.println("   - " + file.getFileName());
        }
        
        RuleManager ruleManager = context.getRuleManager();
        int totalTokens = ruleManager.getTotalTokens();
        ui.println(ConsoleStyle.cyan("\n💡 总计 Token: " + totalTokens));
        ui.println(ConsoleStyle.gray("\n提示: 编辑文件后执行 /reload 热重载"));
        ui.println(ConsoleStyle.cyan("═══════════════════════════════════════\n"));
    }
    
    private void handleReloadRules() {
        ui.println(ConsoleStyle.cyan("\n🔄 正在重新加载规则..."));
        
        RuleManager ruleManager = context.getRuleManager();
        ruleManager.reload();
        
        int ruleCount = RuleLoader.countRuleFiles();
        int totalTokens = ruleManager.getTotalTokens();
        
        ui.println(ConsoleStyle.success("✅ 重载完成!"));
        ui.println("   - 规则文件: " + ruleCount + " 个");
        ui.println("   - 总计 Token: " + totalTokens);
        ui.println();
    }

    public boolean validateConfig() {
        registerSubAgentEventListeners();

        if (config.getLlm().getApiKey() == null || config.getLlm().getApiKey().isEmpty()) {
            ui.printConfigValidationError();
            return false;
        }

        if ("your-api-key-here".equals(config.getLlm().getApiKey())) {
            ui.printDefaultApiKeyWarning();

            try {
                String input = System.console() != null
                        ? new String(System.console().readPassword())
                        : new Scanner(System.in).nextLine();

                if (input == null || !"y".equalsIgnoreCase(input.trim())) {
                    return false;
                }
            } catch (Exception e) {
                return false;
            }
        }

        return true;
    }

    public void setCurrentSessionId(String sessionId) {
        this.currentSessionId = sessionId;
    }

    public String getCurrentSessionId() {
        return currentSessionId;
    }

    private void registerSubAgentEventListeners() {
        com.example.agent.core.event.EventBus.subscribe(
            com.example.agent.subagent.event.SubAgentWaitingEvent.class,
            event -> {
                String deps = event.getDependsOn().stream()
                    .map(id -> id.length() > 4 ? id.substring(0, 4) : id)
                    .collect(java.util.stream.Collectors.joining(", "));
                String shortId = event.getTaskId().length() > 8
                    ? event.getTaskId().substring(0, 8)
                    : event.getTaskId();
                ui.println(ConsoleStyle.yellow("⏳ ") + shortId + "  → [" + deps + "]  等待依赖");
            }
        );

        com.example.agent.core.event.EventBus.subscribe(
            com.example.agent.subagent.event.SubAgentStartedEvent.class,
            event -> {
                String shortId = event.getTaskId().length() > 8
                    ? event.getTaskId().substring(0, 8)
                    : event.getTaskId();
                String shortDesc = event.getDescription().length() > 25
                    ? event.getDescription().substring(0, 25) + "..."
                    : event.getDescription();
                ui.println(ConsoleStyle.cyan("🔄 ") + shortId + "  " + String.format("%-28s", shortDesc) + "  执行中");
            }
        );

        com.example.agent.core.event.EventBus.subscribe(
            com.example.agent.subagent.event.SubAgentProgressEvent.class,
            event -> {
            }
        );

        com.example.agent.core.event.EventBus.subscribe(
            com.example.agent.subagent.event.SubAgentCompletedEvent.class,
            event -> {
                String shortId = event.getTaskId().length() > 8
                    ? event.getTaskId().substring(0, 8)
                    : event.getTaskId();
                String shortResult = event.getResult().length() > 28
                    ? event.getResult().substring(0, 28) + "..."
                    : event.getResult();
                String firstLine = shortResult.split("\n")[0];
                ui.println(ConsoleStyle.green("✅ ") + shortId + "  " + String.format("%-28s", firstLine) + "  完成");
                ui.printPrompt();
            }
        );

        com.example.agent.core.event.EventBus.subscribe(
            com.example.agent.subagent.event.SubAgentFailedEvent.class,
            event -> {
                String shortId = event.getTaskId().length() > 8
                    ? event.getTaskId().substring(0, 8)
                    : event.getTaskId();
                String error = event.getErrorMessage().length() > 28
                    ? event.getErrorMessage().substring(0, 28) + "..."
                    : event.getErrorMessage();
                ui.println(ConsoleStyle.red("❌ ") + shortId + "  " + String.format("%-28s", error) + "  失败");
                ui.printPrompt();
            }
        );
    }
}
