package com.example.agent.llm.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;

class LlmExceptionTest {

    @Nested
    @DisplayName("LlmException基础测试")
    class LlmExceptionBasicTests {

        @Test
        @DisplayName("带消息构造")
        void testConstructorWithMessage() {
            LlmException exception = new LlmException("测试错误");
            
            assertEquals("测试错误", exception.getMessage());
            assertNull(exception.getCause());
        }

        @Test
        @DisplayName("带消息和原因构造")
        void testConstructorWithMessageAndCause() {
            Throwable cause = new RuntimeException("原始错误");
            LlmException exception = new LlmException("测试错误", cause);
            
            assertEquals("测试错误", exception.getMessage());
            assertEquals(cause, exception.getCause());
        }

        @Test
        @DisplayName("null消息")
        void testNullMessage() {
            LlmException exception = new LlmException(null);
            
            assertNull(exception.getMessage());
        }

        @Test
        @DisplayName("空消息")
        void testEmptyMessage() {
            LlmException exception = new LlmException("");
            
            assertEquals("", exception.getMessage());
        }
    }

    @Nested
    @DisplayName("LlmApiException测试")
    class LlmApiExceptionTests {

        @Test
        @DisplayName("带状态码构造")
        void testConstructorWithStatusCode() {
            LlmApiException exception = new LlmApiException("API错误", 500);
            
            assertEquals("API错误", exception.getMessage());
            assertEquals(500, exception.getStatusCode());
            assertNull(exception.getErrorBody());
        }

        @Test
        @DisplayName("带状态码和错误体构造")
        void testConstructorWithStatusCodeAndBody() {
            LlmApiException exception = new LlmApiException("API错误", 429, "{\"error\": \"rate limited\"}");
            
            assertEquals("API错误", exception.getMessage());
            assertEquals(429, exception.getStatusCode());
            assertEquals("{\"error\": \"rate limited\"}", exception.getErrorBody());
        }

        @Test
        @DisplayName("默认无错误码")
        void testDefaultErrorCodeNull() {
            LlmApiException exception = new LlmApiException("API错误", 500);
            
            assertNull(exception.getErrorCode());
            assertNull(exception.getDetail());
        }

        @Test
        @DisplayName("classify 工厂方法携带错误码与详情")
        void testClassifyFactory() {
            String body = "{\"error\":{\"message\":\"Insufficient Balance\",\"type\":\"insufficient_balance\"}}";
            LlmApiException exception = LlmApiException.classify("deepseek", 402, body);
            
            assertEquals("INSUFFICIENT_BALANCE", exception.getErrorCode());
            assertTrue(exception.getMessage().contains("余额不足"));
            assertEquals("Insufficient Balance", exception.getDetail());
            assertEquals(402, exception.getStatusCode());
            assertEquals(body, exception.getErrorBody());
        }

        @Test
        @DisplayName("classify 工厂携带 errorBody 原始响应体")
        void testClassifyFactoryBodyPreserved() {
            String body = "{\"error\":{\"message\":\"boom\",\"type\":\"api_error\"}}";
            LlmApiException exception = LlmApiException.classify("openai", 500, body);
            
            assertEquals(body, exception.getErrorBody());
            assertEquals("SERVER_ERROR", exception.getErrorCode());
        }

        @Test
        @DisplayName("负数状态码自动修正为0")
        void testNegativeStatusCode() {
            LlmApiException exception = new LlmApiException("错误", -1);
            
            assertEquals(0, exception.getStatusCode());
        }

        @ParameterizedTest
        @ValueSource(ints = {400, 401, 403, 404, 422, 499})
        @DisplayName("isClientError - 4xx状态码")
        void testIsClientError(int statusCode) {
            LlmApiException exception = new LlmApiException("错误", statusCode);
            
            assertTrue(exception.isClientError());
            assertFalse(exception.isServerError());
        }

        @ParameterizedTest
        @ValueSource(ints = {500, 502, 503, 504, 599})
        @DisplayName("isServerError - 5xx状态码")
        void testIsServerError(int statusCode) {
            LlmApiException exception = new LlmApiException("错误", statusCode);
            
            assertTrue(exception.isServerError());
            assertFalse(exception.isClientError());
        }

        @Test
        @DisplayName("isRateLimited - 429状态码")
        void testIsRateLimited() {
            LlmApiException rateLimited = new LlmApiException("限流", 429);
            LlmApiException other = new LlmApiException("其他", 500);
            
            assertTrue(rateLimited.isRateLimited());
            assertFalse(other.isRateLimited());
        }

