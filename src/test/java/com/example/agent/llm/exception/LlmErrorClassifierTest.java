package com.example.agent.llm.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * LlmErrorClassifier 归一化分类测试。
 * 覆盖各厂商典型错误响应：DeepSeek / OpenAI / Anthropic / Ollama / 通用 HTTP。
 */
class LlmErrorClassifierTest {

    @Nested
    @DisplayName("厂商特有错误码")
    class ProviderSpecificTests {

        @Test
        @DisplayName("DeepSeek 402 → 余额不足")
        void deepseek402() {
            LlmError err = LlmErrorClassifier.classify("deepseek", 402,
                    "{\"error\":{\"message\":\"Insufficient Balance\",\"type\":\"insufficient_balance\",\"code\":\"402\"}}");
            assertEquals("INSUFFICIENT_BALANCE", err.getCode());
            assertTrue(err.getMessage().contains("余额不足"));
        }

        @Test
        @DisplayName("Anthropic 529 → 服务繁忙")
        void anthropic529() {
            LlmError err = LlmErrorClassifier.classify("anthropic", 529,
                    "{\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}");
            assertEquals("SERVER_BUSY", err.getCode());
        }

        @Test
        @DisplayName("Anthropic 400 + insufficient_quota → 余额不足（type 优先）")
        void anthropic400InsufficientQuota() {
            LlmError err = LlmErrorClassifier.classify("anthropic", 400,
                    "{\"type\":\"error\",\"error\":{\"type\":\"insufficient_quota\",\"message\":\"Credit balance is too low\"}}");
            assertEquals("INSUFFICIENT_BALANCE", err.getCode());
        }
    }

    @Nested
    @DisplayName("结构化 error.type 分类（OpenAI 兼容系最准信号）")
    class BodyTypeTests {

        @Test
        @DisplayName("OpenAI 429 + insufficient_quota → 余额不足（非限流）")
        void openai429InsufficientQuota() {
            LlmError err = LlmErrorClassifier.classify("openai", 429,
                    "{\"error\":{\"message\":\"You exceeded your current quota\",\"type\":\"insufficient_quota\"}}");
            assertEquals("INSUFFICIENT_BALANCE", err.getCode());
        }

        @Test
        @DisplayName("OpenAI 429 + rate_limit_exceeded → 限流")
        void openai429RateLimit() {
            LlmError err = LlmErrorClassifier.classify("openai", 429,
                    "{\"error\":{\"message\":\"Rate limit reached\",\"type\":\"rate_limit_exceeded\"}}");
            assertEquals("RATE_LIMITED", err.getCode());
        }

        @Test
        @DisplayName("context_length_exceeded → 上下文超长")
        void contextLengthExceeded() {
            LlmError err = LlmErrorClassifier.classify("openai", 400,
                    "{\"error\":{\"message\":\"This model's maximum context length is 128000 tokens\",\"type\":\"context_length_exceeded\"}}");
            assertEquals("CONTEXT_LENGTH_EXCEEDED", err.getCode());
        }

        @Test
        @DisplayName("authentication_error → 认证失败")
        void authenticationError() {
            LlmError err = LlmErrorClassifier.classify("anthropic", 401,
                    "{\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",\"message\":\"invalid x-api-key\"}}");
            assertEquals("AUTH_FAILED", err.getCode());
        }

        @Test
        @DisplayName("invalid_request_error → 请求参数错误")
        void invalidRequestError() {
            LlmError err = LlmErrorClassifier.classify("anthropic", 400,
                    "{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"bad request\"}}");
            assertEquals("INVALID_REQUEST", err.getCode());
        }

        @Test
        @DisplayName("detail 提取 error.message")
        void detailExtracted() {
            LlmError err = LlmErrorClassifier.classify("openai", 429,
                    "{\"error\":{\"message\":\"Rate limit reached\",\"type\":\"rate_limit_exceeded\"}}");
            assertEquals("Rate limit reached", err.getDetail());
        }
    }

    @Nested
    @DisplayName("文本关键词兜底（Ollama 等无结构化 type）")
    class TextFallbackTests {

        @Test
        @DisplayName("Ollama model not found → 模型不存在")
        void ollamaModelNotFound() {
            LlmError err = LlmErrorClassifier.classify("ollama", 404, "{\"error\":\"model 'xxx' not found\"}");
            assertEquals("MODEL_NOT_FOUND", err.getCode());
        }

