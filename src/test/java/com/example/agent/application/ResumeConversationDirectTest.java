package com.example.agent.application;

import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.testutil.MockLlmClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("ConversationService.resumeConversation 简化测试")
class ResumeConversationDirectTest {

    @TempDir
    Path tempDir;

    private ConversationService service;
    private Path testBaseDir;

    @BeforeEach
    void setUp() throws Exception {
        testBaseDir = tempDir.resolve("test-workspace");
        Files.createDirectories(testBaseDir);
        WorkspaceManager.overrideBasePath(testBaseDir);
        
        MockLlmClient mockLlmClient = new MockLlmClient();
        service = new ConversationService(TokenEstimatorFactory.getDefault(), mockLlmClient);
    }

    private String createTestSessionId() {
        return "test-" + System.currentTimeMillis();
    }

    private Path createTranscriptFile(String sessionId, String... jsonLines) throws Exception {
        String safeSessionId = sessionId.replaceAll("[^a-zA-Z0-9_-]", "");
        Path transcriptFile = testBaseDir
            .resolve(".hippo")
            .resolve("sessions")
            .resolve(LocalDate.now().toString())
            .resolve(safeSessionId)
            .resolve("conversation.jsonl");
            
        Files.createDirectories(transcriptFile.getParent());
        String content = String.join("\n", jsonLines) + "\n";
        Files.writeString(transcriptFile, content, StandardCharsets.UTF_8);
        return transcriptFile;
    }

    private String userMsg(String id, String content) {
        return String.format(
            "{\"type\":\"user\",\"uuid\":\"%s\",\"sessionId\":\"%s\",\"timestamp\":\"2026-05-06T00:00:00Z\",\"version\":\"1.0.0\",\"cwd\":\"test\",\"message\":{\"id\":\"%s\",\"role\":\"user\",\"content\":\"%s\"}}",
            id, id, id, content
        );
    }

    private String assistantMsg(String id, String content) {
        return String.format(
            "{\"type\":\"assistant\",\"uuid\":\"%s\",\"sessionId\":\"%s\",\"timestamp\":\"2026-05-06T00:00:00Z\",\"version\":\"1.0.0\",\"cwd\":\"test\",\"message\":{\"id\":\"%s\",\"role\":\"assistant\",\"content\":\"%s\"}}",
            id, id, id, content
        );
    }

    private String systemMsg(String id, String content) {
        return String.format(
            "{\"type\":\"system\",\"uuid\":\"%s\",\"sessionId\":\"%s\",\"timestamp\":\"2026-05-06T00:00:00Z\",\"version\":\"1.0.0\",\"cwd\":\"test\",\"message\":{\"id\":\"%s\",\"role\":\"system\",\"content\":\"%s\"}}",
            id, id, id, content
        );
    }

