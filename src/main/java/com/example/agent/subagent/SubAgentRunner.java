package com.example.agent.subagent;

import com.example.agent.application.ConversationService;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Tool;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.model.Usage;
import com.example.agent.service.TokenEstimator;
import com.example.agent.subagent.event.SubAgentProgressEvent;

import com.example.agent.tools.ToolExecutor;
import com.example.agent.tools.ToolRegistry;
import com.example.agent.tools.concurrent.ConcurrentToolExecutor;
import com.example.agent.tools.concurrent.ToolExecutionResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

public class SubAgentRunner implements Runnable {
    private static final Logger logger = LoggerFactory.getLogger(SubAgentRunner.class);
    private static final int MAX_TURNS = 10;
    private static final int MAX_EMPTY_RESPONSE_RETRIES = 3;
    private static final int MAX_LLM_ERROR_RETRIES = 3;
    private static final int MAX_TOOL_ERROR_RETRIES = 2;
    private static final int RETRY_DELAY_MS = 1000;
    private static final int MAX_CONSECUTIVE_FAILED_TOOL_CALLS = 3;
    private static final int MAX_EDIT_FILE_MISMATCH_COUNT = 2;
    private static final int MAX_MEMORY_EXTRACTOR_TURNS = 50;
    private static final int MAX_CONSECUTIVE_NO_TOOL_CALLS = 2;

    private final SubAgentTask task;
    private final SubAgentLogger subAgentLogger;
    private final LlmClient llmClient;
    private final ToolRegistry toolRegistry;
    private int editFileMismatchCount = 0;
    private final ConversationService conversationService;
    private final SubAgentPermission permission;
    private final ObjectMapper objectMapper;
    private final ConcurrentToolExecutor toolExecutor;
    private final SubAgentConfig config;

    private final int maxTurns;

    public SubAgentRunner(SubAgentTask task,
                          SubAgentLogger subAgentLogger,
                          SubAgentPermission permission,
                          ConcurrentToolExecutor toolExecutor,
                          LlmClient llmClient,
                          ToolRegistry toolRegistry,
                          ConversationService conversationService,
                          SubAgentConfig config) {
        this.task = task;
        this.subAgentLogger = subAgentLogger;
        this.permission = permission;
        this.toolExecutor = toolExecutor;
        this.llmClient = llmClient;
        this.toolRegistry = toolRegistry;
        this.conversationService = conversationService;
        this.objectMapper = new ObjectMapper();
        this.config = config != null ? config : SubAgentConfig.defaults();
        
        if (this.config.getCustomMaxTurns() > 0) {
            this.maxTurns = this.config.getCustomMaxTurns();
        } else if (permission == SubAgentPermission.MEMORY_EXTRACTOR) {
            this.maxTurns = MAX_MEMORY_EXTRACTOR_TURNS;
        } else {
            this.maxTurns = MAX_TURNS;
        }
    }

