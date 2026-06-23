package com.example.agent.web.session;

import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.config.Config;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.rule.RuleManager;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.application.ConversationService;
import com.example.agent.prompt.PromptLibrary;
import com.example.agent.prompt.PromptService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

public class WebSessionManager implements SessionManager {

    private static final Logger logger = LoggerFactory.getLogger(WebSessionManager.class);

    private static final Map<String, Conversation> sessions = new ConcurrentHashMap<>();
    private static final Map<String, Long> sessionFileLastModified = new ConcurrentHashMap<>();
    private static final Map<String, SessionLoadMetrics> sessionLoadMetrics = new ConcurrentHashMap<>();
    private static final Map<String, SessionTokenStats> sessionTokenStats = new ConcurrentHashMap<>();
    private static final Map<String, PendingToolCall> pendingToolCalls = new ConcurrentHashMap<>();
    private static final Map<String, PendingBashConfirmation> pendingBashConfirmations = new ConcurrentHashMap<>();
    private static final Map<String, PendingDeleteConfirmation> pendingDeleteConfirmations = new ConcurrentHashMap<>();
    private static final Map<String, Set<String>> sessionAutoAllowRules = new ConcurrentHashMap<>();
    private static final Map<String, ReentrantLock> sessionLocks = new ConcurrentHashMap<>();

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static WebSessionManager instance;

    public static synchronized WebSessionManager getInstance() {
        if (instance == null) {
            instance = new WebSessionManager();
        }
        return instance;
    }

    WebSessionManager() {
    }

    public void loadTokenCache(Map<String, SessionTokenStats> preloaded) {
        if (preloaded != null) {
            sessionTokenStats.putAll(preloaded);
            logger.info("已加载 {} 个会话的 Token 缓存", preloaded.size());
        }
    }

    @Override
    public Map<String, Conversation> getSessions() {
        return sessions;
    }

    @Override
    public SessionTokenStats getSessionTokenStats(String sessionId) {
        return sessionTokenStats.get(sessionId);
    }

    @Override
    public SessionTokenStats getOrCreateSessionTokenStats(String sessionId) {
        return sessionTokenStats.computeIfAbsent(sessionId, k -> new SessionTokenStats());
    }

    @Override
    public void clear() {
        sessions.clear();
        sessionFileLastModified.clear();
        sessionLoadMetrics.clear();
        sessionTokenStats.clear();
        pendingToolCalls.clear();
        pendingBashConfirmations.clear();
        pendingDeleteConfirmations.clear();
        sessionAutoAllowRules.clear();
        sessionLocks.clear();
    }

    @Override
    public void addAutoAllowRule(String sessionId, String commandName) {
        if (sessionId == null || commandName == null) return;
        sessionAutoAllowRules.computeIfAbsent(sessionId, k -> ConcurrentHashMap.newKeySet()).add(commandName);
        logger.info("添加 auto-allow 规则: sessionId={}, command={}", sessionId, commandName);
    }

    @Override
    public boolean isAutoAllowed(String sessionId, String commandName) {
        if (sessionId == null || commandName == null) return false;
        Set<String> rules = sessionAutoAllowRules.get(sessionId);
        return rules != null && rules.contains(commandName);
    }

    @Override
    public boolean hasPendingBashConfirmation(String sessionId) {
        return pendingBashConfirmations.containsKey(sessionId);
    }

    @Override
    public PendingBashConfirmation pollPendingBashConfirmation(String sessionId) {
        return pendingBashConfirmations.remove(sessionId);
    }

    @Override
    public void setPendingBashConfirmation(String sessionId, PendingBashConfirmation pending) {
        pendingBashConfirmations.put(sessionId, pending);
    }

    @Override
    public void clearPendingBashConfirmation(String sessionId) {
        pendingBashConfirmations.remove(sessionId);
    }

    // ===== delete_file 确认 =====

    @Override
    public boolean hasPendingDeleteConfirmation(String sessionId) {
        return pendingDeleteConfirmations.containsKey(sessionId);
    }

    @Override
    public PendingDeleteConfirmation pollPendingDeleteConfirmation(String sessionId) {
        return pendingDeleteConfirmations.remove(sessionId);
    }

    @Override
    public void setPendingDeleteConfirmation(String sessionId, PendingDeleteConfirmation pending) {
        pendingDeleteConfirmations.put(sessionId, pending);
    }

    @Override
    public void clearPendingDeleteConfirmation(String sessionId) {
        pendingDeleteConfirmations.remove(sessionId);
    }

    @Override
    public boolean hasPendingToolCall(String sessionId) {
        return pendingToolCalls.containsKey(sessionId);
    }

    @Override
    public PendingToolCall pollPendingToolCall(String sessionId) {
        return pendingToolCalls.remove(sessionId);
    }

    @Override
    public void setPendingToolCall(String sessionId, PendingToolCall pending) {
        pendingToolCalls.put(sessionId, pending);
    }

