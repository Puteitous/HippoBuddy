package com.example.agent.tools.normalizer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ReadFileNormalizerTest {

    private ReadFileNormalizer normalizer;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        normalizer = new ReadFileNormalizer();
        objectMapper = new ObjectMapper();
    }

    @Test
    void testNormalizeWithPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "  src/main/java  ");

        JsonNode result = normalizer.normalize(args);

        assertTrue(result.has("path"));
        assertEquals("src/main/java", result.get("path").asText());
    }

    @Test
    void testNormalizePathWithBackslashes() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "src\\main\\java");

        JsonNode result = normalizer.normalize(args);

        assertEquals("src/main/java", result.get("path").asText());
    }

    @Test
    void testNormalizePathWithMixedSlashes() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "src\\main/java\\test");

        JsonNode result = normalizer.normalize(args);

        assertEquals("src/main/java/test", result.get("path").asText());
    }

    @Test
    void testNormalizePathLeadingTrailingWhitespace() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "  \t  file.txt  \n  ");

        JsonNode result = normalizer.normalize(args);

        assertEquals("file.txt", result.get("path").asText());
    }

    @Test
    void testNormalizeWithoutPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("other_param", "value");

        JsonNode result = normalizer.normalize(args);

        assertFalse(result.has("path"));
    }

    @Test
    void testNormalizeEmptyPath() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "");

        JsonNode result = normalizer.normalize(args);

        assertTrue(result.has("path"));
        assertEquals("", result.get("path").asText());
    }

    @Test
    void testNormalizeDefaultMaxTokens() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "file.txt");

        JsonNode result = normalizer.normalize(args);

        assertTrue(result.has("max_tokens"));
        assertEquals(4000, result.get("max_tokens").asInt());
    }

    @Test
    void testNormalizeCustomMaxTokens() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "file.txt");
        args.put("max_tokens", 8000);

        JsonNode result = normalizer.normalize(args);

        assertEquals(8000, result.get("max_tokens").asInt());
    }

    @Test
    void testNormalizeNullMaxTokensUsesDefault() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "file.txt");
        args.putNull("max_tokens");

        JsonNode result = normalizer.normalize(args);

        assertEquals(4000, result.get("max_tokens").asInt());
    }

    @Test
    void testNormalizePathAndMaxTokensTogether() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("path", "dir/file.txt");

        JsonNode result = normalizer.normalize(args);

        assertTrue(result.has("path"));
        assertEquals("dir/file.txt", result.get("path").asText());
        assertEquals(4000, result.get("max_tokens").asInt());
    }

    @Test
    void testNormalizeEmptyArgs() {
        ObjectNode args = objectMapper.createObjectNode();

        JsonNode result = normalizer.normalize(args);

        assertFalse(result.has("path"));
        assertTrue(result.has("max_tokens"));
        assertEquals(4000, result.get("max_tokens").asInt());
    }
}
