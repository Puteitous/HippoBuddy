package com.example.agent.web.logging;

import com.example.agent.logging.WorkspaceManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SessionLogger 单元测试")
class SessionLoggerTest {

    private Path originalHippoRoot;
    private String originalProjectKey;

    @BeforeEach
    void setUp(@TempDir Path tempDir) throws Exception {
        originalHippoRoot = getStaticField(WorkspaceManager.class, "HIPPO_ROOT");
        originalProjectKey = getStaticField(WorkspaceManager.class, "CURRENT_PROJECT_KEY");
        WorkspaceManager.overrideBasePath(tempDir);
    }

    @AfterEach
    void tearDown() throws Exception {
        setStaticField(WorkspaceManager.class, "HIPPO_ROOT", originalHippoRoot);
        setStaticField(WorkspaceManager.class, "CURRENT_PROJECT_KEY", originalProjectKey);
    }

    private void createLogFile(String sessionId, String... lines) throws Exception {
        Path logRoot = WorkspaceManager.getHippoRoot().resolve("logs/conversations");
        Path dateDir = logRoot.resolve("2024-01-15");
        Files.createDirectories(dateDir);
        Path logFile = dateDir.resolve(sessionId + ".log");
        Files.writeString(logFile, String.join("\n", lines));
    }

    @Nested
    @DisplayName("getTokenStats 文件查找")
    class FileLookupTests {

        @Test
        @DisplayName("日志文件不存在时返回 null")
        void returnsNullWhenLogFileNotFound() {
            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("non-existent-session");

            assertNull(stats);
        }

        @Test
        @DisplayName("在日期子目录中查找并正确解析日志文件")
        void findsLogFileInDateSubdirectory() throws Exception {
            createLogFile("session-123",
                "═══════════════════════════════════════════════════════════════════════════════",
                "会话 ID: session-123",
                "开始时间：2024-01-15 10:30:00",
                "═══════════════════════════════════════════════════════════════════════════════",
                "",
                "┌─ 用户输入 ─────────────────────────────────",
                "│ 时间：2024-01-15 10:30:01",
                "│ 估算 Token: 150",
                "└────────────────────────────────────────────",
                "",
                "═══════════════════════════════════════════════════════════════════════════════",
                "对话摘要",
                "═══════════════════════════════════════════════════════════════════════════════",
                "对话 ID: session-123",
                "开始时间：2024-01-15 10:30:00",
                "总输入 Token: 1200",
                "总输出 Token: 800",
                "总 Token: 2000",
                "LLM 调用次数：15",
                "工具调用次数：7",
                "═══════════════════════════════════════════════════════════════════════════════"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("session-123");

            assertNotNull(stats);
            assertEquals(1200, stats.totalInputTokens);
            assertEquals(800, stats.totalOutputTokens);
            assertEquals(2000, stats.totalTokens);
            assertEquals(15, stats.llmCalls);
            assertEquals(7, stats.toolCalls);
        }
    }

    @Nested
    @DisplayName("getTokenStats 正则解析")
    class RegexParsingTests {

