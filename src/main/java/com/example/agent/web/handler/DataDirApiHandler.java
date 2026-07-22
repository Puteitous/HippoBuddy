package com.example.agent.web.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

/**
 * 数据目录 API — 查询/修改 .hippo 数据目录路径。
 * <p>
 * 挂载路径：/api/settings/data-dir
 * <p>
 * 端点：
 *   GET  /api/settings/data-dir  → 当前数据目录 { path, isDefault }
 *   POST /api/settings/data-dir  → 设置新路径 { path }，复制数据后写配置
 * </p>
 *
 * <p>
 * 配置持久化：写入 {@code {hippo.userdata.root}/data-dir.conf}，
 * Electron 端下次启动时会读取此文件。
 * </p>
 */
public class DataDirApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(DataDirApiHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        try {
            String method = exchange.getRequestMethod();
            switch (method) {
                case "GET" -> handleGet(exchange);
                case "POST" -> handlePost(exchange);
                default -> sendError(exchange, 405, "Method Not Allowed");
            }
        } catch (Exception e) {
            logger.error("DataDirApiHandler 处理失败", e);
            sendError(exchange, 500, e.getMessage());
        }
    }

    /** GET — 返回当前数据目录信息 */
    private void handleGet(HttpExchange exchange) throws IOException {
        String currentDataDir = System.getProperty("hippo.data.dir");
        String userDataRoot = System.getProperty("hippo.userdata.root");

        boolean isDefault = true;
        if (currentDataDir != null && userDataRoot != null) {
            // 如果当前路径 = {userDataRoot}/.hippo，则视为默认
            Path defaultPath = Paths.get(userDataRoot).resolve(".hippo").normalize();
            Path currentPath = Paths.get(currentDataDir).normalize();
            isDefault = defaultPath.equals(currentPath);
        }

        ObjectNode node = MAPPER.createObjectNode();
        node.put("path", currentDataDir != null ? currentDataDir : "");
        node.put("isDefault", isDefault);
        sendJson(exchange, 200, node);
    }

    /** POST — 修改数据目录（复制数据 + 写配置） */
    private void handlePost(HttpExchange exchange) throws IOException {
        byte[] reqBytes = exchange.getRequestBody().readAllBytes();
        JsonNode json = MAPPER.readTree(reqBytes);

        String newPathStr = json.has("path") ? json.get("path").asText() : null;
        if (newPathStr == null || newPathStr.isBlank()) {
            sendError(exchange, 400, "path 不能为空");
            return;
        }

        Path newPath = Paths.get(newPathStr).toAbsolutePath().normalize();
        String currentDataDir = System.getProperty("hippo.data.dir");
        String userDataRoot = System.getProperty("hippo.userdata.root");

        if (currentDataDir == null) {
            sendError(exchange, 500, "hippo.data.dir 系统属性未设置");
            return;
        }
        if (userDataRoot == null) {
            sendError(exchange, 500, "hippo.userdata.root 系统属性未设置");
            return;
        }

        Path currentPath = Paths.get(currentDataDir).normalize();

        // 不允许设为和当前一样
        if (newPath.equals(currentPath)) {
            sendError(exchange, 400, "新路径与当前路径相同");
            return;
        }

        // 检查当前数据目录是否存在
        if (!Files.exists(currentPath)) {
            sendError(exchange, 400, "当前数据目录不存在: " + currentPath);
            return;
        }

        // 检查新路径是否被占用
        if (Files.exists(newPath)) {
            if (Files.isDirectory(newPath) && isDirectoryEmpty(newPath)) {
                logger.info("目标路径为空目录，允许使用: {}", newPath);
            } else {
                sendError(exchange, 400, "目标路径已存在且非空，请选择空目录: " + newPath);
                return;
            }
        }

        try {
            // 创建父目录
            if (newPath.getParent() != null) {
                Files.createDirectories(newPath.getParent());
            }

            // 复制数据（使用复制而非移动，确保失败时原数据完好）
            logger.info("正在复制数据目录: {} → {}", currentPath, newPath);
            copyDirectory(currentPath, newPath);
            logger.info("数据目录复制完成");

            // 写入配置到 Electron userData 根目录（持久化，不受数据目录影响）
            Path configFile = Paths.get(userDataRoot, "data-dir.conf");
            Files.createDirectories(configFile.getParent());
            Files.writeString(configFile, newPath.toString(), StandardCharsets.UTF_8);
            logger.info("已写入 data-dir.conf: {}", configFile);

            ObjectNode resp = MAPPER.createObjectNode();
            resp.put("success", true);
            resp.put("path", newPath.toString());
            sendJson(exchange, 200, resp);

            logger.info("数据目录已变更，重启后生效: {}", newPath);
        } catch (IOException e) {
            logger.error("数据目录迁移失败", e);
            sendError(exchange, 500, "数据迁移失败: " + e.getMessage());
        }
    }

    /** 检查目录是否为空 */
    private static boolean isDirectoryEmpty(Path dir) throws IOException {
        try (var stream = Files.list(dir)) {
            return stream.findAny().isEmpty();
        }
    }

    /** 递归复制目录内容 */
    private static void copyDirectory(Path source, Path target) throws IOException {
        try (var stream = Files.walk(source)) {
            stream.forEach(src -> {
                Path dest = target.resolve(source.relativize(src));
                try {
                    if (Files.isDirectory(src)) {
                        Files.createDirectories(dest);
                    } else {
                        Files.copy(src, dest, StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (IOException e) {
                    throw new RuntimeException("复制失败: " + src + " → " + dest, e);
                }
            });
        }
    }

    // ===== 工具方法 =====

    private static void sendJson(HttpExchange exchange, int status, ObjectNode node) throws IOException {
        byte[] bytes = MAPPER.writeValueAsBytes(node);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static void sendError(HttpExchange exchange, int status, String msg) throws IOException {
        ObjectNode err = MAPPER.createObjectNode();
        err.put("error", msg);
        sendJson(exchange, status, err);
    }
}
