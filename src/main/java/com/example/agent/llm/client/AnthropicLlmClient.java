package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.core.event.EventBus;
import com.example.agent.core.event.LlmRequestEvent;
import com.example.agent.llm.exception.LlmApiException;
import com.example.agent.llm.exception.LlmConnectionException;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.exception.LlmTimeoutException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Choice;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Usage;
import com.example.agent.llm.retry.RetryPolicy;
import com.example.agent.llm.stream.StreamChunk;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;

/**
 * Anthropic Claude API 客户端。
 * <p>
 * 使用 Anthropic Messages API 格式，兼容 OpenAI 格式差异：
 * <ul>
 *   <li>认证使用 x-api-key 头而非 Authorization: Bearer</li>
 *   <li>需额外携带 anthropic-version 头</li>
 *   <li>system 提示为独立字段，不在 messages 数组中</li>
 *   <li>响应内容为 content block 数组格式</li>
 *   <li>SSE 流式事件格式不同（命名事件, 非 choices 结构）</li>
 *   <li>工具调用使用 tool_use content block</li>
 * </ul>
 * </p>
 */
public class AnthropicLlmClient extends AbstractLlmClient {

    private static final String CHAT_COMPLETIONS_PATH = "/v1/messages";
    private static final String DEFAULT_BASE_URL = "https://api.anthropic.com";
    private static final String DEFAULT_MODEL = "claude-sonnet-4-20250514";
    private static final String ANTHROPIC_VERSION = "2023-06-01";
    private static final int DEFAULT_MAX_TOKENS_ANTHROPIC = 4096;

    public AnthropicLlmClient() {
        this(Config.getInstance());
    }

    public AnthropicLlmClient(Config config) {
        this(config, RetryPolicy.defaultPolicy());
    }

    public AnthropicLlmClient(Config config, RetryPolicy retryPolicy) {
        super(config, retryPolicy);
    }

    @Override
    protected String getChatCompletionsPath() {
        return CHAT_COMPLETIONS_PATH;
    }

    @Override
    protected String getAuthorizationHeader() {
        // Anthropic 不使用 Authorization 头
        return null;
    }

    @Override
    protected void enrichRequestHeaders(HttpRequest.Builder builder) {
        LlmConfig llmConfig = config.getLlm();
        if (llmConfig != null && llmConfig.getApiKey() != null) {
            builder.header("x-api-key", llmConfig.getApiKey());
        }
        builder.header("anthropic-version", ANTHROPIC_VERSION);
    }

    @Override
    public String getDefaultBaseUrl() {
        return DEFAULT_BASE_URL;
    }

    @Override
    public String getDefaultModel() {
        return DEFAULT_MODEL;
    }

    public static String getDefaultBaseUrlStatic() {
        return DEFAULT_BASE_URL;
    }

    public static String getDefaultModelStatic() {
        return DEFAULT_MODEL;
    }

    @Override
    public String getProviderName() {
        return "anthropic";
    }

    // ========================================================================
    //  请求体构建
    // ========================================================================

