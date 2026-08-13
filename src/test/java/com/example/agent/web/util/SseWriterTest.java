package com.example.agent.web.util;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.StringWriter;
import java.io.Writer;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SseWriter 单元测试")
class SseWriterTest {

    private StringWriter stringWriter;
    private SseWriter sseWriter;

    @BeforeEach
    void setUp() {
        SseWriter.resetClientDisconnected();
        stringWriter = new StringWriter();
        sseWriter = new SseWriter(stringWriter);
    }

    @AfterEach
    void tearDown() {
        sseWriter.close();
        SseWriter.removeClientDisconnected();
    }

    @Nested
    @DisplayName("sendSseEvent")
    class SendSseEventTests {

        @Test
        @DisplayName("应输出正确的 SSE 格式")
        void sendsCorrectSseFormat() {
            sseWriter.sendSseEvent("message", "{\"content\":\"hello\"}");
            sseWriter.awaitFlush();

            String output = stringWriter.toString();
            assertTrue(output.contains("event: message\n"));
            assertTrue(output.contains("data: {\"content\":\"hello\"}\n\n"));
        }

        @Test
        @DisplayName("连续发送多个事件应正确累积")
        void sendsMultipleEvents() {
            sseWriter.sendSseEvent("event1", "data1");
            sseWriter.sendSseEvent("event2", "data2");
            sseWriter.awaitFlush();

            String output = stringWriter.toString();
            assertTrue(output.contains("event: event1\ndata: data1\n\n"));
            assertTrue(output.contains("event: event2\ndata: data2\n\n"));
        }

        @Test
        @DisplayName("实例断开后应跳过发送（不再写入底层 writer）")
        void skipsSendWhenDisconnected() {
            int[] writeCount = {0};
            Writer countingWriter = new Writer() {
                @Override
                public void write(char[] cbuf, int off, int len) throws IOException {
                    writeCount[0]++;
                    throw new IOException("Broken pipe");
                }
                @Override
                public void flush() throws IOException {}
                @Override
                public void close() throws IOException {}
            };
            SseWriter broken = new SseWriter(countingWriter);

            broken.sendSseEvent("first", "data");
            broken.awaitFlush();
            assertTrue(broken.isDisconnected(), "写失败后实例应标记断开");

            broken.sendSseEvent("second", "data");
            broken.awaitFlush();
            assertEquals(1, writeCount[0], "断开后不应再调用 writer.write()");
            broken.close();
        }

        @Test
        @DisplayName("sendSseEvent 返回 writer 引用")
        void getWriterReturnsWriter() {
            assertSame(stringWriter, sseWriter.getWriter());
        }
    }

    @Nested
    @DisplayName("clientDisconnected ThreadLocal（兼容保留）")
    class ClientDisconnectedTests {

        @Test
        @DisplayName("初始状态应为 false")
        void initiallyFalse() {
            SseWriter.removeClientDisconnected();
            assertFalse(SseWriter.isClientDisconnected());
        }

        @Test
        @DisplayName("resetClientDisconnected 应设为 false")
        void resetSetsFalse() {
            SseWriter.removeClientDisconnected();
            SseWriter.resetClientDisconnected();
            assertFalse(SseWriter.isClientDisconnected());
        }
    }

    @Nested
    @DisplayName("写失败处理（实例级断开标志）")
    class IOExceptionHandlingTests {

        @Test
        @DisplayName("write 抛出 IOException 时应设置实例断开标志")
        void ioExceptionOnWriteSetsDisconnectedFlag() {
            Writer brokenWriter = new Writer() {
                @Override
                public void write(char[] cbuf, int off, int len) throws IOException {
                    throw new IOException("Broken pipe");
                }
                @Override
                public void flush() throws IOException {}
                @Override
                public void close() throws IOException {}
            };
            SseWriter broken = new SseWriter(brokenWriter);

            broken.sendSseEvent("test", "data");
            broken.awaitFlush();

            assertTrue(broken.isDisconnected(), "写失败后实例断开标志应为 true");
            broken.close();
        }

        @Test
        @DisplayName("已断开后 sendSseEvent 应静默跳过，不再调用 writer")
        void sendAfterDisconnectDoesNotThrow() {
            int[] writeCount = {0};
            Writer countingWriter = new Writer() {
                @Override
                public void write(char[] cbuf, int off, int len) throws IOException {
                    writeCount[0]++;
                    if (writeCount[0] == 1) {
                        throw new IOException("Broken pipe");
                    }
                }
                @Override
                public void flush() throws IOException {}
                @Override
                public void close() throws IOException {}
            };
            SseWriter broken = new SseWriter(countingWriter);

            broken.sendSseEvent("first", "data");
            broken.awaitFlush();
            assertTrue(broken.isDisconnected());

            broken.sendSseEvent("second", "data");
            broken.awaitFlush();
            assertEquals(1, writeCount[0], "断开后不应再调用 writer.write()");
            broken.close();
        }

