package com.example.agent.console;

import com.example.agent.config.Config;
import com.example.agent.core.AgentMode;
import com.example.agent.logging.WorkspaceManager;
import org.jline.terminal.Terminal;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

public class AgentUi {

    private final Terminal terminal;
    private final Config config;

    public AgentUi(Terminal terminal, Config config) {
        this.terminal = Objects.requireNonNull(terminal, "terminal cannot be null");
        this.config = Objects.requireNonNull(config, "config cannot be null");
    }

    public void updateTerminalTitle(AgentMode mode) {
        String title = String.format("[%s %s] HippoBuddy", mode.getIcon(), mode.getDisplayName());
        terminal.writer().print("\033]0;" + title + "\007");
        terminal.writer().flush();
    }

    public void printWelcome() {
        println();
        println(ConsoleStyle.boldCyan("╔═════════════════════════════════════════════╗"));
        println(ConsoleStyle.boldCyan("║       HippoBuddy - AI 编程助手               ║"));
        println(ConsoleStyle.boldCyan("╚═════════════════════════════════════════════╝"));
        println();
        printModeInfo(AgentMode.CODING);
        println(ConsoleStyle.info("模型: " + config.getLlm().getModel()));
        println(ConsoleStyle.info("API: " + config.getLlm().getBaseUrl()));
        println();
        println(ConsoleStyle.bold("快捷命令:"));
        println(ConsoleStyle.green("  /chat    ") + ConsoleStyle.gray(" - 切换到聊天模式（只读探索）"));
        println(ConsoleStyle.cyan("  /builder ") + ConsoleStyle.gray(" - 切换到构建模式（全权限执行）"));
        println(ConsoleStyle.gray("  /coding  ") + ConsoleStyle.gray(" - 同上，兼容旧命令"));
        println(ConsoleStyle.yellow("  Ctrl+B    ") + ConsoleStyle.gray(" - 快速切换两种模式✨"));
        println(ConsoleStyle.gray("  /mode    ") + ConsoleStyle.gray(" - 查看当前模式"));
        println(ConsoleStyle.green("  help     ") + ConsoleStyle.gray(" - 显示帮助"));
        println(ConsoleStyle.green("  multi    ") + ConsoleStyle.gray(" - 多行输入模式（粘贴代码/日志）"));
        println(ConsoleStyle.green("  reset    ") + ConsoleStyle.gray(" - 重置会话"));
        println(ConsoleStyle.cyan("  /compact ") + ConsoleStyle.gray(" - 手动压缩上下文历史"));
        println(ConsoleStyle.blue("  /mcp     ") + ConsoleStyle.gray(" - MCP服务管理"));
        println(ConsoleStyle.green("  exit     ") + ConsoleStyle.gray(" - 退出程序"));
        println();
        
        if (config.getMcp().isEnabled()) {
            int serverCount = config.getMcp().getServers() != null ? config.getMcp().getServers().size() : 0;
            println(ConsoleStyle.boldBlue(" MCP 服务: ") + ConsoleStyle.info(serverCount + " 个服务器已配置"));
            if (serverCount > 0) {
                println(ConsoleStyle.gray("        正在后台连接中，输入 /mcp list 查看状态"));
            }
            println();
        }
        
        println(ConsoleStyle.yellow("提示: 粘贴多行内容请先输入 \"\"\" 或 multi"));
        println();
    }

    public void printModeInfo(AgentMode mode) {
        String modeColor = mode == AgentMode.CHAT ? ConsoleStyle.GREEN : ConsoleStyle.CYAN;
        println(ConsoleStyle.apply(modeColor, "  [" + mode.getIcon() + " " + mode.getDisplayName() + "]"));
        println(ConsoleStyle.gray("  " + mode.getDescription()));
        println();
    }

