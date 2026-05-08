package com.example.agent.web.logging;

import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Usage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Web 端会话日志记录器
 * 参照 CLI 的日志格式，记录每次对话的详细信息
 */
public class SessionLogger {
    private static final Logger logger = LoggerFactory.getLogger(SessionLogger.class);
    private static final DateTimeFormatter TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    
    private static final Path LOG_ROOT = Paths.get(".hippo/logs/conversations");
    
    /**
     * 获取会话的总 Token 消耗（从日志文件中读取）
     */
    public static SessionTokenStats getTokenStats(String sessionId) {
        try {
            // 查找会话日志文件
            Path logFile = findSessionLogFile(sessionId);
            if (logFile == null || !Files.exists(logFile)) {
                return null;
            }
            
            // 读取日志文件，统计总 Token
            String content = Files.readString(logFile);
            
            // 查找对话摘要部分
            int summaryIndex = content.indexOf("对话摘要");
            if (summaryIndex == -1) {
                return null;
            }
            
            // 提取摘要部分的内容
            String summarySection = content.substring(summaryIndex);
            
            // 使用正则表达式提取 Token 统计
            Pattern totalInputPattern = Pattern.compile("总输入 Token:\\s*(\\d+)");
            Pattern totalOutputPattern = Pattern.compile("总输出 Token:\\s*(\\d+)");
            Pattern totalPattern = Pattern.compile("总 Token:\\s*(\\d+)");
            Pattern llmCallsPattern = Pattern.compile("LLM 调用次数:\\s*(\\d+)");
            Pattern toolCallsPattern = Pattern.compile("工具调用次数:\\s*(\\d+)");
            
            Matcher inputMatcher = totalInputPattern.matcher(summarySection);
            Matcher outputMatcher = totalOutputPattern.matcher(summarySection);
            Matcher totalMatcher = totalPattern.matcher(summarySection);
            Matcher llmMatcher = llmCallsPattern.matcher(summarySection);
            Matcher toolMatcher = toolCallsPattern.matcher(summarySection);
            
            int totalInput = inputMatcher.find() ? Integer.parseInt(inputMatcher.group(1)) : 0;
            int totalOutput = outputMatcher.find() ? Integer.parseInt(outputMatcher.group(1)) : 0;
            int totalTokens = totalMatcher.find() ? Integer.parseInt(totalMatcher.group(1)) : 0;
            int llmCalls = llmMatcher.find() ? Integer.parseInt(llmMatcher.group(1)) : 0;
            int toolCalls = toolMatcher.find() ? Integer.parseInt(toolMatcher.group(1)) : 0;
            
            return new SessionTokenStats(totalInput, totalOutput, totalTokens, llmCalls, toolCalls);
            
        } catch (Exception e) {
            logger.warn("读取会话 Token 统计失败：sessionId={}", sessionId, e);
            return null;
        }
    }
    
    /**
     * 查找会话日志文件
     */
    private static Path findSessionLogFile(String sessionId) throws IOException {
        // 按日期目录查找
        if (!Files.exists(LOG_ROOT)) {
            return null;
        }
        
        try (var stream = Files.walk(LOG_ROOT)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(p -> p.getFileName().toString().equals(sessionId + ".log"))
                .findFirst()
                .orElse(null);
        }
    }
    
    /**
     * Token 统计数据类
     */
    public static class SessionTokenStats {
        public final int totalInputTokens;
        public final int totalOutputTokens;
        public final int totalTokens;
        public final int llmCalls;
        public final int toolCalls;
        
        public SessionTokenStats(int totalInput, int totalOutput, int total, int llmCalls, int toolCalls) {
            this.totalInputTokens = totalInput;
            this.totalOutputTokens = totalOutput;
            this.totalTokens = total;
            this.llmCalls = llmCalls;
            this.toolCalls = toolCalls;
        }
    }
    
    /**
     * 记录用户输入
     */
    public static void logUserMessage(String sessionId, Message message, int estimatedTokens) {
        try {
            SessionLog log = getOrCreateLog(sessionId);
            log.appendUserMessage(message, estimatedTokens);
        } catch (Exception e) {
            logger.warn("记录用户消息失败：sessionId={}", sessionId, e);
        }
    }
    
    /**
     * 记录 LLM 调用开始
     */
    public static void logLlmCallStart(String sessionId, int turn) {
        try {
            SessionLog log = getOrCreateLog(sessionId);
            log.appendLlmCallStart(turn);
        } catch (Exception e) {
            logger.warn("记录 LLM 调用开始失败：sessionId={}, turn={}", sessionId, turn, e);
        }
    }
    
    /**
     * 记录 LLM 响应
     */
    public static void logLlmResponse(String sessionId, int turn, Usage usage, String responsePreview) {
        try {
            SessionLog log = getOrCreateLog(sessionId);
            log.appendLlmResponse(turn, usage, responsePreview);
        } catch (Exception e) {
            logger.warn("记录 LLM 响应失败：sessionId={}, turn={}", sessionId, turn, e);
        }
    }
    
    /**
     * 记录工具调用
     */
    public static void logToolCall(String sessionId, String toolName, String arguments, String result, boolean success) {
        try {
            SessionLog log = getOrCreateLog(sessionId);
            log.appendToolCall(toolName, arguments, result, success);
        } catch (Exception e) {
            logger.warn("记录工具调用失败：sessionId={}, tool={}", sessionId, toolName, e);
        }
    }
    
