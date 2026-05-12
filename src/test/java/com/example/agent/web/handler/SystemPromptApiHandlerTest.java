package com.example.agent.web.handler;

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
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SystemPromptApiHandler 单元测试")
class SystemPromptApiHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private SystemPromptApiHandler handler;

    @BeforeEach
    void setUp() {
        handler = new SystemPromptApiHandler();
    }

    @AfterEach
    void tearDown() {
    }

    @Nested
    @DisplayName("HTTP 方法处理")
    class HttpMethodTests {

        @Test
        @DisplayName("OPTIONS 请求返回 204")
        void optionsRequestReturns204() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("OPTIONS", "/api/system-prompts/presets");

            handler.handle(exchange);

            assertEquals(204, exchange.getResponseCode());
            assertTrue(exchange.isClosed());
        }

        @Test
        @DisplayName("POST 请求返回 404")
        void postRequestReturns404() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("POST", "/api/system-prompts/presets");

            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
        }
    }

    @Nested
    @DisplayName("GET /api/system-prompts/presets - 预设列表")
    class ListPresetsTests {

        @Test
        @DisplayName("返回 200 和所有预设")
        void returnsAllPresets() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/presets");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());

            Map<String, Object> result = objectMapper.readValue(
                exchange.getResponseBodyAsString(), Map.class);
            List<Map<String, Object>> presets = (List<Map<String, Object>>) result.get("presets");

            assertNotNull(presets);
            assertEquals(6, presets.size());
        }

        @Test
        @DisplayName("内置预设的 prompt 不应为空")
        void builtinPresetsHavePrompts() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/presets");
            handler.handle(exchange);

            Map<String, Object> result = objectMapper.readValue(
                exchange.getResponseBodyAsString(), Map.class);
            List<Map<String, Object>> presets = (List<Map<String, Object>>) result.get("presets");

            for (Map<String, Object> preset : presets) {
                String id = (String) preset.get("id");
                String prompt = (String) preset.get("prompt");
                if (List.of("coder", "writer", "analyst", "reviewer").contains(id)) {
                    assertNotNull(prompt);
                    assertFalse(prompt.isBlank(), "内置预设 " + id + " 的 prompt 不应为空");
                }
            }
        }

        @Test
        @DisplayName("每个预设包含完整的字段")
        void eachPresetHasCompleteFields() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/presets");
            handler.handle(exchange);

            Map<String, Object> result = objectMapper.readValue(
                exchange.getResponseBodyAsString(), Map.class);
            List<Map<String, Object>> presets = (List<Map<String, Object>>) result.get("presets");

            for (Map<String, Object> preset : presets) {
                assertTrue(preset.containsKey("id"), "应有 id 字段");
                assertTrue(preset.containsKey("name"), "应有 name 字段");
                assertTrue(preset.containsKey("description"), "应有 description 字段");
                assertTrue(preset.containsKey("prompt"), "应有 prompt 字段");
                assertNotNull(preset.get("id"));
                assertNotNull(preset.get("name"));
            }
        }
    }

    @Nested
    @DisplayName("GET /api/system-prompts/presets/{id} - 获取单个预设")
    class GetPresetTests {

        @Test
        @DisplayName("获取 coder 预设返回 200")
        void getCoderPreset() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/presets/coder");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());

            Map<String, Object> result = objectMapper.readValue(
                exchange.getResponseBodyAsString(), Map.class);
            assertEquals("coder", result.get("id"));
            assertEquals("💻 代码助手", result.get("name"));
            assertNotNull(result.get("prompt"));
            assertFalse(((String) result.get("prompt")).isBlank());
        }

        @Test
        @DisplayName("获取 writer 预设返回 200")
        void getWriterPreset() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/presets/writer");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());

            Map<String, Object> result = objectMapper.readValue(
                exchange.getResponseBodyAsString(), Map.class);
            assertEquals("writer", result.get("id"));
            assertEquals("✍️ 写作助手", result.get("name"));
        }

        @Test
        @DisplayName("获取 default 预设返回 200")
        void getDefaultPreset() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/presets/default");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());

            Map<String, Object> result = objectMapper.readValue(
                exchange.getResponseBodyAsString(), Map.class);
            assertEquals("default", result.get("id"));
            assertEquals("🦛 河马助手", result.get("name"));
        }

        @Test
        @DisplayName("不存在的预设返回 404")
        void nonExistentPresetReturns404() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/presets/nonexistent");
            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("不存在"));
        }
    }

    @Nested
    @DisplayName("路由 - 未知路径")
    class UnknownRouteTests {

        @Test
        @DisplayName("不存在的路径返回 404")
        void unknownPathReturns404() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/unknown");
            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("未找到"));
        }
    }

    @Nested
    @DisplayName("响应头设置")
    class ResponseHeaderTests {

        @Test
        @DisplayName("设置正确的 Content-Type 和 CORS 头")
        void setsCorrectHeaders() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/api/system-prompts/presets");
            handler.handle(exchange);

            Headers headers = exchange.getResponseHeaders();
            assertEquals("application/json", headers.getFirst("Content-Type"));
            assertEquals("*", headers.getFirst("Access-Control-Allow-Origin"));
            assertEquals("GET, OPTIONS", headers.getFirst("Access-Control-Allow-Methods"));
            assertEquals("Content-Type", headers.getFirst("Access-Control-Allow-Headers"));
        }
    }

    static class FakeHttpExchange extends HttpExchange {

        private final String requestMethod;
        private final String requestUri;
        private final Headers responseHeaders = new Headers();
        private final Headers requestHeaders = new Headers();
        private final ByteArrayOutputStream responseBody = new ByteArrayOutputStream();
        private int responseCode = -1;
        private long responseLength = -1;
        private boolean closed = false;

        FakeHttpExchange(String requestMethod, String requestUri) {
            this.requestMethod = requestMethod;
            this.requestUri = requestUri;
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
            return new ByteArrayInputStream(new byte[0]);
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
