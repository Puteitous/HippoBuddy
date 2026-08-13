package com.example.agent.llm.exception;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Locale;

/**
 * LLM 错误归一化分类器。
 * <p>
 * 将不同厂商（OpenAI 兼容系 / Anthropic / Ollama / DeepSeek Responses 等）的
 * HTTP 错误响应归一化为<b>稳定的业务错误码</b>（{@link LlmError#getCode()}），
 * 供前端按 code 渲染 i18n 文案；同时保留面向用户的友好文案（message）与
 * 厂商原始错误详情（detail）。
 * <p>
 * <b>分类优先级</b>（经各厂商官方错误码文档核实）：
 * <ol>
 *   <li>厂商特有状态码（如 Anthropic 529 → {@link #CODE_SERVER_BUSY}、DeepSeek 402 → 余额不足）；</li>
 *   <li>错误体中的结构化 {@code error.type} / {@code error.code}
 *       （最准，OpenAI 兼容系 / Anthropic 均携带；如 OpenAI 429+insufficient_quota、Anthropic 400+insufficient_quota）；</li>
 *   <li>错误文本关键词兜底（覆盖 Ollama 等无结构化 type 的厂商，如 "model not found"）；</li>
 *   <li>通用 HTTP 状态码兜底（401/403→认证、429→限流、500→服务器错等）。</li>
 * </ol>
 */
public final class LlmErrorClassifier {

