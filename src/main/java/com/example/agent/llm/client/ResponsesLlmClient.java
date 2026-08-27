package com.example.agent.llm.client;

import com.example.agent.config.Config;
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
import com.example.agent.llm.model.PromptTokensDetails;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.Usage;
import com.example.agent.llm.model.WebSearchAction;
import com.example.agent.llm.retry.RetryPolicy;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.llm.stream.ToolCallDelta;
import com.example.agent.tools.ImageStoreService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * DeepSeek Responses API 客户端（OpenAI Responses 协议）。
 * <p>
 * 通过 OpenAI 的 Responses API 格式调用 DeepSeek 模型（当前仅 deepseek-v4-flash），
 * 与 Chat Completions 的差异：
 * <ul>
 *   <li>端点：POST {base_url}/responses（默认 base_url 为 https://api.deepseek.com）</li>
 *   <li>请求体：input items + instructions（system 消息独立提取）</li>
 *   <li>响应：output item 数组（reasoning / message / function_call / web_search_call）</li>
 *   <li>流式：语义化命名事件（response.output_text.delta 等），无 data: [DONE]，
 *       以 response.completed / response.incomplete / response.failed 收尾</li>
 *   <li>无状态 API：不支持 previous_response_id / conversation，每次请求传完整 input</li>
 *   <li>服务端自动管理上下文缓存；web_search 工具由服务端执行</li>
 * </ul>
 * </p>
 */
public class ResponsesLlmClient extends AbstractLlmClient {

    private static final Logger logger = LoggerFactory.getLogger(ResponsesLlmClient.class);

    private static final String RESPONSES_PATH = "/responses";
    private static final String DEFAULT_BASE_URL = "https://api.deepseek.com";
    private static final String DEFAULT_MODEL = "deepseek-v4-flash";

    /**
     * Responses API 对"发送了 function_call_output 但找不到对应 function_call"的 400 错误标记。
     * 命中此错误时执行一次自愈重试（剔除孤立 tool 消息后重发）。
     */
    private static final String ORPHAN_TOOL_CALL_ERROR_MARKER = "No tool call found";

    public ResponsesLlmClient() {
        this(Config.getInstance());
    }

    public ResponsesLlmClient(Config config) {
        this(config, RetryPolicy.defaultPolicy());
    }

    public ResponsesLlmClient(Config config, RetryPolicy retryPolicy) {
        super(config, retryPolicy);
    }

    @Override
    protected String getChatCompletionsPath() {
        return RESPONSES_PATH;
    }

    @Override
    protected String getAuthorizationHeader() {
        return "Bearer " + config.getLlm().getApiKey();
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
        return "deepseek-responses";
    }

    // ========================================================================
    //  请求体构建：ChatRequest → Responses API 格式
    // ========================================================================

