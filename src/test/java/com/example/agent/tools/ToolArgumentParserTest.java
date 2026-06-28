package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ToolArgumentParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void parse_validSimpleJson_shouldSucceed() throws Exception {
        String json = "{\"path\":\"test.txt\",\"old_text\":\"hello\",\"new_text\":\"world\"}";
        JsonNode result = ToolArgumentParser.parse(json, "edit_file");
        
        assertNotNull(result);
        assertEquals("test.txt", result.get("path").asText());
        assertEquals("hello", result.get("old_text").asText());
        assertEquals("world", result.get("new_text").asText());
    }

    @Test
    void parse_nullInput_shouldReturnEmptyObject() throws Exception {
        JsonNode result = ToolArgumentParser.parse(null, "read_file");
        assertNotNull(result);
        assertTrue(result.isObject());
        assertEquals(0, result.size());
    }

    @Test
    void parse_emptyInput_shouldReturnEmptyObject() throws Exception {
        JsonNode result = ToolArgumentParser.parse("", "read_file");
        assertNotNull(result);
        assertTrue(result.isObject());
        assertEquals(0, result.size());
    }

    @Test
    void parse_blankInput_shouldReturnEmptyObject() throws Exception {
        JsonNode result = ToolArgumentParser.parse("   ", "read_file");
        assertNotNull(result);
        assertTrue(result.isObject());
        assertEquals(0, result.size());
    }

    @Test
    void parse_invalidJson_shouldThrowParseException() {
        String brokenJson = "{\"path\":\"test.txt\",\"old_text\":\"hello\",}";  // trailing comma
        ToolArgumentParseException ex = assertThrows(ToolArgumentParseException.class,
            () -> ToolArgumentParser.parse(brokenJson, "edit_file"));
        
        assertTrue(ex.getMessage().contains("JSON 解析失败"));
        assertEquals("edit_file", ex.getToolName());
        assertEquals(brokenJson, ex.getRawArguments());
        assertTrue(ex.toLlmPrompt().contains("edit_file"));
        assertTrue(ex.toLlmPrompt().contains("JSON"));
    }

    @Test
    void parse_unescapedQuotes_shouldThrowParseException() {
        String brokenJson = "{\"new_text\":\"He said \"hello\" to me\"}";
        assertThrows(ToolArgumentParseException.class,
            () -> ToolArgumentParser.parse(brokenJson, "edit_file"));
    }

    @Test
    void parse_contentWithValidBraces_shouldSucceed() throws Exception {
        // 内容中包含 { } 是合法的 JSON
        String json = "{\"content\":\"if (x > 0) { return true; }\",\"path\":\"test.java\"}";
        JsonNode result = ToolArgumentParser.parse(json, "write_file");
        
        assertNotNull(result);
        assertTrue(result.get("content").asText().contains("{ return true; }"));
    }

    @Test
    void parse_nestedJsonInContent_shouldSucceed() throws Exception {
        // 字符串值中包含 JSON 结构（已被正确转义）
        String json = "{\"path\":\"test.json\",\"content\":\"{\\\"key\\\": \\\"value\\\"}\"}";
        JsonNode result = ToolArgumentParser.parse(json, "write_file");
        
        assertNotNull(result);
        assertEquals("{\"key\": \"value\"}", result.get("content").asText());
    }

    @Test
    void parse_windowsPathWithBackslashes_shouldSucceed() throws Exception {
        String json = "{\"path\":\"C:\\\\Users\\\\test\\\\file.txt\",\"content\":\"test\"}";
        JsonNode result = ToolArgumentParser.parse(json, "write_file");
        
        assertNotNull(result);
        assertEquals("C:\\Users\\test\\file.txt", result.get("path").asText());
    }

    @Test
    void parse_multilineContent_shouldSucceed() throws Exception {
        String json = "{\"path\":\"test.md\",\"content\":\"# Title\\n\\nLine 1\\nLine 2\"}";
        JsonNode result = ToolArgumentParser.parse(json, "write_file");
        
        assertNotNull(result);
        assertTrue(result.get("content").asText().contains("# Title"));
        assertTrue(result.get("content").asText().contains("Line 1"));
    }

    @Test
    void parse_largeContentWithManyQuotes_shouldSucceed() throws Exception {
        StringBuilder largeContent = new StringBuilder();
        for (int i = 0; i < 100; i++) {
            largeContent.append("Line ").append(i).append(": \"quoted\" content\n");
        }
        // 确保引号被正确转义
        String escaped = largeContent.toString()
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n");
        
        String json = "{\"path\":\"large-file.txt\",\"content\":\"" + escaped + "\"}";
        JsonNode result = ToolArgumentParser.parse(json, "write_file");
        
        assertNotNull(result);
        assertTrue(result.get("content").asText().contains("\"quoted\""));
    }

    @Test
    void parse_singleQuotes_shouldThrowParseException() {
        String brokenJson = "{'old_text':'hello','new_text':'world'}";
        assertThrows(ToolArgumentParseException.class,
            () -> ToolArgumentParser.parse(brokenJson, "edit_file"));
    }

    @Test
    void isValid_validJson_shouldReturnTrue() {
        assertTrue(ToolArgumentParser.isValid("{\"key\":\"value\"}"));
    }

    @Test
    void isValid_invalidJson_shouldReturnFalse() {
        assertFalse(ToolArgumentParser.isValid("{invalid}"));
    }

    @Test
    void isValid_nullInput_shouldReturnTrue() {
        assertTrue(ToolArgumentParser.isValid(null));
    }

    @Test
    void isValid_emptyInput_shouldReturnTrue() {
        assertTrue(ToolArgumentParser.isValid(""));
    }

    @Test
    void parse_jsonWithArray_shouldSucceed() throws Exception {
        String json = "{\"files\":[\"a.txt\",\"b.txt\"],\"path\":\"/tmp\"}";
        JsonNode result = ToolArgumentParser.parse(json, "write_file");
        
        assertNotNull(result);
        assertTrue(result.get("files").isArray());
        assertEquals(2, result.get("files").size());
    }

    @Test
    void parse_jsonWithNumberAndBoolean_shouldSucceed() throws Exception {
        String json = "{\"count\":42,\"overwrite\":true}";
        JsonNode result = ToolArgumentParser.parse(json, "write_file");
        
        assertNotNull(result);
        assertEquals(42, result.get("count").asInt());
        assertTrue(result.get("overwrite").asBoolean());
    }

    @Test
    void toLlmPrompt_shouldIncludeToolNameAndError() {
        ToolArgumentParseException ex = new ToolArgumentParseException(
            "{invalid}", "write_file", "JSON 解析失败：Unexpected character");
        
        String prompt = ex.toLlmPrompt();
        assertTrue(prompt.contains("write_file"));
        assertTrue(prompt.contains("JSON"));
        assertTrue(prompt.contains("请检查并修正"));
    }
}
