package com.example.agent.web.session;

import java.util.List;

public class PendingToolCall {
    public final String toolCallId;
    public final String toolName;
    public final String question;
    public final List<String> options;
    public final boolean allowCustomInput;

    public PendingToolCall(String toolCallId, String toolName, String question, List<String> options, boolean allowCustomInput) {
        this.toolCallId = toolCallId;
        this.toolName = toolName;
        this.question = question;
        this.options = options;
        this.allowCustomInput = allowCustomInput;
    }
}
