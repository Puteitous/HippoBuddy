package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.llm.retry.RetryPolicy;

import java.net.http.HttpRequest;

public class OllamaLlmClient extends AbstractLlmClient {

    private static final String CHAT_COMPLETIONS_PATH = "/chat/completions";
    private static final String DEFAULT_BASE_URL = "http://localhost:11434/v1";
    private static final String DEFAULT_MODEL = "qwen2.5:7b";

    public OllamaLlmClient() {
        this(Config.getInstance());
    }

    public OllamaLlmClient(Config config) {
        this(config, RetryPolicy.defaultPolicy());
    }

    public OllamaLlmClient(Config config, RetryPolicy retryPolicy) {
        super(config, retryPolicy);
    }

    @Override
    protected String getChatCompletionsPath() {
        return CHAT_COMPLETIONS_PATH;
    }

    @Override
    protected String getAuthorizationHeader() {
        return null;
    }

    @Override
    protected void enrichRequestHeaders(HttpRequest.Builder builder) {
        if (config.getLlm().isServerCache()) {
            logger.warn("⚠️ Ollama 本地模型暂不支持服务端缓存，已忽略该配置");
        }
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
        return "ollama";
    }
}
