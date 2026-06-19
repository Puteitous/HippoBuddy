package com.example.agent.session;

import com.example.agent.tools.FileChangeTracker;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class SessionStorage {

    private static final Logger logger = LoggerFactory.getLogger(SessionStorage.class);
    private static final DateTimeFormatter FILE_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");
    private static final DateTimeFormatter DATE_DIR_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String SESSION_FILE_PREFIX = "session_";
    private static final String SESSION_FILE_SUFFIX = ".json";
    private static final String INVALID_FILENAME_CHARS = "<>:\"/\\|?*";
    private static final long TOMBSTONE_THRESHOLD_BYTES = 50L * 1024 * 1024;
    private static final long READ_SKIP_THRESHOLD_BYTES = 50L * 1024 * 1024;
    private static final int DEFAULT_EXPIRE_HOURS = 24 * 30;
    private static final long BACKGROUND_CLEANUP_DELAY_MS = 5000;

    private final Path storageDirectory;
    private final ObjectMapper objectMapper;
    private final int maxSavedSessions;
    private final int expireHours;
    private final long tombstoneThresholdBytes;
    private volatile boolean directoryAvailable = false;
    private volatile boolean initializationComplete = false;
    private final Object initLock = new Object();

    public SessionStorage() {
        this(Paths.get("logs", "sessions"), 10, DEFAULT_EXPIRE_HOURS, TOMBSTONE_THRESHOLD_BYTES);
    }

    public SessionStorage(Path storageDirectory, int maxSavedSessions) {
        this(storageDirectory, maxSavedSessions, DEFAULT_EXPIRE_HOURS, TOMBSTONE_THRESHOLD_BYTES);
    }

    public SessionStorage(Path storageDirectory, int maxSavedSessions, int expireHours, long tombstoneThresholdBytes) {
        this.storageDirectory = storageDirectory;
        this.maxSavedSessions = maxSavedSessions;
        this.expireHours = expireHours > 0 ? expireHours : DEFAULT_EXPIRE_HOURS;
        this.tombstoneThresholdBytes = tombstoneThresholdBytes > 0 ? tombstoneThresholdBytes : TOMBSTONE_THRESHOLD_BYTES;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.findAndRegisterModules();
        this.objectMapper.enable(SerializationFeature.INDENT_OUTPUT);
    }

    private void ensureDirectoryExists() {
        synchronized (initLock) {
            if (initializationComplete) {
                return;
            }
            
            try {
                if (!Files.exists(storageDirectory)) {
                    Files.createDirectories(storageDirectory);
                    logger.info("创建会话存储目录: {}", storageDirectory);
                }
                directoryAvailable = true;
            } catch (IOException e) {
                logger.error("创建会话存储目录失败，会话持久化将被禁用: {}", storageDirectory, e);
            } catch (SecurityException e) {
                logger.error("无权限创建会话存储目录，会话持久化将被禁用: {}", storageDirectory, e);
            } finally {
                initializationComplete = true;
            }
        }
    }

    public boolean isAvailable() {
        if (!initializationComplete) {
            ensureDirectoryExists();
        }
        return directoryAvailable;
    }

    public SessionData saveSession(SessionData session) {
        return saveSession(session, true);
    }

    public SessionData saveSession(SessionData session, boolean updateTimestamp) {
        if (session == null) {
            logger.warn("尝试保存空会话");
            return null;
        }

        if (!isAvailable()) {
            logger.warn("会话存储目录不可用，跳过保存: {}", session.getSessionId());
            return null;
        }

        try {
            String sessionId = session.getSessionId();
            if (sessionId == null || sessionId.isEmpty()) {
                sessionId = generateUniqueSessionId();
                session.setSessionId(sessionId);
            }

            if (updateTimestamp) {
                session.touch();
            }
            
            SessionData indexOnly = createIndexSession(session);
            
            Path sessionFile = getSessionFilePath(sessionId);
            Files.createDirectories(sessionFile.getParent());
            Path tempFile = sessionFile.resolveSibling(sessionFile.getFileName() + ".tmp");
            
            try {
                objectMapper.writeValue(tempFile.toFile(), indexOnly);
                
                try {
                    Files.move(tempFile, sessionFile, 
                        StandardCopyOption.REPLACE_EXISTING, 
                        StandardCopyOption.ATOMIC_MOVE);
                } catch (UnsupportedOperationException e) {
                    Files.move(tempFile, sessionFile, StandardCopyOption.REPLACE_EXISTING);
                }
                
                logger.info("会话索引已更新: {} (状态: {}, 消息数: {})", 
                    sessionId, session.getStatus(), session.getMessageCount());
                
            } finally {
                Files.deleteIfExists(tempFile);
            }
            
            cleanupOldSessions();
            
            return session;
        } catch (IOException e) {
            logger.error("保存会话索引失败: {}", session.getSessionId(), e);
            return null;
        }
    }

    private SessionData createIndexSession(SessionData source) {
        SessionData index = new SessionData(source.getSessionId());
        index.setStatus(source.getStatus());
        index.setCreatedAt(source.getCreatedAt());
        index.setLastActiveAt(source.getLastActiveAt());
        index.setMessageCount(source.getMessageCount());
        index.setLastUserMessage(source.getLastUserMessage());
        index.setWorkspacePath(source.getWorkspacePath());
        index.setMessages(null);
        return index;
    }

    public Optional<SessionData> loadSession(String sessionId) {
        return loadSession(sessionId, true);
    }

    public Optional<SessionData> loadSession(String sessionId, boolean preferTranscript) {
        if (sessionId == null || sessionId.isEmpty()) {
            return Optional.empty();
        }

        String safeSessionId = sanitizeSessionId(sessionId);
        if (!safeSessionId.equals(sessionId)) {
            logger.debug("会话ID已净化: {} -> {}", sessionId, safeSessionId);
        }

        if (preferTranscript && TranscriptLoader.exists(safeSessionId)) {
            SessionData transcriptSession = TranscriptLoader.loadToSessionData(safeSessionId);
            if (transcriptSession != null) {
                logger.info("会话已从 Transcript 恢复: {} (消息数: {})", 
                    safeSessionId, transcriptSession.getMessageCount());
                return Optional.of(transcriptSession);
            }
        }

        if (!isValidSessionId(safeSessionId)) {
            logger.warn("无效的会话ID: {}", safeSessionId);
            return Optional.empty();
        }

        Path sessionFile = getSessionFilePath(safeSessionId);
        
        if (!Files.exists(sessionFile)) {
            Path legacyFile = storageDirectory.resolve(SESSION_FILE_PREFIX + safeSessionId + SESSION_FILE_SUFFIX);
            if (Files.exists(legacyFile)) {
                sessionFile = legacyFile;
            }
        }
        
        if (!Files.exists(sessionFile)) {
            logger.warn("会话文件不存在: {}", safeSessionId);
            return Optional.empty();
        }

        try {
            long fileSize = Files.size(sessionFile);
            if (fileSize > READ_SKIP_THRESHOLD_BYTES) {
                logger.warn("会话文件过大({}MB)，跳过加载避免OOM: {}", 
                    fileSize / 1024 / 1024, sessionId);
                return Optional.empty();
            }

            SessionData session = objectMapper.readValue(sessionFile.toFile(), SessionData.class);
            
            if ((session.getMessages() == null || session.getMessages().isEmpty()) 
                && TranscriptLoader.exists(safeSessionId)) {
                SessionData transcriptSession = TranscriptLoader.loadToSessionData(safeSessionId);
                if (transcriptSession != null) {
                    transcriptSession.setStatus(session.getStatus());
                    transcriptSession.setCreatedAt(session.getCreatedAt());
                    transcriptSession.setLastActiveAt(session.getLastActiveAt());
                    logger.info("会话已从快照+Transcript合并加载: {} (状态: {}, 消息数: {})", 
                        sessionId, session.getStatus(), transcriptSession.getMessageCount());
                    return Optional.of(transcriptSession);
                }
            }
            
            logger.info("会话已从快照加载: {} (状态: {}, 消息数: {})", 
                sessionId, session.getStatus(), session.getMessageCount());
            return Optional.of(session);
        } catch (IOException e) {
            logger.error("加载会话失败: {}", sessionId, e);
            return Optional.empty();
        }
    }

    public List<SessionData> listSessions() {
        return listSessions(true);
    }

    public List<SessionData> listSessions(boolean includeTranscript) {
        List<SessionData> sessions = new ArrayList<>();
        java.util.Set<String> seenIds = new java.util.HashSet<>();
        
        if (includeTranscript) {
            var transcriptSessions = TranscriptLister.listSessions();
            for (var summary : transcriptSessions) {
                SessionData session = TranscriptLoader.loadToSessionData(summary.getSessionId());
                if (session != null) {
                    if (summary.getCustomTitle() != null) {
                        session.setLastUserMessage(summary.getCustomTitle());
                    }
                    sessions.add(session);
                    seenIds.add(session.getSessionId());
                }
            }
        }

        if (!Files.exists(storageDirectory)) {
            sessions.sort(Comparator.comparing(SessionData::getLastActiveAt).reversed());
            return sessions;
        }

        try (Stream<Path> files = Files.list(storageDirectory)) {
            List<Path> sessionPaths = files
                .flatMap(path -> {
                    try {
                        if (Files.isDirectory(path) && !isSessionDirectory(path)) {
                            return Files.list(path);
                        }
                        return Stream.of(path);
                    } catch (IOException e) {
                        return Stream.empty();
                    }
                })
                .filter(path -> isSessionDirectory(path) || isLegacySessionFile(path))
                .collect(Collectors.toList());
            
            List<SessionData> allSessions = sessionPaths.stream()
                .map(this::loadSessionFromPath)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .filter(s -> !seenIds.contains(s.getSessionId()))
                .collect(Collectors.toList());
            
            sessions.addAll(allSessions);
        } catch (IOException e) {
            logger.error("列出会话失败", e);
        }

        sessions.sort(Comparator.comparing(SessionData::getLastActiveAt).reversed());
        return sessions;
    }

    public List<SessionData> listResumableSessions() {
        return listSessions().stream()
            .filter(SessionData::canResume)
            .collect(Collectors.toList());
    }

    public Optional<SessionData> findLatestResumableSession() {
        return listResumableSessions().stream()
            .findFirst();
    }

    public boolean deleteSession(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return false;
        }

        // 清理 FileChangeTracker 内存缓存
        FileChangeTracker.removeSessionChanges(sessionId);

        String safeSessionId = sanitizeSessionId(sessionId);
        Path sessionDir = getSessionDir(safeSessionId);
        Path legacySessionFile = storageDirectory.resolve(SESSION_FILE_PREFIX + safeSessionId + SESSION_FILE_SUFFIX);
        
        try {
            boolean deleted = false;
            
            if (Files.isDirectory(sessionDir)) {
                try (Stream<Path> walk = Files.walk(sessionDir)) {
                    walk.sorted((a, b) -> b.compareTo(a))
                        .forEach(path -> {
                            try {
                                Files.delete(path);
                            } catch (IOException e) {
                                logger.warn("删除会话文件失败: {}", path);
                            }
                        });
                }
                cleanupEmptyDateDir(sessionDir.getParent());
                deleted = true;
            }
            
            Path flatSessionDir = storageDirectory.resolve(safeSessionId);
            if (Files.isDirectory(flatSessionDir)) {
                try (Stream<Path> walk = Files.walk(flatSessionDir)) {
                    walk.sorted((a, b) -> b.compareTo(a))
                        .forEach(path -> {
                            try {
                                Files.delete(path);
                            } catch (IOException e) {
                                logger.warn("删除会话文件失败: {}", path);
                            }
                        });
                }
                deleted = true;
            }
            
            if (Files.exists(legacySessionFile)) {
                Files.delete(legacySessionFile);
                deleted = true;
            }
            
            if (deleted) {
                logger.info("会话已删除: {}", sessionId);
            }
            return deleted;
        } catch (IOException e) {
            logger.error("删除会话失败: {}", sessionId, e);
            return false;
        }
    }
    
    private void cleanupEmptyDateDir(Path dateDir) {
        try {
            if (dateDir != null && dateDir.getParent() != null 
                && dateDir.getParent().equals(storageDirectory)) {
                try (Stream<Path> entries = Files.list(dateDir)) {
                    if (entries.findAny().isEmpty()) {
                        Files.delete(dateDir);
                        logger.debug("已清理空的日期目录: {}", dateDir.getFileName());
                    }
                }
            }
        } catch (IOException e) {
            logger.warn("清理过期会话失败", e);
        }
    }

    public void cleanupOldSessions() {
        List<SessionData> sessions = listSessions();
        
        if (sessions.size() <= maxSavedSessions) {
            return;
        }

        int toDelete = sessions.size() - maxSavedSessions;
        sessions.stream()
            .skip(maxSavedSessions)
            .forEach(session -> {
                deleteSession(session.getSessionId());
            });
        
        logger.info("清理了 {} 个旧会话", toDelete);
    }

    public void cleanupCompletedSessions() {
        List<SessionData> sessions = listSessions();
        
        sessions.stream()
            .filter(s -> s.getStatus() == SessionData.Status.COMPLETED)
            .forEach(session -> deleteSession(session.getSessionId()));
        
        logger.info("清理了已完成的会话");
    }

    public boolean markAsIgnored(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return false;
        }

        Optional<SessionData> sessionOpt = loadSession(sessionId);
        if (sessionOpt.isEmpty()) {
            logger.warn("标记忽略失败，会话不存在: {}", sessionId);
            return false;
        }

        SessionData session = sessionOpt.get();
        session.setStatus(SessionData.Status.IGNORED);
        saveSession(session);
        
        logger.info("会话已标记为忽略: {}", sessionId);
        return true;
    }

    public void cleanupExpiredSessions() {
        cleanupExpiredSessions(this.expireHours);
    }

    public void cleanupExpiredSessions(int timeoutHours) {
        if (timeoutHours <= 0) {
            return;
        }

        List<SessionData> sessions = listSessions();
        LocalDateTime cutoff = LocalDateTime.now().minusHours(timeoutHours);
        int cleanedCount = 0;
        
        for (SessionData session : sessions) {
            if (session.getLastActiveAt().isBefore(cutoff)) {
                deleteSession(session.getSessionId());
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            logger.info("时间驱动清理：删除了 {} 个超过 {} 天未活动的会话", 
                cleanedCount, timeoutHours / 24);
        }
    }

    public void startBackgroundCleanup() {
        CompletableFuture.runAsync(() -> {
            try {
                Thread.sleep(BACKGROUND_CLEANUP_DELAY_MS);
                ensureDirectoryExists();
                if (directoryAvailable) {
                    logger.info("后台过期会话清理任务启动...");
                    cleanupExpiredSessions();
                    logger.info("后台过期会话清理完成");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                logger.info("后台清理任务被中断");
            } catch (Exception e) {
                logger.warn("后台清理任务执行异常，已忽略", e);
            }
        });
        logger.debug("后台清理任务已调度，将在{}ms后执行", BACKGROUND_CLEANUP_DELAY_MS);
    }

    public static String sanitizeSessionId(String sessionId) {
        if (sessionId == null) {
            return "";
        }
        return sessionId.replaceAll("[^a-zA-Z0-9_-]", "");
    }

    private String generateSessionId() {
        return LocalDateTime.now().format(FILE_DATE_FORMAT) + "_" + 
               Long.toHexString(System.currentTimeMillis() % 0xFFFF);
    }

    private String generateUniqueSessionId() {
        String sessionId;
        int attempts = 0;
        final int maxAttempts = 10;
        
        do {
            sessionId = generateSessionId();
            attempts++;
            
            if (attempts > maxAttempts) {
                sessionId = sessionId + "_" + System.nanoTime();
                logger.warn("生成唯一会话ID尝试次数过多，添加纳秒后缀");
                break;
            }
        } while (Files.exists(getSessionDir(sessionId)));
        
        return sessionId;
    }

    private Path getSessionDir(String sessionId) {
        String dateDir = extractDateFromSessionId(sessionId);
        return storageDirectory.resolve(dateDir).resolve(sessionId);
    }
    
    private Path getSessionFilePath(String sessionId) {
        return getSessionDir(sessionId).resolve("session.json");
    }

    private boolean isSessionDirectory(Path path) {
        return Files.isDirectory(path) && Files.exists(path.resolve("session.json"));
    }
    
    private String extractDateFromSessionId(String sessionId) {
        try {
            if (sessionId != null) {
                String numericPart = sessionId.startsWith("web-") ? sessionId.substring(4) : sessionId;
                if (numericPart.length() >= 13) {
                    long timestamp = Long.parseLong(numericPart.substring(0, 13));
                    return LocalDate.ofInstant(
                        java.time.Instant.ofEpochMilli(timestamp),
                        java.time.ZoneId.systemDefault()
                    ).format(DATE_DIR_FORMAT);
                }
            }
        } catch (NumberFormatException e) {
            logger.warn("解析时间戳失败", e);
        }
        return LocalDate.now().format(DATE_DIR_FORMAT);
    }
    
    private boolean isLegacySessionFile(Path path) {
        String fileName = path.getFileName().toString();
        return fileName.startsWith(SESSION_FILE_PREFIX) && fileName.endsWith(SESSION_FILE_SUFFIX);
    }

    private boolean isValidSessionId(String sessionId) {
        for (char c : INVALID_FILENAME_CHARS.toCharArray()) {
            if (sessionId.indexOf(c) >= 0) {
                return false;
            }
        }
        return true;
    }

    private Optional<SessionData> loadSessionFromPath(Path path) {
        try {
            Path sessionFile;
            if (Files.isDirectory(path)) {
                sessionFile = path.resolve("session.json");
            } else {
                sessionFile = path;
            }
            return Optional.of(objectMapper.readValue(sessionFile.toFile(), SessionData.class));
        } catch (IOException e) {
            logger.warn("加载会话失败: {}", path, e);
            return Optional.empty();
        }
    }

    public Path getStorageDirectory() {
        return storageDirectory;
    }
}
