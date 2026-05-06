package com.example.agent.subagent;

import com.example.agent.core.AgentContext;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class SubAgentLogger {
    private static final Logger logger = LoggerFactory.getLogger(SubAgentLogger.class);
    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SubAgentTask task;
    private final Path logDir;
    private final Path logFile;
    private final Path detailFile;
    private final ObjectMapper objectMapper;

    public SubAgentLogger(SubAgentTask task, String parentSessionId) {
        this.task = task;
        this.logDir = resolveLogDir(parentSessionId, task.getTaskId());
        this.logFile = logDir.resolve("execution.log");
        this.detailFile = logDir.resolve("details.json");
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
        ensureDirectory();
    }

    private Path resolveLogDir(String parentSessionId, String taskId) {
        String projectKey = WorkspaceManager.getCurrentProjectKey();
        
        if (parentSessionId != null) {
            String dateDir = extractDateFromSessionId(parentSessionId);
            Path subagentsDir = WorkspaceManager.getProjectDir(projectKey)
                .resolve("sessions")
                .resolve(dateDir)
                .resolve(parentSessionId)
                .resolve("subagents")
                .resolve(taskId);
            logger.info("Sub-Agent 日志目录（父会话 {}）: {}", parentSessionId, subagentsDir);
            return subagentsDir;
        } else {
            Path globalDir = WorkspaceManager.getCurrentProjectDir()
                .resolve("subagents")
                .resolve(taskId);
            logger.warn("ParentSessionId 为 null，使用全局 Sub-Agent 目录: {}", globalDir);
            return globalDir;
        }
    }

    private String extractDateFromSessionId(String sessionId) {
        try {
            if (sessionId != null) {
                String numericPart = sessionId.startsWith("web-") ? sessionId.substring(4) : sessionId;
                if (numericPart.length() >= 13) {
                    long timestamp = Long.parseLong(numericPart.substring(0, 13));
                    return java.time.LocalDate.ofInstant(
                        java.time.Instant.ofEpochMilli(timestamp),
                        java.time.ZoneId.systemDefault()
                    ).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                }
            }
        } catch (Exception e) {
            // fallback
        }
        return java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
    }

    private void ensureDirectory() {
        try {
            if (!Files.exists(logDir)) {
                Files.createDirectories(logDir);
                logger.debug("创建 Sub-Agent 日志目录: {}", logDir);
            }
        } catch (Exception e) {
            logger.warn("创建 Sub-Agent 日志目录失败: {}", e.getMessage());
        }
    }

    public void log(String message) {
        String line = String.format("[%s] %s%n", LocalDateTime.now().format(TIMESTAMP_FORMAT), message);
        try {
            Files.writeString(logFile, line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (Exception e) {
            logger.debug("写入 Sub-Agent 日志失败: {}", e.getMessage());
        }
    }

    public void logToolCall(String toolName, String arguments) {
        log(String.format("[TOOL] %s: %s", toolName, truncate(arguments, 200)));
    }

    public void logToolResult(String toolName, String result) {
        log(String.format("[RESULT] %s: %s", toolName, truncate(result, 300)));
    }

    public void logAiResponse(String content) {
        log(String.format("[AI] %s", truncate(content, 500)));
    }

    public void logStatusChange(SubAgentStatus newStatus) {
        log(String.format("[STATUS] %s", newStatus));
    }

    public void logError(String message, Throwable error) {
        log(String.format("[ERROR] %s: %s", message, error.getMessage()));
    }

    public Path getLogDir() {
        return logDir;
    }

    public void saveDetails() {
        try {
            String json = objectMapper.writeValueAsString(new SubAgentLogDetail(
                task.getTaskId(),
                task.getDescription(),
                task.getStatus().name(),
                task.getResultSummary(),
                task.getError() != null ? task.getError().getMessage() : null,
                task.getOutputLog()
            ));
            Files.writeString(detailFile, json);
            logger.debug("Sub-Agent 详情已保存: {}", detailFile);
        } catch (Exception e) {
            logger.debug("保存 Sub-Agent 详情失败: {}", e.getMessage());
        }
    }

    private String truncate(String s, int maxLength) {
        if (s == null) return "null";
        s = s.replace("\n", " \\n ");
        return s.length() > maxLength ? s.substring(0, maxLength) + "..." : s;
    }

    public static class SubAgentLogDetail {
        public final String taskId;
        public final String description;
        public final String status;
        public final String result;
        public final String error;
        public final java.util.List<String> executionLog;

        public SubAgentLogDetail(String taskId, String description, String status,
                                  String result, String error, java.util.List<String> executionLog) {
            this.taskId = taskId;
            this.description = description;
            this.status = status;
            this.result = result;
            this.error = error;
            this.executionLog = executionLog;
        }
    }
}
