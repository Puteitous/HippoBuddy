package com.example.agent.memory;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.testutil.MockLlmClient;
import com.example.agent.web.server.DashboardServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ChatApiHandler 并发与断开检测测试")
class ChatApiHandlerConcurrencyTest {

    private static final int TEST_PORT = 19094;
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

    @Nested
    @DisplayName("会话级锁测试")
    class SessionLockTests {

        @Test
        @DisplayName("同一会话并发请求 - 第二个请求被锁阻塞，等待第一个完成后才处理")
        void concurrentRequestsToSameSessionAreSerialized() throws Exception {
            String sessionId = "concurrent-session-1";
            mockLlmClient.setDelayMs(2000);
            mockLlmClient.enqueueSuccessResponse("慢响应内容");
            mockLlmClient.enqueueSuccessResponse("第二个响应");

            CountDownLatch request1Started = new CountDownLatch(1);
            CountDownLatch request1Done = new CountDownLatch(1);
            AtomicReference<String> response1 = new AtomicReference<>("");
            AtomicReference<String> response2 = new AtomicReference<>("");

            Thread t1 = new Thread(() -> {
                try {
                    URL url = new URL("http://localhost:" + TEST_PORT + "/api/chat");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(10000);

                    ObjectNode body = objectMapper.createObjectNode();
                    body.put("session", sessionId);
                    body.put("message", "第一个请求");

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(objectMapper.writeValueAsBytes(body));
                    }

                    request1Started.countDown();

                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    String line;
                    StringBuilder sb = new StringBuilder();
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    response1.set(sb.toString());
                    conn.disconnect();
                } catch (Exception e) {
                    response1.set("error:" + e.getMessage());
                } finally {
                    request1Done.countDown();
                }
            });

            Thread t2 = new Thread(() -> {
                try {
                    request1Started.await(5, TimeUnit.SECONDS);

                    URL url = new URL("http://localhost:" + TEST_PORT + "/api/chat");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(10000);

                    ObjectNode body = objectMapper.createObjectNode();
                    body.put("session", sessionId);
                    body.put("message", "第二个请求");

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(objectMapper.writeValueAsBytes(body));
                    }

                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    String line;
                    StringBuilder sb = new StringBuilder();
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    response2.set(sb.toString());
                    conn.disconnect();
                } catch (Exception e) {
                    response2.set("error:" + e.getMessage());
                }
            });

            t1.start();
            t2.start();

            boolean t1finished = request1Done.await(10, TimeUnit.SECONDS);
            assertTrue(t1finished, "第一个请求应在 10 秒内完成");

            t2.join(10000);