    @Override
    public void run() {
        int turnCount = 0;
        int emptyResponseRetries = 0;
        int consecutiveFailedToolCalls = 0;
        int consecutiveNoToolCalls = 0;
        editFileMismatchCount = 0;
        int totalPromptTokens = 0;
        int totalCompletionTokens = 0;

        task.addLog("=== SubAgent 启动: " + task.getDescription() + " ===");
        publishProgress("任务启动，开始执行...");
        subAgentLogger.log("=== SubAgent 启动 ===");
        subAgentLogger.log("任务描述: " + task.getDescription());

        try {
            while (turnCount < maxTurns) {
                if (task.shouldStopExecution()) {
                    String reason = task.isCancelled() ? "任务已被取消" : "执行超时 (" + task.getTimeoutSeconds() + " 秒)";
                    task.addLog("执行终止: " + reason);
                    subAgentLogger.log("执行终止: " + reason);
                    if (task.isTimeout()) {
                        task.markFailed(new Exception("执行超时"));
                    } else {
                        task.markCompleted();
                    }
                    break;
                }

                turnCount++;
                task.addLog("\n--- 第 " + turnCount + " 轮 ---");
                subAgentLogger.log("--- 第 " + turnCount + " 轮 ---");

                List<Message> context = conversationService.prepareForInference(task.getConversation());
                List<Message> finalContext = new ArrayList<>();
                
                finalContext.addAll(context);
                
                String subAgentRules = buildSubAgentExecutionRules(task.getDescription());
                finalContext.add(Message.user(subAgentRules));
                
                // 确保第一条消息是 system role（LLM API 强制要求）
                finalContext = ensureSystemMessageFirst(finalContext);
                
                String systemPromptInfo = "复用主 Agent System Prompt";
                subAgentLogger.log("上下文消息数: " + finalContext.size() + " (原生上下文 + 执行规则)");
                
                boolean isFinalRound = permission != SubAgentPermission.MEMORY_EXTRACTOR 
                    && (turnCount == maxTurns - 1);
                if (isFinalRound) {
                    finalContext.add(Message.user("这是最后一轮执行机会，请基于所有工具调用结果，输出最终总结，不能再调用任何工具！"));
                    subAgentLogger.log("最后一轮 - 禁用工具，强制总结");
                }
                
                subAgentLogger.log(systemPromptInfo);
                subAgentLogger.log("任务描述: " + task.getDescription());
                List<Tool> allowedTools = isFinalRound ? Collections.emptyList() : getFilteredTools();
                subAgentLogger.log("可用工具数: " + allowedTools.size() + (isFinalRound ? " (最后一轮禁用工具，强制总结)" : ""));

                ChatResponse response = null;
                int llmRetryCount = 0;
                while (llmRetryCount < MAX_LLM_ERROR_RETRIES) {
                    try {
                        response = llmClient.chat(finalContext, allowedTools);
                        break;
                    } catch (Exception e) {
                        llmRetryCount++;
                        String msg = String.format("LLM 调用异常，第 %d/%d 次重试: %s", 
                            llmRetryCount, MAX_LLM_ERROR_RETRIES, e.getMessage());
                        task.addLog(msg);
                        subAgentLogger.log(msg);
                        if (llmRetryCount >= MAX_LLM_ERROR_RETRIES) {
                            throw new RuntimeException("LLM 调用失败，已达最大重试次数", e);
                        }
                        try {
                            Thread.sleep(RETRY_DELAY_MS * llmRetryCount);
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                            throw new RuntimeException("执行被中断", ie);
                        }
                    }
                }
                Usage usage = response.getUsage();
                int promptTokens = 0;
                int completionTokens = 0;
                int cacheReadTokens = 0;
                int cacheCreationTokens = 0;
                
                if (usage != null) {
                    promptTokens = usage.getPromptTokens();
                    completionTokens = usage.getCompletionTokens();
                    cacheReadTokens = usage.getCacheReadInputTokens();
                    cacheCreationTokens = usage.getCacheCreationInputTokens();
                }
                
                if (promptTokens == 0 && completionTokens == 0) {
                    TokenEstimator estimator = ServiceLocator.get(TokenEstimator.class);
                    promptTokens = estimator.estimateConversationTokens(finalContext);
                    if (response.getFirstMessage() != null && response.getFirstMessage().getContent() != null) {
                        completionTokens = estimator.estimateTextTokens(response.getFirstMessage().getContent());
                    }
                }
                
                totalPromptTokens += promptTokens;
                totalCompletionTokens += completionTokens;
                
                String cacheInfo = "";
                if (cacheReadTokens > 0 || cacheCreationTokens > 0) {
                    double hitRate = usage != null ? usage.getCacheHitRate() : 0.0;
                    cacheInfo = String.format(" | Cache: read=%,d create=%,d (%.1f%%)", 
                        cacheReadTokens, cacheCreationTokens, hitRate);
                }
                
                String tokenLog = String.format("LLM 调用完成 | Prompt: %,d | Completion: %,d | 累计: %,d tokens%s",
                    promptTokens, completionTokens,
                    totalPromptTokens + totalCompletionTokens, cacheInfo);
                task.addLog(tokenLog);
                subAgentLogger.log(tokenLog + (llmRetryCount > 0 ? " (重试 " + llmRetryCount + " 次)" : ""));

                if (response == null || response.getFirstMessage() == null) {
                    task.addLog("LLM 返回空响应");
                    subAgentLogger.log("警告: LLM 返回空响应");
                    if (emptyResponseRetries++ < MAX_EMPTY_RESPONSE_RETRIES) {
                        continue;
                    }
                    task.markFailed(new RuntimeException("LLM 多次返回空响应"));
                    break;
                }

                Message assistantMessage = response.getFirstMessage();

                conversationService.addAssistantMessage(task.getConversation(), assistantMessage, response.getUsage());

                if (assistantMessage.getContent() != null && !assistantMessage.getContent().isBlank()) {
                    task.addLog("AI: " + assistantMessage.getContent());
                    subAgentLogger.logAiResponse(assistantMessage.getContent());
                    publishProgress(assistantMessage.getContent());
                }

                if (response.hasToolCalls()) {
                    consecutiveNoToolCalls = 0;
                    List<ToolCall> toolCalls = assistantMessage.getToolCalls();
                    task.addLog("工具调用数量: " + toolCalls.size());
                    subAgentLogger.log("准备执行工具调用: " + toolCalls.size() + " 个");
                    publishProgress("执行 " + toolCalls.size() + " 个工具调用...");

                    int failedInThisTurn = executeToolCalls(toolCalls);
                    
                    if (failedInThisTurn > 0) {
                        consecutiveFailedToolCalls++;
                    } else {
                        consecutiveFailedToolCalls = 0;
                    }
                    
                    if (consecutiveFailedToolCalls >= MAX_CONSECUTIVE_FAILED_TOOL_CALLS) {
                        String msg = String.format("工具连续失败 %d 次，自动终止任务（避免死循环）", 
                            consecutiveFailedToolCalls);
                        task.addLog(msg);
                        subAgentLogger.log(msg);
                        task.markFailed(new Exception(msg));
                        break;
                    }
                    
                    if (permission == SubAgentPermission.MEMORY_EXTRACTOR 
                        && editFileMismatchCount >= MAX_EDIT_FILE_MISMATCH_COUNT) {
                        String msg = String.format("edit_file 连续 %d 次匹配失败，终止记忆更新（避免死循环）", 
                            editFileMismatchCount);
                        task.addLog(msg);
                        subAgentLogger.log(msg);
                        task.markCompleted();
                        break;
                    }
                    
                    if (task.isDone()) {
                        break;
                    }
                } else {
                    task.addLog("任务完成，无更多工具调用");
                    subAgentLogger.log("无工具调用，任务完成");
                    task.markCompleted();
                    break;
                }
            }

            if (permission != SubAgentPermission.MEMORY_EXTRACTOR && turnCount >= maxTurns) {
                task.addLog("达到最大轮次限制: " + maxTurns);
                subAgentLogger.log("达到最大轮次限制: " + maxTurns);
                if (!task.isDone()) {
                    task.markCompleted();
                }
            }

        } catch (Exception e) {
            task.addLog("执行异常: " + e.getMessage());
            subAgentLogger.logError("执行异常", e);
            logger.error("SubAgentRunner 执行异常: taskId={}", task.getTaskId(), e);
            if (!task.isDone()) {
                task.markFailed(e);
            }
        } finally {
            if (turnCount > 0) {
                String summaryLog = String.format(
                    "📊 Token 统计 | 总轮次: %d | Prompt: %,d | Completion: %,d | 总计: %,d tokens",
                    turnCount, totalPromptTokens, totalCompletionTokens,
                    totalPromptTokens + totalCompletionTokens);
                task.addLog(summaryLog);
                subAgentLogger.log(summaryLog);
            }

            task.addLog("=== SubAgent 执行结束 ===");
            subAgentLogger.log("=== SubAgent 执行结束 ===");
        }
    }

