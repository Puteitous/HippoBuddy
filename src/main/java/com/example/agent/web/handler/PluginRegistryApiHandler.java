package com.example.agent.web.handler;

import com.example.agent.config.Config;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * 远程插件目录代理端点。
 * <p>
 * GET /api/plugins/registry — 从 config.yaml 的 plugins.registry_url 拉取远程目录 index.json
 * 并原样透传，供插件市场读取。由后端发起网络请求，避免前端直连远程的跨域(CORS)与安全差异。
 *
 * 返回形态(成功时即为远程目录原始 JSON):
 * <pre>
 * { "version": 1, "updated": "2026-09-17", "plugins": [ ... ] }
 * </pre>
 * registry_url 为空时返回离线形态: { "version": 0, "plugins": [], "offline": true }
 * 拉取失败(超时/网络错误/非 2xx)返回非 2xx,前端据此回退内置目录。
 */
public class PluginRegistryApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(PluginRegistryApiHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 8;

    private final OkHttpClient httpClient;

    public PluginRegistryApiHandler() {
        this(new OkHttpClient.Builder()
                .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .followRedirects(true)
                .build());
    }

    // 包级可见,便于测试注入 mock HttpClient
    PluginRegistryApiHandler(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, MAPPER.createObjectNode().put("success", false).put("message", "Method not allowed").toString());
            return;
        }

        String url = Config.getInstance().getPlugins().getRegistryUrl();
        if (url == null || url.isBlank()) {
            // 未配置远程目录 → 离线形态,前端回退内置目录
            ObjectNode offline = MAPPER.createObjectNode();
            offline.put("version", 0);
            offline.put("offline", true);
            offline.set("plugins", MAPPER.createArrayNode());
            sendJson(exchange, 200, offline.toString());
            return;
        }

        try {
            JsonNode remote = fetchRegistry(url);
            sendJson(exchange, 200, MAPPER.writeValueAsString(remote));
        } catch (Exception e) {
            logger.warn("拉取远程插件目录失败: {} - {}", url, e.getMessage());
            ObjectNode err = MAPPER.createObjectNode();
            err.put("success", false);
            err.put("message", e.getMessage() == null ? String.valueOf(e) : e.getMessage());
            sendJson(exchange, 502, err.toString());
        }
    }

    private JsonNode fetchRegistry(String url) throws IOException {
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", "HippoBuddy-Python/1.0 (plugin-registry)")
                .header("Accept", "application/json")
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("HTTP " + response.code() + " " + response.message());
            }
            byte[] bytes = response.body() != null ? response.body().bytes() : new byte[0];
            if (bytes.length == 0) {
                throw new IOException("远程目录内容为空");
            }
            return MAPPER.readTree(bytes);
        }
    }

    private void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}