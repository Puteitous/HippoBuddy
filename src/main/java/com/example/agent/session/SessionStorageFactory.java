package com.example.agent.session;

import com.example.agent.config.SessionConfig;
import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

public class SessionStorageFactory {

    private static final Logger logger = LoggerFactory.getLogger(SessionStorageFactory.class);

    private SessionStorageFactory() {
    }

    public static SessionStorage create(SessionConfig config) {
        String workingDir = WorkspaceManager.getCurrentWorkingDir();
        Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");

        logger.info("📂 检测到当前工作目录: {}", workingDir);
        logger.info("📂 会话存储目录: {}", sessionsDir);

        if (config == null) {
            logger.warn("SessionConfig 为 null，使用默认配置创建 SessionStorage");
            return new SessionStorage(sessionsDir, 10);
        }

        config.validate();

        int maxSavedSessions = config.getMaxSavedSessions();
        int expireHours = config.getCleanupPeriodDays() * 24;
        long tombstoneThresholdBytes = (long) config.getTombstoneThresholdMb() * 1024 * 1024;

        if (!config.isPersistSessions() || maxSavedSessions == 0) {
            logger.info("会话持久化已禁用，创建内存-only SessionStorage (maxSavedSessions={})", maxSavedSessions);
            expireHours = -1;
        }

        logger.debug("创建 SessionStorage: 会话目录={}, 最大会话数={}, 过期时间={}小时",
            sessionsDir, maxSavedSessions, expireHours);

        return new SessionStorage(
            sessionsDir,
            maxSavedSessions,
            expireHours,
            tombstoneThresholdBytes
        );
    }
}
