package com.example.agent.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class EditFailureLogger {

    private static final Logger logger = LoggerFactory.getLogger(EditFailureLogger.class);
    private static final String LOG_FILE = "edit-failures.jsonl";

    private static Path logDirOverride;

    private EditFailureLogger() {}

    public static void setLogDirForTest(Path dir) {
        logDirOverride = dir;
    }

    public static void resetForTest() {
        logDirOverride = null;
    }

    private static Path resolveLogDir() {
        if (logDirOverride != null) {
            return logDirOverride;
        }
        return WorkspaceManager.getHippoRoot().resolve("logs").resolve("edit-failures");
    }

    public static void logFailure(
            String filePath,
            int oldTextLength,
            int oldTextLineCount,
            int newTextLength,
            int newTextLineCount,
            boolean hasPartialMatch,
            int partialMatchLength,
            String diagnosticBranch
    ) {
        try {
            String fileExtension = extractExtension(filePath);
            long timestamp = System.currentTimeMillis();

            String json = String.format(
                "{\"filePath\":\"%s\",\"fileExtension\":\"%s\",\"oldTextLength\":%d,\"oldTextLineCount\":%d," +
                "\"newTextLength\":%d,\"newTextLineCount\":%d,\"hasPartialMatch\":%b,\"partialMatchLength\":%d," +
                "\"diagnosticBranch\":\"%s\",\"timestamp\":%d}",
                escapeJson(filePath),
                escapeJson(fileExtension),
                oldTextLength, oldTextLineCount,
                newTextLength, newTextLineCount,
                hasPartialMatch, partialMatchLength,
                escapeJson(diagnosticBranch),
                timestamp
            );

            Path logDir = resolveLogDir();
            Files.createDirectories(logDir);
            Path logFile = logDir.resolve(LOG_FILE);

            Files.writeString(logFile, json + "\n", StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);

            logger.debug("已记录编辑失败: file={}, branch={}, partialMatch={}",
                fileExtension, diagnosticBranch, hasPartialMatch);
        } catch (IOException e) {
            logger.warn("记录编辑失败日志时出错: {}", e.getMessage());
        }
    }

    private static String extractExtension(String filePath) {
        if (filePath == null) return "";
        int dotIndex = filePath.lastIndexOf('.');
        if (dotIndex >= 0 && dotIndex < filePath.length() - 1) {
            String ext = filePath.substring(dotIndex);
            if (ext.indexOf('/') == -1 && ext.indexOf('\\') == -1) {
                return ext;
            }
        }
        return "";
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
