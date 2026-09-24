package com.example.agent.web.server;

import com.sun.net.httpserver.Filter;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpPrincipal;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;

/**
 * 为所有返回 JSON 的 API 响应统一补 {@code Cache-Control: no-store}。
 * <p>
 * 背景：各 handler 用 {@code com.sun.net.httpserver} 自行 set 响应头，多数 JSON GET 接口
 * 既无 Cache-Control 也无 ETag/Last-Modified，Chromium 可能对这类无验证头的 GET 做启发式缓存，
 * 导致界面拿到陈旧数据（与 RawFileHandler 当初 "max-age 固定字节" 同源的梗）。
 * 用过滤器集中兜底，避免在每个 handler 里重复加一行。
 * <p>
 * 策略：仅在响应尚未设置 Cache-Control 且 Content-Type 以 {@code application/json} 开头时注入
 * {@code no-store}；SSE({@code text/event-stream})、raw 文件、静态资源等其他类型完全不受影响。
 */
public class NoCacheJsonResponseFilter extends Filter {

    @Override
    public void doFilter(HttpExchange exchange, Chain chain) throws IOException {
        chain.doFilter(new JsonNoStoreExchange(exchange));
    }

    @Override
    public String description() {
        return "Inject Cache-Control: no-store for application/json responses";
    }

    /** 包裹 exchange：在发送响应头前，若命中 JSON 且未设 Cache-Control 则补 no-store */
    private static final class JsonNoStoreExchange extends HttpExchange {
        private final HttpExchange delegate;

        JsonNoStoreExchange(HttpExchange delegate) {
            this.delegate = delegate;
        }

        @Override
        public void sendResponseHeaders(int rCode, long rLen) throws IOException {
            Headers headers = delegate.getResponseHeaders();
            String contentType = headers.getFirst("Content-Type");
            if (headers.getFirst("Cache-Control") == null
                    && contentType != null
                    && contentType.toLowerCase().startsWith("application/json")) {
                headers.set("Cache-Control", "no-store");
            }
            delegate.sendResponseHeaders(rCode, rLen);
        }

        @Override public Headers getRequestHeaders() { return delegate.getRequestHeaders(); }
        @Override public Headers getResponseHeaders() { return delegate.getResponseHeaders(); }
        @Override public String getRequestMethod() { return delegate.getRequestMethod(); }
        @Override public URI getRequestURI() { return delegate.getRequestURI(); }
        @Override public String getProtocol() { return delegate.getProtocol(); }
        @Override public InputStream getRequestBody() { return delegate.getRequestBody(); }
        @Override public OutputStream getResponseBody() { return delegate.getResponseBody(); }
        @Override public void setStreams(InputStream i, OutputStream o) { delegate.setStreams(i, o); }
        @Override public InetSocketAddress getRemoteAddress() { return delegate.getRemoteAddress(); }
        @Override public InetSocketAddress getLocalAddress() { return delegate.getLocalAddress(); }
        @Override public HttpContext getHttpContext() { return delegate.getHttpContext(); }
        @Override public Object getAttribute(String name) { return delegate.getAttribute(name); }
        @Override public void setAttribute(String name, Object value) { delegate.setAttribute(name, value); }
        @Override public HttpPrincipal getPrincipal() { return delegate.getPrincipal(); }
        @Override public int getResponseCode() { return delegate.getResponseCode(); }
        @Override public void close() { delegate.close(); }
    }
}