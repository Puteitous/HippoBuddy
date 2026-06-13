package com.example.agent.web.handler;

import com.example.agent.config.Config;
import com.example.agent.config.ConfigLoader;
import com.example.agent.config.LlmConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * LLM 配置读取/保存 API（GET/PUT /api/config/llm）。
 * <p>
 * 前端通过此接口在运行时切换模型、Provider、API Key，无需重启。
 * 保存时直接编辑 YAML 文件的 llm 区块，避免全量序列化丢失其他字段。
 * </p>
 */
public class ConfigApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ConfigApiHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final ObjectMapper YAML_MAPPER = new ObjectMapper(new YAMLFactory());

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        try {
            String path = exchange.getRequestURI().getPath();
            switch (exchange.getRequestMethod()) {
                case "GET":
                    if ("/api/config/llm".equals(path)) {
                        handleGet(exchange);
                    } else {
                        sendError(exchange, 404, "Not Found");
                    }
                    break;
                case "PUT":
                    if ("/api/config/llm".equals(path)) {
                        handlePut(exchange);
                    } else {
                        sendError(exchange, 404, "Not Found");
                    }
                    break;
                default:
                    sendError(exchange, 405, "Method Not Allowed");
            }
        } catch (Exception e) {
            logger.error("ConfigApiHandler 处理失败", e);
            sendError(exchange, 500, e.getMessage());
        }
    }

    private void handleGet(HttpExchange exchange) throws IOException {
        Config config = Config.getInstance();
        LlmConfig llm = config.getLlm();

        ObjectNode node = MAPPER.createObjectNode();
        node.put("provider", llm.getProvider() != null ? llm.getProvider() : "");
        node.put("model", llm.getModel() != null ? llm.getModel() : "");
        node.put("baseUrl", llm.getBaseUrl() != null ? llm.getBaseUrl() : "");
        node.put("apiKeyMasked", llm.maskApiKey());
        node.put("hasApiKey", llm.getApiKey() != null && !llm.getApiKey().isEmpty()
                && !"your-api-key-here".equals(llm.getApiKey()));

        String body = MAPPER.writeValueAsString(node);
        sendJson(exchange, 200, body);
    }

    private void handlePut(HttpExchange exchange) throws IOException {
        byte[] reqBytes = exchange.getRequestBody().readAllBytes();
        JsonNode json = MAPPER.readTree(reqBytes);

        // 1. 更新内存中的 Config 对象
        Config config = Config.getInstance();
        LlmConfig llm = config.getLlm();

        if (json.has("provider")) {
            llm.setProvider(json.get("provider").asText());
        }
        if (json.has("model")) {
            llm.setModel(json.get("model").asText());
        }
        if (json.has("baseUrl")) {
            llm.setBaseUrl(json.get("baseUrl").asText());
        }
        if (json.has("apiKey")) {
            String key = json.get("apiKey").asText();
            if (!key.contains("****")) {
                llm.setApiKey(key);
            }
        }

        // 2. 直接编辑 YAML 文件的 llm 区块，不动其他字段
        File configFile = new ConfigLoader().getConfigFile();
        if (configFile.exists()) {
            try {
                JsonNode root = YAML_MAPPER.readTree(configFile);
                if (root instanceof ObjectNode rootObj) {
                    JsonNode llmNode = rootObj.get("llm");
                    if (llmNode instanceof ObjectNode llmObj) {
                        if (json.has("provider")) {
                            llmObj.put("provider", json.get("provider").asText());
                        }
                        if (json.has("model")) {
                            llmObj.put("model", json.get("model").asText());
                        }
                        if (json.has("baseUrl")) {
                            llmObj.put("base_url", json.get("baseUrl").asText());
                        }
                        if (json.has("apiKey")) {
                            String key = json.get("apiKey").asText();
                            if (!key.contains("****")) {
                                llmObj.put("api_key", key);
                            }
                        }
                        rootObj.set("llm", llmObj);
                        YAML_MAPPER.writer().writeValue(configFile, rootObj);
                        logger.info("LLM 配置已更新（直接编辑 YAML）: provider={}, model={}",
                                llm.getProvider(), llm.getModel());
                    } else {
                        logger.warn("YAML 中找不到 llm 节点，回退到全量 save");
                        config.save();
                    }
                } else {
                    logger.warn("YAML 根节点不是对象，回退到全量 save");
                    config.save();
                }
            } catch (Exception e) {
                logger.error("直接编辑 YAML 失败，回退到全量 save", e);
                config.save();
            }
        } else {
            config.save();
        }

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        sendJson(exchange, 200, MAPPER.writeValueAsString(resp));
    }

    private static void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static void sendError(HttpExchange exchange, int status, String msg) throws IOException {
        ObjectNode err = MAPPER.createObjectNode();
        err.put("error", msg);
        sendJson(exchange, status, MAPPER.writeValueAsString(err));
    }
}