    /**
     * 构建 Anthropic Messages API 请求体 JSON。
     * 处理 system/messages/tools/thinking 等格式差异。
     */
    protected String buildAnthropicRequestBody(String model, List<Message> messages,
                                                List<com.example.agent.llm.model.Tool> tools,
                                                boolean stream, int maxTokens) throws Exception {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", model);
        body.put("max_tokens", maxTokens);
        if (stream) {
            body.put("stream", true);
        }

        // 提取 system 提示（Anthropic 的 system 是独立字段）
        StringBuilder systemBuilder = new StringBuilder();
        List<ObjectNode> apiMessages = new ArrayList<>();

        for (Message msg : messages) {
            if ("system".equals(msg.getRole())) {
                if (msg.getContent() != null) {
                    systemBuilder.append(msg.getContent()).append("\n");
                }
                continue;
            }

            if ("tool".equals(msg.getRole())) {
                // tool role → user 消息 + tool_result content block
                ObjectNode toolUserNode = objectMapper.createObjectNode();
                toolUserNode.put("role", "user");
                ArrayNode contentArray = objectMapper.createArrayNode();
                ObjectNode toolResultBlock = objectMapper.createObjectNode();
                toolResultBlock.put("type", "tool_result");
                toolResultBlock.put("tool_use_id", msg.getToolCallId());
                toolResultBlock.put("content", msg.getContent() != null ? msg.getContent() : "");
                contentArray.add(toolResultBlock);
                toolUserNode.set("content", contentArray);
                apiMessages.add(toolUserNode);
                continue;
            }

            ObjectNode apiMsg = objectMapper.createObjectNode();
            apiMsg.put("role", msg.getRole());

            if (msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
                // assistant 消息含工具调用 → content 为 tool_use 块数组
                ArrayNode contentArray = objectMapper.createArrayNode();

                // 如果有文本内容，加 text block
                if (msg.getContent() != null && !msg.getContent().isEmpty()) {
                    ObjectNode textBlock = objectMapper.createObjectNode();
                    textBlock.put("type", "text");
                    textBlock.put("text", msg.getContent());
                    contentArray.add(textBlock);
                }

                // 工具调用转为 tool_use block
                for (ToolCall tc : msg.getToolCalls()) {
                    if (tc.getFunction() == null) continue;
                    ObjectNode toolUseBlock = objectMapper.createObjectNode();
                    toolUseBlock.put("type", "tool_use");
                    toolUseBlock.put("id", tc.getId());
                    toolUseBlock.put("name", tc.getFunction().getName());
                    // 解析 arguments JSON
                    String args = tc.getFunction().getArguments();
                    if (args != null && !args.isEmpty()) {
                        try {
                            toolUseBlock.set("input", objectMapper.readTree(args));
                        } catch (Exception e) {
                            toolUseBlock.put("input", args);
                        }
                    } else {
                        toolUseBlock.set("input", objectMapper.createObjectNode());
                    }
                    contentArray.add(toolUseBlock);
                }
                apiMsg.set("content", contentArray);
            } else {
                apiMsg.put("content", msg.getContent() != null ? msg.getContent() : "");
            }
            apiMessages.add(apiMsg);
        }

        // system 字段
        String systemText = systemBuilder.toString().trim();
        if (!systemText.isEmpty()) {
            body.put("system", systemText);
        }

        body.set("messages", objectMapper.valueToTree(apiMessages));

        // tools
        if (tools != null && !tools.isEmpty()) {
            ArrayNode toolsArray = objectMapper.createArrayNode();
            for (com.example.agent.llm.model.Tool tool : tools) {
                if (tool.getFunction() == null) continue;
                ObjectNode toolNode = objectMapper.createObjectNode();
                toolNode.put("name", tool.getFunction().getName());
                if (tool.getFunction().getDescription() != null) {
                    toolNode.put("description", tool.getFunction().getDescription());
                }
                if (tool.getFunction().getParameters() != null) {
                    toolNode.set("input_schema", objectMapper.valueToTree(tool.getFunction().getParameters()));
                } else {
                    ObjectNode defaultSchema = objectMapper.createObjectNode();
                    defaultSchema.put("type", "object");
                    defaultSchema.set("properties", objectMapper.createObjectNode());
                    toolNode.set("input_schema", defaultSchema);
                }
                toolsArray.add(toolNode);
            }
            if (toolsArray.size() > 0) {
                body.set("tools", toolsArray);
            }
        }

        // thinking (extended thinking)
        if (config.getLlm() != null && config.getLlm().isThinkingEnabled()) {
            ObjectNode thinking = objectMapper.createObjectNode();
            thinking.put("type", "enabled");
            int budgetTokens = Math.min(Math.max(maxTokens, 4096) / 2, 32000);
            thinking.put("budget_tokens", budgetTokens);
            body.set("thinking", thinking);
        }

        return objectMapper.writeValueAsString(body);
    }

