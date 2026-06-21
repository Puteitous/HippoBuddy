package com.example.agent.desktop.bridge;

import com.example.agent.config.Config;
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
 * 工作区路径 Bridge Handler — 读写 workspace.txt（当前工作目录）。
 *
 * <p>
 * 无状态，无需构造函数参数，通过 WorkspaceContext 静态方法操作。
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
}