    private static final Logger logger = LoggerFactory.getLogger(LlmErrorClassifier.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    // ── 业务错误码（前后端契约，保持稳定；新增厂商只增映射、不改码表） ──
    /** 网络连接失败（连接被拒 / 不可达，如 Ollama 未启动） */
    public static final String CODE_NETWORK_ERROR = "NETWORK_ERROR";
    /** 请求超时 */
    public static final String CODE_TIMEOUT = "TIMEOUT";
    /** 认证失败（API Key 无效 / 过期 / 无权限） */
    public static final String CODE_AUTH_FAILED = "AUTH_FAILED";
    /** 账户余额不足 */
    public static final String CODE_INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE";
    /** 请求过于频繁，触发限流 */
    public static final String CODE_RATE_LIMITED = "RATE_LIMITED";
    /** 模型不存在或不可用 */
    public static final String CODE_MODEL_NOT_FOUND = "MODEL_NOT_FOUND";
    /** 上下文长度超过模型限制 */
    public static final String CODE_CONTEXT_LENGTH_EXCEEDED = "CONTEXT_LENGTH_EXCEEDED";
    /** 模型服务内部错误（500/502 等） */
    public static final String CODE_SERVER_ERROR = "SERVER_ERROR";
    /** 模型服务繁忙（503 / Anthropic 529） */
    public static final String CODE_SERVER_BUSY = "SERVER_BUSY";
    /** 请求参数错误（400/422 等） */
    public static final String CODE_INVALID_REQUEST = "INVALID_REQUEST";
    /** 内容被安全过滤器阻止 */
    public static final String CODE_CONTENT_FILTERED = "CONTENT_FILTERED";
    /** 模型未返回有效内容 */
    public static final String CODE_EMPTY_RESPONSE = "EMPTY_RESPONSE";
    /** 响应长度达到限制（finish_reason=length） */
    public static final String CODE_RESPONSE_LENGTH_EXCEEDED = "RESPONSE_LENGTH_EXCEEDED";
    /** 模型配置缺失（如未配置 provider/model/apiKey） */
    public static final String CODE_CONFIG_MISSING = "CONFIG_MISSING";
    /** 未知错误 */
    public static final String CODE_UNKNOWN = "UNKNOWN";

    private LlmErrorClassifier() {
    }

    /**
     * 归一化分类：{@code (provider, statusCode, body)} → {@link LlmError}。
     *
     * @param provider   厂商名（如 openai / deepseek / anthropic / ollama / deepseek-responses，可为 null）
     * @param statusCode HTTP 状态码（0 表示无有效状态码，如连接层异常）
     * @param body       HTTP 响应体（可为 null）
     */
    public static LlmError classify(String provider, int statusCode, String body) {
        // 1. 厂商特有状态码（优先于通用判断）
        LlmError providerSpecific = classifyProviderSpecific(provider, statusCode, body);
        if (providerSpecific != null) {
            return providerSpecific;
        }

        // 2. 错误体结构化 type/code（最准）
        LlmError fromType = classifyFromBodyType(body);
        if (fromType != null) {
            return fromType;
        }

        // 3. 错误文本关键词兜底（Ollama 等无结构化 type）
        LlmError fromText = classifyByText(body);
        if (fromText != null) {
            return fromText;
        }

        // 4. 通用 HTTP 状态码兜底
        LlmError fromStatus = classifyByStatus(statusCode, body);
        if (fromStatus != null) {
            return fromStatus;
        }

        // 5. 未知错误：优先展示厂商原始 message（如流式 response.failed 事件的 error.message），
        //    避免把可读信息降级为笼统的"未知错误"
        String suffix = statusCode > 0 ? " (HTTP " + statusCode + ")" : "";
        String detail = extractDetail(body);
        String fallbackMsg = (detail != null && !detail.isBlank())
                ? detail
                : ("模型服务返回未知错误" + suffix);
        return new LlmError(CODE_UNKNOWN, fallbackMsg, detail);
    }

    /** 连接层异常（非 HTTP 响应）直接构造：网络连接失败 */
    public static LlmError connectionError(String message) {
        return new LlmError(CODE_NETWORK_ERROR,
                message != null && !message.isBlank() ? message : "无法连接到模型服务，请检查网络或服务状态", null);
    }

    /** 连接层异常（非 HTTP 响应）直接构造：请求超时 */
    public static LlmError timeoutError(String message) {
        return new LlmError(CODE_TIMEOUT,
                message != null && !message.isBlank() ? message : "请求超时，请稍后重试", null);
    }

    /** 模型未返回有效内容 */
    public static LlmError emptyResponse() {
        return new LlmError(CODE_EMPTY_RESPONSE, "模型未返回有效内容，请重试", null);
    }

    /** 响应长度达到限制（finish_reason=length） */
    public static LlmError responseLengthExceeded() {
        return new LlmError(CODE_RESPONSE_LENGTH_EXCEEDED, "响应长度达到限制，请精简上下文或增加 max_tokens", null);
    }

    /** 内容被安全过滤器阻止 */
    public static LlmError contentFiltered() {
        return new LlmError(CODE_CONTENT_FILTERED, "内容被安全过滤器阻止", null);
    }

    // ── 分类实现 ──

    private static LlmError classifyProviderSpecific(String provider, int statusCode, String body) {
        String p = provider == null ? "" : provider.trim().toLowerCase(Locale.ROOT);

        // Anthropic 特有：529 overloaded_error（标准 HTTP 无此状态码）
        if ((p.equals("anthropic") || p.equals("claude")) && statusCode == 529) {
            return new LlmError(CODE_SERVER_BUSY, "模型服务繁忙，请稍后重试", extractDetail(body));
        }

        // DeepSeek 系特有：402 明确为余额不足（官方错误码表），语义上 402 本就表示 Payment Required
        if ((p.contains("deepseek") || p.equals("ds")) && statusCode == 402) {
            return new LlmError(CODE_INSUFFICIENT_BALANCE, "账户余额不足，请充值后继续使用", extractDetail(body));
        }

        return null;
    }

    private static LlmError classifyFromBodyType(String body) {
        if (body == null || body.isEmpty()) {
            return null;
        }
        try {
            JsonNode root = OBJECT_MAPPER.readTree(body);
            JsonNode error = root.path("error");

            String type = null;
            String code = null;
            if (error.isObject()) {
                type = getText(error, "type");
                code = getText(error, "code");
            } else if (error.isTextual()) {
                // Ollama 风格：{"error": "model 'xxx' not found"}，无 type，交给文本兜底
                return null;
            }

            // Anthropic 顶层格式：{"type":"error","error":{"type":"...","message":"..."}}
            if (type == null && "error".equals(getText(root, "type")) && error.isObject()) {
                type = getText(error, "type");
            }

            String mapped = mapTypeToCode(type != null ? type : code);
            if (mapped == null) {
                return null;
            }
            return new LlmError(mapped, defaultMessageForCode(mapped), extractDetail(body));
        } catch (Exception e) {
            // 非 JSON 错误体，交给状态码/文本兜底
            logger.debug("错误体不是合法 JSON，跳过 type 解析: {}", e.getMessage());
            return null;
        }
    }

    private static LlmError classifyByText(String body) {
        if (body == null || body.isEmpty()) {
            return null;
        }
        String lower = body.toLowerCase(Locale.ROOT);

        if (lower.contains("model") && lower.contains("not found")) {
            return new LlmError(CODE_MODEL_NOT_FOUND, "模型不存在或不可用，请检查模型配置", extractDetail(body));
        }
        if (lower.contains("connection refused") || lower.contains("failed to connect")
                || lower.contains("connection reset") || lower.contains("unable to connect")) {
            return new LlmError(CODE_NETWORK_ERROR, "无法连接到模型服务，请检查网络或服务状态", extractDetail(body));
        }
        if (lower.contains("context length") || lower.contains("context window")
                || lower.contains("too many tokens") || lower.contains("maximum context")
                || lower.contains("exceeds max")) {
            return new LlmError(CODE_CONTEXT_LENGTH_EXCEEDED,
                    "上下文长度超过模型限制，请精简内容或开启会话压缩", extractDetail(body));
        }
        return null;
    }

    private static LlmError classifyByStatus(int statusCode, String body) {
        String detail = extractDetail(body);
        switch (statusCode) {
            case 400:
            case 422:
                return new LlmError(CODE_INVALID_REQUEST, "请求参数错误，请重试或调整输入", detail);
            case 401:
            case 403:
                return new LlmError(CODE_AUTH_FAILED, "API Key 无效或已过期，请检查模型配置", detail);
            case 402:
                return new LlmError(CODE_INSUFFICIENT_BALANCE, "账户余额不足，请充值后继续使用", detail);
            case 404:
                return new LlmError(CODE_MODEL_NOT_FOUND, "模型不存在或不可用，请检查模型配置", detail);
            case 429:
                return new LlmError(CODE_RATE_LIMITED, "请求过于频繁，已触发限流，请稍后重试", detail);
            case 500:
            case 502:
                return new LlmError(CODE_SERVER_ERROR, "模型服务暂时不可用，请稍后重试", detail);
            case 503:
            case 529:
                return new LlmError(CODE_SERVER_BUSY, "模型服务繁忙，请稍后重试", detail);
            default:
                return null;
        }
    }

    /** 结构化 error.type / error.code → 业务错误码 */
    private static String mapTypeToCode(String typeOrCode) {
        if (typeOrCode == null) {
            return null;
        }
        String t = typeOrCode.toLowerCase(Locale.ROOT);
        switch (t) {
            // 余额不足：OpenAI 429+insufficient_quota、Anthropic 400+insufficient_quota、Gemini quota_exceeded
            case "insufficient_quota":
            case "insufficient_balance":
            case "billing_not_active":
            case "payment_required":
            case "quota_exceeded":
                return CODE_INSUFFICIENT_BALANCE;
            case "rate_limit_exceeded":
            case "rate_limited":
            case "requests_rate_limited":
                return CODE_RATE_LIMITED;
            case "authentication_error":
            case "invalid_api_key":
            case "access_terminated":
            case "permission_error":
                return CODE_AUTH_FAILED;
            case "context_length_exceeded":
            case "context_window_exceeded":
            case "max_tokens_exceeded":
                return CODE_CONTEXT_LENGTH_EXCEEDED;
            case "overloaded_error":
            case "server_busy":
            case "service_unavailable":
                return CODE_SERVER_BUSY;
            case "model_not_found":
            case "model_not_found_error":
                return CODE_MODEL_NOT_FOUND;
            case "content_filter":
            case "content_policy_violation":
                return CODE_CONTENT_FILTERED;
            case "invalid_request_error":
            case "bad_request":
            case "invalid_parameter":
            case "invalid_params":
                return CODE_INVALID_REQUEST;
            case "api_error":
            case "server_error":
            case "internal_server_error":
                return CODE_SERVER_ERROR;
            default:
                return null;
        }
    }

    /** 业务错误码 → 默认友好中文文案（前端无 i18n 映射时兜底） */
    private static String defaultMessageForCode(String code) {
        switch (code) {
            case CODE_NETWORK_ERROR:
                return "无法连接到模型服务，请检查网络或服务状态";
            case CODE_TIMEOUT:
                return "请求超时，请稍后重试";
            case CODE_AUTH_FAILED:
                return "API Key 无效或已过期，请检查模型配置";
            case CODE_INSUFFICIENT_BALANCE:
                return "账户余额不足，请充值后继续使用";
            case CODE_RATE_LIMITED:
                return "请求过于频繁，已触发限流，请稍后重试";
            case CODE_MODEL_NOT_FOUND:
                return "模型不存在或不可用，请检查模型配置";
            case CODE_CONTEXT_LENGTH_EXCEEDED:
                return "上下文长度超过模型限制，请精简内容或开启会话压缩";
            case CODE_SERVER_ERROR:
                return "模型服务暂时不可用，请稍后重试";
            case CODE_SERVER_BUSY:
                return "模型服务繁忙，请稍后重试";
            case CODE_INVALID_REQUEST:
                return "请求参数错误，请重试或调整输入";
            case CODE_CONTENT_FILTERED:
                return "内容被安全过滤器阻止";
            case CODE_EMPTY_RESPONSE:
                return "模型未返回有效内容，请重试";
            case CODE_RESPONSE_LENGTH_EXCEEDED:
                return "响应长度达到限制，请精简上下文或增加 max_tokens";
            case CODE_CONFIG_MISSING:
                return "模型配置不完整，请先在设置中配置模型";
            default:
                return "模型服务返回未知错误";
        }
    }

    /** 从错误体提取简短原始详情（优先 message 字段，其次整体截断） */
    private static String extractDetail(String body) {
        if (body == null || body.isEmpty()) {
            return null;
        }
        try {
            JsonNode root = OBJECT_MAPPER.readTree(body);
            JsonNode error = root.path("error");
            if (error.isObject()) {
                JsonNode msg = error.get("message");
                if (msg != null && !msg.isNull()) {
                    return msg.asText();
                }
                return truncate(error.toString(), 300);
            }
            if (error.isTextual()) {
                return error.asText();
            }
            if (root.has("message")) {
                return root.get("message").asText();
            }
            return truncate(body, 300);
        } catch (Exception e) {
            return truncate(body, 300);
        }
    }

    private static String getText(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        return node.get(field).asText();
    }

    private static String truncate(String text, int maxLength) {
        if (text == null) {
            return null;
        }
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + "...";
    }
}
