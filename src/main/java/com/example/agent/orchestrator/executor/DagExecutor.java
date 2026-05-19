package com.example.agent.orchestrator.executor;

import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.orchestrator.model.ExecutionStatus;
import com.example.agent.orchestrator.model.ToolExecutionPlan;
import com.example.agent.orchestrator.model.ToolNode;
import com.example.agent.tools.concurrent.ConcurrentToolExecutor;
import com.example.agent.tools.concurrent.ToolExecutionResult;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

public class DagExecutor {

    private static final Logger logger = LoggerFactory.getLogger(DagExecutor.class);

    private final ConcurrentToolExecutor fallbackExecutor;
    private final RetryHandler retryHandler;
    private final TransactionHandler transactionHandler;
    private final CompilationChecker compilationChecker;
    private final Map<String, ToolExecutionResult> results = new ConcurrentHashMap<>();

    private boolean compilationCheckEnabled = true;

    public DagExecutor(ConcurrentToolExecutor fallbackExecutor) {
        this.fallbackExecutor = fallbackExecutor;
        this.retryHandler = new RetryHandler();
        this.transactionHandler = new TransactionHandler();
        this.compilationChecker = new CompilationChecker();
    }

    public List<ToolExecutionResult> execute(ToolExecutionPlan plan, List<ToolCall> originalCalls) {
        logger.info("开始 DAG 调度，共 {} 个工具调用", plan.getNodeCount());

        if (plan.hasCycle() || plan.getDependencyCount() == 0) {
            logger.debug("无依赖或循环依赖，直接使用并发执行器");
            return fallbackExecutor.executeConcurrently(originalCalls);
        }

        try {
            while (plan.hasPendingNodes()) {
                List<ToolNode> runnable = plan.getRunnableNodes();

                if (runnable.isEmpty()) {
                    logger.warn("调度异常，降级为并发执行");
                    return fallbackExecutor.executeConcurrently(originalCalls);
                }

                if (runnable.size() > 1) {
                    logger.debug("并行执行 {} 个无依赖工具", runnable.size());
                    executeParallel(runnable, originalCalls);
                } else {
                    ToolNode node = runnable.get(0);
                    logger.debug("串行执行: {} (依赖已满足)", node.getToolName());
                    executeSingle(node, originalCalls);
                }
            }

            // 移除隐式自动编译检查 + 自动回滚，遵循"框架执行，LLM决策"原则
            // 编译检查由 LLM 通过 bash mvn compile 自主调用
            // 回滚操作由用户通过命令手动触发，保留人类最终控制权
            transactionHandler.commit();

        } catch (Exception e) {
            logger.error("DAG 执行异常，执行事务回滚并降级", e);
            transactionHandler.rollback();
            return fallbackExecutor.executeConcurrently(originalCalls);
        }

        List<ToolExecutionResult> sortedResults = new ArrayList<>();
        for (int i = 0; i < originalCalls.size(); i++) {
            ToolExecutionResult result = results.get(originalCalls.get(i).getId());
            if (result != null) {
                sortedResults.add(result);
            }
        }

        logger.info("DAG 执行完成: {} 个结果", sortedResults.size());
        return sortedResults;
    }

    private void executeParallel(List<ToolNode> nodes, List<ToolCall> originalCalls) {
        try (var executor = Executors.newThreadPerTaskExecutor(Thread.ofVirtual()
                .inheritInheritableThreadLocals(true)
                .factory())) {
            List<CompletableFuture<Void>> futures = nodes.stream()
                    .map(node -> CompletableFuture.runAsync(() -> executeSingle(node, originalCalls), executor))
                    .collect(Collectors.toList());
            CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
        }
    }

    private void executeSingle(ToolNode node, List<ToolCall> originalCalls) {
        node.setStatus(ExecutionStatus.RUNNING);
        prepareForTransaction(node);

        try {
            int index = findOriginalIndex(node.getToolCall(), originalCalls);
            int total = originalCalls.size();
            ToolExecutionResult result = fallbackExecutor.executeSingle(
                    node.getToolCall(), index, total);
            results.put(node.getToolCallId(), result);
            node.setStatus(ExecutionStatus.SUCCESS);
            node.setResult(result);

        } catch (Exception e) {
            node.setStatus(ExecutionStatus.FAILED);
            node.setError(e);
            logger.warn("{} 执行异常: {}", node.getToolName(), e.getMessage());
        }
    }

    private int findOriginalIndex(ToolCall toolCall, List<ToolCall> originalCalls) {
        for (int i = 0; i < originalCalls.size(); i++) {
            if (toolCall.getId().equals(originalCalls.get(i).getId())) {
                return i;
            }
        }
        return 0;
    }

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private void prepareForTransaction(ToolNode node) {
        if ("edit_file".equals(node.getToolName()) || "write_file".equals(node.getToolName())) {
            FunctionCall function = node.getToolCall().getFunction();
            if (function != null && function.getArguments() != null) {
                try {
                    Map<String, Object> args = objectMapper.readValue(
                            function.getArguments(),
                            new TypeReference<Map<String, Object>>() {}
                    );
                    Object path = args.get("path");
                    if (path != null) {
                        transactionHandler.beforeEdit(path.toString());
                    }
                } catch (Exception e) {
                    logger.debug("无法解析参数: {}", e.getMessage());
                }
            }
        }
    }

    private boolean hasFileOperations(ToolExecutionPlan plan) {
        return plan.getAllNodes().stream()
                .anyMatch(node -> "edit_file".equals(node.getToolName())
                        || "write_file".equals(node.getToolName()));
    }

    private void prependCompilationError(Map<String, ToolExecutionResult> results,
                                          CompilationChecker.CompilationResult compileResult) {
        String errorMessage = compileResult.formatErrorMessage();

        for (Map.Entry<String, ToolExecutionResult> entry : results.entrySet()) {
            ToolExecutionResult original = entry.getValue();
            if (original.isSuccess()) {
                String originalResult = original.getResult() != null ? original.getResult() : "";
                String newResult = errorMessage + "\n\n" + originalResult;
                results.put(entry.getKey(), ToolExecutionResult.builder()
                        .index(original.getIndex())
                        .toolCallId(original.getToolCallId())
                        .toolName(original.getToolName())
                        .result(newResult)
                        .success(true)
                        .executionTimeMs(original.getExecutionTimeMs())
                        .build());
            }
        }
    }

    public void setCompilationCheckEnabled(boolean enabled) {
        this.compilationCheckEnabled = enabled;
    }

}
