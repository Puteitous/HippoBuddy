package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.core.event.EventBus;
import com.example.agent.core.event.LlmRequestEvent;
import com.example.agent.llm.exception.LlmApiException;
import com.example.agent.llm.exception.LlmConnectionException;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.exception.LlmTimeoutException;
import com.example.agent.llm.model.ChatRequest;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Choice;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Usage;
import com.example.agent.llm.retry.RetryPolicy;
import com.example.agent.llm.stream.SseParser;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.llm.stream.ToolCallDelta;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

public abstract class AbstractLlmClient implements LlmClient {

    protected static final Logger logger = LoggerFactory.getLogger(AbstractLlmClient.class);
    protected static final int API_TIMEOUT_SECONDS = 60;
    protected static final int STREAM_TIMEOUT_SECONDS = 120;
    protected static final int CONNECT_TIMEOUT_SECONDS = 30;
    protected static final int MAX_TOOL_CALL_INDEX = 1000;
    protected static final int MAX_ARGUMENTS_LENGTH = 100000;
    
    protected final HttpClient httpClient;
    protected final ObjectMapper objectMapper;
    protected final Config config;
    protected final RetryPolicy retryPolicy;
    protected final SseParser sseParser;

    protected AbstractLlmClient(Config config, RetryPolicy retryPolicy) {
        if (config == null) {
            throw new IllegalArgumentException("Config不能为null");
        }
        if (retryPolicy == null) {
            throw new IllegalArgumentException("RetryPolicy不能为null");
        }
        this.config = config;
        this.retryPolicy = retryPolicy;
        this.objectMapper = new ObjectMapper();
        this.sseParser = new SseParser();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(CONNECT_TIMEOUT_SECONDS))
                .build();
    }

    @Override
    public String getModel() {
        String model = config.getLlm().getModel();
        return (model != null && !model.isBlank()) ? model : getDefaultModel();
    }

    @Override
    public String getBaseUrl() {
        String baseUrl = config.getLlm().getBaseUrl();
        return (baseUrl != null && !baseUrl.isBlank()) ? baseUrl : getDefaultBaseUrl();
    }

    protected abstract String getDefaultModel();

    protected abstract String getDefaultBaseUrl();

    public abstract String getProviderName();

    protected abstract String getChatCompletionsPath();
    
    protected abstract String getAuthorizationHeader();
    
    protected void enrichRequestHeaders(HttpRequest.Builder builder) {
    }
    
    protected List<Message> applyCacheStrategy(List<Message> messages) {
        if (config.getLlm() != null && config.getLlm().isServerCache()) {
            logger.warn("⚠️ 当前Provider暂不支持服务端缓存，已忽略该配置");
        }
        return messages;
    }

    @Override
    public ChatResponse chat(List<Message> messages) throws LlmException {
        return chat(messages, null);
    }

    @Override
    public ChatResponse chat(List<Message> messages, List<Tool> tools) throws LlmException {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("消息列表不能为null或空");
        }
        
        List<Message> processedMessages = applyCacheStrategy(messages);
        
        ChatRequest request = ChatRequest.of(getModel(), processedMessages)
                .maxTokens(config.getLlm().getMaxTokens());
        
        applyThinkingConfig(request);
        applyResponseFormat(request);
        
        if (tools != null && !tools.isEmpty()) {
            request.tools(tools).toolChoiceAuto();
        }
        
        return executeRequest(request);
    }

    private void applyThinkingConfig(ChatRequest request) {
        LlmConfig llmConfig = config.getLlm();
        if (llmConfig == null) return;
        
        Map<String, Object> thinking = new HashMap<>();
        if (llmConfig.isThinkingEnabled()) {
            thinking.put("type", "enabled");
            request.reasoningEffort(llmConfig.getReasoningEffort());
        } else {
            thinking.put("type", "disabled");
        }
        request.thinking(thinking);
    }

    private void applyResponseFormat(ChatRequest request) {
        LlmConfig llmConfig = config.getLlm();
        if (llmConfig == null) return;
        
        String responseFormat = llmConfig.getResponseFormat();
        if (responseFormat != null && !responseFormat.isBlank()) {
            request.responseFormat(Map.of("type", responseFormat));
        }
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
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("消息列表不能为null或空");
        }
        
        List<Message> processedMessages = applyCacheStrategy(messages);
        
        ChatRequest request = ChatRequest.of(getModel(), processedMessages)
                .stream(true)
                .maxTokens(config.getLlm().getMaxTokens());
        
        applyThinkingConfig(request);
        applyResponseFormat(request);
        
        if (tools != null && !tools.isEmpty()) {
            request.tools(tools).toolChoiceAuto();
        }
        
        return executeStreamRequest(request, onChunk);
    }

    protected ChatResponse executeStreamRequest(ChatRequest request, Consumer<StreamChunk> onChunk) throws LlmException {
        try {
            String requestBody = objectMapper.writeValueAsString(request);
            String url = buildUrl(getBaseUrl(), getChatCompletionsPath());
            
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .timeout(Duration.ofSeconds(STREAM_TIMEOUT_SECONDS));
            
            String authHeader = getAuthorizationHeader();
            if (authHeader != null && !authHeader.isEmpty()) {
                requestBuilder.header("Authorization", authHeader);
            }
            
            enrichRequestHeaders(requestBuilder);
            
            HttpRequest httpRequest = requestBuilder.build();

            logger.debug("📤 发送流式 LLM 请求，模型: {}，大小: {} 字节，超时: {} 秒", 
                getModel(), requestBody.length(), STREAM_TIMEOUT_SECONDS);
            long startMs = System.currentTimeMillis();
            
            HttpResponse<InputStream> response = httpClient.send(
                    httpRequest, 
                    HttpResponse.BodyHandlers.ofInputStream()
            );
            
            long latencyMs = System.currentTimeMillis() - startMs;
            logger.debug("📥 流式 LLM 响应首包，耗时: {} ms，状态: {}", latencyMs, response.statusCode());
            
            return processStreamResponse(response, onChunk);
            
        } catch (LlmException e) {
            throw e;
        } catch (java.net.http.HttpTimeoutException e) {
            throw new LlmTimeoutException(
                "流式请求超时（" + STREAM_TIMEOUT_SECONDS + "秒）。请检查网络连接或稍后重试。", 
                STREAM_TIMEOUT_SECONDS, e);
        } catch (java.net.ConnectException e) {
            throw new LlmConnectionException(
                "无法连接到 API 服务器: " + config.getLlm().getBaseUrl() + "。请检查网络连接。", 
                config.getLlm().getBaseUrl(), e);
        } catch (Exception e) {
            throw new LlmException("流式请求失败: " + e.getMessage(), e);
        }
    }

    protected String buildUrl(String baseUrl, String path) {
        if (baseUrl == null || baseUrl.isEmpty()) {
            return (path != null) ? path : "";
        }
        if (path == null || path.isEmpty()) {
            return baseUrl;
        }

        String normalizedBaseUrl = baseUrl.replaceAll("/+$", "");
        String normalizedPath = path.replaceAll("^/+", "");

        if (normalizedPath.isEmpty()) {
            return normalizedBaseUrl;
        }
        return normalizedBaseUrl + "/" + normalizedPath;
    }

    protected ChatResponse processStreamResponse(
            HttpResponse<InputStream> response, 
            Consumer<StreamChunk> onChunk) throws LlmException {
        
        int statusCode = response.statusCode();
        
        if (statusCode < 200 || statusCode >= 300) {
            try {
                String body = new String(response.body().readAllBytes(), StandardCharsets.UTF_8);
                String errorMessage = parseErrorMessage(body, statusCode);
                throw new LlmApiException("API 返回错误 (HTTP " + statusCode + "): " + errorMessage, statusCode, body);
            } catch (Exception e) {
                if (e instanceof LlmException) {
                    throw (LlmException) e;
                }
                throw new LlmApiException("API 返回错误 (HTTP " + statusCode + ")", statusCode, null);
            }
        }
        
        StringBuilder fullContent = new StringBuilder();
        StringBuilder fullReasoning = new StringBuilder();
        List<ToolCall> toolCalls = new ArrayList<>();
        String finishReason = null;
        Usage usage = null;
        int chunkCount = 0;
        int contentChunkCount = 0;
        int reasoningChunkCount = 0;
        int toolCallChunkCount = 0;
        
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            
            String line;
            while ((line = reader.readLine()) != null) {
                if (Thread.currentThread().isInterrupted()) {
                    Thread.interrupted();
                    logger.debug("流式响应读取被中断");
                    break;
                }
                
                if (line.trim().isEmpty()) {
                    continue;
                }
                
                chunkCount++;
                StreamChunk chunk = sseParser.parse(line);
                
                if (chunk == null) {
                    if (sseParser.isDone(line)) {
                        break;
                    }
                    continue;
                }
                
                if (chunk.hasContent()) {
                    contentChunkCount++;
                    fullContent.append(chunk.getContent());
                    if (onChunk != null) {
                        onChunk.accept(chunk);
                    }
                }
                
                if (chunk.hasReasoning()) {
                    reasoningChunkCount++;
                    fullReasoning.append(chunk.getReasoning());
                    if (onChunk != null) {
                        onChunk.accept(chunk);
                    }
                }
                
                if (chunk.isToolCall() && chunk.hasToolCalls()) {
                    toolCallChunkCount++;
                    mergeToolCallDeltas(toolCalls, chunk.getToolCallDeltas());
                }
                
                if (chunk.getFinishReason() != null) {
                    finishReason = chunk.getFinishReason();
                }
                
                if (chunk.hasUsage()) {
                    usage = chunk.getUsage();
                }
            }
            
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            if (e instanceof LlmException) {
                throw (LlmException) e;
            }
            throw new LlmException("读取流式响应失败: " + e.getMessage(), e);
        }
        
        if (reasoningChunkCount > 0) {
            logger.info("🧠 模型思考过程: reasoningChunks={}, totalReasoningChars={}", 
                reasoningChunkCount, fullReasoning.length());
        }
        
        if (usage != null) {
            logger.debug("📊 LLM 响应 Usage: prompt={}, completion={}, total={}, cacheHit={}, cacheMiss={}", 
                usage.getPromptTokens(), usage.getCompletionTokens(), usage.getTotalTokens(),
                usage.getPromptCacheHitTokens(), usage.getPromptCacheMissTokens());
        } else {
            logger.warn("⚠️ LLM 响应未返回 usage 字段，缓存命中数据不可用");
        }
        
        if (contentChunkCount == 0 && toolCallChunkCount > 0) {
            logger.debug("流式响应: chunks={}, contentChunks={}, reasoningChunks={}, toolCallChunks={}, finishReason={}", 
                chunkCount, contentChunkCount, reasoningChunkCount, toolCallChunkCount, finishReason);
            logger.debug("工具调用列表: size={}", toolCalls.size());
            for (int i = 0; i < toolCalls.size(); i++) {
                ToolCall tc = toolCalls.get(i);
                String name = tc.getFunction() != null ? tc.getFunction().getName() : "null";
                logger.debug("  ToolCall[{}]: id={}, name={}", i, tc.getId(), name);
            }
        }
        
        if ("tool_calls".equals(finishReason)) {
            long validCount = toolCalls.stream()
                .filter(tc -> tc.getFunction() != null 
                    && tc.getFunction().getName() != null 
                    && !tc.getFunction().getName().isEmpty())
                .count();
            if (validCount == 0) {
                logger.warn("finishReason=tool_calls 但没有有效的工具调用");
            }
        }
        
        return buildChatResponse(fullContent.toString(), fullReasoning.toString(), toolCalls, finishReason, usage);
    }

    protected void mergeToolCallDeltas(List<ToolCall> toolCalls, List<ToolCallDelta> deltas) {
        if (toolCalls == null || deltas == null || deltas.isEmpty()) {
            return;
        }
        
        for (ToolCallDelta delta : deltas) {
            Integer deltaIndex = delta.getIndex();
            int index = (deltaIndex != null && deltaIndex >= 0) ? deltaIndex : toolCalls.size();
            
            if (index >= MAX_TOOL_CALL_INDEX) {
                logger.warn("ToolCall index过大: {}, 跳过该delta", index);
                continue;
            }
            
            if (toolCalls.size() > MAX_TOOL_CALL_INDEX) {
                logger.warn("ToolCall数量已达上限: {}, 停止添加新ToolCall", toolCalls.size());
                return;
            }
            
            while (toolCalls.size() <= index) {
                toolCalls.add(new ToolCall());
            }
            
            ToolCall toolCall = toolCalls.get(index);
            
            if (delta.getId() != null && !delta.getId().isEmpty()) {
                toolCall.setId(delta.getId());
            }
            
            if (delta.getType() != null) {
                toolCall.setType(delta.getType());
            }
            
            if (delta.getFunction() != null) {
                ToolCallDelta.FunctionDelta funcDelta = delta.getFunction();
                
                if (toolCall.getFunction() == null) {
                    toolCall.setFunction(new FunctionCall());
                }
                
                FunctionCall func = toolCall.getFunction();
                
                if (funcDelta.getName() != null && !funcDelta.getName().isEmpty()) {
                    func.setName(funcDelta.getName());
                }
                
                if (funcDelta.getArguments() != null) {
                    String currentArgs = func.getArguments() != null ? func.getArguments() : "";
                    String newArgs = currentArgs + funcDelta.getArguments();
                    if (newArgs.length() > MAX_ARGUMENTS_LENGTH) {
                        logger.warn("ToolCall arguments过长，已截断: {} -> {} 字符", newArgs.length(), MAX_ARGUMENTS_LENGTH);
                        newArgs = newArgs.substring(0, MAX_ARGUMENTS_LENGTH);
                    }
                    func.setArguments(newArgs);
                }
            }
        }
    }

    protected ChatResponse buildChatResponse(String content, String reasoning, List<ToolCall> toolCalls, String finishReason, Usage usage) {
        ChatResponse response = new ChatResponse();
        response.setId("stream-" + System.currentTimeMillis());
        response.setObject("chat.completion");
        response.setCreated(System.currentTimeMillis() / 1000);
        response.setModel(getModel());
        
        Message message = new Message();
        message.setRole("assistant");
        
        if (content != null && !content.isEmpty()) {
            message.setContent(content);
        }
        
        if (reasoning != null && !reasoning.isEmpty()) {
            message.setReasoningContent(reasoning);
        }
        
        List<ToolCall> validToolCalls = new ArrayList<>();
        for (ToolCall tc : toolCalls) {
            if (tc.getFunction() != null 
                && tc.getFunction().getName() != null 
                && !tc.getFunction().getName().isEmpty()) {
                validToolCalls.add(tc);
            }
        }
        
        if (!validToolCalls.isEmpty()) {
            message.setToolCalls(validToolCalls);
        }
        
        Choice choice = new Choice();
        choice.setIndex(0);
        choice.setMessage(message);
        choice.setFinishReason(finishReason);
        
        response.setChoices(List.of(choice));
        
        if (usage != null) {
            response.setUsage(usage);
        }
        
        return response;
    }

    @Override
    public ChatResponse executeRequest(ChatRequest request) throws LlmException {
        if (request == null) {
            throw new NullPointerException("ChatRequest不能为null");
        }
        
        LlmException lastException = null;
        int attempt = 0;
        long startMs = System.currentTimeMillis();
        
        while (attempt <= retryPolicy.getMaxRetries()) {
            try {
                ChatResponse response = doExecuteRequest(request);
                
                EventBus.publish(new LlmRequestEvent(
                        getProviderName(),
                        getModel(),
                        response.getUsage() != null ? response.getUsage().getPromptTokens() : 0,
                        response.getUsage() != null ? response.getUsage().getCompletionTokens() : 0,
                        System.currentTimeMillis() - startMs,
                        true
                ));
                
                return response;
            } catch (LlmException e) {
                lastException = e;
                
                if (!retryPolicy.shouldRetry(e, attempt)) {
                    EventBus.publish(new LlmRequestEvent(
                            getProviderName(),
                            getModel(),
                            0,
                            0,
                            System.currentTimeMillis() - startMs,
                            false
                    ));
                    throw e;
                }
                
                if (attempt < retryPolicy.getMaxRetries()) {
                    long delayMs = retryPolicy.getDelayMs(attempt);
                    try {
                        Thread.sleep(delayMs);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new LlmException("请求被中断", ie);
                    }
                }
                
                attempt++;
            }
        }
        
        throw lastException;
    }

    protected ChatResponse doExecuteRequest(ChatRequest request) throws LlmException {
        try {
            String requestBody = objectMapper.writeValueAsString(request);
            String url = buildUrl(getBaseUrl(), getChatCompletionsPath());
            
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .timeout(Duration.ofSeconds(API_TIMEOUT_SECONDS));
            
            String authHeader = getAuthorizationHeader();
            if (authHeader != null && !authHeader.isEmpty()) {
                requestBuilder.header("Authorization", authHeader);
            }
            
            enrichRequestHeaders(requestBuilder);
            
            HttpRequest httpRequest = requestBuilder.build();

            logger.debug("📤 发送 LLM 请求，模型: {}，大小: {} 字节，超时: {} 秒", 
                getModel(), requestBody.length(), API_TIMEOUT_SECONDS);
            long startMs = System.currentTimeMillis();
            
            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            
            long latencyMs = System.currentTimeMillis() - startMs;
            logger.debug("📥 LLM 响应，耗时: {} ms，状态: {}", latencyMs, response.statusCode());
            
            return handleResponse(response);
            
        } catch (LlmException e) {
            throw e;
        } catch (java.net.http.HttpTimeoutException e) {
            throw new LlmTimeoutException(
                "API 请求超时（" + API_TIMEOUT_SECONDS + "秒）。请检查网络连接或稍后重试。", 
                API_TIMEOUT_SECONDS, e);
        } catch (java.net.ConnectException e) {
            throw new LlmConnectionException(
                "无法连接到 API 服务器: " + config.getLlm().getBaseUrl() + "。请检查网络连接。", 
                config.getLlm().getBaseUrl(), e);
        } catch (java.net.SocketTimeoutException e) {
            throw new LlmTimeoutException(
                "连接超时。请检查网络连接或稍后重试。", 
                CONNECT_TIMEOUT_SECONDS, e);
        } catch (Exception e) {
            throw new LlmException("API 请求失败: " + e.getMessage(), e);
        }
    }

    protected ChatResponse handleResponse(HttpResponse<String> response) throws LlmException {
        int statusCode = response.statusCode();
        String body = response.body();
        
        if (statusCode >= 200 && statusCode < 300) {
            try {
                return objectMapper.readValue(body, ChatResponse.class);
            } catch (Exception e) {
                throw new LlmApiException(
                    "解析 API 响应失败: " + e.getMessage() + "\n响应内容: " + truncate(body, 500), 
                    statusCode, body);
            }
        }
        
        String errorMessage = parseErrorMessage(body, statusCode);
        
        switch (statusCode) {
            case 400:
                throw new LlmApiException("请求参数错误: " + errorMessage, statusCode, body);
            case 401:
                throw new LlmApiException(
                    "API Key 无效或已过期。请检查 config.json 中的 apiKey 配置。", statusCode, body);
            case 403:
                throw new LlmApiException(
                    "访问被拒绝。请检查 API Key 权限或账户状态。", statusCode, body);
            case 404:
                throw new LlmApiException(
                    "API 端点不存在。请检查 baseUrl 配置: " + config.getLlm().getBaseUrl(), statusCode, body);
            case 429:
                throw new LlmApiException(
                    "请求过于频繁，已触发限流。请稍后重试。\n" + errorMessage, statusCode, body);
            case 500:
            case 502:
            case 503:
                throw new LlmApiException(
                    "API 服务器错误 (" + statusCode + ")。请稍后重试。", statusCode, body);
            default:
                throw new LlmApiException(
                    "API 请求失败 (HTTP " + statusCode + "): " + errorMessage, statusCode, body);
        }
    }

    protected String parseErrorMessage(String body, int statusCode) {
        if (body == null || body.isEmpty()) {
            return "无错误详情";
        }
        
        try {
            JsonNode root = objectMapper.readTree(body);
            
            if (root.has("error")) {
                JsonNode error = root.get("error");
                if (error.isObject()) {
                    if (error.has("message")) {
                        return error.get("message").asText();
                    }
                    return error.toString();
                }
                return error.asText();
            }
            
            if (root.has("message")) {
                return root.get("message").asText();
            }
            
            return truncate(body, 200);
        } catch (Exception e) {
            return truncate(body, 200);
        }
    }

    protected String truncate(String text, int maxLength) {
        if (text == null) return "";
        if (text.length() <= maxLength) return text;
        return text.substring(0, maxLength) + "...";
    }

    @Override
    public ChatResponse continueWithToolResult(ChatResponse previousResponse, List<Message> messages, String toolCallId, String toolName, String toolResult) throws LlmException {
        if (previousResponse == null) {
            throw new IllegalArgumentException("previousResponse不能为null");
        }
        if (messages == null) {
            messages = new ArrayList<>();
        }
        if (toolCallId == null || toolCallId.isEmpty()) {
            throw new IllegalArgumentException("toolCallId不能为null或空");
        }
        if (toolName == null || toolName.isEmpty()) {
            throw new IllegalArgumentException("toolName不能为null或空");
        }
        
        Message assistantMessage = previousResponse.getFirstMessage();
        if (assistantMessage == null) {
            throw new LlmException("previousResponse中没有有效的消息");
        }
        
        messages.add(assistantMessage);
        messages.add(Message.toolResult(toolCallId, toolName, toolResult != null ? toolResult : ""));
        
        return chat(messages);
    }

    @Override
    public ChatResponse continueWithToolResults(ChatResponse previousResponse, List<Message> messages, List<ToolResult> toolResults) throws LlmException {
        if (previousResponse == null) {
            throw new IllegalArgumentException("previousResponse不能为null");
        }
        if (messages == null) {
            messages = new ArrayList<>();
        }
        if (toolResults == null || toolResults.isEmpty()) {
            throw new IllegalArgumentException("toolResults不能为null或空");
        }
        
        Message assistantMessage = previousResponse.getFirstMessage();
        if (assistantMessage == null) {
            throw new LlmException("previousResponse中没有有效的消息");
        }
        
        messages.add(assistantMessage);
        
        for (ToolResult result : toolResults) {
            messages.add(Message.toolResult(
                result.getToolCallId(), 
                result.getToolName(), 
                result.getResult() != null ? result.getResult() : ""
            ));
        }
        
        return chat(messages);
    }
}
