package com.example.agent.llm.stream;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.SocketTimeoutException;

/**
 * 带空闲超时的 InputStream 包装器。
 * <p>
 * 解决 Java 11 HttpClient 流式响应 body <b>无 read timeout</b> 的问题：
 * {@code HttpRequest.timeout()} 只覆盖"发送请求 → 收到响应头"，
 * 响应头之后逐行读取 body 时，若服务端/网络静默挂起（半开连接、服务端卡死），
 * {@code readLine()} 会无限期阻塞，导致 Agent 主线程卡死（与 SSE 写入阻塞同类的镜像问题）。
 * <p>
 * 实现：看门狗线程监测"距上次成功读取的间隔"，超过 {@code timeoutMs} 判定连接挂起，
 * 关闭底层流使阻塞中的 {@code read()} 抛 IOException，并重抛为 {@link SocketTimeoutException}
 * （上层可据此转为 LlmTimeoutException，语义清晰）。正常读取会持续刷新时间戳，不触发。
 */
public class IdleTimeoutInputStream extends FilterInputStream {

    /** 看门狗轮询间隔：越小越及时，过小空耗 CPU */
    private static final long WATCHDOG_POLL_MS = 500;

    private final long timeoutMs;
    private final Object lock = new Object();
    private long lastReadTime;
    private volatile boolean eof;
    private volatile boolean closed;
    private volatile boolean timedOut;
    private final Thread watchdog;

    /**
     * @param in       底层流（LLM 流式响应 body）
     * @param timeoutMs 空闲超时毫秒数：两次成功读取之间的最大间隔
     * @param name     看门狗线程名后缀（建议传 provider 名，便于排查）
     */
    public IdleTimeoutInputStream(InputStream in, long timeoutMs, String name) {
        super(in);
        this.timeoutMs = timeoutMs;
        this.lastReadTime = System.currentTimeMillis();
        this.watchdog = new Thread(this::watchdogLoop, "idle-timeout-" + name);
        this.watchdog.setDaemon(true);
        this.watchdog.start();
    }

    private void watchdogLoop() {
        while (!closed && !eof && !timedOut) {
            long idle;
            synchronized (lock) {
                idle = System.currentTimeMillis() - lastReadTime;
            }
            if (idle > timeoutMs) {
                timedOut = true;
                // 关闭底层流：让阻塞中的 read() 立即以 IOException 返回
                try {
                    in.close();
                } catch (IOException ignored) {
                    // 流已挂起/关闭，忽略
                }
                return;
            }
            try {
                Thread.sleep(WATCHDOG_POLL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    @Override
    public int read() throws IOException {
        try {
            int b = super.read();
            if (b >= 0) {
                touch();
            } else {
                eof = true;
            }
            return b;
        } catch (IOException e) {
            throw translateIfTimedOut(e);
        }
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        try {
            // 直接调底层，避免 FilterInputStream 默认逐字节委托的性能损失
            int n = in.read(b, off, len);
            if (n > 0) {
                touch();
            } else if (n == -1) {
                eof = true;
            }
            return n;
        } catch (IOException e) {
            throw translateIfTimedOut(e);
        }
    }

    @Override
    public void close() throws IOException {
        closed = true;
        super.close();
    }

    /** 每次成功读到数据都刷新时间戳（有数据到达 = 连接活着） */
    private void touch() {
        synchronized (lock) {
            lastReadTime = System.currentTimeMillis();
        }
    }

    /** 看门狗已判定超时时，把底层流关闭引发的 IOException 翻译为明确的超时异常 */
    private IOException translateIfTimedOut(IOException e) {
        if (timedOut) {
            return new SocketTimeoutException(
                "流式响应读取空闲超时（超过 " + (timeoutMs / 1000) + " 秒无数据），连接可能已挂起");
        }
        return e;
    }
}
