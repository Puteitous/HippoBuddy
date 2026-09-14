package com.example.agent.replay;

import com.example.agent.llm.model.ChatResponse;
import com.example.agent.testutil.LlmResponseBuilder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 回放夹具（fixture）：从 JSON 资源加载按序的 LLM 响应序列。
 * <p>
 * 格式：{@code userPrompt} + {@code responses[]}（每项含 {@code content} 与
 * {@code toolCalls[]{name, arguments}}）。未来录制工具只需按此格式落盘，
 * 回放测试即可无 key 复现同一轮 agent 循环。
 */
public final class ReplayFixture {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final String userPrompt;
    private final List<ChatResponse> responses;

    private ReplayFixture(String userPrompt, List<ChatResponse> responses) {
        this.userPrompt = userPrompt;
        this.responses = responses;
    }

    public static ReplayFixture load(String resourcePath) throws IOException {
        try (InputStream in = ReplayFixture.class.getClassLoader().getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IOException("回放夹具资源不存在: " + resourcePath);
            }
            JsonNode root = OBJECT_MAPPER.readTree(in);
            String userPrompt = root.path("userPrompt").asText("");

            List<ChatResponse> responses = new ArrayList<>();
            JsonNode responseNodes = root.path("responses");
            for (JsonNode node : responseNodes) {
                LlmResponseBuilder builder = LlmResponseBuilder.create()
                        .content(node.path("content").asText(""));
                JsonNode toolCalls = node.path("toolCalls");
                for (JsonNode call : toolCalls) {
                    builder.addToolCall(
                            call.path("id").asText("call-" + System.nanoTime()),
                            call.path("name").asText(),
                            call.path("arguments").asText("{}"));
                }
                responses.add(builder.build());
            }
            return new ReplayFixture(userPrompt, responses);
        }
    }

    public String userPrompt() {
        return userPrompt;
    }

    /** 按序的 LLM 响应（直接喂给 MockLlmClient.enqueueResponse）。 */
    public List<ChatResponse> responses() {
        return responses;
    }
}
