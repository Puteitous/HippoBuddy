package com.example.agent.web.session;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.testutil.MockLlmClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 契约测试：重启恢复历史会话时，System Prompt 沿用创建时固化的值，
 * 而非用当前工作区重算（修复"切换工作区 + 重启 → prompt 被新工作区覆盖 → 缓存击穿"）。
 * <p>
 * 场景：工作区 A 创建长会话 → 切到工作区 B → 重启进程 → 恢复该会话。
 * 修复前：getOrCreateConversation 用当前工作区 B 重算 prompt（规则/技能/路径全变）；
 * 修复后：优先从 transcript 读取历史 system（工作区 A 版本）。
 * </p>
 */
@DisplayName("重启恢复历史 System Prompt 契约测试")
class ResumeRestoresHistoricalPromptTest {

    private static final String SESSION_ID = "resume-historical-prompt-session";

    @TempDir
    Path tempDir;

    private WebSessionManager manager;
    private Path originalHippoRoot;

    @BeforeEach
    void setUp() {
        originalHippoRoot = WorkspaceManager.getHippoRoot();
        WorkspaceManager.overrideBasePath(tempDir);
        manager = WebSessionManager.getInstance();
        manager.clear();
    }

    @AfterEach
    void tearDown() {
        manager.clear();
        ServiceLocator.clear();
        WorkspaceManager.overrideBasePath(originalHippoRoot);
    }

    @Test
    @DisplayName("findSystemPromptFromHistory 返回 transcript 中固化（工作区 A 版本）的 prompt")
    void findSystemPromptFromHistory_returnsHistoricalPrompt() {
        // 真实 ConversationService + MockLlmClient，模拟工作区 A 下创建会话并产生对话
        ServiceLocator.clear();
        MockLlmClient mockLlmClient = new MockLlmClient();
        ConversationService service =
            new ConversationService(TokenEstimatorFactory.getDefault(), mockLlmClient);
        ServiceLocator.registerSingleton(ConversationService.class, service);

        String historicalPrompt = "## 当前工作区\n" + tempDir.resolve("workspace-a") + "\n技能清单A";
        Conversation conv = service.create(historicalPrompt, 4096, SESSION_ID);
        service.addUserMessage(conv, "你好");
        Path flushed = service.flushTranscript(SESSION_ID);
        System.out.println(">>> transcript file: " + flushed);
        if (flushed != null && java.nio.file.Files.exists(flushed)) {
            try {
                System.out.println(">>> content: [" + java.nio.file.Files.readString(flushed) + "]");
            } catch (java.io.IOException ignored) {
            }
        }
        System.out.println(">>> conversation messages: " + conv.getMessages().size()
            + ", first role=" + conv.getMessages().get(0).getRole());

        // 模拟重启：新进程里当前工作区可能已变，但历史 prompt 必须可恢复
        String restored = service.findSystemPromptFromHistory(SESSION_ID);

        assertNotNull(restored, "历史会话应能恢复固化的 system prompt");
        assertEquals(historicalPrompt, restored,
            "恢复的 prompt 必须与创建时固化的逐字节一致（而非当前工作区重算）");
    }

    @Test
    @DisplayName("getOrCreateConversation 恢复历史会话时优先用历史 prompt（而非当前默认）")
    void getOrCreateConversation_prefersHistoricalPrompt() {
        String historicalPrompt = "## 当前工作区\n" + tempDir.resolve("workspace-a") + "\n历史快照内容";

        // mock ConversationService：findSystemPromptFromHistory 返回历史值，
        // create 捕获传入的 prompt 参数，resumeConversation 返回 NO_TRANSCRIPT
        TokenEstimator mockTokenEstimator = mock(TokenEstimator.class);
        when(mockTokenEstimator.estimateMessageTokens(any())).thenReturn(0);
        when(mockTokenEstimator.estimateConversationTokens(any())).thenReturn(0);
        when(mockTokenEstimator.estimateTextTokens(any())).thenReturn(0);

        ConversationService mockService = mock(ConversationService.class);
        lenient().when(mockService.findSystemPromptFromHistory(SESSION_ID))
            .thenReturn(historicalPrompt);
        AtomicReference<String> capturedPrompt = new AtomicReference<>();
        lenient().when(mockService.create(anyString(), anyInt(), anyString()))
            .thenAnswer(inv -> {
                String prompt = inv.getArgument(0);
                int maxTokens = inv.getArgument(1);
                String sessionId = inv.getArgument(2);
                capturedPrompt.set(prompt);
                Conversation conv = new Conversation(maxTokens, mockTokenEstimator, sessionId);
                conv.setSystemPrompt(prompt);
                if (prompt != null && !prompt.isEmpty()) {
                    conv.addMessage(Message.system(prompt));
                }
                return conv;
            });
        lenient().when(mockService.resumeConversation(any(), anyString()))
            .thenAnswer(inv -> new ConversationService.ResumeResult(inv.getArgument(1)));

        ServiceLocator.clear();
        ServiceLocator.registerSingleton(ConversationService.class, mockService);

        Conversation conv = manager.getOrCreateConversation(SESSION_ID, null);

        assertEquals(historicalPrompt, capturedPrompt.get(),
            "恢复历史会话时，create 收到的 prompt 必须是历史固化值（而非当前默认）");
        assertEquals(historicalPrompt, conv.getSystemPrompt());
    }

    @Test
    @DisplayName("全新会话无历史时回退到默认 prompt（非 null）")
    void noHistory_fallsBackToDefaultPrompt() {
        TokenEstimator mockTokenEstimator = mock(TokenEstimator.class);
        when(mockTokenEstimator.estimateMessageTokens(any())).thenReturn(0);
        when(mockTokenEstimator.estimateConversationTokens(any())).thenReturn(0);
        when(mockTokenEstimator.estimateTextTokens(any())).thenReturn(0);

        ConversationService mockService = mock(ConversationService.class);
        // 无历史 → findSystemPromptFromHistory 返回 null
        lenient().when(mockService.findSystemPromptFromHistory(SESSION_ID))
            .thenReturn(null);
        AtomicReference<String> capturedPrompt = new AtomicReference<>();
        lenient().when(mockService.create(anyString(), anyInt(), anyString()))
            .thenAnswer(inv -> {
                String prompt = inv.getArgument(0);
                int maxTokens = inv.getArgument(1);
                String sessionId = inv.getArgument(2);
                capturedPrompt.set(prompt);
                Conversation conv = new Conversation(maxTokens, mockTokenEstimator, sessionId);
                conv.setSystemPrompt(prompt);
                if (prompt != null && !prompt.isEmpty()) {
                    conv.addMessage(Message.system(prompt));
                }
                return conv;
            });
        lenient().when(mockService.resumeConversation(any(), anyString()))
            .thenAnswer(inv -> new ConversationService.ResumeResult(inv.getArgument(1)));

        ServiceLocator.clear();
        ServiceLocator.registerSingleton(ConversationService.class, mockService);

        Conversation conv = manager.getOrCreateConversation(SESSION_ID, null);

        assertNotNull(capturedPrompt.get(), "全新会话应使用默认 prompt");
        assertTrue(!capturedPrompt.get().isBlank());
        assertNull(mockService.findSystemPromptFromHistory(SESSION_ID));
        assertNotNull(conv);
    }
}
