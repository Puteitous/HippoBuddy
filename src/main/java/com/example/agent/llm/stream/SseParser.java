package com.example.agent.llm.stream;

import com.example.agent.llm.model.Usage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/* 
 *  Server-Sent Events（服务器推送事件），用于解析 LLM 服务器返回的流式输出
 * 解析 LLM 服务器返回的流式输出，将每个分块转换为 StreamChunk 对象
 */

public class SseParser {

    private static final Logger logger = LoggerFactory.getLogger(SseParser.class);
    private static final String DATA_PREFIX = "data: ";
    private static final String DONE_MARKER = "[DONE]";
    private static final int MAX_TOOL_CALL_INDEX = 1000;
    private static final int MAX_ARGUMENTS_LENGTH = 100000;

    private final ObjectMapper objectMapper;

    public SseParser() {
        this.objectMapper = new ObjectMapper();
    }

    public StreamChunk parse(String line) {
        if (line == null || line.trim().isEmpty()) {
            return null;
        }

        if (!line.startsWith(DATA_PREFIX)) {
            return null;
        }

        String data = line.substring(DATA_PREFIX.length()).trim();

        if (DONE_MARKER.equals(data)) {
            return null;
        }

        try {
            JsonNode root = objectMapper.readTree(data);
            return parseChunk(root);
        } catch (Exception e) {
            logger.warn("解析SSE行失败: {}, 错误: {}", truncate(data, 100), e.getMessage());
            return null;
        }
    }

    public boolean isDone(String line) {
        if (line == null) {
            return false;
        }
        return line.startsWith(DATA_PREFIX) && 
               line.substring(DATA_PREFIX.length()).trim().equals(DONE_MARKER);
    }

    private StreamChunk parseChunk(JsonNode root) {
        if (root == null) {
            return new StreamChunk();
        }
        
        StreamChunk chunk = new StreamChunk();
        
        Usage usage = parseUsage(root);
        if (usage != null) {
            chunk.setUsage(usage);
        }

        JsonNode choices = root.get("choices");
        if (choices == null || !choices.isArray() || choices.size() == 0) {
            return chunk;
        }

        JsonNode firstChoice = choices.get(0);
        if (firstChoice == null) {
            return chunk;
        }
        
        String finishReason = getTextValue(firstChoice, "finish_reason");
        if (finishReason != null) {
            chunk.setFinishReason(finishReason);
        }

        JsonNode delta = firstChoice.get("delta");
        if (delta == null) {
            return chunk;
        }

        String content = getTextValue(delta, "content");
        if (content != null) {
            chunk.setContent(content);
        }

        String reasoning = getTextValue(delta, "reasoning_content");
        if (reasoning != null) {
            chunk.setReasoning(reasoning);
        }

        JsonNode toolCalls = delta.get("tool_calls");
        if (toolCalls != null && toolCalls.isArray()) {
            List<ToolCallDelta> toolCallDeltas = parseToolCalls((ArrayNode) toolCalls);
            if (!toolCallDeltas.isEmpty()) {
                chunk.setToolCallDeltas(toolCallDeltas);
                chunk.setToolCall(true);
            }
        }

        return chunk;
    }
    
    private Usage parseUsage(JsonNode root) {
        JsonNode usageNode = root.get("usage");
        if (usageNode == null) {
            return null;
        }
        
        Usage usage = new Usage();
        
        if (usageNode.has("prompt_tokens")) {
            usage.setPromptTokens(usageNode.get("prompt_tokens").asInt());
        }
        
        if (usageNode.has("completion_tokens")) {
            usage.setCompletionTokens(usageNode.get("completion_tokens").asInt());
        }
        
        if (usageNode.has("total_tokens")) {
            usage.setTotalTokens(usageNode.get("total_tokens").asInt());
        }
        
        if (usageNode.has("prompt_cache_hit_tokens")) {
            int hit = usageNode.get("prompt_cache_hit_tokens").asInt();
            usage.setPromptCacheHitTokens(hit);
            logger.info("💾 DeepSeek 缓存命中: hitTokens={}", hit);
        }
        
        if (usageNode.has("prompt_cache_miss_tokens")) {
            int miss = usageNode.get("prompt_cache_miss_tokens").asInt();
            usage.setPromptCacheMissTokens(miss);
            logger.info("💾 DeepSeek 缓存未命中: missTokens={}", miss);
        }
        
        return usage;
    }

    private List<ToolCallDelta> parseToolCalls(ArrayNode toolCallsArray) {
        List<ToolCallDelta> deltas = new ArrayList<>();

        if (toolCallsArray == null) {
            return deltas;
        }

        for (JsonNode node : toolCallsArray) {
            if (node == null) {
                continue;
            }
            
            ToolCallDelta delta = new ToolCallDelta();

            if (node.has("index")) {
                int index = node.get("index").asInt();
                if (index >= 0 && index < MAX_TOOL_CALL_INDEX) {
                    delta.setIndex(index);
                } else {
                    logger.warn("ToolCall index超出合理范围: {}", index);
                }
            }

            if (node.has("id")) {
                JsonNode idNode = node.get("id");
                if (!idNode.isNull()) {
                    String id = idNode.asText();
                    if (id != null && !id.isEmpty()) {
                        delta.setId(id);
                    }
                }
            }

            if (node.has("type")) {
                JsonNode typeNode = node.get("type");
                if (!typeNode.isNull()) {
                    delta.setType(typeNode.asText());
                }
            }

            JsonNode function = node.get("function");
            if (function != null) {
                ToolCallDelta.FunctionDelta funcDelta = new ToolCallDelta.FunctionDelta();

                if (function.has("name")) {
                    String name = function.get("name").asText();
                    if (name != null && !name.isEmpty()) {
                        funcDelta.setName(name);
                    }
                }

                if (function.has("arguments")) {
                    String args = function.get("arguments").asText();
                    if (args != null && args.length() < MAX_ARGUMENTS_LENGTH) {
                        funcDelta.setArguments(args);
                    } else if (args != null) {
                        logger.warn("ToolCall arguments过长: {} 字符，将被截断", args.length());
                        funcDelta.setArguments(args.substring(0, MAX_ARGUMENTS_LENGTH));
                    }
                }

                delta.setFunction(funcDelta);
            }

            deltas.add(delta);
        }

        return deltas;
    }

    private String getTextValue(JsonNode node, String field) {
        if (node == null || !node.has(field)) {
            return null;
        }
        JsonNode fieldNode = node.get(field);
        return fieldNode.isNull() ? null : fieldNode.asText();
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return "";
        if (text.length() <= maxLength) return text;
        return text.substring(0, maxLength) + "...";
    }
}
