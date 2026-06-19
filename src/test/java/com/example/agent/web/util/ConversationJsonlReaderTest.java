package com.example.agent.web.util;

import com.example.agent.logging.WorkspaceManager;
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
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ConversationJsonlReader 单元测试")
class ConversationJsonlReaderTest {

    private ObjectMapper objectMapper;
    private ConversationJsonlReader reader;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        reader = new ConversationJsonlReader(objectMapper);
    }

    // =========================================================
    // 构造函数
    // =========================================================
    @Nested
    @DisplayName("构造函数")
    class ConstructorTests {

        @Test
        @DisplayName("新创建的 reader 缓存应为空")
        void constructorCreatesEmptyCache() {
            assertTrue(reader.getFileCache().isEmpty());
        }
    }

    // =========================================================
    // readMessages 解析
    // =========================================================
    @Nested
    @DisplayName("readMessages 解析 JSONL 消息")
    class ReadMessagesTests {

        @Test
        @DisplayName("解析普通的 user 和 assistant 消息")
        void parsesNormalUserAndAssistantMessages(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("normal.jsonl");
            Files.writeString(jsonl, """
                {"type":"user","message":{"id":"msg-1","role":"user","content":"你好"}}
                {"type":"assistant","message":{"id":"msg-2","role":"assistant","content":"你好！有什么可以帮你的？"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(2, messages.size());
            assertEquals("msg-1", messages.get(0).get("id"));
            assertEquals("user", messages.get(0).get("role"));
            assertEquals("你好", messages.get(0).get("content"));
            assertEquals("msg-2", messages.get(1).get("id"));
            assertEquals("assistant", messages.get(1).get("role"));
            assertEquals("你好！有什么可以帮你的？", messages.get(1).get("content"));
        }

        @Test
        @DisplayName("过滤 system 角色的消息")
        void filtersSystemMessages(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("system.jsonl");
            Files.writeString(jsonl, """
                {"type":"system","message":{"role":"system","content":"你是助手"}}
                {"type":"user","message":{"id":"msg-1","role":"user","content":"你好"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals("你好", messages.get(0).get("content"));
        }

        @Test
        @DisplayName("过滤未知角色的消息")
        void filtersUnknownRoles(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("unknown-role.jsonl");
            Files.writeString(jsonl, """
                {"type":"unknown","message":{"role":"unknown","content":"something"}}
                {"type":"user","message":{"id":"msg-1","role":"user","content":"hello"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals("hello", messages.get(0).get("content"));
        }

        @Test
        @DisplayName("过滤空白内容但保留 assistant 的 tool_calls")
        void filtersBlankContentButKeepsAssistantWithToolCalls(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("tool-calls.jsonl");
            Files.writeString(jsonl, """
                {"type":"user","message":{"id":"msg-1","role":"user","content":"查询天气"}}
                {"type":"assistant","message":{"id":"msg-2","role":"assistant","content":"","tool_calls":[{"id":"call-1","function":{"name":"get_weather","arguments":"{\\"city\\":\\"北京\\"}"}}]}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(2, messages.size());
            assertTrue(messages.get(1).containsKey("tool_calls"));
            List<Map<String, Object>> calls = (List<Map<String, Object>>) messages.get(1).get("tool_calls");
            assertEquals(1, calls.size());
            assertEquals("call-1", calls.get(0).get("id"));
            assertEquals("get_weather", calls.get(0).get("name"));
        }

        @Test
        @DisplayName("过滤空白内容但保留 tool-result 类型")
        void filtersBlankContentButKeepsToolResult(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("tool-result.jsonl");
            Files.writeString(jsonl, """
                {"type":"tool-result","message":{"id":"msg-1","role":"user","content":"","name":"get_weather","tool_call_id":"call-1"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals("get_weather", messages.get(0).get("toolName"));
            assertEquals("call-1", messages.get(0).get("toolCallId"));
        }

        @Test
        @DisplayName("过滤纯空白内容且无 tool_calls 的消息")
        void filtersBlankContentWithoutToolCalls(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("blank.jsonl");
            Files.writeString(jsonl, """
                {"type":"user","message":{"id":"msg-1","role":"user","content":""}}
                {"type":"user","message":{"id":"msg-2","role":"user","content":"hello"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals("hello", messages.get(0).get("content"));
        }

        @Test
        @DisplayName("提取 reasoning_content 字段")
        void parsesReasoningContent(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("reasoning.jsonl");
            Files.writeString(jsonl, """
                {"type":"assistant","message":{"id":"msg-1","role":"assistant","content":"答案","reasoning_content":"思考过程"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals("思考过程", messages.get(0).get("reasoning_content"));
        }

        @Test
        @DisplayName("解析 assistant 的 tool_calls 列表")
        void parsesMultipleToolCalls(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("multi-tool-calls.jsonl");
            Files.writeString(jsonl, """
                {"type":"assistant","message":{"id":"msg-1","role":"assistant","content":"","tool_calls":[{"id":"call-1","function":{"name":"func_a","arguments":"{}"}},{"id":"call-2","function":{"name":"func_b","arguments":"{\\"key\\":\\"val\\"}"}}]}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            List<Map<String, Object>> calls = (List<Map<String, Object>>) messages.get(0).get("tool_calls");
            assertEquals(2, calls.size());
            assertEquals("func_a", calls.get(0).get("name"));
            assertEquals("func_b", calls.get(1).get("name"));
            assertEquals("{\"key\":\"val\"}", calls.get(1).get("arguments"));
        }

        @Test
        @DisplayName("tool 消息默认 success 为 true")
        void parsesToolResultSuccess(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("tool-ok.jsonl");
            Files.writeString(jsonl, """
                {"type":"tool-result","message":{"id":"msg-1","role":"user","content":"成功执行","name":"calculator","tool_call_id":"call-1"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals("calculator", messages.get(0).get("toolName"));
            assertEquals("call-1", messages.get(0).get("toolCallId"));
            assertEquals(true, messages.get(0).get("success"));
        }

        @Test
        @DisplayName("tool 消息 content 含错误关键词时 success 为 false")
        void infersToolFailureFromErrorKeywords(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("tool-error.jsonl");
            Files.writeString(jsonl, """
                {"type":"tool-result","message":{"id":"msg-1","role":"user","content":"执行失败：权限拒绝","name":"file_write","tool_call_id":"call-1"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals(false, messages.get(0).get("success"));
        }

        @Test
        @DisplayName("tool 消息 content 含 error: 关键词时 success 为 false")
        void infersToolFailureFromErrorColonKeyword(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("tool-error-colon.jsonl");
            Files.writeString(jsonl, """
                {"type":"tool-result","message":{"id":"msg-1","role":"user","content":"error: something went wrong","name":"api_call","tool_call_id":"call-1"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals(false, messages.get(0).get("success"));
        }

        @Test
        @DisplayName("tool 消息 msgNode.isError=true 时 success 为 false")
        void infersToolFailureFromIsErrorFlag(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("tool-iserror.jsonl");
            Files.writeString(jsonl, """
                {"type":"tool-result","message":{"id":"msg-1","role":"user","content":"执行出错","name":"file_read","tool_call_id":"call-1","isError":true}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals(false, messages.get(0).get("success"));
        }

        @Test
        @DisplayName("tool 消息顶层 toolSuccess=false 时 success 为 false")
        void infersToolFailureFromToolSuccessNode(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("tool-toolsuccess.jsonl");
            Files.writeString(jsonl, """
                {"type":"tool-result","toolSuccess":false,"message":{"id":"msg-1","role":"user","content":"操作完成","name":"db_query","tool_call_id":"call-1"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(1, messages.size());
            assertEquals(false, messages.get(0).get("success"));
        }

        @Test
        @DisplayName("跳过格式错误的 JSON 行")
        void skipsMalformedJsonLines(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("malformed.jsonl");
            Files.writeString(jsonl, """
                {"type":"user","message":{"id":"msg-1","role":"user","content":"hello"}}
                这不是合法的JSON
                {"type":"user","message":{"id":"msg-2","role":"user","content":"world"}}
                """.stripIndent());

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertEquals(2, messages.size());
            assertEquals("hello", messages.get(0).get("content"));
            assertEquals("world", messages.get(1).get("content"));
        }

        @Test
        @DisplayName("文件不存在时返回空列表")
        void returnsEmptyListForNonexistentFile(@TempDir Path tempDir) {
            Path nonExistent = tempDir.resolve("nope.jsonl");

            List<Map<String, Object>> messages = reader.readMessages(nonExistent);

            assertTrue(messages.isEmpty());
        }

        @Test
        @DisplayName("空文件返回空列表")
        void returnsEmptyListForEmptyFile(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("empty.jsonl");
            Files.createFile(jsonl);

            List<Map<String, Object>> messages = reader.readMessages(jsonl);

            assertTrue(messages.isEmpty());
        }
    }

    // =========================================================
    // extractFirstUserMessage 提取标题
    // =========================================================
    @Nested
    @DisplayName("extractFirstUserMessage 提取标题")
    class ExtractFirstUserMessageTests {

        @Test
        @DisplayName("custom-title 优先级高于首条用户消息")
        void customTitleTakesPriority(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("custom-title.jsonl");
            Files.writeString(jsonl, """
                {"type":"custom-title","title":"我的自定义标题"}
                {"type":"user","message":{"id":"msg-1","role":"user","content":"第一条用户消息"}}
                """.stripIndent());

            String title = reader.extractFirstUserMessage(jsonl);

            assertEquals("我的自定义标题", title);
        }

        @Test
        @DisplayName("无 custom-title 时回退到首条用户消息")
        void fallsBackToFirstUserMessage(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("first-user.jsonl");
            Files.writeString(jsonl, """
                {"type":"user","message":{"id":"msg-1","role":"user","content":"帮我写个函数"}}
                {"type":"assistant","message":{"id":"msg-2","role":"assistant","content":"好的"}}
                """.stripIndent());

            String title = reader.extractFirstUserMessage(jsonl);

            assertEquals("帮我写个函数", title);
        }

        @Test
        @DisplayName("custom-title 为空字符串时回退到用户消息")
        void customTitleBlankFallsBackToUser(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("blank-title.jsonl");
            Files.writeString(jsonl, """
                {"type":"custom-title","title":""}
                {"type":"user","message":{"id":"msg-1","role":"user","content":"实际用户消息"}}
                """.stripIndent());

            String title = reader.extractFirstUserMessage(jsonl);

            assertEquals("实际用户消息", title);
        }

        @Test
        @DisplayName("无用户消息时返回 null")
        void returnsNullWhenNoUserMessage(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("no-user.jsonl");
            Files.writeString(jsonl, """
                {"type":"assistant","message":{"role":"assistant","content":"只有助手消息"}}
                """.stripIndent());

            String title = reader.extractFirstUserMessage(jsonl);

            assertNull(title);
        }

        @Test
        @DisplayName("空文件返回 null")
        void returnsNullForEmptyFile(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("empty.jsonl");
            Files.createFile(jsonl);

            String title = reader.extractFirstUserMessage(jsonl);

            assertNull(title);
        }

        @Test
        @DisplayName("文件不存在时返回 null")
        void returnsNullForNonexistentFile() {
            Path nonExistent = Path.of("nonexistent", "file.jsonl");

            String title = reader.extractFirstUserMessage(nonExistent);

            assertNull(title);
        }

        @Test
        @DisplayName("custom-title 在中间位置仍被优先检测")
        void customTitleInMiddleStillTakesPriority(@TempDir Path tempDir) throws Exception {
            Path jsonl = tempDir.resolve("title-in-middle.jsonl");
            Files.writeString(jsonl, """
                {"type":"user","message":{"id":"msg-1","role":"user","content":"用户消息在前"}}
                {"type":"custom-title","title":"中间的标题"}
                {"type":"user","message":{"id":"msg-2","role":"user","content":"另一条用户消息"}}
                """.stripIndent());

            String title = reader.extractFirstUserMessage(jsonl);

            assertEquals("中间的标题", title);
        }
    }

    // =========================================================
    // 文件缓存（依赖 WorkspaceManager）
    // =========================================================
    @Nested
    @DisplayName("文件缓存管理 (refreshFileCache / findJsonlFile)")
    class FileCacheTests {

        private Path originalHippoRoot;

        @BeforeEach
        void setUp(@TempDir Path tempDir) throws Exception {
            originalHippoRoot = getStaticField(WorkspaceManager.class, "HIPPO_ROOT");

            WorkspaceManager.overrideBasePath(tempDir);
            reader.refreshFileCache();
        }

        @AfterEach
        void tearDown() throws Exception {
            setStaticField(WorkspaceManager.class, "HIPPO_ROOT", originalHippoRoot);
        }

        @Test
        @DisplayName("refreshFileCache 扫描目录结构并填充缓存")
        void refreshFileCachePopulatesFromDirectoryStructure(@TempDir Path tempDir) throws Exception {
            Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("session-alpha"));
            Files.createFile(dateDir.resolve("session-alpha").resolve("conversation.jsonl"));

            reader.refreshFileCache();

            assertEquals(1, reader.getFileCache().size());
            assertTrue(reader.getFileCache().containsKey("session-alpha"));
            assertEquals(
                dateDir.resolve("session-alpha").resolve("conversation.jsonl"),
                reader.getFileCache().get("session-alpha")
            );
        }

        @Test
        @DisplayName("refreshFileCache 清除之前的缓存条目")
        void refreshFileCacheClearsPreviousEntries(@TempDir Path tempDir) throws Exception {
            Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("session-old"));
            Files.createFile(dateDir.resolve("session-old").resolve("conversation.jsonl"));

            reader.refreshFileCache();
            assertEquals(1, reader.getFileCache().size());

            Files.delete(dateDir.resolve("session-old").resolve("conversation.jsonl"));
            Files.delete(dateDir.resolve("session-old"));
            Files.createDirectories(dateDir.resolve("session-new"));
            Files.createFile(dateDir.resolve("session-new").resolve("conversation.jsonl"));

            reader.refreshFileCache();

            assertEquals(1, reader.getFileCache().size());
            assertFalse(reader.getFileCache().containsKey("session-old"));
            assertTrue(reader.getFileCache().containsKey("session-new"));
        }

        @Test
        @DisplayName("sessions 目录不存在时缓存保持空")
        void refreshFileCacheHandlesMissingSessionsDir() {
            assertTrue(reader.getFileCache().isEmpty());
        }

        @Test
        @DisplayName("findJsonlFile 在缓存命中时直接返回")
        void findJsonlFileReturnsCachedPath(@TempDir Path tempDir) throws Exception {
            Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("session-x"));
            Path jsonlPath = dateDir.resolve("session-x").resolve("conversation.jsonl");
            Files.createFile(jsonlPath);

            reader.refreshFileCache();

            Path result = reader.findJsonlFile("session-x");

            assertEquals(jsonlPath, result);
        }

        @Test
        @DisplayName("findJsonlFile 在未缓存时刷新并查找")
        void findJsonlFileRefreshesOnCacheMiss(@TempDir Path tempDir) throws Exception {
            Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("session-y"));
            Path jsonlPath = dateDir.resolve("session-y").resolve("conversation.jsonl");
            Files.createFile(jsonlPath);

            Path result = reader.findJsonlFile("session-y");

            assertEquals(jsonlPath, result);
        }

        @Test
        @DisplayName("findJsonlFile 对不存在的会话返回 null")
        void findJsonlFileReturnsNullForUnknownSession() {
            Path result = reader.findJsonlFile("non-existent-session");

            assertNull(result);
        }

        @Test
        @DisplayName("跳过没有 conversation.jsonl 的会话目录")
        void skipSessionDirsWithoutJsonlFile(@TempDir Path tempDir) throws Exception {
            Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");
            Path dateDir = sessionsDir.resolve("2024-01-01");
            Files.createDirectories(dateDir.resolve("session-without-jsonl"));

            reader.refreshFileCache();

            assertTrue(reader.getFileCache().isEmpty());
        }

        @Test
        @DisplayName("扫描多日期多会话目录")
        void scansMultipleDateAndSessionDirs(@TempDir Path tempDir) throws Exception {
            Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");
            Files.createDirectories(sessionsDir.resolve("2024-01-01").resolve("session-a"));
            Files.createFile(sessionsDir.resolve("2024-01-01").resolve("session-a").resolve("conversation.jsonl"));
            Files.createDirectories(sessionsDir.resolve("2024-01-02").resolve("session-b"));
            Files.createFile(sessionsDir.resolve("2024-01-02").resolve("session-b").resolve("conversation.jsonl"));
            Files.createDirectories(sessionsDir.resolve("2024-01-02").resolve("session-c"));
            Files.createFile(sessionsDir.resolve("2024-01-02").resolve("session-c").resolve("conversation.jsonl"));

            reader.refreshFileCache();

            assertEquals(3, reader.getFileCache().size());
            assertTrue(reader.getFileCache().containsKey("session-a"));
            assertTrue(reader.getFileCache().containsKey("session-b"));
            assertTrue(reader.getFileCache().containsKey("session-c"));
        }
    }

    // =========================================================
    // 缓存基本操作
    // =========================================================
    @Nested
    @DisplayName("缓存基本操作 (getFileCache / removeFromCache)")
    class BasicCacheOperationsTests {

        @Test
        @DisplayName("removeFromCache 移除指定条目")
        void removeFromCacheRemovesEntry() {
            reader.getFileCache().put("test-session", Path.of("test.jsonl"));

            reader.removeFromCache("test-session");

            assertFalse(reader.getFileCache().containsKey("test-session"));
        }

        @Test
        @DisplayName("removeFromCache 不存在的 key 不抛异常")
        void removeFromCacheNonExistentDoesNotThrow() {
            assertDoesNotThrow(() -> reader.removeFromCache("non-existent"));
        }

        @Test
        @DisplayName("getFileCache 返回可变映射")
        void getFileCacheReturnsModifiableMap() {
            Map<String, Path> cache = reader.getFileCache();
            cache.put("key1", Path.of("p1.jsonl"));
            cache.put("key2", Path.of("p2.jsonl"));

            assertEquals(2, reader.getFileCache().size());
        }
    }

    // =========================================================
    // 反射工具方法
    // =========================================================
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
