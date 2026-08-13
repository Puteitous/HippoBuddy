package com.example.agent.web.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.Writer;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * SSE 事件写入器（异步化，2026-08-13 重构）。
 * <p>
 * <b>为什么异步：</b> 原实现由 Agent 主线程同步 write + flush。当客户端（Electron 窗口
 * 关闭/刷新/半开连接）断开时，TCP 发送缓冲区可能已满，{@code write()} 会<b>阻塞而不抛异常</b>，
 * 导致 Agent 主线程永久卡死：无异常、无日志、工具结果不落盘（会话历史残留孤儿 tool_call）。
 * 曾出现事故：Agent 排查代码时第 4 轮工具调用静默中断，用户只能靠"你继续"+
 * {@code MessageSanitizer} 清理孤儿调用才恢复会话。
 * <p>
 * <b>方案：</b> {@link #sendSseEvent(String, String)} 仅将事件入队（{@code offer} 非阻塞）后立即返回，
 * 由独立后台发送线程（daemon）按序 write + flush。任何写阻塞/失败都不会拖住 Agent 主线程：
 * <ul>
 *   <li>队列满（消费者卡住）→ 标记断开、清空队列、丢弃后续事件，Agent 照常执行并落盘 jsonl；</li>
 *   <li>写入抛 IOException（客户端已断开）→ 标记断开、停止发送，Agent 照常执行并落盘 jsonl；</li>
 *   <li>请求结束时调用 {@link #close()} 排空队列并回收线程。</li>
 * </ul>
 * 保留静态 ThreadLocal 断开标志仅用于兼容旧调用方/测试；生产代码不再依赖它判断 Agent 执行。
 */
public class SseWriter {

    private static final Logger logger = LoggerFactory.getLogger(SseWriter.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 事件队列容量：正常请求事件数远小于此值；仅消费者卡死时才可能打满 */
    private static final int QUEUE_CAPACITY = 2048;
    /** 队列排空/线程回收的最长等待时间 */
    private static final long DRAIN_TIMEOUT_MS = 3000;
    /** 消费者轮询空闲等待 */
    private static final long POLL_IDLE_MS = 200;

    private static final ThreadLocal<Boolean> clientDisconnected = ThreadLocal.withInitial(() -> false);

    private final Writer writer;
    private final BlockingQueue<String> queue = new LinkedBlockingQueue<>(QUEUE_CAPACITY);
    private final Thread senderThread;

    /** 已入队事件数（sendSseEvent 成功入队后递增） */
    private final java.util.concurrent.atomic.AtomicLong enqueued = new java.util.concurrent.atomic.AtomicLong();
    /** 已处理事件数（后台发送线程消费完一个事件后递增，无论成功/失败） */
    private final java.util.concurrent.atomic.AtomicLong processed = new java.util.concurrent.atomic.AtomicLong();

    /** 实例级断开标志（由发送线程在写失败时置位），主线程读取决定是否继续入队 */
    private volatile boolean disconnected = false;
    private volatile boolean closed = false;

    public SseWriter(Writer writer) {
        this.writer = writer;
        this.senderThread = new Thread(this::drainLoop, "sse-sender");
        this.senderThread.setDaemon(true);
        this.senderThread.start();
    }

    /** 后台发送线程：按序从队列取事件并 write + flush，绝不阻塞任何调用方线程 */
    private void drainLoop() {
        while (true) {
            String payload;
            try {
                payload = queue.poll(POLL_IDLE_MS, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            if (payload == null) {
                if (closed && queue.isEmpty()) {
                    return;
                }
                continue;
            }
            try {
                writer.write(payload);
                writer.flush();
                processed.incrementAndGet();
            } catch (IOException e) {
                // 客户端断开（半开连接）时 write 可能抛 IOException；
                // 这里只标记断开并停止发送，Agent 主线程不受影响，继续执行并落盘 conversation.jsonl。
                logger.debug("SSE 写入失败（客户端可能已断开），停止后续发送: {}", e.getMessage());
                disconnected = true;
                queue.clear();
                processed.incrementAndGet();
                return;
            }
        }
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

    public boolean isDisconnected() {
        return disconnected;
    }

    public Writer getWriter() {
        return writer;
    }

    /**
     * 发送 SSE 事件：仅入队，不阻塞。
     * 队列满说明消费者（发送线程）已卡死/客户端断开，标记断开并丢弃，绝不阻塞调用方。
     */
    public void sendSseEvent(String event, String data) {
        if (closed || disconnected) {
            return;
        }
        String payload = "event: " + event + "\n" + "data: " + data + "\n\n";
        if (!queue.offer(payload)) {
            logger.warn("SSE 发送队列已满（消费者阻塞或客户端断开），丢弃事件并停止发送: event={}", event);
            disconnected = true;
            queue.clear();
            return;
        }
        enqueued.incrementAndGet();
    }

    /**
     * 等待已入队事件全部处理完毕（后台发送线程消费完成）。
     * 供测试同步断言，以及 {@link #close()} 前确保事件已发出。
     * 断开或超时时提前返回，绝不无限等待。
     */
    public void awaitFlush() {
        awaitFlush(DRAIN_TIMEOUT_MS);
    }

    /**
     * 等待已入队事件全部处理完毕，最多等待 {@code timeoutMs} 毫秒。
     * 通过"入队数 vs 处理数"计数判断，避免队列被 poll 取出后尚未处理完导致的提前返回。
     */
    public void awaitFlush(long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (processed.get() < enqueued.get() && !disconnected && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(5);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    /**
     * 停止发送并回收线程：排空队列后中断发送线程。
     * 调用方应在关闭底层 Writer 前调用本方法，确保队列中事件已发出。
     */
    public void close() {
        closed = true;
        awaitFlush();
        senderThread.interrupt();
        try {
            senderThread.join(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
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