    // ========================================================================
    //  非流式请求
    // ========================================================================

    @Override
    protected ChatResponse doExecuteRequest(com.example.agent.llm.model.ChatRequest request) throws LlmException {
        try {
            String requestBody = buildAnthropicRequestBody(
                request.getModel(),
                request.getMessages(),
                request.getTools(),
                false,
                resolveMaxTokens(request.getMaxTokens())
            );

            String url = buildUrl(getBaseUrl(), getChatCompletionsPath());

            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .timeout(Duration.ofSeconds(API_TIMEOUT_SECONDS));

            enrichRequestHeaders(requestBuilder);

            HttpRequest httpRequest = requestBuilder.build();

            logger.debug("📤 Anthropic 请求，模型: {}，大小: {} 字节", getModel(), requestBody.length());
            long startMs = System.currentTimeMillis();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            long latencyMs = System.currentTimeMillis() - startMs;
            logger.debug("📥 Anthropic 响应，耗时: {} ms，状态: {}", latencyMs, response.statusCode());

            return parseAnthropicResponse(response);

        } catch (LlmException e) {
            throw e;
        } catch (java.net.http.HttpTimeoutException e) {
            throw new LlmTimeoutException("API 请求超时（" + API_TIMEOUT_SECONDS + "秒）。请检查网络连接或稍后重试。", API_TIMEOUT_SECONDS, e);
        } catch (java.net.ConnectException e) {
            throw new LlmConnectionException("无法连接到 API 服务器: " + config.getLlm().getBaseUrl() + "。请检查网络连接。", config.getLlm().getBaseUrl(), e);
        } catch (Exception e) {
            throw new LlmException("API 请求失败: " + e.getMessage(), e);
        }
    }

    /**
     * 解析 Anthropic 非流式响应为统一的 ChatResponse 格式。
     */
    protected ChatResponse parseAnthropicResponse(HttpResponse<String> response) throws LlmException {
        int statusCode = response.statusCode();
        String body = response.body();

        if (statusCode < 200 || statusCode >= 300) {
            String errorMessage = parseAnthropicError(body, statusCode);
            throw new LlmApiException("Anthropic API 返回错误 (HTTP " + statusCode + "): " + errorMessage, statusCode, body);
        }

        try {
            JsonNode root = objectMapper.readTree(body);

            ChatResponse chatResponse = new ChatResponse();
            chatResponse.setId(getTextValue(root, "id"));
            chatResponse.setObject("chat.completion");
            chatResponse.setCreated(System.currentTimeMillis() / 1000);
            chatResponse.setModel(getTextValue(root, "model"));

            // usage
            JsonNode usageNode = root.get("usage");
            if (usageNode != null) {
                Usage usage = new Usage();
                if (usageNode.has("input_tokens")) {
                    usage.setPromptTokens(usageNode.get("input_tokens").asInt());
                }
                if (usageNode.has("output_tokens")) {
                    usage.setCompletionTokens(usageNode.get("output_tokens").asInt());
                }
                if (usageNode.has("cache_creation_input_tokens")) {
                    usage.setPromptCacheHitTokens(usageNode.get("cache_creation_input_tokens").asInt());
                }
                if (usageNode.has("cache_read_input_tokens")) {
                    usage.setPromptCacheMissTokens(usageNode.get("cache_read_input_tokens").asInt());
                }
                usage.setTotalTokens(usage.getPromptTokens() + usage.getCompletionTokens());
                chatResponse.setUsage(usage);
            }

            // content blocks → message text + tool calls
            StringBuilder contentBuilder = new StringBuilder();
            StringBuilder reasoningBuilder = new StringBuilder();
            List<ToolCall> toolCalls = new ArrayList<>();

            JsonNode contentArray = root.get("content");
            if (contentArray != null && contentArray.isArray()) {
                for (JsonNode block : contentArray) {
                    String type = getTextValue(block, "type");
                    if ("text".equals(type)) {
                        contentBuilder.append(getTextValue(block, "text"));
                    } else if ("thinking".equals(type)) {
                        reasoningBuilder.append(getTextValue(block, "thinking"));
                    } else if ("tool_use".equals(type)) {
                        ToolCall tc = new ToolCall();
                        tc.setId(getTextValue(block, "id"));
                        tc.setType("function");
                        FunctionCall func = new FunctionCall();
                        func.setName(getTextValue(block, "name"));
                        JsonNode input = block.get("input");
                        if (input != null) {
                            func.setArguments(input.toString());
                        }
                        tc.setFunction(func);
                        toolCalls.add(tc);
                    }
                }
            }

            // stop_reason → finish_reason
            String stopReason = getTextValue(root, "stop_reason");
            String finishReason = mapStopReason(stopReason);

            Message message = new Message();
            message.setRole("assistant");
            String text = contentBuilder.toString();
            if (!text.isEmpty()) {
                message.setContent(text);
            }
            String reasoning = reasoningBuilder.toString();
            if (!reasoning.isEmpty()) {
                message.setReasoningContent(reasoning);
            }
            if (!toolCalls.isEmpty()) {
                message.setToolCalls(toolCalls);
            }

            Choice choice = new Choice();
            choice.setIndex(0);
            choice.setMessage(message);
            choice.setFinishReason(finishReason);

            chatResponse.setChoices(List.of(choice));

            return chatResponse;

        } catch (Exception e) {
            throw new LlmApiException("解析 Anthropic 响应失败: " + e.getMessage(), statusCode, body);
        }
    }

