package com.example.agent.memory;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.web.server.DashboardServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class MemoryDashboardServerTest {

    private static final int TEST_PORT = 19090;
    private static ExecutorService clientExecutor;
    private Future<?> currentClientFuture;

    @BeforeAll
    static void setUp() {
        LlmClient mockLlmClient = mock(LlmClient.class);
        TokenEstimator tokenEstimator = TokenEstimatorFactory.getDefault();
        ConversationService conversationService = new ConversationService(tokenEstimator, mockLlmClient);

        ServiceLocator.registerSingleton(LlmClient.class, mockLlmClient);
        ServiceLocator.registerSingleton(ToolRegistry.class, new ToolRegistry());
        ServiceLocator.registerSingleton(ConversationService.class, conversationService);

        clientExecutor = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "test-sse-client");
            t.setDaemon(true);
            return t;
        });
        DashboardServer.start(TEST_PORT, false);
    }

    @AfterAll
    static void tearDown() {
        if (clientExecutor != null) {
            clientExecutor.shutdownNow();
        }
        ServiceLocator.clear();
        DashboardServer.stop();
    }

    @AfterEach
    void cleanUp() {
        if (currentClientFuture != null) {
            currentClientFuture.cancel(true);
            currentClientFuture = null;
        }
        DashboardServer.disconnectAllClients();
    }

    @Test
    void testServerStartsAndAcceptsConnections() throws Exception {
        URL url = new URL("http://localhost:" + TEST_PORT + "/sse/memory-events");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(2000);
        conn.setReadTimeout(2000);
        conn.setRequestProperty("Accept", "text/event-stream");

        assertEquals(200, conn.getResponseCode());
        assertEquals("text/event-stream", conn.getContentType());

        conn.disconnect();
    }

    @Test
    void testBroadcastReachesConnectedClient() throws Exception {
        CountDownLatch connectedLatch = new CountDownLatch(1);
        CountDownLatch messageReceivedLatch = new CountDownLatch(1);
        AtomicReference<String> receivedData = new AtomicReference<>();

        currentClientFuture = clientExecutor.submit(() -> {
            try {
                URL url = new URL("http://localhost:" + TEST_PORT + "/sse/memory-events");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(2000);
                conn.setReadTimeout(6000);

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                connectedLatch.countDown();

                String line;
                String eventType = null;
                String data = null;

                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        data = line.substring(5).trim();
                    } else if (line.isEmpty() && eventType != null && data != null) {
                        if ("memory_saved".equals(eventType)) {
                            receivedData.set(data);
                            messageReceivedLatch.countDown();
                            break;
                        }
                        eventType = null;
                        data = null;
                    }
                }

                conn.disconnect();
            } catch (Exception ignored) {
            }
        });

        assertTrue(connectedLatch.await(2, TimeUnit.SECONDS), "SSE client should connect within 2 seconds");

        DashboardServer.broadcast("memory_saved", "{\"id\":\"test-123\",\"type\":\"USER_PREFERENCE\",\"tags\":[\"test\"]}");

        assertTrue(messageReceivedLatch.await(5, TimeUnit.SECONDS), "Should receive broadcast message within 5 seconds");
        assertNotNull(receivedData.get());
        assertTrue(receivedData.get().contains("test-123"));
        assertTrue(receivedData.get().contains("USER_PREFERENCE"));
    }

    @Test
    void testStaticFileServing() throws Exception {
        URL url = new URL("http://localhost:" + TEST_PORT + "/");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(3000);
        conn.setReadTimeout(3000);

        assertEquals(200, conn.getResponseCode());
        String contentType = conn.getContentType();
        assertTrue(contentType != null && contentType.contains("text/html"));

        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder content = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            content.append(line);
        }

        assertTrue(content.length() > 0, "Static file should have content");

        conn.disconnect();
    }

    @Test
    void testClientCountTracking() throws Exception {
        assertEquals(0, DashboardServer.getClientCount());

        CountDownLatch connectedLatch = new CountDownLatch(1);

        currentClientFuture = clientExecutor.submit(() -> {
            try {
                URL url = new URL("http://localhost:" + TEST_PORT + "/sse/memory-events");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(2000);
                conn.setReadTimeout(6000);

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                connectedLatch.countDown();

                try {
                    while (reader.readLine() != null) {
                    }
                } catch (SocketTimeoutException expected) {
                }

                conn.disconnect();
            } catch (Exception ignored) {
            }
        });

        assertTrue(connectedLatch.await(2, TimeUnit.SECONDS), "SSE client should connect within 2 seconds");

        assertTrue(DashboardServer.getClientCount() >= 1, "Client count should be at least 1 after connection");
    }
}
