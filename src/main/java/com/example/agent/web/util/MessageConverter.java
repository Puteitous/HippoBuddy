package com.example.agent.web.util;

import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MessageConverter {

    public List<Map<String, Object>> convertMessages(List<Message> msgList) {
        List<Map<String, Object>> messages = new ArrayList<>();
        for (Message msg : msgList) {
            String role = msg.getRole();
            if ("system".equals(role)) continue;

            boolean hasToolCalls = "assistant".equals(role) && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty();
            if ((msg.getContent() == null || msg.getContent().isBlank()) && !hasToolCalls) continue;

            Map<String, Object> msgMap = new HashMap<>();
            msgMap.put("id", msg.getId());
            msgMap.put("role", role);
            msgMap.put("content", msg.getContent());

            if (msg.getReasoningContent() != null && !msg.getReasoningContent().isEmpty()) {
                msgMap.put("reasoning_content", msg.getReasoningContent());
            }

            if (hasToolCalls) {
                List<Map<String, Object>> calls = new ArrayList<>();
                for (ToolCall tc : msg.getToolCalls()) {
                    Map<String, Object> call = new HashMap<>();
                    call.put("id", tc.getId());
                    call.put("name", tc.getFunction().getName());
                    call.put("arguments", tc.getFunction().getArguments());
                    calls.add(call);
                }
                msgMap.put("tool_calls", calls);
            }

            if ("tool".equals(role)) {
                msgMap.put("toolName", msg.getName() != null ? msg.getName() : "");
                msgMap.put("toolCallId", msg.getToolCallId() != null ? msg.getToolCallId() : "");

                boolean success = true;
                String content = msg.getContent();
                if (content != null && !content.isBlank()) {
                    String lowerContent = content.toLowerCase();
                    if (lowerContent.contains("错误:") ||
                        lowerContent.contains("error:") ||
                        lowerContent.contains("失败") ||
                        lowerContent.contains("cancelled") ||
                        lowerContent.contains("user_cancelled") ||
                        lowerContent.contains("权限受限") ||
                        lowerContent.contains("权限拒绝")) {
                        success = false;
                    }
                }
                msgMap.put("success", success);
            }

            messages.add(msgMap);
        }
        return messages;
    }
}
