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
import com.example.agent.llm.model.ContentPart;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.ImagePart;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Usage;
import com.example.agent.llm.retry.RetryPolicy;
import com.example.agent.llm.stream.IdleTimeoutInputStream;
import com.example.agent.llm.stream.SseParser;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.llm.stream.ToolCallDelta;
import com.example.agent.tools.ImageStoreService;
import com.example.agent.config.VisionModelRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

public abstract class AbstractLlmClient implements LlmClient {

    protected static final Logger logger = LoggerFactory.getLogger(AbstractLlmClient.class);
    protected static final int API_TIMEOUT_SECONDS = 60;
    protected static final int STREAM_TIMEOUT_SECONDS = 120;
    protected static final int CONNECT_TIMEOUT_SECONDS = 30;
    /** 流式响应 body 的空闲超时：HttpRequest.timeout() 只覆盖到响应头，
     *  响应头之后逐行读 body 时若连接静默挂起会无限阻塞，由 IdleTimeoutInputStream 兜底。
     *  值应大于 LLM 正常思考/推送间隔（含长 reasoning），60s 较安全。 */
    protected static final int STREAM_IDLE_TIMEOUT_SECONDS = 60;
    protected static final int MAX_TOOL_CALL_INDEX = 1000;
    protected static final int MAX_ARGUMENTS_LENGTH = 100000;
    
    protected final HttpClient httpClient;
    protected final ObjectMapper objectMapper;
    protected final Config config;
    protected final RetryPolicy retryPolicy;
    protected final SseParser sseParser;

    protected final ThreadLocal<InputStream> currentResponseStream = new ThreadLocal<>();
    protected final ThreadLocal<Boolean> aborted = ThreadLocal.withInitial(() -> false);
    protected final ThreadLocal<Supplier<Boolean>> streamCancelCheck = ThreadLocal.withInitial(() -> () -> false);

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

    @Override
    public void abortCurrentRequest() {
        aborted.set(true);
        InputStream stream = currentResponseStream.get();
        if (stream != null) {
            try {
                stream.close();
            } catch (IOException e) {
                logger.debug("关闭 LLM 响应流时出错（可能已关闭）: {}", e.getMessage());
            }
        }
    }

    /**
     * 设置流式读取的取消检查器。
     * 与 {@link #abortCurrentRequest()} 不同，此检查器可被外部线程（如 HTTP 请求线程）设置，
     * 并在流式读取线程中生效，不受 ThreadLocal 隔离的限制。
     *
     * @param check 返回 true 表示应取消当前请求的检查器
     */
    public void setCancelCheck(Supplier<Boolean> check) {
        streamCancelCheck.set(check != null ? check : () -> false);
    }
    
    protected List<Message> applyCacheStrategy(List<Message> messages) {
        if (config.getLlm() != null && config.getLlm().isServerCache()) {
            logger.warn("⚠️ 当前Provider暂不支持服务端缓存，已忽略该配置");
        }
        return messages;
    }

