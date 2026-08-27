package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@JsonIgnoreProperties(ignoreUnknown = true)
public class SessionConfig {

    private static final Logger logger = LoggerFactory.getLogger(SessionConfig.class);
    private static final int DEFAULT_MAX_SAVED_SESSIONS = 1000;
    private static final int MIN_MAX_SAVED_SESSIONS = 0;
    private static final int MAX_MAX_SAVED_SESSIONS = 1000;
    private static final int DEFAULT_CLEANUP_PERIOD_DAYS = 90;
    private static final boolean DEFAULT_ENABLE_BACKGROUND_CLEANUP = true;
    private static final boolean DEFAULT_ENABLE_MAX_SAVED_CLEANUP = true;
    private static final int DEFAULT_TOMBSTONE_THRESHOLD_MB = 50;
    private static final int MIN_CLEANUP_PERIOD_DAYS = 1;
    private static final int MAX_CLEANUP_PERIOD_DAYS = 365;

    @JsonProperty("max_saved_sessions")
    private int maxSavedSessions = DEFAULT_MAX_SAVED_SESSIONS;

    @JsonProperty("cleanup_period_days")
    private int cleanupPeriodDays = DEFAULT_CLEANUP_PERIOD_DAYS;

    @JsonProperty("enable_background_cleanup")
    private boolean enableBackgroundCleanup = DEFAULT_ENABLE_BACKGROUND_CLEANUP;

    @JsonProperty("enable_max_saved_cleanup")
    private boolean enableMaxSavedCleanup = DEFAULT_ENABLE_MAX_SAVED_CLEANUP; // false = 永久保留全部历史，不触发数量清理

    @JsonProperty("tombstone_threshold_mb")
    private int tombstoneThresholdMb = DEFAULT_TOMBSTONE_THRESHOLD_MB;

    public SessionConfig() {
    }

    public int getMaxSavedSessions() {
        return maxSavedSessions;
    }

    public void setMaxSavedSessions(int maxSavedSessions) {
        if (maxSavedSessions < MIN_MAX_SAVED_SESSIONS) {
            logger.warn("maxSavedSessions 不能小于 {}，使用默认值: {}", 
                MIN_MAX_SAVED_SESSIONS, DEFAULT_MAX_SAVED_SESSIONS);
            this.maxSavedSessions = DEFAULT_MAX_SAVED_SESSIONS;
        } else if (maxSavedSessions > MAX_MAX_SAVED_SESSIONS) {
            logger.warn("maxSavedSessions 不能大于 {}，使用最大值: {}", 
                MAX_MAX_SAVED_SESSIONS, MAX_MAX_SAVED_SESSIONS);
            this.maxSavedSessions = MAX_MAX_SAVED_SESSIONS;
        } else {
            this.maxSavedSessions = maxSavedSessions;
            if (maxSavedSessions == 0) {
                logger.info("maxSavedSessions 设置为 0，会话持久化将被禁用");
            }
        }
    }

    public int getCleanupPeriodDays() {
        return cleanupPeriodDays;
    }

    public void setCleanupPeriodDays(int cleanupPeriodDays) {
        if (cleanupPeriodDays < MIN_CLEANUP_PERIOD_DAYS || cleanupPeriodDays > MAX_CLEANUP_PERIOD_DAYS) {
            logger.warn("cleanupPeriodDays 超出范围 [{}, {}]，使用默认值: {}",
                MIN_CLEANUP_PERIOD_DAYS, MAX_CLEANUP_PERIOD_DAYS, DEFAULT_CLEANUP_PERIOD_DAYS);
            this.cleanupPeriodDays = DEFAULT_CLEANUP_PERIOD_DAYS;
        } else {
            this.cleanupPeriodDays = cleanupPeriodDays;
        }
    }

    public boolean isEnableBackgroundCleanup() {
        return enableBackgroundCleanup;
    }

    public void setEnableBackgroundCleanup(boolean enableBackgroundCleanup) {
        this.enableBackgroundCleanup = enableBackgroundCleanup;
    }

    public boolean isEnableMaxSavedCleanup() {
        return enableMaxSavedCleanup;
    }

    public void setEnableMaxSavedCleanup(boolean enableMaxSavedCleanup) {
        this.enableMaxSavedCleanup = enableMaxSavedCleanup;
    }

    public int getTombstoneThresholdMb() {
        return tombstoneThresholdMb;
    }

    public void setTombstoneThresholdMb(int tombstoneThresholdMb) {
        if (tombstoneThresholdMb < 1) {
            logger.warn("tombstoneThresholdMb 不能小于 1，使用默认值: {}", DEFAULT_TOMBSTONE_THRESHOLD_MB);
            this.tombstoneThresholdMb = DEFAULT_TOMBSTONE_THRESHOLD_MB;
        } else {
            this.tombstoneThresholdMb = tombstoneThresholdMb;
        }
    }

    public void validate() {
        if (maxSavedSessions < MIN_MAX_SAVED_SESSIONS || maxSavedSessions > MAX_MAX_SAVED_SESSIONS) {
            logger.warn("配置验证: maxSavedSessions 超出范围，已重置为默认值");
            maxSavedSessions = DEFAULT_MAX_SAVED_SESSIONS;
        }
        
        if (maxSavedSessions == 0) {
            logger.info("配置验证: maxSavedSessions 为 0，会话持久化将禁用");
        }

        if (cleanupPeriodDays < MIN_CLEANUP_PERIOD_DAYS || cleanupPeriodDays > MAX_CLEANUP_PERIOD_DAYS) {
            logger.warn("配置验证: cleanupPeriodDays 超出范围，已重置为默认值");
            cleanupPeriodDays = DEFAULT_CLEANUP_PERIOD_DAYS;
        }

        if (tombstoneThresholdMb < 1) {
            logger.warn("配置验证: tombstoneThresholdMb 不能小于1，已重置为默认值");
            tombstoneThresholdMb = DEFAULT_TOMBSTONE_THRESHOLD_MB;
        }
        
        logger.debug("配置验证完成: {}", this);
    }

    @Override
    public String toString() {
        return "SessionConfig{" +
                "maxSavedSessions=" + maxSavedSessions +
                ", cleanupPeriodDays=" + cleanupPeriodDays +
                ", enableBackgroundCleanup=" + enableBackgroundCleanup +
                ", enableMaxSavedCleanup=" + enableMaxSavedCleanup +
                ", tombstoneThresholdMb=" + tombstoneThresholdMb +
                '}';
    }
}
