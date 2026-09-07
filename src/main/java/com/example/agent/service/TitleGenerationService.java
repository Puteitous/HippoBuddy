package com.example.agent.service;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
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
        String firstUserMessage = null;

        // ── 首选：前端消息（无 IO 开销，解决竞态） ──
        // 注意：不在此处提前确定写入路径。generateTitle 请求几乎总比 chat 请求先到达
        // 后端，此时 conversation.jsonl 尚未创建，findJsonlFile 必然返回 null；若在
        // 生成标题前就把 jsonl 判空，custom-title 将永远无法落盘（后续 getSessions 会
        // 用"第一条用户消息"覆盖标题）。因此统一在 LLM 生成标题之后，通过强制刷盘
        // + 目标路径兜底来确保落盘。
        if (frontendMessage != null && !frontendMessage.isBlank()) {
            firstUserMessage = frontendMessage;
        }

        // ── 兜底：前端未传消息时，走内存 → JSONL ──
        if (firstUserMessage == null) {
            firstUserMessage = getFirstUserMessageFromMemory(sessionId);
            if (firstUserMessage == null) {
                forceFlushTranscript(sessionId);
                Path jsonl = jsonlReader.findJsonlFile(sessionId);
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

        // 已有 custom-title（用户手动重命名过，或并发会话已写入）则不覆盖，直接返回。
        String existingTitle = readExistingTitleOrNull(sessionId);
        if (existingTitle != null) {
            return existingTitle;
        }

        // 调 LLM 生成标题
        String title = generateTitleFromLlm(firstUserMessage);

        // 生成标题后再落盘：此刻 chat 请求大概率已完成会话创建与刷盘，能拿到真实路径；
        // 若仍不可得（文件尚未创建），由目标路径兜底确保 custom-title 写入。
        persistTitle(sessionId, title);

        return title;
    }

    /**
     * 读取会话已有标题（custom-title）。优先从内存/磁盘 transcript 读取。
     * 因竞态下 JSONL 可能尚未落盘，此方法尝试强制刷新文件缓存后重读。
     *
     * @return 已有标题；无则返回 null
     */
    private String readExistingTitleOrNull(String sessionId) {
        // 先刷新会话缓存，避免新写入的 custom-title 读取不到
        Path jsonl = jsonlReader.findJsonlFile(sessionId);
        if (jsonl != null && Files.exists(jsonl)) {
            String title = readExistingTitle(jsonl);
            if (title != null) {
                return title;
            }
        }
        return null;
    }

    /**
     * 将 LLM 生成的标题写入会话 JSONL 头部（custom-title）。
     * <p>
     * 兼容 generateTitle 先于 chat 落盘的竞态：即时当前 JSONL 尚不存在，
     * 也会通过强制刷盘 / 目标路径兜底来确保标题真正落盘，从而避免后续
     * getSessions 因读不到 custom-title 而把标题打回"用户消息"。
     * </p>
     */
    private void persistTitle(String sessionId, String title) {
        // 1) 强制刷盘 transcript：会话已创建时能拿到真实文件路径，并确保目录存在
        Path target = forceFlushTranscript(sessionId);
        if (target == null) {
            // 2) 会话尚未创建（chat 请求还没到）：直接按约定路径构造，Create 兜底
            target = WorkspaceManager.getSessionMessagesFile(sessionId);
        }

        // 写盘前二次检查：并发场景下可能已有 custom-title，避免覆盖用户手动重命名
        if (Files.exists(target)) {
            String existingTitle = readExistingTitle(target);
            if (existingTitle != null) {
                logger.info("已有 custom-title，跳过写入: sessionId={}", sessionId);
                return;
            }
        }

        writeTitleToJsonl(target, sessionId, title);
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
     *
     * @return transcript 文件路径；会话尚未创建或刷盘失败时返回 null
     */
    private Path forceFlushTranscript(String sessionId) {
        try {
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            return conversationService.flushTranscript(sessionId);
        } catch (Exception e) {
            logger.debug("强制刷盘 Transcript 失败: sessionId={}", sessionId, e);
            return null;
        }
    }

    /**
     * 调 LLM 生成标题，失败时降级为消息原文截断。
     */
    private String generateTitleFromLlm(String userMessage) {
        try {
            LlmClient llmClient = ServiceLocator.get(LlmClient.class);
            // 消息以英文为主时使用单词约束，否则使用字约束
            String prompt = isPrimarilyEnglish(userMessage)
                ? "Based on the user's first message, generate a short conversation title (no more than 10 words). Output the title directly, without quotes.\n\nUser message: " + userMessage
                : "根据用户的第一条消息，生成一个简短（不超过20个字）的对话标题，直接输出标题内容，不要加引号。\n\n用户消息：" + userMessage;
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
     * 判断用户消息是否以英文为主（ASCII 字符占比 > 60%）。
     */
    private boolean isPrimarilyEnglish(String message) {
        if (message == null || message.isBlank()) return false;
        long asciiCount = message.chars().filter(c -> c < 128 && !Character.isWhitespace(c)).count();
        long totalPrintable = message.chars().filter(c -> !Character.isWhitespace(c)).count();
        return totalPrintable > 0 && (double) asciiCount / totalPrintable > 0.6;
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
            // 兼容竞态下文件尚未创建的场景：目标文件可能不存在，先创建父目录再处理
            Files.createDirectories(jsonl.getParent());

            List<String> lines = Files.exists(jsonl)
                ? Files.readAllLines(jsonl, StandardCharsets.UTF_8)
                : new java.util.ArrayList<>();

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
