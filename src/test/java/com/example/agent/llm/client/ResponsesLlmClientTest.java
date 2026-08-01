package com.example.agent.llm.client;

import com.example.agent.config.Config;
import com.example.agent.llm.exception.LlmApiException;
import com.example.agent.llm.model.ChatRequest;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.llm.stream.StreamChunk;
import com.example.agent.llm.stream.ToolCallDelta;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

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
        @DisplayName("reasoning.effort 与 text.format 正确映射")
        void testReasoningAndFormat() throws Exception {
            ChatRequest request = ChatRequest.of("deepseek-v4-flash", List.of(Message.user("hi")))
                    .reasoningEffort("high")
                    .responseFormat(Map.of("type", "json_object"));

            JsonNode body = objectMapper.readTree(client.buildResponsesRequestBody(request));

            assertEquals("high", body.get("reasoning").get("effort").asText());
            assertEquals("json_object", body.get("text").get("format").get("type").asText());
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
        @DisplayName("web_search_call 被忽略，不产生工具调用")
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
        @DisplayName("web_search_call 流式事件静默忽略，不产生 tool_start/tool_result 信号")
        void testStreamWebSearchCallSilentlyIgnored() throws Exception {
            String sse = "event: response.web_search_call.started\n"
                    + "data: {\"type\":\"response.web_search_call.started\",\"item_id\":\"ws_1\","
                    + "\"item\":{\"id\":\"ws_1\",\"call_id\":\"websearch_123\",\"type\":\"web_search_call\",\"status\":\"in_progress\"}}\n\n"
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

            // web_search 是模型内置能力：不产生任何 tool_start/tool_result 信号（静默化）
            assertTrue(chunks.stream().noneMatch(StreamChunk::isToolCall),
                "web_search_call 不应产生 tool_start 信号");
            // 搜索结果仍作为文本正常输出，且不产生 ToolCall（服务端已执行）
            assertEquals("搜索结果为…", response.getContent());
            assertFalse(response.hasToolCalls());
        }

        @Test
        @DisplayName("web_search_call.failed 静默忽略，不产生任何信号")
        void testStreamWebSearchCallFailedSilentlyIgnored() throws Exception {
            String sse = "event: response.web_search_call.started\n"
                    + "data: {\"type\":\"response.web_search_call.started\",\"item_id\":\"ws_1\","
                    + "\"item\":{\"id\":\"ws_1\",\"call_id\":\"websearch_9\",\"type\":\"web_search_call\",\"status\":\"in_progress\"}}\n\n"
                    + "event: response.web_search_call.failed\n"
                    + "data: {\"type\":\"response.web_search_call.failed\",\"item_id\":\"ws_1\","
                    + "\"item\":{\"id\":\"ws_1\",\"call_id\":\"websearch_9\",\"type\":\"web_search_call\",\"status\":\"failed\"}}\n\n"
                    + "event: response.completed\n"
                    + "data: {\"type\":\"response.completed\",\"output\":[{\"type\":\"message\"}]}\n";

            List<StreamChunk> chunks = new ArrayList<>();
            BufferedReader reader = new BufferedReader(new StringReader(sse));

            ChatResponse response = client.processResponsesStreamLines(reader, chunks::add);

            // failed 事件静默忽略：不产生 tool_start / tool_result 信号，流正常收尾
            assertTrue(chunks.stream().noneMatch(StreamChunk::isToolCall),
                "web_search_call.failed 不应产生 tool_start 信号");
            assertEquals("stop", response.getChoices().get(0).getFinishReason());
            assertFalse(response.hasToolCalls());
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
}
