package com.example.agent.tools;

import com.example.agent.core.blocker.BlockerChain;
import com.example.agent.core.event.EventBus;
import com.example.agent.core.event.ToolExecutedEvent;
import com.example.agent.llm.model.Tool;
import com.example.agent.tools.concurrent.FileLockManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.agent.core.AgentMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class ToolRegistry {

    private static final Logger logger = LoggerFactory.getLogger(ToolRegistry.class);

    private final Map<String, ToolExecutor> executors = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;
    private final BlockerChain blockerChain = new BlockerChain();

    public ToolRegistry() {
        this(new ObjectMapper());
    }

    public ToolRegistry(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public BlockerChain getBlockerChain() {
        return blockerChain;
    }

    public ToolRegistry register(ToolExecutor executor) {
        executors.put(executor.getName(), executor);
        return this;
    }

    /** 移除指定工具。返回被移除的执行器，若不存在返回 null。 */
    public ToolExecutor unregister(String name) {
        return executors.remove(name);
    }

    public ToolExecutor getExecutor(String name) {
        return executors.get(name);
    }

    public boolean hasTool(String name) {
        return executors.containsKey(name);
    }

    public List<ToolExecutor> getAllTools() {
        return new ArrayList<>(executors.values());
    }

    public List<Tool> toTools() {
        return toTools(null);
    }

    public List<Tool> toTools(AgentMode mode) {
        List<Tool> tools = new ArrayList<>();
        for (ToolExecutor executor : executors.values()) {
            if (mode != null && !mode.isToolAllowed(executor.getName())) {
                continue;
            }
            try {
                String schemaJson = executor.getParametersSchema();
                if (schemaJson == null || schemaJson.trim().isEmpty()) {
                    logger.warn("Empty schema for tool: {}", executor.getName());
                    continue;
                }
                JsonNode schema = objectMapper.readTree(schemaJson);
                Map<String, Object> parameters = objectMapper.convertValue(schema, Map.class);
                tools.add(Tool.of(executor.getName(), executor.getDescription(), parameters));
            } catch (Exception e) {
                logger.warn("Failed to parse schema for tool: {} - {}", executor.getName(), e.getMessage());
            }
        }
        return tools;
    }

    public String execute(String toolName, String argumentsJson) throws ToolExecutionException {
        if (toolName == null || toolName.trim().isEmpty()) {
            throw new ToolExecutionException("工具名称不能为空");
        }
        
        ToolExecutor executor = executors.get(toolName);
        if (executor == null) {
            throw new ToolExecutionException("未知的工具: " + toolName);
        }

        long startMs = System.currentTimeMillis();
        try {
            JsonNode arguments = ToolArgumentParser.parse(argumentsJson, toolName);
            
            com.example.agent.core.blocker.HookResult hookResult = blockerChain.check(toolName, arguments);
            if (!hookResult.isAllowed()) {
                String errorMessage = hookResult.formatErrorMessage();
                EventBus.publish(new ToolExecutedEvent(
                        toolName,
                        false,
                        System.currentTimeMillis() - startMs,
                        hookResult.getReason()
                ));
                throw new ToolExecutionException(errorMessage);
            }
            
            String result = executeWithFileLock(executor, arguments);

            if (hookResult.isWarning()) {
                String warning = hookResult.formatWarningMessage();
                result = warning + "\n\n" + result;
            }
            
            EventBus.publish(new ToolExecutedEvent(
                    toolName,
                    true,
                    System.currentTimeMillis() - startMs,
                    null
            ));
            
            return result;
        } catch (ToolArgumentParseException e) {
            int argLen = argumentsJson != null ? argumentsJson.length() : 0;
            logger.warn("工具 [{}] JSON 解析失败: arguments 长度={}, 错误={}",
                    toolName, argLen, e.getMessage());
            EventBus.publish(new ToolExecutedEvent(
                    toolName,
                    false,
                    System.currentTimeMillis() - startMs,
                    "参数 JSON 格式错误: " + e.getMessage()
            ));
            throw new ToolExecutionException(e.toLlmPrompt(), e);
        } catch (ToolExecutionException e) {
            EventBus.publish(new ToolExecutedEvent(
                    toolName,
                    false,
                    System.currentTimeMillis() - startMs,
                    e.getMessage()
            ));
            throw e;
        } catch (Exception e) {
            EventBus.publish(new ToolExecutedEvent(
                    toolName,
                    false,
                    System.currentTimeMillis() - startMs,
                    e.getMessage()
            ));
            throw new ToolExecutionException("参数 JSON 格式错误，请检查并修正。错误: " + e.getMessage(), e);
        }
    }

    /**
     * 对 requiresFileLock() 为 true 的工具，在其受影响路径上加写锁后执行。
     * 锁在跨会话并发写同一文件时提供互斥保护；串行执行下无额外开销。
     * 受影响路径取自 executor.getAffectedPaths(arguments)。
     */
    private String executeWithFileLock(ToolExecutor executor, JsonNode arguments) throws ToolExecutionException {
        if (!executor.requiresFileLock()) {
            return executor.execute(arguments);
        }
        List<String> paths = executor.getAffectedPaths(arguments);
        if (paths == null || paths.isEmpty()) {
            return executor.execute(arguments);
        }
        try {
            return FileLockManager.getInstance().withWriteLocks(paths, () -> executor.execute(arguments));
        } catch (ToolExecutionException e) {
            throw e;
        } catch (Exception e) {
            throw new ToolExecutionException("文件锁保护下执行失败: " + e.getMessage(), e);
        }
    }
}