        @Test
        @DisplayName("isAuthenticationError - 401和403状态码")
        void testIsAuthenticationError() {
            LlmApiException unauthorized = new LlmApiException("未授权", 401);
            LlmApiException forbidden = new LlmApiException("禁止访问", 403);
            LlmApiException other = new LlmApiException("其他", 500);
            
            assertTrue(unauthorized.isAuthenticationError());
            assertTrue(forbidden.isAuthenticationError());
            assertFalse(other.isAuthenticationError());
        }

        @ParameterizedTest
        @ValueSource(ints = {100, 200, 300, 400, 500, 599})
        @DisplayName("isValidStatusCode - 有效状态码")
        void testIsValidStatusCode(int statusCode) {
            LlmApiException exception = new LlmApiException("错误", statusCode);
            
            assertTrue(exception.isValidStatusCode());
        }

        @ParameterizedTest
        @ValueSource(ints = {0, 99, 600, -1})
        @DisplayName("isValidStatusCode - 无效状态码")
        void testIsInvalidStatusCode(int statusCode) {
            LlmApiException exception = new LlmApiException("错误", statusCode < 0 ? 0 : statusCode);
            
            if (statusCode < 0) {
                assertEquals(0, exception.getStatusCode());
            }
            assertFalse(exception.isValidStatusCode());
        }
    }

    @Nested
    @DisplayName("LlmTimeoutException测试")
    class LlmTimeoutExceptionTests {

        @Test
        @DisplayName("带超时时间构造")
        void testConstructorWithTimeout() {
            LlmTimeoutException exception = new LlmTimeoutException("请求超时", 30);
            
            assertEquals("请求超时", exception.getMessage());
            assertEquals(30, exception.getTimeoutSeconds());
        }

        @Test
        @DisplayName("带超时时间和原因构造")
        void testConstructorWithTimeoutAndCause() {
            Throwable cause = new RuntimeException("网络超时");
            LlmTimeoutException exception = new LlmTimeoutException("请求超时", 60, cause);
            
            assertEquals("请求超时", exception.getMessage());
            assertEquals(60, exception.getTimeoutSeconds());
            assertEquals(cause, exception.getCause());
        }

        @Test
        @DisplayName("零超时时间")
        void testZeroTimeout() {
            LlmTimeoutException exception = new LlmTimeoutException("立即超时", 0);
            
            assertEquals(0, exception.getTimeoutSeconds());
        }
    }

    @Nested
    @DisplayName("LlmConnectionException测试")
    class LlmConnectionExceptionTests {

        @Test
        @DisplayName("带baseUrl构造")
        void testConstructorWithBaseUrl() {
            LlmConnectionException exception = new LlmConnectionException("连接失败", "https://api.example.com");
            
            assertEquals("连接失败", exception.getMessage());
            assertEquals("https://api.example.com", exception.getBaseUrl());
        }

        @Test
        @DisplayName("带baseUrl和原因构造")
        void testConstructorWithBaseUrlAndCause() {
            Throwable cause = new RuntimeException("网络不可达");
            LlmConnectionException exception = new LlmConnectionException("连接失败", "https://api.example.com", cause);
            
            assertEquals("连接失败", exception.getMessage());
            assertEquals("https://api.example.com", exception.getBaseUrl());
            assertEquals(cause, exception.getCause());
        }

        @Test
        @DisplayName("null baseUrl")
        void testNullBaseUrl() {
            LlmConnectionException exception = new LlmConnectionException("连接失败", null);
            
            assertNull(exception.getBaseUrl());
        }

        @Test
        @DisplayName("空baseUrl")
        void testEmptyBaseUrl() {
            LlmConnectionException exception = new LlmConnectionException("连接失败", "");
            
            assertEquals("", exception.getBaseUrl());
        }
    }

    @Nested
    @DisplayName("异常继承关系测试")
    class ExceptionHierarchyTests {

        @Test
        @DisplayName("LlmApiException是LlmException子类")
        void testLlmApiExceptionIsSubclass() {
            LlmException exception = new LlmApiException("API错误", 500);
            
            assertTrue(exception instanceof LlmException);
        }

        @Test
        @DisplayName("LlmTimeoutException是LlmException子类")
        void testLlmTimeoutExceptionIsSubclass() {
            LlmException exception = new LlmTimeoutException("超时", 30);
            
            assertTrue(exception instanceof LlmException);
        }

        @Test
        @DisplayName("LlmConnectionException是LlmException子类")
        void testLlmConnectionExceptionIsSubclass() {
            LlmException exception = new LlmConnectionException("连接失败", "http://test.com");
            
            assertTrue(exception instanceof LlmException);
        }
    }
}
