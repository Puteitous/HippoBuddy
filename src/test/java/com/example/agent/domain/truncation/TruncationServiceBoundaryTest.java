package com.example.agent.domain.truncation;

import com.example.agent.service.SimpleTokenEstimator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.AfterAll;

/**
 * TruncationService 边界条件测试
 *
 * 测试重点：
 * - 负数/零 maxTokens 参数收敛
 * - 死循环保护验证
 * - 空内容/空行处理
 * - 边界值等价类全覆盖
 */
class TruncationServiceBoundaryTest {

    private TruncationService truncationService;
    private SimpleTokenEstimator tokenEstimator;

    @BeforeEach
    void setUp() {
        tokenEstimator = new SimpleTokenEstimator();
        truncationService = new TruncationService(tokenEstimator);
    }

    @Test
    @DisplayName("边界 - null 内容直接返回 null")
    void testNullContent() {
        assertNull(truncationService.truncate(null, ContentType.CODE, 100));
        assertNull(truncationService.truncateToolOutput("test", null, 100));
    }

    @Test
    @DisplayName("边界 - 空字符串内容直接返回原值")
    void testEmptyContent() {
        assertEquals("", truncationService.truncate("", ContentType.CODE, 100));
        assertEquals("", truncationService.truncateToolOutput("test", "", 100));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1, -100, Integer.MIN_VALUE})
    @DisplayName("边界 - maxTokens <= 0 自动收敛到 1")
    void testNonPositiveMaxTokens(int maxTokens) {
        String content = generateLargeCode(500);

        String result = truncationService.truncate(content, ContentType.CODE, maxTokens);
        assertNotNull(result);
        assertFalse(result.isEmpty());

        String result3 = truncationService.truncateToolOutput("test", content, maxTokens);
        assertNotNull(result3);
        assertFalse(result3.isEmpty());
    }

    @Test
    @DisplayName("边界 - maxTokens 超大值自动收敛到 GLOBAL_HARD_LIMIT")
    void testTooLargeMaxTokens() {
        String content = generateLargeCode(5000);
        String result = truncationService.truncate(content, ContentType.CODE, Integer.MAX_VALUE);

        assertNotNull(result);
        int tokens = tokenEstimator.estimateTextTokens(result);
        assertTrue(tokens <= TruncationService.GLOBAL_HARD_LIMIT,
            "截断后 tokens 应不超过硬限制 " + TruncationService.GLOBAL_HARD_LIMIT);
    }

    @Test
    @DisplayName("边界 - 内容 tokens 刚好等于限制时不截断")
    void testContentExactlyAtLimit() {
        String content = "public class Test { void method() {} }";
        int originalTokens = tokenEstimator.estimateTextTokens(content);

        String result = truncationService.truncate(content, ContentType.CODE, originalTokens);
        assertEquals(content, result, "内容刚好在限制内时应直接返回原内容");
    }

    @Test
    @DisplayName("边界 - forceTruncate 极端场景不会死循环")
    void testForceTruncateNoInfiniteLoop() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 500; i++) {
            sb.append("public class Test").append(i).append(" {}\n");
        }
        String hugeContent = sb.toString();

        long startTime = System.currentTimeMillis();
        String result = truncationService.forceTruncate(hugeContent, ContentType.CODE, 10);
        long duration = System.currentTimeMillis() - startTime;

        assertTrue(duration < 1000, "forceTruncate 应在1秒内完成，不会死循环");
        assertNotNull(result);
        assertFalse(result.isEmpty());
    }

    @Test
    @DisplayName("边界 - 仅换行符的内容不会触发除零")
    void testOnlyNewlinesContent() {
        String content = "\n\n\n\n\n";
        assertDoesNotThrow(() -> {
            truncationService.truncate(content, ContentType.CODE, 10);
        });
    }

    @Test
    @DisplayName("边界 - 单行超大代码")
    void testSingleHugeLine() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 20000; i++) {
            sb.append("x");
        }
        String content = sb.toString();

        assertDoesNotThrow(() -> {
            String result = truncationService.truncate(content, ContentType.CODE, 100);
            assertNotNull(result);
            assertTrue(result.length() < content.length());
        });
    }

    @Test
    @DisplayName("边界 - truncateToolOutput 默认安全限制生效")
    void testTruncateToolOutputDefaultLimit() {
        String content = generateLargeCode(500);
        String result = truncationService.truncateToolOutput("test", content);

        assertNotNull(result);
        int tokens = tokenEstimator.estimateTextTokens(result);
        assertTrue(tokens <= TruncationService.PER_TOOL_SAFE_LIMIT,
            "工具输出默认应不超过安全限制 " + TruncationService.PER_TOOL_SAFE_LIMIT);
    }

    @Test
    @DisplayName("边界 - forceTruncate maxTokens <= 0 安全截断")
    void testForceTruncateWithZeroTokens() {
        String content = generateLargeCode(500);
        String result = truncationService.forceTruncate(content, ContentType.CODE, 0);

        assertNotNull(result);
        assertFalse(result.isEmpty());
        assertTrue(result.contains("强制截断"));
    }

    @Test
    @DisplayName("边界 - 非常短的内容直接返回")
    void testVeryShortContent() {
        String content = "int x = 1;";
        String result = truncationService.truncate(content, ContentType.CODE, 100);
        assertEquals(content, result, "短内容应直接返回");
    }

    @Test
    @DisplayName("边界 - 所有 ContentType 枚举值都能正常处理")
    void testAllContentTypes() {
        String content = generateLargeCode(500);
        for (ContentType type : ContentType.values()) {
            assertDoesNotThrow(() -> {
                String result = truncationService.truncate(content, type, 100);
                assertNotNull(result);
            }, "ContentType." + type + " 应能正常处理");
        }
    }

    private String generateLargeCode(int lines) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines; i++) {
            sb.append("    public void method").append(i).append("() {\n");
            sb.append("        System.out.println(\"Hello World\");\n");
            sb.append("    }\n");
        }
        return sb.toString();
    }

    @AfterAll
    static void killLsp4jThreads() throws Exception {
        // 给 JVM 一点时间让测试收尾
        Thread.sleep(100);

        // 强制中断所有 pool- 开头的非 daemon 线程
        Thread.getAllStackTraces().keySet().stream()
                .filter(t -> t.getName().startsWith("pool-") && !t.isDaemon())
                .forEach(t -> {
                    System.err.println("Killing thread: " + t.getName());
                    t.interrupt();
                });

        // 给一点时间让它们响应中断
        Thread.sleep(500);
    }
}