    private String buildSubAgentExecutionRules(String task) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是一个严谨的子任务执行助手。必须严格遵守以下规则:\n\n");
        sb.append("## 🎯 你的任务\n");
        sb.append(task).append("\n\n");
        sb.append("## ⚠️ 绝对强制规则（违反将导致任务失败）\n");
        
        if (permission.isRequireToolCalls()) {
            sb.append("1. ✅ **必须调用工具获取真实数据** - 所有信息必须通过工具调用获得\n");
            sb.append("2. ❌ **严禁编造任何结果** - 不知道就调用工具，绝对不能想象、假设、编造\n");
            sb.append("3. ❌ **严禁直接回答** - 你没有本地知识，不调用工具给出的任何答案都是错误的\n");
            sb.append("4. ❌ **严禁询问用户** - 绝对不能问用户任何问题、不能要求补充信息\n");
            sb.append("5. ❌ **禁止无意义循环** - 同样参数的工具最多调用 2 次，重复无济于事\n");
            sb.append("6. ✅ **信息不足就如实说** - 找不到就说「未找到」，信息不足就说「信息不足」，不要追问\n");
            sb.append("7. ✅ **结果明确立即结束** - 一旦获得确定结果，立刻输出最终总结，不再调用工具\n");
            sb.append("8. ✅ **必须使用工具** - 可用工具: ").append(permission.getAllowedTools()).append("\n");
            sb.append("9. ✅ **如实汇报结果** - 工具返回什么就总结什么，不要添加任何工具未返回的信息\n\n");
            sb.append("## 📋 执行流程\n");
            sb.append("1. 分析任务需要哪些数据\n");
            sb.append("2. 调用对应的工具获取真实数据\n");
            sb.append("3. 根据工具的实际返回结果进行总结\n");
            sb.append("4. 明确标注哪些文件已检查，哪些结果已验证\n\n");
            sb.append("记住: 你是「工具执行者」，不是「答案生成者」。\n");
            sb.append("信息不足 → 调用更多工具；找不到 → 如实报告；绝对不要问用户！\n");
            sb.append("不调用工具 + 询问用户 = 任务失败！");
        } else {
            sb.append("1. ✅ **优先使用工具** - 能通过工具获取的信息请调用工具\n");
            sb.append("2. ❌ **严禁编造任何结果** - 不知道就说不知道，绝对不能想象、假设、编造\n");
            sb.append("3. ❌ **严禁询问用户** - 绝对不能问用户任何问题、不能要求补充信息\n");
            sb.append("4. ✅ **可直接输出总结** - 基于已有对话上下文进行分析，不需要强制调用工具\n");
            sb.append("5. ✅ **可用工具**: ").append(permission.getAllowedTools()).append("\n");
            sb.append("6. ✅ **如实汇报结果** - 按要求格式输出，简洁准确\n\n");
            sb.append("## 📋 执行流程\n");
            sb.append("1. 阅读已有上下文，理解任务目标\n");
            sb.append("2. 如需读取/写入文件，使用对应工具\n");
            sb.append("3. 直接输出最终结果，不需要额外确认\n\n");
            sb.append("记住: 你是「分析者」，不是「工具执行者」。\n");
            sb.append("已有信息足够时 → 直接输出高质量结果；\n");
            sb.append("需要文件操作时 → 使用工具后再输出！");
        }
        