    /**
     * 构建 Responses API 请求体 JSON。
     * <p>
     * 将统一的 ChatRequest（messages + tools）转换为：
     * <pre>
     * {
     *   "model": "...",
     *   "instructions": "system 消息内容",
     *   "input": [
     *     {"type":"message","role":"user","content":[{"type":"input_text","text":"..."}]},
     *     {"type":"function_call","call_id":"...","name":"...","arguments":"{...}"},
     *     {"type":"function_call_output","call_id":"...","output":"..."}
     *   ],
     *   "tools": [{"type":"function","name":"...","description":"...","parameters":{...}}],
     *   "stream": true,
     *   "max_output_tokens": 1000
     * }
     * </pre>
     * </p>
     */
    protected String buildResponsesRequestBody(ChatRequest request) throws Exception {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", request.getModel());

        // system 消息提取为 instructions；其余消息转为 input items
        StringBuilder systemBuilder = new StringBuilder();
        ArrayNode input = objectMapper.createArrayNode();

        for (Message msg : request.getMessages()) {
            if (msg == null) {
                continue;
            }
            String role = msg.getRole();

            if ("system".equals(role)) {
                if (msg.getContent() != null) {
                    systemBuilder.append(msg.getContent()).append("\n");
                }
                continue;
            }

            if ("tool".equals(role)) {
                // 工具执行结果 → function_call_output item
                // call_id 缺失/为空时跳过：空字符串无法匹配任何 function_call，
                // 服务端会返回 "No tool call found for tool output" 400 错误。
                String callId = msg.getToolCallId();
                if (callId == null || callId.isBlank()) {
                    logger.warn("Responses API: 跳过无 call_id 的 function_call_output（孤立工具结果，name={}）",
                        msg.getName());
                    continue;
                }
                ObjectNode item = objectMapper.createObjectNode();
                item.put("type", "function_call_output");
                item.put("call_id", callId);
                item.put("output", msg.getContent() != null ? msg.getContent() : "");
                input.add(item);
                continue;
            }

            // 仅支持 user / assistant / developer（developer 视同 system 由服务端处理）
            if (!"user".equals(role) && !"assistant".equals(role) && !"developer".equals(role)) {
                logger.warn("Responses API: 跳过未知角色消息: {}", role);
                continue;
            }

            // 跳过内部消息（如 memory_saved）
            if (!msg.isApiVisible()) {
                continue;
            }

            boolean hasToolCalls = "assistant".equals(role)
                && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty();
            String text = msg.getContent();
            // 多模态消息（含图片）：Responses API 以 input_text + input_image content part 传入
            List<ContentPart> parts = msg.isMultimodal() ? msg.getContentParts() : null;
            boolean hasImage = parts != null && parts.stream().anyMatch(p -> p instanceof ImagePart);

            // 无文本、无图片且无工具调用的空消息跳过
            // （纯图片消息必须保留，否则 input 为空数组会触发 Responses API 400 错误）
            if ((text == null || text.isEmpty()) && !hasImage && !hasToolCalls) {
                continue;
            }

            // 有文本或图片时输出 message item（assistant 纯工具调用消息省略 message item，仅输出 function_call）
            if ((text != null && !text.isEmpty()) || hasImage) {
                ObjectNode item = objectMapper.createObjectNode();
                item.put("type", "message");
                item.put("role", role);
                ArrayNode contentArray = objectMapper.createArrayNode();
                if (text != null && !text.isEmpty()) {
                    ObjectNode contentBlock = objectMapper.createObjectNode();
                    // 历史消息统一用 input_text（assistant 消息的 output_text 也可回传，input_text 更通用）
                    contentBlock.put("type", "input_text");
                    contentBlock.put("text", text);
                    contentArray.add(contentBlock);
                }
                if (hasImage) {
                    ImageStoreService imageStore = new ImageStoreService();
                    for (ContentPart part : parts) {
                        if (!(part instanceof ImagePart)) {
                            continue;
                        }
                        String dataUri = imageStore.toDataUri(((ImagePart) part).getUrl());
                        if (dataUri == null) {
                            logger.warn("Responses API: 图片文件不存在，跳过: {}", ((ImagePart) part).getUrl());
                            continue;
                        }
                        ObjectNode imageBlock = objectMapper.createObjectNode();
                        imageBlock.put("type", "input_image");
                        imageBlock.put("image_url", dataUri);
                        contentArray.add(imageBlock);
                    }
                }
                if (contentArray.size() > 0) {
                    item.set("content", contentArray);
                    input.add(item);
                }
            }

            // assistant 消息的工具调用 → function_call items（跟随在 assistant 消息之后）
            if (hasToolCalls) {
                for (ToolCall tc : msg.getToolCalls()) {
                    if (tc == null || tc.getFunction() == null) {
                        continue;
                    }
                    ObjectNode fc = objectMapper.createObjectNode();
                    fc.put("type", "function_call");
                    if (tc.getId() != null) {
                        fc.put("call_id", tc.getId());
                    }
                    if (tc.getFunction().getName() != null) {
                        fc.put("name", tc.getFunction().getName());
                    }
                    String args = tc.getFunction().getArguments();
                    fc.put("arguments", args != null && !args.isEmpty() ? args : "{}");
                    input.add(fc);
                }
            }
        }

        String systemText = systemBuilder.toString().trim();
        if (!systemText.isEmpty()) {
            body.put("instructions", systemText);
        }
        body.set("input", input);

        // tools（Responses API 的 function 工具为平铺字段）
        if (request.getTools() != null && !request.getTools().isEmpty()) {
            ArrayNode toolsArray = objectMapper.createArrayNode();
            for (Tool tool : request.getTools()) {
                if (tool == null || tool.getFunction() == null) {
                    continue;
                }
                String name = tool.getFunction().getName();
                if ("web_search".equals(name)) {
                    // web_search 是服务端内置工具：客户端注册的 WebSearchTool 在此
                    // 自动转换为 {"type":"web_search"}，由 DeepSeek 服务端执行搜索，
                    // 结果经 web_search_call + message item 注入同一轮输出。
                    ObjectNode wsNode = objectMapper.createObjectNode();
                    wsNode.put("type", "web_search");
                    toolsArray.add(wsNode);
                    continue;
                }
                if ("web_fetch".equals(name)) {
                    // web_fetch 与模型服务端内置的 open_page 功能重复：
                    // DeepSeek Responses API 声明 web_search 后，服务端内置
                    // search / open_page / find_in_page 三个联网工具，其中
                    // open_page（打开网页抓取内容）与客户端 WebFetchTool 能力
                    // 完全重叠。此处过滤掉客户端 web_fetch 声明，避免工具重复
                    // 暴露，由服务端内置 open_page 承担网页抓取；其他 provider
                    //（OpenAI 兼容 / Anthropic / Ollama）无服务端内置工具，
                    // web_fetch 仍照常暴露，不受影响。
                    continue;
                }
                ObjectNode toolNode = objectMapper.createObjectNode();
                toolNode.put("type", "function");
                toolNode.put("name", name);
                if (tool.getFunction().getDescription() != null) {
                    toolNode.put("description", tool.getFunction().getDescription());
                }
                if (tool.getFunction().getParameters() != null) {
                    toolNode.set("parameters", objectMapper.valueToTree(tool.getFunction().getParameters()));
                } else {
                    ObjectNode defaultSchema = objectMapper.createObjectNode();
                    defaultSchema.put("type", "object");
                    defaultSchema.set("properties", objectMapper.createObjectNode());
                    toolNode.set("parameters", defaultSchema);
                }
                toolsArray.add(toolNode);
            }
            if (toolsArray.size() > 0) {
                body.set("tools", toolsArray);
            }
        }

        // tool_choice：none / auto / required / 指定工具
        if (request.getToolChoice() != null) {
            body.set("tool_choice", objectMapper.valueToTree(request.getToolChoice()));
        }

        // stream（显式写入，false 也可）
        body.put("stream", Boolean.TRUE.equals(request.getStream()));

        // max_output_tokens
        Integer maxTokens = request.getMaxTokens();
        if (maxTokens != null && maxTokens > 0) {
            body.put("max_output_tokens", maxTokens);
        }

        // temperature
        Double temperature = request.getTemperature();
        if (temperature == null && config.getLlm() != null) {
            temperature = config.getLlm().getTemperature();
        }
        if (temperature != null) {
            body.put("temperature", temperature);
        }

        // reasoning.effort（思考模式；空则不传，使用模型默认）
        String effort = request.getReasoningEffort();
        if (effort != null && !effort.isBlank()) {
            ObjectNode reasoning = objectMapper.createObjectNode();
            reasoning.put("effort", effort);
            body.set("reasoning", reasoning);
        }

        // text.format（响应格式）
        if (request.getResponseFormat() != null && !request.getResponseFormat().isEmpty()) {
            ObjectNode text = objectMapper.createObjectNode();
            text.set("format", objectMapper.valueToTree(request.getResponseFormat()));
            body.set("text", text);
        }

        return objectMapper.writeValueAsString(body);
    }

    // ========================================================================
    //  非流式请求
    // ========================================================================

