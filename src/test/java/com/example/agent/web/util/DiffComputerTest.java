package com.example.agent.web.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("DiffComputer 单元测试")
class DiffComputerTest {

    private DiffComputer diffComputer;

    @BeforeEach
    void setUp() {
        diffComputer = new DiffComputer();
    }

    @Nested
    @DisplayName("computeDiff 基础场景")
    class ComputeDiffBasicTests {

        @Test
        @DisplayName("两个空字符串返回单行 same（split 空串为 ['']）")
        void bothEmptyStrings() {
            List<String[]> diff = diffComputer.computeDiff("", "");
            assertEquals(1, diff.size());
            assertEquals("same", diff.get(0)[0]);
            assertEquals("", diff.get(0)[1]);
        }

        @Test
        @DisplayName("完全相同的单行内容")
        void identicalSingleLine() {
            List<String[]> diff = diffComputer.computeDiff("hello", "hello");
            assertEquals(1, diff.size());
            assertEquals("same", diff.get(0)[0]);
            assertEquals("hello", diff.get(0)[1]);
        }

        @Test
        @DisplayName("完全相同的多行内容")
        void identicalMultipleLines() {
            String text = "line1\nline2\nline3";
            List<String[]> diff = diffComputer.computeDiff(text, text);
            assertEquals(3, diff.size());
            for (String[] line : diff) {
                assertEquals("same", line[0]);
            }
        }
    }

    @Nested
    @DisplayName("computeDiff 新增行")
    class ComputeDiffAddedTests {

        @Test
        @DisplayName("末尾新增一行")
        void lineAddedAtEnd() {
            List<String[]> diff = diffComputer.computeDiff("a", "a\nb");
            assertEquals(2, diff.size());
            assertEquals("same", diff.get(0)[0]);
            assertEquals("a", diff.get(0)[1]);
            assertEquals("added", diff.get(1)[0]);
            assertEquals("b", diff.get(1)[1]);
        }

        @Test
        @DisplayName("开头新增一行")
        void lineAddedAtBeginning() {
            List<String[]> diff = diffComputer.computeDiff("b", "a\nb");
            assertEquals(2, diff.size());
            assertEquals("added", diff.get(0)[0]);
            assertEquals("a", diff.get(0)[1]);
            assertEquals("same", diff.get(1)[0]);
            assertEquals("b", diff.get(1)[1]);
        }

        @Test
        @DisplayName("中间新增一行")
        void lineAddedInMiddle() {
            List<String[]> diff = diffComputer.computeDiff("a\nc", "a\nb\nc");
            assertEquals(3, diff.size());
            assertEquals("same", diff.get(0)[0]);
            assertEquals("added", diff.get(1)[0]);
            assertEquals("b", diff.get(1)[1]);
            assertEquals("same", diff.get(2)[0]);
        }
    }

    @Nested
    @DisplayName("computeDiff 删除行")
    class ComputeDiffRemovedTests {

        @Test
        @DisplayName("末尾删除一行")
        void lineRemovedAtEnd() {
            List<String[]> diff = diffComputer.computeDiff("a\nb", "a");
            assertEquals(2, diff.size());
            assertEquals("same", diff.get(0)[0]);
            assertEquals("a", diff.get(0)[1]);
            assertEquals("removed", diff.get(1)[0]);
            assertEquals("b", diff.get(1)[1]);
        }

        @Test
        @DisplayName("开头删除一行")
        void lineRemovedAtBeginning() {
            List<String[]> diff = diffComputer.computeDiff("a\nb", "b");
            assertEquals(2, diff.size());
            assertEquals("removed", diff.get(0)[0]);
            assertEquals("a", diff.get(0)[1]);
            assertEquals("same", diff.get(1)[0]);
            assertEquals("b", diff.get(1)[1]);
        }

        @Test
        @DisplayName("中间删除一行")
        void lineRemovedInMiddle() {
            List<String[]> diff = diffComputer.computeDiff("a\nb\nc", "a\nc");
            assertEquals(3, diff.size());
            assertEquals("same", diff.get(0)[0]);
            assertEquals("removed", diff.get(1)[0]);
            assertEquals("b", diff.get(1)[1]);
            assertEquals("same", diff.get(2)[0]);
        }
    }

    @Nested
    @DisplayName("computeDiff 混合修改")
    class ComputeDiffMixedTests {

        @Test
        @DisplayName("修改一行（删除旧的 + 添加新的）")
        void lineModified() {
            List<String[]> diff = diffComputer.computeDiff("a", "b");
            assertEquals(2, diff.size());
            assertEquals("removed", diff.get(0)[0]);
            assertEquals("a", diff.get(0)[1]);
            assertEquals("added", diff.get(1)[0]);
            assertEquals("b", diff.get(1)[1]);
        }

        @Test
        @DisplayName("完全不同的多行内容")
        void completelyDifferent() {
            List<String[]> diff = diffComputer.computeDiff("a\nb", "x\ny");
            assertEquals(4, diff.size());
        }

        @Test
        @DisplayName("混合新增删除相同")
        void mixedAddRemoveSame() {
            List<String[]> diff = diffComputer.computeDiff("keep\nremove\nkeep", "keep\nadd\nkeep");
            assertEquals(4, diff.size());
            assertEquals("same", diff.get(0)[0]);
            assertEquals("keep", diff.get(0)[1]);
            assertTrue("removed".equals(diff.get(1)[0]) || "added".equals(diff.get(1)[0]));
            assertTrue("removed".equals(diff.get(2)[0]) || "added".equals(diff.get(2)[0]));
            assertEquals("same", diff.get(3)[0]);
            assertEquals("keep", diff.get(3)[1]);
        }
    }

    @Nested
    @DisplayName("computeDiffAsMap")
    class ComputeDiffAsMapTests {

        @Test
        @DisplayName("返回正确结构的 Map 列表")
        void returnsCorrectMapStructure() {
            List<Map<String, String>> result = diffComputer.computeDiffAsMap("a", "b");
            assertEquals(2, result.size());
            assertEquals("removed", result.get(0).get("type"));
            assertEquals("a", result.get(0).get("content"));
            assertEquals("added", result.get(1).get("type"));
            assertEquals("b", result.get(1).get("content"));
        }

        @Test
        @DisplayName("空字符串 diff 返回空内容")
        void emptyStrings() {
            List<Map<String, String>> result = diffComputer.computeDiffAsMap("", "");
            assertEquals(1, result.size());
            assertEquals("same", result.get(0).get("type"));
            assertEquals("", result.get(0).get("content"));
        }
    }
}
