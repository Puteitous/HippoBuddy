package com.example.agent.memory;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.testutil.MockLlmClient;
import com.example.agent.testutil.LlmResponseBuilder;
import com.example.agent.web.server.DashboardServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class ChatApiHandlerTest {

    private static final int TEST_PORT = 19092;
    private MockLlmClient mockLlmClient;
    private ConversationService conversationService;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() throws InterruptedException {
        mockLlmClient = new MockLlmClient();
        TokenEstimator tokenEstimator = TokenEstimatorFactory.getDefault();
        conversationService = new ConversationService(tokenEstimator, mockLlmClient);
        objectMapper = new ObjectMapper();

        ServiceLocator.registerSingleton(LlmClient.class, mockLlmClient);
        ServiceLocator.registerSingleton(ConversationService.class, conversationService);

        DashboardServer.start(TEST_PORT);
        Thread.sleep(500);
    }

    @AfterEach
    void tearDown() {
        DashboardServer.stop();
        ServiceLocator.clear();
    }

    @Test
    void testChatApiReturnsStreamResponse() throws Exception {
        mockLlmClient.enqueueSuccessResponse("Hello, I am Hippo!");

        CountDownLatch doneLatch = new CountDownLatch(1);
        AtomicReference<StringBuilder> responseContent = new AtomicReference<>(new StringBuilder());
        AtomicBoolean clientRunning = new AtomicBoolean(true);

        Thread clientThread = new Thread(() -> {
            try {
                URL url = new URL("http://localhost:" + TEST_PORT + "/api/chat");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(10000);

                ObjectNode requestBody = objectMapper.createObjectNode();
                requestBody.put("session", "test-session-1");
                requestBody.put("message", "你好");

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(objectMapper.writeValueAsBytes(requestBody));
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                String line;
                String eventType = null;
                String data = null;

                while (clientRunning.get() && (line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        data = line.substring(5).trim();
                    } else if (line.isEmpty() && eventType != null && data != null) {
                        if ("message".equals(eventType)) {
                            try {
                                var json = objectMapper.readTree(data);
                                if (json.has("content")) {
                                    responseContent.get().append(json.get("content").asText());
                                }
                            } catch (Exception e) {
                            }
                        } else if ("done".equals(eventType)) {
                            doneLatch.countDown();
                            break;
                        }
                        eventType = null;
                        data = null;
                    }
                }

                conn.disconnect();
            } catch (Exception e) {
                System.err.println("客户端异常: " + e.getMessage());
            }
        });

        clientThread.start();
        assertTrue(doneLatch.await(10, TimeUnit.SECONDS), "应该在 10 秒内收到完成信号");

        clientRunning.set(false);
        clientThread.join(1000);

        String fullResponse = responseContent.get().toString();
        System.out.println("收到的回复: " + fullResponse);
        assertFalse(fullResponse.isEmpty(), "应该收到非空回复");
    }

    @Test
    void testChatApiRejectsEmptyMessage() throws Exception {
        CountDownLatch doneLatch = new CountDownLatch(1);
        AtomicReference<String> errorContent = new AtomicReference<>();
        AtomicBoolean clientRunning = new AtomicBoolean(true);

        Thread clientThread = new Thread(() -> {
            try {
                URL url = new URL("http://localhost:" + TEST_PORT + "/api/chat");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(10000);

                ObjectNode requestBody = objectMapper.createObjectNode();
                requestBody.put("session", "test-session-2");
                requestBody.put("message", "");

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(objectMapper.writeValueAsBytes(requestBody));
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                String line;
                String eventType = null;
                String data = null;

                while (clientRunning.get() && (line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        data = line.substring(5).trim();
                    } else if (line.isEmpty() && eventType != null && data != null) {
                        if ("error".equals(eventType)) {
                            errorContent.set(data);
                            doneLatch.countDown();
                            break;
                        }
                        eventType = null;
                        data = null;
                    }
                }

                conn.disconnect();
            } catch (Exception e) {
            }
        });

        clientThread.start();
        assertTrue(doneLatch.await(5, TimeUnit.SECONDS), "应该收到错误信号");
        assertNotNull(errorContent.get());
        assertTrue(errorContent.get().contains("消息不能为空"));

        clientRunning.set(false);
        clientThread.join(1000);
    }
}
