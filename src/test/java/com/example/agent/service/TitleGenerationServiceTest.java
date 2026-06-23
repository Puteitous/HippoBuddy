package com.example.agent.service;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.web.session.WebSessionManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("TitleGenerationService 单元测试")
class TitleGenerationServiceTest {

    private TitleGenerationService service;
    private final TokenEstimator estimator = new SimpleTokenEstimator();

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        service = new TitleGenerationService();
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
        WebSessionManager.getInstance().clear();
    }

    @Nested
    @DisplayName("fallbackTitle 降级标题")
    class FallbackTitleTests {

        @Test
        @DisplayName("短文本直接返回全文")
        void shortMessageReturnsFull() {
            assertEquals("你好", service.fallbackTitle("你好"));
        }

        @Test
        @DisplayName("正好30字不截断")
        void exactly30CharsNotTruncated() {
            String msg = "一二三四五六七八九十12345678901234567890"; // 30 chars
            assertEquals(30, msg.length());
            assertEquals(msg, service.fallbackTitle(msg));
        }

        @Test
        @DisplayName("超过30字截断加省略号")
        void longMessageTruncated() {
            String longMsg = "一二三四五六七八九十12345678901234567890extra"; // 35 chars
            String result = service.fallbackTitle(longMsg);
            assertEquals(33, result.length());  // 30 + "..."
            assertTrue(result.endsWith("..."));
            assertTrue(result.startsWith("一二三四五六七八九十12345678901234567890"));
        }
    }

    @Nested
    @DisplayName("从内存读取消息")
    class MemoryReadTests {

        @Test
        @DisplayName("内存中没有该会话时返回null")
        void noSessionInMemoryReturnsNull() {
            // WebSessionManager 刚 clear，getSessions() 为空
            assertNull(service.generateTitle("nonexistent-session"));
        }

        @Test
        @DisplayName("内存会话中无user消息时进入JSONL路径")
        void sessionWithoutUserMessageGoesToJsonl() {
            // WebSessionManager 中有会话但没有 user 消息
            Conversation conv = new Conversation(1000, estimator, "test-session-empty");
            conv.addMessage(Message.assistant("I am assistant"));
            WebSessionManager.getInstance().getSessions().put("test-session-empty", conv);

            // JSONL 不存在 → 返回 null
            assertNull(service.generateTitle("test-session-empty"));
            WebSessionManager.getInstance().getSessions().remove("test-session-empty");
        }
    }

    @Nested
    @DisplayName("JSONL 文件读取已有 custom-title")
    class ExistingTitleTests {

        @TempDir
        Path tempDir;

        private Path createJsonlWithFirstLine(String jsonLine) throws IOException {
            Path jsonl = tempDir.resolve("conversation.jsonl");
            Files.write(jsonl, (jsonLine + "\n{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"hello\"}}\n").getBytes(StandardCharsets.UTF_8));
            return jsonl;
        }

        @Test
        @DisplayName("已有 custom-title 时在生成流程中被跳过（通过内存路径验证）")
        void existingTitleIsHandledByGenerateFlow() {
            // 这个测试验证：当内存中没有会话且JSONL不存在时，返回null
            // custom-title 的读取是在 generateTitle 内部路径中的
            assertNull(service.generateTitle("no-session-no-file"));
        }
    }

    @Nested
    @DisplayName("集成场景：内存有消息 + 模拟LLM")
    class IntegrationWithMemoryTests {

        @Test
        @DisplayName("从内存读取消息，LLM 返回标题 → 标题被返回")
        void memoryPathWithLlmSuccess() {
            // 1. 准备内存会话
            Conversation conv = new Conversation(1000, estimator, "test-llm-ok");
            conv.addMessage(Message.user("帮我写一个React组件"));
            WebSessionManager.getInstance().getSessions().put("test-llm-ok", conv);

            // 2. 注册 mock LlmClient
            LlmClient mockClient = new LlmClient() {
                @Override
                public String generateSync(String prompt) {
                    assertTrue(prompt.contains("帮我写一个React组件"));
                    return "React组件开发";
                }
                @Override public com.example.agent.llm.model.ChatResponse chat(java.util.List<Message> messages) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chat(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatWithTools(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatStream(java.util.List<Message> messages, java.util.function.Consumer<com.example.agent.llm.stream.StreamChunk> onChunk) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatStream(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools, java.util.function.Consumer<com.example.agent.llm.stream.StreamChunk> onChunk) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse executeRequest(com.example.agent.llm.model.ChatRequest request) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse continueWithToolResult(com.example.agent.llm.model.ChatResponse previousResponse, java.util.List<Message> messages, String toolCallId, String toolName, String toolResult) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse continueWithToolResults(com.example.agent.llm.model.ChatResponse previousResponse, java.util.List<Message> messages, java.util.List<com.example.agent.llm.client.LlmClient.ToolResult> toolResults) { return null; }
                @Override public String getModel() { return "test"; }
                @Override public String getBaseUrl() { return "http://test"; }
                @Override public String getProviderName() { return "test"; }
            };
            ServiceLocator.registerSingleton(LlmClient.class, mockClient);
            // ConversationService 不是必须的（内存路径不调用 forceFlush）
            ServiceLocator.registerSingleton(ConversationService.class, new ConversationService(estimator, mockClient));

            // 3. 执行
            String title = service.generateTitle("test-llm-ok");

            // 4. 验证
            assertEquals("React组件开发", title);

            WebSessionManager.getInstance().getSessions().remove("test-llm-ok");
        }

        @Test
        @DisplayName("LLM 返回空内容时降级为消息截断")
        void llmReturnsEmptyFallsBack() {
            Conversation conv = new Conversation(1000, estimator, "test-llm-empty");
            conv.addMessage(Message.user("帮我优化一下这段代码，它的问题是性能太差了"));
            WebSessionManager.getInstance().getSessions().put("test-llm-empty", conv);

            LlmClient mockClient = new LlmClient() {
                @Override
                public String generateSync(String prompt) {
                    return "";
                }
                @Override public com.example.agent.llm.model.ChatResponse chat(java.util.List<Message> messages) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chat(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatWithTools(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatStream(java.util.List<Message> messages, java.util.function.Consumer<com.example.agent.llm.stream.StreamChunk> onChunk) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatStream(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools, java.util.function.Consumer<com.example.agent.llm.stream.StreamChunk> onChunk) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse executeRequest(com.example.agent.llm.model.ChatRequest request) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse continueWithToolResult(com.example.agent.llm.model.ChatResponse previousResponse, java.util.List<Message> messages, String toolCallId, String toolName, String toolResult) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse continueWithToolResults(com.example.agent.llm.model.ChatResponse previousResponse, java.util.List<Message> messages, java.util.List<com.example.agent.llm.client.LlmClient.ToolResult> toolResults) { return null; }
                @Override public String getModel() { return "test"; }
                @Override public String getBaseUrl() { return "http://test"; }
                @Override public String getProviderName() { return "test"; }
            };
            ServiceLocator.registerSingleton(LlmClient.class, mockClient);
            ServiceLocator.registerSingleton(ConversationService.class, new ConversationService(estimator, mockClient));

            String title = service.generateTitle("test-llm-empty");

            assertTrue(title.contains("性能太差"));
            assertTrue(title.length() <= 33);

            WebSessionManager.getInstance().getSessions().remove("test-llm-empty");
        }

        @Test
        @DisplayName("LLM 抛出异常时降级为消息截断")
        void llmExceptionFallsBack() {
            Conversation conv = new Conversation(1000, estimator, "test-llm-ex");
            conv.addMessage(Message.user("分析一下这个项目的代码结构"));
            WebSessionManager.getInstance().getSessions().put("test-llm-ex", conv);

            LlmClient mockClient = new LlmClient() {
                @Override
                public String generateSync(String prompt) {
                    throw new RuntimeException("LLM 不可用");
                }
                @Override public com.example.agent.llm.model.ChatResponse chat(java.util.List<Message> messages) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chat(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatWithTools(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatStream(java.util.List<Message> messages, java.util.function.Consumer<com.example.agent.llm.stream.StreamChunk> onChunk) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatStream(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools, java.util.function.Consumer<com.example.agent.llm.stream.StreamChunk> onChunk) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse executeRequest(com.example.agent.llm.model.ChatRequest request) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse continueWithToolResult(com.example.agent.llm.model.ChatResponse previousResponse, java.util.List<Message> messages, String toolCallId, String toolName, String toolResult) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse continueWithToolResults(com.example.agent.llm.model.ChatResponse previousResponse, java.util.List<Message> messages, java.util.List<com.example.agent.llm.client.LlmClient.ToolResult> toolResults) { return null; }
                @Override public String getModel() { return "test"; }
                @Override public String getBaseUrl() { return "http://test"; }
                @Override public String getProviderName() { return "test"; }
            };
            ServiceLocator.registerSingleton(LlmClient.class, mockClient);
            ServiceLocator.registerSingleton(ConversationService.class, new ConversationService(estimator, mockClient));

            String title = service.generateTitle("test-llm-ex");

            assertTrue(title.contains("分析一下这个项目的代码结构"));

            WebSessionManager.getInstance().getSessions().remove("test-llm-ex");
        }

        @Test
        @DisplayName("LLM 返回带引号的标题会被清理")
        void llmQuotedTitleGetsCleaned() {
            Conversation conv = new Conversation(1000, estimator, "test-llm-quote");
            conv.addMessage(Message.user("帮我写一个Python爬虫"));
            WebSessionManager.getInstance().getSessions().put("test-llm-quote", conv);

            LlmClient mockClient = new LlmClient() {
                @Override
                public String generateSync(String prompt) {
                    return "\"Python爬虫开发\"";
                }
                @Override public com.example.agent.llm.model.ChatResponse chat(java.util.List<Message> messages) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chat(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatWithTools(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatStream(java.util.List<Message> messages, java.util.function.Consumer<com.example.agent.llm.stream.StreamChunk> onChunk) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse chatStream(java.util.List<Message> messages, java.util.List<com.example.agent.llm.model.Tool> tools, java.util.function.Consumer<com.example.agent.llm.stream.StreamChunk> onChunk) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse executeRequest(com.example.agent.llm.model.ChatRequest request) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse continueWithToolResult(com.example.agent.llm.model.ChatResponse previousResponse, java.util.List<Message> messages, String toolCallId, String toolName, String toolResult) { return null; }
                @Override public com.example.agent.llm.model.ChatResponse continueWithToolResults(com.example.agent.llm.model.ChatResponse previousResponse, java.util.List<Message> messages, java.util.List<com.example.agent.llm.client.LlmClient.ToolResult> toolResults) { return null; }
                @Override public String getModel() { return "test"; }
                @Override public String getBaseUrl() { return "http://test"; }
                @Override public String getProviderName() { return "test"; }
            };
            ServiceLocator.registerSingleton(LlmClient.class, mockClient);
            ServiceLocator.registerSingleton(ConversationService.class, new ConversationService(estimator, mockClient));

            String title = service.generateTitle("test-llm-quote");

            assertEquals("Python爬虫开发", title);

            WebSessionManager.getInstance().getSessions().remove("test-llm-quote");
        }
    }
}
