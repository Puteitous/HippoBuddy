package com.example.agent.web.handler;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.memory.MemoryEntry;
import com.example.agent.memory.MemoryStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class MemoryApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(MemoryApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, DELETE, PUT, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        MemoryStore memoryStore = ServiceLocator.getOrNull(MemoryStore.class);
        if (memoryStore == null) {
            sendError(exchange, 503, "MemoryStore 未初始化");
            return;
        }

        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        try {
            if ("GET".equals(method) && path.equals("/api/memories")) {
                handleListMemories(exchange, memoryStore);
            } else if ("GET".equals(method) && path.equals("/api/memories/stats")) {
                handleStats(exchange, memoryStore);
            } else if ("GET".equals(method) && path.matches("/api/memories/[^/]+")) {
                String id = path.substring("/api/memories/".length());
                handleGetMemory(exchange, memoryStore, id);
            } else if ("DELETE".equals(method) && path.matches("/api/memories/[^/]+")) {
                String id = path.substring("/api/memories/".length());
                handleDeleteMemory(exchange, memoryStore, id);
            } else if ("PUT".equals(method) && path.matches("/api/memories/[^/]+")) {
                String id = path.substring("/api/memories/".length());
                handleUpdateMemory(exchange, memoryStore, id);
            } else {
                sendError(exchange, 404, "未找到");
            }
        } catch (Exception e) {
            logger.error("Memory API 错误", e);
            sendError(exchange, 500, e.getMessage());
        }
    }

    private void handleListMemories(HttpExchange exchange, MemoryStore memoryStore) throws IOException {
        Collection<MemoryStore.MemoryEntryMeta> metas = memoryStore.getAllMetas();
        List<Map<String, Object>> list = new ArrayList<>();

        for (MemoryStore.MemoryEntryMeta meta : metas) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", meta.getId());
            item.put("title", meta.getTitle());
            item.put("type", meta.getType().name());
            item.put("tags", meta.getTags());
            item.put("lastUpdated", meta.getLastUpdated() != null ? meta.getLastUpdated().toString() : null);
            item.put("lastAccessed", meta.getLastAccessed() != null ? meta.getLastAccessed().toString() : null);
            if (meta.fileName != null) {
                item.put("fileName", meta.fileName);
            }
            list.add(item);
        }

        list.sort((a, b) -> {
            String ta = (String) a.getOrDefault("lastUpdated", "");
            String tb = (String) b.getOrDefault("lastUpdated", "");
            return tb.compareTo(ta);
        });

        sendJson(exchange, Map.of("memories", list, "total", list.size()));
    }

    private void handleGetMemory(HttpExchange exchange, MemoryStore memoryStore, String id) throws IOException {
        MemoryEntry entry = memoryStore.findById(id);
        if (entry == null) {
            sendError(exchange, 404, "记忆不存在: " + id);
            return;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", entry.getId());
        result.put("content", entry.getContent());
        result.put("type", entry.getType().name());
        result.put("tags", entry.getTags());
        result.put("createdAt", entry.getCreatedAt() != null ? entry.getCreatedAt().toString() : null);
        result.put("lastUpdated", entry.getLastUpdated() != null ? entry.getLastUpdated().toString() : null);
        result.put("lastAccessed", entry.getLastAccessed() != null ? entry.getLastAccessed().toString() : null);
        result.put("accessCount", entry.getAccessCount());
        result.put("scope", entry.getScope());

        sendJson(exchange, result);
    }

    private void handleDeleteMemory(HttpExchange exchange, MemoryStore memoryStore, String id) throws IOException {
        MemoryEntry entry = memoryStore.findById(id);
        if (entry == null) {
            sendError(exchange, 404, "记忆不存在: " + id);
            return;
        }
        memoryStore.delete(id);
        logger.info("通过 Web API 删除记忆: {}", id);
        sendJson(exchange, Map.of("success", true, "id", id));
    }

    private void handleUpdateMemory(HttpExchange exchange, MemoryStore memoryStore, String id) throws IOException {
        MemoryEntry entry = memoryStore.findById(id);
        if (entry == null) {
            sendError(exchange, 404, "记忆不存在: " + id);
            return;
        }

        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, Object> updates = objectMapper.readValue(body, Map.class);

        memoryStore.update(id, e -> {
            if (updates.containsKey("content")) {
                e.setContent((String) updates.get("content"));
            }
            if (updates.containsKey("tags")) {
                @SuppressWarnings("unchecked")
                List<String> tagList = (List<String>) updates.get("tags");
                e.setTags(new HashSet<>(tagList));
            }
        });

        logger.info("通过 Web API 更新记忆: {}", id);
        sendJson(exchange, Map.of("success", true, "id", id));
    }

    private void handleStats(HttpExchange exchange, MemoryStore memoryStore) throws IOException {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalMemories", memoryStore.getIndexSize());
        stats.put("fileCount", memoryStore.getFileCount());

        Map<String, Integer> byType = new LinkedHashMap<>();
        for (MemoryStore.MemoryEntryMeta meta : memoryStore.getAllMetas()) {
            String type = meta.getType().name();
            byType.merge(type, 1, Integer::sum);
        }
        stats.put("byType", byType);

        sendJson(exchange, stats);
    }

    private void sendJson(HttpExchange exchange, Object data) throws IOException {
        String response = objectMapper.writeValueAsString(data);
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private void sendError(HttpExchange exchange, int code, String message) throws IOException {
        String response = "{\"error\":\"" + message.replace("\"", "\\\"") + "\"}";
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(code, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
