package com.example.agent.application;

import com.example.agent.context.config.ContextConfig;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Usage;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.session.TranscriptEntry;
import com.example.agent.session.TranscriptLoader;
import com.example.agent.session.TranscriptType;
import com.example.agent.testutil.MockLlmClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("ConversationService 应用服务测试")
class ConversationServiceTest {

    @TempDir
    Path tempDir;

    private ConversationService service;
    private LlmClient mockLlmClient;

    @BeforeEach
    void setUp() {
        WorkspaceManager.overrideBasePath(tempDir);
        mockLlmClient = new MockLlmClient();
        TokenEstimator tokenEstimator = TokenEstimatorFactory.getDefault();
        service = new ConversationService(tokenEstimator, mockLlmClient);
    }

    @Test
    @DisplayName("✅ 创建会话成功")
    void createConversation() {
        Conversation conv = service.create("You are helpful");

        assertThat(conv).isNotNull();
        assertThat(conv.getSessionId()).isNotNull();
        assertThat(conv.getSystemPrompt()).isEqualTo("You are helpful");
    }

    @Test
    @DisplayName("✅ 创建带有 systemPrompt 的会话")
    void createWithSystemPromptAddsMessage() {
        Conversation conv = service.create("You are helpful");

        assertThat(conv.size()).isEqualTo(1);
        assertThat(conv.getMessages().get(0).isSystem()).isTrue();
    }

    @Test
    @DisplayName("✅ null systemPrompt 不崩溃")
    void createWithNullSystemPrompt() {
        Conversation conv = service.create(null);

        assertThat(conv).isNotNull();
        assertThat(conv.getSystemPrompt()).isEmpty();
    }

    @Test
    @DisplayName("✅ reset() 正确重置会话")
    void resetConversation() {
        Conversation conv = service.create("System prompt");
        service.addUserMessage(conv, "Hello");

        assertThat(conv.size()).isGreaterThan(1);

        service.reset(conv);

        assertThat(conv.size()).isEqualTo(1);
        assertThat(conv.getMessages().get(0).isSystem()).isTrue();
    }

    @Test
    @DisplayName("✅ reset(null) 不崩溃")
    void resetNullConversation() {
        service.reset(null);
    }

    @Test
    @DisplayName("✅ 添加用户消息")
    void addUserMessage() {
        Conversation conv = service.create("");

        service.addUserMessage(conv, "Hello user");

        assertThat(conv.size()).isEqualTo(1);
        assertThat(conv.getMessages().get(0).isUser()).isTrue();
    }

    @Test
    @DisplayName("✅ 添加助手消息")
    void addAssistantMessage() {
        Conversation conv = service.create("");

        service.addAssistantMessage(conv, "Hello assistant");

        assertThat(conv.size()).isEqualTo(1);
        assertThat(conv.getMessages().get(0).isAssistant()).isTrue();
    }

    @Test
    @DisplayName("✅ 添加工具结果")
    void addToolResult() {
        Conversation conv = service.create("");

        service.addToolResult(conv, "call-123", "read_file", "File content");

        assertThat(conv.size()).isEqualTo(1);
        assertThat(conv.getMessages().get(0).isTool()).isTrue();
    }

    @Test
    @DisplayName("✅ addMessage(null, null) 不崩溃")
    void addMessageNullSafe() {
        service.addMessage(null, null);
    }

    @Test
    @DisplayName("✅ prepareForInference 返回有效消息")
    void prepareForInference() {
        Conversation conv = service.create("You are helpful");
        service.addUserMessage(conv, "Hello");

        var messages = service.prepareForInference(conv);

        assertThat(messages).isNotEmpty();
    }

    @Test
    @DisplayName("✅ getCompactionStats 不崩溃")
    void getCompactionStats() {
        Conversation conv = service.create("");

        String stats = service.getCompactionStats(conv);

        assertThat(stats).isNotNull();
    }

    @Test
    @DisplayName("✅ Token 计数正确")
    void getTokenCount() {
        Conversation conv = service.create("");
        service.addUserMessage(conv, "Hello world");

        int count = service.getTokenCount(conv);

        assertThat(count).isGreaterThan(0);
    }

