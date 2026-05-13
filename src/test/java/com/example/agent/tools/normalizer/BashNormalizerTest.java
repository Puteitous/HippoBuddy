package com.example.agent.tools.normalizer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BashNormalizerTest {

    private BashNormalizer normalizer;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        normalizer = new BashNormalizer();
        objectMapper = new ObjectMapper();
    }

    @Test
    void testNormalizeCommandTrimmed() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "  git status  ");

        JsonNode result = normalizer.normalize(args);

        assertTrue(result.has("command"));
        assertEquals("git status", result.get("command").asText());
    }

    @Test
    void testNormalizeCommandLeadingWhitespace() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "  \n  ls -la");

        JsonNode result = normalizer.normalize(args);

        assertEquals("ls -la", result.get("command").asText());
    }

    @Test
    void testNormalizeCommandNotTrimmedByDefault() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello");

        JsonNode result = normalizer.normalize(args);

        assertEquals("echo hello", result.get("command").asText());
    }

    @Test
    void testNormalizeWithoutCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("timeout", 15);

        JsonNode result = normalizer.normalize(args);

        assertFalse(result.has("command"));
    }

    @Test
    void testNormalizeDefaultTimeout() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");

        JsonNode result = normalizer.normalize(args);

        assertTrue(result.has("timeout"));
        assertEquals(30, result.get("timeout").asInt());
    }

    @Test
    void testNormalizeCustomTimeout() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", 60);

        JsonNode result = normalizer.normalize(args);

        assertEquals(60, result.get("timeout").asInt());
    }

    @Test
    void testNormalizeNullTimeoutUsesDefault() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.putNull("timeout");

        JsonNode result = normalizer.normalize(args);

        assertEquals(30, result.get("timeout").asInt());
    }

    @Test
    void testNormalizeWorkingDirTrimmed() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "ls");
        args.put("working_dir", "  src/main  ");

        JsonNode result = normalizer.normalize(args);

        assertEquals("src/main", result.get("working_dir").asText());
    }

    @Test
    void testNormalizeWorkingDirBackslashes() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "ls");
        args.put("working_dir", "src\\main\\java");

        JsonNode result = normalizer.normalize(args);

        assertEquals("src/main/java", result.get("working_dir").asText());
    }

    @Test
    void testNormalizeWorkingDirMixedSlashes() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "ls");
        args.put("working_dir", "src\\main/java");

        JsonNode result = normalizer.normalize(args);

        assertEquals("src/main/java", result.get("working_dir").asText());
    }

    @Test
    void testNormalizeNullWorkingDirNotPresent() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "ls");
        args.putNull("working_dir");

        JsonNode result = normalizer.normalize(args);

        assertFalse(result.has("working_dir"));
    }

    @Test
    void testNormalizeAllParameters() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "  mvn clean install  ");
        args.put("working_dir", "project\\module");
        args.put("timeout", 120);

        JsonNode result = normalizer.normalize(args);

        assertEquals("mvn clean install", result.get("command").asText());
        assertEquals("project/module", result.get("working_dir").asText());
        assertEquals(120, result.get("timeout").asInt());
    }

    @Test
    void testNormalizeEmptyArgs() {
        ObjectNode args = objectMapper.createObjectNode();

        JsonNode result = normalizer.normalize(args);

        assertFalse(result.has("command"));
        assertFalse(result.has("working_dir"));
        assertTrue(result.has("timeout"));
        assertEquals(30, result.get("timeout").asInt());
    }
}
