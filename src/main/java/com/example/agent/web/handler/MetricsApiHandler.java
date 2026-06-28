package com.example.agent.web.handler;

import com.example.agent.core.AgentContext;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.logging.CostMetricsCollector;
import com.example.agent.logging.EventMetricsCollector;
import com.example.agent.memory.MemoryMetricsCollector;
import com.example.agent.memory.MemoryModule;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

public class MetricsApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(MetricsApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        if (!"GET".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        try {
            Map<String, Object> metrics = new LinkedHashMap<>();

            // LLM 指标
            CostMetricsCollector costCollector = ServiceLocator.getOrNull(CostMetricsCollector.class);
            if (costCollector != null) {
                Map<String, Object> llm = new LinkedHashMap<>();
                llm.put("totalRequests", costCollector.getTotalRequests());
                llm.put("successfulRequests", costCollector.getSuccessfulRequests());
                llm.put("failedRequests", costCollector.getFailedRequests());
                llm.put("avgLatencyMs", Math.round(costCollector.getAvgLatencyMs()));
                llm.put("minLatencyMs", costCollector.getMinLatencyMs());
                llm.put("maxLatencyMs", costCollector.getMaxLatencyMs());
                metrics.put("llm", llm);
            }

            // 工具调用指标
            AgentContext agentContext = ServiceLocator.getOrNull(AgentContext.class);
            if (agentContext != null) {
                EventMetricsCollector eventCollector = agentContext.getEventMetricsCollector();
                if (eventCollector != null) {
                    Map<String, Object> tools = new LinkedHashMap<>();
                    tools.put("totalCalls", eventCollector.getTotalToolCalls());
                    tools.put("successfulCalls", eventCollector.getSuccessfulToolCalls());
                    tools.put("failedCalls", eventCollector.getFailedToolCalls());

                    // JSON 解析错误统计
                    tools.put("jsonParseErrors", eventCollector.getTotalJsonParseErrors());
                    tools.put("jsonParseErrorTools", eventCollector.getToolsWithJsonParseErrorCount());
                    tools.put("repeatedParseErrors", eventCollector.getRepeatedParseErrorCount());
                    tools.put("rePromptRecovery", eventCollector.getRePromptRecoveryCount());

                    List<Map<String, Object>> toolDetails = new ArrayList<>();
                    eventCollector.getToolUsage().forEach((name, count) -> {
                        Map<String, Object> detail = new LinkedHashMap<>();
                        detail.put("name", name);
                        detail.put("count", count.get());
                        // 每个工具的 JSON 解析错误次数
                        Map<String, AtomicInteger> jsonErrors = eventCollector.getJsonParseErrorsByTool();
                        detail.put("jsonParseErrors", jsonErrors.getOrDefault(name, new AtomicInteger(0)).get());
                        // 最近一次错误详情
                        Map<String, String> errorDetails = eventCollector.getLastJsonParseErrorDetail();
                        detail.put("lastParseError", errorDetails.getOrDefault(name, ""));
                        toolDetails.add(detail);
                    });
                    toolDetails.sort((a, b) -> ((Integer) b.get("count")).compareTo((Integer) a.get("count")));
                    tools.put("details", toolDetails);
                    metrics.put("tools", tools);
                }
            }

            // 记忆系统指标
            MemoryMetricsCollector memoryCollector = MemoryModule.getMetricsCollector();
            if (memoryCollector != null) {
                Map<String, Object> memory = new LinkedHashMap<>();
                memory.put("vectorSearchCount", memoryCollector.getVectorSearchCount());
                memory.put("searchHitRate", Math.round(memoryCollector.getSearchHitRate() * 100));
                memory.put("keywordFallbackCount", memoryCollector.getKeywordFallbackCount());
                memory.put("injectionSuccessCount", memoryCollector.getInjectionSuccessCount());
                memory.put("injectionEmptyCount", memoryCollector.getInjectionEmptyCount());
                metrics.put("memory", memory);
            }

            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(metrics);
            sendJson(exchange, 200, json);

        } catch (Exception e) {
            logger.error("获取指标失败", e);
            sendJson(exchange, 500, "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.getResponseBody().close();
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
