package com.example.agent.llm.stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.SocketTimeoutException;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("IdleTimeoutInputStream 单元测试")
class IdleTimeoutInputStreamTest {

    @AfterEach
    void tearDown() {
        // 等待可能残留的看门狗线程退出，避免测试间互相干扰
        try {
            Thread.sleep(20);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    @Nested
    @DisplayName("正常读取")
    class NormalReadTests {

        @Test
        @DisplayName("数据持续到达时不触发超时，读到全部内容")
        void continuousDataNoTimeout() throws IOException {
            byte[] data = "hello stream".getBytes();
            try (IdleTimeoutInputStream wrapped = new IdleTimeoutInputStream(
                    new ByteArrayInputStream(data), 2000, "test")) {
                byte[] buf = new byte[data.length];
                int n = wrapped.read(buf, 0, buf.length);
                assertEquals(data.length, n, "应读到全部字节");
                assertArrayEquals(data, buf, "内容应一致");
                assertEquals(-1, wrapped.read(), "读完后应返回 -1");
            }
        }

        @Test
        @DisplayName("数据以小于超时的间隔持续到达，不触发超时")
        void slowButAliveNoTimeout() throws IOException {
            // 每 50ms 产出一个字节，单字节读取每次返回即刷新时间戳；
            // 超时设 200ms —— 只要有数据到达刷新，就不应触发超时
            try (IdleTimeoutInputStream wrapped = new IdleTimeoutInputStream(
                    new SlowTrickleInputStream(50, 8), 200, "test")) {
                int total = 0;
                int b;
                while ((b = wrapped.read()) != -1) {
                    total++;
                    assertEquals(65, b, "内容应一致");
                }
                assertEquals(8, total, "应读到全部 8 个字节");
            }
        }
    }

    @Nested
    @DisplayName("空闲超时")
    class IdleTimeoutTests {

        @Test
        @DisplayName("底层流挂起超过阈值时 read 抛 SocketTimeoutException")
        void stallTriggersTimeout() throws IOException {
            StallingInputStream stall = new StallingInputStream();
            IdleTimeoutInputStream wrapped = new IdleTimeoutInputStream(stall, 300, "test");
            try {
                SocketTimeoutException ex = assertThrows(SocketTimeoutException.class,
                    wrapped::read, "挂起流应触发空闲超时");
                assertTrue(ex.getMessage().contains("空闲超时"), "错误信息应说明空闲超时");
            } finally {
                wrapped.close();
            }
        }

        @Test
        @DisplayName("超时前正常读到数据则继续工作，超时后再次读取仍抛超时")
        void readBeforeTimeoutThenStall() throws IOException {
            // 先给一点数据，然后永久挂起
            ReadThenStallInputStream stream = new ReadThenStallInputStream(3);
            IdleTimeoutInputStream wrapped = new IdleTimeoutInputStream(stream, 300, "test");
            try {
                byte[] buf = new byte[3];
                assertEquals(3, wrapped.read(buf, 0, 3), "超时前应读到数据");
                assertArrayEquals(new byte[]{1, 2, 3}, buf);

                SocketTimeoutException ex = assertThrows(SocketTimeoutException.class,
                    wrapped::read, "挂起后应触发空闲超时");
                assertTrue(ex.getMessage().contains("空闲超时"));
            } finally {
                wrapped.close();
            }
        }
    }

    @Nested
    @DisplayName("生命周期")
    class LifecycleTests {

        @Test
        @DisplayName("读取到 EOF 后看门狗停止，不再触发超时")
        void eofStopsWatchdog() throws IOException {
            // 超时极短（100ms），但流立即 EOF —— 看门狗应因 eof 退出，不会误报
            try (IdleTimeoutInputStream wrapped = new IdleTimeoutInputStream(
                    new ByteArrayInputStream(new byte[0]), 100, "test")) {
                assertEquals(-1, wrapped.read(), "空流应直接 EOF");
                // 等待超过超时阈值，确认不会抛异常
                try {
                    Thread.sleep(250);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                assertEquals(-1, wrapped.read(), "EOF 后仍应返回 -1 且不抛异常");
            }
        }
    }

    // ===== 测试辅助流 =====

    /** 每隔 delayMs 产出一个字节，共 count 个 */
    static class SlowTrickleInputStream extends InputStream {
        private final long delayMs;
        private int remaining;
        SlowTrickleInputStream(long delayMs, int count) {
            this.delayMs = delayMs;
            this.remaining = count;
        }
        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return -1;
            }
            remaining--;
            return 65; // 'A'
        }
    }

    /** 永久挂起（模拟半开连接），close 时解除阻塞并抛 IOException */
    static class StallingInputStream extends InputStream {
        private volatile boolean closed;
        @Override
        public int read() throws IOException {
            while (!closed) {
                try {
                    Thread.sleep(50);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return -1;
                }
            }
            throw new IOException("Stream closed by watchdog");
        }
        @Override
        public void close() {
            closed = true;
        }
    }

    /** 先产出 count 个字节（1..count），然后永久挂起 */
    static class ReadThenStallInputStream extends InputStream {
        private int emitted;
        private final int count;
        ReadThenStallInputStream(int count) {
            this.count = count;
        }
        private volatile boolean closed;
        @Override
        public int read() throws IOException {
            if (emitted < count) {
                return ++emitted; // 1,2,3...
            }
            while (!closed) {
                try {
                    Thread.sleep(50);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return -1;
                }
            }
            throw new IOException("Stream closed by watchdog");
        }
        @Override
        public void close() {
            closed = true;
        }
    }
}