    @Override
    public boolean tryAcquireSessionLock(String sessionId, long timeout, TimeUnit unit) throws InterruptedException {
        ReentrantLock lock = sessionLocks.computeIfAbsent(sessionId, k -> new ReentrantLock());
        if (!lock.tryLock(timeout, unit)) {
            logger.warn("获取会话锁超时，可能发生死锁，强制清理：sessionId={}", sessionId);
            sessionLocks.remove(sessionId);
            lock = sessionLocks.computeIfAbsent(sessionId, k -> new ReentrantLock());
            lock.lock();
            return true;
        }
        return true;
    }

    @Override
    public void releaseSessionLock(String sessionId) {
        if (sessionId == null) {
            return;
        }
        ReentrantLock lock = sessionLocks.get(sessionId);
        if (lock != null) {
            lock.unlock();
            if (!lock.hasQueuedThreads()) {
                sessionLocks.remove(sessionId);
            }
        }
    }

    @Override
    public Conversation getOrCreateConversation(String sessionId, String systemPromptOverride) {
        Conversation existing = sessions.get(sessionId);
        if (existing != null) {
            logger.info("使用缓存的会话：sessionId={}, 当前消息数={}", sessionId, existing.getMessages().size());
            if (!existing.getMessages().isEmpty()) {
                logger.info("缓存会话的第一条消息：role={}", existing.getMessages().get(0).getRole());
            }

            if (shouldReloadSession(sessionId)) {
                logger.info("检测到会话文件有变化，重新加载：sessionId={}", sessionId);

                long startTime = System.currentTimeMillis();
                SessionLoadMetrics metrics = new SessionLoadMetrics();

                ConversationService conversationService = ServiceLocator.get(ConversationService.class);
                ConversationService.ResumeResult resumeResult = conversationService.resumeConversation(existing, sessionId);

                conversationService.ensureSessionComponents(existing);

                long loadTime = System.currentTimeMillis() - startTime;
                metrics.loadTimeMs = loadTime;
                metrics.messageCount = resumeResult.getTotalMessages();
                metrics.fromCache = false;

                try {
                    Path jsonlFile = getSessionJsonlPath(sessionId);
                    if (Files.exists(jsonlFile)) {
                        metrics.fileSizeBytes = Files.size(jsonlFile);
                    }
                } catch (IOException e) {
                    logger.debug("获取文件大小失败：sessionId={}", sessionId, e);
                }

                sessionLoadMetrics.put(sessionId, metrics);

                if (resumeResult.isResumed()) {
                    logger.info("Web 会话刷新：sessionId={}, mode={}, messages={}/{}, 耗时={}ms, 指标：{}",
                        sessionId, resumeResult.getStatus(), resumeResult.getLoadedMessages(),
                        resumeResult.getTotalMessages(), loadTime, metrics);
                }
            } else {
                logger.debug("会话文件无变化，使用缓存：sessionId={}", sessionId);

                ConversationService conversationService = ServiceLocator.get(ConversationService.class);
                conversationService.ensureSessionComponents(existing);

                SessionLoadMetrics metrics = sessionLoadMetrics.get(sessionId);
                if (metrics != null) {
                    metrics.fromCache = true;
                    metrics.timestamp = System.currentTimeMillis();
                    logger.debug("缓存命中：sessionId={}, 上次加载指标：{}", sessionId, metrics);
                }
            }

            return existing;
        }

        logger.info("缓存中不存在会话：{}，开始创建和恢复", sessionId);
        return sessions.computeIfAbsent(sessionId, id -> {
            long startTime = System.currentTimeMillis();
            SessionLoadMetrics metrics = new SessionLoadMetrics();

            ConversationService conversationService = ServiceLocator.get(ConversationService.class);
            String systemPrompt;
            if (systemPromptOverride != null && !systemPromptOverride.isBlank()) {
                systemPrompt = systemPromptOverride;
            } else {
                systemPrompt = getDefaultSystemPrompt();
            }
            int maxTokens = Config.getInstance().getContext().getMaxTokens();
            Conversation conversation = conversationService.create(systemPrompt, maxTokens, id);

            ConversationService.ResumeResult resumeResult = conversationService.resumeConversation(conversation, id);

            conversationService.ensureSessionComponents(conversation);

            // 写入 session.json（记录工作区路径）
            writeSessionMetadata(id);

            long loadTime = System.currentTimeMillis() - startTime;
            metrics.loadTimeMs = loadTime;
            metrics.messageCount = resumeResult.getTotalMessages();
            metrics.fromCache = false;

            try {
                Path jsonlFile = getSessionJsonlPath(id);
                if (Files.exists(jsonlFile)) {
                    metrics.fileSizeBytes = Files.size(jsonlFile);
                }
            } catch (IOException e) {
                logger.debug("获取文件大小失败：sessionId={}", id, e);
            }

            sessionLoadMetrics.put(id, metrics);

            if (resumeResult.isResumed()) {
                logger.info("Web 会话恢复：sessionId={}, mode={}, messages={}/{}, 耗时={}ms, 指标：{}",
                    id, resumeResult.getStatus(), resumeResult.getLoadedMessages(),
                    resumeResult.getTotalMessages(), loadTime, metrics);
            } else {
                logger.info("Web 新会话创建：sessionId={}, 无历史记录", id);
            }

            return conversation;
        });
    }

