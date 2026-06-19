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
    
    private static Path HIPPO_ROOT = determineHippoRoot();
    
    /**
     * 确定 HippoBuddy 数据根目录。
     * <p>
     * 优先级：
     * <ol>
     *   <li>系统属性 {@code hippo.data.dir} — 桌面端由 {@code DesktopApplication} 自动设置</li>
     *   <li>默认：当前工作目录下的 {@code .hippo} — CLI 端行为不变</li>
     * </ol>
     */
    private static Path determineHippoRoot() {
        String dataDir = System.getProperty("hippo.data.dir");
        if (dataDir != null && !dataDir.isBlank()) {
            return Paths.get(dataDir).toAbsolutePath();
        }
        return Paths.get(".hippo").toAbsolutePath();
    }

    public static void overrideBasePath(Path basePath) {
        HIPPO_ROOT = basePath.resolve(".hippo");
        ensureCoreDirectories();
    }

    public static Path getHippoRoot() {
        return HIPPO_ROOT;
    }

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    
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
    
    /**
     * 创建扁平化的核心数据目录结构。
     * <p>
     * 新结构（Phase 1）：
     * <pre>
     * .hippo/
     *   sessions/        — 所有会话 JSON
     *   logs/
     *     system/        — 系统日志
     *     conversations/ — 人类可读的对话日志
     *   config/          — 全局配置
     *   metrics/         — 指标统计
     *   debug/           — 调试日志
     *   cache/           — 缓存
     *   rules/           — 用户规则
     *   skills/          — 用户技能
     *   memory/          — 长期记忆
     * </pre>
     */
    private static void ensureCoreDirectories() {
        try {
            Path[] dirs = {
                HIPPO_ROOT.resolve("sessions"),
                HIPPO_ROOT.resolve("logs").resolve("system"),
                HIPPO_ROOT.resolve("logs").resolve("conversations"),
                HIPPO_ROOT.resolve("config"),
                HIPPO_ROOT.resolve("metrics"),
                HIPPO_ROOT.resolve("debug"),
                HIPPO_ROOT.resolve("cache"),
                HIPPO_ROOT.resolve("rules"),
                HIPPO_ROOT.resolve("skills"),
                HIPPO_ROOT.resolve("memory")
            };
            for (Path dir : dirs) {
                if (!Files.exists(dir)) {
                    Files.createDirectories(dir);
                    logger.debug("创建数据目录: {}", dir);
                }
            }
            logger.info("✅ 工作空间初始化完成: {}", HIPPO_ROOT);
        } catch (Exception e) {
            logger.error("❌ 工作空间初始化失败", e);
        }
    }
    
    // =========================================================
    // 会话存储路径（扁平结构，无 projectKey 层级）
    // =========================================================
    
    public static Path getSessionDir(String sessionId) {
        String dateDir = extractDateFromSessionId(sessionId);
        return HIPPO_ROOT.resolve("sessions").resolve(dateDir).resolve(sessionId);
    }
    
    private static String extractDateFromSessionId(String sessionId) {
        try {
            if (sessionId != null) {
                String numericPart = sessionId.replaceFirst("^[a-zA-Z]+-", "");
                if (numericPart.length() >= 13) {
                    long timestamp = Long.parseLong(numericPart.substring(0, 13));
                    return LocalDate.ofInstant(
                        java.time.Instant.ofEpochMilli(timestamp),
                        java.time.ZoneId.systemDefault()
                    ).format(DATE_FORMAT);
                }
            }
        } catch (NumberFormatException e) {
            logger.warn("解析时间戳失败: sessionId={}", sessionId);
        }
        return LocalDate.now().format(DATE_FORMAT);
    }
    
    public static Path getSessionMessagesFile(String sessionId) {
        return getSessionDir(sessionId).resolve("conversation.jsonl");
    }
    
    public static Path getSessionMetadataFile(String sessionId) {
        return getSessionDir(sessionId).resolve("session.json");
    }
    
    public static Path getSessionLogFile(String sessionId) {
        String date = LocalDate.now().format(DATE_FORMAT);
        return HIPPO_ROOT.resolve("logs").resolve("conversations").resolve(date).resolve(sessionId + ".log");
    }
    
    public static Path getToolResultPath(String sessionId, String toolCallId) {
        return getSessionDir(sessionId).resolve("tool-results").resolve(toolCallId + ".json");
    }
    
    public static Path getSessionPlanPath(String sessionId, String planId) {
        return getSessionDir(sessionId).resolve("plans").resolve(planId + ".md");
    }
    
    public static Path getSubagentSessionPath(String sessionId, String agentId) {
        return getSessionDir(sessionId).resolve("subagents").resolve("agent-" + agentId + ".jsonl");
    }

    public static Path getSessionMemoryPath(String sessionId) {
        return getSessionDir(sessionId).resolve("memory").resolve("session-memory.md");
    }
    
    public static Path getCacheDir() {
        return HIPPO_ROOT.resolve("cache");
    }
    
    // =========================================================
    // 全局子目录
    // =========================================================
    
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
    
    // =========================================================
    // 指标 / 调试文件
    // =========================================================
    
    public static Path getTokenMetricsFile(LocalDate date) {
        return getGlobalMetricsDir().resolve("tokens_" + date.format(DATE_FORMAT) + ".csv");
    }
    
    public static Path getToolMetricsFile(LocalDate date) {
        return getGlobalMetricsDir().resolve("tools_" + date.format(DATE_FORMAT) + ".csv");
    }
    
    public static Path getDebugLogFile(String sessionId) {
        return getGlobalDebugDir().resolve(sessionId + ".txt");
    }
    
    /**
     * 确保会话的子资源目录存在（tool-results / plans / subagents）。
     */
    public static void ensureSessionResources(String sessionId) {
        try {
            Path sessionDir = getSessionDir(sessionId);
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