    public void printHelp() {
        println(ConsoleStyle.bold("可用命令:"));
        println(ConsoleStyle.green("  help    ") + " - 显示帮助信息");
        println(ConsoleStyle.green("  clear   ") + " - 清屏");
        println(ConsoleStyle.green("  reset   ") + " - 重置会话历史");
        println(ConsoleStyle.cyan("  /compact") + " - 手动压缩上下文历史");
        println(ConsoleStyle.cyan("  /compact <指令>") + " - 按自定义指令压缩上下文");
        println(ConsoleStyle.green("  config  ") + " - 显示当前配置");
        println(ConsoleStyle.green("  tokens  ") + " - 显示今日Token统计");
        println(ConsoleStyle.green("  showlog ") + " - 显示最近对话日志");
        println();
        println(ConsoleStyle.boldCyan("会话管理:"));
        println(ConsoleStyle.green("  sessions") + " - 列出所有保存的会话");
        println(ConsoleStyle.green("  resume  ") + " - 恢复最近的会话");
        println(ConsoleStyle.green("  resume <序号>") + " - 恢复指定会话");
        println(ConsoleStyle.green("  delete-session <序号>") + " - 删除指定会话");
        println();
        println(ConsoleStyle.boldBlue("MCP 服务管理:"));
        println(ConsoleStyle.blue("  /mcp list") + "           - 列出所有配置的 MCP 服务器");
        println(ConsoleStyle.blue("  /mcp connect <id>") + "     - 连接指定 MCP 服务器");
        println(ConsoleStyle.blue("  /mcp disconnect <id>") + "  - 断开指定 MCP 服务器");
        println(ConsoleStyle.blue("  /mcp tools") + "          - 列出所有已注册的 MCP 工具");
        println();
        println(ConsoleStyle.green("  exit    ") + " - 退出程序");
        println(ConsoleStyle.green("  quit    ") + " - 退出程序");
        println();
        println(ConsoleStyle.gray("其他输入将发送给 AI 模型处理。"));
        println(ConsoleStyle.gray("AI 可以使用 read_file 和 write_file 工具来读写文件。"));
        println();
        println(ConsoleStyle.boldYellow("多行输入:"));
        println(ConsoleStyle.gray("  输入 \"\"\" 或 multi 进入多行模式"));
        println(ConsoleStyle.gray("  适合粘贴代码、日志等长文本"));
        println(ConsoleStyle.gray("  再次输入 \"\"\" 结束多行输入"));
        println();
    }

    public void printConfig() {
        println(ConsoleStyle.bold("当前配置:"));
        println(ConsoleStyle.green("  配置文件: ") + config.getConfigFilePath());
        println();
        println(ConsoleStyle.boldCyan("  [LLM 配置]"));
        println(ConsoleStyle.green("  Provider: ") + config.getLlm().getProvider());
        println(ConsoleStyle.green("  模型: ") + config.getLlm().getModel());
        println(ConsoleStyle.green("  API: ") + config.getLlm().getBaseUrl());
        println(ConsoleStyle.green("  MaxTokens: ") + config.getLlm().getMaxTokens());
        println(ConsoleStyle.green("  Temperature: ") + config.getLlm().getTemperature());
        println(ConsoleStyle.green("  Timeout: ") + config.getLlm().getTimeout() + "ms");
        println(ConsoleStyle.green("  API Key: ") + maskApiKey(config.getLlm().getApiKey()));
        println();
        println(ConsoleStyle.boldCyan("  [工具配置]"));
        println(ConsoleStyle.green("  Bash: ") + (config.getTools().getBash().isEnabled() ? "启用" : "禁用"));
        println(ConsoleStyle.green("  File: ") + (config.getTools().getFile().isEnabled() ? "启用" : "禁用"));
        println();
        println(ConsoleStyle.boldCyan("  [MCP 服务]"));
        println(ConsoleStyle.green("  启用: ") + (config.getMcp().isEnabled() ? "是" : "否"));
        println(ConsoleStyle.green("  自动连接: ") + (config.getMcp().isAutoConnect() ? "是" : "否"));
        int serverCount = config.getMcp().getServers() != null ? config.getMcp().getServers().size() : 0;
        println(ConsoleStyle.green("  服务器数量: ") + serverCount);
        if (config.getMcp().getServers() != null) {
            config.getMcp().getServers().forEach(server -> {
                String status = server.isAutoRegisterTools() ? "（自动注册工具）" : "";
                println(ConsoleStyle.green("    - " + server.getId() + ": ") + server.getName() + " [" + server.getType() + "] " + status);
            });
        }
        println();
        println(ConsoleStyle.boldCyan("  [会话配置]"));
        println(ConsoleStyle.green("  自动保存: ") + (config.getSession().isAutoSave() ? "是" : "否"));
        println(ConsoleStyle.green("  最大历史: ") + config.getSession().getMaxHistory());
        println();
        println(ConsoleStyle.boldCyan("  [UI 配置]"));
        println(ConsoleStyle.green("  主题: ") + config.getUi().getTheme());
        println(ConsoleStyle.green("  提示符: ") + config.getUi().getPrompt());
        println(ConsoleStyle.green("  语法高亮: ") + (config.getUi().isSyntaxHighlight() ? "是" : "否"));
        println();
    }

