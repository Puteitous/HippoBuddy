package com.example.agent.web.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.PrintWriter;

public class SseWriter {

    private static final Logger logger = LoggerFactory.getLogger(SseWriter.class);

    private static final ThreadLocal<Boolean> clientDisconnected = ThreadLocal.withInitial(() -> false);

    private final PrintWriter writer;

    public SseWriter(PrintWriter writer) {
        this.writer = writer;
    }

    public static boolean isClientDisconnected() {
        return clientDisconnected.get();
    }

    public static void resetClientDisconnected() {
        clientDisconnected.set(false);
    }

    public static void removeClientDisconnected() {
        clientDisconnected.remove();
    }

    public PrintWriter getWriter() {
        return writer;
    }

    public void sendSseEvent(String event, String data) {
        if (clientDisconnected.get()) {
            return;
        }
        try {
            writer.write("event: " + event + "\n");
            writer.write("data: " + data + "\n\n");
            writer.flush();
        } catch (Exception e) {
            clientDisconnected.set(true);
            logger.debug("客户端连接已断开，停止发送 SSE 事件 (event={})", event);
        }
    }

    public static String escapeJson(String input) {
        if (input == null) return "";
        StringBuilder sb = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"': sb.append("\\\""); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                default:
                    if (c < 0x20 || c == 0x7F) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }

    public static String escapeJsonForValue(String input) {
        if (input == null) return "null";
        if (input.startsWith("{") || input.startsWith("[")) {
            return input;
        }
        return "\"" + escapeJson(input) + "\"";
    }
}
