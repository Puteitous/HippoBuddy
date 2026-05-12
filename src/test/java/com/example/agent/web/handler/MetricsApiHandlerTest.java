package com.example.agent.web.handler;

import com.example.agent.core.AgentContext;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.logging.CostMetricsCollector;
import com.example.agent.logging.EventMetricsCollector;
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
import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("MetricsApiHandler 单元测试")
class MetricsApiHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private MetricsApiHandler handler;

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        handler = new MetricsApiHandler();
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    @Nested
    @DisplayName("HTTP 方法处理")
    class HttpMethodTests {

        @Test
        @DisplayName("OPTIONS 请求返回 204")
        void optionsRequestReturns204() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("OPTIONS");

            handler.handle(exchange);

            assertEquals(204, exchange.getResponseCode());
            assertTrue(exchange.isClosed());
        }

        @Test
        @DisplayName("POST 请求返回 405")
        void postRequestReturns405() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("POST");

            handler.handle(exchange);

            assertEquals(405, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("Method not allowed"));
        }

        @Test
        @DisplayName("GET 请求返回 200")
        void getRequestReturns200() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET");

            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
        }
    }

    @Nested
    @DisplayName("响应头设置")
    class ResponseHeaderTests {

        @Test
        @DisplayName("设置正确的 Content-Type 和 CORS 头")
        void setsCorrectHeaders() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET");

            handler.handle(exchange);

            Headers headers = exchange.getResponseHeaders();
            assertEquals("application/json", headers.getFirst("Content-Type"));
            assertEquals("*", headers.getFirst("Access-Control-Allow-Origin"));
            assertEquals("GET, OPTIONS", headers.getFirst("Access-Control-Allow-Methods"));
            assertEquals("Content-Type", headers.getFirst("Access-Control-Allow-Headers"));
        }
    }

    @Nested
    @DisplayName("指标采集 - 无服务注册")
    class NoServicesTests {

        @Test
        @DisplayName("没有注册任何服务时返回空 JSON 对象")
        void returnsEmptyJsonWhenNoServices() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET");

            handler.handle(exchange);

            String body = exchange.getResponseBodyAsString();
            Map<String, Object> metrics = objectMapper.readValue(body, Map.class);
            assertTrue(metrics.isEmpty());
        }
    }

    @Nested
    @DisplayName("指标采集 - LLM 指标")
    class LlmMetricsTests {

        @Test
        @DisplayName("只注册 CostMetricsCollector 时返回 LLM 指标")
        void returnsLlmMetrics() throws IOException {
            CostMetricsCollector costCollector = new CostMetricsCollector(LocalDate.of(2024, 1, 15));
            ServiceLocator.registerSingleton(CostMetricsCollector.class, costCollector);

            FakeHttpExchange exchange = new FakeHttpExchange("GET");

            handler.handle(exchange);

            String body = exchange.getResponseBodyAsString();
            Map<String, Object> metrics = objectMapper.readValue(body, Map.class);

            assertTrue(metrics.containsKey("llm"));
            Map<String, Object> llm = (Map<String, Object>) metrics.get("llm");
            assertEquals(0, ((Number) llm.get("totalRequests")).intValue());
            assertEquals(0, ((Number) llm.get("successfulRequests")).intValue());
            assertEquals(0, ((Number) llm.get("failedRequests")).intValue());
            assertEquals(0, ((Number) llm.get("avgLatencyMs")).intValue());
            assertEquals(0, ((Number) llm.get("minLatencyMs")).intValue());
            assertEquals(0, ((Number) llm.get("maxLatencyMs")).intValue());
            assertFalse(metrics.containsKey("tools"));
            assertFalse(metrics.containsKey("memory"));
        }
    }

    @Nested
    @DisplayName("指标采集 - 工具调用指标")
    class ToolMetricsTests {

        @Test
        @DisplayName("注册带 EventMetricsCollector 的 AgentContext 时返回工具调用指标")
        void returnsToolMetrics() throws IOException {
            AgentContext agentContext = new AgentContext() {
                @Override
                public EventMetricsCollector getEventMetricsCollector() {
                    return new EventMetricsCollector(LocalDate.of(2024, 1, 15));
                }
            };
            ServiceLocator.registerSingleton(AgentContext.class, agentContext);

            FakeHttpExchange exchange = new FakeHttpExchange("GET");

            handler.handle(exchange);

            String body = exchange.getResponseBodyAsString();
            Map<String, Object> metrics = objectMapper.readValue(body, Map.class);

            assertTrue(metrics.containsKey("tools"));
            Map<String, Object> tools = (Map<String, Object>) metrics.get("tools");
            assertEquals(0, ((Number) tools.get("totalCalls")).intValue());
            assertEquals(0, ((Number) tools.get("successfulCalls")).intValue());
            assertEquals(0, ((Number) tools.get("failedCalls")).intValue());
            assertTrue(tools.containsKey("details"));
        }
    }

    @Nested
    @DisplayName("指标采集 - 完整场景")
    class FullMetricsTests {

        @Test
        @DisplayName("所有服务注册时返回完整指标")
        void returnsAllMetrics() throws IOException {
            CostMetricsCollector costCollector = new CostMetricsCollector(LocalDate.of(2024, 1, 15));
            ServiceLocator.registerSingleton(CostMetricsCollector.class, costCollector);

            AgentContext agentContext = new AgentContext() {
                @Override
                public EventMetricsCollector getEventMetricsCollector() {
                    return new EventMetricsCollector(LocalDate.of(2024, 1, 15));
                }
            };
            ServiceLocator.registerSingleton(AgentContext.class, agentContext);

            FakeHttpExchange exchange = new FakeHttpExchange("GET");

            handler.handle(exchange);

            String body = exchange.getResponseBodyAsString();
            Map<String, Object> metrics = objectMapper.readValue(body, Map.class);

            assertTrue(metrics.containsKey("llm"));
            assertTrue(metrics.containsKey("tools"));
        }
    }

    @Nested
    @DisplayName("异常处理")
    class ExceptionHandlingTests {

        @Test
        @DisplayName("首次 sendResponseHeaders 失败时返回 500 错误响应")
        void returns500WhenFirstSendFails() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET") {
                private int callCount = 0;

                @Override
                public void sendResponseHeaders(int rCode, long rLen) throws IOException {
                    callCount++;
                    if (callCount == 1) {
                        throw new RuntimeException("模拟网络异常");
                    }
                    super.sendResponseHeaders(rCode, rLen);
                }
            };

            handler.handle(exchange);

            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("error"));
        }
    }

    static class FakeHttpExchange extends HttpExchange {

        private final String requestMethod;
        private final Headers responseHeaders = new Headers();
        private final Headers requestHeaders = new Headers();
        private final ByteArrayOutputStream responseBody = new ByteArrayOutputStream();
        private int responseCode = -1;
        private long responseLength = -1;
        private boolean closed = false;

        FakeHttpExchange(String requestMethod) {
            this.requestMethod = requestMethod;
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
        public void sendResponseHeaders(int rCode, long rLen) throws IOException {
            this.responseCode = rCode;
            this.responseLength = rLen;
        }

        @Override
        public OutputStream getResponseBody() {
            return responseBody;
        }

        @Override
        public void close() {
            this.closed = true;
        }

        @Override
        public URI getRequestURI() {
            return URI.create("http://localhost/api/metrics");
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
        public InputStream getRequestBody() {
            return new ByteArrayInputStream(new byte[0]);
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
