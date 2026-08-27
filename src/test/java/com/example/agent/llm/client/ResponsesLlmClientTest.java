package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.llm.exception.LlmApiException;
import com.example.agent.llm.model.ChatRequest;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.ImagePart;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.TextPart;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.model.WebSearchAction;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.llm.stream.ToolCallDelta;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.BufferedReader;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ResponsesLlmClient 单元测试：请求体转换 / 非流式响应解析 / 流式事件解析。
 * <p>
 * 测试直接调用 protected 方法（同包访问），不发起真实网络请求。
 * </p>
 */
@DisplayName("ResponsesLlmClient 协议转换测试")
class ResponsesLlmClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private ResponsesLlmClient client;

    @BeforeEach
    void setUp() {
        Config config = Config.getInstance();
        config.getLlm().setProvider("deepseek-responses");
        config.getLlm().setModel("deepseek-v4-flash");
        client = new ResponsesLlmClient(config);
    }

    @Nested
    @DisplayName("🔵 请求体转换测试")
    class RequestBodyTests {

        @Test
        @DisplayName("system 消息提取为 instructions，user 消息转为 input message")
        void testSystemAndUserMessages() throws Exception {
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(
                    Message.system("你是助手"),
                    Message.user("你好")
            ));
            request.stream(true).maxTokens(1000).temperature(0.5);

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));

            assertEquals("deepseek-v4-flash", body.get("model").asText());
            assertEquals("你是助手", body.get("instructions").asText());
            assertTrue(body.get("stream").asBoolean());
            assertEquals(1000, body.get("max_output_tokens").asInt());
            assertEquals(0.5, body.get("temperature").asDouble());

            JsonNode input = body.get("input");
            assertTrue(input.isArray());
            assertEquals(1, input.size());
            assertEquals("message", input.get(0).get("type").asText());
            assertEquals("user", input.get(0).get("role").asText());
            assertEquals("你好", input.get(0).get("content").get(0).get("text").asText());
            assertEquals("input_text", input.get(0).get("content").get(0).get("type").asText());
        }

        @Test
        @DisplayName("多模态 user 消息转为 input_text + input_image")
        void testMultimodalMessage() throws Exception {
            Message multimodal = new Message("user", "", null);
            multimodal.setContentParts(List.of(
                    new TextPart("看看这张图"),
                    new ImagePart("data:image/png;base64,iVBORw0KGgo=")
            ));
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(multimodal));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));
            JsonNode input = body.get("input");
            assertEquals(1, input.size());
            assertEquals("message", input.get(0).get("type").asText());
            assertEquals("user", input.get(0).get("role").asText());
            JsonNode content = input.get(0).get("content");
            assertEquals(2, content.size());
            assertEquals("input_text", content.get(0).get("type").asText());
            assertEquals("看看这张图", content.get(0).get("text").asText());
            assertEquals("input_image", content.get(1).get("type").asText());
            assertEquals("data:image/png;base64,iVBORw0KGgo=", content.get(1).get("image_url").asText());
        }

        @Test
        @DisplayName("纯图片 user 消息不跳过，生成 input_image")
        void testImageOnlyMessage() throws Exception {
            Message multimodal = new Message("user", "", null);
            multimodal.setContentParts(List.of(new ImagePart("data:image/png;base64,iVBORw0KGgo=")));
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(multimodal));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));
            JsonNode input = body.get("input");
            assertEquals(1, input.size());
            assertEquals("message", input.get(0).get("type").asText());
            JsonNode content = input.get(0).get("content");
            assertEquals(1, content.size());
            assertEquals("input_image", content.get(0).get("type").asText());
            assertEquals("data:image/png;base64,iVBORw0KGgo=", content.get(0).get("image_url").asText());
        }

        @Test
        @DisplayName("tool 结果转为 function_call_output，assistant 工具调用转为 function_call")
        void testToolMessages() throws Exception {
            ToolCall tc = new ToolCall("call_1", new FunctionCall("get_weather", "{\"city\":\"北京\"}"));
            Message assistant = Message.assistantWithToolCalls(List.of(tc));
            Message toolResult = Message.toolResult("call_1", "get_weather", "晴");

            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(
                    Message.user("北京天气"),
                    assistant,
                    toolResult
            ));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));
            JsonNode input = body.get("input");

            assertEquals(3, input.size());
            // [0] user message
            assertEquals("message", input.get(0).get("type").asText());
            // [1] function_call
            assertEquals("function_call", input.get(1).get("type").asText());
            assertEquals("call_1", input.get(1).get("call_id").asText());
            assertEquals("get_weather", input.get(1).get("name").asText());
            assertEquals("{\"city\":\"北京\"}", input.get(1).get("arguments").asText());
            // [2] function_call_output
            assertEquals("function_call_output", input.get(2).get("type").asText());
            assertEquals("call_1", input.get(2).get("call_id").asText());
            assertEquals("晴", input.get(2).get("output").asText());
        }

        @Test
        @DisplayName("tools 转换为平铺 function 格式，tool_choice 保留")
        void testToolsConversion() throws Exception {
            Tool tool = Tool.of("get_weather", "查询天气",
                    Map.of("type", "object", "properties", Map.of("city", Map.of("type", "string"))));

            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")))
                    .tools(List.of(tool))
                    .toolChoiceAuto();

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));
            JsonNode tools = body.get("tools");

            assertTrue(tools.isArray());
            assertEquals(1, tools.size());
            assertEquals("function", tools.get(0).get("type").asText());
            assertEquals("get_weather", tools.get(0).get("name").asText());
            assertEquals("查询天气", tools.get(0).get("description").asText());
            assertEquals("object", tools.get(0).get("parameters").get("type").asText());
            // 平铺格式：不应有嵌套 function 对象
            assertFalse(tools.get(0).has("function"));

            assertEquals("auto", body.get("tool_choice").asText());
        }

        @Test
        @DisplayName("web_search 工具自动转换为服务端内置工具，普通 function 工具不受影响")
        void testWebSearchToolConvertedToBuiltin() throws Exception {
            Tool webSearch = Tool.of("web_search", "搜索互联网获取实时信息",
                    Map.of("type", "object", "properties", Map.of("query", Map.of("type", "string"))));
            Tool weather = Tool.of("get_weather", "查询天气",
                    Map.of("type", "object", "properties", Map.of("city", Map.of("type", "string"))));

            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")))
                    .tools(List.of(webSearch, weather));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));
            JsonNode tools = body.get("tools");

            assertTrue(tools.isArray());
            assertEquals(2, tools.size());

            // web_search → {"type":"web_search"}，服务端内置，无 name/description/parameters
            assertEquals("web_search", tools.get(0).get("type").asText());
            assertFalse(tools.get(0).has("name"));
            assertFalse(tools.get(0).has("description"));
            assertFalse(tools.get(0).has("parameters"));
            assertFalse(tools.get(0).has("function"));

            // 普通 function 工具保持平铺 function 格式
            assertEquals("function", tools.get(1).get("type").asText());
            assertEquals("get_weather", tools.get(1).get("name").asText());
            assertEquals("object", tools.get(1).get("parameters").get("type").asText());
        }

        @Test
        @DisplayName("仅有 web_search 工具时也正常序列化为内置工具")
        void testOnlyWebSearchTool() throws Exception {
            Tool webSearch = Tool.of("web_search", "搜索互联网获取实时信息",
                    Map.of("type", "object", "properties", Map.of("query", Map.of("type", "string"))));

            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")))
                    .tools(List.of(webSearch));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));
            JsonNode tools = body.get("tools");

            assertEquals(1, tools.size());
            assertEquals("web_search", tools.get(0).get("type").asText());
        }

        @Test
        @DisplayName("web_fetch 被过滤（与服务端内置 open_page 功能重复），普通 function 工具不受影响")
        void testWebFetchToolFilteredOut() throws Exception {
            Tool webFetch = Tool.of("web_fetch", "获取指定 URL 的网页内容",
                    Map.of("type", "object", "properties", Map.of("url", Map.of("type", "string"))));
            Tool weather = Tool.of("get_weather", "查询天气",
                    Map.of("type", "object", "properties", Map.of("city", Map.of("type", "string"))));

            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")))
                    .tools(List.of(webFetch, weather));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));
            JsonNode tools = body.get("tools");

            assertTrue(tools.isArray());
            // web_fetch 与模型服务端内置 open_page 重复：被过滤，仅剩 get_weather
            assertEquals(1, tools.size());
            assertEquals("function", tools.get(0).get("type").asText());
            assertEquals("get_weather", tools.get(0).get("name").asText());
            // tools 中不出现 web_fetch
            for (JsonNode tool : tools) {
                assertNotEquals("web_fetch", tool.get("name").asText());
            }
        }

        @Test
        @DisplayName("仅有 web_fetch 工具时整体不输出 tools 字段（全部被过滤）")
        void testOnlyWebFetchToolResultsInNoTools() throws Exception {
            Tool webFetch = Tool.of("web_fetch", "获取指定 URL 的网页内容",
                    Map.of("type", "object", "properties", Map.of("url", Map.of("type", "string"))));

            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")))
                    .tools(List.of(webFetch));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));

            // 全部工具被过滤 → toolsArray 为空 → 不输出 tools 字段
            assertFalse(body.has("tools"));
        }

        @ParameterizedTest
        @ValueSource(strings = { "low", "high", "max" })
        @DisplayName("reasoning.effort 与 text.format 正确映射（low/high/max 三档）")
        void testReasoningAndFormat(String effort) throws Exception {
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")))
                    .reasoningEffort(effort)
                    .responseFormat(Map.of("type", "json_object"));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));

            assertEquals(effort, body.get("reasoning").get("effort").asText());
            assertEquals("json_object", body.get("text").get("format").get("type").asText());
        }

        @Test
        @DisplayName("reasoningEffort 为空/空白时不输出 reasoning 字段（使用模型默认）")
        void testNoReasoningWhenEffortBlank() throws Exception {
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")))
                    .reasoningEffort("  ");

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));

            assertFalse(body.has("reasoning"));
        }

        @Test
        @DisplayName("无 system 消息时不输出 instructions 字段")
        void testNoInstructionsWhenNoSystem() throws Exception {
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));

            assertFalse(body.has("instructions"));
        }
    }

    @Nested
    @DisplayName("🔵 非流式响应解析测试")
    class NonStreamParseTests {

        @Test
        @DisplayName("解析 reasoning + message + usage（含缓存命中）")
        void testParseTextAndReasoning() throws Exception {
            String body = "{\"id\":\"resp_1\",\"object\":\"response\",\"model\":\"deepseek-v4-flash\","
                    + "\"output\":["
                    + "{\"type\":\"reasoning\",\"id\":\"rs_1\",\"content\":[{\"type\":\"summary_text\",\"text\":\"思考中\"}]},"
                    + "{\"type\":\"message\",\"id\":\"msg_1\",\"role\":\"assistant\","
                    + "\"content\":[{\"type\":\"output_text\",\"text\":\"你好！\",\"annotations\":[]}]}"
                    + "],"
                    + "\"status\":\"completed\","
                    + "\"usage\":{\"input_tokens\":10,\"input_tokens_details\":{\"cached_tokens\":8},"
                    + "\"output_tokens\":5,\"total_tokens\":15}}";

            ChatResponse response = client.parseResponsesBody(body);

            assertEquals("你好！", response.getContent());
            assertEquals("思考中", response.getFirstMessage().getReasoningContent());
            assertEquals("stop", response.getChoices().get(0).getFinishReason());
            assertEquals("resp_1", response.getId());
            assertEquals(10, response.getUsage().getPromptTokens());
            assertEquals(5, response.getUsage().getCompletionTokens());
            assertEquals(15, response.getUsage().getTotalTokens());
            assertEquals(8, response.getUsage().getPromptCacheHitTokens());
            assertFalse(response.hasToolCalls());
        }

        @Test
        @DisplayName("解析 function_call 输出 → tool_calls + finishReason=tool_calls")
        void testParseFunctionCall() throws Exception {
            String body = "{\"id\":\"resp_2\",\"object\":\"response\",\"model\":\"deepseek-v4-flash\","
                    + "\"output\":["
                    + "{\"type\":\"function_call\",\"id\":\"fc_1\",\"call_id\":\"call_9\","
                    + "\"name\":\"get_weather\",\"arguments\":\"{\\\"city\\\":\\\"北京\\\"}\",\"status\":\"completed\"}"
                    + "],"
                    + "\"status\":\"completed\",\"usage\":{\"input_tokens\":8,\"output_tokens\":12,\"total_tokens\":20}}";

            ChatResponse response = client.parseResponsesBody(body);

            assertTrue(response.hasToolCalls());
            assertEquals("tool_calls", response.getChoices().get(0).getFinishReason());
            List<ToolCall> toolCalls = response.getToolCalls();
            assertEquals(1, toolCalls.size());
            assertEquals("call_9", toolCalls.get(0).getId());
            assertEquals("get_weather", toolCalls.get(0).getFunction().getName());
            assertEquals("{\"city\":\"北京\"}", toolCalls.get(0).getFunction().getArguments());
        }

        @Test
        @DisplayName("status=incomplete → finishReason=length")
        void testParseIncomplete() throws Exception {
            String body = "{\"id\":\"resp_3\",\"object\":\"response\",\"model\":\"deepseek-v4-flash\","
                    + "\"output\":[{\"type\":\"message\",\"id\":\"msg_1\",\"role\":\"assistant\","
                    + "\"content\":[{\"type\":\"output_text\",\"text\":\"部分内容\"}]}],"
                    + "\"status\":\"incomplete\",\"usage\":{\"input_tokens\":5,\"output_tokens\":3}}";

            ChatResponse response = client.parseResponsesBody(body);

            assertEquals("length", response.getChoices().get(0).getFinishReason());
            assertEquals("部分内容", response.getContent());
        }

        @Test
        @DisplayName("web_search_call 不产生工具调用，但置 web_searched 标记")
        void testParseWebSearchCallIgnored() throws Exception {
            String body = "{\"id\":\"resp_4\",\"object\":\"response\",\"model\":\"deepseek-v4-flash\","
                    + "\"output\":["
                    + "{\"type\":\"web_search_call\",\"id\":\"ws_1\",\"status\":\"completed\"},"
                    + "{\"type\":\"message\",\"id\":\"msg_1\",\"role\":\"assistant\","
                    + "\"content\":[{\"type\":\"output_text\",\"text\":\"搜索完成\"}]}"
                    + "],"
                    + "\"status\":\"completed\"}";

            ChatResponse response = client.parseResponsesBody(body);

            assertEquals("搜索完成", response.getContent());
            assertFalse(response.hasToolCalls());
            // 服务端联网搜索已执行：message 携带 web_searched 标记（供前端展示 + 持久化）
            assertTrue(response.getFirstMessage().isWebSearched(),
                "web_search_call 应将 assistant 消息标记为 web_searched");
        }

        @Test
        @DisplayName("web_search_call 收集三种 action 明细（search/open_page/find_in_page），failed 保留 status")
        void testParseWebSearchActionsCollected() throws Exception {
            // 模拟真实响应：search（queries）/ open_page（url）/ find_in_page（url+pattern）/ failed（status）
            String body = "{\"id\":\"resp_5\",\"object\":\"response\",\"model\":\"deepseek-v4-flash\","
                    + "\"output\":["
                    + "{\"type\":\"web_search_call\",\"id\":\"ws_1\",\"status\":\"completed\","
                    + "\"action\":{\"type\":\"search\",\"queries\":[\"人工智能 最新新闻\",\"AI news today\"]}},"
                    + "{\"type\":\"web_search_call\",\"id\":\"ws_2\",\"status\":\"completed\","
                    + "\"action\":{\"type\":\"open_page\",\"url\":\"https://news.youth.cn/1#ws_call_id=ws_2\"}},"
                    + "{\"type\":\"web_search_call\",\"id\":\"ws_3\",\"status\":\"completed\","
                    + "\"action\":{\"type\":\"find_in_page\",\"url\":\"https://example.com#ws_call_id=ws_3\",\"pattern\":\"OpenAI\"}},"
                    + "{\"type\":\"web_search_call\",\"id\":\"ws_4\",\"status\":\"failed\","
                    + "\"action\":{\"type\":\"open_page\",\"url\":\"https://blocked.example.com#ws_call_id=ws_4\"}},"
                    + "{\"type\":\"message\",\"id\":\"msg_1\",\"role\":\"assistant\","
                    + "\"content\":[{\"type\":\"output_text\",\"text\":\"已搜索\"}]}"
                    + "],"
                    + "\"status\":\"completed\"}";

            ChatResponse response = client.parseResponsesBody(body);

            assertTrue(response.getFirstMessage().isWebSearched());
            List<WebSearchAction> actions = response.getFirstMessage().getWebSearchActions();
            assertNotNull(actions);
            assertEquals(4, actions.size(), "应收集 4 个 action（含 failed）");

            // search：type + queries
            WebSearchAction search = actions.get(0);
            assertEquals("search", search.getType());
            assertEquals(List.of("人工智能 最新新闻", "AI news today"), search.getQueries());
            assertEquals("completed", search.getStatus());

            // open_page：type + url
            WebSearchAction openPage = actions.get(1);
            assertEquals("open_page", openPage.getType());
            assertEquals("https://news.youth.cn/1#ws_call_id=ws_2", openPage.getUrl());

            // find_in_page：type + url + pattern
            WebSearchAction findInPage = actions.get(2);
            assertEquals("find_in_page", findInPage.getType());
            assertEquals("OpenAI", findInPage.getPattern());

            // failed：status 如实记录
            WebSearchAction failed = actions.get(3);
            assertEquals("open_page", failed.getType());
            assertEquals("failed", failed.getStatus());
        }

        @Test
        @DisplayName("web_search_call 无 action 时标记仍置位，actions 为空列表")
        void testParseWebSearchCallWithoutAction() throws Exception {
            String body = "{\"id\":\"resp_6\",\"object\":\"response\",\"model\":\"deepseek-v4-flash\","
                    + "\"output\":["
                    + "{\"type\":\"web_search_call\",\"id\":\"ws_1\",\"status\":\"completed\"},"
                    + "{\"type\":\"message\",\"id\":\"msg_1\",\"role\":\"assistant\","
                    + "\"content\":[{\"type\":\"output_text\",\"text\":\"ok\"}]}"
                    + "],"
                    + "\"status\":\"completed\"}";

            ChatResponse response = client.parseResponsesBody(body);

            assertTrue(response.getFirstMessage().isWebSearched());
            assertNull(response.getFirstMessage().getWebSearchActions(),
                "无 action 时不应设置 web_search_actions（保持 null，与旧会话兼容）");
        }
    }

    @Nested
    @DisplayName("🔵 流式事件解析测试")
    class StreamParseTests {

        @Test
        @DisplayName("output_text.delta 累积内容，completed 事件携带 usage 收尾")
        void testStreamTextDeltas() throws Exception {
            String sse = "event: response.output_text.delta\n"
                    + "data: {\"type\":\"response.output_text.delta\",\"delta\":\"你好\",\"sequence_number\":1}\n\n"
                    + "event: response.output_text.delta\n"
                    + "data: {\"type\":\"response.output_text.delta\",\"delta\":\"世界\",\"sequence_number\":2}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"output\":[{\"type\":\"message\"}],"
                    + "\"usage\":{\"input_tokens\":10,\"output_tokens\":5,\"total_tokens\":15}}\n";

            AtomicReference<String> streamed = new AtomicReference<>("");
            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunk -> {
                if (chunk.hasContent()) {
                    streamed.set(streamed.get() + chunk.getContent());
                }
            });

            assertEquals("你好世界", response.getContent());
            assertEquals("你好世界", streamed.get());
            assertEquals("stop", response.getChoices().get(0).getFinishReason());
            assertEquals(10, response.getUsage().getPromptTokens());
            assertEquals(5, response.getUsage().getCompletionTokens());
        }

        @Test
        @DisplayName("reasoning_text.delta 单独累积为思维链")
        void testStreamReasoningDeltas() throws Exception {
            String sse = "event: response.reasoning_text.delta\n"
                    + "data: {\"type\":\"response.reasoning_text.delta\",\"delta\":\"先\",\"sequence_number\":1}\n\n"
                    + "event: response.reasoning_text.delta\n"
                    + "data: {\"type\":\"response.reasoning_text.delta\",\"delta\":\"思考\",\"sequence_number\":2}\n\n"
                    + "event: response.output_text.delta\n"
                    + "data: {\"type\":\"response.output_text.delta\",\"delta\":\"答案\",\"sequence_number\":3}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"output\":[{\"type\":\"message\"}]}\n";

            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunk -> {
            });

            assertEquals("答案", response.getContent());
            assertEquals("先思考", response.getFirstMessage().getReasoningContent());
        }

        @Test
        @DisplayName("function_call 参数增量按 item_id 累积并组装 ToolCall")
        void testStreamFunctionCall() throws Exception {
            String sse = "event: response.output_item.added\n"
                    + "data: {\"type\":\"response.output_item.added\",\"item\":{\"id\":\"fc_1\",\"type\":\"function_call\",\"call_id\":\"call_1\",\"name\":\"get_weather\"}}\n\n"
                    + "event: response.function_call_arguments.delta\n"
                    + "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"delta\":\"{\\\"city\\\":\\\"\",\"sequence_number\":4}\n\n"
                    + "event: response.function_call_arguments.delta\n"
                    + "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"delta\":\"北京\\\"}\",\"sequence_number\":5}\n\n"
                    + "event: response.output_item.done\n"
                    + "data: {\"type\":\"response.output_item.done\",\"item\":{\"id\":\"fc_1\",\"type\":\"function_call\",\"call_id\":\"call_1\",\"name\":\"get_weather\"}}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"output\":[{\"type\":\"function_call\",\"call_id\":\"call_1\",\"name\":\"get_weather\"}]}\n";

            List<StreamChunk> chunks = new ArrayList<>();
            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunks::add);

            assertTrue(response.hasToolCalls());
            assertEquals("tool_calls", response.getChoices().get(0).getFinishReason());
            List<ToolCall> toolCalls = response.getToolCalls();
            assertEquals(1, toolCalls.size());
            assertEquals("call_1", toolCalls.get(0).getId());
            assertEquals("get_weather", toolCalls.get(0).getFunction().getName());
            assertEquals("{\"city\":\"北京\"}", toolCalls.get(0).getFunction().getArguments());

            // 回调中应收到工具调用增量，且增量携带 call_id（供上层实时发送 tool_start）
            boolean hasToolChunk = chunks.stream().anyMatch(StreamChunk::isToolCall);
            assertTrue(hasToolChunk, "应收到工具调用增量 chunk");
            assertTrue(chunks.stream()
                .filter(StreamChunk::isToolCall)
                .flatMap(c -> c.getToolCallDeltas().stream())
                .anyMatch(d -> "call_1".equals(d.getId())),
                "工具调用增量应携带 call_id=call_1，与最终 ToolCall.id 一致");
            // 首段增量携带工具名，后续增量只追加参数
            assertEquals("get_weather", chunks.stream()
                .filter(StreamChunk::isToolCall)
                .flatMap(c -> c.getToolCallDeltas().stream())
                .filter(d -> "call_1".equals(d.getId()))
                .findFirst().orElseThrow().getFunction().getName());
        }

        @Test
        @DisplayName("web_search_call 流式事件产生轻量标记信号，不产生 tool_start/tool_result 信号")
        void testStreamWebSearchCallProducesSignals() throws Exception {
            // OpenAI Responses 协议真实事件序列：in_progress → searching → completed
            String sse = "event: response.web_search_call.in_progress\n"
                    + "data: {\"type\":\"response.web_search_call.in_progress\",\"item_id\":\"ws_1\","
                    + "\"item\":{\"id\":\"ws_1\",\"call_id\":\"websearch_123\",\"type\":\"web_search_call\",\"status\":\"in_progress\"}}\n\n"
                    + "event: response.web_search_call.searching\n"
                    + "data: {\"type\":\"response.web_search_call.searching\",\"item_id\":\"ws_1\","
                    + "\"item\":{\"id\":\"ws_1\",\"call_id\":\"websearch_123\",\"type\":\"web_search_call\",\"status\":\"searching\"}}\n\n"
                    + "event: response.web_search_call.completed\n"
                    + "data: {\"type\":\"response.web_search_call.completed\",\"item_id\":\"ws_1\","
                    + "\"item\":{\"id\":\"ws_1\",\"call_id\":\"websearch_123\",\"type\":\"web_search_call\",\"status\":\"completed\"}}\n\n"
                    + "event: response.output_text.delta\n"
                    + "data: {\"type\":\"response.output_text.delta\",\"delta\":\"搜索结果为…\",\"sequence_number\":1}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"output\":[{\"type\":\"message\"}]}\n";

            List<StreamChunk> chunks = new ArrayList<>();
            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunks::add);

            // web_search 是模型内置能力：不产生 tool_start/tool_result 信号（不模拟卡片）
            assertTrue(chunks.stream().noneMatch(StreamChunk::isToolCall),
                "web_search_call 不应产生 tool_start 信号");
            // 但产生轻量标记信号：in_progress/searching → started（前端「正在联网搜索…」）
            assertEquals(2, chunks.stream().filter(StreamChunk::isWebSearchStarted).count(),
                "web_search_call.in_progress 与 .searching 各应产生一次 webSearchStarted 信号");
            assertEquals(1, chunks.stream().filter(StreamChunk::isWebSearchDone).count(),
                "web_search_call.completed 应产生 webSearchDone 信号");
            // 搜索结果仍作为文本正常输出，且不产生 ToolCall（服务端已执行）
            assertEquals("搜索结果为…", response.getContent());
            assertFalse(response.hasToolCalls());
        }

        @Test
        @DisplayName("web_search_call.failed（兼容事件）产生 done 信号，流正常收尾不抛异常")
        void testStreamWebSearchCallFailedProducesDoneSignal() throws Exception {
            String sse = "event: response.web_search_call.in_progress\n"
                    + "data: {\"type\":\"response.web_search_call.in_progress\",\"item_id\":\"ws_1\","
                    + "\"item\":{\"id\":\"ws_1\",\"call_id\":\"websearch_9\",\"type\":\"web_search_call\",\"status\":\"in_progress\"}}\n\n"
                    + "event: response.web_search_call.failed\n"
                    + "data: {\"type\":\"response.web_search_call.failed\",\"item_id\":\"ws_1\","
                    + "\"item\":{\"id\":\"ws_1\",\"call_id\":\"websearch_9\",\"type\":\"web_search_call\",\"status\":\"failed\"}}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"output\":[{\"type\":\"message\"}]}\n";

            List<StreamChunk> chunks = new ArrayList<>();
            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunks::add);

            // failed 事件同样产生 done 信号（前端标记为「已联网搜索」），不抛异常、流正常收尾
            assertEquals(1, chunks.stream().filter(StreamChunk::isWebSearchStarted).count(),
                "web_search_call.in_progress 应产生 webSearchStarted 信号");
            assertEquals(1, chunks.stream().filter(StreamChunk::isWebSearchDone).count(),
                "web_search_call.failed 应产生 webSearchDone 信号");
            assertTrue(chunks.stream().noneMatch(StreamChunk::isToolCall),
                "web_search_call.failed 不应产生 tool_start 信号");
            assertEquals("stop", response.getChoices().get(0).getFinishReason());
            assertFalse(response.hasToolCalls());
        }

        @Test
        @DisplayName("output_item.done 携带 action 明细（真实协议：仅此事件有 action）")
        void testStreamOutputItemDoneCarriesAction() throws Exception {
            // 实测协议序列：in_progress/searching/completed 事件 data 均不含 action，
            // 仅 response.output_item.done 的 item 携带完整 action（含 search 搜索词）
            String sse = "event: response.output_item.added\n"
                    + "data: {\"type\":\"response.output_item.added\",\"item\":{\"id\":\"ws_1\",\"type\":\"web_search_call\",\"status\":\"in_progress\"},\"output_index\":0}\n\n"
                    + "event: response.web_search_call.in_progress\n"
                    + "data: {\"type\":\"response.web_search_call.in_progress\",\"item_id\":\"ws_1\",\"output_index\":0}\n\n"
                    + "event: response.web_search_call.searching\n"
                    + "data: {\"type\":\"response.web_search_call.searching\",\"item_id\":\"ws_1\",\"output_index\":0}\n\n"
                    + "event: response.web_search_call.completed\n"
                    + "data: {\"type\":\"response.web_search_call.completed\",\"item_id\":\"ws_1\",\"output_index\":0}\n\n"
                    + "event: response.output_item.done\n"
                    + "data: {\"type\":\"response.output_item.done\",\"item\":{\"id\":\"ws_1\",\"type\":\"web_search_call\",\"status\":\"completed\","
                    + "\"action\":{\"type\":\"search\",\"queries\":[\"人工智能 最新新闻\",\"AI news today\"]}},\"output_index\":0}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"output\":[{\"type\":\"message\"}]}\n";

            List<StreamChunk> chunks = new ArrayList<>();
            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunks::add);

            // in_progress/searching → started 信号（前端「正在联网搜索…」）
            assertEquals(2, chunks.stream().filter(StreamChunk::isWebSearchStarted).count(),
                "in_progress 与 searching 各应产生一次 started 信号");
            // completed 事件产生无 action 的 done 信号（标记完成），output_item.done 追加带 action 的 done 信号
            assertEquals(2, chunks.stream().filter(StreamChunk::isWebSearchDone).count(),
                "completed 与 output_item.done 各产生一次 done 信号");
            assertEquals(1, chunks.stream()
                    .filter(StreamChunk::isWebSearchDone)
                    .filter(c -> c.getWebSearchAction() != null).count(),
                "仅 output_item.done 携带 action 的 done 信号应有一次");
            // done 信号携带的 action 明细正确（search + queries）——取带 action 的那个 done chunk
            StreamChunk doneChunk = chunks.stream()
                    .filter(StreamChunk::isWebSearchDone)
                    .filter(c -> c.getWebSearchAction() != null)
                    .findFirst().orElseThrow();
            assertNotNull(doneChunk.getWebSearchAction(), "done 信号应携带 action");
            assertEquals("search", doneChunk.getWebSearchAction().getType());
            assertEquals(List.of("人工智能 最新新闻", "AI news today"),
                doneChunk.getWebSearchAction().getQueries());
            assertEquals("completed", doneChunk.getWebSearchAction().getStatus());
            // 不产生 tool 信号（web_search 是服务端内置能力）
            assertTrue(chunks.stream().noneMatch(StreamChunk::isToolCall));
            assertFalse(response.hasToolCalls());
        }

        @Test
        @DisplayName("output_item.done 无 action 时静默降级（不抛异常，信号照发）")
        void testStreamOutputItemDoneWithoutActionFallsBack() throws Exception {
            // 防御：output_item.done 的 item 无 action（或非 web_search_call）时，
            // done 信号仍由 completed 事件产生，不抛异常、不输出 action chunk
            String sse = "event: response.web_search_call.in_progress\n"
                    + "data: {\"type\":\"response.web_search_call.in_progress\",\"item_id\":\"ws_1\"}\n\n"
                    + "event: response.web_search_call.completed\n"
                    + "data: {\"type\":\"response.web_search_call.completed\",\"item_id\":\"ws_1\"}\n\n"
                    + "event: response.output_item.done\n"
                    + "data: {\"type\":\"response.output_item.done\",\"item\":{\"id\":\"ws_1\",\"type\":\"web_search_call\",\"status\":\"completed\"}}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"output\":[{\"type\":\"message\"}]}\n";

            List<StreamChunk> chunks = new ArrayList<>();
            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunks::add);

            // completed 事件产生 done 信号（无 action），output_item.done 无 action 不追加 chunk
            assertEquals(1, chunks.stream().filter(StreamChunk::isWebSearchDone).count());
            assertTrue(chunks.stream().allMatch(c -> c.getWebSearchAction() == null),
                "无 action 时所有 chunk 的 webSearchAction 应为 null");
            assertEquals("stop", response.getChoices().get(0).getFinishReason());
        }

        @Test
        @DisplayName("response.failed 事件抛出 LlmApiException")
        void testStreamFailedThrows() {
            String sse = "event: response.failed\n"
                    + "data: {\"type\":\"response.failed\",\"error\":{\"message\":\"模型不可用\"}}\n";

            BufferedReader reader = new BufferedReader(new StringReader(sse));

            assertThrows(com.example.agent.llm.exception.LlmApiException.class,
                () -> client.processResponsesStreamLines(reader, chunk -> {
                }));
        }

        @Test
        @DisplayName("response.incomplete 事件 → finishReason=length")
        void testStreamIncomplete() throws Exception {
            String sse = "event: response.output_text.delta\n"
                    + "data: {\"type\":\"response.output_text.delta\",\"delta\":\"截断内容\",\"sequence_number\":1}\n\n"
                    + "event: response.incomplete\n"
                    + "data: {\"type\":\"response.incomplete\",\"usage\":{\"input_tokens\":5,\"output_tokens\":3}}\n";

            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunk -> {
            });

            assertEquals("截断内容", response.getContent());
            assertEquals("length", response.getChoices().get(0).getFinishReason());
        }

        @Test
        @DisplayName("官方格式：response.completed 事件 usage/output 嵌套在 response 对象内")
        void testStreamCompletedWithNestedResponse() throws Exception {
            // OpenAI Responses 协议真实格式：usage/output 在 data.response 对象内，而非事件顶层
            String sse = "event: response.output_text.delta\n"
                    + "data: {\"type\":\"response.output_text.delta\",\"delta\":\"你好\",\"sequence_number\":1}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"sequence_number\":2,"
                    + "\"response\":{\"id\":\"resp_9\",\"status\":\"completed\","
                    + "\"output\":[{\"type\":\"message\"}],"
                    + "\"usage\":{\"input_tokens\":10,\"input_tokens_details\":{\"cached_tokens\":8},"
                    + "\"output_tokens\":5,\"output_tokens_details\":{\"reasoning_tokens\":2},\"total_tokens\":15}}}\n";

            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunk -> {
            });

            assertEquals("你好", response.getContent());
            assertEquals("stop", response.getChoices().get(0).getFinishReason());
            // 嵌套格式下 usage 必须被正确解析（修复前为 null，导致前端 token 统计缺失）
            assertNotNull(response.getUsage(), "嵌套 response 对象内的 usage 应被解析");
            assertEquals(10, response.getUsage().getPromptTokens());
            assertEquals(5, response.getUsage().getCompletionTokens());
            assertEquals(15, response.getUsage().getTotalTokens());
            assertEquals(8, response.getUsage().getPromptCacheHitTokens());
        }

        @Test
        @DisplayName("官方格式：response.completed 嵌套 output 中的 function_call → finishReason=tool_calls")
        void testStreamCompletedNestedFunctionCallFinishReason() throws Exception {
            String sse = "event: response.output_item.added\n"
                    + "data: {\"type\":\"response.output_item.added\",\"item\":{\"id\":\"fc_1\",\"type\":\"function_call\",\"call_id\":\"call_7\",\"name\":\"get_weather\"}}\n\n"
                    + "event: response.function_call_arguments.delta\n"
                    + "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"delta\":\"{}\",\"sequence_number\":1}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\","
                    + "\"response\":{\"status\":\"completed\","
                    + "\"output\":[{\"type\":\"function_call\",\"call_id\":\"call_7\",\"name\":\"get_weather\"}],"
                    + "\"usage\":{\"input_tokens\":8,\"output_tokens\":12,\"total_tokens\":20}}}\n";

            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunk -> {
            });

            assertTrue(response.hasToolCalls());
            assertEquals("tool_calls", response.getChoices().get(0).getFinishReason());
            assertEquals(20, response.getUsage().getTotalTokens());
        }

        @Test
        @DisplayName("官方格式：response.incomplete 事件 usage 嵌套在 response 对象内")
        void testStreamIncompleteWithNestedResponse() throws Exception {
            String sse = "event: response.output_text.delta\n"
                    + "data: {\"type\":\"response.output_text.delta\",\"delta\":\"截断\",\"sequence_number\":1}\n\n"
                    + "event: response.incomplete\n"
                    + "data: {\"type\":\"response.incomplete\","
                    + "\"response\":{\"status\":\"incomplete\","
                    + "\"usage\":{\"input_tokens\":5,\"output_tokens\":3,\"total_tokens\":8}}}\n";

            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunk -> {
            });

            assertEquals("截断", response.getContent());
            assertEquals("length", response.getChoices().get(0).getFinishReason());
            assertNotNull(response.getUsage());
            assertEquals(5, response.getUsage().getPromptTokens());
            assertEquals(3, response.getUsage().getCompletionTokens());
            assertEquals(8, response.getUsage().getTotalTokens());
        }

        @Test
        @DisplayName("官方格式：response.failed 事件 error 嵌套在 response 对象内仍抛出异常")
        void testStreamFailedWithNestedResponse() {
            String sse = "event: response.failed\n"
                    + "data: {\"type\":\"response.failed\","
                    + "\"response\":{\"status\":\"failed\","
                    + "\"error\":{\"message\":\"模型不可用\"}}}\n";

            BufferedReader reader = new BufferedReader(new StringReader(sse));

            LlmApiException ex = assertThrows(LlmApiException.class,
                () -> client.processResponsesStreamLines(reader, chunk -> {
                }));
            assertTrue(ex.getMessage().contains("模型不可用"));
        }
    }

    // =========================================================
    // L3 自愈兜底：孤立 function_call_output 400 错误
    // =========================================================
    @Nested
    @DisplayName("🩹 L3 自愈：孤立 function_call_output 400 错误")
    class SelfHealTests {

        private LlmApiException orphanError() {
            String body = "{\"error\":{\"message\":\"No tool call found for tool output with call_id call-ghost\"}}";
            return new LlmApiException("Responses API 返回错误 (HTTP 400): " + body, 400, body);
        }

        @Test
        @DisplayName("命中孤立 function_call_output 400 + 有孤立 tool → 返回剔除后的请求")
        void healsOrphanTool() {
            ToolCall tc = new ToolCall("call-1", new FunctionCall("bash", "{}"));
            Message toolGhost = Message.toolResult("call-ghost", "bash", "result");
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(
                Message.user("执行命令"),
                Message.assistantWithToolCalls(List.of(tc)),
                Message.toolResult("call-1", "bash", "ok"),
                toolGhost
            ));

            ChatRequest healed = client.healOrphanToolCallRequest(request, orphanError());

            assertNotNull(healed);
            assertEquals(3, healed.getMessages().size());
            // 孤立 tool 消息被剔除
            for (Message m : healed.getMessages()) {
                assertFalse(m.isTool() && "call-ghost".equals(m.getToolCallId()));
            }
            // 正常配对的 tool 保留
            assertTrue(healed.getMessages().stream().anyMatch(m -> m.isTool() && "call-1".equals(m.getToolCallId())));
        }

        @Test
        @DisplayName("命中错误但无孤立 tool → 返回 null（不重试）")
        void noOrphanToolReturnsNull() {
            ToolCall tc = new ToolCall("call-1", new FunctionCall("bash", "{}"));
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(
                Message.user("执行命令"),
                Message.assistantWithToolCalls(List.of(tc)),
                Message.toolResult("call-1", "bash", "ok")
            ));

            assertNull(client.healOrphanToolCallRequest(request, orphanError()));
        }

        @Test
        @DisplayName("非 400 错误 → 返回 null")
        void non400ReturnsNull() {
            ToolCall tc = new ToolCall("call-1", new FunctionCall("bash", "{}"));
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(
                Message.assistantWithToolCalls(List.of(tc)),
                Message.toolResult("call-1", "bash", "ok"),
                Message.toolResult("call-ghost", "bash", "x")
            ));
            LlmApiException serverError = new LlmApiException("HTTP 500", 500, "server error");

            assertNull(client.healOrphanToolCallRequest(request, serverError));
        }

        @Test
        @DisplayName("400 但错误体不含标记 → 返回 null")
        void unrelated400ReturnsNull() {
            ToolCall tc = new ToolCall("call-1", new FunctionCall("bash", "{}"));
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(
                Message.assistantWithToolCalls(List.of(tc)),
                Message.toolResult("call-1", "bash", "ok")
            ));
            LlmApiException other400 = new LlmApiException(
                "HTTP 400: invalid_request_error", 400, "{\"error\":{\"message\":\"invalid parameter\"}}");

            assertNull(client.healOrphanToolCallRequest(request, other400));
        }

        @Test
        @DisplayName("自愈重建保留请求其它字段（tools / temperature / stream 等）")
        void healsPreserveOtherFields() {
            Tool ghost = Tool.of("bash", "执行命令", Map.of("type", "object"));
            ToolCall tc = new ToolCall("call-1", new FunctionCall("bash", "{}"));
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(
                Message.assistantWithToolCalls(List.of(tc)),
                Message.toolResult("call-1", "bash", "ok"),
                Message.toolResult("call-ghost", "bash", "x")
            ))
                .tools(List.of(ghost))
                .toolChoiceAuto()
                .stream(true)
                .maxTokens(500)
                .temperature(0.3)
                .reasoningEffort("high")
                .responseFormat(Map.of("type", "json_object"));

            ChatRequest healed = client.healOrphanToolCallRequest(request, orphanError());

            assertNotNull(healed);
            assertEquals("deepseek-v4-flash", healed.getModel());
            assertEquals(1, healed.getTools().size());
            assertEquals("auto", healed.getToolChoice());
            assertEquals(Boolean.TRUE, healed.getStream());
            assertEquals(500, healed.getMaxTokens());
            assertEquals(0.3, healed.getTemperature());
            assertEquals("high", healed.getReasoningEffort());
            assertEquals("json_object", healed.getResponseFormat().get("type"));
        }

        @Test
        @DisplayName("空 call_id 的 tool 消息也被剔除")
        void healsEmptyCallIdTool() {
            Message emptyIdTool = new Message("tool", "result");
            emptyIdTool.setToolCallId("");
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(
                Message.user("hi"),
                emptyIdTool
            ));

            ChatRequest healed = client.healOrphanToolCallRequest(request, orphanError());

            assertNotNull(healed);
            assertEquals(1, healed.getMessages().size());
            assertFalse(healed.getMessages().stream().anyMatch(Message::isTool));
        }
    }
}
