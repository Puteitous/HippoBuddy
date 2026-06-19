package com.example.agent.application;

import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.session.SessionTranscript;
import com.example.agent.testutil.MockLlmClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("ConversationService.resumeConversation 测试")
class ResumeConversationTest {

    @TempDir
    Path tempDir;

    private ConversationService service;
    private Path testSessionsDir;

    @BeforeEach
    void setUp() throws Exception {
        // 使用固定的测试目录，避免临时目录的路径问题
        testSessionsDir = tempDir.resolve("test-sessions");
        Files.createDirectories(testSessionsDir);
        WorkspaceManager.overrideBasePath(testSessionsDir);
        
        MockLlmClient mockLlmClient = new MockLlmClient();
        service = new ConversationService(TokenEstimatorFactory.getDefault(), mockLlmClient);
    }

    private String createTestSessionId() {
        // 使用时间戳作为 sessionId，避免特殊字符
        return "test-" + System.currentTimeMillis();
    }

    private SessionTranscript createTranscript(String sessionId) {
        SessionTranscript transcript = new SessionTranscript(sessionId, 1, 10); // 使用最小的 batchSize 和 flushInterval
        // 等待初始化完成
        try {
            Thread.sleep(50);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return transcript;
    }

    private void writeSessionMemory(String sessionId, String content) throws Exception {
        Path memoryPath = WorkspaceManager.getSessionMemoryPath(sessionId);
        Files.createDirectories(memoryPath.getParent());
        Files.writeString(memoryPath, content);
    }

    @Test
    @DisplayName("NO_TRANSCRIPT - 无 JSONL 文件时返回空结果")
    void noTranscript() {
        String sessionId = createTestSessionId();
        Conversation conv = service.create("You are helpful", 4096, sessionId);

        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.getStatus()).isEqualTo(ConversationService.ResumeResult.Status.NO_TRANSCRIPT);
        assertThat(result.isResumed()).isFalse();
    }

    @Test
    @DisplayName("RESUMED_FULL - 短对话完整恢复")
    void resumedFull_shortConversation() throws Exception {
        String sessionId = createTestSessionId();
        SessionTranscript transcript = createTranscript(sessionId);
        transcript.appendSystemMessage("You are helpful");
        transcript.appendUserMessage(Message.user("Hello"));
        transcript.appendAssistantMessage(Message.assistant("Hi there!"), null);
        transcript.close();
        
        // 等待 transcript 文件完全写入
        try {
            Thread.sleep(500);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.getStatus()).isEqualTo(ConversationService.ResumeResult.Status.RESUMED_FULL);
        assertThat(result.isResumed()).isTrue();
        assertThat(result.isUsedMemory()).isFalse();
        assertThat(result.getTotalMessages()).isEqualTo(3);
    }

    @Test
    @DisplayName("RESUMED_WITH_MEMORY - 长对话 + session-memory.md 智能恢复")
    void resumedWithMemory_longConversation() throws Exception {
        String sessionId = createTestSessionId();

        StringBuilder largeContent = new StringBuilder();
        for (int i = 0; i < 200; i++) {
            largeContent.append("这是一段很长的对话内容，用于测试 token 预算超出阈值时的智能恢复逻辑。");
        }

        SessionTranscript transcript = createTranscript(sessionId);
        transcript.appendSystemMessage("You are helpful");
        transcript.appendUserMessage(Message.user(largeContent.toString()));
        transcript.appendAssistantMessage(Message.assistant(largeContent.toString()), null);
        transcript.appendUserMessage(Message.user(largeContent.toString()));
        transcript.appendAssistantMessage(Message.assistant(largeContent.toString()), null);
        transcript.appendUserMessage(Message.user("最近的消息"));
        transcript.appendAssistantMessage(Message.assistant("最近的回复"), null);
        transcript.close();
        
        // 等待 transcript 文件完全写入
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        String memoryContent = "# Session Title\n测试会话\n\n---\n\n# Current State\n正在测试恢复\n\n---\n\n# Worklog\n1. 开始测试\n2. 继续测试";
        writeSessionMemory(sessionId, memoryContent);

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

        SessionTranscript transcript = createTranscript(sessionId);
        transcript.appendSystemMessage("You are helpful");
        transcript.appendUserMessage(Message.user("Hello"));
        transcript.appendAssistantMessage(Message.assistant("Hi!"), null);
        transcript.close();
        
        // 等待 transcript 文件完全写入
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

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

        SessionTranscript transcript = createTranscript(sessionId);
        transcript.appendSystemMessage("You are helpful");
        transcript.appendUserMessage(Message.user("Hello"));
        transcript.appendAssistantMessage(Message.assistant("Hi!"), null);
        transcript.appendUserMessage(Message.user("请继续"));
        transcript.close();
        
        // 等待 transcript 文件完全写入
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

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

        Message assistantWithToolCall = Message.assistantWithToolCalls(List.of(
            new ToolCall("call-123", new FunctionCall("read_file", "{\"path\":\"test.txt\"}"))
        ));
        assistantWithToolCall.setContent("Let me read that file");

        SessionTranscript transcript = createTranscript(sessionId);
        transcript.appendSystemMessage("You are helpful");
        transcript.appendUserMessage(Message.user("Read the file"));
        transcript.appendAssistantMessage(assistantWithToolCall, null);
        transcript.close();
        
        // 等待 transcript 文件完全写入
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

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

        SessionTranscript transcript = createTranscript(sessionId);
        transcript.appendSystemMessage("You are helpful");
        transcript.appendUserMessage(Message.user("Hello"));
        transcript.appendAssistantMessage(Message.assistant("Hi there! How can I help?"), null);
        transcript.close();
        
        // 等待 transcript 文件完全写入
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        service.resumeConversation(conv, sessionId);

        List<Message> messages = conv.getMessages();
        Message lastMsg = messages.get(messages.size() - 1);
        assertThat(lastMsg.isAssistant()).isTrue();
        assertThat(lastMsg.getContent()).doesNotContain("会话恢复提示");
        assertThat(lastMsg.getContent()).doesNotContain("会话中断");
    }

    @Test
    @DisplayName("ResumeResult 统计数据正确")
    void resumeResultStatistics() throws Exception {
        String sessionId = createTestSessionId();

        SessionTranscript transcript = createTranscript(sessionId);
        transcript.appendSystemMessage("You are helpful");
        transcript.appendUserMessage(Message.user("Hello"));
        transcript.appendAssistantMessage(Message.assistant("Hi!"), null);
        transcript.close();
        
        // 等待 transcript 文件完全写入
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.getTotalMessages()).isEqualTo(3);
        assertThat(result.getLoadedMessages()).isEqualTo(4);
    }

    @Test
    @DisplayName("web- 前缀的 sessionId 正确恢复")
    void webPrefixSessionId() throws Exception {
        String sessionId = "web-" + System.currentTimeMillis();

        SessionTranscript transcript = createTranscript(sessionId);
        transcript.appendSystemMessage("You are helpful");
        transcript.appendUserMessage(Message.user("Hello from web"));
        transcript.appendAssistantMessage(Message.assistant("Hi from web!"), null);
        transcript.close();
        
        // 等待 transcript 文件完全写入
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        Conversation conv = service.create("You are helpful", 4096, sessionId);
        ConversationService.ResumeResult result = service.resumeConversation(conv, sessionId);

        assertThat(result.isResumed()).isTrue();
        assertThat(result.getTotalMessages()).isEqualTo(3);
    }
}
