package com.example.agent.web.handler;

import com.sun.net.httpserver.HttpExchange;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.concurrent.TimeUnit;

import com.sun.net.httpserver.Headers;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("RawFileHandler(文件原始字节预览 + 缓存校验)单元测试")
class RawFileHandlerTest {

    private final RawFileHandler handler = new RawFileHandler();

    @TempDir
    Path tempDir;

    private String rawUrl(String filePath) {
        return "http://localhost/file/raw?path=" + URLEncoder.encode(filePath, StandardCharsets.UTF_8);
    }

    private Path write(Path dir, String name, byte[] content, long mtimeMillis) throws IOException {
        Path file = dir.resolve(name);
        Files.write(file, content);
        Files.setLastModifiedTime(file, FileTime.fromMillis(mtimeMillis));
        return file;
    }

    private long fixedMtime() {
        // 一个远离当前的固定时间,避免与解析边界纠缠
        return 1_700_000_000_000L;
    }

    @Test
    @DisplayName("PDF 返回 200 + application/pdf,携带 ETag/Last-Modified/no-cache")
    void pdfServedWithValidatorsAndNoCache() throws IOException {
        Path file = write(tempDir, "doc.pdf", "%PDF-1.4 fake".getBytes(StandardCharsets.UTF_8), fixedMtime());
        FakeHttpExchange ex = new FakeHttpExchange("GET", rawUrl(file.toString()));

        handler.handle(ex);

        assertEquals(200, ex.getResponseCode());
        assertEquals("application/pdf", ex.getResponseHeaders().getFirst("Content-Type"));
        assertEquals("no-cache", ex.getResponseHeaders().getFirst("Cache-Control"));
        assertNotNull(ex.getResponseHeaders().getFirst("ETag"));
        assertNotNull(ex.getResponseHeaders().getFirst("Last-Modified"));
        assertEquals("%PDF-1.4 fake", ex.getResponseBodyAsString());
    }

    @Test
    @DisplayName("ETag 由 size+mtime 决定:内容变(改 mtime)→ ETag 变化")
    void etagChangesWhenFileChanges() throws IOException {
        long t0 = fixedMtime();
        Path file = write(tempDir, "pic.png", new byte[]{1, 2, 3}, t0);

        FakeHttpExchange a = new FakeHttpExchange("GET", rawUrl(file.toString()));
        handler.handle(a);
        // 内容同 size、仅 mtime 变化(size 相同,ETag 靠 mtime 区分)
        Files.setLastModifiedTime(file, FileTime.fromMillis(t0 + 1000));
        FakeHttpExchange b = new FakeHttpExchange("GET", rawUrl(file.toString()));
        handler.handle(b);

        assertNotEquals(
            a.getResponseHeaders().getFirst("ETag"),
            b.getResponseHeaders().getFirst("ETag"),
            "文件 mtime 变化后 ETag 应改变,保证缓存会被重新校验");
    }

    @Test
    @DisplayName("If-None-Match 命中(ETag 一致)→ 返回 304 且不返回正文")
    void conditionalIfNoneMatchHitReturns304() throws IOException {
        Path file = write(tempDir, "pic.png", new byte[]{1, 2, 3}, fixedMtime());

        FakeHttpExchange first = new FakeHttpExchange("GET", rawUrl(file.toString()));
        handler.handle(first);
        String etag = first.getResponseHeaders().getFirst("ETag");

        FakeHttpExchange second = new FakeHttpExchange("GET", rawUrl(file.toString()));
        second.requestHeaders.set("If-None-Match", etag);
        handler.handle(second);

        assertEquals(304, second.getResponseCode());
        assertEquals("", second.getResponseBodyAsString(), "304 不应携带正文");
    }

    @Test
    @DisplayName("If-Modified-Since 命中(mtime 未晚于请求时间)→ 返回 304")
    void conditionalIfModifiedSinceHitReturns304() throws IOException {
        long mtime = fixedMtime();
        Path file = write(tempDir, "doc.pdf", "%PDF-1.4 fake".getBytes(StandardCharsets.UTF_8), mtime);

        // 首次访问拿到 Last-Modified,原样回传即命中 304
        FakeHttpExchange first = new FakeHttpExchange("GET", rawUrl(file.toString()));
        handler.handle(first);
        String lastModified = first.getResponseHeaders().getFirst("Last-Modified");

        FakeHttpExchange second = new FakeHttpExchange("GET", rawUrl(file.toString()));
        second.requestHeaders.set("If-Modified-Since", lastModified);
        handler.handle(second);

        assertEquals(304, second.getResponseCode());
    }

