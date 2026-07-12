package com.example.agent.web.handler;

import com.example.agent.config.Config;
import com.example.agent.config.ConfigLoader;
import com.example.agent.config.LlmConfig;
import com.example.agent.config.ModelSnapshot;
import com.example.agent.web.orchestrator.WebAgentOrchestrator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
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
import java.util.List;

/**
 * LLM 配置读取/保存 API（GET/PUT /api/config/llm）。
 * <p>
 * 前端通过此接口在运行时切换模型、Provider、API Key，无需重启。
 * 支持两种保存场景：
 * 1. 完整保存（来自配置弹窗）→ 包含 provider/model/baseUrl/apiKey 等全部字段
 * 2. 快速切换（来自状态栏下拉框）→ 只带 provider+model，后端从历史快照恢复完整配置
 * </p>
 */
public class ConfigApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ConfigApiHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final ObjectMapper YAML_MAPPER = new ObjectMapper(new YAMLFactory());

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
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
                    } else if ("/api/config".equals(path) || "/api/config/".equals(path)) {
                        handleGetFull(exchange);
                    } else {
                        sendError(exchange, 404, "Not Found");
                    }
                    break;
                case "PUT":
                    if ("/api/config/llm".equals(path)) {
                        handlePut(exchange);
                    } else if ("/api/config".equals(path) || "/api/config/".equals(path)) {
                        handlePutFull(exchange);
                    } else {
                        sendError(exchange, 404, "Not Found");
                    }
                    break;
                case "DELETE":
                    if ("/api/config/llm/history".equals(path)) {
                        handleDeleteHistory(exchange);
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

        // 返回模型历史快照列表（每个快照包含完整配置，apiKey 已遮掩）
        ArrayNode history = MAPPER.createArrayNode();
        if (llm.getModelHistory() != null) {
            for (ModelSnapshot snap : llm.getModelHistory()) {
                ObjectNode snapNode = MAPPER.createObjectNode();
                snapNode.put("provider", snap.getProvider() != null ? snap.getProvider() : "");
                snapNode.put("model", snap.getModel() != null ? snap.getModel() : "");
                snapNode.put("baseUrl", snap.getBaseUrl() != null ? snap.getBaseUrl() : "");
                snapNode.put("apiKeyMasked", snap.maskApiKey());
                snapNode.put("maxTokens", snap.getMaxTokens());
                snapNode.put("thinkingEnabled", snap.isThinkingEnabled());
                snapNode.put("reasoningEffort", snap.getReasoningEffort() != null ? snap.getReasoningEffort() : "");
                history.add(snapNode);
            }
        }
        node.set("modelHistory", history);

        String body = MAPPER.writeValueAsString(node);
        sendJson(exchange, 200, body);
    }

    private void handlePut(HttpExchange exchange) throws IOException {
        byte[] reqBytes = exchange.getRequestBody().readAllBytes();
        JsonNode json = MAPPER.readTree(reqBytes);

        Config config = Config.getInstance();
        LlmConfig llm = config.getLlm();

        // 判断是否是快速切换（只带了 provider+model，没有其他配置字段）
        boolean isQuickSwitch = json.has("provider") && json.has("model")
                && !json.has("baseUrl") && !json.has("apiKey");

        if (isQuickSwitch) {
            // ========== 快速切换：从历史快照恢复完整配置 ==========
            String switchProvider = json.get("provider").asText();
            String switchModel = json.get("model").asText();
            ModelSnapshot snapshot = llm.findSnapshot(switchProvider, switchModel);

            if (snapshot != null) {
                logger.info("快速切换模型（从历史快照恢复）: provider={}, model={}", switchProvider, switchModel);
                snapshot.applyTo(llm);
            } else {
                logger.warn("快速切换模型但未找到历史快照，仅切换 provider/model: {} / {}", switchProvider, switchModel);
                llm.setProvider(switchProvider);
                llm.setModel(switchModel);
            }

            // 快照当前配置到历史
            llm.snapshotToHistory();
        } else {
            // ========== 完整保存（来自配置弹窗） ==========
            // 先把当前配置快照到历史（切换前的旧模型保留记录）
            llm.snapshotToHistory();

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
            if (json.has("maxTokens")) {
                llm.setMaxTokens(json.get("maxTokens").asInt());
            }
            if (json.has("thinkingEnabled")) {
                llm.setThinkingEnabled(json.get("thinkingEnabled").asBoolean());
            }
            if (json.has("reasoningEffort")) {
                llm.setReasoningEffort(json.get("reasoningEffort").asText());
            }

            // 快照当前配置到历史（新模型的配置也保存）
            llm.snapshotToHistory();
        }

        // 写入 YAML
        persistConfig(llm);

        // 通知 Orchestrator：Provider 可能变了，需要重建 LlmClient
        WebAgentOrchestrator.getInstance().refreshClient();

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        sendJson(exchange, 200, MAPPER.writeValueAsString(resp));
    }

    /**
     * DELETE /api/config/llm/history
     * 从历史记录中删除指定模型快照。
     * 请求体: { "provider": "...", "model": "..." }
     */
    private void handleDeleteHistory(HttpExchange exchange) throws IOException {
        byte[] reqBytes = exchange.getRequestBody().readAllBytes();
        JsonNode json = MAPPER.readTree(reqBytes);

        String provider = json.has("provider") ? json.get("provider").asText() : "";
        String model = json.has("model") ? json.get("model").asText() : "";

        if (provider.isEmpty() || model.isEmpty()) {
            sendError(exchange, 400, "provider 和 model 不能为空");
            return;
        }

        Config config = Config.getInstance();
        LlmConfig llm = config.getLlm();
        List<ModelSnapshot> history = llm.getModelHistory();
        String targetKey = provider + ":" + model;

        boolean removed = history.removeIf(s -> s.getKey().equals(targetKey));
        if (removed) {
            llm.setModelHistory(history);
            persistConfig(llm);
            logger.info("已从历史记录删除模型: {}", targetKey);
        } else {
            logger.warn("未找到要删除的模型: {}", targetKey);
        }

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        resp.put("removed", removed);
        sendJson(exchange, 200, MAPPER.writeValueAsString(resp));
    }

    // ===== 全量配置读写（替代原 JCEF ConfigHandler 的 handleGetConfig/handleUpdateConfig） =====

    /**
     * GET /api/config — 返回完整配置 JSON（所有配置节）。
     * 敏感字段（如 apiKey）已遮掩。
     */
    private void handleGetFull(HttpExchange exchange) throws IOException {
        Config config = Config.getInstance();
        ObjectNode root = MAPPER.createObjectNode();
        root.set("llm", maskLlmConfig(config.getLlm()));
        root.set("session", MAPPER.valueToTree(config.getSession()));
        root.set("context", MAPPER.valueToTree(config.getContext()));
        root.set("tools", MAPPER.valueToTree(config.getTools()));
        root.set("ui", MAPPER.valueToTree(config.getUi()));
        root.set("workspace", MAPPER.valueToTree(config.getWorkspace()));
        root.set("mcp", MAPPER.valueToTree(config.getMcp()));
        sendJson(exchange, 200, MAPPER.writeValueAsString(root));
    }

    /**
     * PUT /api/config — 部分更新配置。
     * 请求体: { "values": { "session": { ... }, "tools": { ... }, ... } }
     * 只更新 values 中出现的配置节，未出现的保持不变。
     */
    private void handlePutFull(HttpExchange exchange) throws IOException {
        byte[] reqBytes = exchange.getRequestBody().readAllBytes();
        JsonNode json = MAPPER.readTree(reqBytes);
        JsonNode values = json.get("values");
        if (values == null || !values.isObject()) {
            sendError(exchange, 400, "Missing or invalid 'values' field");
            return;
        }

        Config config = Config.getInstance();
        if (values.has("session")) {
            MAPPER.readerForUpdating(config.getSession()).readValue(values.get("session"));
        }
        if (values.has("context")) {
            MAPPER.readerForUpdating(config.getContext()).readValue(values.get("context"));
        }
        if (values.has("tools")) {
            MAPPER.readerForUpdating(config.getTools()).readValue(values.get("tools"));
        }
        if (values.has("ui")) {
            MAPPER.readerForUpdating(config.getUi()).readValue(values.get("ui"));
        }
        if (values.has("workspace")) {
            MAPPER.readerForUpdating(config.getWorkspace()).readValue(values.get("workspace"));
        }
        if (values.has("mcp")) {
            MAPPER.readerForUpdating(config.getMcp()).readValue(values.get("mcp"));
        }
        config.save();

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        sendJson(exchange, 200, MAPPER.writeValueAsString(resp));
    }

    /** 将 LlmConfig 序列化为 JSON 树，并遮掩 apiKey。 */
    private static ObjectNode maskLlmConfig(LlmConfig llm) {
        ObjectNode node = MAPPER.valueToTree(llm);
        String raw = node.has("api_key") ? node.get("api_key").asText() : "";
        node.put("api_key", maskKey(raw));
        return node;
    }

    /** 遮掩 API Key：只保留前 2 后 2，中间变星号。 */
    private static String maskKey(String key) {
        if (key == null || key.length() <= 4) return "****";
        return key.substring(0, 2) + "****" + key.substring(key.length() - 2);
    }

    /** 将 LlmConfig（含 model_history）持久化到 config.yaml */
    private void persistConfig(LlmConfig llm) throws IOException {
        File configFile = new ConfigLoader().getConfigFile();
        if (configFile.exists()) {
            try {
                JsonNode root = YAML_MAPPER.readTree(configFile);
                if (root instanceof ObjectNode rootObj) {
                    JsonNode llmNode = rootObj.get("llm");
                    if (llmNode instanceof ObjectNode llmObj) {
                        llmObj.put("provider", llm.getProvider());
                        llmObj.put("model", llm.getModel());
                        llmObj.put("base_url", llm.getBaseUrl());
                        if (llm.getApiKey() != null) {
                            llmObj.put("api_key", llm.getApiKey());
                        }
                        llmObj.put("max_tokens", llm.getMaxTokens());
                        llmObj.put("thinking_enabled", llm.isThinkingEnabled());
                        llmObj.put("reasoning_effort", llm.getReasoningEffort());

                        // 持久化模型历史快照
                        ArrayNode historyArr = YAML_MAPPER.createArrayNode();
                        if (llm.getModelHistory() != null) {
                            for (ModelSnapshot snap : llm.getModelHistory()) {
                                ObjectNode snapNode = YAML_MAPPER.createObjectNode();
                                snapNode.put("provider", snap.getProvider());
                                snapNode.put("model", snap.getModel());
                                snapNode.put("base_url", snap.getBaseUrl() != null ? snap.getBaseUrl() : "");
                                snapNode.put("api_key", snap.getApiKey() != null ? snap.getApiKey() : "");
                                snapNode.put("max_tokens", snap.getMaxTokens());
                                snapNode.put("thinking_enabled", snap.isThinkingEnabled());
                                snapNode.put("reasoning_effort", snap.getReasoningEffort() != null ? snap.getReasoningEffort() : "");
                                historyArr.add(snapNode);
                            }
                        }
                        llmObj.set("model_history", historyArr);

                        rootObj.set("llm", llmObj);
                        YAML_MAPPER.writer().writeValue(configFile, rootObj);
                        logger.info("LLM 配置已持久化: provider={}, model={}", llm.getProvider(), llm.getModel());
                    } else {
                        logger.warn("YAML 中找不到 llm 节点，回退到全量 save");
                        Config.getInstance().save();
                    }
                } else {
                    logger.warn("YAML 根节点不是对象，回退到全量 save");
                    Config.getInstance().save();
                }
            } catch (Exception e) {
                logger.error("直接编辑 YAML 失败，回退到全量 save", e);
                Config.getInstance().save();
            }
        } else {
            Config.getInstance().save();
        }
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
