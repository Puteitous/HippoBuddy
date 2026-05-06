package com.example.agent.session;

import com.example.agent.llm.model.Message;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 测试 TranscriptLoader 对 conversation.jsonl 格式的兼容性
 * 
 * conversation.jsonl 格式特点：
 * - 外层有 type, uuid, sessionId, timestamp, version, cwd 等字段
 * - message 对象包含 id, role, content 等字段
 * - typeEnum 字段标识消息类型（USER/ASSISTANT）
 */
class ConversationJsonlCompatibilityTest {

    private Path tempTranscriptFile;
    private String testSessionId;

    @BeforeEach
    void setUp() throws IOException {
        testSessionId = "test-conversation-jsonl-" + System.currentTimeMillis();
        tempTranscriptFile = Files.createTempFile("conversation-", ".jsonl");
    }

    @AfterEach
    void tearDown() throws IOException {
        if (Files.exists(tempTranscriptFile)) {
            Files.delete(tempTranscriptFile);
        }
    }

    @Test
    void testLoadConversationJsonlFormat() throws IOException {
        String jsonlContent = """
            {"type":"user","uuid":"msg-001","sessionId":"%s","timestamp":"2026-05-06T04:41:14.152095300Z","version":"1.0.0","cwd":"E:\\\\Test","message":{"id":"msg-001","role":"user","content":"你好呀","user":true,"system":false,"assistant":false},"typeEnum":"USER"}
            {"type":"assistant","uuid":"msg-002","sessionId":"%s","timestamp":"2026-05-06T04:41:17.263416800Z","version":"1.0.0","cwd":"E:\\\\Test","message":{"id":"msg-002","role":"assistant","content":"你好！有什么可以帮你的？","user":false,"system":false,"assistant":true},"typeEnum":"ASSISTANT"}
            {"type":"user","uuid":"msg-003","sessionId":"%s","timestamp":"2026-05-06T04:41:32.558766100Z","version":"1.0.0","cwd":"E:\\\\Test","message":{"id":"msg-003","role":"user","content":"你知道金子吗","user":true,"system":false,"assistant":false},"typeEnum":"USER"}
            """.formatted(testSessionId, testSessionId, testSessionId);

        Files.writeString(tempTranscriptFile, jsonlContent, StandardCharsets.UTF_8);

        TranscriptLoader.LoadResult result = TranscriptLoader.load(tempTranscriptFile);

        assertEquals(3, result.getMessages().size(), "应该加载 3 条消息");
        
        Message msg1 = result.getMessages().get(0);
        assertEquals("user", msg1.getRole());
        assertEquals("你好呀", msg1.getContent());

        Message msg2 = result.getMessages().get(1);
        assertEquals("assistant", msg2.getRole());
        assertEquals("你好！有什么可以帮你的？", msg2.getContent());

        Message msg3 = result.getMessages().get(2);
        assertEquals("user", msg3.getRole());
        assertEquals("你知道金子吗", msg3.getContent());
    }

    @Test
    void testLoadMixedFormat() throws IOException {
        String jsonlContent = """
            {"type":"user","uuid":"msg-001","sessionId":"%s","timestamp":"2026-05-06T04:41:14.152095300Z","message":{"id":"msg-001","role":"user","content":"User message"},"typeEnum":"USER"}
            {"type":"assistant","uuid":"msg-002","sessionId":"%s","timestamp":"2026-05-06T04:41:17.263416800Z","message":{"id":"msg-002","role":"assistant","content":"Assistant response"},"typeEnum":"ASSISTANT"}
            """.formatted(testSessionId, testSessionId);

        Files.writeString(tempTranscriptFile, jsonlContent, StandardCharsets.UTF_8);

        TranscriptLoader.LoadResult result = TranscriptLoader.load(tempTranscriptFile);

        assertEquals(2, result.getMessages().size());
        assertEquals("user", result.getMessages().get(0).getRole());
        assertEquals("assistant", result.getMessages().get(1).getRole());
    }

    @Test
    void testLoadSystemMessage() throws IOException {
        String jsonlContent = """
            {"type":"system","uuid":"msg-001","sessionId":"%s","timestamp":"2026-05-06T04:41:14.152095300Z","message":{"id":"msg-001","role":"system","content":"You are a helpful assistant"},"typeEnum":"SYSTEM"}
            """.formatted(testSessionId);

        Files.writeString(tempTranscriptFile, jsonlContent, StandardCharsets.UTF_8);

        TranscriptLoader.LoadResult result = TranscriptLoader.load(tempTranscriptFile);

        assertEquals(1, result.getMessages().size());
        assertEquals("system", result.getMessages().get(0).getRole());
        assertEquals("You are a helpful assistant", result.getMessages().get(0).getContent());
    }

    @Test
    void testRealConversationFromHippo() throws IOException {
        String realJsonlContent = """
            {"type":"user","uuid":"143ac6de-639c-499e-8c81-4d42b19e299c","sessionId":"web-1778042465788","timestamp":"2026-05-06T04:41:14.152095300Z","version":"1.0.0","cwd":"E:\\\\Trae_projects\\\\Hippo Code","message":{"id":"143ac6de-639c-499e-8c81-4d42b19e299c","role":"user","content":"你好呀","user":true,"system":false,"assistant":false,"memorySaved":false,"apiVisible":true,"tool":false},"typeEnum":"USER"}
            {"type":"assistant","uuid":"cc2375c6-1e50-4a83-8f46-e43a7c47f53f","sessionId":"web-1778042465788","timestamp":"2026-05-06T04:41:17.263416800Z","version":"1.0.0","cwd":"E:\\\\Trae_projects\\\\Hippo Code","message":{"id":"cc2375c6-1e50-4a83-8f46-e43a7c47f53f","role":"assistant","content":"\\n\\n你好呀！我是河马侠，很高兴为你服务！👋\\n\\n有什么我可以帮你的吗？","user":false,"system":false,"assistant":true,"memorySaved":false,"apiVisible":true,"tool":false},"typeEnum":"ASSISTANT"}
            """;

        Files.writeString(tempTranscriptFile, realJsonlContent, StandardCharsets.UTF_8);

        TranscriptLoader.LoadResult result = TranscriptLoader.load(tempTranscriptFile);

        assertEquals(2, result.getMessages().size(), "应该成功加载真实对话数据");
        
        Message userMsg = result.getMessages().get(0);
        assertEquals("user", userMsg.getRole());
        assertEquals("你好呀", userMsg.getContent());

        Message assistantMsg = result.getMessages().get(1);
        assertEquals("assistant", assistantMsg.getRole());
        assertTrue(assistantMsg.getContent().contains("河马侠"));
    }
}
