package com.example.agent.testutil;

import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Choice;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Usage;
import com.example.agent.llm.model.WebSearchAction;

import java.util.ArrayList;
import java.util.List;

public class LlmResponseBuilder {

    private String id = "test-response-" + System.currentTimeMillis();
    private String model = "test-model";
    private String content;
    private List<ToolCall> toolCalls = new ArrayList<>();
    private String finishReason;
    private Usage usage;
    private int promptTokens = 100;
    private int completionTokens = 50;
    private boolean webSearched;
    private List<WebSearchAction> webSearchActions = new ArrayList<>();

    private LlmResponseBuilder() {
    }

    public static LlmResponseBuilder create() {
        return new LlmResponseBuilder();
    }

    public LlmResponseBuilder id(String id) {
        this.id = id;
        return this;
    }

    public LlmResponseBuilder model(String model) {
        this.model = model;
        return this;
    }

    public LlmResponseBuilder content(String content) {
        this.content = content;
        return this;
    }

    public LlmResponseBuilder addToolCall(String id, String name, String arguments) {
        ToolCall toolCall = new ToolCall();
        toolCall.setId(id);
        toolCall.setFunction(new FunctionCall(name, arguments));
        this.toolCalls.add(toolCall);
        return this;
    }

    public LlmResponseBuilder addToolCall(ToolCall toolCall) {
        this.toolCalls.add(toolCall);
        return this;
    }

    public LlmResponseBuilder toolCalls(List<ToolCall> toolCalls) {
        this.toolCalls = new ArrayList<>(toolCalls);
        return this;
    }

    public LlmResponseBuilder finishReason(String finishReason) {
        this.finishReason = finishReason;
        return this;
    }

    public LlmResponseBuilder finishReasonStop() {
        this.finishReason = "stop";
        return this;
    }

    public LlmResponseBuilder finishReasonToolCalls() {
        this.finishReason = "tool_calls";
        return this;
    }

    public LlmResponseBuilder usage(int promptTokens, int completionTokens) {
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
        return this;
    }

    public LlmResponseBuilder usage(Usage usage) {
        this.usage = usage;
        return this;
    }

    public LlmResponseBuilder webSearched(boolean webSearched) {
        this.webSearched = webSearched;
        return this;
    }

    public LlmResponseBuilder webSearchActions(List<WebSearchAction> webSearchActions) {
        this.webSearchActions = new ArrayList<>(webSearchActions);
        return this;
    }

    public LlmResponseBuilder addWebSearchAction(WebSearchAction action) {
        this.webSearchActions.add(action);
        return this;
    }

    public ChatResponse build() {
        ChatResponse response = new ChatResponse();
        response.setId(id);
        response.setObject("chat.completion");
        response.setCreated(System.currentTimeMillis() / 1000);
        response.setModel(model);

        Message message = new Message();
        message.setRole("assistant");
        
        if (content != null) {
            message.setContent(content);
        }
        
        if (!toolCalls.isEmpty()) {
            message.setToolCalls(toolCalls);
        }
        
        if (webSearched) {
            message.setWebSearched(true);
        }
        if (!webSearchActions.isEmpty()) {
            message.setWebSearchActions(webSearchActions);
        }

        Choice choice = new Choice();
        choice.setIndex(0);
        choice.setMessage(message);
        choice.setFinishReason(finishReason != null ? finishReason : 
            (!toolCalls.isEmpty() ? "tool_calls" : "stop"));

        response.setChoices(List.of(choice));

        if (usage != null) {
            response.setUsage(usage);
        } else {
            Usage defaultUsage = new Usage();
            defaultUsage.setPromptTokens(promptTokens);
            defaultUsage.setCompletionTokens(completionTokens);
            defaultUsage.setTotalTokens(promptTokens + completionTokens);
            response.setUsage(defaultUsage);
        }

        return response;
    }

    public static ChatResponse simpleContent(String content) {
        return create().content(content).build();
    }

    public static ChatResponse withToolCall(String toolName, String arguments) {
        return create()
                .addToolCall("call-" + System.currentTimeMillis(), toolName, arguments)
                .finishReasonToolCalls()
                .build();
    }

    public static ChatResponse withToolCalls(List<ToolCall> toolCalls) {
        return create()
                .toolCalls(toolCalls)
                .finishReasonToolCalls()
                .build();
    }

    public static ChatResponse empty() {
        return create().build();
    }
}