    public void showLastConversationLog(String currentConversationId) {
        if (currentConversationId == null) {
            println(ConsoleStyle.yellow("还没有对话记录"));
            println();
            return;
        }

        Path logFile = WorkspaceManager.getSessionLogFile(currentConversationId);

        if (!Files.exists(logFile)) {
            println(ConsoleStyle.yellow("日志文件不存在: " + logFile));
            println();
            return;
        }

        try {
            println(ConsoleStyle.bold("最近一次对话日志:"));
            println(ConsoleStyle.gray("─".repeat(80)));

            List<String> lines = Files.readAllLines(logFile);
            int maxLines = Math.min(50, lines.size());

            for (int i = 0; i < maxLines; i++) {
                println(lines.get(i));
            }

            if (lines.size() > 50) {
                println(ConsoleStyle.gray("... (已省略 " + (lines.size() - 50) + " 行)"));
            }

            println(ConsoleStyle.gray("─".repeat(80)));
            println(ConsoleStyle.dim("日志文件: " + logFile));
            println();
        } catch (IOException e) {
            println(ConsoleStyle.red("读取日志文件失败: " + e.getMessage()));
            println();
        }
    }

    public void printConfigValidationError() {
        println(ConsoleStyle.red("╔══════════════════════════════════════════════════╗"));
        println(ConsoleStyle.red("║           API Key 未配置                         ║"));
        println(ConsoleStyle.red("╚══════════════════════════════════════════════════╝"));
        println();
        println(ConsoleStyle.yellow("请在配置文件中设置您的 API Key:"));
        println(ConsoleStyle.gray("  文件位置: " + config.getConfigFilePath()));
        println();
        println(ConsoleStyle.gray("支持的配置格式: config.yaml, config.yml, config.json"));
        println();
        println(ConsoleStyle.gray("YAML 配置示例 (config.yaml):"));
        println(ConsoleStyle.cyan("  llm:"));
        println(ConsoleStyle.cyan("    api_key: ${DASHSCOPE_API_KEY}"));
        println(ConsoleStyle.cyan("    model: qwen3.5-plus"));
        println(ConsoleStyle.cyan("    base_url: https://dashscope.aliyuncs.com"));
        println();
        println(ConsoleStyle.gray("或设置环境变量: DASHSCOPE_API_KEY 或 OPENAI_API_KEY"));
        println();
    }

    public void printDefaultApiKeyWarning() {
        println(ConsoleStyle.yellow("警告: API Key 仍为默认值，请修改配置文件"));
        println(ConsoleStyle.gray("配置文件位置: " + config.getConfigFilePath()));
        println();
        println(ConsoleStyle.yellow("是否继续？(y/n)"));
    }

    public void printGoodbye() {
        println(ConsoleStyle.cyan("再见！"));
    }

    public void printInterrupted() {
        println();
        println(ConsoleStyle.yellow("对话已中断，开始新对话"));
        println();
    }

    public void printCtrlC() {
        println(ConsoleStyle.red("^C"));
    }

    public void println() {
        if (!isTerminalAvailable()) {
            return;
        }
        terminal.writer().println();
        terminal.writer().flush();
    }

    public void println(String text) {
        if (!isTerminalAvailable()) {
            return;
        }
        terminal.writer().println(text);
        terminal.writer().flush();
    }

    public void print(String text) {
        if (!isTerminalAvailable()) {
            return;
        }
        terminal.writer().print(text);
        terminal.writer().flush();
    }

    public void printPrompt() {
        print(ConsoleStyle.prompt());
    }

    public void clearScreen() {
        if (!isTerminalAvailable()) {
            return;
        }
        terminal.puts(org.jline.utils.InfoCmp.Capability.clear_screen);
        terminal.flush();
    }

    private boolean isTerminalAvailable() {
        try {
            return terminal != null && terminal.writer() != null;
        } catch (Exception e) {
            return false;
        }
    }

    public String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.isEmpty()) {
            return "****";
        }
        if (apiKey.length() < 8) {
            return "****";
        }
        return apiKey.substring(0, 4) + "****" + apiKey.substring(apiKey.length() - 4);
    }

    public String truncate(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        if (maxLength <= 0) {
            return "";
        }
        String singleLine = text.replace("\n", " ").replace("\r", " ");
        if (singleLine.length() <= maxLength) {
            return singleLine;
        }
        return singleLine.substring(0, maxLength) + "...";
    }
}
