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
class WebSearchToolTest {

    private WebSearchTool tool;
    private WebSearchConfig config;
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
        config = new WebSearchConfig();
        objectMapper = new ObjectMapper();
    }

    @Test
    void testGetName() {
        config.setApiKey("test-key");
        tool = new WebSearchTool(config);
        assertEquals("web_search", tool.getName());
    }

    @Test
    void testGetDescription() {
        config.setApiKey("test-key");
        tool = new WebSearchTool(config);
        String desc = tool.getDescription();
        assertNotNull(desc);
        assertTrue(desc.contains("搜索"));
    }

    @Test
    void testGetParametersSchema() {
        config.setApiKey("test-key");
        tool = new WebSearchTool(config);
        String schema = tool.getParametersSchema();
        assertNotNull(schema);
        assertTrue(schema.contains("query"));
        assertTrue(schema.contains("num"));
        assertTrue(schema.contains("required"));
    }

    @Test
    void testExecuteThrowsWhenConfigDisabled() {
        // apiKey 为空 → isEnabled() = false
        tool = new WebSearchTool(config);
        JsonNode args = objectMapper.createObjectNode().put("query", "test");

        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("API Key"));
    }

    @Test
    void testExecuteThrowsWhenQueryEmpty() {
        config.setApiKey("test-key");
        tool = new WebSearchTool(config);
        JsonNode args = objectMapper.createObjectNode().put("query", "");

        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("为空"));
    }

    @Test
    void testExecuteThrowsWhenQueryMissing() {
        config.setApiKey("test-key");
        tool = new WebSearchTool(config);
        JsonNode args = objectMapper.createObjectNode();

        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("为空"));
    }

    @Test
    void testRequiresFileLock() {
        config.setApiKey("test-key");
        tool = new WebSearchTool(config);
        assertFalse(tool.requiresFileLock());
    }

    @Test
    void testShouldRunInBackground() {
        config.setApiKey("test-key");
        tool = new WebSearchTool(config);
        assertTrue(tool.shouldRunInBackground());
    }

    // ========== formatResults 测试 ==========

    @Test
    void testFormatResultsBrave() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("brave");
        tool = new WebSearchTool(config);

        String braveJson = """
            {
                "web": {
                    "results": [
                        {
                            "title": "Java 21 新特性",
                            "url": "https://example.com/java21",
                            "description": "Java 21 引入了虚拟线程等新特性"
                        },
                        {
                            "title": "Spring Boot 3.2",
                            "url": "https://example.com/spring-boot-3.2",
                            "description": "Spring Boot 3.2 正式发布"
                        }
                    ]
                }
            }
            """;

        String result = tool.formatResults("Java 21", braveJson);
        assertNotNull(result);
        assertTrue(result.contains("Java 21"));
        assertTrue(result.contains("Java 21 新特性"));
        assertTrue(result.contains("https://example.com/java21"));
        assertTrue(result.contains("Java 21 引入了虚拟线程"));
        assertTrue(result.contains("Spring Boot 3.2"));
        assertTrue(result.contains("重要"));
    }

    @Test
    void testFormatResultsTavily() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("tavily");
        tool = new WebSearchTool(config);

        String tavilyJson = """
            {
                "results": [
                    {
                        "title": "Java 21 Virtual Threads Guide",
                        "url": "https://example.com/virtual-threads",
                        "content": "Virtual threads are lightweight threads that greatly simplify the writing, debugging, and profiling of concurrent applications."
                    }
                ]
            }
            """;

        String result = tool.formatResults("Java 21 virtual threads", tavilyJson);
        assertNotNull(result);
        assertTrue(result.contains("Java 21 virtual threads"));
        assertTrue(result.contains("Virtual threads are lightweight"));
        assertTrue(result.contains("https://example.com/virtual-threads"));
        assertTrue(result.contains("重要"));
    }

    @Test
    void testFormatResultsTavilyContentTruncation() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("tavily");
        tool = new WebSearchTool(config);

        // content 超过 500 字符
        String longContent = "A".repeat(600);
        String tavilyJson = """
            {
                "results": [
                    {
                        "title": "Long Article",
                        "url": "https://example.com/long",
                        "content": "%s"
                    }
                ]
            }
            """.formatted(longContent);

        String result = tool.formatResults("test", tavilyJson);
        assertNotNull(result);
        // 截断后应该正好 500 + "..."
        assertTrue(result.contains("A".repeat(500) + "..."));
    }

    @Test
    void testFormatResultsBraveNoResults() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("brave");
        tool = new WebSearchTool(config);

        String emptyJson = """
            { "web": { "results": [] } }
            """;

        String result = tool.formatResults("nothing", emptyJson);
        assertTrue(result.contains("未找到"));
    }

    @Test
    void testFormatResultsBraveMissingWeb() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("brave");
        tool = new WebSearchTool(config);

        String result = tool.formatResults("nothing", "{}");
        assertTrue(result.contains("未找到"));
    }

    @Test
    void testFormatResultsTavilyNoResults() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("tavily");
        tool = new WebSearchTool(config);

        String result = tool.formatResults("nothing", "{}");
        assertTrue(result.contains("未找到"));
    }

    @Test
    void testFormatResultsTavilyEmptyArray() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("tavily");
        tool = new WebSearchTool(config);

        String result = tool.formatResults("nothing", "{\"results\": []}");
        assertTrue(result.contains("未找到"));
    }

    // ========== 使用 mock HttpClient 测试 execute ==========

    @Test
    void testExecuteWithBraveMock() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("brave");
        tool = new WebSearchTool(config, mockHttpClient);

        String braveResponse = """
            {
                "web": {
                    "results": [
                        {
                            "title": "Mock Result",
                            "url": "https://mock.com",
                            "description": "Mock description"
                        }
                    ]
                }
            }
            """;

        when(mockHttpClient.newCall(any(Request.class))).thenReturn(mockCall);
        when(mockCall.execute()).thenReturn(mockResponse);
        when(mockResponse.isSuccessful()).thenReturn(true);
        when(mockResponse.body()).thenReturn(mockResponseBody);
        when(mockResponseBody.string()).thenReturn(braveResponse);

        JsonNode args = objectMapper.createObjectNode().put("query", "mock test");
        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("Mock Result"));
        assertTrue(result.contains("https://mock.com"));
    }

    @Test
    void testExecuteWithTavilyMock() throws Exception {
        config.setApiKey("test-key");
        config.setProvider("tavily");
        tool = new WebSearchTool(config, mockHttpClient);

        String tavilyResponse = """
            {
                "results": [
                    {
                        "title": "Tavily Result",
                        "url": "https://tavily.com/result",
                        "content": "Tavily search result content"
                    }
                ]
            }
            """;

        when(mockHttpClient.newCall(any(Request.class))).thenReturn(mockCall);
        when(mockCall.execute()).thenReturn(mockResponse);
        when(mockResponse.isSuccessful()).thenReturn(true);
        when(mockResponse.body()).thenReturn(mockResponseBody);
        when(mockResponseBody.string()).thenReturn(tavilyResponse);

        JsonNode args = objectMapper.createObjectNode().put("query", "tavily test");
        String result = tool.execute(args);

        assertNotNull(result);
        assertTrue(result.contains("Tavily Result"));
        assertTrue(result.contains("Tavily search result content"));
    }

    @Test
    void testExecuteWithHttpError() throws Exception {
        config.setApiKey("test-key");
        tool = new WebSearchTool(config, mockHttpClient);

        when(mockHttpClient.newCall(any(Request.class))).thenReturn(mockCall);
        when(mockCall.execute()).thenReturn(mockResponse);
        when(mockResponse.isSuccessful()).thenReturn(false);
        when(mockResponse.code()).thenReturn(401);
        when(mockResponse.body()).thenReturn(mockResponseBody);
        when(mockResponseBody.string()).thenReturn("Unauthorized");

        JsonNode args = objectMapper.createObjectNode().put("query", "test");
        ToolExecutionException ex = assertThrows(ToolExecutionException.class,
                () -> tool.execute(args));
        assertTrue(ex.getMessage().contains("401") || ex.getMessage().contains("失败"));
    }
}
