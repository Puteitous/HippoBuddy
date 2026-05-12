package com.example.agent.web.server;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.memory.MemoryRetriever;
import com.example.agent.testutil.MockLlmClient;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ScheduledExecutorService;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

@DisplayName("DashboardServer 单元测试")
class DashboardServerTest {

    @BeforeEach
    void setUp() throws Exception {
        ServiceLocator.clear();
        ServiceLocator.registerSingleton(LlmClient.class, new MockLlmClient());
        ServiceLocator.registerSingleton(MemoryRetriever.class, mock(MemoryRetriever.class));
        ServiceLocator.registerSingleton(ConversationService.class, mock(ConversationService.class));
        stopAndReset();
    }

    @AfterEach
    void tearDown() throws Exception {
        stopAndReset();
        ServiceLocator.clear();
    }

    @SuppressWarnings("unchecked")
    private void stopAndReset() throws Exception {
        DashboardServer.stop();
        setStaticField(DashboardServer.class, "server", null);
        setStaticField(DashboardServer.class, "executor", null);
        setStaticField(DashboardServer.class, "sessionCleanupScheduler", null);
        CopyOnWriteArrayList<PrintWriter> clients = getStaticField(DashboardServer.class, "clients");
        clients.clear();
    }

    @SuppressWarnings("unchecked")
    private static <T> T getStaticField(Class<?> clazz, String fieldName) throws Exception {
        Field field = clazz.getDeclaredField(fieldName);
        field.setAccessible(true);
        return (T) field.get(null);
    }

    private static void setStaticField(Class<?> clazz, String fieldName, Object value) throws Exception {
        Field field = clazz.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(null, value);
    }

    @Nested
    @DisplayName("start / stop 生命周期")
    class LifecycleTests {

        @Test
        @DisplayName("start 应创建 HttpServer 和 executor")
        void startCreatesServer() throws Exception {
            DashboardServer.start(0);

            assertNotNull(getStaticField(DashboardServer.class, "server"));
            assertNotNull(getStaticField(DashboardServer.class, "executor"));

            DashboardServer.stop();
        }

        @Test
        @DisplayName("重复调用 start 应不替换已有 server")
        void repeatedStartDoesNotReplaceServer() throws Exception {
            DashboardServer.start(0);
            HttpServer firstServer = getStaticField(DashboardServer.class, "server");

            DashboardServer.start(9999);
            HttpServer secondServer = getStaticField(DashboardServer.class, "server");

            assertSame(firstServer, secondServer);

            DashboardServer.stop();
        }

        @Test
        @DisplayName("stop 后所有字段应清空")
        void stopClearsFields() throws Exception {
            DashboardServer.start(0);
            DashboardServer.stop();

            assertNull(getStaticField(DashboardServer.class, "server"));
            assertNull(getStaticField(DashboardServer.class, "executor"));
            assertNull(getStaticField(DashboardServer.class, "sessionCleanupScheduler"));
            CopyOnWriteArrayList<?> clients = getStaticField(DashboardServer.class, "clients");
            assertTrue(clients.isEmpty(), "stop 后 clients 应为空");
        }

        @Test
        @DisplayName("未 start 时 stop 应不抛异常")
        void stopWithoutStartDoesNotThrow() {
            assertDoesNotThrow(() -> DashboardServer.stop());
        }

        @Test
        @DisplayName("start 后应能通过 HTTP 访问 API 端点")
        void serverRespondsToHttp() throws Exception {
            DashboardServer.start(0);
            HttpServer server = getStaticField(DashboardServer.class, "server");
            int port = server.getAddress().getPort();

            URL url = new URL("http://localhost:" + port + "/api/metrics");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            assertEquals(200, conn.getResponseCode());

            conn.disconnect();
            DashboardServer.stop();
        }
    }

    @Nested
    @DisplayName("broadcast SSE 广播")
    class BroadcastTests {

        @Test
        @DisplayName("无客户端时不抛异常")
        void broadcastWithNoClientsDoesNotThrow() {
            assertDoesNotThrow(() -> DashboardServer.broadcast("test", "data"));
        }

        @Test
        @DisplayName("广播应写入正确的 SSE 格式")
        void broadcastWritesCorrectSseFormat() throws Exception {
            StringWriter sw = new StringWriter();
            CopyOnWriteArrayList<PrintWriter> clients = getStaticField(DashboardServer.class, "clients");
            clients.add(new PrintWriter(sw));

            DashboardServer.broadcast("mem_updated", "{\"id\":\"mem-1\"}");

            String output = sw.toString();
            assertTrue(output.contains("event: mem_updated\n"));
            assertTrue(output.contains("data: {\"id\":\"mem-1\"}\n\n"));
        }

