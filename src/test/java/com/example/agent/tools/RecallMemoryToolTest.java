package com.example.agent.tools;

import com.example.agent.memory.MemoryEntry;
import com.example.agent.memory.MemoryStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RecallMemoryToolTest {

    private RecallMemoryTool tool;
    private MemoryStore memoryStore;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        memoryStore = mock(MemoryStore.class);
        tool = new RecallMemoryTool(memoryStore);
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        assertEquals("recall_memory", tool.getName());
    }

    @Test
    void testGetDescription() {
        String description = tool.getDescription();
        assertNotNull(description);
        assertTrue(description.contains("recall_memory"));
        assertTrue(description.contains("记忆"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("id"));
    }

    @Test
    void testExecuteWithValidId() throws ToolExecutionException {
        MemoryEntry entry = new MemoryEntry("mem-1", "# Title\nSome content", MemoryEntry.MemoryType.USER_PREFERENCE, Set.of("tag1"));
        when(memoryStore.findById("mem-1")).thenReturn(entry);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "mem-1");

        String result = tool.execute(args);

        assertTrue(result.contains("Memory: Title"));
        assertTrue(result.contains("mem-1"));
        assertTrue(result.contains("User Preference"));
        assertTrue(result.contains("Some content"));
        verify(memoryStore).findById("mem-1");
    }

    @Test
    void testExecuteMemoryNotFound() throws ToolExecutionException {
        when(memoryStore.findById("unknown-id")).thenReturn(null);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "unknown-id");

        String result = tool.execute(args);

        assertEquals("Memory not found: unknown-id", result);
        verify(memoryStore).findById("unknown-id");
    }

    @Test
    void testExecuteMissingId() {
        ObjectNode args = objectMapper.createObjectNode();

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testExecuteBlankId() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "");

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testExecuteWhitespaceId() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "   ");

        assertThrows(ToolExecutionException.class, () -> tool.execute(args));
    }

    @Test
    void testRecordAccessIsCalled() throws ToolExecutionException {
        MemoryEntry entry = spy(new MemoryEntry("mem-2", "Content", MemoryEntry.MemoryType.FEEDBACK, Set.of()));
        when(memoryStore.findById("mem-2")).thenReturn(entry);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "mem-2");

        tool.execute(args);

        verify(entry).recordAccess();
    }

    @Test
    void testExtractTitleWithHashPrefix() throws ToolExecutionException {
        MemoryEntry entry = new MemoryEntry("mem-3", "# My Title\nBody text", MemoryEntry.MemoryType.REFERENCE, Set.of("ref"));
        when(memoryStore.findById("mem-3")).thenReturn(entry);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "mem-3");

        String result = tool.execute(args);

        assertTrue(result.contains("Memory: My Title"));
    }

    @Test
    void testExtractTitleFromFirstLine() throws ToolExecutionException {
        MemoryEntry entry = new MemoryEntry("mem-4", "First line is title\nSecond line", MemoryEntry.MemoryType.PROJECT_CONTEXT, Set.of());
        when(memoryStore.findById("mem-4")).thenReturn(entry);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "mem-4");

        String result = tool.execute(args);

        assertTrue(result.contains("Memory: First line is title"));
    }

    @Test
    void testExtractTitleEmptyContent() throws ToolExecutionException {
        MemoryEntry entry = new MemoryEntry("mem-5", "", MemoryEntry.MemoryType.USER_PREFERENCE, Set.of());
        when(memoryStore.findById("mem-5")).thenReturn(entry);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "mem-5");

        String result = tool.execute(args);

        assertTrue(result.contains("Memory: Untitled"));
    }

    @Test
    void testSafeTruncateLongContent() throws ToolExecutionException {
        String longContent = "A".repeat(2500);
        MemoryEntry entry = new MemoryEntry("mem-6", longContent, MemoryEntry.MemoryType.USER_PREFERENCE, Set.of());
        when(memoryStore.findById("mem-6")).thenReturn(entry);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "mem-6");

        String result = tool.execute(args);

        assertTrue(result.contains("[content truncated at 2000 characters]"));
    }

    @Test
    void testGetAffectedPaths() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "test");

        assertTrue(tool.getAffectedPaths(args).isEmpty());
    }

    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testOutputFormatWithTags() throws ToolExecutionException {
        MemoryEntry entry = new MemoryEntry("mem-7", "# Tagged Memory\nBody", MemoryEntry.MemoryType.FEEDBACK, Set.of("java", "test"));
        when(memoryStore.findById("mem-7")).thenReturn(entry);

        ObjectNode args = objectMapper.createObjectNode();
        args.put("id", "mem-7");

        String result = tool.execute(args);

        assertTrue(result.contains("Tags:"));
        assertTrue(result.contains("Type: Feedback"));
    }
}
