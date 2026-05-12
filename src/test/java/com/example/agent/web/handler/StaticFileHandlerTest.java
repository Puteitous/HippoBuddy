package com.example.agent.web.handler;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpPrincipal;
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

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("StaticFileHandler 单元测试")
class StaticFileHandlerTest {

    private static final String BASE_PATH = "/web";
    private final StaticFileHandler handler = new StaticFileHandler(BASE_PATH);

    @Nested
    @DisplayName("路由映射")
    class RouteMappingTests {

        @Test
        @DisplayName("根路径 / 映射到 /cockpit.html")
        void rootPathMapsToCockpitHtml() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/");

            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("Cockpit"));
        }

        @Test
        @DisplayName("/cockpit 映射到 /cockpit.html")
        void cockpitPathMapsToCockpitHtml() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/cockpit");

            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("Cockpit"));
        }
    }

    @Nested
    @DisplayName("资源服务")
    class ResourceServingTests {

        @Test
        @DisplayName("请求存在的 HTML 文件返回 200 并携带正确内容")
        void servesExistingHtmlFile() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/cockpit.html");

            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("Cockpit"));
            assertTrue(body.contains("Hello"));
        }

        @Test
        @DisplayName("请求存在的 JS 文件返回 200")
        void servesExistingJsFile() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/app.js");

            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertEquals("console.log(\"hello\");\n", body);
        }

        @Test
        @DisplayName("请求存在的 CSS 文件返回 200")
        void servesExistingCssFile() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/style.css");

            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertEquals("body { color: red; }\n", body);
        }

        @Test
        @DisplayName("请求存在的 JSON 文件返回 200")
        void servesExistingJsonFile() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/data.json");

            handler.handle(exchange);

            assertEquals(200, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertEquals("{\"key\": \"value\"}\n", body);
        }
    }

    @Nested
    @DisplayName("静态资源不存在")
    class NotFoundTests {

        @Test
        @DisplayName("不存在的文件返回 404")
        void returns404ForNonExistentFile() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/nonexistent.html");

            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
            String body = exchange.getResponseBodyAsString();
            assertTrue(body.contains("404 Not Found"));
        }

        @Test
        @DisplayName("不存在的子路径返回 404")
        void returns404ForNonExistentSubPath() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/subdir/foo.html");

            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
        }
    }

    @Nested
    @DisplayName("响应头")
    class ResponseHeaderTests {

        @Test
        @DisplayName("HTML 文件设置正确的 Content-Type")
        void htmlContentType() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/cockpit.html");

            handler.handle(exchange);

            assertEquals("text/html; charset=UTF-8", exchange.getResponseHeaders().getFirst("Content-Type"));
        }

        @Test
        @DisplayName("JS 文件设置正确的 Content-Type")
        void jsContentType() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/app.js");

            handler.handle(exchange);

            assertEquals("application/javascript; charset=UTF-8", exchange.getResponseHeaders().getFirst("Content-Type"));
        }

        @Test
        @DisplayName("CSS 文件设置正确的 Content-Type")
        void cssContentType() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/style.css");

            handler.handle(exchange);

            assertEquals("text/css; charset=UTF-8", exchange.getResponseHeaders().getFirst("Content-Type"));
        }

        @Test
        @DisplayName("JSON 文件设置正确的 Content-Type")
        void jsonContentType() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/data.json");

            handler.handle(exchange);

            assertEquals("application/json; charset=UTF-8", exchange.getResponseHeaders().getFirst("Content-Type"));
        }

        @Test
        @DisplayName("设置 CORS 头")
        void setsCorsHeader() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/cockpit.html");

            handler.handle(exchange);

            assertEquals("*", exchange.getResponseHeaders().getFirst("Access-Control-Allow-Origin"));
        }

        @Test
        @DisplayName("设置禁用缓存头")
        void setsNoCacheHeaders() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/cockpit.html");

            handler.handle(exchange);

            assertEquals("no-cache, no-store, must-revalidate", exchange.getResponseHeaders().getFirst("Cache-Control"));
            assertEquals("no-cache", exchange.getResponseHeaders().getFirst("Pragma"));
            assertEquals("0", exchange.getResponseHeaders().getFirst("Expires"));
        }

        @Test
        @DisplayName("404 响应设置 text/plain Content-Type")
        void notFoundContentType() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/nonexistent.html");

            handler.handle(exchange);

            assertEquals("text/plain; charset=UTF-8", exchange.getResponseHeaders().getFirst("Content-Type"));
        }
    }

    @Nested
    @DisplayName("MIME 类型映射")
    class MimeTypeMappingTests {

        @Test
        @DisplayName("未知后缀返回 application/octet-stream")
        void unknownExtensionReturnsOctetStream() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", "/data.bin");

            handler.handle(exchange);

            assertEquals(404, exchange.getResponseCode());
        }
    }

    static class FakeHttpExchange extends HttpExchange {

        private final String requestMethod;
        private final String requestPath;
        private final Headers responseHeaders = new Headers();
        private final Headers requestHeaders = new Headers();
        private final ByteArrayOutputStream responseBody = new ByteArrayOutputStream();
        private int responseCode = -1;
        private long responseLength = -1;
        private boolean closed = false;

        FakeHttpExchange(String requestMethod, String requestPath) {
            this.requestMethod = requestMethod;
            this.requestPath = requestPath;
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
            return URI.create("http://localhost" + requestPath);
        }

        public int getResponseCode() {
            return responseCode;
        }

        String getResponseBodyAsString() {
            return responseBody.toString(java.nio.charset.StandardCharsets.UTF_8);
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
