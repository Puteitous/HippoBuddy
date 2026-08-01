package com.example.agent.core.blocker;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CommandParserTest {

    // ==================== 分段 ====================

    @Test
    void singleCommand_shouldProduceOneSegment() {
        List<CommandParser.Segment> segs = CommandParser.parse("git status");
        assertEquals(1, segs.size());
        assertEquals("git", segs.get(0).getCommandName());
        assertEquals(List.of("status"), segs.get(0).getArgs());
    }

    @Test
    void chainOperators_shouldSplitIntoSegments() {
        List<CommandParser.Segment> segs = CommandParser.parse("echo ok && rd /s /q D:\\");
        assertEquals(2, segs.size());
        assertEquals("echo", segs.get(0).getCommandName());
        assertEquals("rd", segs.get(1).getCommandName());
        // parser 不做小写转换（那是 Blocker 层职责），保留原始大小写
        assertEquals(List.of("/s", "/q", "D:\\"), segs.get(1).getArgs());
    }

    @Test
    void allChainOperatorKinds_shouldSplit() {
        List<CommandParser.Segment> segs = CommandParser.parse("echo a && echo b || echo c; echo d & echo e | grep f");
        assertEquals(6, segs.size());
        assertEquals("echo", segs.get(0).getCommandName());
        assertEquals("echo", segs.get(1).getCommandName());
        assertEquals("echo", segs.get(2).getCommandName());
        assertEquals("echo", segs.get(3).getCommandName());
        assertEquals("echo", segs.get(4).getCommandName());
        assertEquals("grep", segs.get(5).getCommandName());
    }

    @Test
    void quotedOperators_shouldNotSplit() {
        List<CommandParser.Segment> segs = CommandParser.parse("echo \"a && b\" | grep x");
        assertEquals(2, segs.size());
        assertEquals("echo", segs.get(0).getCommandName());
        assertEquals(List.of("\"a", "&&", "b\""), segs.get(0).getArgs());
        assertEquals("grep", segs.get(1).getCommandName());
    }

    @Test
    void emptyOrNull_shouldProduceNoSegments() {
        assertTrue(CommandParser.parse(null).isEmpty());
        assertTrue(CommandParser.parse("").isEmpty());
        assertTrue(CommandParser.parse("   ").isEmpty());
    }

    // ==================== 命令名规范化 ====================

    @Test
    void normalize_shouldStripPathAndLowercase() {
        assertEquals("rm", CommandParser.normalizeCommandName("/usr/bin/rm"));
        assertEquals("rm", CommandParser.normalizeCommandName("/bin/rm"));
        assertEquals("git", CommandParser.normalizeCommandName("/usr/local/bin/git"));
    }

    @Test
    void normalize_shouldHandleWindowsPath() {
        assertEquals("shutdown", CommandParser.normalizeCommandName("C:\\Windows\\System32\\shutdown.exe"));
        assertEquals("format", CommandParser.normalizeCommandName("format.com"));
        assertEquals("cmd", CommandParser.normalizeCommandName("C:\\Windows\\System32\\cmd.exe"));
    }

    @Test
    void normalize_shouldStripQuotes() {
        assertEquals("echo", CommandParser.normalizeCommandName("\"echo\""));
        assertEquals("echo", CommandParser.normalizeCommandName("'echo'"));
    }

    @Test
    void normalize_shouldStripTrailingNonAlnum() {
        assertEquals("python3", CommandParser.normalizeCommandName("python3"));
        assertEquals("bash", CommandParser.normalizeCommandName("bash!"));
    }

    @Test
    void normalize_shouldHandleNullAndEmpty() {
        assertEquals("", CommandParser.normalizeCommandName(null));
        assertEquals("", CommandParser.normalizeCommandName(""));
    }

    @Test
    void normalize_shouldStripExeSuffixInsidePath() {
        assertEquals("shutdown", CommandParser.normalizeCommandName("shutdown.EXE"));
        assertEquals("taskkill", CommandParser.normalizeCommandName("taskkill.exe"));
    }
}
