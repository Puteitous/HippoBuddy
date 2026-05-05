package com.example.agent.memory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.PrintWriter;
import java.net.InetSocketAddress;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;

public class MemoryDashboardServer {

    private static final Logger logger = LoggerFactory.getLogger(MemoryDashboardServer.class);

    private static final CopyOnWriteArrayList<PrintWriter> clients = new CopyOnWriteArrayList<>();
    private static HttpServer server;
    private static ExecutorService executor;

    private MemoryDashboardServer() {}

    public static void start(int port) {
        if (server != null) {
            logger.warn("MemoryDashboardServer 已在运行，端口：{}", port);
            return;
        }

        try {
            server = HttpServer.create(new InetSocketAddress(port), 0);

            server.createContext("/sse/memory-events", new SseHandler());
            server.createContext("/api/chat", new ChatApiHandler());
            server.createContext("/api/sessions", new SessionApiHandler());
            server.createContext("/chat", new StaticFileHandler());
            server.createContext("/cockpit", new StaticFileHandler());
            server.createContext("/", new StaticFileHandler());

            executor = Executors.newCachedThreadPool();
            server.setExecutor(executor);
            server.start();

            logger.info("MemoryDashboardServer 已启动，端口：{}", port);
            logger.info("Hippo Cockpit: http://localhost:{}/cockpit", port);
            logger.info("Web Chat: http://localhost:{}/chat", port);
            logger.info("Memory Dashboard: http://localhost:{}/", port);
        } catch (IOException e) {
            logger.error("启动服务器失败：{}", e.getMessage());
        }
    }

    public static void stop() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
        clients.clear();
        logger.info("MemoryDashboardServer 已停止");
    }

    public static void broadcast(String eventType, String data) {
        logger.info("SSE 广播：eventType={}, data={}, clients={}", eventType, data, clients.size());
        
        if (clients.isEmpty()) {
            logger.warn("没有 SSE 客户端，跳过广播");
            return;
        }

        String message = "event: " + eventType + "\ndata: " + data + "\n\n";

        for (PrintWriter writer : clients) {
            try {
                writer.write(message);
                writer.flush();
                logger.debug("SSE 事件发送成功");
            } catch (Exception e) {
                logger.warn("SSE 广播失败：{}", e.getMessage());
            }
        }
    }

    public static int getClientCount() {
        return clients.size();
    }

    private static class SseHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.getResponseHeaders().set("Connection", "keep-alive");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");

            exchange.sendResponseHeaders(200, 0);

            PrintWriter writer = new PrintWriter(exchange.getResponseBody(), true);
            clients.add(writer);

            writer.write("event: connected\n");
            writer.write("data: {\"message\":\"连接成功\"}\n\n");
            writer.flush();

            logger.info("SSE 客户端已连接，当前连接数：{}", clients.size());

            try {
                while (true) {
                    Thread.sleep(1000);
                    writer.write(": heartbeat\n\n");
                    writer.flush();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                logger.debug("SSE 连接关闭：{}", e.getMessage());
            } finally {
                clients.remove(writer);
                writer.close();
                exchange.close();
                logger.info("SSE 客户端已断开，当前连接数：{}", clients.size());
            }
        }
    }

    private static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            
            if ("/".equals(path)) {
                path = "/index.html";
            } else if ("/chat".equals(path)) {
                path = "/chat.html";
            } else if ("/cockpit".equals(path)) {
                path = "/cockpit.html";
            }

            String resourcePath = "/static" + path;
            var resource = MemoryDashboardServer.class.getResource(resourcePath);

            if (resource == null) {
                String response = "404 Not Found: " + resourcePath;
                exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=UTF-8");
                exchange.sendResponseHeaders(404, response.getBytes("UTF-8").length);
                exchange.getResponseBody().write(response.getBytes("UTF-8"));
                exchange.close();
                return;
            }

            byte[] content = resource.openStream().readAllBytes();
            exchange.getResponseHeaders().set("Content-Type", "text/html; charset=UTF-8");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, content.length);
            exchange.getResponseBody().write(content);
            exchange.close();
        }
    }
}