    /**
     * 预处理消息列表：将多模态消息中的 file:// 图片引用转为 data: URI。
     * <p>
     * 消息中的图片以 file:// 路径存储（减小日志体积），发送给 LLM 前
     * 需要读取实际图片文件并转换为 base64 data URI。
     * </p>
     * <p>
     * 如果当前模型不支持视觉，会跳过图片并记录警告。
     * </p>
     */
    protected List<Message> resolveImageReferences(List<Message> messages) {
        // 检查模型是否支持视觉
        boolean visionSupported = VisionModelRegistry.supportsVision(config.getLlm());
        if (!visionSupported) {
            // 检查消息列表中是否包含图片
            boolean hasImages = messages.stream().anyMatch(Message::isMultimodal);
            if (hasImages) {
                logger.warn("⚠️ 当前模型 {} ({}) 不支持视觉，图片将被忽略",
                    config.getLlm().getModel(), config.getLlm().getProvider());
                // 将多模态消息降级为纯文本
                for (Message msg : messages) {
                    if (msg.isMultimodal()) {
                        String text = msg.getContent();
                        msg.setContent(text);
                    }
                }
            }
            return messages;
        }

        ImageStoreService imageStore = new ImageStoreService();
        for (Message msg : messages) {
            if (!msg.isMultimodal()) continue;

            List<ContentPart> parts = msg.getContentParts();
            if (parts == null) continue;

            boolean changed = false;
            List<ContentPart> resolved = new ArrayList<>();
            for (ContentPart part : parts) {
                if (part instanceof ImagePart) {
                    ImagePart img = (ImagePart) part;
                    String url = img.getUrl();
                    if (url != null && url.startsWith("file://")) {
                        try {
                            String dataUri = imageStore.toDataUri(url);
                            if (dataUri != null) {
                                resolved.add(new ImagePart(dataUri));
                                changed = true;
                                continue;
                            } else {
                                logger.warn("图片文件不存在，跳过: {}", url);
                                continue;
                            }
                        } catch (Exception e) {
                            logger.warn("读取图片失败，跳过: {}", url, e);
                            continue;
                        }
                    }
                }
                resolved.add(part);
            }

            if (changed) {
                msg.setContentParts(resolved);
            }
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
        processedMessages = resolveImageReferences(processedMessages);
        
        ChatRequest request = ChatRequest.of(getModel(), processedMessages);
        int maxTokens = config.getLlm().getMaxTokens();
        if (maxTokens > 0) {
            request.maxTokens(maxTokens); // 0=not set, use model default
        }
        
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
            String effort = llmConfig.getReasoningEffort();
            if (effort != null && !effort.isBlank()) {
                request.reasoningEffort(effort); // empty=use model default
            }
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
        processedMessages = resolveImageReferences(processedMessages);
        
        ChatRequest request = ChatRequest.of(getModel(), processedMessages)
                .stream(true);
        int maxTokens = config.getLlm().getMaxTokens();
        if (maxTokens > 0) {
            request.maxTokens(maxTokens); // 0=not set, use model default
        }
        
        applyThinkingConfig(request);
        applyResponseFormat(request);
        
        if (tools != null && !tools.isEmpty()) {
            request.tools(tools).toolChoiceAuto();
        }
        
        return executeStreamRequest(request, onChunk);
    }

    protected ChatResponse executeStreamRequest(ChatRequest request, Consumer<StreamChunk> onChunk) throws LlmException {
        long startMs = System.currentTimeMillis();
        try {
            String requestBody = objectMapper.writeValueAsString(request);
            
            if (requestBody.contains("image_url")) {
                logger.info("[Stream] Request contains image, model={}, bodySize={} bytes",
                    getModel(), requestBody.length());
            }
            
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
            
            HttpResponse<InputStream> response = httpClient.send(
                    httpRequest, 
                    HttpResponse.BodyHandlers.ofInputStream()
            );
            
            long latencyMs = System.currentTimeMillis() - startMs;
            logger.debug("📥 流式 LLM 响应首包，耗时: {} ms，状态: {}", latencyMs, response.statusCode());
            
            this.currentResponseStream.set(response.body());
            this.aborted.set(false);
            
            ChatResponse chatResponse;
            try {
                chatResponse = processStreamResponse(response, onChunk);
            } finally {
                this.currentResponseStream.remove();
                this.aborted.remove();
                this.streamCancelCheck.remove();
            }
            
            long totalLatencyMs = System.currentTimeMillis() - startMs;
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(),
                    getModel(),
                    chatResponse.getUsage() != null ? chatResponse.getUsage().getPromptTokens() : 0,
                    chatResponse.getUsage() != null ? chatResponse.getUsage().getCompletionTokens() : 0,
                    totalLatencyMs,
                    true
            ));
            
            return chatResponse;
            
        } catch (LlmException e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(),
                    getModel(),
                    0,
                    0,
                    System.currentTimeMillis() - startMs,
                    false
            ));
            throw e;
        } catch (java.net.http.HttpTimeoutException e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(),
                    getModel(),
                    0, 0,
                    System.currentTimeMillis() - startMs,
                    false
            ));
            throw new LlmTimeoutException(
                "流式请求超时（" + STREAM_TIMEOUT_SECONDS + "秒）。请检查网络连接或稍后重试。", 
                STREAM_TIMEOUT_SECONDS, e);
        } catch (java.net.SocketTimeoutException e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(),
                    getModel(),
                    0, 0,
                    System.currentTimeMillis() - startMs,
                    false
            ));
            throw new LlmTimeoutException(
                "流式响应读取空闲超时（超过 " + STREAM_IDLE_TIMEOUT_SECONDS + " 秒无数据），连接可能已挂起。",
                STREAM_IDLE_TIMEOUT_SECONDS, e);
        } catch (java.net.ConnectException e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(),
                    getModel(),
                    0, 0,
                    System.currentTimeMillis() - startMs,
                    false
            ));
            throw new LlmConnectionException(
                "无法连接到 API 服务器: " + config.getLlm().getBaseUrl() + "。请检查网络连接。", 
                config.getLlm().getBaseUrl(), e);
        } catch (Exception e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(),
                    getModel(),
                    0, 0,
                    System.currentTimeMillis() - startMs,
                    false
            ));
            throw new LlmException("流式请求失败: " + e.getMessage(), e);
        }
    }

    /**
     * 包装流式响应 body，增加空闲超时保护。
     * <p>
     * {@code HttpRequest.timeout()} 只覆盖"发送请求 → 收到响应头"；响应头之后逐行
     * 读取 body 时若服务端/网络静默挂起，{@code readLine()} 会无限阻塞（与 SSE 写入
     * 阻塞同类的镜像问题）。由 {@link IdleTimeoutInputStream} 看门狗兜底：距上次成功
     * 读取超过 {@link #STREAM_IDLE_TIMEOUT_SECONDS} 秒即判定挂起并中断。
     */
    protected InputStream wrapStreamBody(InputStream body) {
        return new IdleTimeoutInputStream(body, STREAM_IDLE_TIMEOUT_SECONDS * 1000L, getProviderName());
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
                throw LlmApiException.classify(getProviderName(), statusCode, body);
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
        
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(wrapStreamBody(response.body()), StandardCharsets.UTF_8));
            
            String line;
            while ((line = reader.readLine()) != null) {
                // 检查外部取消信号（如用户点击停止按钮）
                // 使用共享的 SessionCancelManager（非 ThreadLocal），可被其他线程设置
                Supplier<Boolean> cancelCheck = streamCancelCheck.get();
                if (cancelCheck != null && cancelCheck.get()) {
                    logger.debug("收到外部取消信号，主动关闭流式读取 (已收集 content={}字符, reasoning={}字符)",
                        fullContent.length(), fullReasoning.length());
                    reader.close();
                    break;
                }
                
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
                
                boolean delivered = false;
                
                if (chunk.hasContent()) {
                    contentChunkCount++;
                    fullContent.append(chunk.getContent());
                    if (onChunk != null) {
                        onChunk.accept(chunk);
                        delivered = true;
                    }
                }
                
                if (chunk.hasReasoning()) {
                    reasoningChunkCount++;
                    fullReasoning.append(chunk.getReasoning());
                    if (onChunk != null) {
                        onChunk.accept(chunk);
                        delivered = true;
                    }
                }
                
                if (chunk.isToolCall() && chunk.hasToolCalls()) {
                    toolCallChunkCount++;
                    mergeToolCallDeltas(toolCalls, chunk.getToolCallDeltas());
                    if (onChunk != null) {
                        onChunk.accept(chunk);
                        delivered = true;
                    }
                }
                
                if (chunk.getFinishReason() != null) {
                    finishReason = chunk.getFinishReason();
                }
                
                if (chunk.hasUsage()) {
                    usage = chunk.getUsage();
                    // 纯 usage chunk（如 OpenAI 兼容协议最后一帧仅含 usage）也要传出，
                    // 让上层能实时感知"回合结束、usage 已就绪"并立即校准 Token 状态栏。
                    // 若本 chunk 已携带 content/reasoning/toolCall 被 accept 过（usage 同帧），
                    // 无需重复 accept，上层已能从同一 chunk 中读取 usage。
                    if (onChunk != null && !delivered) {
                        onChunk.accept(chunk);
                        delivered = true;
                    }
                }
            }
            
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            Supplier<Boolean> cancelCheck = streamCancelCheck.get();
            if (aborted.get() || (cancelCheck != null && cancelCheck.get())) {
                logger.info("LLM 流式请求被主动中止，返回已收集的部分响应 (content={}字符, reasoning={}字符, toolCalls={})",
                    fullContent.length(), fullReasoning.length(), toolCalls.size());
                return buildChatResponse(fullContent.toString(), fullReasoning.toString(), toolCalls, finishReason, usage);
            }
            if (e instanceof LlmException) {
                throw (LlmException) e;
            }
            throw new LlmException("读取流式响应失败: " + e.getMessage(), e);
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (IOException ignored) {
                }
            }
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
            // 诊断：检查每个工具调用的参数是否为合法 JSON（截断/不完整会导致工具执行失败）
            for (int i = 0; i < toolCalls.size(); i++) {
                ToolCall tc = toolCalls.get(i);
                if (tc.getFunction() == null) continue;
                String args = tc.getFunction().getArguments();
                if (args == null || args.isEmpty()) {
                    logger.warn("[LlmStream] ToolCall[{}] 参数为空: name={}, id={}", i,
                        tc.getFunction().getName(), tc.getId());
                } else if (!isValidJson(args)) {
                    logger.warn("[LlmStream] ToolCall[{}] 参数不是合法 JSON（可能被截断）: name={}, id={}, argsChars={}, 前200字符={}",
                        i, tc.getFunction().getName(), tc.getId(), args.length(), truncateForLog(args, 200));
                }
            }
        }

        // ── 诊断：流式回合结束完整状态（定位"工具调用后停止/无最终回复"问题） ──
        StringBuilder diag = new StringBuilder(256);
        diag.append("finishReason=").append(finishReason == null ? "null" : finishReason)
            .append(", contentChars=").append(fullContent.length())
            .append(", reasoningChars=").append(fullReasoning.length())
            .append(", toolCalls=").append(toolCalls.size())
            .append(", usage=").append(usage != null
                ? ("prompt=" + usage.getPromptTokens() + ",completion=" + usage.getCompletionTokens())
                : "null");
        for (int i = 0; i < toolCalls.size(); i++) {
            ToolCall tc = toolCalls.get(i);
            String name = tc.getFunction() != null ? tc.getFunction().getName() : "null";
            String args = tc.getFunction() != null ? tc.getFunction().getArguments() : null;
            diag.append(" | tc[").append(i).append("] name=").append(name)
                .append(" argsChars=").append(args == null ? -1 : args.length())
                .append(" jsonValid=").append(args == null ? "n/a" : isValidJson(args));
        }
        logger.info("[LlmStream] 回合结束: {}", diag);

        return buildChatResponse(fullContent.toString(), fullReasoning.toString(), toolCalls, finishReason, usage);
    }

    /** 判断字符串是否为合法 JSON（对象或数组） */
    protected boolean isValidJson(String text) {
        if (text == null || text.isBlank()) {
            return false;
        }
        try {
            JsonNode node = objectMapper.readTree(text);
            return node != null && (node.isObject() || node.isArray());
        } catch (Exception e) {
            return false;
        }
    }

    /** 截断超长文本用于日志输出 */
    protected static String truncateForLog(String text, int maxChars) {
        if (text == null) {
            return "null";
        }
        if (text.length() <= maxChars) {
            return text;
        }
        return text.substring(0, maxChars) + "...";
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
                        // 诊断：记录截断详情（工具名在流式分片中可能尚未完整，index 一定可用）
                        String knownName = func.getName() != null ? func.getName() : "(未知/分片中)";
                        logger.warn("[LlmStream] ToolCall arguments超过上限被截断: index={}, name={}, {} -> {} 字符, 截断后JSON合法={}",
                            index, knownName, newArgs.length(), MAX_ARGUMENTS_LENGTH,
                            isValidJson(newArgs.substring(0, MAX_ARGUMENTS_LENGTH)));
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
            
            if (requestBody.contains("image_url")) {
                logger.info("[NonStream] Request contains image, model={}, bodySize={} bytes",
                    getModel(), requestBody.length());
            }
            
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
        
        // 统一走 LlmErrorClassifier 归一化：按 (provider, statusCode, body) 分类，
        // message 为面向用户的友好文案，errorCode 为稳定业务错误码（供 SSE/前端渲染）。
        throw LlmApiException.classify(getProviderName(), statusCode, body);
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
