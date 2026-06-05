package com.example.agent.tools.web;

import com.example.agent.tools.ToolExecutionException;
import com.example.agent.tools.ToolExecutor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.concurrent.TimeUnit;

/**
 * 搜索互联网获取实时信息。
 * 支持 Brave Search（默认）和 Tavily（专为 LLM Agent 设计）两种后端。
 * Brave：月 2,000 次免费，无需绑卡。Tavily：月 1,000 次免费，content 摘要更丰富。
 * 通过 config.yaml 中 web_search.provider 切换。
 */
public class WebSearchTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(WebSearchTool.class);

    private static final String PROVIDER_BRAVE = "brave";
    private static final String PROVIDER_TAVILY = "tavily";

    private static final String BRAVE_API_BASE = "https://api.search.brave.com/res/v1/web/search";
    private static final String TAVILY_API_BASE = "https://api.tavily.com/search";

    private static final int MAX_RESULTS = 10;
    private static final int DEFAULT_NUM = 5;
    private static final int TIMEOUT_SECONDS = 15;

    private static final MediaType JSON_MEDIA_TYPE = MediaType.get("application/json; charset=utf-8");

    private final OkHttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final WebSearchConfig config;

    public WebSearchTool(WebSearchConfig config) {
        this(config, new OkHttpClient.Builder()
                .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .build());
    }

    // 包级可见，用于测试注入 mock HttpClient
    WebSearchTool(WebSearchConfig config, OkHttpClient httpClient) {
        this.config = config;
        this.httpClient = httpClient;
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public String getName() {
        return "web_search";
    }

    @Override
    public String getDescription() {
        return "搜索互联网获取实时信息。适用于查询最新文档、API 用法、技术问题、新闻等。" +
               "LLM 知识有截止日期，通过此工具可获取最新数据。" +
               "返回结果包含标题、摘要、链接。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词，应包含当前年份以获取最新结果"
                    },
                    "num": {
                        "type": "integer",
                        "description": "返回结果数量（1-10，默认 5）",
                        "default": 5,
                        "minimum": 1,
                        "maximum": 10
                    }
                },
                "required": ["query"]
            }
            """;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (!config.isEnabled()) {
            throw new ToolExecutionException(
                "WebSearch 未配置 API Key。请在 config.yaml 中设置 web_search.api_key。" +
                "免费注册: https://brave.com/search/api/"
            );
        }

        JsonNode queryNode = arguments.get("query");
        if (queryNode == null) {
            throw new ToolExecutionException("搜索关键词不能为空");
        }
        String query = queryNode.asText().trim();
        int num = arguments.has("num") ? arguments.get("num").asInt(DEFAULT_NUM) : DEFAULT_NUM;
        num = Math.max(1, Math.min(num, MAX_RESULTS));

        if (query.isEmpty()) {
            throw new ToolExecutionException("搜索关键词不能为空");
        }

        try {
            String provider = config.getProvider();
            String responseJson;
            if (PROVIDER_TAVILY.equalsIgnoreCase(provider)) {
                responseJson = callTavilyApi(query, num);
            } else {
                responseJson = callBraveApi(query, num);
            }
            return formatResults(query, responseJson);
        } catch (IOException e) {
            logger.error("WebSearch API 调用失败: {}", e.getMessage());
            throw new ToolExecutionException("搜索失败: " + e.getMessage(), e);
        }
    }

    private String callBraveApi(String query, int num) throws IOException {
        String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
        String url = BRAVE_API_BASE + "?q=" + encodedQuery + "&count=" + num;

        Request request = new Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .header("Accept-Encoding", "gzip")
                .header("X-Subscription-Token", config.getApiKey())
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Brave API 返回状态码: " + response.code() +
                        " " + (response.body() != null ? response.body().string() : ""));
            }
            String body = response.body() != null ? response.body().string() : "";
            if (body.isEmpty()) {
                throw new IOException("搜索结果为空");
            }
            return body;
        }
    }

    private String callTavilyApi(String query, int num) throws IOException {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("query", query);
        body.put("search_depth", "basic");
        body.put("max_results", num);
        body.put("include_answer", false);

        Request request = new Request.Builder()
                .url(TAVILY_API_BASE)
                .post(RequestBody.create(body.toString(), JSON_MEDIA_TYPE))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + config.getApiKey())
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Tavily API 返回状态码: " + response.code() +
                        " " + (response.body() != null ? response.body().string() : ""));
            }
            String responseBody = response.body() != null ? response.body().string() : "";
            if (responseBody.isEmpty()) {
                throw new IOException("搜索结果为空");
            }
            return responseBody;
        }
    }

    // 包级可见，用于测试
    String formatResults(String query, String responseJson) throws IOException {
        JsonNode root = objectMapper.readTree(responseJson);
        String provider = config.getProvider();

        JsonNode results;
        if (PROVIDER_TAVILY.equalsIgnoreCase(provider)) {
            // Tavily: { results: [{ title, url, content, score }] }
            results = root.get("results");
        } else {
            // Brave: { web: { results: [{ title, url, description }] } }
            JsonNode web = root.get("web");
            results = (web != null) ? web.get("results") : null;
        }

        if (results == null || !results.isArray() || results.isEmpty()) {
            return "未找到关于 \"" + query + "\" 的搜索结果。";
        }

        YearMonth current = YearMonth.now();
        StringBuilder sb = new StringBuilder();
        sb.append("搜索结果 — \"").append(query).append("\" （").append(current.getYear()).append("年").append(current.getMonthValue()).append("月）\n\n");

        int index = 1;
        for (JsonNode result : results) {
            String title = result.has("title") ? result.get("title").asText() : "(无标题)";
            String url = result.has("url") ? result.get("url").asText() : "";

            sb.append(index).append(". **").append(title).append("**\n");
            if (!url.isEmpty()) {
                sb.append("   ").append(url).append("\n");
            }

            // Tavily 的 content 是完整摘要，Brave 的 description 是简短描述
            String content = PROVIDER_TAVILY.equalsIgnoreCase(provider)
                    ? (result.has("content") ? result.get("content").asText() : "")
                    : (result.has("description") ? result.get("description").asText() : "");

            if (!content.isEmpty()) {
                // 截断过长的 content，保留前 500 字符
                if (content.length() > 500) {
                    content = content.substring(0, 500) + "...";
                }
                sb.append("   ").append(content).append("\n");
            }
            sb.append("\n");
            index++;
        }

        sb.append("---\n");
        sb.append("**重要**: 在回复中必须包含以上来源链接，使用 markdown 超链接格式 [标题](URL)。\n");

        return sb.toString();
    }

    @Override
    public boolean requiresFileLock() {
        return false;
    }

    @Override
    public boolean shouldRunInBackground() {
        return true;
    }
}