    @Test
    @DisplayName("✅ Token 使用率正确")
    void getTokenUsageRatio() {
        Conversation conv = service.create("");
        service.addUserMessage(conv, "Hello world");

        double ratio = service.getTokenUsageRatio(conv);

        assertThat(ratio).isBetween(0.0, 1.0);
    }

    @Test
    @DisplayName("✅ 活跃会话计数")
    void getActiveSessionCount() {
        int initial = service.getActiveSessionCount();

        Conversation conv1 = service.create("");
        Conversation conv2 = service.create("");

        assertThat(service.getActiveSessionCount()).isEqualTo(initial + 2);
    }

    @Test
    @DisplayName("✅ destroy() 正确清理资源")
    void destroyConversation() {
        Conversation conv = service.create("");
        int before = service.getActiveSessionCount();

        service.destroy(conv);

        assertThat(service.getActiveSessionCount()).isEqualTo(before - 1);
    }

    @Test
    @DisplayName("✅ cleanupIdleSessions 清理超时会话")
    void cleanupIdleSessions() throws Exception {
        Conversation conv1 = service.create("");
        Conversation conv2 = service.create("");

        int before = service.getActiveSessionCount();

        service.addUserMessage(conv1, "This keeps it active");

        Thread.sleep(10);

        service.cleanupIdleSessions(5);

        assertThat(service.getActiveSessionCount()).isLessThan(before);
    }

    @Test
    @DisplayName("✅ getHistory 返回正确")
    void getHistory() {
        Conversation conv = service.create("System");
        service.addUserMessage(conv, "Hello");

        var history = service.getHistory(conv);

        assertThat(history).hasSize(2);
    }

    @Test
    @DisplayName("✅ getMessageCount 返回正确")
    void getMessageCount() {
        Conversation conv = service.create("Prompt");
        service.addUserMessage(conv, "Hello");
        service.addAssistantMessage(conv, "Hi");

        assertThat(service.getMessageCount(conv)).isEqualTo(3);
    }

    @Test
    @DisplayName("✅ getContextForInference 委托正确")
    void getContextForInference() {
        Conversation conv = service.create("");
        service.addUserMessage(conv, "Hello");

        var result1 = service.prepareForInference(conv);
        var result2 = service.getContextForInference(conv);

        assertThat(result1).hasSize(result2.size());
    }

    @Test
    @DisplayName("✅ getConfig 返回正确")
    void getConfig() {
        ContextConfig config = new ContextConfig();
        ConversationService customService = new ConversationService(
            TokenEstimatorFactory.getDefault(),
            mockLlmClient,
            config
        );

        assertThat(customService.getConfig()).isSameAs(config);
    }

    @Test
    @DisplayName("✅ fixUnfinishedToolCall 不崩溃")
    void fixUnfinishedToolCall() {
        Conversation conv = service.create("");
        service.addAssistantMessage(conv, "Thinking...");

        service.fixUnfinishedToolCall(conv);
    }

    @Test
    @DisplayName("✅ flushTranscript 对未知会话返回 null")
    void flushTranscriptReturnsNullForUnknownSession() {
        Path result = service.flushTranscript("non-existent-session");

        assertThat(result).isNull();
    }

    @Test
    @DisplayName("✅ flushTranscript 对已知会话返回非 null 路径")
    void flushTranscriptReturnsPathForExistingSession() {
        Conversation conv = service.create("System prompt");
        String sessionId = conv.getSessionId();
        service.addUserMessage(conv, "Hello");

        Path result = service.flushTranscript(sessionId);

        assertThat(result).isNotNull();
        assertThat(result.toString()).contains("conversation.jsonl");
    }

    @Test
    @DisplayName("✅ destroyTranscript 对未知会话不崩溃")
    void destroyTranscriptDoesNotCrashForUnknownSession() {
        service.destroyTranscript("non-existent-session");
    }

    @Test
    @DisplayName("✅ destroyTranscript 后需重建组件")
    void destroyTranscriptRemovesComponents() {
        Conversation conv = service.create("System prompt");
        String sessionId = conv.getSessionId();

        Path beforeFlush = service.flushTranscript(sessionId);
        assertThat(beforeFlush).isNotNull();

        service.destroyTranscript(sessionId);

        Path afterDestroy = service.flushTranscript(sessionId);
        assertThat(afterDestroy).isNull();

        service.ensureSessionComponents(conv);
        Path afterRecreate = service.flushTranscript(sessionId);
        assertThat(afterRecreate).isNotNull();
    }

