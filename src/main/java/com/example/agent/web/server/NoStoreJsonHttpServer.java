package com.example.agent.web.server;

import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.concurrent.Executor;

/**
 * 装饰 {@link HttpServer}：在 {@link #createContext} 时自动给 {@code /api} 上下文挂载
 * {@link NoCacheJsonResponseFilter}，集中为 JSON 响应注入 {@code Cache-Control: no-store}。
 * <p>
 * JDK 的 HttpServer 未暴露 {@code getHttpContexts()},逐 context 手动挂 filter 显得繁琐,
 * 故在创建上下文时统一附加,避免各 handler 重复加头。
 */
public class NoStoreJsonHttpServer extends HttpServer {

    private final HttpServer delegate;
    private final NoCacheJsonResponseFilter jsonNoStore;

    public NoStoreJsonHttpServer(HttpServer delegate) {
        this.delegate = delegate;
        this.jsonNoStore = new NoCacheJsonResponseFilter();
    }

    @Override
    public HttpContext createContext(String path, HttpHandler handler) {
        HttpContext ctx = delegate.createContext(path, handler);
        if (path.startsWith("/api")) {
            ctx.getFilters().add(jsonNoStore);
        }
        return ctx;
    }

    @Override
    public HttpContext createContext(String path) {
        HttpContext ctx = delegate.createContext(path);
        if (path.startsWith("/api")) {
            ctx.getFilters().add(jsonNoStore);
        }
        return ctx;
    }

    @Override public void bind(InetSocketAddress addr, int backlog) throws IOException {
        delegate.bind(addr, backlog);
    }
    @Override public void start() { delegate.start(); }
    @Override public void setExecutor(Executor exec) { delegate.setExecutor(exec); }
    @Override public Executor getExecutor() { return delegate.getExecutor(); }
    @Override public void stop(int delay) { delegate.stop(delay); }
    @Override public void removeContext(String name) throws IllegalArgumentException {
        delegate.removeContext(name);
    }
    @Override public void removeContext(HttpContext ctx) { delegate.removeContext(ctx); }
    @Override public InetSocketAddress getAddress() { return delegate.getAddress(); }
}