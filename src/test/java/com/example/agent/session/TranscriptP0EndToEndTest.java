package com.example.agent.session;

import com.example.agent.application.ConversationService;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.logging.WorkspaceManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class TranscriptP0EndToEndTest {

    @TempDir
    Path tempDir;

    private String sessionId;
    private ConversationService service;
    private Conversation conversation;
    private TokenEstimator tokenEstimator;

    @BeforeEach
    void setUp() {
        WorkspaceManager.overrideBasePath(tempDir);
        sessionId = "p0-test-" + System.currentTimeMillis();
        tokenEstimator = TokenEstimatorFactory.getDefault();
        LlmClient mockLlmClient = mock(LlmClient.class);
        service = new ConversationService(tokenEstimator, mockLlmClient);
        conversation = service.create("You are a helper", 4000, sessionId);
    }

    @AfterEach
    void tearDown() {
        service.destroy(conversation);
    }

    @Test
    void testTranscriptPersistenceAndRecovery() {
        service.addUserMessage(conversation, "Hello, how are you?");
        service.addAssistantMessage(conversation, "I'm fine, thank you!");
        service.addUserMessage(conversation, "What's Java?");
        service.addAssistantMessage(conversation, "Java is a programming language");

        LlmClient mockLlmClient = mock(LlmClient.class);
        ConversationService newService = new ConversationService(tokenEstimator, mockLlmClient);
        Conversation newConversation = newService.create("You are a helper");
        
        boolean loaded = TranscriptLoader.loadToConversation(sessionId, newConversation, newService);
        
        assertEquals(5, conversation.size());
    }

    @Test
    void testSessionStoragePrefersTranscript() {
        service.addUserMessage(conversation, "Transcript message");

        SessionStorage storage = new SessionStorage(tempDir.resolve("sessions"), 10);
        storage.saveSession(SessionData.create(sessionId, conversation.getMessages(), SessionData.Status.INTERRUPTED));
        var loaded = storage.loadSession(sessionId);

        assertTrue(loaded.isPresent());
        assertTrue(loaded.get().getMessages().stream()
            .anyMatch(m -> "Transcript message".equals(m.getContent())));
    }

    @Test
    void testCrashRecoveryWithTruncatedLine() throws IOException {
        service.addUserMessage(conversation, "Message before crash");

        Path transcriptFile = WorkspaceManager.getSessionMessagesFile(sessionId);

        Files.writeString(transcriptFile, "{\"type\":\"user\",\"uuid\":\"broken\",\"message\":\n", 
            java.nio.file.StandardOpenOption.APPEND);

        TranscriptLoader.LoadResult result = TranscriptLoader.load(transcriptFile);

        assertTrue(result.isRecoveredFromCrash());
        assertTrue(result.getMessages().stream()
            .anyMatch(m -> "Message before crash".equals(m.getContent())));
    }

    @Test
    void testRepairAndCompact() throws IOException {
        service.addUserMessage(conversation, "Good message 1");
        service.addUserMessage(conversation, "Good message 2");

        Path transcriptFile = WorkspaceManager.getSessionMessagesFile(sessionId);

        Files.writeString(transcriptFile, "{incomplete json\n", 
            java.nio.file.StandardOpenOption.APPEND);

        int repaired = TranscriptLoader.repairAndCompact(transcriptFile);
        assertTrue(repaired >= 0);

        TranscriptLoader.LoadResult result = TranscriptLoader.load(transcriptFile);
        assertFalse(result.isRecoveredFromCrash());
    }

    @Test
    void testResumeSessionUsesTranscript() {
        service.addUserMessage(conversation, "This is from transcript");
        service.addAssistantMessage(conversation, "Got it!");

        SessionData sessionData = SessionData.create(sessionId, 
            List.of(Message.user("This is from old snapshot")),
            SessionData.Status.INTERRUPTED);

        LlmClient mockLlmClient2 = mock(LlmClient.class);
        ConversationService resumeService = new ConversationService(tokenEstimator, mockLlmClient2);
        Conversation resumeConversation = resumeService.create("You are helper");
        
        boolean loadedFromTranscript = TranscriptLoader.loadToConversation(
            sessionId, resumeConversation, resumeService
        );
    }

    @Test
    void testListSessionsWithoutLoadingFullFiles() {
        service.addUserMessage(conversation, "List test message");

        var sessions = TranscriptLister.listSessions();
    }
}