    @Test
    @DisplayName("mtime 变新后旧 If-None-Match 不再命中 → 返回 200 新正文")
    void changedFileDoesNotHitOldEtag() throws IOException {
        long t0 = fixedMtime();
        Path file = write(tempDir, "doc.pdf", "%PDF-1.4 v1".getBytes(StandardCharsets.UTF_8), t0);

        FakeHttpExchange first = new FakeHttpExchange("GET", rawUrl(file.toString()));
        handler.handle(first);
        String oldEtag = first.getResponseHeaders().getFirst("ETag");

        // 文件被修复(新字节 + 新 mtime)
        Files.write(file, "%PDF-1.7 fixed".getBytes(StandardCharsets.UTF_8));
        Files.setLastModifiedTime(file, FileTime.fromMillis(t0 + 5000));

        FakeHttpExchange second = new FakeHttpExchange("GET", rawUrl(file.toString()));
        second.requestHeaders.set("If-None-Match", oldEtag);
        handler.handle(second);

        assertEquals(200, second.getResponseCode());
        assertEquals("%PDF-1.7 fixed", second.getResponseBodyAsString(), "修复后的文件应立即返回新内容");
    }

    @Test
    @DisplayName("HTML 始终保持不缓存(no-store)")
    void htmlStaysNoStore() throws IOException {
        Path file = write(tempDir, "page.html", "<html>hi</html>".getBytes(StandardCharsets.UTF_8), fixedMtime());
        FakeHttpExchange ex = new FakeHttpExchange("GET", rawUrl(file.toString()));

        handler.handle(ex);

        assertEquals("no-cache, no-store, must-revalidate", ex.getResponseHeaders().getFirst("Cache-Control"));
    }

    @Test
    @DisplayName("文件不存在返回 404")
    void missingFileReturns404() throws IOException {
        FakeHttpExchange ex = new FakeHttpExchange("GET", rawUrl(tempDir.resolve("nope.pdf").toString()));
        handler.handle(ex);
        assertEquals(404, ex.getResponseCode());
    }

    @Test
    @DisplayName("缺少 path 参数返回 400")
    void missingPathReturns400() throws IOException {
        FakeHttpExchange ex = new FakeHttpExchange("GET", "http://localhost/file/raw");
        handler.handle(ex);
        assertEquals(400, ex.getResponseCode());
    }

    // ── 最小 HttpExchange 替身(支持请求头注入 + 响应头/正文捕获) ──
    static class FakeHttpExchange extends HttpExchange {
        final Headers requestHeaders = new Headers();
        private final Headers responseHeaders = new Headers();
        private final ByteArrayOutputStream responseBody = new ByteArrayOutputStream();
        private final String requestMethod;
        private final String requestUri;
        private int responseCode = -1;

        FakeHttpExchange(String method, String uri) {
            this.requestMethod = method;
            this.requestUri = uri;
            requestHeaders.add("Host", "localhost");
        }

        @Override public Headers getRequestHeaders() { return requestHeaders; }
        @Override public Headers getResponseHeaders() { return responseHeaders; }
        @Override public String getRequestMethod() { return requestMethod; }

        @Override
        public void sendResponseHeaders(int rCode, long rLen) {
            this.responseCode = rCode;
        }

        @Override public OutputStream getResponseBody() { return responseBody; }
        @Override public void close() { }
        @Override public URI getRequestURI() { return URI.create(requestUri); }
        @Override public InputStream getRequestBody() { return new ByteArrayInputStream(new byte[0]); }
        @Override public void setStreams(InputStream i, OutputStream o) { }
        @Override public com.sun.net.httpserver.HttpContext getHttpContext() { return null; }
        @Override public com.sun.net.httpserver.HttpPrincipal getPrincipal() { return null; }
        @Override public Object getAttribute(String name) { return null; }
        @Override public void setAttribute(String name, Object value) { }
        @Override public java.net.InetSocketAddress getRemoteAddress() {
            return new java.net.InetSocketAddress("127.0.0.1", 12345);
        }
        @Override public java.net.InetSocketAddress getLocalAddress() {
            return new java.net.InetSocketAddress("127.0.0.1", 8080);
        }
        @Override public String getProtocol() { return "HTTP/1.1"; }

        public int getResponseCode() { return responseCode; }

        String getResponseBodyAsString() {
            return responseBody.toString(StandardCharsets.UTF_8);
        }
    }
}