        return sb.toString();
    }

    private List<Tool> getFilteredTools() {
        List<Tool> allTools = toolRegistry.toTools();
        subAgentLogger.log("权限模式: " + permission.getName());
        subAgentLogger.log("注册的总工具数: " + allTools.size());
        
        List<Tool> filtered = allTools.stream()
            .filter(tool -> {
                String name = tool.getFunction().getName();
                boolean allowed = permission.isToolAllowed(name);
                return allowed;
            })
            .collect(Collectors.toList());
        
        if (task.isForkChild()) {
            int originalCount = filtered.size();
            filtered = filtered.stream()
                .filter(tool -> {
                    String name = tool.getFunction().getName();
                    return !"fork_agent".equals(name) && !"fork_agents".equals(name);
                })
                .collect(Collectors.toList());
            
            if (originalCount > filtered.size()) {
                subAgentLogger.log("Fork 递归防护: 已禁用 fork_agent/fork_agents 工具");
            }
        }
        
        subAgentLogger.log("过滤后可用工具: " + filtered.stream()
            .map(t -> t.getFunction().getName())
            .collect(Collectors.toList()));
        
        return filtered;
    }

    private int executeToolCalls(List<ToolCall> toolCalls) {
        int failedCount = 0;
        for (ToolCall toolCall : toolCalls) {
            String toolName = toolCall.getFunction().getName();
            String arguments = toolCall.getFunction().getArguments();

            subAgentLogger.logToolCall(toolName, arguments);

            if (!permission.isToolAllowed(toolName)) {
                String errorMsg = "SubAgent 不允许执行工具: " + toolName;
                task.addLog(errorMsg);
                subAgentLogger.log("权限拒绝: " + errorMsg);
                addToolResult(toolCall.getId(), toolName, errorMsg);
                failedCount++;
                continue;
            }

            if (permission == SubAgentPermission.MEMORY_EXTRACTOR || permission == SubAgentPermission.MEMORY_CONSOLIDATOR) {
                try {
                    JsonNode args = objectMapper.readTree(arguments);
                    String filePath = null;
                    if (args.has("path")) {
                        filePath = args.get("path").asText();
                    } else if (args.has("file_path")) {
                        filePath = args.get("file_path").asText();
                    }
                    
                    if (filePath == null || !filePath.startsWith(".hippo/memory/")) {
                        String errorMsg = String.format("权限拒绝: %s 只能操作 .hippo/memory/ 下的文件，不允许: %s", 
                            permission.getName(), filePath);
                        task.addLog(errorMsg);
                        subAgentLogger.log(errorMsg);
                        addToolResult(toolCall.getId(), toolName, errorMsg);
                        failedCount++;
                        continue;
                    }
                } catch (Exception e) {
                    String errorMsg = "权限拒绝: 无法解析文件路径参数";
                    task.addLog(errorMsg);
                    subAgentLogger.log(errorMsg);
                    addToolResult(toolCall.getId(), toolName, errorMsg);
                    failedCount++;
                    continue;
                }
            }

            String result = null;
            int toolRetryCount = 0;
            boolean toolSucceeded = false;
            while (toolRetryCount < MAX_TOOL_ERROR_RETRIES) {
                try {
                    ToolExecutor executor = toolRegistry.getExecutor(toolName);
                    JsonNode args = objectMapper.readTree(arguments);

                    task.addLog("执行工具: " + toolName + (toolRetryCount > 0 ? " (重试 " + toolRetryCount + " 次)" : ""));
                    publishProgress("执行工具: " + toolName);

                    result = executor.execute(args);
                    toolSucceeded = true;
                    break;
                } catch (Exception e) {
                    toolRetryCount++;
                    String msg = String.format("工具执行异常 [%s]，第 %d/%d 次重试: %s", 
                        toolName, toolRetryCount, MAX_TOOL_ERROR_RETRIES, e.getMessage());
                    task.addLog(msg);
                    subAgentLogger.log(msg);
                    if (toolRetryCount >= MAX_TOOL_ERROR_RETRIES) {
                        result = "工具执行失败: " + e.getMessage() + " (已达最大重试次数)";
                        subAgentLogger.logError("工具执行最终失败", e);
                        break;
                    }
                    try {
                        Thread.sleep(RETRY_DELAY_MS * toolRetryCount);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }

            if (!toolSucceeded) {
                failedCount++;
                if ("edit_file".equals(toolName) && result != null 
                    && result.contains("old_text not found")) {
                    editFileMismatchCount++;
                    subAgentLogger.log(String.format("⚠️ edit_file 匹配失败 (%d/%d)，模型可能幻觉了文件内容",
                        editFileMismatchCount, MAX_EDIT_FILE_MISMATCH_COUNT));
                }
            } else {
                if ("edit_file".equals(toolName)) {
                    editFileMismatchCount = 0;
                }
            }

            task.addLog("工具结果: " + truncate(result, 200));
            subAgentLogger.logToolResult(toolName, result);
            addToolResult(toolCall.getId(), toolName, result);
        }
        return failedCount;
    }

    private void addToolResult(String toolCallId, String toolName, String content) {
        String compressed = conversationService.getToolResultCompressor().compress(content);
        task.getConversation().addMessage(Message.toolResult(toolCallId, toolName, compressed));
        
        if (permission == SubAgentPermission.MEMORY_EXTRACTOR 
            && "edit_file".equals(toolName) 
            && content != null 
            && content.contains("文件编辑成功")) {
            subAgentLogger.log("✅ edit_file 执行成功，记忆文件写入完成，提前终止任务");
            task.markCompleted();
        }
    }
    
    private void publishProgress(String message) {
        if (config != null && config.isShareTerminalOutput()) {
            com.example.agent.core.event.EventBus.publish(
                new com.example.agent.subagent.event.SubAgentProgressEvent(
                    task.getTaskId(), task.getDescription(), message
                )
            );
        } else {
            subAgentLogger.log("[进度] " + message);
        }
    }

    private String truncate(String s, int maxLength) {
        if (s == null) return "null";
        return s.length() > maxLength ? s.substring(0, maxLength) + "..." : s;
    }

    /**
     * 确保消息列表第一个是 system message，并去重
     * 修复 LLM API 错误：System message must be at the beginning
     */
    private List<Message> ensureSystemMessageFirst(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return messages;
        }
        
        // 移除所有 system message
        List<Message> nonSystemMessages = new ArrayList<>();
        Message firstSystem = null;
        for (Message msg : messages) {
            if ("system".equals(msg.getRole())) {
                if (firstSystem == null) {
                    firstSystem = msg;
                }
            } else {
                nonSystemMessages.add(msg);
            }
        }
        
        // 重新组装：system 在前，其他在后
        if (firstSystem != null) {
            List<Message> result = new ArrayList<>();
            result.add(firstSystem);
            result.addAll(nonSystemMessages);
            return result;
        }
        
        return nonSystemMessages;
    }
}
