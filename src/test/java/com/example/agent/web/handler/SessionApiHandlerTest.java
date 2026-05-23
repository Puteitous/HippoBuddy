package com.example.agent.web.handler;

import com.example.agent.core.di.ServiceLocator;
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
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SessionApiHandler 单元测试")
class SessionApiHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private SessionApiHandler handler;

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        handler = new SessionApiHandler();
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    @Nested
    @DisplayName("HTTP 路由 - truncate 端点")
    class TruncateRouteTests {

        @Test
        @DisplayName("POST /api/sessions/{id}/truncate 请求被正确路由")
        void truncateRouteIsMatched() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange(
                "POST",
                "/api/sessions/test-session-123/truncate",
                "{\"messageId\":\"msg-1\"}"
            );

            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode(),
                "会话不存在应返回 404（路由匹配成功，因无此会话而报错）");
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("Session not found"));
        }

        @Test
        @DisplayName("缺少 messageId 返回 400")
        void missingMessageIdReturns400() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange(
                "POST",
                "/api/sessions/test-session-123/truncate",
                "{}"
            );

            handler.handle(exchange);

            assertEquals(400, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("messageId is required"));
        }

        @Test
        @DisplayName("messageId 为空字符串返回 400")
        void emptyMessageIdReturns400() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange(
                "POST",
                "/api/sessions/test-session-123/truncate",
                "{\"messageId\":\"\"}"
            );

            handler.handle(exchange);

            assertEquals(400, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("messageId is required"));
        }

        @Test
        @DisplayName("不存在的会话返回 404")
        void nonexistentSessionReturns404() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange(
                "POST",
                "/api/sessions/nonexistent/truncate",
                "{\"messageId\":\"msg-1\"}"
            );

            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("Session not found"));
        }

        @Test
        @DisplayName("OPTIONS 请求返回 204")
        void optionsRequestReturns204() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange(
                "OPTIONS",
                "/api/sessions/test-session-123/truncate",
                ""
            );

            handler.handle(exchange);

            assertEquals(204, exchange.getResponseCode());
            assertTrue(exchange.isClosed());
        }
    }

    @Nested
    @DisplayName("HTTP 路由 - 其他端点")
    class OtherRouteTests {

        @Test
        @DisplayName("GET /api/sessions 被路由到列表端点")
        void listSessionsRoute() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange(
                "GET",
                "/api/sessions",
                ""
            );

            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
        }

        @Test
        @DisplayName("未知路径返回 404")
        void unknownPathReturns404() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange(
                "GET",
                "/api/unknown",
                ""
            );

            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
        }
    }

    @Nested
    @DisplayName("响应头设置")
    class ResponseHeaderTests {

        @Test
        @DisplayName("设置正确的 CORS 头")
        void setsCorrectCorsHeaders() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange(
                "GET",
                "/api/sessions",
                ""
            );

            handler.handle(exchange);

            Headers headers = exchange.getResponseHeaders();
            assertEquals("application/json", headers.getFirst("Content-Type"));
            assertEquals("*", headers.getFirst("Access-Control-Allow-Origin"));
            assertEquals("GET, DELETE, POST, OPTIONS", headers.getFirst("Access-Control-Allow-Methods"));
        }
    }

    static class FakeHttpExchange extends HttpExchange {

        private final String requestMethod;
        private final String requestUri;
        private final Headers responseHeaders = new Headers();
        private final Headers requestHeaders = new Headers();
        private final ByteArrayOutputStream responseBody = new ByteArrayOutputStream();
        private final byte[] requestBodyBytes;
        private int responseCode = -1;
        private long responseLength = -1;
        private boolean closed = false;

        FakeHttpExchange(String requestMethod, String requestUri, String requestBody) {
            this.requestMethod = requestMethod;
            this.requestUri = requestUri;
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
            return URI.create("http://localhost" + requestUri);
        }

        @Override
        public void sendResponseHeaders(int rCode, long rLen) throws IOException {
            this.responseCode = rCode;
            this.responseLength = rLen;
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
            this.closed = true;
        }

        public int getResponseCode() {
            return responseCode;
        }

        String getResponseBodyAsString() {
            return responseBody.toString(java.nio.charset.StandardCharsets.UTF_8);
        }

        boolean isClosed() {
            return closed;
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
