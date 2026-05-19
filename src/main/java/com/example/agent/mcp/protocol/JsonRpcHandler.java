package com.example.agent.mcp.protocol;

import com.example.agent.mcp.exception.McpProtocolException;
import com.example.agent.mcp.exception.McpTimeoutException;
import com.example.agent.core.concurrency.GracefulShutdown;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class JsonRpcHandler {

    private static final Logger logger = LoggerFactory.getLogger(JsonRpcHandler.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicInteger requestIdCounter = new AtomicInteger(1);
    private final Map<Integer, CompletableFuture<JsonNode>> pendingRequests = new ConcurrentHashMap<>();
    private final Map<Integer, Long> requestTimestamps = new ConcurrentHashMap<>();
    private final ScheduledExecutorService cleanupExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "jsonrpc-cleanup");
        t.setDaemon(true);
        return t;
    });

    public JsonRpcHandler() {
        cleanupExecutor.scheduleAtFixedRate(this::cleanupTimeoutRequests, 30, 30, TimeUnit.SECONDS);
        GracefulShutdown.register(cleanupExecutor);
    }

    private void cleanupTimeoutRequests() {
        long now = System.currentTimeMillis();
        long timeoutMs = 120000;

        Iterator<Map.Entry<Integer, Long>> iterator = requestTimestamps.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<Integer, Long> entry = iterator.next();
            Integer id = entry.getKey();
            Long timestamp = entry.getValue();

            if (now - timestamp > timeoutMs) {
                iterator.remove();
                CompletableFuture<JsonNode> future = pendingRequests.remove(id);
                if (future != null && !future.isDone()) {
                    future.completeExceptionally(new McpTimeoutException("请求超时已清理: id=" + id));
                    logger.debug("清理超时请求: id={}", id);
                }
            }
        }
    }

    public String createRequest(String method, Object params) {
        return createRequest(nextId(), method, params);
    }

    public String createRequest(int id, String method, Object params) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("jsonrpc", "2.0");
        request.put("id", id);
        request.put("method", method);
        if (params != null) {
            request.set("params", objectMapper.valueToTree(params));
        }
        try {
            return objectMapper.writeValueAsString(request);
        } catch (Exception e) {
            throw new McpProtocolException(-32603, "创建JSON-RPC请求失败", e);
        }
    }

    public String createNotification(String method, Object params) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("jsonrpc", "2.0");
        request.put("method", method);
        if (params != null) {
            request.set("params", objectMapper.valueToTree(params));
        }
        try {
            return objectMapper.writeValueAsString(request);
        } catch (Exception e) {
            throw new McpProtocolException(-32603, "创建JSON-RPC通知失败", e);
        }
    }

    public int nextId() {
        int id;
        do {
            id = requestIdCounter.getAndIncrement();
            if (id <= 0) {
                requestIdCounter.compareAndSet(Integer.MIN_VALUE, 1);
            }
        } while (id <= 0);
        return id;
    }

    public CompletableFuture<JsonNode> registerPendingRequest(int id) {
        CompletableFuture<JsonNode> future = new CompletableFuture<>();
        pendingRequests.put(id, future);
        requestTimestamps.put(id, System.currentTimeMillis());
        return future;
    }

    public void handleResponse(String message) {
        try {
            JsonNode json = objectMapper.readTree(message);

            if (!json.has("jsonrpc")) {
                return;
            }

            if (json.has("id") && json.get("id").isNumber()) {
                int id = json.get("id").asInt();
                CompletableFuture<JsonNode> future = pendingRequests.remove(id);
                requestTimestamps.remove(id);

                if (future != null) {
                    if (json.has("error")) {
                        JsonNode error = json.get("error");
                        int code = error.has("code") ? error.get("code").asInt() : -32603;
                        String errorMessage = error.has("message") ? error.get("message").asText() : "未知错误";
                        future.completeExceptionally(new McpProtocolException(code, errorMessage));
                    } else {
                        future.complete(json.get("result"));
                    }
                }
            } else if (json.has("method")) {
                handleNotification(json);
            }
        } catch (IOException e) {
            logger.debug("解析JSON-RPC消息失败: {}", message, e);
        }
    }

    private void handleNotification(JsonNode json) {
        String method = json.get("method").asText();
        JsonNode params = json.get("params");
        logger.debug("收到通知: {}, 参数: {}", method, params);
    }

    public <T> T parseResult(JsonNode result, Class<T> clazz) {
        try {
            return objectMapper.treeToValue(result, clazz);
        } catch (Exception e) {
            throw new McpProtocolException(-32603, "解析响应结果失败", e);
        }
    }

    public void cancelAllPending() {
        pendingRequests.forEach((id, future) -> {
            future.completeExceptionally(new McpProtocolException("请求已取消"));
        });
        pendingRequests.clear();
        requestTimestamps.clear();
        cleanupExecutor.shutdownNow();
    }
}