    @Override
    public boolean shouldReloadSession(String sessionId) {
        try {
            Path jsonlFile = getSessionJsonlPath(sessionId);
            if (!Files.exists(jsonlFile)) {
                logger.debug("会话文件不存在：sessionId={}, path={}", sessionId, jsonlFile);
                return false;
            }

            long currentLastModified = Files.getLastModifiedTime(jsonlFile).toMillis();
            Long cachedLastModified = sessionFileLastModified.get(sessionId);

            if (cachedLastModified == null || currentLastModified > cachedLastModified) {
                logger.debug("会话文件有变化：sessionId={}, 当前修改时间={}, 缓存修改时间={}",
                    sessionId, currentLastModified, cachedLastModified);
                sessionFileLastModified.put(sessionId, currentLastModified);
                return true;
            }

            logger.debug("会话文件无变化，使用缓存：sessionId={}, 修改时间={}", sessionId, currentLastModified);
            return false;
        } catch (IOException e) {
            logger.warn("检查会话文件修改时间失败：sessionId={}, 错误：{}", sessionId, e.getMessage());
            return true;
        }
    }

    /**
     * 将会话的工作区路径持久化到 session.json。
     * 仅在会话首次创建时写入（session.json 不存在或没有 workspacePath 时），
     * 防止重启后因当前工作区变更而覆盖历史会话的归属。
     */
    private void writeSessionMetadata(String sessionId) {
        try {
            Path metadataFile = WorkspaceManager.getSessionMetadataFile(sessionId);

            // 已有 workspacePath 时跳过，保留历史归属
            if (Files.exists(metadataFile)) {
                try {
                    byte[] bytes = Files.readAllBytes(metadataFile);
                    if (bytes.length > 0) {
                        com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(bytes);
                        com.fasterxml.jackson.databind.JsonNode wp = node.get("workspacePath");
                        if (wp != null && !wp.asText().isBlank()) {
                            return;
                        }
                    }
                } catch (IOException ignored) {
                }
            }

            Files.createDirectories(metadataFile.getParent());

            Map<String, String> metadata = new HashMap<>();
            String workspacePath = WorkspaceContext.getCurrentFolder();
            if (workspacePath != null && !workspacePath.isBlank()) {
                metadata.put("workspacePath", workspacePath);
            }

            objectMapper.writeValue(metadataFile.toFile(), metadata);
        } catch (IOException e) {
            logger.debug("写入 session.json 失败：sessionId={}", sessionId, e);
        }
    }

    private Path getSessionJsonlPath(String sessionId) {
        String dateStr = LocalDate.now().toString();
        return WorkspaceManager.getUserMemoryDir()
            .resolve("sessions")
            .resolve(dateStr)
            .resolve(sessionId)
            .resolve("conversation.jsonl");
    }

    private String getDefaultSystemPrompt() {
        String prompt;
        try {
            PromptLibrary library = ServiceLocator.getOrNull(PromptLibrary.class);
            if (library == null) {
                library = PromptLibrary.getInstance();
                library.initialize();
            }
            PromptService promptService = new PromptService();
            prompt = promptService.getSystemPrompt(PromptService.TaskContext.defaultContext());
        } catch (Exception e) {
            logger.warn("加载默认 System Prompt 失败，使用 fallback", e);
            prompt = "You are Hippo, a helpful AI assistant with access to various tools including file operations, code search, and bash commands. Always respond in the same language as the user's message.";
        }

        // 通过 RuleManager 注入项目规则（懒加载，自动从 .hippo/rules/ 扫描）
        RuleManager ruleManager = ServiceLocator.getOrNull(RuleManager.class);
        if (ruleManager != null) {
            prompt = ruleManager.enhanceSystemPrompt(prompt);
        }

        String workspacePath = WorkspaceContext.getCurrentFolder();
        if (workspacePath != null && !workspacePath.isBlank()) {
            if (WorkspaceContext.isDefaultWorkspace()) {
                prompt += "\n\n## 工作目录\n用户未选择项目文件夹。你可以在当前工作目录下直接创建文件和目录，无需切换目录。\n"
                        + "当前工作目录: " + workspacePath;
            } else {
                prompt += "\n\n## 当前工作区\n用户已选择以下文件夹作为当前工作区。Agent 的所有文件操作（readFile/writeFile/editFile 等）应以此目录为根目录：\n"
                        + workspacePath;
            }
        }

        return prompt;
    }

    private static class SessionLoadMetrics {
        long loadTimeMs;
        int messageCount;
        long fileSizeBytes;
        boolean fromCache;
        long lastModifiedTime;
        long timestamp;

        SessionLoadMetrics() {
            this.timestamp = System.currentTimeMillis();
        }

        @Override
        public String toString() {
            return String.format("SessionLoadMetrics{loadTimeMs=%dms, messages=%d, fileSize=%dKB, fromCache=%b}",
                loadTimeMs, messageCount, fileSizeBytes / 1024, fromCache);
        }
    }
}