    // ========================================================================
    //  流式请求
    // ========================================================================

    @Override
    protected ChatResponse executeStreamRequest(
            com.example.agent.llm.model.ChatRequest request,
            Consumer<StreamChunk> onChunk) throws LlmException {

        long startMs = System.currentTimeMillis();
        try {
            String requestBody = buildAnthropicRequestBody(
                request.getModel(),
                request.getMessages(),
                request.getTools(),
                true,
                resolveMaxTokens(request.getMaxTokens())
            );

            String url = buildUrl(getBaseUrl(), getChatCompletionsPath());

            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .timeout(Duration.ofSeconds(STREAM_TIMEOUT_SECONDS));

            enrichRequestHeaders(requestBuilder);

            HttpRequest httpRequest = requestBuilder.build();

            logger.debug("📤 Anthropic 流式请求，模型: {}，大小: {} 字节，超时: {} 秒",
                    getModel(), requestBody.length(), STREAM_TIMEOUT_SECONDS);

            HttpResponse<InputStream> response = httpClient.send(
                    httpRequest,
                    HttpResponse.BodyHandlers.ofInputStream()
            );

            long latencyMs = System.currentTimeMillis() - startMs;
            logger.debug("📥 Anthropic 流式首包，耗时: {} ms，状态: {}", latencyMs, response.statusCode());

            this.currentResponseStream.set(response.body());
            this.aborted.set(false);

            ChatResponse chatResponse;
            try {
                chatResponse = processAnthropicStream(response, onChunk);
            } finally {
                this.currentResponseStream.remove();
                this.aborted.remove();
                this.streamCancelCheck.remove();
            }

            long totalLatencyMs = System.currentTimeMillis() - startMs;
            if (chatResponse.getUsage() != null) {
                EventBus.publish(new LlmRequestEvent(
                        getProviderName(), getModel(),
                        chatResponse.getUsage().getPromptTokens(),
                        chatResponse.getUsage().getCompletionTokens(),
                        totalLatencyMs, true
                ));
            }

            return chatResponse;

        } catch (LlmException e) {
            EventBus.publish(new LlmRequestEvent(getProviderName(), getModel(), 0, 0, System.currentTimeMillis() - startMs, false));
            throw e;
        } catch (java.net.http.HttpTimeoutException e) {
            EventBus.publish(new LlmRequestEvent(getProviderName(), getModel(), 0, 0, System.currentTimeMillis() - startMs, false));
            throw new LlmTimeoutException("流式请求超时（" + STREAM_TIMEOUT_SECONDS + "秒）。请检查网络连接或稍后重试。", STREAM_TIMEOUT_SECONDS, e);
        } catch (java.net.ConnectException e) {
            EventBus.publish(new LlmRequestEvent(getProviderName(), getModel(), 0, 0, System.currentTimeMillis() - startMs, false));
            throw new LlmConnectionException("无法连接到 API 服务器: " + config.getLlm().getBaseUrl() + "。请检查网络连接。", config.getLlm().getBaseUrl(), e);
        } catch (Exception e) {
            EventBus.publish(new LlmRequestEvent(getProviderName(), getModel(), 0, 0, System.currentTimeMillis() - startMs, false));
            throw new LlmException("流式请求失败: " + e.getMessage(), e);
        }
    }

