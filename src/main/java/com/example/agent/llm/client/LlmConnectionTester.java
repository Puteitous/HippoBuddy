package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.llm.exception.LlmApiException;
import com.example.agent.llm.exception.LlmConnectionException;
import com.example.agent.llm.exception.LlmErrorClassifier;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.exception.LlmTimeoutException;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.retry.RetryPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * 测试 LLM 连接：用调用方填写的 provider/baseUrl/apiKey/model 构造一份临时配置，
 * 通过 {@link LlmClientFactory} 发起一次最小 chat 请求，验证 baseUrl、API Key 与模型
 * 是否真实可用（覆盖 Anthropic、Ollama、Local 等不走 {@code /v1/models} 的厂商）。
 * <p>
 * 与 {@link LlmModelFetcher}（仅验证连通/拉模型列表）不同，本类请求的是真实对话端点，
 * 因此能额外校验 model 是否可行；失败时经 {@link LlmErrorClassifier} 归一化的错误码
 * 映射为友好中文提示，方便前端直接展示。
 */
public final class LlmConnectionTester {

    private static final Logger logger = LoggerFactory.getLogger(LlmConnectionTester.class);

    private LlmConnectionTester() {
    }

    /**
     * @param provider 厂商标识，如 deepseek / anthropic
     * @param baseUrl 厂商 base URL（为空时回退该厂商默认地址）
     * @param apiKey   API Key
     * @param model    模型名
     * @return 测试结果
     */
    public static Result test(String provider, String baseUrl, String apiKey, String model) {
        if (provider == null || provider.isBlank()) {
            return Result.fail("provider 不能为空");
        }
        if (apiKey == null || apiKey.isBlank()) {
            return Result.fail("缺少 API Key，无法测试连接");
        }
        if (model == null || model.isBlank()) {
            return Result.fail("缺少模型名，无法测试连接");
        }

        String resolvedBaseUrl = (baseUrl == null || baseUrl.isBlank())
                ? LlmClientFactory.getDefaultBaseUrl(provider) : baseUrl;

        Config temp = new Config();
        LlmConfig llm = new LlmConfig();
        llm.setProvider(provider);
        llm.setBaseUrl(resolvedBaseUrl);
        llm.setApiKey(apiKey);
        llm.setModel(model);
        temp.setLlm(llm);

        long start = System.nanoTime();
        try {
            LlmClient client = LlmClientFactory.create(temp, RetryPolicy.noRetry());
            client.chat(List.of(Message.user("ping")));
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            return Result.ok(latencyMs);
        } catch (LlmConnectionException e) {
            return Result.fail(friendly(e.getErrorCode(), "无法连接到模型服务，请检查 baseUrl 或网络"));
        } catch (LlmTimeoutException e) {
            return Result.fail("连接超时，请检查网络或 baseUrl");
        } catch (LlmApiException e) {
            return Result.fail(friendly(e.getErrorCode(), e.getMessage()));
        } catch (LlmException e) {
            return Result.fail(e.getMessage() == null || e.getMessage().isBlank()
                    ? "连接测试失败" : e.getMessage());
        } catch (Exception e) {
            logger.warn("连接测试异常: provider={}, baseUrl={}, error={}", provider, resolvedBaseUrl, e.toString());
            return Result.fail(e.getMessage() == null ? "连接测试异常" : e.getMessage());
        }
    }

    /** 将归一化错误码映射为友好中文提示；无码时退回原始信息 */
    private static String friendly(String code, String fallback) {
        if (code == null) {
            return fallback == null || fallback.isBlank() ? "连接测试失败" : fallback;
        }
        switch (code) {
            case LlmErrorClassifier.CODE_AUTH_FAILED:
                return "API Key 无效或已过期，请检查模型配置";
            case LlmErrorClassifier.CODE_MODEL_NOT_FOUND:
                return "模型不存在或不可用，请检查模型名称";
            case LlmErrorClassifier.CODE_INSUFFICIENT_BALANCE:
                return "账户余额不足，请充值后继续使用";
            case LlmErrorClassifier.CODE_RATE_LIMITED:
                return "请求过于频繁，已触发限流，请稍后重试";
            case LlmErrorClassifier.CODE_NETWORK_ERROR:
                return "无法连接到模型服务，请检查 baseUrl 或网络";
            case LlmErrorClassifier.CODE_TIMEOUT:
                return "连接超时，请检查网络或 baseUrl";
            case LlmErrorClassifier.CODE_SERVER_ERROR:
                return "模型服务暂时不可用，请稍后重试";
            case LlmErrorClassifier.CODE_INVALID_REQUEST:
                return "请求参数错误，请核对 baseUrl 与模型名";
            default:
                return fallback == null || fallback.isBlank() ? "连接测试失败" : fallback;
        }
    }

    /** 测试结果：success 为 false 时 message 描述原因；true 时 latencyMs 为响应耗时 */
    public static final class Result {
        public final boolean success;
        public final String message;
        public final long latencyMs;

        private Result(boolean success, String message, long latencyMs) {
            this.success = success;
            this.message = message;
            this.latencyMs = latencyMs;
        }

        public static Result ok(long latencyMs) {
            return new Result(true, "", latencyMs);
        }

        public static Result fail(String message) {
            return new Result(false, message, 0);
        }
    }
}