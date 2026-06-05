package com.example.agent.tools.web;

import com.example.agent.tools.ToolExecutionException;
import com.example.agent.tools.ToolExecutor;
import com.fasterxml.jackson.databind.JsonNode;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

/**
 * 获取指定 URL 的网页内容，以纯文本格式返回。
 * 使用 OkHttp 发起请求 + jsoup 解析 HTML。
 * 适用于查看官方文档、技术文章等详细内容。
 */
public class WebFetchTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(WebFetchTool.class);
    private static final int TIMEOUT_SECONDS = 10;
    private static final int MAX_CHARS = 50_000;
    private static final int MAX_CHARS_WARN = 40_000;

    private final OkHttpClient httpClient;

    public WebFetchTool() {
        this(new OkHttpClient.Builder()
                .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .followRedirects(true)
                .build());
    }

    // 包级可见，用于测试注入 mock HttpClient
    WebFetchTool(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    @Override
    public String getName() {
        return "web_fetch";
    }

    @Override
    public String getDescription() {
        return "获取指定 URL 的网页内容，以纯文本格式返回。" +
               "适用于查看官方文档、技术文章、API 参考等详细内容。" +
               "自动处理编码、重定向，并过滤 HTML 标签。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要获取的网页 URL（支持 http/https）"
                    }
                },
                "required": ["url"]
            }
            """;
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        JsonNode urlNode = arguments.get("url");
        if (urlNode == null) {
            throw new ToolExecutionException("URL 不能为空");
        }
        String url = urlNode.asText().trim();

        if (url.isEmpty()) {
            throw new ToolExecutionException("URL 不能为空");
        }

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }

        // 安全校验：拦截钓鱼 URL（如 https://evil.com@legitimate.com）
        if (url.contains("@")) {
            int protocolEnd = url.indexOf("://");
            // @ 在协议之后 → 被解析为 credentials，拦截
            if (protocolEnd >= 0 && url.indexOf("@", protocolEnd + 3) > 0) {
                throw new ToolExecutionException("不安全的 URL：包含用户凭证信息");
            }
        }

        try {
            String html = fetchUrl(url);
            String text = htmlToText(html, url);
            return truncateIfNeeded(text, url);
        } catch (IOException e) {
            logger.error("获取网页失败: {} - {}", url, e.getMessage());
            throw new ToolExecutionException("获取网页失败: " + e.getMessage(), e);
        }
    }

    private String fetchUrl(String url) throws IOException {
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("HTTP " + response.code() + " " + response.message());
            }

            byte[] bytes = response.body() != null ? response.body().bytes() : new byte[0];
            if (bytes.length == 0) {
                throw new IOException("网页内容为空");
            }

            // 检测编码并转为字符串
            String contentType = response.header("Content-Type", "");
            String charset = detectCharset(contentType);
            return new String(bytes, charset);
        }
    }

    private String detectCharset(String contentType) {
        if (contentType == null || contentType.isEmpty()) {
            return "UTF-8";
        }
        String lower = contentType.toLowerCase();
        if (lower.contains("charset=")) {
            String charset = lower.substring(lower.indexOf("charset=") + 8).trim();
            if (charset.contains(";")) {
                charset = charset.substring(0, charset.indexOf(";")).trim();
            }
            return charset;
        }
        return "UTF-8";
    }

    // 包级可见，用于测试
    String htmlToText(String html, String url) {
        Document doc = Jsoup.parse(html, url);

        // 移除无用元素
        doc.select("script, style, nav, footer, header, aside, " +
                   ".sidebar, .nav, .menu, .footer, .header, .ad, .advertisement, " +
                   "noscript, iframe, form, .cookie-banner, .popup").remove();

        String title = doc.title();
        StringBuilder sb = new StringBuilder();

        if (!title.isEmpty()) {
            sb.append("# ").append(title).append("\n\n");
        }

        // 用 Jsoup 的 wholeText 保留段落结构
        // 注意：不选 div/span 等容器元素，避免重复空白行
        doc.select("p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, td, th").forEach(element -> {
            String tag = element.tagName().toLowerCase();
            String text = element.wholeText().trim();

            if (text.isEmpty()) {
                return;
            }

            switch (tag) {
                case "h1" -> sb.append("# ").append(text).append("\n\n");
                case "h2" -> sb.append("## ").append(text).append("\n\n");
                case "h3" -> sb.append("### ").append(text).append("\n\n");
                case "h4" -> sb.append("#### ").append(text).append("\n\n");
                case "h5" -> sb.append("##### ").append(text).append("\n\n");
                case "h6" -> sb.append("###### ").append(text).append("\n\n");
                case "li" -> sb.append("- ").append(text).append("\n");
                case "pre" -> sb.append("```\n").append(text).append("\n```\n\n");
                case "blockquote" -> sb.append("> ").append(text.replace("\n", "\n> ")).append("\n\n");
                default -> sb.append(text).append("\n\n");
            }
        });

        // 合并连续 3+ 个换行为最多 2 个
        return sb.toString().trim().replaceAll("\n{3,}", "\n\n");
    }

    private String truncateIfNeeded(String text, String url) {
        if (text.length() <= MAX_CHARS) {
            return text;
        }

        String warn = "\n\n... [内容过长，已截断 " + (text.length() - MAX_CHARS) +
                " 字符，共 " + text.length() + " 字符。来源: " + url + "] ...";

        return text.substring(0, MAX_CHARS_WARN) + warn;
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
