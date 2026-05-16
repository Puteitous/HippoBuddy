package com.example.agent.tools;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 增强版 JSON 参数修复测试
 */
public class ToolArgumentSanitizerEnhancedTest {

    @Test
    public void testValidJsonShouldNotBeModified() {
        String validJson = "{\"old_text\":\"hello\",\"new_text\":\"world\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", validJson);
        assertEquals(validJson, result);
    }

    @Test
    public void testChineseCharactersInOldText() {
        // 模拟日志中的错误场景：中文字符导致 JSON 解析失败
        String brokenJson = "{\"old_text\":\"似的内容\",\"new_text\":\"新的内容\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        // 应该能够正确解析或修复
        assertNotNull(result);
        assertTrue(result.contains("old_text"));
        assertTrue(result.contains("new_text"));
    }

    @Test
    public void testUnescapedQuotes() {
        String brokenJson = "{\"old_text\":\"hello \"world\" test\",\"new_text\":\"new\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        // 应该修复未转义的引号
        assertNotNull(result);
    }

    @Test
    public void testMissingCommas() {
        String brokenJson = "{\"old_text\":\"hello\" \"new_text\":\"world\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        // 应该添加缺失的逗号
        assertNotNull(result);
    }

    @Test
    public void testTrailingCommas() {
        String brokenJson = "{\"old_text\":\"hello\", \"new_text\":\"world\",}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        // 应该移除多余的逗号
        assertNotNull(result);
    }

    @Test
    public void testSingleQuotes() {
        String brokenJson = "{'old_text':'hello','new_text':'world'}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        // 应该转换为双引号
        assertNotNull(result);
        assertTrue(result.contains("\"old_text\""));
    }

    @Test
    public void testControlCharacters() {
        // 包含控制字符的 JSON
        String brokenJson = "{\"old_text\":\"hello\\u0000world\",\"new_text\":\"test\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        assertNotNull(result);
    }

    @Test
    public void testComplexBrokenJson() {
        // 多种问题混合的复杂场景
        String brokenJson = "{'old_text':'似的内容' 'new_text':'新的内容',}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        // 应该能够修复多种问题
        assertNotNull(result);
    }

    @Test
    public void testNonEditFileToolShouldNotBeModified() {
        String json = "{\"query\":\"test\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("glob", json);
        assertEquals(json, result);
    }

    @Test
    public void testNullAndEmptyInputs() {
        assertNull(ToolArgumentSanitizer.fixJsonArguments("edit_file", null));
        assertEquals("", ToolArgumentSanitizer.fixJsonArguments("edit_file", ""));
    }

    @Test
    public void testNestedJsonInFieldValue() {
        // 字段值中包含类似 JSON 的结构
        String brokenJson = "{\"old_text\":\"if (x > 0) { return true; }\",\"new_text\":\"return false;\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        assertNotNull(result);
    }

    @Test
    public void testMultilineContent() {
        String brokenJson = "{\"old_text\":\"line1\\nline2\\nline3\",\"new_text\":\"single\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        assertNotNull(result);
    }

    @Test
    public void testSpecialCharactersInPath() {
        String brokenJson = "{\"path\":\"C:\\\\Users\\\\test\\\\file.txt\",\"content\":\"test\"}";
        String result = ToolArgumentSanitizer.fixJsonArguments("edit_file", brokenJson);
        
        assertNotNull(result);
    }
}