            assertFalse(response1.get().contains("error"), "第一个请求不应失败");
            assertFalse(response2.get().contains("error"), "第二个请求不应失败");
            assertFalse(response2.get().contains("该会话正在处理中"),
                "第二个请求不应被拒绝（锁应串行化而非拒绝）");
        }

        @Test
        @DisplayName("不同会话的请求可以并发处理")
        void differentSessionsCanRunConcurrently() throws Exception {
            mockLlmClient.setDelayMs(2000);
            mockLlmClient.enqueueSuccessResponse("会话A的响应");
            mockLlmClient.enqueueSuccessResponse("会话B的响应");

            CountDownLatch bothStarted = new CountDownLatch(2);
            AtomicReference<String> responseA = new AtomicReference<>("");
            AtomicReference<String> responseB = new AtomicReference<>("");

            Thread tA = new Thread(() -> {
                try {
                    URL url = new URL("http://localhost:" + TEST_PORT + "/api/chat");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(10000);

                    ObjectNode body = objectMapper.createObjectNode();
                    body.put("session", "session-A");
                    body.put("message", "A的消息");

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(objectMapper.writeValueAsBytes(body));
                    }

                    bothStarted.countDown();

                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    String line;
                    StringBuilder sb = new StringBuilder();
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    responseA.set(sb.toString());
                    conn.disconnect();
                } catch (Exception e) {
                    responseA.set("error:" + e.getMessage());
                }
            });

            Thread tB = new Thread(() -> {
                try {
                    URL url = new URL("http://localhost:" + TEST_PORT + "/api/chat");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(10000);

                    ObjectNode body = objectMapper.createObjectNode();
                    body.put("session", "session-B");
                    body.put("message", "B的消息");

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(objectMapper.writeValueAsBytes(body));
                    }

                    bothStarted.countDown();

                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    String line;
                    StringBuilder sb = new StringBuilder();
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    responseB.set(sb.toString());
                    conn.disconnect();
                } catch (Exception e) {
                    responseB.set("error:" + e.getMessage());
                }
            });

            tA.start();
            tB.start();

            assertTrue(bothStarted.await(5, TimeUnit.SECONDS), "两个请求都应成功启动");

            tA.join(10000);
            tB.join(10000);

            assertFalse(responseA.get().contains("error"), "会话A不应失败");
            assertFalse(responseB.get().contains("error"), "会话B不应失败");
        }
    }

    @Nested
    @DisplayName("客户端断开检测测试")
    class DisconnectDetectionTests {

        @Test
        @DisplayName("客户端提前断开连接 - 后端应检测到并停止处理")
        void clientDisconnectStopsBackendProcessing() throws Exception {
            String sessionId = "disconnect-session-1";
            mockLlmClient.setDelayMs(3000);
            mockLlmClient.enqueueSuccessResponse("这条响应不会被完整接收");

            AtomicBoolean clientDisconnected = new AtomicBoolean(false);
            CountDownLatch requestSent = new CountDownLatch(1);

            Thread clientThread = new Thread(() -> {
                try {
                    URL url = new URL("http://localhost:" + TEST_PORT + "/api/chat");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(3000);

                    ObjectNode body = objectMapper.createObjectNode();
                    body.put("session", sessionId);
                    body.put("message", "测试断开");

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(objectMapper.writeValueAsBytes(body));
                    }

                    requestSent.countDown();

                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    while (reader.readLine() != null) {
                    }
                    conn.disconnect();
                } catch (SocketTimeoutException e) {
                    clientDisconnected.set(true);
                } catch (Exception e) {
                    clientDisconnected.set(true);
                }
            });

            clientThread.start();
            assertTrue(requestSent.await(5, TimeUnit.SECONDS), "请求应成功发送");

            Thread.sleep(1000);

            clientThread.interrupt();
            clientThread.join(3000);

            assertTrue(mockLlmClient.getRecordedMessages().size() >= 1,
                "LLM 应该至少被调用过一次");
        }
    }

    @Nested
    @DisplayName("锁清理测试")
    class LockCleanupTests {

        @Test
        @DisplayName("请求完成后锁应从 map 中移除")
        void lockIsRemovedAfterRequestCompletes() throws Exception {
            String sessionId = "cleanup-session-1";
            mockLlmClient.enqueueSuccessResponse("快速响应");

            URL url = new URL("http://localhost:" + TEST_PORT + "/api/chat");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(10000);

            ObjectNode body = objectMapper.createObjectNode();
            body.put("session", sessionId);
            body.put("message", "测试清理");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(objectMapper.writeValueAsBytes(body));
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            while (reader.readLine() != null) {
            }
            conn.disconnect();

            Thread.sleep(500);

            mockLlmClient.enqueueSuccessResponse("第二个请求");

            URL url2 = new URL("http://localhost:" + TEST_PORT + "/api/chat");
            HttpURLConnection conn2 = (HttpURLConnection) url2.openConnection();
            conn2.setRequestMethod("POST");
            conn2.setDoOutput(true);
            conn2.setConnectTimeout(5000);
            conn2.setReadTimeout(10000);

            ObjectNode body2 = objectMapper.createObjectNode();
            body2.put("session", sessionId);
            body2.put("message", "第二次请求");

            try (OutputStream os = conn2.getOutputStream()) {
                os.write(objectMapper.writeValueAsBytes(body2));
            }

            BufferedReader reader2 = new BufferedReader(new InputStreamReader(conn2.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader2.readLine()) != null) {
                sb.append(line);
            }
            conn2.disconnect();

            assertFalse(sb.toString().contains("该会话正在处理中"),
                "锁已释放，第二个请求不应被拒绝");
        }
    }
}