    @Override
    protected ChatResponse doExecuteRequest(ChatRequest request) throws LlmException {
        try {
            return doExecuteRequestInternal(request);
        } catch (LlmApiException e) {
            // L3 自愈兜底：命中"孤立 function_call_output"400 错误时，
            // 剔除孤立 tool 消息后重发一次（仅当确实移除了消息才重试，天然限 1 次）
            ChatRequest healed = healOrphanToolCallRequest(request, e);
            if (healed != null) {
                logger.warn("Responses API 检测到孤立 function_call_output (HTTP 400)，剔除孤立 tool 消息后自愈重试一次: {}",
                    e.getMessage());
                return doExecuteRequestInternal(healed);
            }
            throw e;
        }
    }

    private ChatResponse doExecuteRequestInternal(ChatRequest request) throws LlmException {
        try {
            String requestBody = buildResponsesRequestBody(request);

            String url = buildUrl(getBaseUrl(), getChatCompletionsPath());

            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .timeout(Duration.ofSeconds(API_TIMEOUT_SECONDS));

            String authHeader = getAuthorizationHeader();
            if (authHeader != null && !authHeader.isEmpty()) {
                requestBuilder.header("Authorization", authHeader);
            }

            enrichRequestHeaders(requestBuilder);

            HttpRequest httpRequest = requestBuilder.build();

            logger.debug("📤 Responses API 请求，模型: {}，大小: {} 字节", getModel(), requestBody.length());
            long startMs = System.currentTimeMillis();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            long latencyMs = System.currentTimeMillis() - startMs;
            logger.debug("📥 Responses API 响应，耗时: {} ms，状态: {}", latencyMs, response.statusCode());

            return parseResponsesResponse(response);

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
        } catch (Exception e) {
            throw new LlmException("Responses API 请求失败: " + e.getMessage(), e);
        }
    }

    /**
     * 解析 Responses API 非流式响应为统一的 ChatResponse 格式。
     */
    protected ChatResponse parseResponsesResponse(HttpResponse<String> response) throws LlmException {
        int statusCode = response.statusCode();
        String body = response.body();

        if (statusCode < 200 || statusCode >= 300) {
            throw LlmApiException.classify(getProviderName(), statusCode, body);
        }

        return parseResponsesBody(body);
    }

    /**
     * 纯解析逻辑（便于单元测试）：将 Responses API 响应 JSON 解析为 ChatResponse。
     * <p>
     * output 数组中的 item 映射规则：
     * <ul>
     *   <li>reasoning → message.reasoningContent（明文 content 归并）</li>
     *   <li>message → message.content（output_text 文本）</li>
     *   <li>function_call → ToolCall（id=call_id、name、arguments JSON 字符串）</li>
     *   <li>web_search_call → 忽略（服务端已执行）</li>
     * </ul>
     * </p>
     */
    protected ChatResponse parseResponsesBody(String body) throws LlmException {
        try {
            JsonNode root = objectMapper.readTree(body);

            ChatResponse chatResponse = new ChatResponse();
            chatResponse.setId(getTextValue(root, "id"));
            chatResponse.setObject("response");
            chatResponse.setCreated(System.currentTimeMillis() / 1000);
            chatResponse.setModel(getTextValue(root, "model") != null ? getTextValue(root, "model") : getModel());

            // usage
            Usage usage = parseResponsesUsage(root.get("usage"));
            if (usage != null) {
                chatResponse.setUsage(usage);
            }

            // output items
            StringBuilder contentBuilder = new StringBuilder();
            StringBuilder reasoningBuilder = new StringBuilder();
            List<ToolCall> toolCalls = new ArrayList<>();
            boolean webSearched = false;
            List<WebSearchAction> webSearchActions = new ArrayList<>();

            JsonNode output = root.get("output");
            if (output != null && output.isArray()) {
                for (JsonNode item : output) {
                    if (item == null) {
                        continue;
                    }
                    String type = getTextValue(item, "type");
                    if ("message".equals(type)) {
                        String text = extractOutputText(item.get("content"));
                        if (text != null && !text.isEmpty()) {
                            contentBuilder.append(text);
                        }
                    } else if ("reasoning".equals(type)) {
                        String reasoning = extractReasoningText(item);
                        if (reasoning != null && !reasoning.isEmpty()) {
                            reasoningBuilder.append(reasoning);
                        }
                    } else if ("function_call".equals(type)) {
                        ToolCall tc = new ToolCall();
                        tc.setType("function");
                        String callId = getTextValue(item, "call_id");
                        tc.setId(callId != null ? callId : getTextValue(item, "id"));
                        FunctionCall func = new FunctionCall();
                        func.setName(getTextValue(item, "name"));
                        String args = getTextValue(item, "arguments");
                        func.setArguments(args != null && !args.isEmpty() ? args : "{}");
                        tc.setFunction(func);
                        toolCalls.add(tc);
                    } else if ("web_search_call".equals(type)) {
                        // 服务端联网搜索已执行：记录标记，供前端展示「已联网搜索」（随消息持久化）
                        webSearched = true;
                        // 收集 action 明细（search 搜索词 / open_page 网页 / find_in_page 页内查找），
                        // 供前端完成态聚合摘要展示（不含搜索结果正文，仅元数据）
                        WebSearchAction action = parseWebSearchAction(item);
                        if (action != null) {
                            webSearchActions.add(action);
                        }
                    }
                }
            }

            // finish reason：completed → stop / tool_calls；incomplete → length；failed → failed
            String status = getTextValue(root, "status");
            String finishReason = mapStatusToFinishReason(status, toolCalls);

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
            if (webSearched) {
                message.setWebSearched(true);
            }
            if (!webSearchActions.isEmpty()) {
                message.setWebSearchActions(webSearchActions);
            }

            Choice choice = new Choice();
            choice.setIndex(0);
            choice.setMessage(message);
            choice.setFinishReason(finishReason);

            chatResponse.setChoices(List.of(choice));

            return chatResponse;

        } catch (Exception e) {
            throw new LlmApiException(
                "解析 Responses API 响应失败: " + e.getMessage() + "\n响应内容: " + truncate(body, 500), 0, body);
        }
    }

