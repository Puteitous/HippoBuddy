package com.example.agent.web.util;

import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 消息列表完整性校验工具。
 * <p>
 * 在发送给 LLM 前，校验 assistant(tool_calls) 与后续 tool 消息的配对完整性。
 * LLM API 要求每个 {@code assistant(tool_calls)} 之后必须紧跟一组完整对应的 tool 消息，
 * 顺序无关但必须全部存在。不完整时清空 tool_calls 并移除残余 tool 消息，避免 API 400 错误。
 * <p>
 * 同时做反向校验：移除没有任何对应 {@code function_call} 的孤立 tool 消息
 * （如上下文压缩/截断时 assistant 消息被摘要化而 tool 响应残留的场景）。
 * 这类消息发送给 Responses API 会触发
 * {@code "No tool call found for tool output"} 400 错误。
 * </p>
 */
public final class MessageSanitizer {

    private static final Logger logger = LoggerFactory.getLogger(MessageSanitizer.class);

    private MessageSanitizer() {
    }

    /**
     * 清理消息列表中的孤立 tool_calls。
     * <p>
     * 正序遍历消息列表，对每个 {@code assistant(tool_calls)} 收集其后连续 tool 消息的
     * call_id 集合，与预期的 tool_call_id 集合对比。全部匹配则跳过；不匹配则清空该
     * assistant 的 tool_calls（添加中断描述文本），并移除残余的 tool 消息。
     *
     * @param messages 待清理的消息列表（会在原列表上修改）
     * @return 是否执行了清理
     */
    public static boolean removeOrphanToolCalls(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return false;
        }

        boolean foundOrphan = false;
        Set<Message> toolsToRemove = new HashSet<>();

        for (int i = 0; i < messages.size(); i++) {
            Message msg = messages.get(i);
            if (!msg.isAssistant() || msg.getToolCalls() == null || msg.getToolCalls().isEmpty()) {
                continue;
            }

            Set<String> expectedIds = msg.getToolCalls().stream()
                .map(ToolCall::getId)
                .filter(id -> id != null && !id.isEmpty())
                .collect(Collectors.toSet());

            if (expectedIds.isEmpty()) {
                continue;
            }

            // 收集后续连续 tool 消息的 call_id（用 Set 匹配，不依赖顺序）
            Set<String> actualIds = new HashSet<>();
            int j = i + 1;
            while (j < messages.size() && messages.get(j).isTool()
                   && messages.get(j).getToolCallId() != null
                   && expectedIds.contains(messages.get(j).getToolCallId())) {
                actualIds.add(messages.get(j).getToolCallId());
                j++;
            }

            if (expectedIds.equals(actualIds)) {
                // 完整配对，跳过已配对的 tool 块
                i = j - 1;
                continue;
            }

            // 不完整 → 清空 assistant 的 tool_calls
            logger.warn("检测到孤立 tool_calls (assistant消息索引={}), " +
                        "共 {} 个调用, 仅有 {} 个有响应。将清空 tool_calls 避免 API 400 错误",
                i, expectedIds.size(), actualIds.size());
            for (ToolCall tc : msg.getToolCalls()) {
                String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
                boolean responded = tc.getId() != null && actualIds.contains(tc.getId());
                logger.warn("  孤立 ToolCall: id={}, name={}, 有响应={}", tc.getId(), toolName, responded);
            }

            Message fixedMsg = msg.shallowCopy();
            if (fixedMsg.getContent() == null || fixedMsg.getContent().isBlank()) {
                StringBuilder fixContent = new StringBuilder();
                for (ToolCall tc : msg.getToolCalls()) {
                    String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
                    fixContent.append("\n  - 待执行的操作: ").append(toolName);
                }
                fixedMsg.setContent("[会话中断] 检测到未完成的工具调用：" + fixContent.toString());
            }
            fixedMsg.setToolCalls(null);
            messages.set(i, fixedMsg);

            // 标记后续不完整的 tool 消息待移除
            for (int k = i + 1; k < j; k++) {
                toolsToRemove.add(messages.get(k));
            }

            foundOrphan = true;
            i = j - 1;
        }

        if (!toolsToRemove.isEmpty()) {
            messages.removeAll(toolsToRemove);
            logger.info("已清理孤立 tool_calls 及其不完整的 tool 消息，避免后续 API 调用失败");
        } else if (foundOrphan) {
            logger.info("已清理孤立 tool_calls，避免后续 API 调用失败");
        }

        // ===== 反向校验：移除没有对应 function_call 的孤立 tool 消息 =====
        // 场景：上下文压缩/截断时 assistant(function_call) 被摘要化而 tool 响应残留，
        // 或 tool 消息 call_id 缺失/为空。这些消息发送给 Responses API 会触发
        // "No tool call found for tool output" 400 错误。
        // 注意：此处必须在正向清理之后执行——正向已清空孤立 assistant 的 tool_calls
        // 并移除其残余 tool 消息，反向只需处理"只有 tool 消息、完全没有 function_call"的情况。
        boolean foundOrphanTool = false;
        Set<String> knownToolCallIds = new HashSet<>();
        Set<Message> orphanTools = new HashSet<>();

        for (Message msg : messages) {
            if (msg == null) {
                continue;
            }
            if (msg.isAssistant() && msg.getToolCalls() != null) {
                for (ToolCall tc : msg.getToolCalls()) {
                    if (tc != null && tc.getId() != null && !tc.getId().isEmpty()) {
                        knownToolCallIds.add(tc.getId());
                    }
                }
            } else if (msg.isTool()) {
                String callId = msg.getToolCallId();
                if (callId == null || callId.isEmpty() || !knownToolCallIds.contains(callId)) {
                    orphanTools.add(msg);
                }
            }
        }

        if (!orphanTools.isEmpty()) {
            messages.removeAll(orphanTools);
            logger.warn("检测到 {} 条孤立 tool 消息（无对应 function_call），已移除避免 API 400 错误",
                orphanTools.size());
            foundOrphanTool = true;
        }

        return foundOrphan || foundOrphanTool;
    }
}
