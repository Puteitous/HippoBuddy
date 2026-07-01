package com.example.agent.desktop.bridge;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.desktop.WorkspaceContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefQueryCallback;
import org.cef.handler.CefMessageRouterHandlerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Bridge Handler — 读写配置和工作区路径。
 *
 * <p>
 * 除原有的工作区路径操作外，新增通用 {@code getConfig} / {@code updateConfig} action，
 * 支持前端通过 Bridge 读写任意配置节（session / context / tools / ui / mcp 等）。
 * </p>
 *
 * <p>
 * 无状态，无需构造函数参数，通过 Config / WorkspaceContext 静态方法操作。
 * </p>
 */
public class ConfigHandler extends CefMessageRouterHandlerAdapter {

    private static final Logger logger = LoggerFactory.getLogger(ConfigHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId,
                           String request, boolean persistent, CefQueryCallback callback) {
        try {
            JsonNode json = MAPPER.readTree(request);
            String action = json.has("action") ? json.get("action").asText() : "";

            switch (action) {
                case "getCurrentFolder":
                    handleGetCurrentFolder(callback);
                    return true;
                case "setCurrentFolder":
                    handleSetCurrentFolder(json, callback);
                    return true;
                case "clearCurrentFolder":
                    handleClearCurrentFolder(callback);
                    return true;
                case "isDefaultWorkspace":
                    handleIsDefaultWorkspace(callback);
                    return true;
                case "getDefaultWorkspace":
                    handleGetDefaultWorkspace(callback);
                    return true;
                case "setDefaultWorkspace":
                    handleSetDefaultWorkspace(json, callback);
                    return true;
                case "getConfig":
                    handleGetConfig(callback);
                    return true;
                case "updateConfig":
                    handleUpdateConfig(json, callback);
                    return true;
                default:
                    return false;
            }
        } catch (Exception e) {
            logger.error("ConfigHandler query failed", e);
            callback.failure(500, e.getMessage());
            return true;
        }
    }

    // ===== 工作区路径 =====

    private void handleGetCurrentFolder(CefQueryCallback callback) throws Exception {
        callback.success(MAPPER.writeValueAsString(
                MAPPER.createObjectNode().put("path", WorkspaceContext.getCurrentFolder() != null
                        ? WorkspaceContext.getCurrentFolder() : "")));
    }

    private void handleSetCurrentFolder(JsonNode json, CefQueryCallback callback) throws Exception {
        WorkspaceContext.setCurrentFolder(json.has("path") ? json.get("path").asText() : null);
        WorkspaceContext.save();
        callback.success(MAPPER.writeValueAsString(
                MAPPER.createObjectNode().put("path", WorkspaceContext.getCurrentFolder())));
    }

    private void handleClearCurrentFolder(CefQueryCallback callback) throws Exception {
        WorkspaceContext.clear();
        WorkspaceContext.save();
        callback.success(MAPPER.writeValueAsString(
                MAPPER.createObjectNode().put("path", "")));
    }

    private void handleIsDefaultWorkspace(CefQueryCallback callback) throws Exception {
        callback.success(MAPPER.writeValueAsString(
                MAPPER.createObjectNode().put("isDefault", WorkspaceContext.isDefaultWorkspace())));
    }

    // ===== 默认工作区路径配置 =====

    private void handleGetDefaultWorkspace(CefQueryCallback callback) throws Exception {
        String path = Config.getInstance().getWorkspace().getDefaultWorkspacePath();
        callback.success(MAPPER.writeValueAsString(
                MAPPER.createObjectNode().put("path", path != null ? path : "")));
    }

    private void handleSetDefaultWorkspace(JsonNode json, CefQueryCallback callback) throws Exception {
        String path = json.has("path") ? json.get("path").asText() : "";
        Config.getInstance().getWorkspace().setDefaultWorkspacePath(path);
        Config.getInstance().save();

        // 如果当前在默认工作区，立即切换到新路径
        boolean switched = false;
        if (WorkspaceContext.isDefaultWorkspace()) {
            WorkspaceContext.clear();
            WorkspaceContext.save();
            switched = true;
        }

        ObjectNode result = MAPPER.createObjectNode();
        result.put("path", path);
        result.put("switched", switched);
        callback.success(MAPPER.writeValueAsString(result));
    }

    // ===== 通用配置读写 =====

    /**
     * 返回完整配置 JSON。
     * 敏感字段（如 apiKey）会自动遮掩。
     */
    private void handleGetConfig(CefQueryCallback callback) throws Exception {
        Config config = Config.getInstance();
        ObjectNode root = MAPPER.createObjectNode();

        root.set("llm", maskLlmConfig(config.getLlm()));
        root.set("session", MAPPER.valueToTree(config.getSession()));
        root.set("context", MAPPER.valueToTree(config.getContext()));
        root.set("tools", MAPPER.valueToTree(config.getTools()));
        root.set("ui", MAPPER.valueToTree(config.getUi()));
        root.set("workspace", MAPPER.valueToTree(config.getWorkspace()));
        root.set("mcp", MAPPER.valueToTree(config.getMcp()));

        callback.success(MAPPER.writeValueAsString(root));
    }

    /**
     * 接收前端 partial JSON 并合并到 Config 中，然后保存。
     *
     * <p>
     * 请求格式：
     * <pre>
     * { "action": "updateConfig", "values": { "session": { "auto_save": true }, ... } }
     * </pre>
     * 只更新 values 中出现的配置节，未出现的保持不变。
     * </p>
     */
    private void handleUpdateConfig(JsonNode json, CefQueryCallback callback) throws Exception {
        JsonNode values = json.get("values");
        if (values == null || !values.isObject()) {
            callback.failure(400, "Missing or invalid 'values' field");
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
        callback.success("{\"success\":true}");
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
}
