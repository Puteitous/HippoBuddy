package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class EditBeforeReadBlockerTest {

    private EditBeforeReadBlocker blocker;

    @BeforeEach
    void setUp() {
        blocker = new EditBeforeReadBlocker();
        blocker.reset();
    }

    @Test
    void editWithoutRead_shouldWarn() {
        JsonNode editArgs = JsonNodeFactory.instance.objectNode()
                .put("path", "/test/Test.java");

        HookResult result = blocker.check("edit_file", editArgs);

        assertTrue(result.isAllowed());
        assertTrue(result.isWarning());
        assertTrue(result.getReason().contains("建议先读取"));
        assertNotNull(result.getSuggestion());
    }

    @Test
    void editAfterRead_shouldBeAllowed() {
        JsonNode readArgs = JsonNodeFactory.instance.objectNode()
                .put("path", "/test/Test.java");
        JsonNode editArgs = JsonNodeFactory.instance.objectNode()
                .put("path", "/test/Test.java");

        blocker.check("read_file", readArgs);
        HookResult result = blocker.check("edit_file", editArgs);

        assertTrue(result.isAllowed());
        assertFalse(result.isWarning());
    }

    @Test
    void writeWithoutRead_shouldWarn() {
        JsonNode writeArgs = JsonNodeFactory.instance.objectNode()
                .put("path", "/test/Test.java");

        HookResult result = blocker.check("write_file", writeArgs);

        assertTrue(result.isAllowed());
        assertTrue(result.isWarning());
    }

    @Test
    void nonEditTools_shouldAlwaysBeAllowed() {
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", "/test/Test.java");

        assertTrue(blocker.check("glob", args).isAllowed());
        assertTrue(blocker.check("grep", args).isAllowed());
        assertTrue(blocker.check("ls", args).isAllowed());
    }
}