        @Test
        @DisplayName("多个客户端都应收到广播")
        void broadcastToMultipleClients() throws Exception {
            StringWriter sw1 = new StringWriter();
            StringWriter sw2 = new StringWriter();
            CopyOnWriteArrayList<PrintWriter> clients = getStaticField(DashboardServer.class, "clients");
            clients.add(new PrintWriter(sw1));
            clients.add(new PrintWriter(sw2));

            DashboardServer.broadcast("connected", "{\"m\":\"hello\"}");

            assertTrue(sw1.toString().contains("event: connected"));
            assertTrue(sw2.toString().contains("event: connected"));
        }
    }

    @Nested
    @DisplayName("getClientCount")
    class ClientCountTests {

        @Test
        @DisplayName("初始为 0")
        void initiallyZero() {
            assertEquals(0, DashboardServer.getClientCount());
        }

        @Test
        @DisplayName("添加客户端后应递增")
        void addingClientsIncreasesCount() throws Exception {
            CopyOnWriteArrayList<PrintWriter> clients = getStaticField(DashboardServer.class, "clients");

            clients.add(new PrintWriter(new StringWriter()));
            assertEquals(1, DashboardServer.getClientCount());

            clients.add(new PrintWriter(new StringWriter()));
            assertEquals(2, DashboardServer.getClientCount());
        }

        @Test
        @DisplayName("清除后应归零")
        void clearingResetsCount() throws Exception {
            CopyOnWriteArrayList<PrintWriter> clients = getStaticField(DashboardServer.class, "clients");
            clients.add(new PrintWriter(new StringWriter()));
            clients.add(new PrintWriter(new StringWriter()));
            assertEquals(2, DashboardServer.getClientCount());

            clients.clear();
            assertEquals(0, DashboardServer.getClientCount());
        }
    }

    @Nested
    @DisplayName("SSE 事件流端点")
    class SseEndpointTests {

        @Test
        @DisplayName("SSE 端点返回 200 和正确响应头")
        void sseEndpointReturnsCorrectHeaders() throws Exception {
            DashboardServer.start(0);
            HttpServer server = getStaticField(DashboardServer.class, "server");
            int port = server.getAddress().getPort();

            URL url = new URL("http://localhost:" + port + "/sse/memory-events");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(2000);

            assertEquals(200, conn.getResponseCode());
            assertEquals("text/event-stream", conn.getHeaderField("Content-Type"));
            assertEquals("no-cache", conn.getHeaderField("Cache-Control"));
            assertEquals("keep-alive", conn.getHeaderField("Connection"));

            conn.disconnect();
            DashboardServer.stop();
        }

        @Test
        @DisplayName("SSE 连接后客户端计数为 1")
        void sseConnectionIncrementsClientCount() throws Exception {
            assertEquals(0, DashboardServer.getClientCount());

            DashboardServer.start(0);
            HttpServer server = getStaticField(DashboardServer.class, "server");
            int port = server.getAddress().getPort();

            URL url = new URL("http://localhost:" + port + "/sse/memory-events");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(500);

            try { conn.getInputStream().read(); } catch (IOException ignored) {}

            assertEquals(1, DashboardServer.getClientCount());

            conn.disconnect();
            DashboardServer.stop();
        }
    }

    @Nested
    @DisplayName("会话清理定时器")
    class SessionCleanupTests {

        @Test
        @DisplayName("start 后应创建会话清理定时器")
        void startCreatesCleanupScheduler() throws Exception {
            DashboardServer.start(0);

            ScheduledExecutorService scheduler = getStaticField(DashboardServer.class, "sessionCleanupScheduler");
            assertNotNull(scheduler);
            assertFalse(scheduler.isShutdown());

            DashboardServer.stop();
        }

        @Test
        @DisplayName("stop 后定时器应为 null")
        void stopCleansUpScheduler() throws Exception {
            DashboardServer.start(0);
            DashboardServer.stop();

            ScheduledExecutorService scheduler = getStaticField(DashboardServer.class, "sessionCleanupScheduler");
            assertNull(scheduler);
        }
    }

    @Nested
    @DisplayName("响应头验证")
    class ResponseHeaderTests {

        @Test
        @DisplayName("API 端点设置正确的 Content-Type 和 CORS 头")
        void apiEndpointSetsCorrectHeaders() throws Exception {
            DashboardServer.start(0);
            HttpServer server = getStaticField(DashboardServer.class, "server");
            int port = server.getAddress().getPort();

            URL url = new URL("http://localhost:" + port + "/api/metrics");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            assertEquals("application/json", conn.getHeaderField("Content-Type"));
            assertEquals("*", conn.getHeaderField("Access-Control-Allow-Origin"));

            conn.disconnect();
            DashboardServer.stop();
        }
    }
}