    // ========================================================================
    //  流式请求
    // ========================================================================

    @Override
    protected ChatResponse executeStreamRequest(
            ChatRequest request,
            Consumer<StreamChunk> onChunk) throws LlmException {

        try {
            return executeStreamRequestInternal(request, onChunk);
        } catch (LlmApiException e) {
            // L3 自愈兜底：与 doExecuteRequest 同理，流式请求同样可能命中
            // "孤立 function_call_output" 400 错误，剔除孤立 tool 消息后重发一次
            ChatRequest healed = healOrphanToolCallRequest(request, e);
            if (healed != null) {
                logger.warn("Responses API 流式检测到孤立 function_call_output (HTTP 400)，剔除孤立 tool 消息后自愈重试一次: {}",
                    e.getMessage());
                return executeStreamRequestInternal(healed, onChunk);
            }
            throw e;
        }
    }

    private ChatResponse executeStreamRequestInternal(
            ChatRequest request,
            Consumer<StreamChunk> onChunk) throws LlmException {

        long startMs = System.currentTimeMillis();
        try {
            String requestBody = buildResponsesRequestBody(request);

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

            logger.debug("📤 Responses API 流式请求，模型: {}，大小: {} 字节，超时: {} 秒",
                    getModel(), requestBody.length(), STREAM_TIMEOUT_SECONDS);

            HttpResponse<InputStream> response = httpClient.send(
                    httpRequest,
                    HttpResponse.BodyHandlers.ofInputStream()
            );

            long latencyMs = System.currentTimeMillis() - startMs;
            logger.debug("📥 Responses API 流式首包，耗时: {} ms，状态: {}", latencyMs, response.statusCode());

            this.currentResponseStream.set(response.body());
            this.aborted.set(false);

            ChatResponse chatResponse;
            try {
                chatResponse = processResponsesStream(response, onChunk);
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
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(), getModel(), 0, 0,
                    System.currentTimeMillis() - startMs, false));
            throw e;
        } catch (java.net.http.HttpTimeoutException e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(), getModel(), 0, 0,
                    System.currentTimeMillis() - startMs, false));
            throw new LlmTimeoutException(
                "流式请求超时（" + STREAM_TIMEOUT_SECONDS + "秒）。请检查网络连接或稍后重试。",
                STREAM_TIMEOUT_SECONDS, e);
        } catch (java.net.SocketTimeoutException e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(), getModel(), 0, 0,
                    System.currentTimeMillis() - startMs, false));
            throw new LlmTimeoutException(
                "流式响应读取空闲超时（超过 " + STREAM_IDLE_TIMEOUT_SECONDS + " 秒无数据），连接可能已挂起。",
                STREAM_IDLE_TIMEOUT_SECONDS, e);
        } catch (java.net.ConnectException e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(), getModel(), 0, 0,
                    System.currentTimeMillis() - startMs, false));
            throw new LlmConnectionException(
                "无法连接到 API 服务器: " + config.getLlm().getBaseUrl() + "。请检查网络连接。",
                config.getLlm().getBaseUrl(), e);
        } catch (Exception e) {
            EventBus.publish(new LlmRequestEvent(
                    getProviderName(), getModel(), 0, 0,
                    System.currentTimeMillis() - startMs, false));
            throw new LlmException("流式请求失败: " + e.getMessage(), e);
        }
    }

    /**
     * 解析 Responses API SSE 流式事件。
     * <p>
     * Responses API 使用语义化命名事件（SSE event: 行 + JSON data），无 data: [DONE]，
     * 以 response.completed / response.incomplete / response.failed 结束：
     * <pre>
     * event: response.output_text.delta
     * data: {"type":"response.output_text.delta","delta":"Hello","sequence_number":10}
     *
     * event: response.function_call_arguments.delta
     * data: {"type":"response.function_call_arguments.delta","item_id":"fc_...","delta":"{\"city\":"}
     *
     * event: response.completed
     * data: {"type":"response.completed","response":{...完整 response 含 usage...}}
     * </pre>
     * </p>
     */
    protected ChatResponse processResponsesStream(
            HttpResponse<InputStream> response,
            Consumer<StreamChunk> onChunk) throws LlmException {

        int statusCode = response.statusCode();

        if (statusCode < 200 || statusCode >= 300) {
            try {
                String body = new String(response.body().readAllBytes(), StandardCharsets.UTF_8);
                throw LlmApiException.classify(getProviderName(), statusCode, body);
            } catch (Exception e) {
                if (e instanceof LlmException) throw (LlmException) e;
                throw new LlmApiException("Responses API 返回错误 (HTTP " + statusCode + ")", statusCode, null);
            }
        }

        BufferedReader reader = new BufferedReader(
                new InputStreamReader(wrapStreamBody(response.body()), StandardCharsets.UTF_8));

        return processResponsesStreamLines(reader, onChunk);
    }

    /**
     * 纯流式解析逻辑（便于单元测试）：逐行读取 SSE 事件并组装 ChatResponse。
     */
    protected ChatResponse processResponsesStreamLines(
            BufferedReader reader,
            Consumer<StreamChunk> onChunk) throws LlmException {

        StringBuilder fullContent = new StringBuilder();
        StringBuilder fullReasoning = new StringBuilder();
        List<ToolCall> toolCalls = new ArrayList<>();
        List<FunctionCallAccumulator> accumulators = new ArrayList<>();
        Map<String, Integer> itemIdToIndex = new HashMap<>();
        String finishReason = null;
        Usage usage = null;
        int contentChunkCount = 0;
        int reasoningChunkCount = 0;
        int toolCallChunkCount = 0;

        try {
            String line;
            String currentEvent = null;
            boolean streamEnded = false;

            while (!streamEnded && (line = reader.readLine()) != null) {
                Supplier<Boolean> cancelCheck = streamCancelCheck.get();
                if (cancelCheck != null && cancelCheck.get()) {
                    logger.debug("收到外部取消信号，主动关闭流式读取 (content={}字符, reasoning={}字符)",
                        fullContent.length(), fullReasoning.length());
                    reader.close();
                    break;
                }
                if (Thread.currentThread().isInterrupted()) {
                    Thread.interrupted();
                    break;
                }

                if (line.trim().isEmpty()) {
                    continue;
                }

                if (line.startsWith("event: ")) {
                    currentEvent = line.substring("event: ".length()).trim();
                    continue;
                }

                if (!line.startsWith("data: ")) {
                    continue;
                }

                String data = line.substring("data: ".length()).trim();
                if (data.isEmpty()) {
                    continue;
                }

                try {
                    JsonNode eventData = objectMapper.readTree(data);
                    // 优先使用 SSE event: 行的类型，其次取 JSON 内的 type 字段
                    String type = currentEvent != null ? currentEvent : getTextValue(eventData, "type");
                    if (type == null) {
                        continue;
                    }

                    switch (type) {
                        case "response.created":
                        case "response.in_progress":
                            // 无需处理
                            break;

                        case "response.output_item.added": {
                            // function_call 开始 → 创建累积器（记录 item_id 用于定位后续参数增量）
                            JsonNode item = eventData.get("item");
                            if (item != null && "function_call".equals(getTextValue(item, "type"))) {
                                FunctionCallAccumulator acc = new FunctionCallAccumulator();
                                acc.itemId = getTextValue(item, "id");
                                acc.callId = getTextValue(item, "call_id");
                                acc.name = getTextValue(item, "name");
                                int index = accumulators.size();
                                if (acc.itemId != null) {
                                    itemIdToIndex.put(acc.itemId, index);
                                }
                                accumulators.add(acc);
                            }
                            break;
                        }

                        case "response.reasoning_text.delta": {
                            String delta = getTextValue(eventData, "delta");
                            if (delta != null && !delta.isEmpty()) {
                                fullReasoning.append(delta);
                                reasoningChunkCount++;
                                if (onChunk != null) {
                                    StreamChunk chunk = new StreamChunk();
                                    chunk.setReasoning(delta);
                                    onChunk.accept(chunk);
                                }
                            }
                            break;
                        }

                        case "response.output_text.delta": {
                            String delta = getTextValue(eventData, "delta");
                            if (delta != null && !delta.isEmpty()) {
                                fullContent.append(delta);
                                contentChunkCount++;
                                if (onChunk != null) {
                                    StreamChunk chunk = new StreamChunk();
                                    chunk.setContent(delta);
                                    onChunk.accept(chunk);
                                }
                            }
                            break;
                        }

                        case "response.function_call_arguments.delta": {
                            String delta = getTextValue(eventData, "delta");
                            if (delta == null || delta.isEmpty()) {
                                break;
                            }
                            String itemId = getTextValue(eventData, "item_id");
                            int index = findAccumulatorIndex(itemId, itemIdToIndex, accumulators);
                            if (index < 0) {
                                // 容错：未捕获到 output_item.added，按顺序创建
                                FunctionCallAccumulator acc = new FunctionCallAccumulator();
                                acc.itemId = itemId;
                                index = accumulators.size();
                                if (itemId != null) {
                                    itemIdToIndex.put(itemId, index);
                                }
                                accumulators.add(acc);
                            }
                            FunctionCallAccumulator acc = accumulators.get(index);
                            if (acc.arguments.length() < MAX_ARGUMENTS_LENGTH) {
                                acc.arguments.append(delta);
                            }
                            toolCallChunkCount++;
                            if (onChunk != null) {
                                ToolCallDelta tcd = new ToolCallDelta();
                                tcd.setIndex(index);
                                tcd.setType("function");
                                // 携带 call_id（call_id 缺失时用 item_id 兜底），使上层
                                // WebAgentOrchestrator 能识别首段增量并实时发送 tool_start。
                                // 与最终 ToolCall.id 保持一致；后续增量因 alreadySent 判断不会重复推送。
                                String deltaId = acc.callId != null ? acc.callId : acc.itemId;
                                if (deltaId != null) {
                                    tcd.setId(deltaId);
                                }
                                ToolCallDelta.FunctionDelta fd = new ToolCallDelta.FunctionDelta();
                                if (acc.name != null) {
                                    fd.setName(acc.name);
                                }
                                fd.setArguments(delta);
                                tcd.setFunction(fd);
                                StreamChunk chunk = new StreamChunk(List.of(tcd));
                                chunk.setToolCall(true);
                                onChunk.accept(chunk);
                            }
                            break;
                        }

                        case "response.output_item.done": {
                            // function_call 完成 → 补全 id / name（部分实现可能只在 done 时提供）
                            JsonNode item = eventData.get("item");
                            if (item != null && "function_call".equals(getTextValue(item, "type"))) {
                                String itemId = getTextValue(item, "id");
                                int index = findAccumulatorIndex(itemId, itemIdToIndex, accumulators);
                                if (index < 0) {
                                    FunctionCallAccumulator acc = new FunctionCallAccumulator();
                                    acc.itemId = itemId;
                                    index = accumulators.size();
                                    if (itemId != null) {
                                        itemIdToIndex.put(itemId, index);
                                    }
                                    accumulators.add(acc);
                                }
                                FunctionCallAccumulator acc = accumulators.get(index);
                                if (acc.callId == null) {
                                    acc.callId = getTextValue(item, "call_id");
                                }
                                if (acc.name == null) {
                                    acc.name = getTextValue(item, "name");
                                }
                            } else if (item != null && "web_search_call".equals(getTextValue(item, "type"))) {
                                // web_search_call 完成（唯一携带 action 的流式事件）：
                                // in_progress / searching / completed 事件 data 均不含 action，
                                // 仅此处（output_item.done）能拿到搜索词 / URL / 查找关键词等元数据。
                                // 输出 done 信号 + action 详情，供前端完成态聚合摘要展示。
                                WebSearchAction action = parseWebSearchAction(item);
                                if (action != null && onChunk != null) {
                                    StreamChunk chunk = new StreamChunk();
                                    chunk.setWebSearchDone(true);
                                    chunk.setWebSearchAction(action);
                                    onChunk.accept(chunk);
                                }
                            }
                            break;
                        }

                        case "response.completed": {
                            // 正常完成的最后一个事件：携带完整 response 对象（含 usage/output）。
                            // 注意：OpenAI Responses 协议中 usage 嵌套在 data.response 内，而非事件顶层：
                            //   data: {"type":"response.completed","response":{"usage":{...},"output":[...]}}
                            // 部分实现（含测试桩）可能把 usage/output 直接放在顶层，这里两者都兼容。
                            JsonNode respNode = getResponseSnapshot(eventData);
                            Usage u = parseResponsesUsage(respNode.get("usage"));
                            if (u != null) {
                                usage = u;
                            }
                            // 实时传出终态 usage（回合结束立即校准，前端无需等待轮询）
                            if (usage != null && onChunk != null) {
                                StreamChunk usageChunk = new StreamChunk();
                                usageChunk.setUsage(usage);
                                onChunk.accept(usageChunk);
                            }
                            // 若 output 中存在 function_call → finishReason = tool_calls
                            JsonNode output = respNode.get("output");
                            if (output != null && output.isArray()) {
                                for (JsonNode item : output) {
                                    if ("function_call".equals(getTextValue(item, "type"))) {
                                        finishReason = "tool_calls";
                                        break;
                                    }
                                }
                            }
                            if (finishReason == null) {
                                finishReason = "stop";
                            }
                            streamEnded = true;
                            break;
                        }

                        case "response.incomplete": {
                            // 响应被截断（如达到 max_output_tokens）
                            JsonNode respNode = getResponseSnapshot(eventData);
                            Usage u = parseResponsesUsage(respNode.get("usage"));
                            if (u != null) {
                                usage = u;
                            }
                            // 实时传出终态 usage（截断时同样立即校准）
                            if (usage != null && onChunk != null) {
                                StreamChunk usageChunk = new StreamChunk();
                                usageChunk.setUsage(usage);
                                onChunk.accept(usageChunk);
                            }
                            finishReason = "length";
                            streamEnded = true;
                            break;
                        }

                        case "response.failed": {
                            // 错误信息同样嵌套在 response 对象内（OpenAI Responses 协议）：
                            // 提取 error 对象后交由 LlmErrorClassifier 归一化
                            JsonNode respNode = getResponseSnapshot(eventData);
                            JsonNode error = respNode.get("error");
                            String errorBody = error != null ? error.toString() : "{\"error\":\"未知错误\"}";
                            throw LlmApiException.classify(getProviderName(), 0, errorBody);
                        }

                        case "response.web_search_call.in_progress":
                        case "response.web_search_call.searching": {
                            // 服务端联网搜索发起/执行中（OpenAI Responses 协议事件）：
                            // 向前端传递轻量状态标记（不模拟 tool_start 卡片）
                            if (onChunk != null) {
                                StreamChunk chunk = new StreamChunk();
                                chunk.setWebSearchStarted(true);
                                onChunk.accept(chunk);
                            }
                            break;
                        }

                        case "response.web_search_call.completed":
                        case "response.web_search_call.failed": {
                            // 服务端联网搜索结束（completed；failed 为兼容保留，官方协议无此事件）：
                            // 输出完成标记，前端将「正在搜索」更新为「已联网搜索」
                            if (onChunk != null) {
                                StreamChunk chunk = new StreamChunk();
                                chunk.setWebSearchDone(true);
                                onChunk.accept(chunk);
                            }
                            break;
                        }

                        default:
                            // 其他事件（content_part 等）忽略
                            break;
                    }
                } catch (LlmException e) {
                    throw e;
                } catch (Exception e) {
                    logger.warn("解析 Responses SSE 事件失败: {}", e.getMessage());
                }
            }

            // 将累积的 function_call 参数转换为 ToolCall 列表
            for (FunctionCallAccumulator acc : accumulators) {
                if (acc.name == null || acc.name.isEmpty()) {
                    continue;
                }
                ToolCall tc = new ToolCall();
                tc.setType("function");
                tc.setId(acc.callId != null ? acc.callId : acc.itemId);
                FunctionCall func = new FunctionCall();
                func.setName(acc.name);
                String args = acc.arguments.toString();
                func.setArguments(args != null && !args.isEmpty() ? args : "{}");
                tc.setFunction(func);
                toolCalls.add(tc);
            }

            if (reasoningChunkCount > 0) {
                logger.info("🧠 模型思考过程: reasoningChunks={}, totalReasoningChars={}",
                    reasoningChunkCount, fullReasoning.length());
            }
            if (toolCallChunkCount > 0) {
                logger.debug("工具调用增量: chunks={}, toolCalls={}", toolCallChunkCount, toolCalls.size());
            }

            // ── 诊断：流式回合结束完整状态（定位"工具调用后停止/无最终回复"问题） ──
            // 注：父类 AbstractLlmClient.handleStreamingResponse 的埋点不覆盖此路径——
            // Responses 协议实际走本方法（@Override executeStreamRequest → processResponsesStreamLines），
            // 因此在此补同样的埋点，否则线上日志看不到 finishReason。
            StringBuilder diag = new StringBuilder(256);
            diag.append("finishReason=").append(finishReason == null ? "null" : finishReason)
                .append(", contentChars=").append(fullContent.length())
                .append(", reasoningChars=").append(fullReasoning.length())
                .append(", toolCalls=").append(toolCalls.size())
                .append(", usage=").append(usage != null
                    ? ("prompt=" + usage.getPromptTokens() + ",completion=" + usage.getCompletionTokens()
                        + ",cacheHit=" + usage.getCacheReadInputTokens()
                        + ",cacheMiss=" + usage.getPromptCacheMissTokens()
                        + ",cacheHitRate=" + String.format("%.1f", usage.getCacheHitRate()) + "%")
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

            return buildResponsesChatResponse(
                fullContent.toString(), fullReasoning.toString(), toolCalls, finishReason, usage);

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            Supplier<Boolean> cancelCheck = streamCancelCheck.get();
            if (aborted.get() || (cancelCheck != null && cancelCheck.get())) {
                logger.info("Responses 流式请求被主动中止，返回已收集的部分响应 (content={}字符, reasoning={}字符, toolCalls={})",
                    fullContent.length(), fullReasoning.length(), toolCalls.size());
                return buildResponsesChatResponse(
                    fullContent.toString(), fullReasoning.toString(), toolCalls, finishReason, usage);
            }
            if (e instanceof LlmException) throw (LlmException) e;
            throw new LlmException("读取 Responses 流式响应失败: " + e.getMessage(), e);
        } finally {
            try {
                reader.close();
            } catch (IOException ignored) {
            }
        }
    }

    // ========================================================================
    //  工具方法
    // ========================================================================

    /**
     * 流式 function_call 累积器：按 item_id 收集参数增量。
     */
    private static class FunctionCallAccumulator {
        String itemId;
        String callId;
        String name;
        StringBuilder arguments = new StringBuilder();
    }

    /**
     * 根据 item_id 定位 function_call 累积器索引；无 item_id 时回退到最近一个（串行输出场景）。
     */
    private int findAccumulatorIndex(String itemId, Map<String, Integer> itemIdToIndex,
                                     List<FunctionCallAccumulator> accumulators) {
        if (itemId != null) {
            Integer idx = itemIdToIndex.get(itemId);
            if (idx != null) {
                return idx;
            }
        }
        if (!accumulators.isEmpty()) {
            return accumulators.size() - 1;
        }
        return -1;
    }

    /**
     * 从终态事件（response.completed / incomplete / failed）的 data 中提取 response 快照对象。
     * <p>
     * OpenAI Responses 协议的终态事件 data 结构为：
     * <pre>
     * {"type":"response.completed","response":{"usage":{...},"output":[...]}}
     * </pre>
     * usage / output / error 均嵌套在 response 对象内。但部分兼容实现（及本项目旧测试桩）
     * 可能直接放在事件顶层，因此这里优先取 response 嵌套对象，取不到时回退到事件本身。
     * </p>
     */
    private JsonNode getResponseSnapshot(JsonNode eventData) {
        if (eventData == null) {
            return null;
        }
        JsonNode response = eventData.get("response");
        return response != null && response.isObject() ? response : eventData;
    }

    private ChatResponse buildResponsesChatResponse(String content, String reasoning,
                                                    List<ToolCall> toolCalls,
                                                    String finishReason, Usage usage) {
        ChatResponse response = new ChatResponse();
        response.setId("stream-" + System.currentTimeMillis());
        response.setObject("response");
        response.setCreated(System.currentTimeMillis() / 1000);
        response.setModel(getModel());
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
        if (toolCalls != null && !toolCalls.isEmpty()) {
            List<ToolCall> valid = new ArrayList<>();
            for (ToolCall tc : toolCalls) {
                if (tc.getFunction() != null
                    && tc.getFunction().getName() != null
                    && !tc.getFunction().getName().isEmpty()) {
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

    /**
     * 解析 Responses API 的 usage 结构：
     * <pre>
     * {
     *   "input_tokens": 100,
     *   "input_tokens_details": {"cached_tokens": 50},
     *   "output_tokens": 20,
     *   "output_tokens_details": {"reasoning_tokens": 5},
     *   "total_tokens": 120
     * }
     * </pre>
     */
    private Usage parseResponsesUsage(JsonNode usageNode) {
        if (usageNode == null) {
            return null;
        }
        Usage usage = new Usage();
        if (usageNode.has("input_tokens")) {
            usage.setPromptTokens(usageNode.get("input_tokens").asInt());
        }
        if (usageNode.has("output_tokens")) {
            usage.setCompletionTokens(usageNode.get("output_tokens").asInt());
        }
        if (usageNode.has("total_tokens")) {
            usage.setTotalTokens(usageNode.get("total_tokens").asInt());
        }

        // input_tokens_details.cached_tokens → 缓存命中
        JsonNode inputDetails = usageNode.get("input_tokens_details");
        if (inputDetails != null && inputDetails.isObject() && inputDetails.has("cached_tokens")) {
            int cached = inputDetails.get("cached_tokens").asInt();
            usage.setPromptCacheHitTokens(cached);
            PromptTokensDetails ptd = new PromptTokensDetails();
            ptd.setCachedTokens(cached);
            usage.setPromptTokensDetails(ptd);
            logger.debug("💾 Responses 缓存命中: hitTokens={}", cached);
        }

        // output_tokens_details.reasoning_tokens（Usage 无对应字段，仅日志）
        JsonNode outputDetails = usageNode.get("output_tokens_details");
        if (outputDetails != null && outputDetails.isObject() && outputDetails.has("reasoning_tokens")) {
            logger.debug("🧠 reasoning tokens: {}", outputDetails.get("reasoning_tokens").asInt());
        }

        if (usage.getTotalTokens() == 0 && usage.getPromptTokens() > 0) {
            usage.setTotalTokens(usage.getPromptTokens() + usage.getCompletionTokens());
        }

        return usage;
    }

    /**
     * 提取 message item 的 content 数组中的文本（output_text / input_text / text）。
     */
    private String extractOutputText(JsonNode contentArray) {
        if (contentArray == null || !contentArray.isArray()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (JsonNode block : contentArray) {
            if (block == null) {
                continue;
            }
            String type = getTextValue(block, "type");
            if ("output_text".equals(type) || "input_text".equals(type) || "text".equals(type)) {
                String text = getTextValue(block, "text");
                if (text != null) {
                    sb.append(text);
                }
            }
        }
        return sb.toString();
    }

    /**
     * 提取 reasoning item 的文本内容（明文 content 中的 summary_text / text）。
     */
    private String extractReasoningText(JsonNode item) {
        JsonNode content = item.get("content");
        if (content != null && content.isArray()) {
            StringBuilder sb = new StringBuilder();
            for (JsonNode block : content) {
                if (block == null) {
                    continue;
                }
                String type = getTextValue(block, "type");
                if ("summary_text".equals(type) || "text".equals(type)) {
                    String text = getTextValue(block, "text");
                    if (text != null) {
                        sb.append(text);
                    }
                }
            }
            return sb.toString();
        }
        return null;
    }

    /**
     * 从 web_search_call 节点解析联网搜索动作明细。
     * <p>
     * 兼容两种输入形态：
     * <ul>
     *   <li>非流式 output 数组中的 {@code web_search_call} item（含 action）</li>
     *   <li>流式 {@code response.output_item.done} 事件中嵌套的 item（含 action）</li>
     * </ul>
     * 只提取服务端已给出的 action 元数据（type / queries / url / pattern / status），
     * 不含搜索结果正文。action 缺失或类型未知时返回 null（调用方静默跳过）。
     * </p>
     */
    private WebSearchAction parseWebSearchAction(JsonNode webSearchCallNode) {
        if (webSearchCallNode == null) {
            return null;
        }
        String actionType = getTextValue(webSearchCallNode, "type");
        if (!"web_search_call".equals(actionType)) {
            return null;
        }
        JsonNode actionNode = webSearchCallNode.get("action");
        if (actionNode == null || !actionNode.isObject()) {
            return null;
        }
        WebSearchAction action = new WebSearchAction();
        action.setType(getTextValue(actionNode, "type"));
        action.setUrl(getTextValue(actionNode, "url"));
        action.setPattern(getTextValue(actionNode, "pattern"));
        action.setStatus(getTextValue(webSearchCallNode, "status"));
        // search 动作的搜索词列表（queries）
        JsonNode queries = actionNode.get("queries");
        if (queries != null && queries.isArray() && queries.size() > 0) {
            List<String> queryList = new ArrayList<>();
            for (JsonNode q : queries) {
                String text = q.asText(null);
                if (text != null && !text.isEmpty()) {
                    queryList.add(text);
                }
            }
            if (!queryList.isEmpty()) {
                action.setQueries(queryList);
            }
        }
        return action;
    }

    /**
     * 将响应 status 映射为统一的 finish_reason。
     */
    private String mapStatusToFinishReason(String status, List<ToolCall> toolCalls) {
        if ("incomplete".equals(status)) {
            return "length";
        }
        if ("failed".equals(status)) {
            return "failed";
        }
        // completed
        if (toolCalls != null && !toolCalls.isEmpty()) {
            return "tool_calls";
        }
        return "stop";
    }

    private String getTextValue(JsonNode node, String field) {
        if (node == null || !node.has(field)) {
            return null;
        }
        JsonNode fieldNode = node.get(field);
        return fieldNode.isNull() ? null : fieldNode.asText();
    }

    // ========================================================================
    //  L3 自愈兜底：孤立 function_call_output 400 错误
    // ========================================================================

    /**
     * 判断是否为"孤立 function_call_output"导致的 400 错误。
     * <p>
     * Responses API 在收到无法匹配任何 function_call 的 function_call_output 时，
     * 返回形如 {@code "No tool call found for tool output with call_id ..."} 的 400。
     * </p>
     */
    private boolean isOrphanToolCallError(LlmApiException e) {
        if (e == null || e.getStatusCode() != 400) {
            return false;
        }
        String body = e.getErrorBody();
        return body != null
            && body.toLowerCase().contains(ORPHAN_TOOL_CALL_ERROR_MARKER.toLowerCase());
    }

    /**
     * 自愈请求：从消息列表中剔除"孤立 tool 消息"（call_id 为空，或没有任何
     * 对应 function_call），重建 ChatRequest。
     * <p>
     * 仅在错误确为孤立 function_call_output 且确实剔除了消息时返回新请求；
     * 否则返回 {@code null}（表示不应重试，原样抛出）。
     * 天然限 1 次：第二次请求已不含孤立消息，若仍失败则直接抛出。
     * </p>
     */
    ChatRequest healOrphanToolCallRequest(ChatRequest request, LlmApiException e) {
        if (!isOrphanToolCallError(e) || request == null) {
            return null;
        }
        List<Message> messages = request.getMessages();
        if (messages == null || messages.isEmpty()) {
            return null;
        }

        // 收集所有 function_call id
        Set<String> knownCallIds = new HashSet<>();
        for (Message m : messages) {
            if (m != null && m.isAssistant() && m.getToolCalls() != null) {
                for (ToolCall tc : m.getToolCalls()) {
                    if (tc != null && tc.getId() != null && !tc.getId().isEmpty()) {
                        knownCallIds.add(tc.getId());
                    }
                }
            }
        }

        // 剔除孤立 tool 消息
        boolean removed = false;
        List<Message> cleaned = new ArrayList<>(messages.size());
        for (Message m : messages) {
            if (m != null && m.isTool()) {
                String callId = m.getToolCallId();
                if (callId == null || callId.isEmpty() || !knownCallIds.contains(callId)) {
                    logger.warn("  自愈剔除孤立 tool 消息: call_id={}, name={}",
                        callId, m.getName());
                    removed = true;
                    continue;
                }
            }
            cleaned.add(m);
        }

        if (!removed || cleaned.isEmpty()) {
            return null;
        }

        // 重建 ChatRequest（保留全部字段）
        ChatRequest healed = ChatRequest.of(request.getModel(), cleaned);
        healed.tools(request.getTools());
        healed.setToolChoice(request.getToolChoice());
        healed.setMaxTokens(request.getMaxTokens());
        healed.setTemperature(request.getTemperature());
        healed.setTopP(request.getTopP());
        healed.setStream(request.getStream());
        healed.setStreamOptions(request.getStreamOptions());
        healed.setExtraBody(request.getExtraBody());
        healed.setReasoningEffort(request.getReasoningEffort());
        healed.setResponseFormat(request.getResponseFormat());
        healed.setThinking(request.getThinking());
        return healed;
    }
}
