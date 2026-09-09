package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.Message;
import com.example.agent.service.RecommendedQuestionsService;
import com.example.agent.web.session.WebSessionManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * SuggestionsApiHandler 单元测试。
 * 覆盖：路由（OPTIONS / 非 POST）、无效请求（缺 sessionId / 会话不存在）返回空列表、
 * 正常生成返回推荐问题、生成失败静默返回空列表。
 */
@DisplayName("SuggestionsApiHandler 推荐问答接口测试")
class SuggestionsApiHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private RecommendedQuestionsService mockService;
    private SuggestionsApiHandler handler;

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        mockService = mock(RecommendedQuestionsService.class);
        handler = new SuggestionsApiHandler(mockService);
        WebSessionManager.getInstance().clear();
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
        WebSessionManager.getInstance().clear();
    }

    /** 把「system + 历史」会话放入内存，并注册 ConversationService（mock 返回同上下文） */
    private void seedSession(String sessionId, List<Message> context) {
        Conversation conv = new Conversation(1000, new com.example.agent.service.SimpleTokenEstimator(), sessionId);
        WebSessionManager.getInstance().getSessions().put(sessionId, conv);

        ConversationService mockCs = mock(ConversationService.class);
        when(mockCs.getContextForInference(conv)).thenReturn(context);
        ServiceLocator.registerSingleton(ConversationService.class, mockCs);
    }

    // ==================== 路由与请求校验 ====================

    @Nested
    @DisplayName("路由与请求校验")
    class RoutingTests {

        @Test
        @DisplayName("OPTIONS 请求返回 204")
        void optionsRequestReturns204() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("OPTIONS", "{}");
            handler.handle(exchange);
            assertEquals(204, exchange.getResponseCode());
        }

        @Test
        @DisplayName("非 POST 请求返回 200 空列表")
        void nonPostReturnsEmpty() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "{}");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            JsonNode body = objectMapper.readTree(exchange.getResponseBodyAsString());
            assertTrue(body.get("questions").isArray());
            assertEquals(0, body.get("questions").size());
        }

        @Test
        @DisplayName("请求体缺 sessionId 返回空列表")
        void missingSessionIdReturnsEmpty() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("POST", "{}");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            JsonNode body = objectMapper.readTree(exchange.getResponseBodyAsString());
            assertEquals(0, body.get("questions").size());
        }

        @Test
        @DisplayName("会话不存在返回空列表")
        void nonexistentSessionReturnsEmpty() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("POST", "{\"sessionId\":\"no-such-session\"}");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            JsonNode body = objectMapper.readTree(exchange.getResponseBodyAsString());
            assertEquals(0, body.get("questions").size());
        }
    }

    // ==================== 正常生成 ====================

    @Nested
    @DisplayName("正常生成")
    class GenerationTests {

        @Test
        @DisplayName("活跃会话生成推荐问题并返回 JSON 数组")
        void generatesQuestionsForActiveSession() throws IOException {
            List<Message> context = List.of(
                Message.system("你是 HippoBuddy 助手"),
                Message.user("帮我重构登录页路由"),
                Message.assistant("已完成重构。")
            );
            seedSession("web-1", context);
            when(mockService.generate(context)).thenReturn(
                List.of("如何验证路由？", "懒加载影响首屏吗？", "需要补测试吗？"));

            FakeHttpExchange exchange = new FakeHttpExchange("POST", "{\"sessionId\":\"web-1\"}");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            JsonNode body = objectMapper.readTree(exchange.getResponseBodyAsString());
            assertEquals(3, body.get("questions").size());
            assertEquals("如何验证路由？", body.get("questions").get(0).asText());
        }
    }

    // ==================== 失败静默降级 ====================

    @Nested
    @DisplayName("失败静默降级")
    class FailureTests {

        @Test
        @DisplayName("服务生成失败（空列表）时返回空数组，不报错")
        void serviceReturnsEmptyOnFailure() throws IOException {
            List<Message> context = List.of(Message.system("system"), Message.user("hi"));
            seedSession("web-2", context);
            when(mockService.generate(context)).thenReturn(List.of());

            FakeHttpExchange exchange = new FakeHttpExchange("POST", "{\"sessionId\":\"web-2\"}");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            JsonNode body = objectMapper.readTree(exchange.getResponseBodyAsString());
            assertEquals(0, body.get("questions").size());
        }

        @Test
        @DisplayName("服务抛出异常时返回空数组")
        void serviceExceptionReturnsEmpty() throws IOException {
            List<Message> context = List.of(Message.system("system"), Message.user("hi"));
            seedSession("web-3", context);
            when(mockService.generate(context)).thenThrow(new RuntimeException("boom"));

            FakeHttpExchange exchange = new FakeHttpExchange("POST", "{\"sessionId\":\"web-3\"}");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            JsonNode body = objectMapper.readTree(exchange.getResponseBodyAsString());
            assertEquals(0, body.get("questions").size());
        }
    }

    // ==================== FakeHttpExchange ====================

    static class FakeHttpExchange extends HttpExchange {

        private final String requestMethod;
        private final Headers responseHeaders = new Headers();
        private final Headers requestHeaders = new Headers();
        private final ByteArrayOutputStream responseBody = new ByteArrayOutputStream();
        private final byte[] requestBodyBytes;
        private int responseCode = -1;

        FakeHttpExchange(String requestMethod, String requestBody) {
            this.requestMethod = requestMethod;
            this.requestBodyBytes = requestBody.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            requestHeaders.add("Host", "localhost");
        }

        @Override
        public Headers getRequestHeaders() {
            return requestHeaders;
        }

        @Override
        public Headers getResponseHeaders() {
            return responseHeaders;
        }

        @Override
        public String getRequestMethod() {
            return requestMethod;
        }

        @Override
        public URI getRequestURI() {
            return URI.create("http://localhost/api/suggestions");
        }

        @Override
        public void sendResponseHeaders(int rCode, long rLen) throws IOException {
            this.responseCode = rCode;
        }

        @Override
        public OutputStream getResponseBody() {
            return responseBody;
        }

        @Override
        public InputStream getRequestBody() {
            return new ByteArrayInputStream(requestBodyBytes);
        }

        @Override
        public void close() {
        }

        public int getResponseCode() {
            return responseCode;
        }

        String getResponseBodyAsString() {
            return responseBody.toString(java.nio.charset.StandardCharsets.UTF_8);
        }

        @Override
        public InetSocketAddress getRemoteAddress() {
            return new InetSocketAddress("127.0.0.1", 12345);
        }

        @Override
        public InetSocketAddress getLocalAddress() {
            return new InetSocketAddress("127.0.0.1", 8080);
        }

        @Override
        public String getProtocol() {
            return "HTTP/1.1";
        }

        @Override
        public Object getAttribute(String name) {
            return null;
        }

        @Override
        public void setAttribute(String name, Object value) {
        }

        @Override
        public void setStreams(InputStream i, OutputStream o) {
        }

        @Override
        public HttpPrincipal getPrincipal() {
            return null;
        }

        @Override
        public HttpContext getHttpContext() {
            return null;
        }
    }
}
