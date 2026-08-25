package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.rule.RuleLoader;
import com.example.agent.domain.skill.SkillManager;
import com.example.agent.llm.exception.LlmApiException;
import com.example.agent.llm.exception.LlmErrorClassifier;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ContentPart;
import com.example.agent.llm.model.ImagePart;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.TextPart;
import com.example.agent.tools.ImageStoreService;
import com.example.agent.web.orchestrator.WebAgentOrchestrator;
import com.example.agent.web.session.SessionCancelManager;
import com.example.agent.web.server.WebInitializer;
import com.example.agent.web.session.PendingBashConfirmation;
import com.example.agent.web.session.PendingDeleteConfirmation;
import com.example.agent.web.session.PendingToolCall;
import com.example.agent.web.session.SessionManager;
import com.example.agent.web.session.SessionTokenStats;
import com.example.agent.web.session.WebSessionManager;
import com.example.agent.web.util.SseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class ChatApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(ChatApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SessionManager sessionManager;
    private final WebAgentOrchestrator orchestrator;

    public ChatApiHandler() {
        this.sessionManager = WebSessionManager.getInstance();
        this.orchestrator = WebAgentOrchestrator.getInstance();
    }

    ChatApiHandler(SessionManager sessionManager, WebAgentOrchestrator orchestrator) {
        this.sessionManager = sessionManager;
        this.orchestrator = orchestrator;
    }

    /**
     * 在基础系统提示词后追加增强:项目规则 + 工作区 + 技能清单 + 日期 + 运行环境。
     * 行为与 WebSessionManager.getDefaultSystemPrompt 的增强段保持一致,
     * 用于用户自定义提示词或非 coding 模式提示词上补齐 Agent 的关键上下文。
     */
    private String augmentWithContext(String basePrompt) {
        String prompt = basePrompt;
        com.example.agent.domain.rule.RuleManager ruleManager =
            ServiceLocator.getOrNull(com.example.agent.domain.rule.RuleManager.class);
        if (ruleManager != null) {
            prompt = ruleManager.enhanceSystemPrompt(prompt);
        }
        // 追加工作区路径
        String workspacePath = WorkspaceContext.getCurrentFolder();
        if (workspacePath != null && !workspacePath.isBlank()) {
            prompt += "\n\n## 当前工作区\n用户已选择以下文件夹作为当前工作区。Agent 的所有文件操作应以此目录为根目录：\n"
                + workspacePath;
        }
        // 追加可用技能清单
        SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
        if (skillManager != null) {
            String skillSnippet = skillManager.buildSystemPromptSnippet();
            if (!skillSnippet.isBlank()) {
                prompt += skillSnippet;
            }
        }
        // 追加当前日期
        prompt += "\n\n## 当前日期\n" + java.time.LocalDate.now().toString();
        // 注入运行环境信息,让 LLM 明确平台与 shell 类型
        prompt += WorkspaceContext.getEnvironmentPromptSnippet();
        return prompt;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            String response = "{\"error\":\"Method not allowed\"}";
            exchange.sendResponseHeaders(405, response.getBytes(StandardCharsets.UTF_8).length);
            exchange.getResponseBody().write(response.getBytes(StandardCharsets.UTF_8));
            exchange.close();
            return;
        }

        exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache");
        exchange.getResponseHeaders().set("Connection", "keep-alive");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, 0);

        // 直接使用 OutputStreamWriter，不包装 BufferedWriter。
        // SSE 事件每次 write 后立即 flush，无需缓冲层。
        // BufferedWriter 的缓冲在 SSE 场景下从不被利用。
        OutputStreamWriter outputStreamWriter = new OutputStreamWriter(exchange.getResponseBody(), StandardCharsets.UTF_8);
        SseWriter sseWriter = new SseWriter(outputStreamWriter);

        String sessionId = null;
        boolean lockAcquired = false;

        try {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonNode json = objectMapper.readTree(requestBody);

            sessionId = json.has("sessionId") ? json.get("sessionId").asText() :
                       (json.has("session") ? json.get("session").asText() : "default");
            String userMessage = json.has("message") ? json.get("message").asText() : "";
            String systemPromptOverride = json.has("systemPrompt") ? json.get("systemPrompt").asText() : null;
            String mode = json.has("mode") ? json.get("mode").asText() : null;
            sessionManager.setMode(sessionId, mode);
            // 系统提示词解析：
            //  1. 用户自定义(前端「提示词」设置)→ 作为基础，仍叠加规则/技能/工作区/日期/环境增强，
            //     避免自定义后丢失 Agent 的关键上下文；
            //  2. 未自定义且指定非 coding 模式 → 用该模式基础提示词，并做同样的增强；
            //  3. 其余(默认 coding)→ 使用会话创建时已固化的默认提示词，不在此处改动。
            boolean hasCustomSystemPrompt = systemPromptOverride != null && !systemPromptOverride.isBlank();
            if (hasCustomSystemPrompt) {
                systemPromptOverride = augmentWithContext(systemPromptOverride);
            } else if (mode != null && !mode.isBlank() && !"coding".equals(mode)) {
                try {
                    com.example.agent.prompt.model.TaskMode taskMode =
                        com.example.agent.prompt.model.TaskMode.valueOf(mode.toUpperCase());
                    com.example.agent.prompt.PromptService promptService =
                        ServiceLocator.get(com.example.agent.prompt.PromptService.class);
                    String basePrompt = promptService.getSystemPrompt(
                        com.example.agent.prompt.PromptService.TaskContext.forMode(taskMode));
                    systemPromptOverride = augmentWithContext(basePrompt);
                } catch (Exception e) {
                    logger.warn("无法解析 mode={}, 使用默认提示词", mode);
                }
            }
            String editMessageId = json.has("editMessageId") ? json.get("editMessageId").asText() : null;

            // 解析手动引用的规则列表
            java.util.List<String> selectedRules = java.util.Collections.emptyList();
            if (json.has("selectedRules") && json.get("selectedRules").isArray()) {
                selectedRules = new java.util.ArrayList<>();
                for (com.fasterxml.jackson.databind.JsonNode n : json.get("selectedRules")) {
                    selectedRules.add(n.asText());
                }
            }

            // 解析图片列表
            List<String> images = new java.util.ArrayList<>();
            if (json.has("images") && json.get("images").isArray()) {
                for (com.fasterxml.jackson.databind.JsonNode img : json.get("images")) {
                    if (img.isTextual() && !img.asText().isEmpty()) {
                        images.add(img.asText());
                    }
                }
            }
            logger.info("收到聊天请求: session={}, messageLength={}, images={}, editMessageId={}", 
                sessionId, userMessage.length(), images.size(), editMessageId != null);

            if (userMessage.isEmpty() && images.isEmpty()) {
                sseWriter.sendSseEvent("error", buildErrorPayload(
                    LlmErrorClassifier.CODE_INVALID_REQUEST,
                    "消息不能为空", null));
                return;
            }

            // 兜底校验：模型配置
            LlmConfig llmConfig = Config.getInstance().getLlm();
            if (llmConfig.getProvider() == null || llmConfig.getProvider().isBlank()
                    || llmConfig.getModel() == null || llmConfig.getModel().isBlank()) {
                sseWriter.sendSseEvent("error", buildErrorPayload(
                    LlmErrorClassifier.CODE_CONFIG_MISSING,
                    "未配置模型，请先在设置中配置模型", null));
                return;
            }

            try {
                sessionManager.tryAcquireSessionLock(sessionId, 30, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                sseWriter.sendSseEvent("error", buildErrorPayload(
                    LlmErrorClassifier.CODE_UNKNOWN,
                    "请求被中断", null));
                return;
            }
            lockAcquired = true;

            SseWriter.resetClientDisconnected();
            // 清理上一轮可能残留的取消标志，避免旧信号影响新请求
            SessionCancelManager.getInstance().reset(sessionId);

            logger.info("Web Chat 收到消息：session={}, message={}, edit={}, hasPendingTool={}",
                sessionId, userMessage, editMessageId != null, sessionManager.hasPendingToolCall(sessionId));

            WebInitializer.ensureMemoryInitialized();

            Conversation conversation = sessionManager.getOrCreateConversation(sessionId, systemPromptOverride);
            ConversationService conversationService = ServiceLocator.get(ConversationService.class);

            PendingToolCall pendingTool = sessionManager.pollPendingToolCall(sessionId);
            if (pendingTool != null) {
                String toolResult = "用户回答：" + userMessage;
                conversationService.addToolResult(conversation, pendingTool.toolCallId, pendingTool.toolName, toolResult, true);
                SessionTokenStats stats = sessionManager.getOrCreateSessionTokenStats(sessionId);
                stats.addToolCall();

                Message userMsg = conversationService.addUserMessage(conversation, userMessage);
                sseWriter.sendSseEvent("message_id", "{\"id\":\"" + userMsg.getId() + "\"}");
            } else if (editMessageId != null && !editMessageId.isEmpty()) {
                Message userMsg = conversationService.editUserMessage(conversation, editMessageId, userMessage);
                if (userMsg != null) {
                    sseWriter.sendSseEvent("message_id", "{\"id\":\"" + userMsg.getId() + "\"}");
                }
            } else {
                // 新消息到达时，自动清理挂起的确认（用户忽略了确认框）
                PendingBashConfirmation stalePending = sessionManager.pollPendingBashConfirmation(sessionId);
                if (stalePending != null) {
                    logger.info("新消息到达，自动清理挂起的 bash 确认：confirmId={}, command={}",
                        stalePending.confirmId, stalePending.command);
                }
                PendingDeleteConfirmation staleDeletePending = sessionManager.pollPendingDeleteConfirmation(sessionId);
                if (staleDeletePending != null) {
                    logger.info("新消息到达，自动清理挂起的 delete_file 确认：confirmId={}",
                        staleDeletePending.confirmId);
                }

                Message userMsg = createUserMessage(conversation, userMessage, images);
                sseWriter.sendSseEvent("message_id", "{\"id\":\"" + userMsg.getId() + "\"}");
            }

            // 更新会话的最后活跃时间（标记该会话为最近活跃）
            sessionManager.updateLastActivityAt(sessionId);

            // 注入手动引用的规则内容（作为 system 消息）
            if (!selectedRules.isEmpty()) {
                String workspacePath = WorkspaceContext.getCurrentFolder();
                StringBuilder ruleContent = new StringBuilder();
                int loadedCount = 0;
                for (String ruleId : selectedRules) {
                    String content = RuleLoader.readRuleContent(ruleId, workspacePath);
                    if (content != null) {
                        ruleContent.append("<!-- 手动引用规则: ").append(ruleId).append(".md -->\n");
                        ruleContent.append(content).append("\n\n");
                        loadedCount++;
                    } else {
                        logger.warn("引用的规则文件不存在: {}", ruleId);
                    }
                }
                if (loadedCount > 0) {
                    String header = "用户手动引用了以下规则，请在处理消息时遵循这些规则：\n\n";
                    conversation.addMessage(com.example.agent.llm.model.Message.system(header + ruleContent.toString()));
                    logger.info("注入手动引用规则 {} 个", loadedCount);
                }
            }

            // 标记会话为"正在运行"
            sessionManager.setSessionRunning(sessionId, true);

            orchestrator.execute(sessionId, conversation, sseWriter);

        } catch (LlmException e) {
            logger.error("LLM 调用失败", e);
            String detail = (e instanceof LlmApiException) ? ((LlmApiException) e).getDetail() : null;
            sseWriter.sendSseEvent("error", buildErrorPayload(e.getErrorCode(), e.getMessage(), detail));
        } catch (Exception e) {
            logger.error("处理聊天请求失败", e);
            sseWriter.sendSseEvent("error", buildErrorPayload(null, e.getMessage(), null));
        } finally {
            if (lockAcquired && sessionId != null) {
                sessionManager.releaseSessionLock(sessionId);
                // Agent 执行结束（不论正常完成还是异常），标记为空闲
                sessionManager.setSessionRunning(sessionId, false);
            }
            SseWriter.removeClientDisconnected();
            sseWriter.sendSseEvent("complete", "[DONE]");
            // 先排空 SSE 事件队列（确保 complete 发出），再关闭底层流
            sseWriter.close();
            outputStreamWriter.close();
            exchange.close();
        }
    }

    /**
     * 创建用户消息（支持纯文本和多模态）。
     * <p>
     * 如果请求中携带了图片，会先将图片保存到本地 {@code .hippo/images/}，
     * 然后构建含图片引用的多模态 Message 并添加到会话中。
     * </p>
     *
     * @param conversation 当前会话
     * @param text         用户输入的文本
     * @param images       用户上传的图片（data: URI 列表）
     * @return 已添加到会话中的 Message
     */
    private Message createUserMessage(Conversation conversation, String text, List<String> images) {
        ConversationService conversationService = ServiceLocator.get(ConversationService.class);

        // 纯文本消息，走原有逻辑
        if (images == null || images.isEmpty()) {
            logger.info("createUserMessage: 纯文本消息（无图片）, text={}", text);
            return conversationService.addUserMessage(conversation, text);
        }

        logger.info("createUserMessage: 多模态消息, images={}, text={}", images.size(), text);

        // 多模态消息：保存图片并构建 ContentPart 数组
        ImageStoreService imageStore = new ImageStoreService();
        List<ContentPart> parts = new ArrayList<>();

        // 文本部分
        if (text != null && !text.isEmpty()) {
            parts.add(new TextPart(text));
        }

        // 图片部分：保存到本地并引用 file:// 路径
        for (String dataUri : images) {
            try {
                String fileUri = imageStore.saveImage(dataUri);
                parts.add(new ImagePart(fileUri));
                logger.debug("用户上传图片已保存: {}", fileUri);
            } catch (Exception e) {
                logger.warn("保存图片失败，跳过该图片: {}", e.getMessage());
                // 图片保存失败不阻断整个消息，跳过即可
            }
        }

        // 如果所有图片都保存失败，降级为纯文本消息
        if (parts.isEmpty()) {
            return conversationService.addUserMessage(conversation, text);
        }

        // 构建多模态消息
        Message userMsg = new Message("user", "", null);
        userMsg.setContentParts(parts);
        conversationService.addMessage(conversation, userMsg);
        return userMsg;
    }

    /**
     * 构建 SSE error 事件的 JSON 负载。
     * <p>
     * 结构：{@code {"code":"...","message":"...","detail":"..."}}（code/detail 可为 null，向后兼容旧前端）。
     * 前端优先按 code 渲染 i18n 文案，无 code 时 fallback message。
     */
    private String buildErrorPayload(String code, String message, String detail) {
        StringBuilder sb = new StringBuilder("{");
        if (code != null) {
            sb.append("\"code\":\"").append(SseWriter.escapeJson(code)).append("\",");
        }
        sb.append("\"message\":\"").append(SseWriter.escapeJson(message)).append("\"");
        if (detail != null) {
            sb.append(",\"detail\":\"").append(SseWriter.escapeJson(detail)).append("\"");
        }
        sb.append("}");
        return sb.toString();
    }
}
