package com.example.agent.memory;

import com.example.agent.application.ConversationService;
import com.example.agent.config.Config;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.rule.HippoRulesParser;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.testutil.MockLlmClient;
import com.example.agent.testutil.LlmResponseBuilder;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.tools.RecallMemoryTool;
import com.example.agent.web.server.DashboardServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Web 端 Memory 注入测试
 * 
 * 验证 Web 前端通过 ChatApiHandler 调用时，Memory 模块是否正确初始化并注入到 prompt 中
 */
@DisplayName("Web 端 Memory 注入测试")
class WebMemoryInjectionTest {

    private static final int TEST_PORT = 19093;

    @TempDir
    Path tempDir;

    private MockLlmClient mockLlmClient;
    private ConversationService conversationService;
    private ObjectMapper objectMapper;
    private Path memoryDir;

    @BeforeEach
    void setUp() throws InterruptedException {
        mockLlmClient = new MockLlmClient();
        TokenEstimator tokenEstimator = TokenEstimatorFactory.getDefault();
        conversationService = new ConversationService(tokenEstimator, mockLlmClient);
        objectMapper = new ObjectMapper();

        memoryDir = tempDir.resolve(".hippo/memory");
        try {
            Files.createDirectories(memoryDir);
        } catch (Exception e) {
            fail("创建记忆目录失败: " + e.getMessage());
        }

        ServiceLocator.registerSingleton(LlmClient.class, mockLlmClient);
        ServiceLocator.registerSingleton(ConversationService.class, conversationService);

        // 初始化 Memory 模块（模拟 CLI 启动时的初始化）
        try {
            Config config = new Config();
            MemoryToolSandbox sandbox = new MemoryToolSandbox(memoryDir);
            MemoryStore memoryStore = new MemoryStore(sandbox);
            HippoRulesParser rulesParser = new HippoRulesParser();
            MemoryRetriever memoryRetriever = new MemoryRetriever(memoryStore, rulesParser);

            ServiceLocator.registerSingleton(MemoryStore.class, memoryStore);
            ServiceLocator.registerSingleton(MemoryRetriever.class, memoryRetriever);

            // 注册记忆工具
            try {
                ToolRegistry toolRegistry = new ToolRegistry();
                ServiceLocator.registerSingleton(ToolRegistry.class, toolRegistry);
                toolRegistry.register(new RecallMemoryTool(memoryStore));
            } catch (Exception e) {
                // ToolRegistry 可能已注册
            }
        } catch (Exception e) {
            fail("Memory 模块初始化失败: " + e.getMessage());
        }

        DashboardServer.start(TEST_PORT, false);
        Thread.sleep(500);
    }

    @AfterEach
    void tearDown() {
        DashboardServer.stop();
        ServiceLocator.clear();
        com.example.agent.web.session.WebSessionManager.getInstance().getSessions().clear();
    }

    @Test
    @DisplayName("Web 端调用 /api/chat 时 MemoryRetriever 应从 DI 容器获取")
    void testWebChatUsesMemoryRetrieverFromDI() throws Exception {
        // 准备：添加一条用户偏好记忆
        MemoryStore memoryStore = ServiceLocator.get(MemoryStore.class);
        MemoryEntry preferenceEntry = new MemoryEntry(
            "test-preference",
            "用户偏好：使用中文回复",
            MemoryEntry.MemoryType.USER_PREFERENCE,
            Set.of("中文", "语言偏好")
        );
        preferenceEntry.setContent("# 语言偏好\n\n用户要求始终使用中文回复。");
        memoryStore.add(preferenceEntry);

        // 等待索引更新
        Thread.sleep(300);

        // 准备 mock 响应
        mockLlmClient.enqueueSuccessResponse("好的，我会用中文回复您。");

        // 发送请求
        String response = sendChatRequest("test-session-1", "你好");

        // 验证响应正常
        assertNotNull(response);
        assertTrue(response.contains("好的，我会用中文回复您。"));

        // 验证发送到 LLM 的消息中包含记忆注入
        List<List<Message>> recordedMessages = mockLlmClient.getRecordedMessages();
        assertFalse(recordedMessages.isEmpty(), "应该有发送到 LLM 的消息");

        List<Message> firstRequestMessages = recordedMessages.get(0);
        
        // 检查消息列表中是否有包含记忆内容的 system message
        boolean hasMemoryInjection = firstRequestMessages.stream()
            .filter(m -> "system".equals(m.getRole()))
            .anyMatch(m -> m.getContent() != null && 
                (m.getContent().contains("持久上下文") || 
                 m.getContent().contains("用户偏好") ||
                 m.getContent().contains("语言偏好")));

        assertTrue(hasMemoryInjection, 
            "发送到 LLM 的消息中应该包含记忆注入内容。实际消息: " + 
            firstRequestMessages.stream()
                .map(m -> m.getRole() + ": " + (m.getContent() != null ? m.getContent().substring(0, Math.min(200, m.getContent().length())) : "null"))
                .reduce((a, b) -> a + "\n" + b)
                .orElse("无消息"));
    }

