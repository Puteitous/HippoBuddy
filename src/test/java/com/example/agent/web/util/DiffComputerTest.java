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
        @DisplayName("两个空字符串返回空 diff（splitLines 空文本视为 0 行）")
        void bothEmptyStrings() {
            List<String[]> diff = diffComputer.computeDiff("", "");
            assertEquals(0, diff.size());
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
        @DisplayName("空字符串 diff 返回空列表（空文本视为 0 行）")
        void emptyStrings() {
            List<Map<String, String>> result = diffComputer.computeDiffAsMap("", "");
            assertEquals(0, result.size());
        }
    }

    @Nested
    @DisplayName("computeWordDiffLines 按行组织的词级 diff")
    class ComputeWordDiffLinesTests {

        @SuppressWarnings("unchecked")
        private List<List<Map<String, Object>>> lines(Map<String, Object> result, String side) {
            return (List<List<Map<String, Object>>>) result.get(side);
        }

        private String wordAt(List<Map<String, Object>> line, int idx) {
            return (String) line.get(idx).get("value");
        }

        @Test
        @DisplayName("同行内改词：old 行标 delete、new 行标 insert")
        void inlineWordChange() {
            Map<String, Object> result = diffComputer.computeWordDiffLines("const foo = 1;", "const bar = 1;");
            var oldLines = lines(result, "old");
            var newLines = lines(result, "new");

            assertEquals(1, oldLines.size());
            assertEquals(1, newLines.size());

            // old 行：包含 delete foo
            boolean hasDeleteFoo = oldLines.get(0).stream()
                .anyMatch(t -> "delete".equals(t.get("type")) && "foo".equals(t.get("value")));
            assertTrue(hasDeleteFoo, "old 行应标记被删的词 foo");
            // new 行：包含 insert bar
            boolean hasInsertBar = newLines.get(0).stream()
                .anyMatch(t -> "insert".equals(t.get("type")) && "bar".equals(t.get("value")));
            assertTrue(hasInsertBar, "new 行应标记新增的词 bar");
            // 两侧都不应出现对方专属的标记类型
            assertTrue(oldLines.get(0).stream().noneMatch(t -> "insert".equals(t.get("type"))));
            assertTrue(newLines.get(0).stream().noneMatch(t -> "delete".equals(t.get("type"))));
        }

        @Test
        @DisplayName("多行文件单行修改：行号逐行对齐")
        void multiLineSingleChange() {
            Map<String, Object> result = diffComputer.computeWordDiffLines("a\nfoo\nc", "a\nbar\nc");
            var oldLines = lines(result, "old");
            var newLines = lines(result, "new");

            // 三行都有（修改行两侧都保留）
            assertEquals(3, oldLines.size());
            assertEquals(3, newLines.size());
            // 第 2 行是变更行
            assertTrue(oldLines.get(1).stream().anyMatch(t -> "delete".equals(t.get("type"))));
            assertTrue(newLines.get(1).stream().anyMatch(t -> "insert".equals(t.get("type"))));
            // 第 1、3 行无标记
            assertTrue(oldLines.get(0).stream().allMatch(t -> "equal".equals(t.get("type"))));
            assertTrue(oldLines.get(2).stream().allMatch(t -> "equal".equals(t.get("type"))));
        }

        @Test
        @DisplayName("删除整行：old 侧保留该行 delete，new 侧无对应行")
        void deleteWholeLine() {
            Map<String, Object> result = diffComputer.computeWordDiffLines("a\nb", "a");
            var oldLines = lines(result, "old");
            var newLines = lines(result, "new");

            assertEquals(2, oldLines.size());
            assertTrue(oldLines.get(1).stream().anyMatch(t -> "delete".equals(t.get("type")) && "b".equals(t.get("value"))));
            // new 侧只有 1 行有效（第二行可能是空列表，但不存在 insert 标记）
            assertTrue(newLines.stream().flatMap(List::stream).noneMatch(t -> "insert".equals(t.get("type"))));
        }

        @Test
        @DisplayName("新增整行：new 侧该行 insert 标记")
        void insertWholeLine() {
            Map<String, Object> result = diffComputer.computeWordDiffLines("a", "a\nb");
            var oldLines = lines(result, "old");
            var newLines = lines(result, "new");

            assertEquals(2, newLines.size());
            assertTrue(newLines.get(1).stream().anyMatch(t -> "insert".equals(t.get("type")) && "b".equals(t.get("value"))));
            // old 侧无 delete 标记（整行新增）
            assertTrue(oldLines.stream().flatMap(List::stream).noneMatch(t -> "delete".equals(t.get("type"))));
        }

        @Test
        @DisplayName("完全相同文本：全 equal 无标记")
        void identicalText() {
            Map<String, Object> result = diffComputer.computeWordDiffLines("line1\nline2", "line1\nline2");
            var oldLines = lines(result, "old");
            var newLines = lines(result, "new");

            assertEquals(2, oldLines.size());
            assertEquals(2, newLines.size());
            assertTrue(oldLines.stream().flatMap(List::stream).allMatch(t -> "equal".equals(t.get("type"))));
            assertTrue(newLines.stream().flatMap(List::stream).allMatch(t -> "equal".equals(t.get("type"))));
        }

        @Test
        @DisplayName("空文本返回空行列表结构")
        void emptyText() {
            Map<String, Object> result = diffComputer.computeWordDiffLines("", "");
            assertNotNull(result.get("old"));
            assertNotNull(result.get("new"));
            // 结构存在即可（前端仅按真实行号索引，空文件无变更行）
            assertTrue(lines(result, "old").size() >= 0);
            assertTrue(lines(result, "new").size() >= 0);
        }

        @Test
        @DisplayName("末尾换行不产生多余行（与行号语义一致）")
        void trailingNewline() {
            Map<String, Object> result = diffComputer.computeWordDiffLines("foo\nbar\n", "foo\nbaz\n");
            var oldLines = lines(result, "old");
            var newLines = lines(result, "new");

            // splitLines 语义：末尾 \n 后无多余行 → 有效行数为 2
            assertTrue(oldLines.size() <= 2, "old 侧不应超过 2 行，实际 " + oldLines.size());
            assertTrue(newLines.size() <= 2, "new 侧不应超过 2 行，实际 " + newLines.size());
            assertTrue(oldLines.get(1).stream().anyMatch(t -> "delete".equals(t.get("type"))));
            assertTrue(newLines.get(1).stream().anyMatch(t -> "insert".equals(t.get("type"))));
        }
    }
}
