package com.example.agent.web.handler;

import com.example.agent.tools.FileChangeTracker;
import com.example.agent.tools.FileSnapshotService;
import com.example.agent.web.util.DiffComputer;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class FileApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(FileApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final DiffComputer diffComputer = DiffComputer.DEFAULT;

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        logger.debug("FileApiHandler received request: method={}, path={}", method, path);

        try {
            if ("GET".equals(method) && (path.endsWith("/changes") || path.equals("/api/files") || path.equals("/api/files/"))) {
                handleGetChanges(exchange);
            } else if ("GET".equals(method) && path.endsWith("/summary")) {
                handleGetSummary(exchange);
            } else if ("GET".equals(method) && path.endsWith("/snapshot")) {
                handleGetSnapshot(exchange);
            } else if ("GET".equals(method) && path.endsWith("/diff")) {
                handleGetDiff(exchange);
            } else if ("POST".equals(method) && path.endsWith("/rollback")) {
                handleRollback(exchange);
            } else {
                logger.warn("FileApiHandler: no matching route for method={}, path={}", method, path);
                sendJson(exchange, 404, objectMapper.writeValueAsString(Map.of("error", "Not found: " + path)));
            }
        } catch (Exception e) {
            logger.error("FileApiHandler error", e);
            sendJson(exchange, 500, objectMapper.writeValueAsString(Map.of("error", e.getMessage())));
        }
    }

    private void handleGetChanges(HttpExchange exchange) throws IOException {
        // 解析可选的 sessionId 查询参数：/api/files/changes?sessionId=xxx
        String query = exchange.getRequestURI().getQuery();
        String sessionId = null;
        if (query != null) {
            String[] params = query.split("&");
            for (String param : params) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2 && "sessionId".equals(kv[0])) {
                    sessionId = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                }
            }
        }

        List<FileChangeTracker.FileChange> changes;
        if (sessionId != null && !sessionId.isEmpty()) {
            changes = FileChangeTracker.getRecentChanges(50, sessionId);
        } else {
            changes = FileChangeTracker.getRecentChanges(50);
        }

        // 每个文件的净变化行数(最早 original vs 最新 newContent)-> filePath → [insertions, deletions]。
        // 供前端在文件变更面板的每个 item 上显示该文件自身的 +x/-y(对齐会话汇总的净统计口径)。
        Map<String, int[]> netByFile = new HashMap<>();
        Map<String, List<FileChangeTracker.FileChange>> byFile = new HashMap<>();
        for (FileChangeTracker.FileChange c : changes) {
            byFile.computeIfAbsent(c.filePath, k -> new ArrayList<>()).add(c);
        }
        for (Map.Entry<String, List<FileChangeTracker.FileChange>> e : byFile.entrySet()) {
            int[] stats = netDiffStats(e.getValue());
            if (stats != null) netByFile.put(e.getKey(), stats);
        }

        List<Map<String, Object>> jsonList = new ArrayList<>();
        for (FileChangeTracker.FileChange c : changes) {
            Map<String, Object> item = new HashMap<>();
            item.put("filePath", c.filePath);
            item.put("toolName", c.toolName);
            item.put("timestamp", c.timestamp);
            item.put("binary", c.binary);
            int[] stats = netByFile.get(c.filePath);
            item.put("insertions", stats != null ? stats[0] : 0);
            item.put("deletions", stats != null ? stats[1] : 0);
            jsonList.add(item);
        }
        sendJson(exchange, 200, objectMapper.writeValueAsString(jsonList));
    }

    /**
     * GET /api/files/summary?sessionId=xxx — 会话级文件变更汇总。
     * <p>
     * 统计口径：
     * <ul>
     *   <li>fileCount / addedFiles / modifiedFiles / deletedFiles：按每个文件
     *       最新一条变更的 toolName 判定（与前端变更列表 A/M/D 标记口径一致）</li>
     *   <li>insertions / deletions：净变化量 —— 每个文件最早一条 originalContent
     *       vs 最新一条 newContent 做一次 diff 后汇总；二进制文件不参与行数统计</li>
     * </ul>
     */
    private void handleGetSummary(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String sessionId = null;
        if (query != null) {
            String[] params = query.split("&");
            for (String param : params) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2 && "sessionId".equals(kv[0])) {
                    sessionId = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                }
            }
        }

        Map<String, Object> response = buildSessionSummary(sessionId);
        sendJson(exchange, 200, objectMapper.writeValueAsString(response));
    }

    static Map<String, Object> buildSessionSummary(String sessionId) {
        Map<String, List<FileChangeTracker.FileChange>> files =
            FileChangeTracker.getSessionFileChanges(sessionId);

        int fileCount = 0;
        int addedFiles = 0;
        int modifiedFiles = 0;
        int deletedFiles = 0;
        int binaryFiles = 0;
        int insertions = 0;
        int deletions = 0;

        for (Map.Entry<String, List<FileChangeTracker.FileChange>> entry : files.entrySet()) {
            List<FileChangeTracker.FileChange> list = entry.getValue();
            if (list == null || list.isEmpty()) continue;

            fileCount++;
            // A/M/D 判定与前端变更列表一致：取最新一条 toolName
            // 注意：同毫秒内多条变更时取最后一条（与 netDiffStats 的 last 选取一致），
            // 否则删除+重建落在同一毫秒会漏选重建记录，误判 A/M/D。
            FileChangeTracker.FileChange last = null;
            for (FileChangeTracker.FileChange c : list) {
                if (last == null || c.timestamp >= last.timestamp) last = c;
            }
            switch (last.toolName) {
                case "delete_file" -> deletedFiles++;
                case "write_file" -> addedFiles++;
                default -> modifiedFiles++;
            }

            // 行数统计：二进制文件无内容，跳过
            int[] stats = netDiffStats(list);
            if (stats == null) {
                binaryFiles++;
                continue;
            }
            insertions += stats[0];
            deletions += stats[1];
        }

        Map<String, Object> response = new HashMap<>();
        response.put("fileCount", fileCount);
        response.put("addedFiles", addedFiles);
        response.put("modifiedFiles", modifiedFiles);
        response.put("deletedFiles", deletedFiles);
        response.put("binaryFiles", binaryFiles);
        response.put("insertions", insertions);
        response.put("deletions", deletions);
        return response;
    }

    /**
     * 计算单个文件从头到尾的净变化行数（非累计）。
     * <p>
     * 取列表中最先一条 originalContent 与最后一条 newContent 做一次 diff；
     * 不依赖列表顺序（按 timestamp 选取）。返回 {@code int[]{insertions, deletions}}。
     * <p>
     * 列表中任一为二进制文件（无内容可比）或列表为空时返回 null，
     * 调用方据此判定跳过行数统计（计入 binaryFiles）。
     */
    static int[] netDiffStats(List<FileChangeTracker.FileChange> list) {
        if (list == null || list.isEmpty()) return null;

        FileChangeTracker.FileChange first = null;
        FileChangeTracker.FileChange last = null;
        for (FileChangeTracker.FileChange c : list) {
            // first：严格小于 → 同 ts 保留最早遇到的（列表按插入顺序，最早=最靠前）
            if (first == null || c.timestamp < first.timestamp) first = c;
            // last：大于等于 → 同 ts 更新为最后遇到的（最靠后 = 最新插入）。
            // 若用严格大于，同一毫秒内的多条变更会漏选最后一条，导致净统计错误
            if (last == null || c.timestamp >= last.timestamp) last = c;
        }

        if (first.binary || last.binary) return null;

        String original = first.originalContent != null ? first.originalContent : "";
        String modified = last.newContent != null ? last.newContent : "";
        return diffComputer.countDiffStats(original, modified);
    }

    /**
     * 构建整个文件的净 diff（git 式整体对比）：
     * 取列表中最先一条 originalContent 与最后一条 newContent 做一次逐行 diff。
     * 任一端为二进制文件（无内容可比）或列表为空时返回空列表。
     */
    static List<Map<String, String>> buildNetDiff(List<FileChangeTracker.FileChange> list) {
        if (list == null || list.isEmpty()) return List.of();

        FileChangeTracker.FileChange first = null;
        FileChangeTracker.FileChange last = null;
        for (FileChangeTracker.FileChange c : list) {
            if (first == null || c.timestamp < first.timestamp) first = c;
            if (last == null || c.timestamp >= last.timestamp) last = c;
        }

        if (first.binary || last.binary) return List.of();

        String original = first.originalContent != null ? first.originalContent : "";
        String modified = last.newContent != null ? last.newContent : "";
        return diffComputer.computeDiffAsMap(original, modified);
    }

    /**
     * 构建整个文件的净词级 diff（整体视图的行内精确变更标记）：
     * 与 {@link #buildNetDiff} 同口径（最早 original vs 最新 newContent），
     * 返回按行组织的 {old, new} 词标记结构，供前端按行号直接索引。
     * 任一端为二进制文件（无内容可比）或列表为空时返回空结构。
     */
    static Map<String, Object> buildNetWordDiff(List<FileChangeTracker.FileChange> list) {
        if (list == null || list.isEmpty()) return Map.of("old", List.of(), "new", List.of());

        FileChangeTracker.FileChange first = null;
        FileChangeTracker.FileChange last = null;
        for (FileChangeTracker.FileChange c : list) {
            if (first == null || c.timestamp < first.timestamp) first = c;
            if (last == null || c.timestamp >= last.timestamp) last = c;
        }

        if (first.binary || last.binary) return Map.of("old", List.of(), "new", List.of());

        String original = first.originalContent != null ? first.originalContent : "";
        String modified = last.newContent != null ? last.newContent : "";
        return diffComputer.computeWordDiffLines(original, modified);
    }

    /**
     * GET /api/files/snapshot?path=xxx — 检测自上次调用以来的外部文件变更。
     * 前端每 15 秒轮询一次；首次调用仅初始化快照并返回空列表。
     */
    private void handleGetSnapshot(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String rootPath = null;
        if (query != null) {
            String[] params = query.split("&");
            for (String param : params) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2 && "path".equals(kv[0])) {
                    rootPath = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                }
            }
        }

        if (rootPath == null || rootPath.trim().isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing path parameter")));
            return;
        }

        List<FileSnapshotService.ExternalChange> changes = FileSnapshotService.detectExternalChanges(rootPath);
        List<Map<String, String>> jsonChanges = new ArrayList<>();
        for (FileSnapshotService.ExternalChange c : changes) {
            Map<String, String> item = new HashMap<>();
            item.put("type", c.type.name().toLowerCase());
            item.put("path", c.path);
            jsonChanges.add(item);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("available", true);
        response.put("changes", jsonChanges);
        sendJson(exchange, 200, objectMapper.writeValueAsString(response));
    }

    private void handleGetDiff(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String filePath = null;
        int changeIndex = -1;
        boolean allChanges = false;
        String toolCallId = null;

        if (query != null) {
            String[] params = query.split("&");
            for (String param : params) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2) {
                    if ("path".equals(kv[0])) {
                        filePath = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                    } else if ("index".equals(kv[0])) {
                        try {
                            changeIndex = Integer.parseInt(kv[1]);
                        } catch (NumberFormatException ignored) {
                        }
                    } else if ("all".equals(kv[0])) {
                        allChanges = "true".equals(kv[1]);
                    } else if ("toolCallId".equals(kv[0])) {
                        toolCallId = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                    }
                }
            }
        }

        if (filePath == null || filePath.trim().isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing filePath")));
            return;
        }

        List<FileChangeTracker.FileChange> changes = FileChangeTracker.getAllChanges(filePath);
        if (changes.isEmpty()) {
            Map<String, Object> emptyResponse = new HashMap<>();
            emptyResponse.put("filePath", filePath);
            emptyResponse.put("allChanges", List.of());
            emptyResponse.put("targetIndex", -1);
            sendJson(exchange, 200, objectMapper.writeValueAsString(emptyResponse));
            return;
        }

        if (allChanges) {
            List<Map<String, Object>> allChangesList = new ArrayList<>();
            int targetIndex = changes.size() - 1;
            boolean toolCallIdMatched = false;
            for (int ci = 0; ci < changes.size(); ci++) {
                FileChangeTracker.FileChange c = changes.get(ci);
                Map<String, Object> changeItem = new HashMap<>();
                changeItem.put("toolName", c.toolName);
                changeItem.put("timestamp", c.timestamp);
                changeItem.put("index", ci);
                changeItem.put("toolCallId", c.toolCallId != null ? c.toolCallId : "");
                changeItem.put("binary", c.binary);
                if (!c.binary) {
                    String original = c.originalContent != null ? c.originalContent : "";
                    String modified = c.newContent != null ? c.newContent : "";
                    changeItem.put("changes", buildDiffList(original, modified));
                    changeItem.put("wordDiff", buildWordDiffLines(original, modified));
                }
                if (toolCallId != null && !toolCallId.isEmpty() && toolCallId.equals(c.toolCallId)) {
                    targetIndex = ci;
                    toolCallIdMatched = true;
                }
                allChangesList.add(changeItem);
            }
            // toolCallId 传了但没找到 → 已被回滚，标记 -1 让前端降级
            if (toolCallId != null && !toolCallId.isEmpty() && !toolCallIdMatched) {
                targetIndex = -1;
            }
            Map<String, Object> response = new HashMap<>();
            response.put("filePath", filePath);
            response.put("allChanges", allChangesList);
            response.put("targetIndex", targetIndex);
            // 整个文件的净变化行数（最早 original vs 最新 newContent）
            int[] netStats = netDiffStats(changes);
            response.put("netStats", netStats != null ? netStats : new int[]{0, 0});
            // 整个文件的净 diff（git 式整体对比）：最早 original vs 最新 newContent 的逐行 diff
            response.put("netDiff", buildNetDiff(changes));
            // 整个文件的净词级 diff（整体视图行内精确变更标记）：与 netDiff 同口径
            response.put("netWordDiff", buildNetWordDiff(changes));
            sendJson(exchange, 200, objectMapper.writeValueAsString(response));
            return;
        }

        FileChangeTracker.FileChange targetChange;
        if (changeIndex >= 0 && changeIndex < changes.size()) {
            targetChange = changes.get(changeIndex);
        } else {
            targetChange = changes.get(changes.size() - 1);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("filePath", targetChange.filePath);
        response.put("toolName", targetChange.toolName);
        response.put("timestamp", targetChange.timestamp);
        response.put("binary", targetChange.binary);
        if (!targetChange.binary) {
            String original = targetChange.originalContent != null ? targetChange.originalContent : "";
            String modified = targetChange.newContent != null ? targetChange.newContent : "";
            response.put("changes", buildDiffList(original, modified));
            response.put("wordDiff", buildWordDiffLines(original, modified));
        }

        sendJson(exchange, 200, objectMapper.writeValueAsString(response));
    }

    private static List<Map<String, String>> buildDiffList(String original, String modified) {
        return diffComputer.computeDiffAsMap(original, modified);
    }

    /**
     * 单次变更的词级 diff（行内精确变更标记）：
     * 返回按行组织的 {old, new} 词标记结构（type ∈ equal/delete / equal/insert），
     * 前端按已算好的行号（removed 旧行号 / added 新行号）直接索引。
     */
    private static Map<String, Object> buildWordDiffLines(String original, String modified) {
        return diffComputer.computeWordDiffLines(original, modified);
    }

    private void handleRollback(HttpExchange exchange) throws IOException {
        String body = new BufferedReader(
            new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))
            .lines().collect(Collectors.joining());

        logger.debug("Rollback request body: {}", body);

        JsonNode json = objectMapper.readTree(body);
        String filePath = json.has("filePath") ? json.get("filePath").asText() : null;
        String toolCallId = json.has("toolCallId") ? json.get("toolCallId").asText() : null;
        if (filePath == null || filePath.trim().isEmpty()) {
            sendJson(exchange, 400, objectMapper.writeValueAsString(Map.of("error", "Missing or invalid filePath")));
            return;
        }

        logger.info("执行文件回滚: filePath={}, toolCallId={}", filePath, toolCallId);
        
        boolean success;
        if (toolCallId != null && !toolCallId.isEmpty()) {
            success = FileChangeTracker.rollbackByToolCallId(filePath, toolCallId);
        } else {
            success = FileChangeTracker.rollback(filePath);
        }
        
        if (!success) {
            String absolutePath = Path.of(filePath).toAbsolutePath().normalize().toString();
            if (!absolutePath.equals(filePath)) {
                logger.info("尝试使用绝对路径回滚: absolutePath={}", absolutePath);
                if (toolCallId != null && !toolCallId.isEmpty()) {
                    success = FileChangeTracker.rollbackByToolCallId(absolutePath, toolCallId);
                } else {
                    success = FileChangeTracker.rollback(absolutePath);
                }
            }
        }
        
        if (success) {
            logger.info("文件回滚成功: filePath={}, toolCallId={}", filePath, toolCallId);
            sendJson(exchange, 200, objectMapper.writeValueAsString(Map.of("success", true, "message", "文件已恢复")));
        } else {
            logger.warn("文件回滚失败: filePath={}, toolCallId={}", filePath, toolCallId);
            sendJson(exchange, 404, objectMapper.writeValueAsString(Map.of("success", false, "error", "未找到可恢复的版本")));
        }
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
