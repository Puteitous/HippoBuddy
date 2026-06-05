package com.example.agent.tools.web;

import com.example.agent.tools.ToolExecutionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WebFetchToolTest {

    private WebFetchTool tool;
    private ObjectMapper objectMapper;

    @Mock
    private OkHttpClient mockHttpClient;
    @Mock
    private Call mockCall;
    @Mock
    private Response mockResponse;
    @Mock
    private ResponseBody mockResponseBody;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        tool = new WebFetchTool();
    }

    @Test
    void testGetName() {
        assertEquals("web_fetch", tool.getName());
    }

    @Test
    void testGetDescription() {
        String desc = tool.getDescription();
        assertNotNull(desc);
        assertTrue(desc.contains("URL"));
        assertTrue(desc.contains("HTML"));
    }

    @Test
    void testGetParametersSchema() {
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("url"));
        assertTrue(schema.contains("required"));
    }

    @Test
    void testExecuteThrowsWhenUrlEmpty() {
        JsonNode args = objectMapper.createObjectNode().put("url", "");
        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("不能为空"));
    }

    @Test
    void testExecuteThrowsWhenUrlNull() {
        // url 字段缺失
        JsonNode args = objectMapper.createObjectNode();
        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("不能为空"));
    }

    @Test
    void testExecuteThrowsOnPhishingUrl() {
        JsonNode args = objectMapper.createObjectNode()
                .put("url", "https://evil.com@legitimate.com");
        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("不安全的 URL"));
    }

    @Test
    void testExecuteThrowsOnUrlWithCredentials() {
        JsonNode args = objectMapper.createObjectNode()
                .put("url", "https://user:pass@example.com");
        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("不安全的 URL"));
    }

    @Test
    void testRequiresFileLock() {
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testShouldRunInBackground() {
        assertTrue(tool.shouldRunInBackground());
    }

    // ========== htmlToText 测试 ==========

    @Test
    void testHtmlToTextSimpleParagraph() {
        String html = "<html><body><p>Hello World</p></body></html>";
        String result = tool.htmlToText(html, "https://example.com");
        assertNotNull(result);
        assertTrue(result.contains("Hello World"));
    }

    @Test
    void testHtmlToTextHeadings() {
        String html = """
            <html>
            <body>
                <h1>Title</h1>
                <h2>Section 1</h2>
                <h3>Subsection</h3>
                <p>Content here</p>
            </body>
            </html>
            """;

        String result = tool.htmlToText(html, "https://example.com");
        assertTrue(result.contains("# Title"));
        assertTrue(result.contains("## Section 1"));
        assertTrue(result.contains("### Subsection"));
        assertTrue(result.contains("Content here"));
    }

    @Test
    void testHtmlToTextList() {
        String html = """
            <html><body>
                <ul>
                    <li>Item one</li>
                    <li>Item two</li>
                </ul>
            </body></html>
            """;

        String result = tool.htmlToText(html, "https://example.com");
        assertTrue(result.contains("- Item one"));
        assertTrue(result.contains("- Item two"));
    }

    @Test
    void testHtmlToTextCodeBlock() {
        String html = """
            <html><body>
                <pre>System.out.println("hello");</pre>
                <p>After code</p>
            </body></html>
            """;

        String result = tool.htmlToText(html, "https://example.com");
        assertTrue(result.contains("```"));
        assertTrue(result.contains("System.out.println"));
        assertTrue(result.contains("After code"));
    }

    @Test
    void testHtmlToTextBlockquote() {
        String html = """
            <html><body>
                <blockquote>This is a quote</blockquote>
            </body></html>
            """;

        String result = tool.htmlToText(html, "https://example.com");
        assertTrue(result.contains("> This is a quote"));
    }

    @Test
    void testHtmlToTextTitle() {
        String html = """
            <html>
            <head><title>My Page Title</title></head>
            <body><p>Content</p></body>
            </html>
            """;

        String result = tool.htmlToText(html, "https://example.com");
        assertTrue(result.contains("# My Page Title"));
    }

    @Test
    void testHtmlToTextRemovesScriptAndStyle() {
        String html = """
            <html><body>
                <script>alert('xss');</script>
                <style>.cls { color: red; }</style>
                <p>Real content</p>
            </body></html>
            """;

        String result = tool.htmlToText(html, "https://example.com");
        assertFalse(result.contains("alert"));
        assertFalse(result.contains(".cls"));
        assertTrue(result.contains("Real content"));
    }

    @Test
    void testHtmlToTextRemovesNoscriptIframe() {
        String html = """
            <html><body>
                <noscript>Enable JS</noscript>
                <iframe src="ad.html"></iframe>
                <p>Real content</p>
            </body></html>
            """;

        String result = tool.htmlToText(html, "https://example.com");
        assertFalse(result.contains("Enable JS"));
        assertFalse(result.contains("ad.html"));
        assertTrue(result.contains("Real content"));
    }

    @Test
    void testHtmlToTextTableCells() {
        String html = """
            <html><body>
                <table>
                    <tr><th>Name</th><th>Age</th></tr>
                    <tr><td>Alice</td><td>30</td></tr>
                </table>
            </body></html>
            """;

        String result = tool.htmlToText(html, "https://example.com");
        assertTrue(result.contains("Name"));
        assertTrue(result.contains("Alice"));
    }

    @Test
    void testHtmlToTextEmptyBody() {
        String html = "<html><body></body></html>";
        String result = tool.htmlToText(html, "https://example.com");
        assertEquals("", result);
    }

    // ========== execute 测试（mock HTTP） ==========

    @Test
    void testExecuteWithMockHttp() throws Exception {
        tool = new WebFetchTool(mockHttpClient);

        String html = "<html><body><h1>Test Page</h1><p>Hello world</p></body></html>";

        when(mockHttpClient.newCall(any(Request.class))).thenReturn(mockCall);
        when(mockCall.execute()).thenReturn(mockResponse);
        when(mockResponse.isSuccessful()).thenReturn(true);
        when(mockResponse.header("Content-Type", "")).thenReturn("text/html; charset=utf-8");
        when(mockResponse.body()).thenReturn(mockResponseBody);
        when(mockResponseBody.bytes()).thenReturn(html.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        JsonNode args = objectMapper.createObjectNode().put("url", "https://example.com");
        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("Test Page"));
        assertTrue(result.contains("Hello world"));
    }

    @Test
    void testExecuteAddsHttpsPrefix() throws Exception {
        tool = new WebFetchTool(mockHttpClient);

        String html = "<html><body><p>Content</p></body></html>";

        when(mockHttpClient.newCall(any(Request.class))).thenReturn(mockCall);
        when(mockCall.execute()).thenReturn(mockResponse);
        when(mockResponse.isSuccessful()).thenReturn(true);
        when(mockResponse.header("Content-Type", "")).thenReturn("text/html");
        when(mockResponse.body()).thenReturn(mockResponseBody);
        when(mockResponseBody.bytes()).thenReturn(html.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        // 没有 http(s) 前缀，应自动补全
        JsonNode args = objectMapper.createObjectNode().put("url", "example.com/page");
        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("Content"));
    }

    @Test
    void testExecuteWithHttpError() throws Exception {
        tool = new WebFetchTool(mockHttpClient);

        when(mockHttpClient.newCall(any(Request.class))).thenReturn(mockCall);
        when(mockCall.execute()).thenReturn(mockResponse);
        when(mockResponse.isSuccessful()).thenReturn(false);
        when(mockResponse.code()).thenReturn(404);
        when(mockResponse.message()).thenReturn("Not Found");

        JsonNode args = objectMapper.createObjectNode().put("url", "https://example.com/404");
        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("404"));
    }
}
