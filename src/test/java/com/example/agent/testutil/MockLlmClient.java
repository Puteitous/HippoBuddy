package com.example.agent.testutil;

import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatRequest;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.stream.StreamChunk;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.Queue;
import java.util.function.Consumer;

public class MockLlmClient implements LlmClient {

    private final Queue<ChatResponse> responseQueue = new LinkedList<>();
    private final List<ChatRequest> recordedRequests = new ArrayList<>();
    private final List<List<Message>> recordedMessages = new ArrayList<>();
    
    private LlmException exceptionToThrow;
    private long delayMs = 0;
    private boolean streamMode = false;
    private String mockReasoning;

    public void enqueueResponse(ChatResponse response) {
        responseQueue.offer(response);
    }

    public void enqueueResponses(List<ChatResponse> responses) {
        responseQueue.addAll(responses);
    }

    public void setExceptionToThrow(LlmException exception) {
        this.exceptionToThrow = exception;
    }

    public void setDelayMs(long delayMs) {
        this.delayMs = delayMs;
    }

    public void setStreamMode(boolean streamMode) {
        this.streamMode = streamMode;
    }

    /**
     * 设置模拟的 reasoning_content（思考过程），启用后流式输出会先发 reasoning 再发 content
     */
    public void setMockReasoning(String reasoning) {
        this.mockReasoning = reasoning;
    }

    public List<ChatRequest> getRecordedRequests() {
        return new ArrayList<>(recordedRequests);
    }

    @Override
    public String getProviderName() {
        return "mock";
    }

    @Override
    public String getBaseUrl() {
        return "http://mock-api.example.com";
    }

    @Override
    public String getModel() {
        return "mock-model";
    }

    public List<List<Message>> getRecordedMessages() {
        return new ArrayList<>(recordedMessages);
    }

    public List<Message> getLastSentMessages() {
        if (recordedMessages.isEmpty()) {
            return null;
        }
        return new ArrayList<>(recordedMessages.get(recordedMessages.size() - 1));
    }

    public void enqueueNullResponse() {
        responseQueue.offer(null);
    }

    public void enqueueSuccessResponse(String content) {
        responseQueue.offer(LlmResponseBuilder.simpleContent(content));
    }

    public void clearRecordings() {
        recordedRequests.clear();
        recordedMessages.clear();
    }

    public void reset() {
        responseQueue.clear();
        recordedRequests.clear();
        recordedMessages.clear();
        exceptionToThrow = null;
        delayMs = 0;
    }

    @Override
    public ChatResponse chat(List<Message> messages) throws LlmException {
        return chat(messages, null);
    }

    @Override
    public ChatResponse chat(List<Message> messages, List<Tool> tools) throws LlmException {
        recordRequest(null, messages);
        
        maybeThrowException();
        maybeDelay();
        
        ChatResponse response = responseQueue.poll();
        if (response == null) {
            response = LlmResponseBuilder.create().build();
        }
        return response;
    }

    @Override
    public ChatResponse chatWithTools(List<Message> messages, List<Tool> tools) throws LlmException {
        return chat(messages, tools);
    }

    @Override
    public ChatResponse chatStream(List<Message> messages, Consumer<StreamChunk> onChunk) throws LlmException {
        return chatStream(messages, null, onChunk);
    }

    @Override
    public ChatResponse chatStream(List<Message> messages, List<Tool> tools, Consumer<StreamChunk> onChunk) throws LlmException {
        recordRequest(null, messages);
        
        maybeThrowException();
        maybeDelay();
        
        ChatResponse response = responseQueue.poll();
        if (response == null) {
            response = LlmResponseBuilder.create().build();
        }
        
        if (onChunk != null && (response.hasContent() || mockReasoning != null)) {
            // 先发 reasoning chunk（如果有）
            if (mockReasoning != null && !mockReasoning.isEmpty()) {
                int reasoningChunkSize = Math.max(1, mockReasoning.length() / 3);
                for (int i = 0; i < mockReasoning.length(); i += reasoningChunkSize) {
                    int end = Math.min(i + reasoningChunkSize, mockReasoning.length());
                    onChunk.accept(createReasoningChunk(mockReasoning.substring(i, end)));
                }
            }
            // 再发 content chunk（如果有）
            if (response.hasContent()) {
                String content = response.getContent();
                int chunkSize = Math.max(1, content.length() / 5);
                for (int i = 0; i < content.length(); i += chunkSize) {
                    int end = Math.min(i + chunkSize, content.length());
                    String chunkContent = content.substring(i, end);
                    onChunk.accept(createStreamChunk(chunkContent));
                }
            }
        }
        
        return response;
    }

    @Override
    public ChatResponse executeRequest(ChatRequest request) throws LlmException {
        recordRequest(request, request.getMessages());
        
        maybeThrowException();
        maybeDelay();
        
        ChatResponse response = responseQueue.poll();
        if (response == null) {
            response = LlmResponseBuilder.create().build();
        }
        return response;
    }

    @Override
    public ChatResponse continueWithToolResult(ChatResponse previousResponse, List<Message> messages, 
                                               String toolCallId, String toolName, String toolResult) throws LlmException {
        return chat(messages);
    }

    @Override
    public ChatResponse continueWithToolResults(ChatResponse previousResponse, List<Message> messages, 
                                                List<ToolResult> toolResults) throws LlmException {
        return chat(messages);
    }

    private void recordRequest(ChatRequest request, List<Message> messages) {
        if (request != null) {
            recordedRequests.add(request);
        }
        if (messages != null) {
            recordedMessages.add(new ArrayList<>(messages));
        }
    }

    private void maybeThrowException() throws LlmException {
        if (exceptionToThrow != null) {
            throw exceptionToThrow;
        }
    }

    private void maybeDelay() {
        if (delayMs > 0) {
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private StreamChunk createStreamChunk(String content) {
        StreamChunk chunk = new StreamChunk();
        chunk.setContent(content);
        return chunk;
    }

    private StreamChunk createReasoningChunk(String reasoning) {
        StreamChunk chunk = new StreamChunk();
        chunk.setReasoning(reasoning);
        return chunk;
    }
}
