package com.example.agent.web.session;

import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.config.Config;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.rule.RuleManager;
import com.example.agent.domain.skill.SkillManager;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.application.ConversationService;
import com.example.agent.config.SessionConfig;
import com.example.agent.prompt.PromptLibrary;
import com.example.agent.prompt.PromptService;
import com.example.agent.tools.FileChangeTracker;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Stream;

public class WebSessionManager implements SessionManager {

    private static final Logger logger = LoggerFactory.getLogger(WebSessionManager.class);

    private static final Map<String, Conversation> sessions = new ConcurrentHashMap<>();
    private static final Map<String, Long> sessionFileLastModified = new ConcurrentHashMap<>();
    private static final Map<String, SessionLoadMetrics> sessionLoadMetrics = new ConcurrentHashMap<>();
    private static final Map<String, SessionTokenStats> sessionTokenStats = new ConcurrentHashMap<>();
    private static final Map<String, PendingToolCall> pendingToolCalls = new ConcurrentHashMap<>();
    private static final Map<String, PendingBashConfirmation> pendingBashConfirmations = new ConcurrentHashMap<>();
    private static final Map<String, PendingDeleteConfirmation> pendingDeleteConfirmations = new ConcurrentHashMap<>();
    private static final Map<String, String> sessionModes = new ConcurrentHashMap<>();
    /** 会话固化的 System Prompt 持久化文件名（与 session.json 同目录，跨重启稳定） */
    private static final String SYSTEM_PROMPT_FILE = "system-prompt.txt";
    /** 会话 mode 是否已冻结（首次非空设置后不可再变，保证 tools 快照稳定） */
    private static final Map<String, Boolean> sessionModeFrozen = new ConcurrentHashMap<>();
    private static final Map<String, ReentrantLock> sessionLocks = new ConcurrentHashMap<>();
    /** 会话 Agent 执行状态：true=正在运行，false=空闲 */
    private static final Map<String, Boolean> sessionRunning = new ConcurrentHashMap<>();

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
        sessionLocks.clear();
        sessionModes.clear();
        sessionModeFrozen.clear();
    }

    @Override
    public void setMode(String sessionId, String mode) {
        if (sessionId == null) return;
        // 空 mode 不参与冻结语义（视为未设置）
        if (mode == null || mode.isBlank()) return;

        String current = sessionModes.get(sessionId);
        // 冻结闸：首次非空设置后 mode 不可再变（与 system prompt 固化同构）。
        // mode 是 tools 快照的键之一，若运行中可被改写，会击穿 LLM 前缀缓存。
        // 忽略而非抛异常：ChatApiHandler 每轮都会调 setMode，抛异常会打断正常请求。
        if (Boolean.TRUE.equals(sessionModeFrozen.get(sessionId))) {
            if (!mode.equals(current)) {
                logger.warn("会话 mode 已冻结，忽略变更请求: sessionId={}, 已冻结值={}, 请求值={}（如需更换模式请新建会话）",
                    sessionId, current, mode);
            }
            return;
        }

        sessionModes.put(sessionId, mode);
        sessionModeFrozen.put(sessionId, Boolean.TRUE);
        persistModeToDisk(sessionId, mode);
    }

    @Override
    public String getMode(String sessionId) {
        if (sessionId == null) return null;
        String mode = sessionModes.get(sessionId);
        if (mode != null) return mode;
        return loadModeFromDisk(sessionId);
    }

    // =================

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
    public void setSessionRunning(String sessionId, boolean running) {
        if (sessionId != null) {
            if (running) {
                sessionRunning.put(sessionId, true);
            } else {
                sessionRunning.remove(sessionId);
            }
        }
    }

    @Override
    public boolean isSessionRunning(String sessionId) {
        return sessionId != null && sessionRunning.getOrDefault(sessionId, false);
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
                // 重启后恢复历史会话：优先还原创建时固化的 prompt（system-prompt.txt，
                // 含当时的工作区/规则/技能快照），其次 transcript 首条 system（防御性兜底），
                // 最后才按当前工作区重算（仅全新/极老会话）。否则 prompt 内容变化会击穿
                // 前缀缓存，且 LLM 会以为仍在旧工作区。
                String persistedPrompt = loadSystemPrompt(id);
                if (persistedPrompt != null) {
                    systemPrompt = persistedPrompt;
                } else {
                    String historicalPrompt = conversationService.findSystemPromptFromHistory(id);
                    systemPrompt = historicalPrompt != null ? historicalPrompt : getDefaultSystemPrompt();
                }
            }
            int maxTokens = Config.getInstance().getContext().getMaxTokens();
            Conversation conversation = conversationService.create(systemPrompt, maxTokens, id);

            // 固化 prompt 落盘（仅会话创建时写一次），供重启后恢复还原
            persistSystemPrompt(id, systemPrompt);

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

            // 新会话创建是会话数量增长的时机：超过 max_saved_sessions 上限时清理最旧的历史会话
            // （与该会话创建解耦，仅顺势触发；保护活跃/运行中/置顶会话）
            cleanupSessionsIfNeeded();

            return conversation;
        });
    }

    /**
     * 超过 max_saved_sessions 上限时，清理最旧的历史会话。
     * <p>
     * 在新会话创建时顺势触发（会话数量增长的唯一时机），并非删除当前刚创建的会话。
     * 保护的会话：活跃内存会话（sessions）、正在运行（sessionRunning）、置顶（pinned）、
     * 以及尚未落盘的新会话。0 表示禁用持久化，跳过清理。
     * </p>
     */
    private void cleanupSessionsIfNeeded() {
        int maxSaved;
        try {
            SessionConfig sessionConfig = Config.getInstance().getSession();
            maxSaved = sessionConfig == null ? 1000 : sessionConfig.getMaxSavedSessions();
            // 「启用历史清理」关闭时，不触发任何数量清理（会话仍正常持久化）
            if (sessionConfig != null && !sessionConfig.isEnableMaxSavedCleanup()) {
                return;
            }
        } catch (Exception e) {
            logger.warn("读取 max_saved_sessions 失败，跳过会话数量清理", e);
            return;
        }
        if (maxSaved <= 0) {
            // 0 = 禁用持久化/上限清理
            return;
        }

        Map<String, Conversation> active = getSessions();
        // 统计磁盘会话
        List<Map.Entry<Path, Long>> candidates = new ArrayList<>();
        Set<String> protectedIds = new HashSet<>(active.keySet());
        int protectedCount = 0; // 磁盘上受保护会话数（置顶/运行中），计入总数占名额但不删除
        try {
            Path sessionsRoot = WorkspaceManager.getHippoRoot().resolve("sessions");
            if (!Files.exists(sessionsRoot)) {
                return;
            }
            List<Path> sessionDirs = new ArrayList<>();
            try (Stream<Path> dateDirs = Files.list(sessionsRoot)) {
                dateDirs.filter(Files::isDirectory).forEach(dateDir -> {
                    try (Stream<Path> sub = Files.list(dateDir)) {
                        sub.filter(Files::isDirectory).forEach(sessionDirs::add);
                    } catch (IOException ignored) {
                    }
                });
            }
            for (Path sessionDir : sessionDirs) {
                String sid = sessionDir.getFileName().toString();
                Path jsonl = sessionDir.resolve("conversation.jsonl");
                if (!Files.exists(jsonl)) {
                    continue; // 仅计入真实存在的会话
                }
                if (protectedIds.contains(sid)
                        || Boolean.TRUE.equals(sessionRunning.get(sid))
                        || isPinned(sid)) {
                    protectedCount++; // 受保护会话占名额但不删除
                    continue;
                }
                Path metadata = sessionDir.resolve("session.json");
                long activity = resolveLastActivity(metadata, jsonl);
                candidates.add(Map.entry(sessionDir, activity));
            }
        } catch (IOException e) {
            logger.warn("扫描会话目录失败，跳过数量清理", e);
            return;
        }

        // 需要清理的数量 = 总会话数（活跃 + 受保护 + 可删候选）超出上限
        int toDelete = (active.size() + protectedCount + candidates.size()) - maxSaved;
        if (toDelete <= 0) {
            return;
        }

        // 按最近活跃时间升序（最旧在前）
        candidates.sort(Comparator.comparingLong(Map.Entry::getValue));
        int deleted = 0;
        for (int i = 0; i < candidates.size() && deleted < toDelete; i++) {
            Path sessionDir = candidates.get(i).getKey();
            String sid = sessionDir.getFileName().toString();
            if (deleteSessionDir(sessionDir)) {
                FileChangeTracker.removeSessionChanges(sid);
                deleted++;
                logger.info("超过 max_saved_sessions={}，已清理旧会话：{}", maxSaved, sid);
            }
        }
        if (deleted > 0) {
            logger.info("会话数量清理完成：上限={}, 清理 {} 个旧会话", maxSaved, deleted);
        }
    }

    /**
     * 会话最近活跃时间：优先读取 session.json 的 lastActivityAt，否则回退到 conversation.jsonl 的修改时间。
     */
    private long resolveLastActivity(Path metadata, Path jsonl) {
        try {
            if (Files.exists(metadata)) {
                byte[] bytes = Files.readAllBytes(metadata);
                if (bytes.length > 0 && bytes.length < 1_048_576) {
                    JsonNode node = objectMapper.readTree(bytes);
                    JsonNode la = node.get("lastActivityAt");
                    if (la != null && !la.asText().isBlank()) {
                        return Long.parseLong(la.asText());
                    }
                }
            }
        } catch (Exception ignored) {
        }
        try {
            return Files.getLastModifiedTime(jsonl).toMillis();
        } catch (IOException e) {
            return Long.MAX_VALUE; // 无法确定时间，放最后，尽量不删
        }
    }

    /**
     * 会话是否已置顶（pinned）。
     */
    private boolean isPinned(String sessionId) {
        try {
            Path metadataFile = WorkspaceManager.getSessionMetadataFile(sessionId);
            if (Files.exists(metadataFile)) {
                byte[] bytes = Files.readAllBytes(metadataFile);
                if (bytes.length > 0 && bytes.length < 1_048_576) {
                    JsonNode node = objectMapper.readTree(bytes);
                    JsonNode p = node.get("pinned");
                    if (p != null && !p.isNull()) {
                        return p.asBoolean(false);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /**
     * 递归删除会话目录（含子文件）。
     */
    private boolean deleteSessionDir(Path sessionDir) {
        try (Stream<Path> walk = Files.walk(sessionDir)) {
            walk.sorted(Comparator.reverseOrder())
                .forEach(path -> {
                    try {
                        Files.delete(path);
                    } catch (IOException e) {
                        logger.warn("删除会话文件失败: {}", path);
                    }
                });
            return true;
        } catch (IOException e) {
            logger.warn("删除会话目录失败：{}", sessionDir, e);
            return false;
        }
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
     * 更新会话的最后活跃时间。
     * 每次用户发送消息时调用，写入 session.json 的 lastActivityAt 字段。
     */
    public void updateLastActivityAt(String sessionId) {
        try {
            Path metadataFile = WorkspaceManager.getSessionMetadataFile(sessionId);
            if (!Files.exists(metadataFile.getParent())) {
                Files.createDirectories(metadataFile.getParent());
            }

            Map<String, Object> metadata = new HashMap<>();
            if (Files.exists(metadataFile)) {
                try {
                    byte[] bytes = Files.readAllBytes(metadataFile);
                    if (bytes.length > 0) {
                        com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(bytes);
                        if (node.isObject()) {
                            metadata = objectMapper.convertValue(node, Map.class);
                        }
                    }
                } catch (IOException ignored) {
                }
            }

            metadata.put("lastActivityAt", String.valueOf(System.currentTimeMillis()));
            // 同时持久化 mode，确保首次发消息时 mode 也能落到磁盘
            String currentMode = sessionModes.get(sessionId);
            if (currentMode != null) {
                metadata.put("mode", currentMode);
            }
            objectMapper.writeValue(metadataFile.toFile(), metadata);
        } catch (IOException e) {
            logger.debug("更新 lastActivityAt 失败: sessionId={}", sessionId, e);
        }
    }

    /**
     * 将会话固化的 System Prompt 持久化到独立文件（与 session.json 同目录）。
     * <p>
     * 仅会话创建时调用一次。固化值必须跨重启保持：重启后恢复该会话时，
     * 从本文件还原创建时的 prompt（含当时的工作区/规则/技能快照），而不是用
     * 当前工作区重算——否则 prompt 内容变化会击穿 LLM 前缀缓存（曾观测到
     * cacheHitRate 96% → 6.7%），且 LLM 会以为仍在旧工作区。
     * </p>
     * <p>
     * 独立于 session.json 的原因：session.json 被 {@link #updateLastActivityAt}/
     * {@link #persistModeToDisk} 每次发消息整体重写，prompt 放进去会带来写放大与
     * 双写者竞态；独立文件仅创建时写一次，之后永不触碰，天然无竞态。也独立于
     * conversation.jsonl：那是消息流水，会被回滚/压缩/截断波及，固化值混入会被
     * 当普通 system 消息丢弃。
     * </p>
     *
     * @param sessionId    会话 ID
     * @param systemPrompt 创建时固化的 prompt；null/空则跳过
     */
    private void persistSystemPrompt(String sessionId, String systemPrompt) {
        if (sessionId == null || systemPrompt == null || systemPrompt.isBlank()) {
            return;
        }
        try {
            Path file = WorkspaceManager.getSessionDir(sessionId).resolve(SYSTEM_PROMPT_FILE);
            Files.createDirectories(file.getParent());
            Files.writeString(file, systemPrompt, StandardCharsets.UTF_8);
        } catch (IOException e) {
            logger.warn("写入 system-prompt.txt 失败：sessionId={}（恢复时回退到 transcript/默认 prompt）", sessionId, e);
        }
    }

    /**
     * 读取会话固化的 System Prompt（system-prompt.txt）。
     * <p>
     * 重启后恢复历史会话时优先使用本文件，保证 prompt 与创建时逐字节一致。
     * 调用方 fallback 链：文件 → transcript 首条 system → 默认重算。
     * </p>
     *
     * @param sessionId 会话 ID
     * @return 固化 prompt；文件不存在、为空或读取失败时返回 null
     */
    private String loadSystemPrompt(String sessionId) {
        if (sessionId == null) {
            return null;
        }
        try {
            Path file = WorkspaceManager.getSessionDir(sessionId).resolve(SYSTEM_PROMPT_FILE);
            if (!Files.exists(file)) {
                return null;
            }
            String content = Files.readString(file, StandardCharsets.UTF_8);
            return content.isBlank() ? null : content;
        } catch (IOException e) {
            logger.warn("读取 system-prompt.txt 失败：sessionId={}, 回退到 transcript/默认 prompt", sessionId, e);
            return null;
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

    /**
     * 将会话模式持久化到 session.json。
     * 每次 setMode 时调用，确保模式不会丢失。
     */
    private void persistModeToDisk(String sessionId, String mode) {
        if (sessionId == null || mode == null || mode.isBlank()) return;
        try {
            Path metadataFile = WorkspaceManager.getSessionMetadataFile(sessionId);
            if (!Files.exists(metadataFile.getParent())) {
                return; // 会话目录还没创建，跳过（后续 updateLastActivityAt 会补写）
            }

            Map<String, Object> metadata = new HashMap<>();
            if (Files.exists(metadataFile)) {
                try {
                    byte[] bytes = Files.readAllBytes(metadataFile);
                    if (bytes.length > 0) {
                        JsonNode node = objectMapper.readTree(bytes);
                        if (node.isObject()) {
                            metadata = objectMapper.convertValue(node, Map.class);
                        }
                    }
                } catch (IOException ignored) {
                }
            }

            metadata.put("mode", mode);
            objectMapper.writeValue(metadataFile.toFile(), metadata);
        } catch (IOException e) {
            logger.debug("持久化 mode 失败: sessionId={}", sessionId, e);
        }
    }

    /**
     * 将会话置顶状态持久化到 session.json。
     * <p>
     * 由 SessionApiHandler 的 POST /api/sessions/{id}/pin 调用。置顶状态与
     * mode/workspacePath/lastActivityAt 同文件共存，跨重启稳定。读取时由
     * {@link com.example.agent.web.util.SessionListBuilder#resolvePin} 回填。
     * </p>
     *
     * @param sessionId 会话 ID
     * @param pinned    是否置顶
     */
    public void persistPinToDisk(String sessionId, boolean pinned) {
        if (sessionId == null) return;
        try {
            Path metadataFile = WorkspaceManager.getSessionMetadataFile(sessionId);
            if (!Files.exists(metadataFile.getParent())) {
                Files.createDirectories(metadataFile.getParent());
            }

            Map<String, Object> metadata = new HashMap<>();
            if (Files.exists(metadataFile)) {
                try {
                    byte[] bytes = Files.readAllBytes(metadataFile);
                    if (bytes.length > 0) {
                        JsonNode node = objectMapper.readTree(bytes);
                        if (node.isObject()) {
                            metadata = objectMapper.convertValue(node, Map.class);
                        }
                    }
                } catch (IOException ignored) {
                }
            }

            metadata.put("pinned", pinned);
            objectMapper.writeValue(metadataFile.toFile(), metadata);
            logger.debug("持久化置顶状态: sessionId={}, pinned={}", sessionId, pinned);
        } catch (IOException e) {
            logger.debug("持久化置顶状态失败: sessionId={}", sessionId, e);
        }
    }

    /**
     * 从 session.json 读取会话模式（重启恢复用）。
     * 读取后回填到内存 Map，避免重复读盘。
     */
    private String loadModeFromDisk(String sessionId) {
        if (sessionId == null) return null;
        try {
            Path metadataFile = WorkspaceManager.getSessionMetadataFile(sessionId);
            if (Files.exists(metadataFile)) {
                byte[] bytes = Files.readAllBytes(metadataFile);
                if (bytes.length > 0) {
                    JsonNode node = objectMapper.readTree(bytes);
                    JsonNode m = node.get("mode");
                    if (m != null && !m.asText().isBlank()) {
                        String mode = m.asText();
                        sessionModes.put(sessionId, mode); // 回填内存
                        sessionModeFrozen.put(sessionId, Boolean.TRUE); // 磁盘恢复的 mode 视为已固化
                        return mode;
                    }
                }
            }
        } catch (IOException ignored) {
        }
        return null;
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

        // 注入可用技能清单（会话创建时拍快照固化，切换工作区不影响已有会话）
        SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
        if (skillManager != null) {
            String skillSnippet = skillManager.buildSystemPromptSnippet();
            if (!skillSnippet.isBlank()) {
                prompt += skillSnippet;
            }
        }

        // 注入当前日期（会话创建时拍快照固化）。工具的"当前日期"不再内联在描述中，
        // 否则跨天会导致 tools 参数变化 → LLM 前缀缓存整体 miss。
        prompt += "\n\n## 当前日期\n" + LocalDate.now().toString();

        // 注入运行环境信息，让 LLM 明确平台与 shell 类型
        prompt += WorkspaceContext.getEnvironmentPromptSnippet();

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
