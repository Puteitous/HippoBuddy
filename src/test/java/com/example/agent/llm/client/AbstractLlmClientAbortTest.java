package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.llm.exception.LlmApiException;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.llm.retry.RetryPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DisplayName("AbstractLlmClient abort 机制单元测试")
class AbstractLlmClientAbortTest {

    private Config config;
    private TestableClient client;
    private LlmConfig llmConfig;

    @BeforeEach
    void setUp() {
        config = mock(Config.class);
        llmConfig = mock(LlmConfig.class);
        when(config.getLlm()).thenReturn(llmConfig);
        when(llmConfig.getApiKey()).thenReturn("test-api-key");
        when(llmConfig.getBaseUrl()).thenReturn("https://api.test.com");
        when(llmConfig.getModel()).thenReturn("test-model");
        when(llmConfig.getMaxTokens()).thenReturn(2048);

        client = new TestableClient(config);
    }

    @AfterEach
    void tearDown() {
        client.cleanupThreadLocals();
    }

    private HttpResponse<InputStream> mockResponse(int statusCode, InputStream body) {
        @SuppressWarnings("unchecked")
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(statusCode);
        when(response.body()).thenReturn(body);
        return response;
    }

    private String sseChunk(String content) {
        return "data: {\"choices\":[{\"delta\":{\"content\":\"" + content + "\"}}]}\n\n";
    }

    private String sseReasoningChunk(String reasoning) {
        return "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"" + reasoning + "\"}}]}\n\n";
    }

    private String sseDone() {
        return "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";
    }

    @Nested
    @DisplayName("正常路径")
    class NormalPathTests {

        @Test
        @DisplayName("完整 SSE 数据应解析为 ChatResponse")
        void completeSseData_returnsChatResponse() throws LlmException {
            String sseData = sseChunk("Hello") + sseChunk(" world") + sseDone();
            InputStream input = new ByteArrayInputStream(sseData.getBytes(StandardCharsets.UTF_8));

            ChatResponse response = client.processStreamResponse(mockResponse(200, input), null);

            assertNotNull(response);
            assertEquals("Hello world", response.getContent());
        }

        @Test
        @DisplayName("onChunk 回调应被逐 chunk 调用")
        void onChunkCallback_invokedForEachChunk() throws LlmException {
            String sseData = sseChunk("Hello") + sseChunk(" world") + sseDone();
            InputStream input = new ByteArrayInputStream(sseData.getBytes(StandardCharsets.UTF_8));

            List<String> received = new ArrayList<>();
            Consumer<StreamChunk> onChunk = chunk -> {
                if (chunk.hasContent()) {
                    received.add(chunk.getContent());
                }
            };

            client.processStreamResponse(mockResponse(200, input), onChunk);

            assertEquals(2, received.size());
            assertEquals("Hello", received.get(0));
            assertEquals(" world", received.get(1));
        }

        @Test
        @DisplayName("有 reasoning 时 content 和 reasoning 都应收集")
        void reasoningAndContent_areBothCollected() throws LlmException {
            String sseData = sseReasoningChunk("让我想想") + sseChunk("答案") + sseDone();
            InputStream input = new ByteArrayInputStream(sseData.getBytes(StandardCharsets.UTF_8));

            List<StreamChunk> chunks = new ArrayList<>();
            ChatResponse response = client.processStreamResponse(mockResponse(200, input), chunks::add);

            assertEquals("答案", response.getContent());
            assertEquals("让我想想", response.getMessage().getReasoningContent());
            assertTrue(chunks.size() >= 2);
        }

        @Test
        @DisplayName("null onChunk 不应抛异常")
        void nullOnChunk_doesNotThrow() throws LlmException {
            String sseData = sseChunk("Hello") + sseDone();
            InputStream input = new ByteArrayInputStream(sseData.getBytes(StandardCharsets.UTF_8));

            assertDoesNotThrow(() ->
                client.processStreamResponse(mockResponse(200, input), null));
        }
    }

    @Nested
    @DisplayName("错误路径")
    class ErrorPathTests {

