package com.example.agent.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

public class WorkspaceManager {
    
    private static final Logger logger = LoggerFactory.getLogger(WorkspaceManager.class);
    
    private static Path HIPPO_ROOT = Paths.get(".hippo");
    
    public static void overrideBasePath(Path basePath) {
        HIPPO_ROOT = basePath.resolve(".hippo");
        ensureCoreDirectories();
    }

    public static Path getHippoRoot() {
        return HIPPO_ROOT;
    }

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    
    private static final String CURRENT_PROJECT_KEY = sanitizePath(getCurrentWorkingDir());
    
    static {
        ensureCoreDirectories();
    }
    
    private WorkspaceManager() {}
    
    public static String sanitizePath(String path) {
        return ProjectKeyPropertyDefiner.sanitize(path);
    }
    
    public static String getCurrentWorkingDir() {
        return System.getProperty("user.dir");
    }
    
    public static String getCurrentProjectKey() {
        return CURRENT_PROJECT_KEY;
    }
    
    private static void ensureCoreDirectories() {
        try {
            Path[] dirs = {
                getProjectsRoot(),
                getGlobalConfigDir(),
                getGlobalMetricsDir(),
                getGlobalDebugDir(),
                getGlobalCacheDir()
            };
            for (Path dir : dirs) {
                if (!Files.exists(dir)) {
                    Files.createDirectories(dir);
                    logger.debug("创建工作空间目录: {}", dir);
                }
            }
            logger.info("✅ 工作空间初始化完成，当前项目: {}", getCurrentWorkingDir());
        } catch (Exception e) {
            logger.error("❌ 工作空间初始化失败", e);
        }
    }
    
    public static void ensureProjectDirectories(String projectKey) {
        try {
            Path projectDir = getProjectDir(projectKey);
            Path[] dirs = {
                projectDir.resolve("sessions"),      // 🤖 会话 JSON（程序用）
                projectDir.resolve("logs").resolve("system"),      // 🖥️  系统日志
                projectDir.resolve("logs").resolve("conversations"), // 💬 会话日志（人类用）
                projectDir.resolve("resources"),     // 📦 资源分片
                projectDir.resolve("cache")          // ⚡ 项目缓存
            };
            for (Path dir : dirs) {
                if (!Files.exists(dir)) {
                    Files.createDirectories(dir);
                }
            }
            writeProjectMetadata(projectKey);
        } catch (Exception e) {
            logger.error("初始化项目目录失败: {}", projectKey, e);
        }
    }
    
    private static void writeProjectMetadata(String projectKey) {
        Path metaFile = getProjectDir(projectKey).resolve("project.json");
        if (!Files.exists(metaFile)) {
            try {
                String json = String.format("""
                    {
                      "originalPath": "%s",
                      "firstSeen": "%s",
                      "lastActive": "%s",
                      "sessionCount": 0
                    }
                    """,
                    getCurrentWorkingDir().replace("\\", "\\\\"),
                    LocalDate.now(),
                    LocalDate.now()
                );
                Files.writeString(metaFile, json);
            } catch (Exception e) {
                logger.debug("写入项目元数据失败: {}", e.getMessage());
            }
        }
    }
    
    public static Path getProjectsRoot() {
        return HIPPO_ROOT.resolve("projects");
    }
    
    public static Path getProjectDir(String projectKey) {
        return getProjectsRoot().resolve(projectKey);
    }
    
    public static Path getCurrentProjectDir() {
        return getProjectDir(CURRENT_PROJECT_KEY);
    }
    
    public static Path getSessionDir(String projectKey, String sessionId) {
        String dateDir = extractDateFromSessionId(sessionId);
        return getProjectDir(projectKey).resolve("sessions").resolve(dateDir).resolve(sessionId);
    }
    
    private static String extractDateFromSessionId(String sessionId) {
        try {
            if (sessionId != null) {
                String numericPart = sessionId.startsWith("web-") ? sessionId.substring(4) : sessionId;
                if (numericPart.length() >= 13) {
                    long timestamp = Long.parseLong(numericPart.substring(0, 13));
                    return LocalDate.ofEpochDay(timestamp / 86400000).format(DATE_FORMAT);
                }
            }
        } catch (NumberFormatException e) {
            logger.warn("解析时间戳失败: sessionId={}", sessionId);
        }
        return LocalDate.now().format(DATE_FORMAT);
    }
    
    public static Path getSessionMessagesFile(String projectKey, String sessionId) {
        return getSessionDir(projectKey, sessionId).resolve("conversation.jsonl");
    }
    
    public static Path getSessionMetadataFile(String projectKey, String sessionId) {
        return getSessionDir(projectKey, sessionId).resolve("session.json");
    }
    
    public static Path getSessionLogFile(String projectKey, String sessionId) {
        String date = LocalDate.now().format(DATE_FORMAT);
        return getProjectDir(projectKey).resolve("logs").resolve("conversations").resolve(date).resolve(sessionId + ".log");
    }
    
    public static Path getToolResultPath(String projectKey, String sessionId, String toolCallId) {
        return getSessionDir(projectKey, sessionId).resolve("tool-results").resolve(toolCallId + ".json");
    }
    
    public static Path getSessionPlanPath(String projectKey, String sessionId, String planId) {
        return getSessionDir(projectKey, sessionId).resolve("plans").resolve(planId + ".md");
    }
    
    public static Path getSubagentSessionPath(String projectKey, String sessionId, String agentId) {
        return getSessionDir(projectKey, sessionId).resolve("subagents").resolve("agent-" + agentId + ".jsonl");
    }

    public static Path getSessionMemoryPath(String projectKey, String sessionId) {
        return getSessionDir(projectKey, sessionId).resolve("memory").resolve("session-memory.md");
    }
    
    public static Path getProjectCacheDir(String projectKey) {
        return getProjectDir(projectKey).resolve("cache");
    }
    
    public static Path getGlobalConfigDir() {
        return HIPPO_ROOT.resolve("config");
    }
    
    public static Path getGlobalMetricsDir() {
        return HIPPO_ROOT.resolve("metrics");
    }
    
    public static Path getGlobalDebugDir() {
        return HIPPO_ROOT.resolve("debug");
    }
    
    public static Path getGlobalCacheDir() {
        return HIPPO_ROOT.resolve("cache");
    }
    
    public static Path getUserRulesDir() {
        return HIPPO_ROOT.resolve("rules");
    }
    
    public static Path getUserSkillsDir() {
        return HIPPO_ROOT.resolve("skills");
    }
    
    public static Path getUserMemoryDir() {
        return HIPPO_ROOT.resolve("memory");
    }
    
    public static Path getTokenMetricsFile(LocalDate date) {
        return getGlobalMetricsDir().resolve("tokens_" + date.format(DATE_FORMAT) + ".csv");
    }
    
    public static Path getToolMetricsFile(LocalDate date) {
        return getGlobalMetricsDir().resolve("tools_" + date.format(DATE_FORMAT) + ".csv");
    }
    
    public static Path getDebugLogFile(String sessionId) {
        return getGlobalDebugDir().resolve(sessionId + ".txt");
    }
    
    public static void ensureSessionResources(String projectKey, String sessionId) {
        try {
            Path sessionDir = getSessionDir(projectKey, sessionId);
            Path[] dirs = {
                sessionDir.resolve("tool-results"),
                sessionDir.resolve("plans"),
                sessionDir.resolve("subagents")
            };
            for (Path dir : dirs) {
                Files.createDirectories(dir);
            }
        } catch (Exception e) {
            logger.error("初始化会话资源目录失败: {}", sessionId, e);
        }
    }
    
}