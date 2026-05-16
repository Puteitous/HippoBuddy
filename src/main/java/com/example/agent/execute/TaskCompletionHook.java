package com.example.agent.execute;

import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Set;

public class TaskCompletionHook implements StopHook {

    private static final Logger logger = LoggerFactory.getLogger(TaskCompletionHook.class);
    private static final int MIN_TURNS_BEFORE_CHECK = 3;
    private static final int STAGNANT_TURNS_FOR_WARN = 15;

    private static final Set<String> READ_ONLY_TOOLS = Set.of(
        "read_file",
        "grep",
        "list_directory",
        "glob"
    );

    private static final Set<String> WRITE_TOOLS = Set.of(
        "write_file",
        "edit_file",
        "replace_in_file",
        "delete_file",
        "rename_file"
    );

    private static final Set<String> COMPLETION_SIGNALS = Set.of(
        "已完成",
        "重构完成",
        "修改完成",
        "实现完成",
        "任务完成",
        "修改如下",
        "已完成修改",
        "以下是修改后的",
        "以下是重构后的",
        "已经为你",
        "已经帮你",
        "以上就是"
    );

    @Override
    public StopHook.StopHookResult evaluate(StopHook.StopHookContext context) {
        if (context.getTurnCount() < MIN_TURNS_BEFORE_CHECK) {
            return StopHook.StopHookResult.continueExecution();
        }

        List<Message> messages = context.getRecentMessages();

        if (hasCompletionSignal(messages)) {
            return StopHook.StopHookResult.continueExecution();
        }

        if (hasRecentWriteOperation(messages)) {
            return StopHook.StopHookResult.continueExecution();
        }

        if (isStagnantInReadOnlyLoop(messages, context.getTurnCount())) {
            String reason = String.format(
                "⚠️ Agent 已经读了 %d 个文件还没有产出，要继续吗？",
                context.getTurnCount()
            );
            logger.warn("TaskCompletionHook 发送停滞警告: {}", reason);
            return StopHook.StopHookResult.warn(reason);
        }

        return StopHook.StopHookResult.continueExecution();
    }

    private boolean hasCompletionSignal(List<Message> messages) {
        Message lastAssistant = findLastAssistantMessage(messages);
        if (lastAssistant == null) {
            return false;
        }

        if (lastAssistant.getContent() == null) {
            return false;
        }

        String content = lastAssistant.getContent().toLowerCase();
        return COMPLETION_SIGNALS.stream().anyMatch(signal -> content.contains(signal));
    }

    private boolean hasRecentWriteOperation(List<Message> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            Message msg = messages.get(i);
            if (msg.isAssistant() && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
                boolean hasWrite = msg.getToolCalls().stream()
                    .anyMatch(tc -> tc.getFunction() != null && 
                                   WRITE_TOOLS.contains(tc.getFunction().getName()));
                return hasWrite;
            }
        }
        return false;
    }

    private boolean isStagnantInReadOnlyLoop(List<Message> messages, int turnCount) {
        if (turnCount < STAGNANT_TURNS_FOR_WARN) {
            return false;
        }

        int consecutiveReadOnlyTurns = 0;
        for (int i = messages.size() - 1; i >= 0; i--) {
            Message msg = messages.get(i);
            if (msg.isAssistant()) {
                if (msg.getToolCalls() == null || msg.getToolCalls().isEmpty()) {
                    break;
                }

                boolean allReadOnly = msg.getToolCalls().stream()
                    .allMatch(tc -> tc.getFunction() != null && 
                                   READ_ONLY_TOOLS.contains(tc.getFunction().getName()));

                if (allReadOnly) {
                    consecutiveReadOnlyTurns++;
                    if (consecutiveReadOnlyTurns >= STAGNANT_TURNS_FOR_WARN) {
                        return true;
                    }
                } else {
                    break;
                }
            }
        }

        return false;
    }

    private Message findLastAssistantMessage(List<Message> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            Message msg = messages.get(i);
            if (msg.isAssistant()) {
                return msg;
            }
        }
        return null;
    }
}
