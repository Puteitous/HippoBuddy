package com.example.agent.desktop.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefQueryCallback;
import org.cef.handler.CefMessageRouterHandlerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.Desktop;
import java.net.URI;

/**
 * 外部链接处理 — 拦截前端 openExternal 请求，在系统默认浏览器中打开链接。
 *
 * <p>
 * 避免 JCEF 内直接导航到外部 URL 导致应用窗口跳转。
 * </p>
 */
public class ExternalLinkHandler extends CefMessageRouterHandlerAdapter {

    private static final Logger logger = LoggerFactory.getLogger(ExternalLinkHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId,
                           String request, boolean persistent, CefQueryCallback callback) {
        try {
            JsonNode json = MAPPER.readTree(request);
            String action = json.has("action") ? json.get("action").asText() : "";

            if (!"openExternal".equals(action)) {
                return false;
            }

            String url = json.has("url") ? json.get("url").asText() : "";
            if (url.isBlank()) {
                callback.failure(400, "URL is empty");
                return true;
            }

            logger.info("在系统浏览器中打开外部链接: {}", url);

            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                callback.success("{}");
            } else {
                logger.warn("系统不支持 Desktop.browse()，无法打开外部链接: {}", url);
                callback.failure(500, "Desktop.browse() not supported");
            }

            return true;
        } catch (Exception e) {
            logger.error("打开外部链接失败", e);
            callback.failure(500, e.getMessage());
            return true;
        }
    }
}