    @Test
    @DisplayName("✅ flushTranscript + destroyTranscript 完整调用链不崩溃")
    void flushThenDestroyFullChain() {
        Conversation conv = service.create("Test");
        String sessionId = conv.getSessionId();
        service.addUserMessage(conv, "Message 1");
        service.addAssistantMessage(conv, "Response 1");
        service.addUserMessage(conv, "Message 2");
        service.addAssistantMessage(conv, "Response 2");

        Path path = service.flushTranscript(sessionId);
        assertThat(path).isNotNull();

        service.destroyTranscript(sessionId);

        service.ensureSessionComponents(conv);

        Path newPath = service.flushTranscript(sessionId);
        assertThat(newPath).isNotNull();
        assertThat(newPath).isEqualTo(path);
    }

    @Test
    @DisplayName("✅ addAssistantMessage(usage) 落库 usage 为本次值（不滞后一条）")
    void addAssistantMessagePersistsOwnUsage() {
        Conversation conv = service.create("System");
        String sessionId = conv.getSessionId();
        service.addUserMessage(conv, "Q1");
        service.addAssistantMessage(conv, Message.assistant("A1"), buildUsage(111, 22, 133, 100));
        service.addUserMessage(conv, "Q2");
        service.addAssistantMessage(conv, Message.assistant("A2"), buildUsage(222, 33, 255, 200));

        // 内存 lastKnownUsage 应为最后一条（既有语义保持）
        assertThat(conv.getLastKnownUsage()).isNotNull();
        assertThat(conv.getLastKnownUsage().getPromptTokens()).isEqualTo(222);

        Path jsonl = service.flushTranscript(sessionId);
        TranscriptLoader.LoadResult result = TranscriptLoader.load(jsonl);
        List<TranscriptEntry> assistantEntries = result.getAllEntries().stream()
            .filter(e -> e.getTypeEnum() == TranscriptType.ASSISTANT)
            .collect(Collectors.toList());

        // 修复前：第一条落库为 null/旧值、第二条落库为第一条的 usage（滞后一条）；
        // 修复后：各自落库本次 usage。
        assertThat(assistantEntries).hasSize(2);
        assertThat(assistantEntries.get(0).getUsage()).isNotNull();
        assertThat(assistantEntries.get(0).getUsage().getPromptTokens()).isEqualTo(111);
        assertThat(assistantEntries.get(0).getUsage().getCompletionTokens()).isEqualTo(22);
        assertThat(assistantEntries.get(1).getUsage()).isNotNull();
        assertThat(assistantEntries.get(1).getUsage().getPromptTokens()).isEqualTo(222);
        assertThat(assistantEntries.get(1).getUsage().getCompletionTokens()).isEqualTo(33);
    }

    @Test
    @DisplayName("✅ addAssistantMessage(usage=null) 不覆盖已有 lastKnownUsage")
    void addAssistantMessageWithNullUsageKeepsLastKnown() {
        Conversation conv = service.create("System");
        service.addUserMessage(conv, "Q1");
        service.addAssistantMessage(conv, Message.assistant("A1"), buildUsage(111, 22, 133, 100));
        assertThat(conv.getLastKnownUsage().getPromptTokens()).isEqualTo(111);

        // 后续调用 usage=null（如编辑/占位消息），不应清空或覆盖上次已知 usage
        service.addAssistantMessage(conv, Message.assistant("A2"), null);

        assertThat(conv.getLastKnownUsage()).isNotNull();
        assertThat(conv.getLastKnownUsage().getPromptTokens()).isEqualTo(111);
    }

    /** 构造一个带缓存指标的 Usage 实例。 */
    private Usage buildUsage(int prompt, int completion, int total, int cacheHit) {
        Usage usage = new Usage();
        usage.setPromptTokens(prompt);
        usage.setCompletionTokens(completion);
        usage.setTotalTokens(total);
        usage.setPromptCacheHitTokens(cacheHit);
        return usage;
    }
}