        @Test
        @DisplayName("connection refused → 网络错误")
        void connectionRefused() {
            LlmError err = LlmErrorClassifier.classify("ollama", 0, "Failed to connect to localhost:11434 - connection refused");
            assertEquals("NETWORK_ERROR", err.getCode());
        }

        @Test
        @DisplayName("context window 文本 → 上下文超长")
        void contextWindowText() {
            LlmError err = LlmErrorClassifier.classify("ollama", 400, "{\"error\":\"prompt too long, max context window is 8192\"}");
            assertEquals("CONTEXT_LENGTH_EXCEEDED", err.getCode());
        }
    }

    @Nested
    @DisplayName("通用 HTTP 状态码兜底")
    class StatusCodeFallbackTests {

        @Test
        @DisplayName("401 → 认证失败")
        void status401() {
            assertEquals("AUTH_FAILED", LlmErrorClassifier.classify("openai", 401, null).getCode());
        }

        @Test
        @DisplayName("403 → 认证失败")
        void status403() {
            assertEquals("AUTH_FAILED", LlmErrorClassifier.classify("openai", 403, null).getCode());
        }

        @Test
        @DisplayName("404 → 模型不存在")
        void status404() {
            assertEquals("MODEL_NOT_FOUND", LlmErrorClassifier.classify("openai", 404, null).getCode());
        }

        @Test
        @DisplayName("429（无 body）→ 限流")
        void status429() {
            assertEquals("RATE_LIMITED", LlmErrorClassifier.classify("openai", 429, null).getCode());
        }

        @Test
        @DisplayName("500 → 服务器错误")
        void status500() {
            assertEquals("SERVER_ERROR", LlmErrorClassifier.classify("openai", 500, null).getCode());
        }

        @Test
        @DisplayName("503 → 服务繁忙")
        void status503() {
            assertEquals("SERVER_BUSY", LlmErrorClassifier.classify("openai", 503, null).getCode());
        }

        @Test
        @DisplayName("422 → 请求参数错误")
        void status422() {
            assertEquals("INVALID_REQUEST", LlmErrorClassifier.classify("openai", 422, null).getCode());
        }

        @Test
        @DisplayName("未知状态码 + 非法 body → UNKNOWN")
        void unknownStatus() {
            LlmError err = LlmErrorClassifier.classify("openai", 418, "not json at all");
            assertEquals("UNKNOWN", err.getCode());
        }
    }

    @Nested
    @DisplayName("便捷工厂方法与 LlmApiException 集成")
    class ConvenienceAndIntegrationTests {

        @Test
        @DisplayName("connectionError → NETWORK_ERROR")
        void connectionError() {
            LlmError err = LlmErrorClassifier.connectionError("无法连接到 API 服务器");
            assertEquals("NETWORK_ERROR", err.getCode());
            assertTrue(err.getMessage().contains("无法连接"));
        }

        @Test
        @DisplayName("timeoutError → TIMEOUT")
        void timeoutError() {
            LlmError err = LlmErrorClassifier.timeoutError("请求超时");
            assertEquals("TIMEOUT", err.getCode());
        }

        @Test
        @DisplayName("emptyResponse → EMPTY_RESPONSE")
        void emptyResponse() {
            assertEquals("EMPTY_RESPONSE", LlmErrorClassifier.emptyResponse().getCode());
        }

        @Test
        @DisplayName("responseLengthExceeded → RESPONSE_LENGTH_EXCEEDED")
        void responseLengthExceeded() {
            assertEquals("RESPONSE_LENGTH_EXCEEDED", LlmErrorClassifier.responseLengthExceeded().getCode());
        }

        @Test
        @DisplayName("LlmApiException.classify 携带 errorCode 与友好 message")
        void llmApiExceptionClassify() {
            LlmApiException ex = LlmApiException.classify("deepseek", 402,
                    "{\"error\":{\"message\":\"Insufficient Balance\",\"type\":\"insufficient_balance\"}}");
            assertEquals("INSUFFICIENT_BALANCE", ex.getErrorCode());
            assertTrue(ex.getMessage().contains("余额不足"));
            assertEquals("Insufficient Balance", ex.getDetail());
            assertEquals(402, ex.getStatusCode());
        }

        @Test
        @DisplayName("LlmTimeoutException / LlmConnectionException 携带错误码")
        void exceptionSubclassesCarryCode() {
            LlmTimeoutException timeout = new LlmTimeoutException("超时", 30);
            assertEquals("TIMEOUT", timeout.getErrorCode());

            LlmConnectionException conn = new LlmConnectionException("连接失败", "http://x");
            assertEquals("NETWORK_ERROR", conn.getErrorCode());
        }
    }
}
