package com.example.agent.web.handler;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 优雅关闭 API — 供 Electron 退出时调用，让后端有机会保存状态并停止服务。
 * <p>
 * 挂载路径：/api/shutdown
 * <p>
 * 实现说明：先立即返回 200 响应（避免调用方等待或误判），随后延迟片刻触发
 * {@link System#exit(int)}，由 JVM shutdown hooks（DashboardServer.stop、
 * GracefulShutdown.shutdownAll 等）完成资源收尾。
 * </p>
 */
public class ShutdownApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ShutdownApiHandler.class);
    private static final byte[] OK_BODY = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, OK_BODY.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(OK_BODY);
        }

        logger.info("收到 /api/shutdown 请求，准备优雅退出...");
        Thread shutdownThread = new Thread(() -> {
            try {
                // 稍等片刻，确保 200 响应已送达调用方后再退出
                Thread.sleep(300);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            logger.info("触发 JVM 退出，执行优雅关闭 hooks...");
            System.exit(0);
        }, "shutdown-trigger");
        shutdownThread.start();
    }
}