        @Test
        @DisplayName("HTTP 400 应抛出 LlmApiException")
        void http400_throwsLlmApiException() {
            InputStream emptyInput = new ByteArrayInputStream(new byte[0]);

            assertThrows(LlmApiException.class, () ->
                client.processStreamResponse(mockResponse(400, emptyInput), null));
        }

        @Test
        @DisplayName("HTTP 500 应抛出 LlmApiException")
        void http500_throwsLlmApiException() {
            InputStream emptyInput = new ByteArrayInputStream(new byte[0]);

            assertThrows(LlmApiException.class, () ->
                client.processStreamResponse(mockResponse(500, emptyInput), null));
        }
    }

    @Nested
    @DisplayName("abort 路径")
    class AbortPathTests {

        @Test
        @DisplayName("流读取中 abort → 返回已收集的部分响应")
        void abortDuringRead_returnsPartialResponse() throws LlmException {
            String partialData = sseChunk("Partial");
            byte[] dataBytes = partialData.getBytes(StandardCharsets.UTF_8);

            InputStream abortingStream = new InputStream() {
                int pos = 0;
                @Override
                public int read() throws IOException {
                    if (pos >= dataBytes.length) {
                        client.abortCurrentRequest();
                        throw new IOException("Connection reset by abort");
                    }
                    return dataBytes[pos++] & 0xFF;
                }
            };

            ChatResponse response = client.processStreamResponse(
                mockResponse(200, abortingStream), null);

            assertNotNull(response, "abort 后应返回部分响应而非抛异常");
            assertEquals("Partial", response.getContent(),
                "应返回已收集的部分内容");
        }

        @Test
        @DisplayName("abort 后 onChunk 已收到的 chunk 应保留，未收到的跳过")
        void abortAfterPartialContent_onChunkPreservesReceivedChunks() throws LlmException {
            String partialData = sseChunk("Chunk1") + sseChunk("Chunk2");
            byte[] dataBytes = partialData.getBytes(StandardCharsets.UTF_8);

            List<String> received = new ArrayList<>();
            InputStream abortingStream = new InputStream() {
                int pos = 0;
                @Override
                public int read() throws IOException {
                    if (pos >= dataBytes.length) {
                        client.abortCurrentRequest();
                        throw new IOException("Connection reset by abort");
                    }
                    return dataBytes[pos++] & 0xFF;
                }
            };

            ChatResponse response = client.processStreamResponse(
                mockResponse(200, abortingStream), chunk -> {
                    if (chunk.hasContent()) {
                        received.add(chunk.getContent());
                    }
                });

            assertEquals(2, received.size(), "abort 前已收到的 2 个 chunk 都应保留");
            assertEquals("Chunk1", received.get(0));
            assertEquals("Chunk2", received.get(1));
            assertEquals("Chunk1Chunk2", response.getContent(),
                "部分响应的 content 应包含所有已收集内容");
        }

        @Test
        @DisplayName("尚未收到任何 chunk 就 abort → 返回空 content 的部分响应")
        void abortBeforeAnyChunk_returnsEmptyResponse() throws LlmException {
            InputStream abortingStream = new InputStream() {
                @Override
                public int read() throws IOException {
                    client.abortCurrentRequest();
                    throw new IOException("Connection reset");
                }
            };

            ChatResponse response = client.processStreamResponse(
                mockResponse(200, abortingStream), null);

            assertNotNull(response);
            assertTrue(response.getContent() == null || response.getContent().isEmpty(),
                "没有收到任何 chunk 时 content 应为空");
        }
    }

    static class TestableClient extends DashScopeLlmClient {
        public TestableClient(Config config) {
            super(config, RetryPolicy.noRetry());
        }

        @Override
        public ChatResponse processStreamResponse(
                HttpResponse<InputStream> response,
                Consumer<StreamChunk> onChunk) throws LlmException {
            return super.processStreamResponse(response, onChunk);
        }

        public void cleanupThreadLocals() {
            abortCurrentRequest();
        }
    }
}