        @Test
        @DisplayName("异步发送：Agent 主线程入队不被写阻塞拖住")
        void enqueueIsNonBlockingWhenWriterStalls() {
            // 模拟 write 永久阻塞（不抛异常）的客户端半开连接
            Writer stallingWriter = new Writer() {
                @Override
                public void write(char[] cbuf, int off, int len) throws IOException {
                    try {
                        Thread.sleep(60_000);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }
                @Override
                public void flush() throws IOException {}
                @Override
                public void close() throws IOException {}
            };
            SseWriter stalling = new SseWriter(stallingWriter);

            long start = System.currentTimeMillis();
            for (int i = 0; i < 100; i++) {
                stalling.sendSseEvent("evt" + i, "data");
            }
            long elapsed = System.currentTimeMillis() - start;
            // 队列容量 2048，100 个事件不会打满；主线程应瞬时返回（异步）
            assertTrue(elapsed < 2000, "sendSseEvent 不应被阻塞写入拖住, elapsed=" + elapsed + "ms");
            stalling.close();
        }
    }

    @Nested
    @DisplayName("escapeJson")
    class EscapeJsonTests {

        @Test
        @DisplayName("null 输入应返回空字符串")
        void nullInputReturnsEmpty() {
            assertEquals("", SseWriter.escapeJson(null));
        }

        @Test
        @DisplayName("普通文本应保持不变")
        void normalTextUnchanged() {
            assertEquals("hello", SseWriter.escapeJson("hello"));
            assertEquals("Hello, 世界!", SseWriter.escapeJson("Hello, 世界!"));
            assertEquals("abc123", SseWriter.escapeJson("abc123"));
        }

        @Test
        @DisplayName("反斜杠应转义")
        void escapesBackslash() {
            assertEquals("\\\\", SseWriter.escapeJson("\\"));
            assertEquals("a\\\\b", SseWriter.escapeJson("a\\b"));
        }

        @Test
        @DisplayName("双引号应转义")
        void escapesDoubleQuote() {
            assertEquals("\\\"", SseWriter.escapeJson("\""));
            assertEquals("a\\\"b", SseWriter.escapeJson("a\"b"));
        }

        @Test
        @DisplayName("换行符应转义")
        void escapesNewline() {
            assertEquals("a\\nb", SseWriter.escapeJson("a\nb"));
        }

        @Test
        @DisplayName("回车符应转义")
        void escapesCarriageReturn() {
            assertEquals("a\\rb", SseWriter.escapeJson("a\rb"));
        }

        @Test
        @DisplayName("制表符应转义")
        void escapesTab() {
            assertEquals("a\\tb", SseWriter.escapeJson("a\tb"));
        }

        @Test
        @DisplayName("退格符应转义")
        void escapesBackspace() {
            assertEquals("a\\bb", SseWriter.escapeJson("a\bb"));
        }

        @Test
        @DisplayName("换页符应转义")
        void escapesFormFeed() {
            assertEquals("a\\fb", SseWriter.escapeJson("a\fb"));
        }

        @Test
        @DisplayName("控制字符应转为 unicode 转义")
        void escapesControlCharacters() {
            assertEquals("\\u0000", SseWriter.escapeJson("\u0000"));
            assertEquals("\\u001f", SseWriter.escapeJson("\u001f"));
            assertEquals("\\u007f", SseWriter.escapeJson("\u007f"));
        }

        @Test
        @DisplayName("混合转义应正确处理")
        void mixedEscaping() {
            String input = "say \"hello\"\nline2\\end";
            String expected = "say \\\"hello\\\"\\nline2\\\\end";
            assertEquals(expected, SseWriter.escapeJson(input));
        }
    }

    @Nested
    @DisplayName("escapeJsonForValue")
    class EscapeJsonForValueTests {

        @Test
        @DisplayName("null 输入应返回 null")
        void nullInputReturnsNull() {
            assertEquals("null", SseWriter.escapeJsonForValue(null));
        }

        @Test
        @DisplayName("以 { 开头的输入应原样返回")
        void objectLiteralReturnsAsIs() {
            String json = "{\"key\":\"value\"}";
            assertSame(json, SseWriter.escapeJsonForValue(json));
        }

        @Test
        @DisplayName("以 [ 开头的输入应原样返回")
        void arrayLiteralReturnsAsIs() {
            String json = "[1,2,3]";
            assertSame(json, SseWriter.escapeJsonForValue(json));
        }

        @Test
        @DisplayName("普通字符串应加引号并转义")
        void plainStringWrappedInQuotes() {
            assertEquals("\"hello\"", SseWriter.escapeJsonForValue("hello"));
        }

        @Test
        @DisplayName("含特殊字符的字符串应转义并加引号")
        void stringWithSpecialCharsEscapedAndQuoted() {
            assertEquals("\"say \\\"hi\\\"\"", SseWriter.escapeJsonForValue("say \"hi\""));
        }
    }
}