    @Test
    @DisplayName("无文件时返回 NO_TRANSCRIPT")
    void noTranscript() {
        String sessionId = createTestSessionId();
        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);
        assertThat(result.getStatus()).isEqualTo(ConversationService.ResumeResult.Status.NO_TRANSCRIPT);
        assertThat(result.isResumed()).isFalse();
    }

    @Test
    @DisplayName("短对话完整恢复")
    void resumedFull_shortConversation() throws Exception {
        String sessionId = createTestSessionId();
        
        createTranscriptFile(sessionId,
            systemMsg("msg-1", "You are helpful"),
            userMsg("msg-2", "Hello"),
            assistantMsg("msg-3", "Hi there!")
        );

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.getStatus()).isEqualTo(ConversationService.ResumeResult.Status.RESUMED_FULL);
        assertThat(result.isResumed()).isTrue();
        assertThat(result.getTotalMessages()).isEqualTo(3);
    }

    @Test
    @DisplayName("统计数据正确")
    void resumeResultStatistics() throws Exception {
        String sessionId = createTestSessionId();
        
        createTranscriptFile(sessionId,
            systemMsg("msg-1", "You are helpful"),
            userMsg("msg-2", "Hello"),
            assistantMsg("msg-3", "Hi!")
        );

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.getTotalMessages()).isEqualTo(3);
        assertThat(result.getLoadedMessages()).isEqualTo(4);
    }

    @Test
    @DisplayName("RESUMED_WITH_MEMORY - 长对话 + session-memory.md 智能恢复")
    void resumedWithMemory_longConversation() throws Exception {
        String sessionId = createTestSessionId();

        // 创建足够长的对话，确保 token 数超过阈值 (4096 * 0.7 = 2867)
        // 每条消息大约 100-200 tokens，需要 15-20 条长消息
        List<String> lines = new ArrayList<>();
        lines.add(systemMsg("msg-1", "You are helpful"));
        
        for (int i = 0; i < 25; i++) {
            lines.add(userMsg("msg-u" + i, "这是第 " + i + " 轮对话，这是一段很长的对话内容，用于测试 token 预算超出阈值时的智能恢复逻辑。需要足够多的内容才能确保 token 数超过阈值。"));
            lines.add(assistantMsg("msg-a" + i, "这是第 " + i + " 轮回复，这是一段很长的回复内容，用于测试 token 预算超出阈值时的智能恢复逻辑。需要足够多的内容才能确保 token 数超过阈值。"));
        }
        
        lines.add(userMsg("msg-last", "最近的消息"));
        lines.add(assistantMsg("msg-last-a", "最近的回复"));

        createTranscriptFile(sessionId, lines.toArray(new String[0]));

        writeSessionMemory(sessionId, "# Session Title\n测试会话\n\n---\n\n# Current State\n正在测试恢复\n\n---\n\n# Worklog\n1. 开始测试\n2. 继续测试");

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.getStatus()).isEqualTo(ConversationService.ResumeResult.Status.RESUMED_WITH_MEMORY);
        assertThat(result.isResumed()).isTrue();
        assertThat(result.isUsedMemory()).isTrue();
        assertThat(result.getLoadedMessages()).isLessThan(result.getTotalMessages());
        assertThat(result.getSavedTokens()).isGreaterThan(0);

        List<Message> loadedMessages = conv.getMessages();
        boolean hasMemorySummary = loadedMessages.stream()
            .anyMatch(m -> m.getContent() != null && m.getContent().contains("session-memory.md"));
        assertThat(hasMemorySummary).isTrue();

        boolean hasRecentMessage = loadedMessages.stream()
            .anyMatch(m -> m.getContent() != null && m.getContent().contains("最近的消息"));
        assertThat(hasRecentMessage).isTrue();
    }

    @Test
    @DisplayName("RESUMED_FULL - 有记忆但 token 未超阈值，完整恢复")
    void resumedFull_memoryExistsButUnderThreshold() throws Exception {
        String sessionId = createTestSessionId();

        createTranscriptFile(sessionId,
            systemMsg("msg-1", "You are helpful"),
            userMsg("msg-2", "Hello"),
            assistantMsg("msg-3", "Hi!")
        );

        writeSessionMemory(sessionId, "# Session Title\n测试\n\n---\n\n# Current State\n测试中");

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.getStatus()).isEqualTo(ConversationService.ResumeResult.Status.RESUMED_FULL);
        assertThat(result.isUsedMemory()).isFalse();
    }

    @Test
    @DisplayName("interrupted_prompt - 最后一条是 user，添加恢复提示")
    void interruptedPrompt() throws Exception {
        String sessionId = createTestSessionId();

        createTranscriptFile(sessionId,
            systemMsg("msg-1", "You are helpful"),
            userMsg("msg-2", "Hello"),
            assistantMsg("msg-3", "Hi!"),
            userMsg("msg-4", "请继续")
        );

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        service.resumeConversation(conv, sessionId);

        List<Message> messages = conv.getMessages();
        Message lastMsg = messages.get(messages.size() - 1);
        assertThat(lastMsg.isAssistant()).isTrue();
        assertThat(lastMsg.getContent()).contains("会话恢复提示");
    }

    @Test
    @DisplayName("interrupted_turn - 最后一条 assistant 有未完成 toolCalls")
    void interruptedTurn() throws Exception {
        String sessionId = createTestSessionId();

        String toolCallJson = String.format(
            "{\"type\":\"assistant\",\"uuid\":\"msg-3\",\"sessionId\":\"test\",\"timestamp\":\"2026-05-06T00:00:00Z\",\"version\":\"1.0.0\",\"cwd\":\"test\",\"message\":{\"id\":\"msg-3\",\"role\":\"assistant\",\"content\":\"Let me read that file\",\"tool_calls\":[{\"id\":\"call-123\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"test.txt\\\"}\"}}]}}",
            sessionId
        );

        createTranscriptFile(sessionId,
            systemMsg("msg-1", "You are helpful"),
            userMsg("msg-2", "Read the file"),
            toolCallJson
        );

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        service.resumeConversation(conv, sessionId);

        List<Message> messages = conv.getMessages();
        Message lastMsg = messages.get(messages.size() - 1);
        assertThat(lastMsg.isAssistant()).isTrue();
        assertThat(lastMsg.getContent()).contains("会话中断");
        assertThat(lastMsg.getToolCalls()).isNull();
    }

    @Test
    @DisplayName("正常结束的会话不添加恢复提示")
    void normalCompletion_noRecoveryMessage() throws Exception {
        String sessionId = createTestSessionId();

        createTranscriptFile(sessionId,
            systemMsg("msg-1", "You are helpful"),
            userMsg("msg-2", "Hello"),
            assistantMsg("msg-3", "Hi there! How can I help?")
        );

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        service.resumeConversation(conv, sessionId);

        List<Message> messages = conv.getMessages();
        Message lastMsg = messages.get(messages.size() - 1);
        assertThat(lastMsg.isAssistant()).isTrue();
        assertThat(lastMsg.getContent()).doesNotContain("会话恢复提示");
        assertThat(lastMsg.getContent()).doesNotContain("会话中断");
    }

    @Test
    @DisplayName("web- 前缀的 sessionId 正确恢复")
    void webPrefixSessionId() throws Exception {
        String sessionId = "web-" + System.currentTimeMillis();

        createTranscriptFile(sessionId,
            systemMsg("msg-1", "You are helpful"),
            userMsg("msg-2", "Hello from web"),
            assistantMsg("msg-3", "Hi from web!")
        );

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.isResumed()).isTrue();
        assertThat(result.getTotalMessages()).isEqualTo(3);
    }

    private void writeSessionMemory(String sessionId, String content) throws Exception {
        // 使用 SessionMemoryManager 来写入，确保路径一致
        com.example.agent.memory.session.SessionMemoryManager memoryManager = 
            new com.example.agent.memory.session.SessionMemoryManager(sessionId, testBaseDir);
        memoryManager.write(content);
    }
}
