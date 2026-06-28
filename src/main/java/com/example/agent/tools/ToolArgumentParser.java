package com.example.agent.tools;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 工具参数解析器。
 * <p>
 * 职责：解析 LLM 返回的 tool_call arguments JSON 字符串。
 * 成功 → 返回 JsonNode；失败 → 抛 ToolArgumentParseException（含原始参数和解析错误详情）。
 * <p>
 * 不做任何启发式修复。若解析失败，由调用方决定是否 re-prompt LLM 让其自行修正。
 */
public class ToolArgumentParser {

    private static final Logger logger = LoggerFactory.getLogger(ToolArgumentParser.class);
    private static final JsonFactory JSON_FACTORY = new JsonFactory();
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private ToolArgumentParser() {
    }

    /**
     * 解析工具参数 JSON 字符串。
     *
     * @param arguments  工具参数字符串（可能为 null 或空）
     * @param toolName   工具名称（仅用于日志和错误消息）
     * @return JsonNode 解析后的参数节点
     * @throws ToolArgumentParseException 如果参数不是合法 JSON
     */
    public static JsonNode parse(String arguments, String toolName) throws ToolArgumentParseException {
        if (arguments == null || arguments.trim().isEmpty()) {
            arguments = "{}";
        }

        try (JsonParser parser = JSON_FACTORY.createParser(arguments)) {
            JsonNode node = OBJECT_MAPPER.readTree(parser);
            if (node == null) {
                // 纯字符串如 "hello" 会被解析为 TextNode，不属于语法错误
                // 但 null 通常意味着输入不合预期
                throw new ToolArgumentParseException(arguments, toolName,
                        "解析结果为 null，参数可能为空或格式异常");
            }
            return node;
        } catch (JsonProcessingException e) {
            String locationInfo = "";
            if (e.getLocation() != null) {
                locationInfo = String.format("（行 %d，列 %d）",
                        e.getLocation().getLineNr(),
                        e.getLocation().getColumnNr());
            }

            String originalMessage = e.getOriginalMessage();
            String errorMsg = String.format("JSON 解析失败 %s: %s",
                    locationInfo,
                    originalMessage != null ? originalMessage : e.getMessage());

            logger.warn("工具 [{}] 参数 JSON 解析失败 {}: arguments={}",
                    toolName, locationInfo, truncate(arguments, 200));

            throw new ToolArgumentParseException(arguments, toolName, errorMsg);
        } catch (Exception e) {
            throw new ToolArgumentParseException(arguments, toolName,
                    "参数解析异常: " + e.getMessage());
        }
    }

    /**
     * 验证工具参数字符串是否为合法 JSON。
     * 此方法只做语法检查，不返回解析结果。
     */
    public static boolean isValid(String arguments) {
        if (arguments == null || arguments.isEmpty()) {
            return true;
        }
        try (JsonParser parser = JSON_FACTORY.createParser(arguments)) {
            while (parser.nextToken() != null) {
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static String truncate(String s, int maxLen) {
        if (s == null) return null;
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }
}
