package com.example.agent.web.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.Writer;

public class SseWriter {

    private static final Logger logger = LoggerFactory.getLogger(SseWriter.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static final ThreadLocal<Boolean> clientDisconnected = ThreadLocal.withInitial(() -> false);

    private final Writer writer;

    public SseWriter(Writer writer) {
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

    public static void setClientDisconnected(boolean disconnected) {
        clientDisconnected.set(disconnected);
    }

    public Writer getWriter() {
        return writer;
    }

    public void sendSseEvent(String event, String data) {
        try {
            writer.write("event: " + event + "\n");
            writer.write("data: " + data + "\n\n");
            writer.flush();
        } catch (IOException e) {
            // 客户端断开时只打日志，不设断开标志。
            // 前端切走后 Agent 仍需继续执行并写入 conversation.jsonl，
            // 这样切回来时能从文件加载完整结果。
            logger.debug("SSE 写入失败（客户端可能已断开）, event={}", event);
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
        if ((input.startsWith("{") || input.startsWith("[")) && isValidJson(input)) {
            return input;
        }
        return "\"" + escapeJson(input) + "\"";
    }

    /**
     * 判断输入是否为合法 JSON。用于 escapeJsonForValue 的安全校验：
     * 流式工具调用增量（如 Responses API 的 function_call_arguments.delta）可能是
     * 以 { / [ 开头的残缺 JSON 片段（如 "{\"command\":"），若盲目原样拼接，
     * 会让整个 SSE data 行成为非法 JSON，导致前端 JSON.parse 崩溃。
     */
    private static boolean isValidJson(String input) {
        try {
            return OBJECT_MAPPER.readTree(input) != null;
        } catch (Exception e) {
            return false;
        }
    }
}
