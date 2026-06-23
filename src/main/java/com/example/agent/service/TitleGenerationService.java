package com.example.agent.service;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.web.session.WebSessionManager;
import com.example.agent.web.util.ConversationJsonlReader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

public class TitleGenerationService {

    private static final Logger logger = LoggerFactory.getLogger(TitleGenerationService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final ConversationJsonlReader jsonlReader = new ConversationJsonlReader(objectMapper);

    /**
     * 根据会话的第一条用户消息，用 LLM 自动生成标题。
     * 优先从内存 Conversation 读取（避免 JSONL 尚未刷盘的竞态），
     * 内存不存在时降级读 JSONL 文件。
     * 内存和 JSONL 都找不到时，使用 fallbackMessage 作为兜底（来自前端传递）。
     *
     * @param sessionId 会话 ID
     * @return 生成的标题，失败时返回 null
     */
    public String generateTitle(String sessionId) {
        return generateTitle(sessionId, null);
    }

    /**
     * 根据会话的第一条用户消息，用 LLM 自动生成标题。
     * 当前端提供了 userMessage（首选路径）：
     *   直接用它生成标题，跳过 IO 开销；仅检查 JSONL 中是否有 custom-title（不覆盖手动重命名）。
     * 当没有前端消息时（纯后端调用兜底）：
     *   内存 Conversation → JSONL 文件。
     *
     * @param sessionId       会话 ID
     * @param frontendMessage 前端传递的用户消息原文（首选，可为 null）
     * @return 生成的标题，失败时返回 null
     */
    public String generateTitle(String sessionId, String frontendMessage) {
        Path jsonl = null;
        String firstUserMessage = null;

        // ── 首选：前端消息（无 IO 开销，解决竞态） ──
        if (frontendMessage != null && !frontendMessage.isBlank()) {
            firstUserMessage = frontendMessage;
            // 检查 JSONL 是否已有 custom-title（用户手动重命名过则不覆盖）
            jsonl = jsonlReader.findJsonlFile(sessionId);
            if (jsonl != null && Files.exists(jsonl)) {
                String existingTitle = readExistingTitle(jsonl);
                if (existingTitle != null) {
                    return existingTitle;
                }
            }
        }

        // ── 兜底：前端未传消息时，走内存 → JSONL ──
        if (firstUserMessage == null) {
            firstUserMessage = getFirstUserMessageFromMemory(sessionId);
            if (firstUserMessage == null) {
                forceFlushTranscript(sessionId);
                jsonl = jsonlReader.findJsonlFile(sessionId);
                if (jsonl != null && Files.exists(jsonl)) {
                    firstUserMessage = jsonlReader.extractFirstUserMessage(jsonl);
                }
            }
        }

        // 所有来源都找不到 → 返回 null
        if (firstUserMessage == null) {
            logger.warn("无任何消息来源，无法生成标题: sessionId={}", sessionId);
            return null;
        }

        // 兜底路径下检查 custom-title
        if (frontendMessage == null && jsonl != null) {
            String existingTitle = readExistingTitle(jsonl);
            if (existingTitle != null) {
                return existingTitle;
            }
        }

        // 调 LLM 生成标题
        String title = generateTitleFromLlm(firstUserMessage);

        // JSONL 存在则写入
        if (jsonl != null && Files.exists(jsonl)) {
            writeTitleToJsonl(jsonl, sessionId, title);
        }

        return title;
    }

    /**
     * 从内存 Conversation 中获取第一条用户消息。
     * 标题 API 和 Chat API 共用同一个 WebSessionManager，
     * ChatApiHandler 在收到消息后会立即 addUserMessage() 写入内存，
     * 此时 JSONL 可能还没刷盘，但内存中已经有数据了。
     */
    private String getFirstUserMessageFromMemory(String sessionId) {
        try {
            Conversation conversation = WebSessionManager.getInstance().getSessions().get(sessionId);
            if (conversation != null) {
                return conversation.getMessages().stream()
                    .filter(m -> "user".equals(m.getRole()))
                    .map(Message::getContent)
                    .filter(c -> c != null && !c.isBlank())
                    .findFirst()
                    .orElse(null);
            }
        } catch (Exception e) {
            logger.debug("从内存读取用户消息失败: sessionId={}", sessionId, e);
        }
        return null;
    }

    /**
     * 读取 JSONL 头部已有的 custom-title。
     *
     * @return 已有标题，没有则返回 null
     */
    private String readExistingTitle(Path jsonl) {
        try (Stream<String> lines = Files.lines(jsonl)) {
            String firstLine = lines.findFirst().orElse(null);
            if (firstLine != null) {
                JsonNode firstNode = objectMapper.readTree(firstLine);
                if ("custom-title".equals(firstNode.path("type").asText())) {
                    String title = firstNode.path("title").asText("");
                    if (!title.isBlank()) {
                        return title;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /**
     * 强制刷盘 Transcript 的异步写入队列，确保第一条消息已写入 JSONL 文件。
     */
    private void forceFlushTranscript(String sessionId) {
        try {
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            conversationService.flushTranscript(sessionId);
        } catch (Exception e) {
            logger.debug("强制刷盘 Transcript 失败: sessionId={}", sessionId, e);
        }
    }

    /**
     * 调 LLM 生成标题，失败时降级为消息原文截断。
     */
    private String generateTitleFromLlm(String userMessage) {
        try {
            LlmClient llmClient = ServiceLocator.get(LlmClient.class);
            String prompt = "根据用户的第一条消息，生成一个简短（不超过20个字）的对话标题，直接输出标题内容，不要加引号。\n\n用户消息：" + userMessage;
            String title = llmClient.generateSync(prompt);

            if (title == null || title.isBlank()) {
                return fallbackTitle(userMessage);
            }

            title = title.trim();
            // 去掉可能的引号包裹
            if ((title.startsWith("「") && title.endsWith("」"))
                || (title.startsWith("『") && title.endsWith("』"))) {
                title = title.substring(1, title.length() - 1).trim();
            }
            if ((title.startsWith("\"") && title.endsWith("\""))
                || (title.startsWith("'") && title.endsWith("'"))) {
                title = title.substring(1, title.length() - 1).trim();
            }
            if (title.length() > 30) {
                title = title.substring(0, 30);
            }
            return title;
        } catch (Exception e) {
            logger.warn("LLM 生成标题失败，使用消息原文降级", e);
            return fallbackTitle(userMessage);
        }
    }

    /**
     * 降级方案：取消息原文前 30 个字作为标题。
     */
    String fallbackTitle(String userMessage) {
        return userMessage.length() > 30
            ? userMessage.substring(0, 30) + "..."
            : userMessage;
    }

    /**
     * 将 custom-title 写入 JSONL 文件头部。
     */
    private void writeTitleToJsonl(Path jsonl, String sessionId, String title) {
        try {
            List<String> lines = Files.readAllLines(jsonl, StandardCharsets.UTF_8);

            ObjectNode titleEntry = objectMapper.createObjectNode();
            titleEntry.put("type", "custom-title");
            titleEntry.put("uuid", UUID.randomUUID().toString());
            titleEntry.put("sessionId", sessionId);
            titleEntry.put("timestamp", java.time.Instant.now().toString());
            titleEntry.put("version", "1.0.0");
            titleEntry.put("cwd", System.getProperty("user.dir"));
            titleEntry.put("title", title);

            lines.add(0, objectMapper.writeValueAsString(titleEntry));
            Files.write(jsonl, lines, StandardCharsets.UTF_8);

            logger.info("自动生成会话标题: sessionId={}, title={}", sessionId, title);
        } catch (IOException e) {
            logger.error("写入标题到 JSONL 失败: sessionId={}", sessionId, e);
        }
    }
}
