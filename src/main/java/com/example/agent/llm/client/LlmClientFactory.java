package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.llm.retry.RetryPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Locale;

public class LlmClientFactory {

    private static final Logger logger = LoggerFactory.getLogger(LlmClientFactory.class);

    public enum Provider {
        DASHSCOPE,
        OPENAI,
        OLLAMA,
        AZURE,
        ANTHROPIC,
        CUSTOM,
        DEEPSEEK,
        ZHIPU,
        MOONSHOT,
        MINIMAX,
        STEPFUN,
        LINGYI,
        DOUBAO,
        SILICONFLOW,
        XUNFEI
    }

    private LlmClientFactory() {
    }

    public static LlmClient create() {
        return create(Config.getInstance());
    }

    public static LlmClient create(Config config) {
        return create(config, RetryPolicy.defaultPolicy());
    }

    public static LlmClient create(Config config, RetryPolicy retryPolicy) {
        if (config == null) {
            throw new IllegalArgumentException("Config不能为null");
        }
        if (retryPolicy == null) {
            throw new IllegalArgumentException("RetryPolicy不能为null");
        }

        String providerName = config.getLlm().getProvider() != null ? config.getLlm().getProvider() : "dashscope";
        Provider provider = parseProvider(providerName);
        
        String baseUrl = getBaseUrlWithDefault(config, providerName);
        String model = getModelWithDefault(config, providerName);

        logger.info("创建 LLM 客户端: provider={}, model={}, baseUrl={}", 
            providerName, model, baseUrl);

        switch (provider) {
            case DASHSCOPE:
                return new DashScopeLlmClient(config, retryPolicy);
            case OPENAI:
                return new OpenAiLlmClient(config, retryPolicy);
            case OLLAMA:
                return new OllamaLlmClient(config, retryPolicy);
            case CUSTOM:
                return createCustomClient(config, retryPolicy);
            case DEEPSEEK:
                return new OpenAiLlmClient(config, retryPolicy);
            case ZHIPU:
                return new OpenAiLlmClient(config, retryPolicy);
            case MOONSHOT:
                return new OpenAiLlmClient(config, retryPolicy);
            case MINIMAX:
                return new OpenAiLlmClient(config, retryPolicy);
            case STEPFUN:
                return new OpenAiLlmClient(config, retryPolicy);
            case LINGYI:
                return new OpenAiLlmClient(config, retryPolicy);
            case DOUBAO:
                return new OpenAiLlmClient(config, retryPolicy);
            case SILICONFLOW:
                return new OpenAiLlmClient(config, retryPolicy);
            case XUNFEI:
                return new OpenAiLlmClient(config, retryPolicy);
            case AZURE:
                return new OpenAiLlmClient(config, retryPolicy);
            case ANTHROPIC:
                return new AnthropicLlmClient(config, retryPolicy);
            default:
                logger.warn("提供商 {} 尚未完全支持，使用 OpenAI 兼容模式", provider);
                return new OpenAiLlmClient(config, retryPolicy);
        }
    }

    private static String getBaseUrlWithDefault(Config config, String providerName) {
        String baseUrl = config.getLlm().getBaseUrl();
        if (baseUrl == null || baseUrl.isEmpty()) {
            return getDefaultBaseUrl(providerName);
        }
        return baseUrl;
    }

    private static String getModelWithDefault(Config config, String providerName) {
        String model = config.getLlm().getModel();
        if (model == null || model.isEmpty()) {
            return getDefaultModel(providerName);
        }
        return model;
    }

