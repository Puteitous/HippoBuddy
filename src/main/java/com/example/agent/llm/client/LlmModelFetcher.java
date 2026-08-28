package com.example.agent.llm.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 从模型厂商的 OpenAI 兼容 {@code /v1/models} 端点拉取当前 API Key 可用的模型列表。
 * <p>
 * 最小范围实现：只覆盖提供 OpenAI 兼容 models 端点的厂商（DeepSeek / 智谱 / Kimi / 火山
 * / 阿里 compatible-mode 等）。Anthropic、Ollama、本地模型、Azure 等协议或鉴权特殊者
 * 不在此列，通过 {@link #isSupported(String)} 识别并在调用时抛出
 * {@link UnsupportedOperationException}。
 */
public final class LlmModelFetcher {

    private static final Logger logger = LoggerFactory.getLogger(LlmModelFetcher.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 15;

    /** 不提供 OpenAI 兼容 /v1/models 的厂商（下大写匹配），拉取时跳过 */
    private static final Set<String> UNSUPPORTED_PROVIDERS =
            Set.of("ANTHROPIC", "OLLAMA", "LOCAL", "AZURE", "AZURE_OPENAI");

    private LlmModelFetcher() {
    }

    /** 该 provider 是否走 OpenAI 兼容 /v1/models 拉取（决定前端是否展示「从 API 拉取」入口） */
    public static boolean isSupported(String provider) {
        if (provider == null || provider.isBlank()) {
            return false;
        }
        return !UNSUPPORTED_PROVIDERS.contains(provider.trim().toUpperCase());
    }

    /**
     * 拉取 baseUrl 下当前 API Key 可用的模型 ID 列表（不重排，保持厂商返回顺序）。
     *
     * @param baseUrl 厂商 base URL（通常已含 {@code /v1}），如 {@code https://api.deepseek.com/v1}
     * @param apiKey  API Key
     * @return 模型 ID 列表
     * @throws UnsupportedOperationException 厂商不受支持
     * @throws IllegalArgumentException       缺少 API Key
     * @throws IllegalStateException          接口返回非 2xx
     * @throws Exception                      网络 / 解析失败
     */
    public static List<String> fetchModels(String baseUrl, String apiKey) throws Exception {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("缺少 API Key，无法从该厂商拉取模型");
        }
        String url = buildModelsUrl(baseUrl);
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .build();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        int status = response.statusCode();
        String body = response.body();
        if (status < 200 || status >= 300) {
            logger.warn("拉取模型列表失败: status={}, url={}, body={}", status, url, truncate(body, 300));
            throw new IllegalStateException("厂商接口返回 HTTP " + status);
        }

        JsonNode root = MAPPER.readTree(body);
        JsonNode data = root.path("data");
        List<String> models = new ArrayList<>();
        if (data.isArray()) {
            for (JsonNode item : data) {
                String id = item.path("id").asText("");
                if (!id.isBlank()) {
                    models.add(id);
                }
            }
        }
        logger.info("已从厂商拉取模型列表: url={}, count={}", url, models.size());
        return models;
    }

    /** 在 baseUrl 末尾追加 /models（baseUrl 去掉尾部斜杠） */
    static String buildModelsUrl(String baseUrl) {
        String normalized = baseUrl == null ? "" : baseUrl.replaceAll("/+$", "");
        return normalized + "/models";
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max);
    }
}