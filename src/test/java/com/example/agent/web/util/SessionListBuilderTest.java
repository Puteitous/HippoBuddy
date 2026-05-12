package com.example.agent.web.util;

import com.example.agent.domain.conversation.Conversation;
import com.example.agent.service.TokenEstimatorFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SessionListBuilder 单元测试")
class SessionListBuilderTest {

    private ObjectMapper objectMapper;
    private ConversationJsonlReader jsonlReader;
    private SessionListBuilder builder;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        jsonlReader = new ConversationJsonlReader(objectMapper);
        builder = new SessionListBuilder(jsonlReader);
    }

    private Conversation createConversation(String sessionId, String... userMessages) {
        Conversation conv = new Conversation(10000, TokenEstimatorFactory.getDefault(), sessionId);
        for (String msg : userMessages) {
            if (msg != null) {
                conv.addMessage(new com.example.agent.llm.model.Message("user", msg));
            }
        }
        return conv;
    }

    // =========================================================
    // buildSessionList 会话列表构建
    // =========================================================
    @Nested
    @DisplayName("buildSessionList 列表构建")
    class BuildSessionListTests {

        private Path originalHippoRoot;
        private String originalProjectKey;

        @BeforeEach
        void setUp(@TempDir Path tempDir) throws Exception {
            originalHippoRoot = getStaticField(com.example.agent.logging.WorkspaceManager.class, "HIPPO_ROOT");
            originalProjectKey = getStaticField(com.example.agent.logging.WorkspaceManager.class, "CURRENT_PROJECT_KEY");
            com.example.agent.logging.WorkspaceManager.overrideBasePath(tempDir);
            jsonlReader.refreshFileCache();
        }

        @AfterEach
        void tearDown() throws Exception {
            setStaticField(com.example.agent.logging.WorkspaceManager.class, "HIPPO_ROOT", originalHippoRoot);
            setStaticField(com.example.agent.logging.WorkspaceManager.class, "CURRENT_PROJECT_KEY", originalProjectKey);
        }

        @Test
        @DisplayName("活跃会话为空且文件缓存为空时返回空列表")
        void emptySessionsAndCacheReturnsEmpty() {
            List<Map<String, Object>> result = builder.buildSessionList(new HashMap<>());
            assertTrue(result.isEmpty());
        }

        @Test
        @DisplayName("活跃会话的标题来自首条用户消息")
        void activeSessionTitleFromFirstUserMessage() {
            Map<String, Conversation> activeSessions = new HashMap<>();
            Conversation conv = createConversation("sess-1", "帮我写个函数");
            activeSessions.put("sess-1", conv);

            List<Map<String, Object>> result = builder.buildSessionList(activeSessions);

            assertEquals(1, result.size());
            assertEquals("sess-1", result.get(0).get("id"));
            assertEquals(true, result.get(0).get("active"));
            assertEquals("帮我写个函数", result.get(0).get("title"));
        }

        @Test
        @DisplayName("标题超过 30 字符时截断加省略号")
        void titleTruncatedAt30Chars() {
            String longMessage = "请帮我写一个非常复杂的函数用来处理用户数据的排序和过滤以及转换操作";
            Map<String, Conversation> activeSessions = new HashMap<>();
            Conversation conv = createConversation("sess-1", longMessage);
            activeSessions.put("sess-1", conv);

            List<Map<String, Object>> result = builder.buildSessionList(activeSessions);

            assertEquals(1, result.size());
            String title = (String) result.get(0).get("title");
            assertNotNull(title);
            assertTrue(title.endsWith("..."));
            assertEquals(33, title.length());
        }

        @Test
        @DisplayName("文件缓存中的非活跃会话加入列表")
        void inactiveSessionsFromFileCache() throws Exception {
            Path sessionsDir = com.example.agent.logging.WorkspaceManager.getCurrentProjectDir().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("archived-1"));
            Path jsonl = dateDir.resolve("archived-1").resolve("conversation.jsonl");
            String line = "{\"type\":\"user\",\"message\":{\"id\":\"msg-1\",\"role\":\"user\",\"content\":\"旧会话消息\"}}";
            Files.writeString(jsonl, line);

            Map<String, Conversation> activeSessions = new HashMap<>();

            List<Map<String, Object>> result = builder.buildSessionList(activeSessions);

            assertEquals(1, result.size());
            assertEquals("archived-1", result.get(0).get("id"));
            assertEquals(false, result.get(0).get("active"));
            assertEquals("旧会话消息", result.get(0).get("title"));
            assertEquals(1, result.get(0).get("messageCount"));
        }

        @Test
        @DisplayName("活跃会话优先于文件缓存，不重复")
        void activeSessionTakesPriority() throws Exception {
            Path sessionsDir = com.example.agent.logging.WorkspaceManager.getCurrentProjectDir().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("sess-1"));
            Path jsonl = dateDir.resolve("sess-1").resolve("conversation.jsonl");
            String line = "{\"type\":\"user\",\"message\":{\"id\":\"msg-1\",\"role\":\"user\",\"content\":\"缓存中的标题\"}}";
            Files.writeString(jsonl, line);

            Map<String, Conversation> activeSessions = new HashMap<>();
            Conversation conv = createConversation("sess-1", "活跃会话标题");
            activeSessions.put("sess-1", conv);

            List<Map<String, Object>> result = builder.buildSessionList(activeSessions);

            assertEquals(1, result.size());
            assertEquals(true, result.get(0).get("active"));
        }

        @Test
        @DisplayName("按时间戳降序排序，相同时按 sessionId 降序")
        void sortedByTimestampDescThenSessionIdDesc() {
            Map<String, Conversation> activeSessions = new HashMap<>();
            activeSessions.put("web-300", createConversation("web-300"));
            activeSessions.put("web-100", createConversation("web-100"));
            activeSessions.put("web-200", createConversation("web-200"));

            List<Map<String, Object>> result = builder.buildSessionList(activeSessions);

            assertEquals(3, result.size());
            assertEquals("web-300", result.get(0).get("id"));
            assertEquals("web-200", result.get(1).get("id"));
            assertEquals("web-100", result.get(2).get("id"));
        }

        @Test
        @DisplayName("活跃会话标题优先从 JSONL 文件缓存中取")
        void activeSessionTitleFromJsonlWhenAvailable() throws Exception {
            Path sessionsDir = com.example.agent.logging.WorkspaceManager.getCurrentProjectDir().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("sess-1"));
            Path jsonl = dateDir.resolve("sess-1").resolve("conversation.jsonl");
            String line = "{\"type\":\"custom-title\",\"title\":\"来自JSONL的标题\"}";
            Files.writeString(jsonl, line);
            jsonlReader.refreshFileCache();

            Map<String, Conversation> activeSessions = new HashMap<>();
            Conversation conv = createConversation("sess-1", "来自会话的用户消息");
            activeSessions.put("sess-1", conv);

            List<Map<String, Object>> result = builder.buildSessionList(activeSessions);

            assertEquals(1, result.size());
            assertEquals("来自JSONL的标题", result.get(0).get("title"));
        }

        @Test
        @DisplayName("活跃+非活跃混合列表构建")
        void mixedActiveAndInactiveSessions() throws Exception {
            Path sessionsDir = com.example.agent.logging.WorkspaceManager.getCurrentProjectDir().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("inactive-1"));
            Path jsonl1 = dateDir.resolve("inactive-1").resolve("conversation.jsonl");
            String line1 = "{\"type\":\"user\",\"message\":{\"id\":\"msg-1\",\"role\":\"user\",\"content\":\"非活跃会话\"}}";
            Files.writeString(jsonl1, line1);

            Map<String, Conversation> activeSessions = new HashMap<>();
            Conversation conv = createConversation("active-1", "活跃会话");
            conv.addMessage(new com.example.agent.llm.model.Message("assistant", "回答"));
            activeSessions.put("active-1", conv);

            List<Map<String, Object>> result = builder.buildSessionList(activeSessions);

            assertEquals(2, result.size());
        }
    }

    // =========================================================
    // extractTimestamp 静态方法
    // =========================================================
    @Nested
    @DisplayName("extractTimestamp 提取时间戳")
    class ExtractTimestampTests {

        @Test
        @DisplayName("\"web-\" 前缀提取后缀")
        void webPrefix() {
            assertEquals("1234567890", SessionListBuilder.extractTimestamp("web-1234567890"));
        }

        @Test
        @DisplayName("\"test-session-\" 前缀提取后缀")
        void testSessionPrefix() {
            assertEquals("1234567890", SessionListBuilder.extractTimestamp("test-session-1234567890"));
        }

        @Test
        @DisplayName("最后一段 dash 分隔的数字")
        void lastDashNumber() {
            assertEquals("987654", SessionListBuilder.extractTimestamp("session-987654"));
        }

        @Test
        @DisplayName("纯数字直接返回")
        void allDigits() {
            assertEquals("555555", SessionListBuilder.extractTimestamp("555555"));
        }

        @Test
        @DisplayName("null 返回 \"0\"")
        void nullReturnsZero() {
            assertEquals("0", SessionListBuilder.extractTimestamp(null));
        }

        @Test
        @DisplayName("无匹配格式返回 \"0\"")
        void noMatchReturnsZero() {
            assertEquals("0", SessionListBuilder.extractTimestamp("unknown-format-session"));
        }

        @Test
        @DisplayName("最后 dash 后的非数字部分不匹配")
        void lastDashNonNumeric() {
            assertEquals("0", SessionListBuilder.extractTimestamp("session-abc"));
        }
    }

    // =========================================================
    // parseTimestamp 静态方法
    // =========================================================
    @Nested
    @DisplayName("parseTimestamp 解析时间戳")
    class ParseTimestampTests {

        @Test
        @DisplayName("有效数字字符串转为 long")
        void validNumber() {
            assertEquals(12345L, SessionListBuilder.parseTimestamp("12345"));
        }

        @Test
        @DisplayName("无效格式返回 0")
        void invalidFormatReturnsZero() {
            assertEquals(0L, SessionListBuilder.parseTimestamp("not-a-number"));
        }

        @Test
        @DisplayName("空字符串返回 0")
        void emptyStringReturnsZero() {
            assertEquals(0L, SessionListBuilder.parseTimestamp(""));
        }
    }

    private Path createSessionJsonl(Path tempDir, String sessionId, String userMessage) throws IOException {
        Path sessionDir = tempDir.resolve(sessionId);
        Files.createDirectories(sessionDir);
        Path jsonl = sessionDir.resolve("conversation.jsonl");
        String line = "{\"type\":\"user\",\"message\":{\"id\":\"msg-1\",\"role\":\"user\",\"content\":\"" + userMessage + "\"}}";
        Files.writeString(jsonl, line);
        return jsonl;
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
}