    private static Provider parseProvider(String providerName) {
        if (providerName == null || providerName.isEmpty()) {
            return Provider.DASHSCOPE;
        }

        String normalized = providerName.trim().toUpperCase(Locale.ROOT);
        
        switch (normalized) {
            case "DASHSCOPE":
            case "ALIYUN":
            case "QWEN":
                return Provider.DASHSCOPE;
            case "OPENAI":
            case "GPT":
                return Provider.OPENAI;
            case "OLLAMA":
            case "LOCAL":
                return Provider.OLLAMA;
            case "DEEPSEEK":
            case "DS":
                return Provider.DEEPSEEK;
            case "ZHIPU":
            case "GLM":
                return Provider.ZHIPU;
            case "MOONSHOT":
            case "KIMI":
                return Provider.MOONSHOT;
            case "MINIMAX":
                return Provider.MINIMAX;
            case "STEPFUN":
            case "STEP":
                return Provider.STEPFUN;
            case "LINGYI":
            case "YI":
                return Provider.LINGYI;
            case "DOUBAO":
            case "BYTEDANCE":
            case "VOLC":
                return Provider.DOUBAO;
            case "SILICONFLOW":
                return Provider.SILICONFLOW;
            case "XUNFEI":
            case "SPARK":
                return Provider.XUNFEI;
            case "AZURE":
            case "AZURE_OPENAI":
                return Provider.AZURE;
            case "ANTHROPIC":
            case "CLAUDE":
                return Provider.ANTHROPIC;
            case "CUSTOM":
                return Provider.CUSTOM;
            default:
                logger.warn("未知的 LLM 提供商: {}，默认使用 DASHSCOPE", providerName);
                return Provider.DASHSCOPE;
        }
    }

    private static LlmClient createCustomClient(Config config, RetryPolicy retryPolicy) {
        logger.info("使用自定义 OpenAI 兼容模式: baseUrl={}, model={}", 
            config.getLlm().getBaseUrl(), config.getLlm().getModel());
        return new OpenAiLlmClient(config, retryPolicy);
    }

    public static String getDefaultBaseUrl(String providerName) {
        Provider provider = parseProvider(providerName);
        switch (provider) {
            case DASHSCOPE:
                return DashScopeLlmClient.getDefaultBaseUrlStatic();
            case OPENAI:
                return OpenAiLlmClient.getDefaultBaseUrlStatic();
            case OLLAMA:
                return OllamaLlmClient.getDefaultBaseUrlStatic();
            case DEEPSEEK:
                return "https://api.deepseek.com";
            case ZHIPU:
                return "https://open.bigmodel.cn/api/paas/v4";
            case MOONSHOT:
                return "https://api.moonshot.cn/v1";
            case MINIMAX:
                return "https://api.minimaxi.chat/v1";
            case STEPFUN:
                return "https://api.stepfun.com/v1";
            case LINGYI:
                return "https://api.lingyiwanwu.com/v1";
            case DOUBAO:
                return "https://ark.cn-beijing.volces.com/api/v3";
            case SILICONFLOW:
                return "https://api.siliconflow.cn/v1";
            case XUNFEI:
                return "https://spark-api-open.xf-yun.com/v1";
            case ANTHROPIC:
                return AnthropicLlmClient.getDefaultBaseUrlStatic();
            default:
                return OpenAiLlmClient.getDefaultBaseUrlStatic();
        }
    }

    public static String getDefaultModel(String providerName) {
        Provider provider = parseProvider(providerName);
        switch (provider) {
            case DASHSCOPE:
                return DashScopeLlmClient.getDefaultModelStatic();
            case OPENAI:
                return OpenAiLlmClient.getDefaultModelStatic();
            case OLLAMA:
                return OllamaLlmClient.getDefaultModelStatic();
            case DEEPSEEK:
                return "deepseek-chat";
            case ZHIPU:
                return "GLM-4.7-Flash";
            case MOONSHOT:
                return "kimi-k2.6";
            case MINIMAX:
                return "MiniMax-M2.5";
            case STEPFUN:
                return "step-2";
            case LINGYI:
                return "yi-large";
            case DOUBAO:
                return "doubao-pro-32k";
            case SILICONFLOW:
                return "deepseek-v4-flash";
            case XUNFEI:
                return "spark-4.0";
            case ANTHROPIC:
                return AnthropicLlmClient.getDefaultModelStatic();
            default:
                return OpenAiLlmClient.getDefaultModelStatic();
        }
    }
}
