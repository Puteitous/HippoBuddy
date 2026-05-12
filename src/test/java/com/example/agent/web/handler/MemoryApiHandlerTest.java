package com.example.agent.web.handler;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.memory.MemoryEntry;
import com.example.agent.memory.MemoryStore;
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
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@DisplayName("MemoryApiHandler 单元测试")
class MemoryApiHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private MemoryApiHandler handler;
    private MemoryStore mockMemoryStore;

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        handler = new MemoryApiHandler();
        mockMemoryStore = mock(MemoryStore.class);
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    private FakeHttpExchange createExchange(String method, String uri) {
        return new FakeHttpExchange(method, uri);
    }

    private FakeHttpExchange createExchangeWithBody(String method, String uri, String body) {
        return new FakeHttpExchange(method, uri, body);
    }

    @Nested
    @DisplayName("HTTP 方法处理")
    class HttpMethodTests {

        @Test
        @DisplayName("OPTIONS 请求返回 204")
        void optionsRequestReturns204() throws IOException {
            FakeHttpExchange exchange = createExchange("OPTIONS", "/api/memories");

            handler.handle(exchange);

            assertEquals(204, exchange.getResponseCode());
            assertTrue(exchange.isClosed());
        }

        @Test
        @DisplayName("OPTIONS 设置正确的 CORS 头")
        void optionsSetsCorrectCorsHeaders() throws IOException {
            FakeHttpExchange exchange = createExchange("OPTIONS", "/api/memories");

            handler.handle(exchange);

            Headers headers = exchange.getResponseHeaders();
            assertEquals("application/json", headers.getFirst("Content-Type"));
            assertEquals("*", headers.getFirst("Access-Control-Allow-Origin"));
            assertEquals("GET, DELETE, PUT, OPTIONS", headers.getFirst("Access-Control-Allow-Methods"));
        }

        @Test
        @DisplayName("未注册 MemoryStore 时返回 503")
        void returns503WhenMemoryStoreNotInitialized() throws IOException {
            FakeHttpExchange exchange = createExchange("GET", "/api/memories");

            handler.handle(exchange);

            assertEquals(503, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("未初始化"));
        }
    }

    @Nested
    @DisplayName("GET /api/memories - 记忆列表")
    class ListMemoriesTests {

        @Test
        @DisplayName("无记忆时返回空列表")
        void emptyList() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);
            when(mockMemoryStore.getAllMetas()).thenReturn(List.of());

            FakeHttpExchange exchange = createExchange("GET", "/api/memories");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);
            assertEquals(0, result.get("total"));
            assertTrue(((List<?>) result.get("memories")).isEmpty());
        }

        @Test
        @DisplayName("有记忆时返回按 lastUpdated 降序排列的列表")
        void returnsSortedList() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            Instant now = Instant.now();
            MemoryStore.MemoryEntryMeta meta1 = createMeta("id-1", "记忆1",
                MemoryEntry.MemoryType.USER_PREFERENCE, now.minusSeconds(100));
            MemoryStore.MemoryEntryMeta meta2 = createMeta("id-2", "记忆2",
                MemoryEntry.MemoryType.PROJECT_CONTEXT, now.minusSeconds(50));
            MemoryStore.MemoryEntryMeta meta3 = createMeta("id-3", "记忆3",
                MemoryEntry.MemoryType.REFERENCE, now);

            when(mockMemoryStore.getAllMetas()).thenReturn(List.of(meta1, meta2, meta3));

            FakeHttpExchange exchange = createExchange("GET", "/api/memories");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);
            assertEquals(3, result.get("total"));

            List<Map<String, Object>> memories = (List<Map<String, Object>>) result.get("memories");
            assertEquals("id-3", memories.get(0).get("id"));
            assertEquals("id-2", memories.get(1).get("id"));
            assertEquals("id-1", memories.get(2).get("id"));
        }

        @Test
        @DisplayName("有 fileName 的记忆应包含 fileName 字段")
        void includesFileNameWhenPresent() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            MemoryStore.MemoryEntryMeta meta = createMeta("id-1", "记忆1",
                MemoryEntry.MemoryType.USER_PREFERENCE, Instant.now());
            meta.fileName = "mem-id-1.md";

            when(mockMemoryStore.getAllMetas()).thenReturn(List.of(meta));

            FakeHttpExchange exchange = createExchange("GET", "/api/memories");
            handler.handle(exchange);

            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);
            List<Map<String, Object>> memories = (List<Map<String, Object>>) result.get("memories");
            assertEquals("mem-id-1.md", memories.get(0).get("fileName"));
        }

        @Test
        @DisplayName("无 fileName 的记忆不应包含 fileName 字段")
        void omitsFileNameWhenNull() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            MemoryStore.MemoryEntryMeta meta = createMeta("id-1", "记忆1",
                MemoryEntry.MemoryType.USER_PREFERENCE, Instant.now());
            meta.fileName = null;

            when(mockMemoryStore.getAllMetas()).thenReturn(List.of(meta));

            FakeHttpExchange exchange = createExchange("GET", "/api/memories");
            handler.handle(exchange);

            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);
            List<Map<String, Object>> memories = (List<Map<String, Object>>) result.get("memories");
            assertFalse(memories.get(0).containsKey("fileName"));
        }
    }

    @Nested
    @DisplayName("GET /api/memories/{id} - 获取单条记忆")
    class GetMemoryTests {

        @Test
        @DisplayName("记忆存在时返回完整信息")
        void returnsMemoryWhenFound() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            MemoryEntry entry = new MemoryEntry("mem-1", "这是记忆内容",
                MemoryEntry.MemoryType.FEEDBACK, Set.of("tag1", "tag2"));
            when(mockMemoryStore.findById("mem-1")).thenReturn(entry);

            FakeHttpExchange exchange = createExchange("GET", "/api/memories/mem-1");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);

            assertEquals("mem-1", result.get("id"));
            assertEquals("这是记忆内容", result.get("content"));
            assertEquals("FEEDBACK", result.get("type"));
            assertEquals(List.of("tag1", "tag2"), result.get("tags"));
            assertNotNull(result.get("createdAt"));
            assertNotNull(result.get("lastUpdated"));
            assertNotNull(result.get("lastAccessed"));
            assertEquals(0, result.get("accessCount"));
            assertEquals("project", result.get("scope"));
        }

        @Test
        @DisplayName("记忆不存在时返回 404")
        void returns404WhenNotFound() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);
            when(mockMemoryStore.findById("non-existent")).thenReturn(null);

            FakeHttpExchange exchange = createExchange("GET", "/api/memories/non-existent");
            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("不存在"));
        }
    }

    @Nested
    @DisplayName("DELETE /api/memories/{id} - 删除记忆")
    class DeleteMemoryTests {

        @Test
        @DisplayName("记忆存在时删除并返回成功")
        void deletesMemoryWhenFound() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            MemoryEntry entry = new MemoryEntry("mem-1", "内容",
                MemoryEntry.MemoryType.USER_PREFERENCE, Set.of());
            when(mockMemoryStore.findById("mem-1")).thenReturn(entry);

            FakeHttpExchange exchange = createExchange("DELETE", "/api/memories/mem-1");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            verify(mockMemoryStore).delete("mem-1");

            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);
            assertTrue((Boolean) result.get("success"));
            assertEquals("mem-1", result.get("id"));
        }

        @Test
        @DisplayName("记忆不存在时返回 404")
        void returns404WhenNotFound() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);
            when(mockMemoryStore.findById("non-existent")).thenReturn(null);

            FakeHttpExchange exchange = createExchange("DELETE", "/api/memories/non-existent");
            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
            verify(mockMemoryStore, never()).delete(anyString());
        }
    }

    @Nested
    @DisplayName("PUT /api/memories/{id} - 更新记忆")
    class UpdateMemoryTests {

        @Test
        @DisplayName("更新 content 和 tags 时调用 MemoryStore.update")
        void updatesContentAndTags() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            MemoryEntry entry = new MemoryEntry("mem-1", "旧内容",
                MemoryEntry.MemoryType.USER_PREFERENCE, Set.of("old-tag"));
            when(mockMemoryStore.findById("mem-1")).thenReturn(entry);

            String requestBody = "{\"content\":\"新内容\",\"tags\":[\"new-tag1\",\"new-tag2\"]}";
            FakeHttpExchange exchange = createExchangeWithBody("PUT", "/api/memories/mem-1", requestBody);
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            verify(mockMemoryStore).update(eq("mem-1"), any());

            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);
            assertTrue((Boolean) result.get("success"));
            assertEquals("mem-1", result.get("id"));
        }

        @Test
        @DisplayName("只更新 content 时不影响 tags")
        void updatesOnlyContent() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            MemoryEntry entry = new MemoryEntry("mem-1", "旧内容",
                MemoryEntry.MemoryType.USER_PREFERENCE, Set.of("tag1"));
            when(mockMemoryStore.findById("mem-1")).thenReturn(entry);

            String requestBody = "{\"content\":\"仅更新内容\"}";
            FakeHttpExchange exchange = createExchangeWithBody("PUT", "/api/memories/mem-1", requestBody);
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            verify(mockMemoryStore).update(eq("mem-1"), any());
        }

        @Test
        @DisplayName("记忆不存在时返回 404")
        void returns404WhenNotFound() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);
            when(mockMemoryStore.findById("non-existent")).thenReturn(null);

            FakeHttpExchange exchange = createExchangeWithBody("PUT", "/api/memories/non-existent", "{}");
            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
            verify(mockMemoryStore, never()).update(anyString(), any());
        }
    }

    @Nested
    @DisplayName("GET /api/memories/stats - 统计信息")
    class StatsTests {

        @Test
        @DisplayName("返回总记忆数和按类型分布")
        void returnsStats() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            when(mockMemoryStore.getIndexSize()).thenReturn(3);
            when(mockMemoryStore.getFileCount()).thenReturn(5);

            MemoryStore.MemoryEntryMeta meta1 = createMeta("id-1", "记忆1",
                MemoryEntry.MemoryType.USER_PREFERENCE, Instant.now());
            MemoryStore.MemoryEntryMeta meta2 = createMeta("id-2", "记忆2",
                MemoryEntry.MemoryType.PROJECT_CONTEXT, Instant.now());
            MemoryStore.MemoryEntryMeta meta3 = createMeta("id-3", "记忆3",
                MemoryEntry.MemoryType.USER_PREFERENCE, Instant.now());

            when(mockMemoryStore.getAllMetas()).thenReturn(List.of(meta1, meta2, meta3));

            FakeHttpExchange exchange = createExchange("GET", "/api/memories/stats");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);

            assertEquals(3, result.get("totalMemories"));
            assertEquals(5, result.get("fileCount"));

            Map<String, Integer> byType = (Map<String, Integer>) result.get("byType");
            assertEquals(2, byType.get("USER_PREFERENCE").intValue());
            assertEquals(1, byType.get("PROJECT_CONTEXT").intValue());
        }

        @Test
        @DisplayName("无记忆时返回零值统计")
        void returnsZeroStats() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            when(mockMemoryStore.getIndexSize()).thenReturn(0);
            when(mockMemoryStore.getFileCount()).thenReturn(0);
            when(mockMemoryStore.getAllMetas()).thenReturn(List.of());

            FakeHttpExchange exchange = createExchange("GET", "/api/memories/stats");
            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            Map<String, Object> result = objectMapper.readValue(body, Map.class);

            assertEquals(0, result.get("totalMemories"));
            assertEquals(0, result.get("fileCount"));

            Map<String, Integer> byType = (Map<String, Integer>) result.get("byType");
            assertTrue(byType.isEmpty());
        }
    }

    @Nested
    @DisplayName("路由 - 未知路径")
    class UnknownRouteTests {

        @Test
        @DisplayName("不匹配任何路由时返回 404")
        void unknownPathReturns404() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            FakeHttpExchange exchange = createExchange("GET", "/api/memories/unknown/extra");
            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("未找到"));
        }

        @Test
        @DisplayName("不支持的 HTTP 方法返回 404")
        void unsupportedMethodReturns404() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);

            FakeHttpExchange exchange = createExchange("POST", "/api/memories");
            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
        }
    }

    @Nested
    @DisplayName("异常处理")
    class ExceptionHandlingTests {

        @Test
        @DisplayName("MemoryStore 抛出异常时返回 500")
        void returns500WhenStoreThrows() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);
            when(mockMemoryStore.getAllMetas()).thenThrow(new RuntimeException("存储异常"));

            FakeHttpExchange exchange = createExchange("GET", "/api/memories");
            handler.handle(exchange);

            assertEquals(500, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("error"));
        }
    }

    @Nested
    @DisplayName("响应头设置")
    class ResponseHeaderTests {

        @Test
        @DisplayName("所有响应设置正确的 Content-Type 和 CORS 头")
        void setsCorrectHeaders() throws IOException {
            ServiceLocator.registerSingleton(MemoryStore.class, mockMemoryStore);
            when(mockMemoryStore.getAllMetas()).thenReturn(List.of());

            FakeHttpExchange exchange = createExchange("GET", "/api/memories");
            handler.handle(exchange);

            Headers headers = exchange.getResponseHeaders();
            assertEquals("application/json", headers.getFirst("Content-Type"));
            assertEquals("*", headers.getFirst("Access-Control-Allow-Origin"));
            assertEquals("GET, DELETE, PUT, OPTIONS", headers.getFirst("Access-Control-Allow-Methods"));
            assertEquals("Content-Type", headers.getFirst("Access-Control-Allow-Headers"));
        }
    }

    private MemoryStore.MemoryEntryMeta createMeta(String id, String title,
                                                    MemoryEntry.MemoryType type, Instant lastUpdated) {
        MemoryStore.MemoryEntryMeta meta = new MemoryStore.MemoryEntryMeta(id, title, type);
        meta.lastUpdated = lastUpdated;
        return meta;
    }

    static class FakeHttpExchange extends HttpExchange {

        private final String requestMethod;
        private final String requestUri;
        private final Headers responseHeaders = new Headers();
        private final Headers requestHeaders = new Headers();
        private final ByteArrayOutputStream responseBody = new ByteArrayOutputStream();
        private final ByteArrayInputStream requestBody;
        private int responseCode = -1;
        private long responseLength = -1;
        private boolean closed = false;

        FakeHttpExchange(String requestMethod, String requestUri) {
            this(requestMethod, requestUri, "");
        }

        FakeHttpExchange(String requestMethod, String requestUri, String requestBodyContent) {
            this.requestMethod = requestMethod;
            this.requestUri = requestUri;
            this.requestBody = new ByteArrayInputStream(
                requestBodyContent.getBytes(java.nio.charset.StandardCharsets.UTF_8));
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
            return requestBody;
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
