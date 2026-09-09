package com.example.agent.service;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 推荐问答生成服务。
 * <p>
 * 基于会话的推理上下文（与主对话完全一致的 system prompt + 历史消息）生成
 * 2-3 个简短、可直接发送的后续问题。实现方式：在完整上下文末尾追加一条
 * user 指令消息后调用 LLM，保证消息前缀与主对话逐字节一致，从而最大化
 * LLM 服务端前缀缓存的命中率（避免用独立 prompt 重新拼接历史导致缓存失效）。
 * </p>
 * <p>
 * 任何失败均静默返回空列表（不影响主流程，前端据此不渲染推荐卡片）。
 * </p>
 */
public class RecommendedQuestionsService {

    private static final Logger logger = LoggerFactory.getLogger(RecommendedQuestionsService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /** 生成的问题数量上限 */
    private static final int MAX_QUESTIONS = 3;
    /** 单条问题长度上限（超出截断） */
    private static final int MAX_QUESTION_LENGTH = 30;

    /** 追加在完整上下文末尾的 user 指令（让 LLM 基于已有对话生成推荐问题） */
    private static final String INSTRUCTION_PROMPT = """
        请基于以上对话，为用户推荐 %d 个简短、可继续追问的后续问题。

        要求：
        1. 每个问题不超过 %d 字，可直接作为用户的下一条消息发送，不要带序号或引号
        2. 与对话主题紧密相关，不要重复用户已明确排除的方向
        3. 只输出 JSON 数组，例如：["问题一","问题二","问题三"]，不要输出任何其他内容
        """.formatted(MAX_QUESTIONS, MAX_QUESTION_LENGTH);

    /**
     * 基于推理上下文生成推荐问题。
     *
     * @param context 与主对话一致的推理上下文（system prompt + 完整历史，
     *                由 ConversationService.getContextForInference 提供）
     * @return 推荐问题列表（最多 {@code MAX_QUESTIONS} 条）；生成失败时返回空列表
     */
    public List<String> generate(List<Message> context) {
        if (context == null || context.isEmpty()) {
            return List.of();
        }

        // 对齐 WebAgentOrchestrator 的投递前处理：确保 system 消息在首位，
        // 使推荐请求的消息前缀与主对话逐字节一致（服务端前缀缓存命中）。
        List<Message> messages = ensureSystemMessageFirst(context);
        messages.add(Message.user(INSTRUCTION_PROMPT));

        try {
            LlmClient llmClient = ServiceLocator.get(LlmClient.class);
            ChatResponse response = llmClient.chat(messages);
            if (response == null || response.getMessage() == null) {
                logger.warn("推荐问题响应为空");
                return List.of();
            }
            String raw = response.getMessage().getContent();
            List<String> questions = parseQuestions(raw);
            logger.info("生成推荐问题: 上下文 {} 条消息, 得到 {} 个", messages.size(), questions.size());
            return questions;
        } catch (Exception e) {
            logger.warn("生成推荐问题失败，静默跳过: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 把 system 消息移到列表首位（若存在），其余消息保持原有相对顺序。
     * 与 WebAgentOrchestrator.ensureSystemMessageFirst 语义一致。
     */
    private List<Message> ensureSystemMessageFirst(List<Message> context) {
        List<Message> nonSystem = new ArrayList<>();
        Message firstSystem = null;
        for (Message msg : context) {
            if ("system".equals(msg.getRole())) {
                if (firstSystem == null) {
                    firstSystem = msg;
                }
            } else {
                nonSystem.add(msg);
            }
        }
        if (firstSystem == null) {
            return new ArrayList<>(context);
        }
        List<Message> result = new ArrayList<>();
        result.add(firstSystem);
        result.addAll(nonSystem);
        return result;
    }

    /**
     * 解析 LLM 输出的 JSON 数组，容错处理 markdown 代码块包裹 / 引号包裹 / 非数组。
     * 结果去重、过滤空项、截断超长项，最多保留 {@code MAX_QUESTIONS} 条。
     */
    private List<String> parseQuestions(String raw) {
        if (raw == null) return List.of();
        String text = raw.trim();
        // 去掉 ```json ... ``` 或 ``` ... ``` 代码块包裹
        if (text.startsWith("```")) {
            int firstNl = text.indexOf('\n');
            int lastFence = text.lastIndexOf("```");
            if (firstNl > 0 && lastFence > firstNl) {
                text = text.substring(firstNl + 1, lastFence).trim();
            }
        }

        JsonNode node;
        try {
            node = objectMapper.readTree(text);
        } catch (Exception e) {
            logger.warn("推荐问题输出非 JSON，尝试按行拆分: {}", e.getMessage());
            return parseByLines(text);
        }
        if (node == null || !node.isArray()) {
            return parseByLines(text);
        }

        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode item : node) {
            if (!item.isTextual()) continue;
            String q = item.asText().trim();
            if (q.isEmpty()) continue;
            // 去掉可能的前缀序号（"1."、"1、" 等）与包裹引号
            q = q.replaceFirst("^\\d+[.、．\\s]+", "");
            if (q.startsWith("\"") && q.endsWith("\"") && q.length() >= 2) {
                q = q.substring(1, q.length() - 1).trim();
            }
            if (q.isEmpty()) continue;
            if (q.length() > MAX_QUESTION_LENGTH) q = q.substring(0, MAX_QUESTION_LENGTH);
            seen.add(q);
            if (seen.size() >= MAX_QUESTIONS) break;
        }
        return new ArrayList<>(seen);
    }

    /** 非 JSON 时的兜底：按行拆分，去空白行后取前 {@code MAX_QUESTIONS} 行 */
    private List<String> parseByLines(String text) {
        List<String> result = new ArrayList<>();
        for (String line : text.split("\n")) {
            String q = line.trim();
            q = q.replaceFirst("^[-*•\\d]+[.、．\\s]+", "");
            if (q.isEmpty()) continue;
            if (q.length() > MAX_QUESTION_LENGTH) q = q.substring(0, MAX_QUESTION_LENGTH);
            result.add(q);
            if (result.size() >= MAX_QUESTIONS) break;
        }
        return result;
    }
}
