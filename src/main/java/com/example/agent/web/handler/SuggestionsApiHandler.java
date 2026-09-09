package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.service.RecommendedQuestionsService;
import com.example.agent.web.session.WebSessionManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 推荐问答接口。
 * <p>
 * POST /api/suggestions
 * 请求体: {"sessionId": "..."}
 * 响应: {"questions": ["问题1", "问题2", "问题3"]}
 * </p>
 * <p>
 * 回合结束（done）后由前端异步调用，基于会话最近历史生成推荐问题。
 * 任何失败（会话不存在 / LLM 异常 / 解析失败）都返回空 questions，
 * 前端据此不渲染推荐卡片，不影响主流程。
 * </p>
 */
public class SuggestionsApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(SuggestionsApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final RecommendedQuestionsService suggestionsService;

    public SuggestionsApiHandler() {
        this.suggestionsService = new RecommendedQuestionsService();
    }

    SuggestionsApiHandler(RecommendedQuestionsService suggestionsService) {
        this.suggestionsService = suggestionsService;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        if (!"POST".equals(exchange.getRequestMethod())) {
            sendJson(exchange, Map.of("questions", List.of()));
            return;
        }

        String sessionId = null;
        try {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (!requestBody.isBlank()) {
                JsonNode json = objectMapper.readTree(requestBody);
                sessionId = json.has("sessionId") ? json.get("sessionId").asText() : null;
            }
        } catch (Exception e) {
            logger.debug("解析推荐问题请求体失败: {}", e.getMessage());
        }

        Map<String, Object> response = new HashMap<>();
        response.put("questions", List.of());

        if (sessionId != null && !sessionId.isBlank()) {
            try {
                Conversation conversation = WebSessionManager.getInstance().getSessions().get(sessionId);
                if (conversation != null) {
                    // 与主对话完全一致的推理上下文（system prompt + 完整历史），
                    // 保证 LLM 服务端前缀缓存命中，避免独立拼历史导致缓存失效。
                    List<com.example.agent.llm.model.Message> context =
                        ServiceLocator.get(ConversationService.class).getContextForInference(conversation);
                    List<String> questions = suggestionsService.generate(context);
                    response.put("questions", questions);
                } else {
                    logger.debug("推荐问题请求的会话不存在: sessionId={}", sessionId);
                }
            } catch (Exception e) {
                // 生成失败静默返回空列表，不向前端暴露错误
                logger.warn("生成推荐问题异常，返回空列表: sessionId={}, error={}", sessionId, e.getMessage());
            }
        }

        sendJson(exchange, response);
    }

    private void sendJson(HttpExchange exchange, Object data) throws IOException {
        String response = objectMapper.writeValueAsString(data);
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
