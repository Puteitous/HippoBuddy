package com.example.agent.session;

import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Usage;
import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;

public class SessionTranscript {

    private static final Logger logger = LoggerFactory.getLogger(SessionTranscript.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    static {
        objectMapper.findAndRegisterModules();
        objectMapper.disable(SerializationFeature.INDENT_OUTPUT);
    }

    private static final int DEFAULT_BATCH_SIZE = 50;
    private static final long DEFAULT_FLUSH_INTERVAL_MS = 500;
    private static final int MAX_QUEUE_SIZE = 10000;
    private static final long UUID_EXPIRE_HOURS = 2;
    private static final long UUID_EXPIRE_MS = UUID_EXPIRE_HOURS * 3600 * 1000;
    private static final int MAX_UUID_CACHE_SIZE = 100000;

    private final String sessionId;
    private final Path transcriptFile;
    private final ReentrantLock writeLock = new ReentrantLock();
    private BufferedWriter writer;
    private volatile boolean failed = false;
    private volatile boolean initialized = false;

    private final LinkedBlockingQueue<String> writeQueue;
    private final int batchSize;
    private final long flushIntervalMs;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private Thread flushThread;
    private volatile long lastFlushTime;

    private final LinkedHashMap<String, Long> uuidCache;
    private volatile long lastCleanupTime;

    public SessionTranscript(String sessionId) {
        this(sessionId, DEFAULT_BATCH_SIZE, DEFAULT_FLUSH_INTERVAL_MS);
    }

    public SessionTranscript(String sessionId, int batchSize, long flushIntervalMs) {
        this.sessionId = sessionId;
        this.transcriptFile = WorkspaceManager.getSessionMessagesFile(sessionId);
        this.batchSize = Math.max(1, batchSize);
        this.flushIntervalMs = Math.max(10, flushIntervalMs);
        this.writeQueue = new LinkedBlockingQueue<>(MAX_QUEUE_SIZE);

        this.uuidCache = new LinkedHashMap<String, Long>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                return size() > MAX_UUID_CACHE_SIZE;
            }
        };
        this.lastCleanupTime = System.currentTimeMillis();
    }

    private void ensureInitialized() {
        if (initialized || failed) {
            return;
        }

        writeLock.lock();
        try {
            if (initialized || failed) {
                return;
            }

            try {
                Files.createDirectories(transcriptFile.getParent());

                loadExistingUuids();

                writer = Files.newBufferedWriter(
                    transcriptFile,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND
                );

                startFlushThread();
                registerShutdownHook();

                initialized = true;
                logger.debug("Transcript 初始化完成: {} (batch={}, flushInterval={}ms, uuid缓存={}条)", 
                    transcriptFile, batchSize, flushIntervalMs, uuidCache.size());
            } catch (IOException | SecurityException e) {
                failed = true;
                logger.warn("Transcript 初始化失败，降级为内存模式: {}", e.getMessage());
            }
        } finally {
            writeLock.unlock();
        }
    }

    private void loadExistingUuids() {
        if (!Files.exists(transcriptFile)) {
            return;
        }

        long now = System.currentTimeMillis();
        int count = 0;
        long expireThreshold = now - UUID_EXPIRE_MS;

        try (BufferedReader reader = Files.newBufferedReader(transcriptFile, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                try {
                    TranscriptEntry entry = objectMapper.readValue(line, TranscriptEntry.class);
                    String uuid = entry.getUuid();
                    if (uuid != null) {
                        uuidCache.put(uuid, now);
                        count++;
                    }
                } catch (Exception e) {
                    logger.warn("解析会话记录条目失败", e);
                }
            }
        } catch (IOException e) {
            logger.warn("加载 Transcript UUID 缓存失败: {}", e.getMessage());
        }

        if (count > 0) {
            logger.debug("已加载 {} 条历史 UUID 去重缓存", count);
        }
    }

    private void cleanupExpiredUuids() {
        long now = System.currentTimeMillis();
        if (now - lastCleanupTime < 3600 * 1000) {
            return;
        }

        writeLock.lock();
        try {
            long expireThreshold = now - UUID_EXPIRE_MS;
            int before = uuidCache.size();
            uuidCache.entrySet().removeIf(entry -> entry.getValue() < expireThreshold);
            int removed = before - uuidCache.size();

            if (removed > 0) {
                logger.trace("清理 UUID 缓存: 过期 {} 条，剩余 {} 条", removed, uuidCache.size());
            }
            lastCleanupTime = now;
        } finally {
            writeLock.unlock();
        }
    }

    private void startFlushThread() {
        if (running.compareAndSet(false, true)) {
            lastFlushTime = System.currentTimeMillis();
            String shortId = sessionId.length() > 8 ? sessionId.substring(0, 8) : sessionId;
            flushThread = new Thread(this::flushLoop, "transcript-flush-" + shortId);
            flushThread.setDaemon(true);
            flushThread.start();
        }
    }

    private void registerShutdownHook() {
        String shortId = sessionId.length() > 8 ? sessionId.substring(0, 8) : sessionId;
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            if (running.get()) {
                forceFlush();
                closeWriter();
            }
        }, "transcript-shutdown-" + shortId));
    }

    private void flushLoop() {
        while (running.get() && !failed) {
            try {
                boolean needsFlush = false;

                if (writeQueue.size() >= batchSize) {
                    needsFlush = true;
                } else if (!writeQueue.isEmpty() && 
                    System.currentTimeMillis() - lastFlushTime >= flushIntervalMs) {
                    needsFlush = true;
                }

                if (needsFlush) {
                    doFlushBatch();
                    cleanupExpiredUuids();
                } else {
                    Thread.sleep(50);
                }

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                logger.warn("刷盘线程异常: {}", e.getMessage());
            }
        }

        doFlushBatch();
    }

    private void doFlushBatch() {
        writeLock.lock();
        try {
            int count = 0;
            String line;
            while ((line = writeQueue.poll()) != null) {
                writer.write(line);
                writer.newLine();
                count++;
            }

            if (count > 0) {
                writer.flush();
                lastFlushTime = System.currentTimeMillis();
                logger.trace("Transcript 批量刷盘: {} 条", count);
            }
        } catch (IOException e) {
            failed = true;
            running.set(false);
            writeQueue.clear();
            logger.warn("批量刷盘失败，已禁用 Transcript 持久化: {}", e.getMessage());
        } finally {
            writeLock.unlock();
        }
    }

    public boolean isAvailable() {
        ensureInitialized();
        return !failed;
    }

    public void appendUserMessage(Message message) {
        append(TranscriptEntry.user(sessionId, message));
    }

    public void appendAssistantMessage(Message message, Usage usage) {
        append(TranscriptEntry.assistant(sessionId, message, usage));
    }

    public void appendToolResult(Message message, String toolName, long durationMs, boolean success) {
        append(TranscriptEntry.toolResult(sessionId, message, toolName, durationMs, success));
    }

    public void appendSystemMessage(String content) {
        append(TranscriptEntry.system(sessionId, content));
    }

    public void appendCompactBoundary(String boundaryUuid) {
        append(TranscriptEntry.compactBoundary(sessionId, boundaryUuid));
    }

    public void appendCustomTitle(String title) {
        append(TranscriptEntry.customTitle(sessionId, title));
    }

    public void appendTag(String tag) {
        append(TranscriptEntry.tag(sessionId, tag));
    }

    public void append(TranscriptEntry entry) {
        if (entry == null) {
            return;
        }

        ensureInitialized();

        if (failed) {
            logger.warn("Transcript 之前因写入失败被禁用，尝试恢复: {}", sessionId);
            writeLock.lock();
            try {
                failed = false;
                running.set(false);
                initialized = false;
                if (writer != null) {
                    try {
                        writer.close();
                    } catch (IOException ignored) {
                    }
                    writer = null;
                }
            } finally {
                writeLock.unlock();
            }
            ensureInitialized();
            if (failed) {
                return;
            }
            logger.info("Transcript 恢复成功: {}", sessionId);
        }

        String uuid = entry.getUuid();
        if (uuid != null) {
            writeLock.lock();
            try {
                if (uuidCache.containsKey(uuid)) {
                    logger.trace("UUID 去重命中，跳过写入: {}", uuid.substring(0, Math.min(8, uuid.length())));
                    return;
                }
                uuidCache.put(uuid, System.currentTimeMillis());
            } finally {
                writeLock.unlock();
            }
        }

        try {
            String jsonLine = objectMapper.writeValueAsString(entry);

            if (!writeQueue.offer(jsonLine, 100, TimeUnit.MILLISECONDS)) {
                logger.warn("Transcript 队列已满，跳过消息: {}", sessionId);
                if (uuid != null) {
                    writeLock.lock();
                    try {
                        uuidCache.remove(uuid);
                    } finally {
                        writeLock.unlock();
                    }
                }
            }

        } catch (Exception e) {
            logger.warn("序列化 Transcript 失败: {}", e.getMessage());
            if (uuid != null) {
                writeLock.lock();
                try {
                    uuidCache.remove(uuid);
                } finally {
                    writeLock.unlock();
                }
            }
        }
    }

    public boolean hasUuid(String uuid) {
        if (uuid == null) {
            return false;
        }
        writeLock.lock();
        try {
            return uuidCache.containsKey(uuid);
        } finally {
            writeLock.unlock();
        }
    }

    public void forceFlush() {
        if (!initialized || failed) {
            return;
        }
        doFlushBatch();
    }

    private void closeWriter() {
        writeLock.lock();
        try {
            if (writer != null) {
                writer.flush();
                writer.close();
            }
        } catch (IOException e) {
            logger.warn("关闭 Transcript Writer 时出错: {}", e.getMessage());
        } finally {
            writeLock.unlock();
        }
    }

    public void close() {
        running.set(false);

        if (flushThread != null) {
            flushThread.interrupt();
            try {
                flushThread.join(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        forceFlush();
        closeWriter();

        initialized = false;
        logger.debug("Transcript 已关闭: {} (去重缓存: {} 条)", sessionId, uuidCache.size());
    }

    public int getPendingCount() {
        return writeQueue.size();
    }

    public int getUuidCacheSize() {
        writeLock.lock();
        try {
            return uuidCache.size();
        } finally {
            writeLock.unlock();
        }
    }

    public Path getTranscriptFile() {
        return transcriptFile;
    }

    public String getSessionId() {
        return sessionId;
    }

    public static int getDefaultBatchSize() {
        return DEFAULT_BATCH_SIZE;
    }

    public static long getDefaultFlushIntervalMs() {
        return DEFAULT_FLUSH_INTERVAL_MS;
    }

    public static long getUuidExpireHours() {
        return UUID_EXPIRE_HOURS;
    }
}
