package com.example.agent.web.handler;

import com.example.agent.config.Config;
import com.example.agent.config.UiConfig;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.stream.StreamChunk;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * AiOptimizeHandler - 让 LLM 流式优化用户输入文本
 *
 * <p>POST /api/input/optimize,body {@code {text}}:<br>
 * 把输入文本放入 system prompt(用户可在设置自定义,空则用内置默认)调用
 * {@link LlmClient#chatStream} 流式生成优化结果,输出 SSE 事件:
 * {@code event: delta / data: {"d":"..."}}、结束 {@code event: complete / data:[DONE]}。
 * 文本缺失或为空返回普通 JSON {@code {error}}。
 * </p>
 */
public class AiOptimizeHandler implements HttpHandler {

    private static final ObjectMapper objectMapper = new ObjectMapper();
    /** 输入文本最大字符数,超出截断避免 prompt 过长 */
    private static final int MAX_TEXT_CHARS = 4000;

    /** 默认 system prompt;用户未通过配置覆盖时(ui.ai_optimize_prompt 为空)使用 */
    private static final String DEFAULT_SYSTEM_PROMPT = """
        你是一位专业的文本润色助手。请优化用户输入的文本，使其表达更通顺、专业、简洁。
        要求：
        1. 完整保留用户的真实意图和原始信息，绝不虚构或篡改内容
        2. 保持用户的语言风格、语气和格式偏好（如是否需要代码块、列表等）
        3. 仅输出优化后的文本本身，不要添加任何解释、前缀、引号或额外文字
        """;

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");

        // GET /api/input/optimize/defaults - 返回内置默认优化提示词(供设置页展示与恢复默认)
        if ("GET".equals(exchange.getRequestMethod())) {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/api/input/optimize/defaults")) {
                sendJson(exchange, 200, Map.of("systemPrompt", DEFAULT_SYSTEM_PROMPT));
                return;
            }
            sendJson(exchange, 404, Map.of("error", "Not Found"));
            return;
        }

        JsonNode body;
        try {
            body = objectMapper.readTree(exchange.getRequestBody());
        } catch (IOException e) {
            sendJson(exchange, 400, Map.of("error", "Invalid JSON body"));
            return;
        }
        String text = body.path("text").asText("");
        if (text.isBlank()) {
            sendJson(exchange, 400, Map.of("error", "Missing text parameter"));
            return;
        }
        // 超长截断,避免 prompt 过长
        if (text.length() > MAX_TEXT_CHARS) {
            text = text.substring(0, MAX_TEXT_CHARS);
        }

        exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache");
        exchange.sendResponseHeaders(200, 0);

        List<Message> messages = new ArrayList<>();
        UiConfig ui = Config.getInstance().getUi();
        String systemPrompt = blankToDefault(ui.getAiOptimizePrompt(), DEFAULT_SYSTEM_PROMPT);
        messages.add(Message.system(systemPrompt));
        messages.add(Message.user(text));

        try (OutputStream out = exchange.getResponseBody()) {
            Consumer<StreamChunk> onChunk = chunk -> {
                if (chunk.hasContent()) {
                    writeSseQuietly(out, "delta", "{\"d\":" + objectMapperQuote(chunk.getContent()) + "}");
                }
            };
            LlmClient llmClient = ServiceLocator.get(LlmClient.class);
            llmClient.chatStream(messages, onChunk);
            writeSseQuietly(out, "complete", "[DONE]");
            out.flush();
        } catch (Exception e) {
            // 已进入流式阶段,错误通过 delta 携带一条文案兜底(尽力而为)
        }
    }

    /** 用户配置值为空白时回退到内置默认 */
    private static String blankToDefault(String configured, String defaultVal) {
        return (configured == null || configured.isBlank()) ? defaultVal : configured;
    }

    /** 把文本安全的 JSON 字符串转义后包裹引号 */
    private String objectMapperQuote(String s) {
        try {
            return objectMapper.writeValueAsString(s);
        } catch (Exception e) {
            return "\"\"";
        }
    }

    private void writeSseQuietly(OutputStream out, String event, String data) {
        try {
            out.write(("event: " + event + "\ndata: " + data + "\n\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (IOException ignored) {
            // 客户端断开时忽略
        }
    }

    private void sendJson(HttpExchange exchange, int status, Map<String, String> payload) throws IOException {
        byte[] bytes = objectMapper.writeValueAsBytes(payload);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}