        @Test
        @DisplayName("正常解析所有字段")
        void parsesAllFields() throws Exception {
            createLogFile("test-session",
                "对话摘要",
                "总输入 Token: 500",
                "总输出 Token: 300",
                "总 Token: 800",
                "LLM 调用次数：10",
                "工具调用次数：3"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("test-session");

            assertNotNull(stats);
            assertEquals(500, stats.totalInputTokens);
            assertEquals(300, stats.totalOutputTokens);
            assertEquals(800, stats.totalTokens);
            assertEquals(10, stats.llmCalls);
            assertEquals(3, stats.toolCalls);
        }

        @Test
        @DisplayName("没有对话摘要部分时返回 null")
        void returnsNullWhenNoSummarySection() throws Exception {
            createLogFile("no-summary",
                "会话 ID: no-summary",
                "开始时间：2024-01-15 10:30:00",
                "总输入 Token: 500"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("no-summary");

            assertNull(stats);
        }

        @Test
        @DisplayName("所有字段为 0 时正确解析")
        void parsesZeroValues() throws Exception {
            createLogFile("zero-values",
                "对话摘要",
                "总输入 Token: 0",
                "总输出 Token: 0",
                "总 Token: 0",
                "LLM 调用次数：0",
                "工具调用次数：0"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("zero-values");

            assertNotNull(stats);
            assertEquals(0, stats.totalInputTokens);
            assertEquals(0, stats.totalOutputTokens);
            assertEquals(0, stats.totalTokens);
            assertEquals(0, stats.llmCalls);
            assertEquals(0, stats.toolCalls);
        }

        @Test
        @DisplayName("解析大数值字段")
        void parsesLargeNumbers() throws Exception {
            createLogFile("large-values",
                "对话摘要",
                "总输入 Token: 999999",
                "总输出 Token: 888888",
                "总 Token: 1888887",
                "LLM 调用次数：999",
                "工具调用次数：12345"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("large-values");

            assertNotNull(stats);
            assertEquals(999999, stats.totalInputTokens);
            assertEquals(888888, stats.totalOutputTokens);
            assertEquals(1888887, stats.totalTokens);
            assertEquals(999, stats.llmCalls);
            assertEquals(12345, stats.toolCalls);
        }

        @Test
        @DisplayName("部分字段缺失时缺失字段默认为 0")
        void parsesPartialFields() throws Exception {
            createLogFile("partial-fields",
                "对话摘要",
                "总输入 Token: 100",
                "总输出 Token: 200",
                "LLM 调用次数：5"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("partial-fields");

            assertNotNull(stats);
            assertEquals(100, stats.totalInputTokens);
            assertEquals(200, stats.totalOutputTokens);
            assertEquals(0, stats.totalTokens);
            assertEquals(5, stats.llmCalls);
            assertEquals(0, stats.toolCalls);
        }

        @Test
        @DisplayName("摘要部分有额外内容时仍能正确提取")
        void handlesExtraContentAroundSummary() throws Exception {
            createLogFile("extra-content",
                "会话内容开始",
                "用户：你好",
                "总输入 Token: 忽略",
                "",
                "═══════════════════════════════════════════════════════════════════════════════",
                "对话摘要",
                "═══════════════════════════════════════════════════════════════════════════════",
                "对话 ID: extra-content",
                "开始时间：2024-01-15 10:30:00",
                "总输入 Token: 300",
                "总输出 Token: 200",
                "总 Token: 500",
                "LLM 调用次数：8",
                "工具调用次数：2",
                "═══════════════════════════════════════════════════════════════════════════════",
                "",
                "一些后置内容",
                "总 Token: 99999"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("extra-content");

            assertNotNull(stats);
            assertEquals(300, stats.totalInputTokens);
            assertEquals(200, stats.totalOutputTokens);
            assertEquals(500, stats.totalTokens);
            assertEquals(8, stats.llmCalls);
            assertEquals(2, stats.toolCalls);
        }

        @Test
        @DisplayName("空文件返回 null")
        void returnsNullForEmptyFile() throws Exception {
            createLogFile("empty");

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("empty");

            assertNull(stats);
        }

        @Test
        @DisplayName("摘要部分只有标题没有数据字段时返回 0 值统计")
        void returnsZeroStatsWhenSummaryHasNoDataFields() throws Exception {
            createLogFile("empty-summary",
                "对话摘要",
                "═══════════"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("empty-summary");

            assertNotNull(stats);
            assertEquals(0, stats.totalInputTokens);
            assertEquals(0, stats.totalOutputTokens);
            assertEquals(0, stats.totalTokens);
            assertEquals(0, stats.llmCalls);
            assertEquals(0, stats.toolCalls);
        }

        @Test
        @DisplayName("同一日期目录下有多个文件时只查找目标文件")
        void findsCorrectFileAmongMultipleFiles() throws Exception {
            createLogFile("session-alpha",
                "对话摘要",
                "总输入 Token: 100",
                "总输出 Token: 100",
                "总 Token: 200",
                "LLM 调用次数：2",
                "工具调用次数：1"
            );
            createLogFile("session-beta",
                "对话摘要",
                "总输入 Token: 999",
                "总输出 Token: 999",
                "总 Token: 1998",
                "LLM 调用次数：20",
                "工具调用次数：10"
            );

            SessionLogger.SessionTokenStats stats = SessionLogger.getTokenStats("session-alpha");

            assertNotNull(stats);
            assertEquals(100, stats.totalInputTokens);
            assertEquals(100, stats.totalOutputTokens);
            assertEquals(200, stats.totalTokens);
            assertEquals(2, stats.llmCalls);
            assertEquals(1, stats.toolCalls);
        }
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
