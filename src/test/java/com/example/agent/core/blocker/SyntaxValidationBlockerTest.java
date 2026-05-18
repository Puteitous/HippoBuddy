package com.example.agent.core.blocker;

import com.example.agent.domain.ast.TreeSitterJavaParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class SyntaxValidationBlockerTest {

    private SyntaxValidationBlocker blocker;

    @BeforeEach
    void setUp() {
        blocker = new SyntaxValidationBlocker();
    }

    @Test
    void editFileWithSyntaxError_shouldBeBlocked() {
        assumeTrue(TreeSitterJavaParser.isAvailable(), "Tree-sitter not available, skipping");

        String badCode = """
            public class Test {
                private String name = "test"
            }
            """;

        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", "Test.java")
                .put("old_text", "old content")
                .put("new_text", badCode);

        HookResult result = blocker.check("edit_file", args);

        assertFalse(result.isAllowed());
        assertTrue(result.getReason().contains("语法错误"));
        assertTrue(result.getSuggestion().contains("分号"));
    }

    @Test
    void editFileWithValidCode_shouldBeAllowed() {
        String goodCode = """
            public class Test {
                private String name = "test";
            }
            """;

        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", "Test.java")
                .put("old_text", "old content")
                .put("new_text", goodCode);

        HookResult result = blocker.check("edit_file", args);

        assertTrue(result.isAllowed());
    }

    @Test
    void writeFileWithSyntaxError_shouldBeBlocked() {
        assumeTrue(TreeSitterJavaParser.isAvailable(), "Tree-sitter not available, skipping");

        String badCode = """
            public class Test {
                private String name = "test"
            }
            """;

        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", "Test.java")
                .put("content", badCode);

        HookResult result = blocker.check("write_file", args);

        assertFalse(result.isAllowed());
    }

    @Test
    void nonJavaFiles_shouldSkipSyntaxCheck() {
        String badCode = "function test() { missing semicolon }";

        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", "test.js")
                .put("content", badCode);

        HookResult result = blocker.check("write_file", args);

        assertTrue(result.isAllowed());
    }

    @Test
    void nonEditTools_shouldAlwaysBeAllowed() {
        JsonNode args = JsonNodeFactory.instance.objectNode()
                .put("path", "Test.java");

        assertTrue(blocker.check("read_file", args).isAllowed());
        assertTrue(blocker.check("glob", args).isAllowed());
        assertTrue(blocker.check("bash", args).isAllowed());
        assertTrue(blocker.check("grep", args).isAllowed());
    }
}
