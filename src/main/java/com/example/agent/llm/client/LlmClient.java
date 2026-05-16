package com.example.agent.llm.client;

import java.util.List;
import java.util.function.Consumer;

import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatRequest;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.stream.StreamChunk;

public interface LlmClient {

    ChatResponse chat(List<Message> messages) throws LlmException;

    ChatResponse chat(List<Message> messages, List<Tool> tools) throws LlmException;

    ChatResponse chatWithTools(List<Message> messages, List<Tool> tools) throws LlmException;

    ChatResponse chatStream(List<Message> messages, Consumer<StreamChunk> onChunk) throws LlmException;

    ChatResponse chatStream(List<Message> messages, List<Tool> tools, Consumer<StreamChunk> onChunk) throws LlmException;

    ChatResponse executeRequest(ChatRequest request) throws LlmException;

    ChatResponse continueWithToolResult(ChatResponse previousResponse, List<Message> messages, 
                                        String toolCallId, String toolName, String toolResult) throws LlmException;

    default String generateSync(String prompt) throws LlmException {
        List<Message> messages = List.of(Message.user(prompt));
        ChatResponse response = chat(messages);
        if (response != null && response.getMessage() != null) {
            return response.getMessage().getContent();
        }
        return prompt.substring(0, Math.min(prompt.length(), 500)) + " [生成失败]";
    }

    default void abortCurrentRequest() {
    }

    ChatResponse continueWithToolResults(ChatResponse previousResponse, List<Message> messages, 
                                         List<ToolResult> toolResults) throws LlmException;

    String getModel();

    String getBaseUrl();

    String getProviderName();

    class ToolResult {
        private final String toolCallId;
        private final String toolName;
        private final String result;

        public ToolResult(String toolCallId, String toolName, String result) {
            this.toolCallId = toolCallId;
            this.toolName = toolName;
            this.result = result;
        }

        public String getToolCallId() {
            return toolCallId;
        }

        public String getToolName() {
            return toolName;
        }

        public String getResult() {
            return result;
        }
    }
}