    /**
     * 解析 Anthropic SSE 流式事件。
     * <p>
     * Anthropic 使用命名事件格式：
     * <pre>
     * event: message_start
     * data: {"type":"message_start","message":{...}}
     *
     * event: content_block_start
     * data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}
     *
     * event: content_block_delta
     * data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
     *
     * event: content_block_stop
     * data: {"type":"content_block_stop","index":0}
     *
     * event: message_delta
     * data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":25}}
     *
     * event: message_stop
     * data: {"type":"message_stop"}
     * </pre>
     * </p>
     */
    protected ChatResponse processAnthropicStream(
            HttpResponse<InputStream> response,
            Consumer<StreamChunk> onChunk) throws LlmException {

        int statusCode = response.statusCode();

        if (statusCode < 200 || statusCode >= 300) {
            try {
                String body = new String(response.body().readAllBytes(), StandardCharsets.UTF_8);
                String errorMessage = parseAnthropicError(body, statusCode);
                throw new LlmApiException("Anthropic API 返回错误 (HTTP " + statusCode + "): " + errorMessage, statusCode, body);
            } catch (Exception e) {
                if (e instanceof LlmException) throw (LlmException) e;
                throw new LlmApiException("Anthropic API 返回错误 (HTTP " + statusCode + ")", statusCode, null);
            }
        }

        StringBuilder fullContent = new StringBuilder();
        StringBuilder fullReasoning = new StringBuilder();
        List<ToolCall> toolCalls = new ArrayList<>();
        String finishReason = null;
        Usage usage = null;
        String messageId = null;
        String messageModel = null;

        // 流式构建中的 tool_use
        ToolCall currentToolCall = null;

        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8));

            String line;
            String currentEvent = null;

            while ((line = reader.readLine()) != null) {
                java.util.function.Supplier<Boolean> cancelCheck = streamCancelCheck.get();
                if (cancelCheck != null && cancelCheck.get()) {
                    logger.debug("收到外部取消信号，主动关闭流式读取");
                    reader.close();
                    break;
                }
                if (Thread.currentThread().isInterrupted()) {
                    Thread.interrupted();
                    break;
                }

                if (line.startsWith("event: ")) {
                    currentEvent = line.substring("event: ".length()).trim();
                    continue;
                }

                if (line.startsWith("data: ")) {
                    String data = line.substring("data: ".length()).trim();
                    if (data.isEmpty()) continue;

                    try {
                        JsonNode eventData = objectMapper.readTree(data);
                        String type = getTextValue(eventData, "type");

                        if ("message_start".equals(type)) {
                            JsonNode msg = eventData.get("message");
                            if (msg != null) {
                                messageId = getTextValue(msg, "id");
                                messageModel = getTextValue(msg, "model");
                            }

                        } else if ("content_block_start".equals(type)) {
                            JsonNode block = eventData.get("content_block");
                            if (block != null) {
                                String blockType = getTextValue(block, "type");
                                if ("text".equals(blockType)) {
                                    // text block start – no content yet
                                } else if ("thinking".equals(blockType)) {
                                    // thinking block start
                                } else if ("tool_use".equals(blockType)) {
                                    currentToolCall = new ToolCall();
                                    currentToolCall.setId(getTextValue(block, "id"));
                                    currentToolCall.setType("function");
                                    FunctionCall func = new FunctionCall();
                                    func.setName(getTextValue(block, "name"));
                                    func.setArguments("");
                                    currentToolCall.setFunction(func);
                                }
                            }

                        } else if ("content_block_delta".equals(type)) {
                            JsonNode delta = eventData.get("delta");
                            if (delta != null) {
                                String deltaType = getTextValue(delta, "type");
                                String text = getTextValue(delta, "text");
                                String thinking = getTextValue(delta, "thinking");

                                if ("text_delta".equals(deltaType) && text != null) {
                                    fullContent.append(text);
                                    if (onChunk != null) {
                                        StreamChunk chunk = new StreamChunk();
                                        chunk.setContent(text);
                                        onChunk.accept(chunk);
                                    }
                                } else if ("thinking_delta".equals(deltaType) && thinking != null) {
                                    fullReasoning.append(thinking);
                                    if (onChunk != null) {
                                        StreamChunk chunk = new StreamChunk();
                                        chunk.setReasoning(thinking);
                                        onChunk.accept(chunk);
                                    }
                                } else if ("input_json_delta".equals(deltaType)) {
                                    String partialJson = getTextValue(delta, "partial_json");
                                    if (partialJson != null && currentToolCall != null && currentToolCall.getFunction() != null) {
                                        String currentArgs = currentToolCall.getFunction().getArguments();
                                        currentToolCall.getFunction().setArguments(
                                            (currentArgs != null ? currentArgs : "") + partialJson
                                        );
                                    }
                                }
                            }

                        } else if ("content_block_stop".equals(type)) {
                            if (currentToolCall != null) {
                                toolCalls.add(currentToolCall);
                                currentToolCall = null;
                            }

                        } else if ("message_delta".equals(type)) {
                            JsonNode delta = eventData.get("delta");
                            if (delta != null) {
                                String reason = getTextValue(delta, "stop_reason");
                                if (reason != null) {
                                    finishReason = mapStopReason(reason);
                                }
                            }
                            JsonNode usageNode = eventData.get("usage");
                            if (usageNode != null) {
                                Usage u = new Usage();
                                if (usageNode.has("output_tokens")) {
                                    u.setCompletionTokens(usageNode.get("output_tokens").asInt());
                                }
                                if (usageNode.has("input_tokens")) {
                                    u.setPromptTokens(usageNode.get("input_tokens").asInt());
                                }
                                u.setTotalTokens(u.getPromptTokens() + u.getCompletionTokens());
                                // 前面 message_start 的 usage 里有 input_tokens
                                if (usage != null) {
                                    u.setPromptTokens(usage.getPromptTokens());
                                    u.setPromptCacheHitTokens(usage.getPromptCacheHitTokens());
                                    u.setPromptCacheMissTokens(usage.getPromptCacheMissTokens());
                                }
                                usage = u;
                            }

                        } else if ("message_stop".equals(type)) {
                            break;

                        } else if ("ping".equals(type)) {
                            // 心跳，忽略
                        } else if ("error".equals(type)) {
                            JsonNode error = eventData.get("error");
                            String errMsg = error != null ? error.toString() : "未知错误";
                            throw new LlmApiException("Anthropic 流式错误: " + errMsg, 0, data);
                        }
                    } catch (LlmException e) {
                        throw e;
                    } catch (Exception e) {
                        logger.warn("解析 Anthropic SSE 事件失败: {}", e.getMessage());
                    }
                }
            }

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            if (aborted.get() || (streamCancelCheck.get() != null && streamCancelCheck.get().get())) {
                logger.info("Anthropic 流式请求被主动中止，返回已收集的部分响应");
                return buildAnthropicChatResponse(fullContent.toString(), fullReasoning.toString(), toolCalls, finishReason, usage, messageId, messageModel);
            }
            if (e instanceof LlmException) throw (LlmException) e;
            throw new LlmException("读取 Anthropic 流式响应失败: " + e.getMessage(), e);
        } finally {
            if (reader != null) {
                try { reader.close(); } catch (IOException ignored) {}
            }
        }

        return buildAnthropicChatResponse(fullContent.toString(), fullReasoning.toString(), toolCalls, finishReason, usage, messageId, messageModel);
    }

    private ChatResponse buildAnthropicChatResponse(String content, String reasoning, List<ToolCall> toolCalls,
                                                     String finishReason, Usage usage, String id, String model) {
        ChatResponse response = new ChatResponse();
        response.setId(id != null ? id : "stream-" + System.currentTimeMillis());
        response.setObject("chat.completion");
        response.setCreated(System.currentTimeMillis() / 1000);
        response.setModel(model != null ? model : getModel());
        if (usage != null) {
            response.setUsage(usage);
        }

        Message message = new Message();
        message.setRole("assistant");
        if (content != null && !content.isEmpty()) {
            message.setContent(content);
        }
        if (reasoning != null && !reasoning.isEmpty()) {
            message.setReasoningContent(reasoning);
        }
        if (!toolCalls.isEmpty()) {
            List<ToolCall> valid = new ArrayList<>();
            for (ToolCall tc : toolCalls) {
                if (tc.getFunction() != null && tc.getFunction().getName() != null && !tc.getFunction().getName().isEmpty()) {
                    valid.add(tc);
                }
            }
            if (!valid.isEmpty()) {
                message.setToolCalls(valid);
            }
        }

        Choice choice = new Choice();
        choice.setIndex(0);
        choice.setMessage(message);
        choice.setFinishReason(finishReason);
        response.setChoices(List.of(choice));

        return response;
    }

    // ========================================================================
    //  工具方法
    // ========================================================================

    /**
     * 解析最终使用的 maxTokens 值。
     * Anthropic API 要求 max_tokens 为必填字段，所以当未设置时使用默认值。
     */
    private int resolveMaxTokens(Integer requestMaxTokens) {
        if (requestMaxTokens != null && requestMaxTokens > 0) return requestMaxTokens;
        int configMax = config.getLlm().getMaxTokens();
        return configMax > 0 ? configMax : DEFAULT_MAX_TOKENS_ANTHROPIC;
    }

    private String mapStopReason(String anthropicReason) {
        if (anthropicReason == null) return null;
        switch (anthropicReason) {
            case "end_turn": return "stop";
            case "max_tokens": return "length";
            case "tool_use": return "tool_calls";
            case "stop_sequence": return "stop";
            default: return anthropicReason;
        }
    }

    private String parseAnthropicError(String body, int statusCode) {
        if (body == null || body.isEmpty()) return "无错误详情";
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode error = root.get("error");
            if (error != null) {
                String msg = getTextValue(error, "message");
                if (msg != null) return msg;
                return error.toString();
            }
            return truncate(body, 200);
        } catch (Exception e) {
            return truncate(body, 200);
        }
    }

    private String getTextValue(JsonNode node, String field) {
        if (node == null || !node.has(field)) return null;
        JsonNode fieldNode = node.get(field);
        return fieldNode.isNull() ? null : fieldNode.asText();
    }

    // 非流式请求路径复用父类 executeRequest（委托到 doExecuteRequest）
}
