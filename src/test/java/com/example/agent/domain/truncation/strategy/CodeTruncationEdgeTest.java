package com.example.agent.domain.truncation.strategy;

import com.example.agent.service.SimpleTokenEstimator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * CodeTruncation 策略边缘场景测试
 *
 * 测试重点：
 * - 除零异常防护验证
 * - 极端输入场景
 * - P0 级 bug 修复验证
 */
class CodeTruncationEdgeTest {

    private CodeTruncation codeTruncation;
    private SimpleTokenEstimator tokenEstimator;

    @BeforeEach
    void setUp() {
        tokenEstimator = new SimpleTokenEstimator();
        codeTruncation = new CodeTruncation(tokenEstimator);
    }

    @Test
    @DisplayName("P0 修复验证 - 仅换行符的内容不触发除零异常")
    void testOnlyNewlinesContent_NoDivisionByZero() {
        String content = "\n\n\n\n\n";

        assertDoesNotThrow(() -> {
            String result = codeTruncation.truncate(content, 100);
            assertNotNull(result);
        }, "仅换行符不应触发 ArithmeticException: / by zero");
    }

    @Test
    @DisplayName("P0 修复验证 - 单个换行符不触发除零")
    void testSingleNewline_NoDivisionByZero() {
        String content = "\n";

        assertDoesNotThrow(() -> {
            String result = codeTruncation.truncate(content, 100);
            assertNotNull(result);
        });
    }

    @Test
    @DisplayName("P0 修复验证 - 空字符串不崩溃")
    void testEmptyString() {
        assertDoesNotThrow(() -> {
            String result = codeTruncation.truncate("", 100);
            assertEquals("", result);
        });
    }

    @Test
    @DisplayName("边界 - maxTokens 为负数直接返回原内容")
    void testNegativeMaxTokens() {
        String content = "public class Test {}";
        String result = codeTruncation.truncate(content, -100);

        assertEquals(content, result, "负数 maxTokens 应直接返回原内容");
    }

    @Test
    @DisplayName("边界 - maxTokens 为零直接返回原内容")
    void testZeroMaxTokens() {
        String content = "public class Test {}";
        String result = codeTruncation.truncate(content, 0);

        assertEquals(content, result, "maxTokens = 0 应直接返回原内容");
    }

    @Test
    @DisplayName("边界 - 内容 tokens 小于限制直接返回")
    void testContentSmallerThanLimit() {
        String content = "int x = 1;";
        String result = codeTruncation.truncate(content, 1000);

        assertEquals(content, result, "小内容应直接返回不截断");
    }

    @Test
    @DisplayName("边界 - 零行内容（全空白）直接返回")
    void testZeroLinesContent() {
        String content = "";
        String result = codeTruncation.truncate(content, 100);

        assertEquals(content, result);
    }

    @Test
    @DisplayName("边界 - 超大代码正确执行头尾截断")
    void testVeryLargeCode() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 500; i++) {
            sb.append("    public void method").append(i).append("() {\n");
            sb.append("        // 这是一个很长的注释内容用来测试截断效果\n");
            sb.append("        System.out.println(\"Hello World " + i + "\");\n");
            sb.append("    }\n");
        }
        String largeContent = sb.toString();

        assertDoesNotThrow(() -> {
            String result = codeTruncation.truncate(largeContent, 100);
            assertNotNull(result);
            assertTrue(result.length() < largeContent.length());
            assertTrue(result.contains("截断"), "截断结果应包含截断标记");
        });
    }

    @Test
    @DisplayName("边界 - 单行代码处理")
    void testSingleLineCode() {
        String content = "public class Test { public static void main(String[] args) { System.out.println(\"Hello\"); } }";

        assertDoesNotThrow(() -> {
            String result = codeTruncation.truncate(content, 10);
            assertNotNull(result);
        });
    }

    @Test
    @DisplayName("边界 - maxTokens 极小但至少返回截断标记")
    void testExtremelySmallMaxTokens() {
        String content = generateLargeCode(100);

        assertDoesNotThrow(() -> {
            String result = codeTruncation.truncate(content, 1);
            assertNotNull(result);
            assertFalse(result.isEmpty());
        });
    }

    @Test
    @DisplayName("边界 - maxTokens Integer.MIN_VALUE")
    void testMinValueMaxTokens() {
        String content = "public class Test {}";
        String result = codeTruncation.truncate(content, Integer.MIN_VALUE);

        assertEquals(content, result, "极小 maxTokens 应直接返回原内容");
    }

    @Test
    @DisplayName("边界 - supports 方法对任意内容返回 true")
    void testSupportsAnyContentType() {
        assertTrue(codeTruncation.supports("java"));
        assertTrue(codeTruncation.supports("py"));
        assertTrue(codeTruncation.supports(""));
        assertTrue(codeTruncation.supports(null));
        assertTrue(codeTruncation.supports("any"));
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
}
