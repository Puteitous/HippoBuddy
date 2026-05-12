package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BlockerChainIntegrationTest {

    private BlockerChain blockerChain;
    private EditCountBlocker editCountBlocker;

    @BeforeEach
    void setUp() {
        blockerChain = new BlockerChain();
        editCountBlocker = new EditCountBlocker();
        editCountBlocker.reset();
        blockerChain.add(editCountBlocker);
    }

    @Test
    void check_shouldAllowFirstEdit() {
        JsonNode arguments = JsonNodeFactory.instance.objectNode()
                .put("path", "/test/Test.java");

        HookResult result = blockerChain.check("edit_file", arguments);

        assertTrue(result.isAllowed());
    }

    @Test
    void check_shouldDenyAfterMaxEdits() {
        JsonNode arguments = JsonNodeFactory.instance.objectNode()
                .put("path", "/test/Test.java");

        for (int i = 0; i < 10; i++) {
            blockerChain.check("edit_file", arguments);
        }

        HookResult result = blockerChain.check("edit_file", arguments);

        assertFalse(result.isAllowed());
        assertNotNull(result.getReason());
        assertNotNull(result.getSuggestion());
        assertTrue(result.formatErrorMessage().contains("编辑次数超限"));
    }

    @Test
    void check_shouldAllowNonEditTools() {
        JsonNode arguments = JsonNodeFactory.instance.objectNode();

        HookResult result = blockerChain.check("read_file", arguments);

        assertTrue(result.isAllowed());
    }
}
