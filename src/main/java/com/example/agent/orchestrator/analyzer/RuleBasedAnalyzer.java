package com.example.agent.orchestrator.analyzer;

import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.orchestrator.model.ToolDependencyType;
import com.example.agent.orchestrator.model.ToolExecutionPlan;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.stream.Collectors;

public class RuleBasedAnalyzer implements DependencyAnalyzer {

    private static final Logger logger = LoggerFactory.getLogger(RuleBasedAnalyzer.class);

    private static final Set<String> READ_TOOLS = Set.of("read_file", "cat");
    private static final Set<String> EDIT_TOOLS = Set.of("edit_file", "write_file");
    private static final Set<String> SEARCH_TOOLS = Set.of("grep", "SearchCodebase");
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public ToolExecutionPlan analyze(List<ToolCall> toolCalls) {
        ToolExecutionPlan plan = new ToolExecutionPlan();
        toolCalls.forEach(plan::addNode);

        analyzeReadThenEdit(toolCalls, plan);
        analyzeSameFileMultipleEdits(toolCalls, plan);
        analyzeSearchThenEdit(toolCalls, plan);

        if (plan.hasCycle()) {
            logger.warn("检测到循环依赖，将降级为顺序执行");
        }

        logger.info("DAG 构建完成: {} 个节点, {} 个依赖关系",
                plan.getNodeCount(), plan.getDependencyCount());

        return plan;
    }

    private void analyzeReadThenEdit(List<ToolCall> calls, ToolExecutionPlan plan) {
        List<ToolCall> reads = filterTools(calls, READ_TOOLS);
        List<ToolCall> edits = filterTools(calls, EDIT_TOOLS);

        for (ToolCall read : reads) {
            String readPath = getPath(read);
            for (ToolCall edit : edits) {
                String editPath = getPath(edit);
                if (Objects.equals(readPath, editPath) && !read.getId().equals(edit.getId())) {
                    plan.addDependency(read, edit, ToolDependencyType.READ_THEN_EDIT_SAME_FILE);
                    logger.debug("规则匹配: 读→编辑同文件 {}", readPath);
                }
            }
        }
    }

    private void analyzeSameFileMultipleEdits(List<ToolCall> calls, ToolExecutionPlan plan) {
        List<ToolCall> edits = filterTools(calls, EDIT_TOOLS);

        Map<String, List<ToolCall>> editsByPath = edits.stream()
                .collect(Collectors.groupingBy(this::getPath));

        editsByPath.forEach((path, samePathEdits) -> {
            if (samePathEdits.size() > 1) {
                logger.debug("同文件 {} 检测到 {} 次编辑，强制串行", path, samePathEdits.size());
                for (int i = 1; i < samePathEdits.size(); i++) {
                    plan.addDependency(
                            samePathEdits.get(i - 1),
                            samePathEdits.get(i),
                            ToolDependencyType.SAME_FILE_MULTIPLE_EDITS
                    );
                }
            }
        });
    }

    private void analyzeSearchThenEdit(List<ToolCall> calls, ToolExecutionPlan plan) {
        List<ToolCall> searches = filterTools(calls, SEARCH_TOOLS);
        List<ToolCall> edits = filterTools(calls, EDIT_TOOLS);

        if (!searches.isEmpty() && !edits.isEmpty()) {
            logger.debug("检测到搜索+编辑模式: {} 搜索 → {} 编辑",
                    searches.size(), edits.size());

            for (ToolCall search : searches) {
                for (ToolCall edit : edits) {
                    plan.addDependency(search, edit, ToolDependencyType.SEARCH_THEN_EDIT);
                }
            }
        }
    }

    private List<ToolCall> filterTools(List<ToolCall> calls, Set<String> toolNames) {
        return calls.stream()
                .filter(c -> c.getFunction() != null && toolNames.contains(c.getFunction().getName()))
                .collect(Collectors.toList());
    }

    private String getPath(ToolCall call) {
        FunctionCall function = call.getFunction();
        if (function == null || function.getArguments() == null) {
            return "";
        }
        try {
            Map<String, Object> args = objectMapper.readValue(
                    function.getArguments(),
                    new TypeReference<Map<String, Object>>() {}
            );
            Object path = args.get("path");
            return path != null ? path.toString() : "";
        } catch (Exception e) {
            return "";
        }
    }
}
