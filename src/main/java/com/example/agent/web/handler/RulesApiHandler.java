package com.example.agent.web.handler;

import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.rule.RuleLoader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 规则管理 API（GET /api/rules/list, POST /api/rules/create）。
 * <p>
 * GET — 返回当前工作区下所有可用的规则文件，区分项目级和用户级，包含元数据。
 * POST — 创建新的规则文件，支持 project/user 两种作用域。
 * </p>
 */
public class RulesApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(RulesApiHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        try {
            if ("GET".equals(method) && path.endsWith("/list")) {
                handleList(exchange);
            } else if ("POST".equals(method) && path.endsWith("/create")) {
                handleCreate(exchange);
            } else {
                sendJson(exchange, 404, "{\"error\":\"Not found: " + path + "\"}");
            }
        } catch (Exception e) {
            logger.error("Rules API error", e);
            sendJson(exchange, 500, "{\"error\":\"Internal server error\"}");
        }
    }

    private void handleList(HttpExchange exchange) throws IOException {
        String workspacePath = WorkspaceContext.getCurrentFolder();
        List<RuleLoader.RuleInfo> rules = RuleLoader.getRuleList(workspacePath);

        ObjectNode root = MAPPER.createObjectNode();
        ArrayNode projectArray = MAPPER.createArrayNode();
        ArrayNode userArray = MAPPER.createArrayNode();

        for (RuleLoader.RuleInfo rule : rules) {
            ObjectNode node = MAPPER.createObjectNode();
            node.put("id", rule.getId());
            node.put("name", rule.getName());
            node.put("description", rule.getDescription());
            node.put("mode", rule.getMode());

            if ("project".equals(rule.getSource())) {
                projectArray.add(node);
            } else {
                userArray.add(node);
            }
        }

        root.set("projectRules", projectArray);
        root.set("userRules", userArray);

        sendJson(exchange, 200, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(root));
    }

    private void handleCreate(HttpExchange exchange) throws IOException {
        // 读取请求体
        InputStream is = exchange.getRequestBody();
        String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = MAPPER.readTree(body);

        // 提取字段
        String name = json.has("name") ? json.get("name").asText().trim() : "";
        String mode = json.has("mode") ? json.get("mode").asText().trim() : "always";
        String description = json.has("description") ? json.get("description").asText().trim() : "";
        String scope = json.has("scope") ? json.get("scope").asText().trim() : "project";
        String content = json.has("content") ? json.get("content").asText() : null;

        // 调用 RuleLoader 创建
        String workspacePath = WorkspaceContext.getCurrentFolder();
        RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                name, mode, description, scope, content, workspacePath);

        // 构建响应
        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", result.isSuccess());
        resp.put("message", result.getMessage());
        if (result.getFilePath() != null) {
            resp.put("filePath", result.getFilePath().toString());
        }

        int status = result.isSuccess() ? 201 : 400;
        sendJson(exchange, status, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
    }

    private void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        OutputStream os = exchange.getResponseBody();
        os.write(bytes);
        os.close();
    }
}