    /**
     * 记录对话摘要
     */
    public static void logSummary(String sessionId, int totalInputTokens, int totalOutputTokens, 
                                   int totalTokens, int llmCalls, int toolCalls) {
        try {
            SessionLog log = getOrCreateLog(sessionId);
            log.appendSummary(totalInputTokens, totalOutputTokens, totalTokens, llmCalls, toolCalls);
        } catch (Exception e) {
            logger.warn("记录对话摘要失败：sessionId={}", sessionId, e);
        }
    }
    
    private static SessionLog getOrCreateLog(String sessionId) throws IOException {
        String date = LocalDateTime.now().format(DATE_FORMATTER);
        Path logDir = LOG_ROOT.resolve(date);
        Files.createDirectories(logDir);
        
        Path logFile = logDir.resolve(sessionId + ".log");
        boolean exists = Files.exists(logFile);
        
        SessionLog log = new SessionLog(logFile);
        if (!exists) {
            log.writeHeader(sessionId);
        }
        return log;
    }
    
    /**
     * 会话日志写入器
     */
    private static class SessionLog {
        private final Path logFile;
        private PrintWriter writer;
        
        SessionLog(Path logFile) throws IOException {
            this.logFile = logFile;
            this.writer = new PrintWriter(new FileWriter(logFile.toFile(), true), true);
        }
        
        void writeHeader(String sessionId) {
            writer.println("═══════════════════════════════════════════════════════════════════════════════");
            writer.println("会话 ID: " + sessionId);
            writer.println("开始时间：" + LocalDateTime.now().format(TIMESTAMP_FORMATTER));
            writer.println("═══════════════════════════════════════════════════════════════════════════════");
            writer.println();
        }
        
        void appendUserMessage(Message message, int estimatedTokens) {
            writer.println("┌─ 用户输入 ─────────────────────────────────");
            writer.println("│ 时间：" + LocalDateTime.now().format(TIMESTAMP_FORMATTER));
            writer.println("│ 估算 Token: " + estimatedTokens);
            writer.println("├────────────────────────────────────────────");
            writer.println("│ " + truncate(message.getContent(), 100));
            writer.println("└────────────────────────────────────────────");
            writer.println();
        }
        
        void appendLlmCallStart(int turn) {
            // 预留位置，实际 token 使用在响应时记录
        }
        
        void appendLlmResponse(int turn, Usage usage, String responsePreview) {
            writer.println("┌─ LLM 调用 #" + turn + " ────────────────────────────────");
            writer.println("│ 时间：" + LocalDateTime.now().format(TIMESTAMP_FORMATTER));
            if (usage != null) {
                writer.println("│ Token 使用：Prompt=" + usage.getPromptTokens() + 
                             ", Completion=" + usage.getCompletionTokens() + 
                             ", Total=" + usage.getTotalTokens());
                writer.println("│ 类型：" + (usage.getTotalTokens() > 0 ? "最终响应" : "工具调用"));
            }
            writer.println("└────────────────────────────────────────────");
            writer.println();
            
            if (responsePreview != null && !responsePreview.isBlank()) {
                writer.println("┌─ AI 响应 ─────────────────────────────────");
                writer.println("│ 时间：" + LocalDateTime.now().format(TIMESTAMP_FORMATTER));
                if (usage != null) {
                    writer.println("│ Token 使用：Prompt=" + usage.getPromptTokens() + 
                                 ", Completion=" + usage.getCompletionTokens() + 
                                 ", Total=" + usage.getTotalTokens());
                }
                writer.println("├────────────────────────────────────────────");
                writer.println("│ " + truncate(responsePreview, 200));
                writer.println("└────────────────────────────────────────────");
                writer.println();
            }
        }
        
        void appendToolCall(String toolName, String arguments, String result, boolean success) {
            writer.println("┌─ 工具调用 ────────────────────────────────");
            writer.println("│ 时间：" + LocalDateTime.now().format(TIMESTAMP_FORMATTER));
            writer.println("│ 工具：" + toolName);
            writer.println("│ 状态：" + (success ? "✅ 成功" : "❌ 失败"));
            writer.println("├────────────────────────────────────────────");
            writer.println("│ 参数：" + truncate(arguments, 100));
            writer.println("├────────────────────────────────────────────");
            writer.println("│ 结果：" + truncate(result, 200));
            writer.println("└────────────────────────────────────────────");
            writer.println();
        }
        
        void appendSummary(int totalInputTokens, int totalOutputTokens, int totalTokens, 
                          int llmCalls, int toolCalls) {
            writer.println();
            writer.println("═══════════════════════════════════════════════════════════════════════════════");
            writer.println("对话摘要");
            writer.println("═══════════════════════════════════════════════════════════════════════════════");
            writer.println("对话 ID: " + logFile.getFileName().toString().replace(".log", ""));
            writer.println("开始时间：" + LocalDateTime.now().format(TIMESTAMP_FORMATTER));
            writer.println("总输入 Token: " + totalInputTokens);
            writer.println("总输出 Token: " + totalOutputTokens);
            writer.println("总 Token: " + totalTokens);
            writer.println("LLM 调用次数：" + llmCalls);
            writer.println("工具调用次数：" + toolCalls);
            writer.println("═══════════════════════════════════════════════════════════════════════════════");
            writer.println();
        }
        
        private String truncate(String text, int maxLength) {
            if (text == null) return "";
            if (text.length() <= maxLength) return text;
            return text.substring(0, maxLength) + "...";
        }
        
        void close() {
            if (writer != null) {
                writer.close();
            }
        }
    }
}
