package com.example.agent.web.server;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.web.handler.ChatApiHandler;
import com.example.agent.web.handler.MemoryApiHandler;
import com.example.agent.web.handler.SessionApiHandler;
import com.example.agent.web.handler.StaticFileHandler;
import com.example.agent.web.handler.SystemPromptApiHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.PrintWriter;
import java.net.InetSocketAddress;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;

public class DashboardServer {

    private static final Logger logger = LoggerFactory.getLogger(DashboardServer.class);

    private static final CopyOnWriteArrayList<PrintWriter> clients = new CopyOnWriteArrayList<>();
    private static HttpServer server;
    private static ExecutorService executor;
    private static ScheduledExecutorService sessionCleanupScheduler;

    // 会话清理配置（参照 CLI 的 72 小时过期策略）
    private static final long SESSION_IDLE_TIMEOUT_MS = 72 * 60 * 60 * 1000; // 72 小时
    private static final long CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 每 30 分钟清理一次

    private DashboardServer() {}

    public static void start(int port) {
        if (server != null) {
            logger.warn("DashboardServer 已在运行，端口：{}", port);
            return;
        }

        try {
            server = HttpServer.create(new InetSocketAddress(port), 0);

            server.createContext("/sse/memory-events", new SseHandler());
            server.createContext("/api/chat", new ChatApiHandler());
            server.createContext("/api/sessions", new SessionApiHandler());
            server.createContext("/api/memories", new MemoryApiHandler());
            server.createContext("/api/system-prompts", new SystemPromptApiHandler());
            server.createContext("/chat", new StaticFileHandler("/static"));
            server.createContext("/cockpit", new StaticFileHandler("/static"));
            server.createContext("/", new StaticFileHandler("/static"));

            executor = Executors.newCachedThreadPool();
            server.setExecutor(executor);
            server.start();

            // 启动会话清理定时器（参照 CLI 的 cleanupIdleSessions）
            startSessionCleanup();

            logger.info("DashboardServer 已启动，端口：{}", port);
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
        if (sessionCleanupScheduler != null) {
            sessionCleanupScheduler.shutdownNow();
            sessionCleanupScheduler = null;
        }
        clients.clear();
        logger.info("DashboardServer 已停止");
    }

    /**
     * 启动会话清理定时器（参照 CLI 的 cleanupIdleSessions 机制）
     */
    private static void startSessionCleanup() {
        sessionCleanupScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "web-session-cleanup");
            t.setDaemon(true);
            return t;
        });

        sessionCleanupScheduler.scheduleAtFixedRate(() -> {
            try {
                ConversationService conversationService = ServiceLocator.getOrNull(ConversationService.class);
                if (conversationService != null) {
                    conversationService.cleanupIdleSessions(SESSION_IDLE_TIMEOUT_MS);
                }
            } catch (Exception e) {
                logger.warn("会话清理任务执行失败: {}", e.getMessage());
            }
        }, CLEANUP_INTERVAL_MS, CLEANUP_INTERVAL_MS, TimeUnit.MILLISECONDS);

        logger.info("会话清理定时器已启动: 间隔={} 分钟, 过期={} 小时", 
            CLEANUP_INTERVAL_MS / 60000, SESSION_IDLE_TIMEOUT_MS / 3600000);
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
}
