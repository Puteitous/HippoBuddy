package com.example.agent.llm.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ChatRequest {

    private String model;
    private List<Message> messages;
    private List<Tool> tools;
    
    @JsonProperty("tool_choice")
    private Object toolChoice;
    
    @JsonProperty("max_tokens")
    private Integer maxTokens;
    
    private Double temperature;
    private Double topP;
    private Boolean stream;
    
    @JsonProperty("stream_options")
    private Map<String, Object> streamOptions;
    
    @JsonProperty("extra_body")
    private Map<String, Object> extraBody;
    
    @JsonProperty("reasoning_effort")
    private String reasoningEffort;
    
    @JsonProperty("response_format")
    private Map<String, Object> responseFormat;
    
    private Map<String, Object> thinking;

    public ChatRequest() {
    }

    public ChatRequest(String model, List<Message> messages) {
        if (model == null || model.trim().isEmpty()) {
            throw new IllegalArgumentException("model不能为null或空");
        }
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("messages不能为null或空");
        }
        this.model = model.trim();
        this.messages = messages;
    }

    public static ChatRequest of(String model, List<Message> messages) {
        return new ChatRequest(model, messages);
    }

    public ChatRequest tools(List<Tool> tools) {
        this.tools = tools;
        return this;
    }

    public ChatRequest toolChoiceAuto() {
        this.toolChoice = "auto";
        return this;
    }

    public ChatRequest toolChoiceNone() {
        this.toolChoice = "none";
        return this;
    }

    public ChatRequest toolChoiceRequired() {
        this.toolChoice = "required";
        return this;
    }

    public ChatRequest toolChoiceFunction(String functionName) {
        Map<String, Object> functionMap = new HashMap<>();
        functionMap.put("name", functionName);
        this.toolChoice = Map.of("type", "function", "function", functionMap);
        return this;
    }

    public ChatRequest maxTokens(Integer maxTokens) {
        this.maxTokens = maxTokens;
        return this;
    }

    public ChatRequest temperature(Double temperature) {
        this.temperature = temperature;
        return this;
    }

    public ChatRequest topP(Double topP) {
        this.topP = topP;
        return this;
    }

    public ChatRequest stream(Boolean stream) {
        this.stream = stream;
        if (Boolean.TRUE.equals(stream)) {
            this.streamOptions = Map.of("include_usage", true);
        } else {
            this.streamOptions = null;
        }
        return this;
    }

    public ChatRequest extraBody(Map<String, Object> extraBody) {
        this.extraBody = extraBody;
        return this;
    }

    public ChatRequest reasoningEffort(String reasoningEffort) {
        this.reasoningEffort = reasoningEffort;
        return this;
    }

    public ChatRequest thinking(Map<String, Object> thinking) {
        this.thinking = thinking;
        return this;
    }

    public ChatRequest responseFormat(Map<String, Object> responseFormat) {
        this.responseFormat = responseFormat;
        return this;
    }

    public ChatRequest responseFormatJson() {
        this.responseFormat = Map.of("type", "json_object");
        return this;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        if (model == null || model.trim().isEmpty()) {
            throw new IllegalArgumentException("model不能为null或空");
        }
        this.model = model.trim();
    }

    public List<Message> getMessages() {
        return messages;
    }

    public void setMessages(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("messages不能为null或空");
        }
        this.messages = messages;
    }

    public List<Tool> getTools() {
        return tools;
    }

    public void setTools(List<Tool> tools) {
        this.tools = tools;
    }

    public Object getToolChoice() {
        return toolChoice;
    }

    public void setToolChoice(Object toolChoice) {
        this.toolChoice = toolChoice;
    }

    public Integer getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(Integer maxTokens) {
        if (maxTokens != null && maxTokens <= 0) {
            throw new IllegalArgumentException("maxTokens必须为正数: " + maxTokens);
        }
        this.maxTokens = maxTokens;
    }

    public Double getTemperature() {
        return temperature;
    }

    public void setTemperature(Double temperature) {
        if (temperature != null && (temperature < 0 || temperature > 2)) {
            throw new IllegalArgumentException("temperature必须在0-2之间: " + temperature);
        }
        this.temperature = temperature;
    }

    public Double getTopP() {
        return topP;
    }

    public void setTopP(Double topP) {
        if (topP != null && (topP < 0 || topP > 1)) {
            throw new IllegalArgumentException("topP必须在0-1之间: " + topP);
        }
        this.topP = topP;
    }

    public Boolean getStream() {
        return stream;
    }

    public void setStream(Boolean stream) {
        this.stream = stream;
    }
    
    public Map<String, Object> getStreamOptions() {
        return streamOptions;
    }
    
    public void setStreamOptions(Map<String, Object> streamOptions) {
        this.streamOptions = streamOptions;
    }
    
    public Map<String, Object> getExtraBody() {
        return extraBody;
    }
    
    public void setExtraBody(Map<String, Object> extraBody) {
        this.extraBody = extraBody;
    }
    
    public String getReasoningEffort() {
        return reasoningEffort;
    }
    
    public void setReasoningEffort(String reasoningEffort) {
        this.reasoningEffort = reasoningEffort;
    }
    
    public Map<String, Object> getResponseFormat() {
        return responseFormat;
    }
    
    public void setResponseFormat(Map<String, Object> responseFormat) {
        this.responseFormat = responseFormat;
    }
    
    public Map<String, Object> getThinking() {
        return thinking;
    }
    
    public void setThinking(Map<String, Object> thinking) {
        this.thinking = thinking;
    }
}