    @Test
    @DisplayName("Web 端独立启动时应自动初始化 Memory 模块")
    void testWebChatAutoInitializesMemoryWhenNotInDI() throws Exception {
        // 清除 DI 容器中的 MemoryRetriever（模拟 Web 独立启动）
        ServiceLocator.clear();
        com.example.agent.web.session.WebSessionManager.getInstance().getSessions().clear();

        // 重新注册必要组件（但不注册 MemoryRetriever）
        mockLlmClient = new MockLlmClient();
        TokenEstimator tokenEstimator = TokenEstimatorFactory.getDefault();
        conversationService = new ConversationService(tokenEstimator, mockLlmClient);
        ServiceLocator.registerSingleton(LlmClient.class, mockLlmClient);
        ServiceLocator.registerSingleton(ConversationService.class, conversationService);

        mockLlmClient.enqueueSuccessResponse("测试响应");

        // 发送请求（应触发自动初始化）
        String response = sendChatRequest("test-session-2", "你好");

        assertNotNull(response);
        assertTrue(response.contains("测试响应"));

        // 验证 MemoryRetriever 已被初始化并注册到 DI 容器
        try {
            MemoryRetriever retriever = ServiceLocator.get(MemoryRetriever.class);
            assertNotNull(retriever, "MemoryRetriever 应被自动初始化");
        } catch (Exception e) {
            fail("MemoryRetriever 未被自动初始化: " + e.getMessage());
        }
    }

    @Test
    @DisplayName("Memory 注入应包含规则文件内容")
    void testMemoryInjectionIncludesRules() throws Exception {
        // 准备：添加记忆
        MemoryStore memoryStore = ServiceLocator.get(MemoryStore.class);
        MemoryEntry projectEntry = new MemoryEntry(
            "test-project",
            "项目使用 Spring Boot 框架",
            MemoryEntry.MemoryType.PROJECT_CONTEXT,
            Set.of("spring", "java")
        );
        projectEntry.setContent("# 项目框架\n\n项目使用 Spring Boot 3.x，Java 17。");
        memoryStore.add(projectEntry);

        Thread.sleep(300);

        mockLlmClient.enqueueSuccessResponse("了解，Spring Boot 3.x 是个好框架。");

        String response = sendChatRequest("test-session-3", "这个项目用什么框架？");

        assertNotNull(response);

        // 验证发送到 LLM 的消息
        List<List<Message>> recordedMessages = mockLlmClient.getRecordedMessages();
        assertFalse(recordedMessages.isEmpty());

        List<Message> firstRequestMessages = recordedMessages.get(0);
        
        // 检查是否有项目上下文注入
        boolean hasProjectContext = firstRequestMessages.stream()
            .filter(m -> "system".equals(m.getRole()))
            .anyMatch(m -> m.getContent() != null && 
                m.getContent().contains("持久上下文"));

        assertTrue(hasProjectContext, "应该注入持久上下文（包含项目约束）");
    }

    @Test
    @DisplayName("空记忆时不应影响正常对话")
    void testEmptyMemoryDoesNotBreakChat() throws Exception {
        // 不添加任何记忆，保持空状态
        mockLlmClient.enqueueSuccessResponse("你好！有什么可以帮助你的？");

        String response = sendChatRequest("test-session-4", "你好");

        assertNotNull(response);
        assertTrue(response.contains("你好！有什么可以帮助你的？"));

        // 验证消息正常发送
        List<List<Message>> recordedMessages = mockLlmClient.getRecordedMessages();
        assertFalse(recordedMessages.isEmpty());
    }

    private String sendChatRequest(String sessionId, String message) throws Exception {
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
                conn.setReadTimeout(15000);

                ObjectNode requestBody = objectMapper.createObjectNode();
                requestBody.put("session", sessionId);
                requestBody.put("message", message);

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
                        if ("content".equals(eventType)) {
                            try {
                                var json = objectMapper.readTree(data);
                                if (json.has("content")) {
                                    responseContent.get().append(json.get("content").asText());
                                }
                            } catch (Exception e) {
                            }
                        }
                        if ("[DONE]".equals(data)) {
                            doneLatch.countDown();
                            break;
                        }
                        eventType = null;
                        data = null;
                    }
                }
                reader.close();
                conn.disconnect();
            } catch (Exception e) {
                e.printStackTrace();
            } finally {
                doneLatch.countDown();
            }
        });

        clientThread.start();
        boolean completed = doneLatch.await(10, TimeUnit.SECONDS);
        clientRunning.set(false);
        clientThread.join(1000);

        if (!completed) {
            fail("请求超时");
        }

        return responseContent.get().toString();
    }
}
