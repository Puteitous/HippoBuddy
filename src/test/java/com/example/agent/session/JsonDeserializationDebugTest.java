package com.example.agent.session;

import com.example.agent.llm.model.Message;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class JsonDeserializationDebugTest {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void testDeserialization() throws Exception {
        String json = """
            {"type":"user","uuid":"msg-001","sessionId":"test","timestamp":"2026-05-06T04:41:14.152095300Z","version":"1.0.0","cwd":"E:\\\\Test","message":{"id":"msg-001","role":"user","content":"你好呀","user":true,"system":false,"assistant":false},"typeEnum":"USER"}
            """;

        System.out.println("JSON: " + json);
        
        try {
            TranscriptEntry entry = objectMapper.readValue(json, TranscriptEntry.class);
            
            System.out.println("Type: " + entry.getType());
            System.out.println("TypeEnum: " + entry.getTypeEnum());
            System.out.println("Uuid: " + entry.getUuid());
            System.out.println("Message: " + entry.getMessage());
            
            if (entry.getMessage() != null) {
                System.out.println("Message.role: " + entry.getMessage().getRole());
                System.out.println("Message.content: " + entry.getMessage().getContent());
            } else {
                System.out.println("Message is NULL!");
            }
            
            assertNotNull(entry.getMessage(), "Message 不应该为 null");
            assertEquals("user", entry.getMessage().getRole());
            assertEquals("你好呀", entry.getMessage().getContent());
        } catch (Exception e) {
            System.out.println("反序列化失败：" + e.getMessage());
            e.printStackTrace();
            fail("反序列化失败：" + e.getMessage());
        }
    }

    @Test
    void testMessageDeserialization() throws Exception {
        String messageJson = """
            {"id":"msg-001","role":"user","content":"你好呀","user":true,"system":false,"assistant":false}
            """;

        System.out.println("Message JSON: " + messageJson);
        
        Message message = objectMapper.readValue(messageJson, Message.class);
        
        System.out.println("Message.role: " + message.getRole());
        System.out.println("Message.content: " + message.getContent());
        
        assertNotNull(message);
        assertEquals("user", message.getRole());
        assertEquals("你好呀", message.getContent());
    }
}
