package com.example.agent.web.util;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.PrintWriter;
import java.io.StringWriter;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SseWriter 单元测试")
class SseWriterTest {

    private StringWriter stringWriter;
    private PrintWriter printWriter;
    private SseWriter sseWriter;

    @BeforeEach
    void setUp() {
        SseWriter.resetClientDisconnected();
        stringWriter = new StringWriter();
        printWriter = new PrintWriter(stringWriter);
        sseWriter = new SseWriter(printWriter);
    }

    @AfterEach
    void tearDown() {
        SseWriter.removeClientDisconnected();
    }

    @Nested
    @DisplayName("sendSseEvent")
    class SendSseEventTests {

        @Test
        @DisplayName("应输出正确的 SSE 格式")
        void sendsCorrectSseFormat() {
            sseWriter.sendSseEvent("message", "{\"content\":\"hello\"}");

            String output = stringWriter.toString();
            assertTrue(output.contains("event: message\n"));
            assertTrue(output.contains("data: {\"content\":\"hello\"}\n\n"));
        }

        @Test
        @DisplayName("连续发送多个事件应正确累积")
        void sendsMultipleEvents() {
            sseWriter.sendSseEvent("event1", "data1");
            sseWriter.sendSseEvent("event2", "data2");

            String output = stringWriter.toString();
            assertTrue(output.contains("event: event1\ndata: data1\n\n"));
            assertTrue(output.contains("event: event2\ndata: data2\n\n"));
        }

        @Test
        @DisplayName("客户端断开后应跳过发送")
        void skipsSendWhenDisconnected() {
            SseWriter.resetClientDisconnected();
            sseWriter.sendSseEvent("first", "data");

            assertFalse(SseWriter.isClientDisconnected());
            String outputBefore = stringWriter.toString();
            assertTrue(outputBefore.contains("event: first"));
        }

        @Test
        @DisplayName("sendSseEvent 返回 writer 引用")
        void getWriterReturnsWriter() {
            assertSame(printWriter, sseWriter.getWriter());
        }
    }

    @Nested
    @DisplayName("clientDisconnected ThreadLocal")
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
