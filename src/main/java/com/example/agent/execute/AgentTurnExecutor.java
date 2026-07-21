package com.example.agent.execute;

import com.example.agent.console.AgentUi;
import com.example.agent.console.ConsoleStyle;
import com.example.agent.core.AgentContext;
import com.example.agent.core.AgentMode;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Usage;
import com.example.agent.logging.ConversationLogger;
import com.example.agent.application.ConversationService;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.tools.ToolRegistry;
import org.jline.reader.UserInterruptException;

import java.util.List;

public class AgentTurnExecutor {

    private static final int MAX_EMPTY_RESPONSE_RETRIES = 2;

    private final LlmClient llmClient;
    private final ToolRegistry toolRegistry;
    private final ConversationService conversationService;
    private final Conversation conversation;
    private final ToolCallProcessor toolCallProcessor;
    private final AgentUi ui;
    private final AgentContext context;

    private volatile boolean interrupted = false;

    public AgentTurnExecutor(AgentContext context, ToolCallProcessor toolCallProcessor, AgentUi ui) {
        this.llmClient = context.getLlmClient();
        this.toolRegistry = context.getToolRegistry();
        this.conversationService = context.getConversationService();
        this.conversation = context.getConversation();
        this.toolCallProcessor = toolCallProcessor;
        this.ui = ui;
        this.context = context;
    }

    public AgentTurnResult execute(ConversationLogger conversationLogger, String sessionId) throws LlmException {
        ui.println(ConsoleStyle.gray("  ┌─ ") + ConsoleStyle.boldCyan("AI 思考中..."));
        ui.println(ConsoleStyle.gray("  │"));
        ui.print(ConsoleStyle.gray("  └─ ") + ConsoleStyle.boldCyan("AI: "));
        ui.println();

        StringBuilder contentBuilder = new StringBuilder();

        ChatResponse response = llmClient.chatStream(
                conversationService.getContextForInference(conversation),
                toolRegistry.toTools(context.getCurrentMode()),
                chunk -> {
                    if (interrupted) {
                        throw new RuntimeException("Interrupted");
                    }
                    if (chunk.hasContent()) {
                        ui.print(ConsoleStyle.white(chunk.getContent()));
                        contentBuilder.append(chunk.getContent());
                    }
                }
        );

        if (interrupted) {
            ui.println();
            ui.println();
            ui.println(ConsoleStyle.gray("  │"));
            ui.println(ConsoleStyle.yellow("  └─ 对话已中断"));
            throw new UserInterruptException("User interrupted");
        }

        ui.println();

        Message assistantMessage = response.getFirstMessage();
        if (assistantMessage == null) {
            ui.println();
            ui.println(ConsoleStyle.gray("  │"));
            ui.println(ConsoleStyle.gray("  └─ ") + ConsoleStyle.red("未收到有效响应"));
            if (conversationLogger != null) {
                conversationLogger.logDebug("LLM 返回 null 消息, response: " + responseToString(response));
            }
            return AgentTurnResult.ERROR;
        }

        Usage usage = response.getUsage();

        if (conversationLogger != null) {
            conversationLogger.logLlmCall(usage, response.hasToolCalls());
        }

        if (response.hasToolCalls()) {
            if ((assistantMessage.getContent() == null || assistantMessage.getContent().isBlank()) && contentBuilder.length() > 0) {
                assistantMessage.setContent(contentBuilder.toString());
            }

            if (usage != null) {
                conversation.updateLastKnownUsage(usage);
            }
            conversationService.addAssistantMessage(conversation, assistantMessage, usage);

            List<ToolCall> toolCalls = assistantMessage.getToolCalls();
            ui.println();
            ui.println(ConsoleStyle.gray("  │"));
            ui.println(ConsoleStyle.gray("  ├─ ") + ConsoleStyle.boldYellow("工具调用:"));

            if (conversationLogger != null) {
                conversationLogger.logDebug("工具调用数量: " + toolCalls.size());
                for (int i = 0; i < toolCalls.size(); i++) {
                    ToolCall tc = toolCalls.get(i);
                    String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "null";
                    conversationLogger.logDebug("  ToolCall[" + i + "]: id=" + tc.getId() + ", name=" + toolName);
                }
            }

            if (interrupted) {
                ui.println();
                ui.println(ConsoleStyle.yellow("  └─ 工具调用已中断"));
                throw new UserInterruptException("User interrupted");
            }

            toolCallProcessor.processToolCallsConcurrently(toolCalls, conversationLogger);

            if (interrupted) {
                ui.println();
                ui.println(ConsoleStyle.yellow("  └─ 工具执行已中断"));
                throw new UserInterruptException("User interrupted");
            }

            context.getToolRegistry().getBlockerChain().onTurnComplete();
            return AgentTurnResult.CONTINUE;
        } else {
            if ((assistantMessage.getContent() == null || assistantMessage.getContent().isBlank()) && contentBuilder.length() > 0) {
                assistantMessage.setContent(contentBuilder.toString());
            }

            if ((assistantMessage.getContent() == null || assistantMessage.getContent().isBlank()) && contentBuilder.length() == 0) {
                if (conversationLogger != null) {
                    conversationLogger.logDebug("空响应检测: " + responseToString(response));
                }
                return AgentTurnResult.EMPTY_RESPONSE;
            }

            if (usage != null) {
                conversation.updateLastKnownUsage(usage);
            }
            conversationService.addAssistantMessage(conversation, assistantMessage, usage);

            if (conversationLogger != null) {
                conversationLogger.logAiResponse(contentBuilder.toString(), usage);
            }

            ui.println();
            ui.println(ConsoleStyle.gray(" ---  ") + ConsoleStyle.green("完成✅"));
            ui.println();

            if (context.getCurrentMode() == AgentMode.CHAT) {
                ui.println(ConsoleStyle.gray("💡 需要直接修改文件？输入 /builder 开启全权限模式"));
                ui.println();
            }

            ui.println(ConsoleStyle.conversationEnd());
            ui.println();
            return AgentTurnResult.DONE;
        }
    }

    public void setInterrupted(boolean interrupted) {
        this.interrupted = interrupted;
    }

    public boolean isInterrupted() {
        return interrupted;
    }

    private String responseToString(ChatResponse response) {
        if (response == null) {
            return "ChatResponse{null}";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("ChatResponse{");
        sb.append("id='").append(response.getId()).append("', ");
        sb.append("model='").append(response.getModel()).append("', ");
        sb.append("hasContent=").append(response.hasContent()).append(", ");
        sb.append("hasToolCalls=").append(response.hasToolCalls()).append(", ");

        Message msg = response.getFirstMessage();
        if (msg != null) {
            sb.append("message{");
            sb.append("role='").append(msg.getRole()).append("', ");
            sb.append("content=").append(msg.getContent() != null ? "'" + ui.truncate(msg.getContent(), 50) + "'" : "null");
            if (msg.getToolCalls() != null) {
                sb.append(", toolCallsCount=").append(msg.getToolCalls().size());
            }
            sb.append("}");
        } else {
            sb.append("message=null");
        }

        if (response.getUsage() != null) {
            sb.append(", usage{prompt=").append(response.getUsage().getPromptTokens())
                    .append(", completion=").append(response.getUsage().getCompletionTokens()).append("}");
        }

        sb.append("}");
        return sb.toString();
    }
}
