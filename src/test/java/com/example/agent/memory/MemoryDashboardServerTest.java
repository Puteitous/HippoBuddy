package com.example.agent.memory;

import com.example.agent.web.server.DashboardServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class MemoryDashboardServerTest {

    private static final int TEST_PORT = 19090;

    @BeforeEach
    void setUp() throws InterruptedException {
        DashboardServer.start(TEST_PORT);
        Thread.sleep(500);
    }

    @AfterEach
    void tearDown() {
        DashboardServer.stop();
    }

    @Test
    void testServerStartsAndAcceptsConnections() throws Exception {
        URL url = new URL("http://localhost:" + TEST_PORT + "/sse/memory-events");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(2000);
        conn.setRequestProperty("Accept", "text/event-stream");

        assertEquals(200, conn.getResponseCode());
        assertEquals("text/event-stream", conn.getContentType());
        
        conn.disconnect();
    }

    @Test
    void testBroadcastReachesConnectedClient() throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> receivedData = new AtomicReference<>();

        Thread clientThread = new Thread(() -> {
            try {
                URL url = new URL("http://localhost:" + TEST_PORT + "/sse/memory-events");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(2000);
                conn.setReadTimeout(5000);

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
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
                            latch.countDown();
                            break;
                        }
                        eventType = null;
                        data = null;
                    }
                }

                conn.disconnect();
            } catch (Exception e) {
                e.printStackTrace();
            }
        });

        clientThread.start();
        Thread.sleep(500);

        DashboardServer.broadcast("memory_saved", "{\"id\":\"test-123\",\"type\":\"USER_PREFERENCE\",\"tags\":[\"test\"]}");

        assertTrue(latch.await(3, TimeUnit.SECONDS), "Should receive broadcast message within 3 seconds");
        assertNotNull(receivedData.get());
        assertTrue(receivedData.get().contains("test-123"));
        assertTrue(receivedData.get().contains("USER_PREFERENCE"));

        clientThread.join(1000);
    }

    @Test
    void testStaticFileServing() throws Exception {
        URL url = new URL("http://localhost:" + TEST_PORT + "/");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(2000);
        conn.setReadTimeout(2000);

        assertEquals(200, conn.getResponseCode());
        assertTrue(conn.getContentType().contains("text/html"));

        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder content = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            content.append(line);
        }

        assertTrue(content.toString().contains("Hippo Memory"));
        
        conn.disconnect();
    }

    @Test
    void testClientCountTracking() throws Exception {
        assertEquals(0, DashboardServer.getClientCount());

        Thread clientThread = new Thread(() -> {
            try {
                URL url = new URL("http://localhost:" + TEST_PORT + "/sse/memory-events");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(2000);
                conn.setReadTimeout(2000);
                conn.getInputStream().read();
                conn.disconnect();
            } catch (Exception e) {
            }
        });

        clientThread.start();
        Thread.sleep(500);

        assertTrue(DashboardServer.getClientCount() >= 1);

        clientThread.join(1000);
        
        // 等待异步清理完成
        for (int i = 0; i < 5; i++) {
            if (DashboardServer.getClientCount() == 0) {
                break;
            }
            Thread.sleep(200);
        }

        assertEquals(0, DashboardServer.getClientCount());
    }
}
