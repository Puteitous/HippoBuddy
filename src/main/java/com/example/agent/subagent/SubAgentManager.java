package com.example.agent.subagent;

import com.example.agent.core.AgentContext;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.application.ConversationService;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.Message;
import com.example.agent.subagent.event.SubAgentCompletedEvent;
import com.example.agent.subagent.event.SubAgentFailedEvent;
import com.example.agent.subagent.event.SubAgentStartedEvent;
import com.example.agent.tools.ToolRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class SubAgentManager {
    private static final Logger logger = LoggerFactory.getLogger(SubAgentManager.class);
    private static final int MAX_PARALLEL_TASKS = Math.max(2, Runtime.getRuntime().availableProcessors() / 2);
    private static final int MAX_QUEUED_TASKS = 100;

    private final Map<String, SubAgentTask> activeTasks;
    private final Map<String, SubAgentLogger> loggers;
    private final Map<String, Runnable> completionCallbacks;
    private final LlmClient llmClient;
    private ToolRegistry toolRegistry;
    private final ExecutorService executor;
    private final AtomicInteger queuedTaskCount = new AtomicInteger(0);
    private final ProjectAgentLoader projectAgentLoader;

    public SubAgentManager() {
        this.activeTasks = new ConcurrentHashMap<>();
        this.loggers = new ConcurrentHashMap<>();
        this.completionCallbacks = new ConcurrentHashMap<>();
        this.llmClient = ServiceLocator.get(LlmClient.class);
        
        String workspacePath = WorkspaceManager.getCurrentProjectDir().toString();
        this.projectAgentLoader = new ProjectAgentLoader(workspacePath);
        
        this.executor = new ThreadPoolExecutor(
            MAX_PARALLEL_TASKS,
            MAX_PARALLEL_TASKS,
            60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(MAX_QUEUED_TASKS),
            r -> {
                Thread t = new Thread(r, "subagent-" + queuedTaskCount.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        );
        
        logger.info("SubAgentManager 初始化: 最大并行任务数 = {}, 最大排队任务数 = {}", 
            MAX_PARALLEL_TASKS, MAX_QUEUED_TASKS);
    }

    public String getFullAgentMenu() {
        StringBuilder sb = new StringBuilder();
        sb.append(BuiltInAgent.getAgentMenu());
        sb.append(projectAgentLoader.getCustomAgentMenu());
        return sb.toString();
    }

    private ConversationService getConversationService() {
        return ServiceLocator.get(ConversationService.class);
    }

    private ToolRegistry getToolRegistry() {
        if (toolRegistry == null) {
            toolRegistry = ServiceLocator.get(ToolRegistry.class);
            logger.info("SubAgentManager 延迟加载 ToolRegistry: 注册工具数 = {}", toolRegistry.toTools().size());
        }
        return toolRegistry;
    }

    public SubAgentTask forkAgent(String taskDescription, String systemPrompt) {
        return forkAgent(taskDescription, systemPrompt, 300);
    }

    public SubAgentTask forkAgent(String taskDescription, String systemPrompt, int timeoutSeconds) {
        return forkAgent(taskDescription, systemPrompt, timeoutSeconds, null, SubAgentPermission.DEFAULT, null, false);
    }

    public SubAgentTask forkAgent(String taskDescription, String systemPrompt, int timeoutSeconds, List<String> dependsOn) {
        return forkAgent(taskDescription, systemPrompt, timeoutSeconds, dependsOn, SubAgentPermission.DEFAULT, null, false);
    }

    public SubAgentTask forkAgent(String taskDescription, String systemPrompt, int timeoutSeconds, 
                                   List<String> dependsOn, SubAgentPermission permission, Runnable completionCallback) {
        return forkAgent(taskDescription, systemPrompt, timeoutSeconds, dependsOn, permission, completionCallback, false);
    }

    public SubAgentTask forkAgent(String taskDescription, String systemPrompt, int timeoutSeconds, 
                                   List<String> dependsOn, SubAgentPermission permission, 
                                   Runnable completionCallback, boolean useForkOptimization) {
        return forkAgent(getParentSessionId(), taskDescription, systemPrompt, timeoutSeconds, 
            dependsOn, permission, completionCallback, useForkOptimization);
    }

    @FunctionalInterface
    public interface Configurer {
        void configure(SubAgentConfig.Builder builder);
    }
    
    public SubAgentTask forkAgent(Conversation parentConversation, String taskDescription, String additionalInstruction, 
                                 int timeoutSeconds, List<String> dependsOn, SubAgentPermission permission, 
                                 Runnable completionCallback) {
        return forkAgent(parentConversation, taskDescription, additionalInstruction, 
            timeoutSeconds, dependsOn, permission, completionCallback, null);
    }
    
    public SubAgentTask forkAgent(Conversation parentConversation, String taskDescription, String additionalInstruction, 
                                 int timeoutSeconds, List<String> dependsOn, SubAgentPermission permission, 
                                 Runnable completionCallback, Configurer configurer) {
        String parentSessionId = parentConversation != null ? parentConversation.getSessionId() : null;
        
        logger.info("forkAgent: 父会话消息={} 条, task={}, timeout={}s, permission={}", 
            parentConversation != null ? parentConversation.getMessageCount() : 0,
            taskDescription, timeoutSeconds, permission.getName());

        SubAgentConfig.Builder configBuilder = SubAgentConfig.builder();
        if (configurer != null) {
            configurer.configure(configBuilder);
        }
        SubAgentConfig config = configBuilder.build();
        
        Conversation subConversation = getConversationService().createSubAgentConversation(null, parentSessionId);
        
        if (parentConversation != null) {
            subConversation.replaceMessages(parentConversation.getMessages());
        }
        
        if (additionalInstruction != null && !additionalInstruction.isEmpty()) {
            subConversation.addMessage(Message.user(additionalInstruction));
        }

        SubAgentTask task = new SubAgentTask(taskDescription, subConversation, timeoutSeconds, dependsOn, false);
        activeTasks.put(task.getTaskId(), task);

        if (completionCallback != null) {
            completionCallbacks.put(task.getTaskId(), completionCallback);
        }

        SubAgentLogger subAgentLogger = new SubAgentLogger(task, parentSessionId);
        loggers.put(task.getTaskId(), subAgentLogger);
        subAgentLogger.logStatusChange(SubAgentStatus.PENDING);
        subAgentLogger.log("Sub-Agent 会话 ID: " + subConversation.getSessionId());
        subAgentLogger.log("父会话 ID: " + parentSessionId);
        subAgentLogger.log("权限模式: " + permission.getName());
        subAgentLogger.log("启动 Sub-Agent 零拷贝): " + taskDescription);
        if (task.hasDependencies()) {
            subAgentLogger.log("依赖任务: " + dependsOn);
        }
        subAgentLogger.log("日志目录: " + subAgentLogger.getLogDir());
        subAgentLogger.log("配置: shareTerminal=" + config.isShareTerminalOutput() + 
            ", depthTracking=" + config.isEnableDepthTracking());
        subAgentLogger.log("父会话 " + (parentConversation != null ? parentConversation.getMessageCount() : 0) + 
            " 条 (直接引用) + 1 条指令 = 子会话共 " + subConversation.getMessageCount() + " 条, Cache 命中 ~100%");

        submitTask(task, subAgentLogger, permission, config);

        logger.info("SubAgent 已创建: taskId={}, permission={}, 零拷贝上下文={} 条, Cache 命中 ~100%",
            task.getTaskId(), permission.getName(), subConversation.getMessageCount());
        return task;
    }

    public SubAgentTask forkAgent(String parentSessionId, String taskDescription, String userInstruction, int timeoutSeconds, 
                                   List<String> dependsOn, SubAgentPermission permission, 
                                   Runnable completionCallback, boolean unused) {
        String finalInstruction = userInstruction != null && !userInstruction.isBlank() 
            ? userInstruction 
            : buildSubAgentSystemPrompt(taskDescription, null);
        
        logger.info("forkAgent: taskDescription={}, timeout={}秒, permission={}, dependsOn={}", 
            taskDescription, timeoutSeconds, permission.getName(), dependsOn);

        Conversation subConversation = getConversationService().createSubAgentConversation(
            finalInstruction,
            parentSessionId
        );

        SubAgentTask task = new SubAgentTask(taskDescription, subConversation, timeoutSeconds, dependsOn, false);
        activeTasks.put(task.getTaskId(), task);

        if (completionCallback != null) {
            completionCallbacks.put(task.getTaskId(), completionCallback);
        }

        SubAgentLogger subAgentLogger = new SubAgentLogger(task, parentSessionId);
        loggers.put(task.getTaskId(), subAgentLogger);
        subAgentLogger.logStatusChange(SubAgentStatus.PENDING);
        subAgentLogger.log("Sub-Agent 会话 ID: " + subConversation.getSessionId());
        subAgentLogger.log("父会话 ID: " + parentSessionId);
        subAgentLogger.log("权限模式: " + permission.getName());
        subAgentLogger.log("启动 Sub-Agent: " + taskDescription);
        if (task.hasDependencies()) {
            subAgentLogger.log("依赖任务: " + dependsOn);
        }
        subAgentLogger.log("日志目录: " + subAgentLogger.getLogDir());

        submitTask(task, subAgentLogger, permission);

        logger.info("SubAgent 已创建: taskId={}, permission={}",
            task.getTaskId(), permission.getName());
        return task;
    }

    public SubAgentTask createSubAgent(String taskDescription, String subagentType) {
        return createSubAgent(taskDescription, subagentType, 300, null, null);
    }

    public SubAgentTask createSubAgent(String taskDescription, String subagentType, int timeoutSeconds, 
                                         List<String> dependsOn, Runnable completionCallback) {
        if (taskDescription == null || taskDescription.isBlank()) {
            throw new IllegalArgumentException("任务描述不能为空");
        }
        timeoutSeconds = Math.max(30, Math.min(3600, timeoutSeconds));
        
        String parentSessionId = getParentSessionId();
        
        BuiltInAgent selectedAgent = BuiltInAgent.fromType(subagentType);
        ProjectAgentLoader.ProjectAgentDefinition customAgent = projectAgentLoader.getAgent(subagentType);
        
        boolean useFork;
        SubAgentPermission permission;
        String systemPrompt;
        String agentInfo;

        if (selectedAgent != null) {
            useFork = selectedAgent.useForkOptimization();
            permission = selectedAgent.getPermission();
            systemPrompt = selectedAgent.getSystemPrompt();
            agentInfo = selectedAgent.getIcon() + " " + selectedAgent.getDisplayName() + " (内置专家)";
        } else if (customAgent != null) {
            useFork = customAgent.useForkOptimization();
            permission = customAgent.getPermission();
            systemPrompt = customAgent.getSystemPrompt();
            agentInfo = customAgent.getIcon() + " " + customAgent.getDisplayName() + " (项目自定义)";
        } else {
            useFork = true;
            permission = SubAgentPermission.DEFAULT;
            systemPrompt = null;
            agentInfo = "🚀 Fork 模式 - 完整复用上下文 (推荐)";
        }

        logger.info("forkAgent: task={}, agent={}, timeout={}s, dependsOn={}", 
            taskDescription, agentInfo, timeoutSeconds, dependsOn);

        String finalInstruction = systemPrompt != null && !systemPrompt.isBlank() 
            ? systemPrompt + "\n\n## 当前任务\n" + taskDescription
            : buildSubAgentSystemPrompt(taskDescription, null);
        
        Conversation subConversation = getConversationService().createSubAgentConversation(
            finalInstruction,
            parentSessionId
        );

        SubAgentTask task = new SubAgentTask(taskDescription, subConversation, timeoutSeconds, dependsOn, false);
        activeTasks.put(task.getTaskId(), task);

        if (completionCallback != null) {
            completionCallbacks.put(task.getTaskId(), completionCallback);
        }

        SubAgentLogger subAgentLogger = new SubAgentLogger(task, parentSessionId);
        loggers.put(task.getTaskId(), subAgentLogger);
        subAgentLogger.logStatusChange(SubAgentStatus.PENDING);
        subAgentLogger.log("专家代理: " + agentInfo);
        subAgentLogger.log("Sub-Agent 会话 ID: " + subConversation.getSessionId());
        subAgentLogger.log("父会话 ID: " + parentSessionId);
        subAgentLogger.log("权限模式: " + permission.getName());
        subAgentLogger.log("启动 Sub-Agent: " + taskDescription);
        if (task.hasDependencies()) {
            subAgentLogger.log("依赖任务: " + dependsOn);
        }
        subAgentLogger.log("日志目录: " + subAgentLogger.getLogDir());

        final SubAgentPermission finalPermission = permission;
        submitTask(task, subAgentLogger, finalPermission);

        logger.info("SubAgent 已创建: taskId={}, agent={}, permission={}",
            task.getTaskId(), agentInfo, permission.getName());
        return task;
    }

    public void scheduleTask(SubAgentTask task) {
        SubAgentLogger subAgentLogger = loggers.get(task.getTaskId());
        if (subAgentLogger != null) {
            startExecution(task, subAgentLogger);
        }
    }

    private void startExecution(SubAgentTask task, SubAgentLogger subAgentLogger) {
        if (task.hasDependencies() && !areDependenciesSatisfied(task)) {
            task.setStatus(SubAgentStatus.WAITING);
            subAgentLogger.log("任务等待依赖完成: " + task.getDependsOn());
            task.addLog("等待依赖任务完成: " + task.getDependsOn());
            com.example.agent.core.event.EventBus.publish(
                new com.example.agent.subagent.event.SubAgentWaitingEvent(
                    task.getTaskId(), task.getDescription(), task.getDependsOn()
                )
            );
            return;
        }

        submitTask(task, subAgentLogger);
    }

    private boolean areDependenciesSatisfied(SubAgentTask task) {
        for (String depId : task.getDependsOn()) {
            SubAgentTask depTask = activeTasks.get(depId);
            if (depTask == null) {
                task.addLog("警告: 依赖任务不存在: " + depId);
                continue;
            }
            SubAgentStatus status = depTask.getStatus();
            if (status != SubAgentStatus.COMPLETED && status != SubAgentStatus.FAILED) {
                return false;
            }
        }
        return true;
    }

    private void submitTask(SubAgentTask task, SubAgentLogger subAgentLogger) {
        submitTask(task, subAgentLogger, SubAgentPermission.DEFAULT, SubAgentConfig.defaults());
    }

    private void submitTask(SubAgentTask task, SubAgentLogger subAgentLogger, SubAgentPermission permission) {
        submitTask(task, subAgentLogger, permission, SubAgentConfig.defaults());
    }

    private void submitTask(SubAgentTask task, SubAgentLogger subAgentLogger, SubAgentPermission permission, SubAgentConfig config) {
        ToolRegistry registry = getToolRegistry();
        com.example.agent.tools.concurrent.ConcurrentToolExecutor toolExecutor = 
            new com.example.agent.tools.concurrent.ConcurrentToolExecutor(registry);
        SubAgentRunner runner = new SubAgentRunner(
            task,
            subAgentLogger,
            permission,
            toolExecutor,
            llmClient,
            registry,
            getConversationService(),
            config
        );

        int queueSize = ((ThreadPoolExecutor) executor).getQueue().size();
        int activeCount = ((ThreadPoolExecutor) executor).getActiveCount();
        
        if (queueSize > 0) {
            subAgentLogger.log("任务排队中，当前队列: " + queueSize + " 个任务");
            task.addLog("任务排队中，位置: " + queueSize);
        }
        
        subAgentLogger.log("线程池状态: 活跃=" + activeCount + ", 排队=" + queueSize);

        executor.submit(() -> {
            try {
                task.setStatus(SubAgentStatus.RUNNING);
                subAgentLogger.logStatusChange(SubAgentStatus.RUNNING);
                com.example.agent.core.event.EventBus.publish(
                    new SubAgentStartedEvent(task.getTaskId(), task.getDescription())
                );

                runner.run();

                if (!task.isDone()) {
                    task.setStatus(SubAgentStatus.COMPLETED);
                    task.markCompleted();
                }
                String resultSummary = extractResultSummary(task);
                task.setResultSummary(resultSummary);
                subAgentLogger.logStatusChange(task.getStatus());
                subAgentLogger.log("执行结果: " + resultSummary);
                subAgentLogger.saveDetails();

                com.example.agent.core.event.EventBus.publish(
                    new SubAgentCompletedEvent(task.getTaskId(), task.getDescription(), resultSummary)
                );

            } catch (Exception e) {
                logger.error("SubAgent 执行异常: taskId={}", task.getTaskId(), e);
                if (!task.isDone()) {
                    task.setStatus(SubAgentStatus.FAILED);
                    task.setError(e);
                    task.markFailed(e);
                    subAgentLogger.logStatusChange(SubAgentStatus.FAILED);
                    subAgentLogger.logError("执行失败", e);
                }
                subAgentLogger.saveDetails();

                com.example.agent.core.event.EventBus.publish(
                    new SubAgentFailedEvent(task.getTaskId(), task.getDescription(), e.getMessage())
                );
            } finally {
                Runnable callback = completionCallbacks.remove(task.getTaskId());
                if (callback != null) {
                    try {
                        callback.run();
                    } catch (Exception e) {
                        logger.warn("执行任务回调异常: taskId={}", task.getTaskId(), e);
                    }
                }
                triggerDependentTasks(task);
                cleanupExpiredTasks();
            }
        });
    }

    public void scheduleTask(SubAgentTask task, SubAgentPermission permission) {
        SubAgentLogger subAgentLogger = loggers.get(task.getTaskId());
        if (subAgentLogger != null) {
            startExecution(task, subAgentLogger, permission);
        }
    }

    private void startExecution(SubAgentTask task, SubAgentLogger subAgentLogger, SubAgentPermission permission) {
        if (task.hasDependencies() && !areDependenciesSatisfied(task)) {
            task.setStatus(SubAgentStatus.WAITING);
            subAgentLogger.log("任务等待依赖完成: " + task.getDependsOn());
            task.addLog("等待依赖任务完成: " + task.getDependsOn());
            com.example.agent.core.event.EventBus.publish(
                new com.example.agent.subagent.event.SubAgentWaitingEvent(
                    task.getTaskId(), task.getDescription(), task.getDependsOn()
                )
            );
            return;
        }

        submitTask(task, subAgentLogger, permission);
    }

    private void triggerDependentTasks(SubAgentTask completedTask) {
        for (SubAgentTask task : activeTasks.values()) {
            if (task.getStatus() == SubAgentStatus.WAITING 
                && task.getDependsOn().contains(completedTask.getTaskId())) {
                
                if (areDependenciesSatisfied(task)) {
                    task.addLog("依赖已满足，开始执行");
                    SubAgentLogger logger = loggers.get(task.getTaskId());
                    com.example.agent.core.event.EventBus.publish(
                        new com.example.agent.subagent.event.SubAgentStartedEvent(
                            task.getTaskId(), task.getDescription() + " (依赖已满足)"
                        )
                    );
                    submitTask(task, logger);
                }
            }
        }
    }

    private String extractResultSummary(SubAgentTask task) {
        List<com.example.agent.llm.model.Message> messages = task.getConversation().getMessages();
        for (int i = messages.size() - 1; i >= 0; i--) {
            com.example.agent.llm.model.Message msg = messages.get(i);
            if (msg.isAssistant() && msg.getContent() != null && !msg.getContent().isBlank()) {
                String content = msg.getContent().trim();
                return content.length() > 500 ? content.substring(0, 500) + "..." : content;
            }
        }
        return "任务执行完成";
    }

    private void injectResultToParentSession(SubAgentTask task, String result, String error) {
        String parentSessionId = getParentSessionId();
        if (parentSessionId == null) {
            return;
        }

        try {
            com.example.agent.core.AgentContext ctx = ServiceLocator.getOrNull(com.example.agent.core.AgentContext.class);
            if (ctx != null && ctx.getConversation() != null) {
                if (error != null) {
                    logger.debug("Sub-Agent 任务失败，不注入通知: taskId={}", task.getTaskId());
                    return;
                }

                List<String> writtenPaths = extractWrittenPaths(result);
                if (writtenPaths.isEmpty()) {
                    logger.debug("Sub-Agent 无记忆文件写入，不注入通知: taskId={}", task.getTaskId());
                    return;
                }

                com.example.agent.llm.model.Message notification = 
                    com.example.agent.llm.model.Message.memorySaved(writtenPaths);
                
                ctx.getConversation().addMessage(notification);
                logger.debug("Sub-Agent memory_saved 通知已注入父会话: taskId={}, paths={}", 
                    task.getTaskId(), writtenPaths);
            }
        } catch (Exception e) {
            logger.warn("注入 Sub-Agent 结果到父会话失败: {}", e.getMessage());
        }
    }

    private List<String> extractWrittenPaths(String result) {
        List<String> paths = new ArrayList<>();
        if (result == null || result.isBlank()) {
            return paths;
        }

        String[] lines = result.split("\n");
        for (String line : lines) {
            line = line.trim();
            if (line.startsWith("- ") && (line.contains(".md") || line.contains(".txt") || line.contains(".memory"))) {
                String path = line.substring(2).trim();
                if (!path.isEmpty()) {
                    paths.add(path);
                }
            }
        }
        return paths;
    }

    private String getParentSessionId() {
        try {
            AgentContext ctx = ServiceLocator.getOrNull(AgentContext.class);
            if (ctx != null) {
                return ctx.getSessionId();
            }
        } catch (Exception e) {
            // 忽略，使用默认路径
        }
        return null;
    }

    private String buildSubAgentSystemPrompt(String task, String customPrompt) {
        if (customPrompt != null && !customPrompt.isBlank()) {
            return customPrompt;
        }
        
        return "你是一个严谨的子任务执行助手。必须严格遵守以下规则:\n\n" +
            "## 🎯 你的任务\n" +
            task + "\n\n" +
            "## ⚠️ 绝对强制规则（违反将导致任务失败）\n" +
            "1. ✅ **必须调用工具获取真实数据** - 所有信息必须通过工具调用获得\n" +
            "2. ❌ **严禁编造任何结果** - 不知道就调用工具，绝对不能想象、假设、编造\n" +
            "3. ❌ **严禁直接回答** - 你没有本地知识，不调用工具给出的任何答案都是错误的\n" +
            "4. ✅ **必须使用工具** - 你只能通过以下工具完成任务: read_file, glob, grep, search_code, list_directory, list_subagents\n" +
            "5. ✅ **如实汇报结果** - 工具返回什么就总结什么，不要添加任何工具未返回的信息\n\n" +
            "## 📋 执行流程\n" +
            "1. 分析任务需要哪些数据\n" +
            "2. 调用对应的工具获取真实数据\n" +
            "3. 根据工具的实际返回结果进行总结\n" +
            "4. 明确标注哪些文件已检查，哪些结果已验证\n\n" +
            "记住: 你是「工具执行者」，不是「答案生成者」。不调用工具 = 任务失败！";
    }

    private void cleanupExpiredTasks() {
        activeTasks.entrySet().removeIf(entry -> entry.getValue().isExpired());
    }

    public SubAgentTask getTask(String taskId) {
        return activeTasks.get(taskId);
    }

    public List<SubAgentTask> getAllTasks() {
        cleanupExpiredTasks();
        return List.copyOf(activeTasks.values());
    }

    public int getActiveTaskCount() {
        return activeTasks.size();
    }

    public void shutdown() {
        int runningCount = 0;
        for (SubAgentTask task : activeTasks.values()) {
            if (task.getStatus() == SubAgentStatus.RUNNING || task.getStatus() == SubAgentStatus.PENDING) {
                if (task.cancel()) {
                    runningCount++;
                }
            }
        }

        for (SubAgentLogger taskLogger : loggers.values()) {
            taskLogger.log("系统退出，任务已被取消");
        }

        try {
            executor.shutdownNow();
            if (!executor.awaitTermination(3, TimeUnit.SECONDS)) {
                logger.warn("SubAgentManager 线程池未能在 3 秒内完全终止");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.warn("SubAgentManager shutdown 被中断");
        }

        activeTasks.clear();
        loggers.clear();

        if (runningCount > 0) {
            logger.info("SubAgentManager shutdown: 已取消 {} 个运行中的子任务", runningCount);
        }
    }
}
