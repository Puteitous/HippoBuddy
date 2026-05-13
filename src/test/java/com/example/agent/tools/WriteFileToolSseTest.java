package com.example.agent.tools;

import com.example.agent.web.server.DashboardServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class WriteFileToolSseTest {

    private static final int TEST_PORT = 19091;
    private WriteFileTool writeFileTool;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() throws InterruptedException {
        writeFileTool = new WriteFileTool();
        objectMapper = new ObjectMapper();
        DashboardServer.start(TEST_PORT, false);
        // 等待服务器启动
        Thread.sleep(500);
    }

    @AfterEach
    void tearDown() {
        DashboardServer.stop();
    }

    @Test
    void testMemoryFileWriteTriggersSseBroadcast() throws Exception {
        CountDownLatch clientConnected = new CountDownLatch(1);
        CountDownLatch messageReceived = new CountDownLatch(1);
        AtomicReference<String> receivedData = new AtomicReference<>();
        AtomicBoolean clientRunning = new AtomicBoolean(true);

        Thread clientThread = new Thread(() -> {
            try {
                URL url = new URL("http://localhost:" + TEST_PORT + "/sse/memory-events");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(10000);

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                System.out.println("SSE 客户端已连接");
                clientConnected.countDown();

                String line;
                String eventType = null;
                String data = null;

                while (clientRunning.get() && (line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        data = line.substring(5).trim();
                    } else if (line.isEmpty() && eventType != null && data != null) {
                        System.out.println("收到事件: " + eventType + ", 数据: " + data);
                        if ("memory_saved".equals(eventType)) {
                            receivedData.set(data);
                            messageReceived.countDown();
                            break;
                        }
                        eventType = null;
                        data = null;
                    }
                }

                conn.disconnect();
            } catch (Exception e) {
                System.err.println("SSE 客户端异常: " + e.getMessage());
            }
        });

        clientThread.start();
        // 等待客户端连接成功
        assertTrue(clientConnected.await(5, TimeUnit.SECONDS), "客户端应该在 5 秒内连接");
        Thread.sleep(500);
        System.out.println("当前客户端数: " + DashboardServer.getClientCount());
        assertTrue(DashboardServer.getClientCount() > 0, "应该有至少一个客户端");

        // 写入记忆文件（使用正确的命名格式：type_topic.md）
        String memoryFilePath = ".hippo/memory/user_preference_test_" + System.currentTimeMillis() + ".md";
        Path memoryFile = Path.of(memoryFilePath);
        memoryFile.toFile().getParentFile().mkdirs();

        ObjectNode arguments = objectMapper.createObjectNode();
        arguments.put("path", memoryFilePath);
        arguments.put("content", "---\ntype: user_preference\n---\n\n我喜欢用 React");

        String result = writeFileTool.execute(arguments);
        System.out.println("WriteFileTool 执行结果: " + result);

        // 等待 SSE 广播
        boolean received = messageReceived.await(5, TimeUnit.SECONDS);
        System.out.println("收到 SSE 广播: " + received);
        System.out.println("收到的数据: " + receivedData.get());
        
        assertTrue(received, "应该在 5 秒内收到 SSE 广播");
        assertNotNull(receivedData.get());
        assertTrue(receivedData.get().contains("user"));

        // 等待 5 秒，方便打开浏览器观察
        System.out.println("等待 5 秒，可以打开浏览器 http://localhost:" + TEST_PORT + " 观察");
        Thread.sleep(5000);

        // 清理
        clientRunning.set(false);
        Files.deleteIfExists(memoryFile);
        clientThread.join(1000);
    }

    @Test
    void testNonMemoryFileDoesNotTriggerSse() throws Exception {
        CountDownLatch clientConnected = new CountDownLatch(1);
        AtomicBoolean messageReceived = new AtomicBoolean(false);
        AtomicBoolean clientRunning = new AtomicBoolean(true);

        Thread clientThread = new Thread(() -> {
            try {
                URL url = new URL("http://localhost:" + TEST_PORT + "/sse/memory-events");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(10000);

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                clientConnected.countDown();

                String line;
                String eventType = null;
                String data = null;

                while (clientRunning.get() && (line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        data = line.substring(5).trim();
                    } else if (line.isEmpty() && eventType != null && data != null) {
                        if ("memory_saved".equals(eventType)) {
                            messageReceived.set(true);
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
        assertTrue(clientConnected.await(5, TimeUnit.SECONDS), "客户端应该连接");
        Thread.sleep(500);

        // 写入非记忆文件
        String regularFilePath = "test_" + System.currentTimeMillis() + ".txt";
        ObjectNode arguments = objectMapper.createObjectNode();
        arguments.put("path", regularFilePath);
        arguments.put("content", "这是普通文件");

        String result = writeFileTool.execute(arguments);
        System.out.println("WriteFileTool 执行结果: " + result);

        // 等待 3 秒，不应该收到广播
        Thread.sleep(3000);
        assertFalse(messageReceived.get(), "不应该收到 SSE 广播");

        // 清理
        clientRunning.set(false);
        Files.deleteIfExists(Path.of(regularFilePath));
        clientThread.join(1000);
    }
}
