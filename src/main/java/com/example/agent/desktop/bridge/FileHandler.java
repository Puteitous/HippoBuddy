package com.example.agent.desktop.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefQueryCallback;
import org.cef.handler.CefMessageRouterHandlerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;

/**
 * 文件系统操作 Bridge Handler — 处理前端发起的文件 CRUD 和目录浏览请求。
 *
 * <p>
 * 无状态，不需要构造函数参数。
 * 通过 onQuery 的 action 名称分发到对应的处理方法。
 * </p>
 */
public class FileHandler extends CefMessageRouterHandlerAdapter {

    private static final Logger logger = LoggerFactory.getLogger(FileHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId,
                           String request, boolean persistent, CefQueryCallback callback) {
        try {
            JsonNode json = MAPPER.readTree(request);
            String action = json.has("action") ? json.get("action").asText() : "";

            switch (action) {
                case "readDir":
                    handleReadDir(json, callback);
                    return true;
                case "readFile":
                    handleReadFile(json, callback);
                    return true;
                case "writeFile":
                    handleWriteFile(json, callback);
                    return true;
                case "createFile":
                    handleCreateFile(json, callback);
                    return true;
                case "createDir":
                    handleCreateDir(json, callback);
                    return true;
                case "rename":
                    handleRename(json, callback);
                    return true;
                case "deleteFile":
                    handleDeleteFile(json, callback);
                    return true;
                case "showItemInFolder":
                    handleShowItemInFolder(json, callback);
                    return true;
                case "isDirectory":
                    handleIsDirectory(json, callback);
                    return true;
                default:
                    return false;
            }
        } catch (Exception e) {
            logger.error("FileHandler query failed", e);
            callback.failure(500, e.getMessage());
            return true;
        }
    }

    private void handleReadDir(JsonNode json, CefQueryCallback callback) throws Exception {
        String path = json.has("path") ? json.get("path").asText() : null;
        if (path == null || path.isBlank()) {
            callback.failure(400, "path is required");
            return;
        }
        Path dir = Paths.get(path);
        if (!Files.isDirectory(dir)) {
            callback.failure(404, "Directory not found: " + path);
            return;
        }
        ArrayNode entries = MAPPER.createArrayNode();
        Files.list(dir)
                .sorted((a, b) -> {
                    boolean aDir = Files.isDirectory(a);
                    boolean bDir = Files.isDirectory(b);
                    if (aDir != bDir) return aDir ? -1 : 1;
                    return a.getFileName().toString().compareToIgnoreCase(b.getFileName().toString());
                })
                .forEach(p -> {
                    ObjectNode entry = MAPPER.createObjectNode();
                    entry.put("name", p.getFileName().toString());
                    entry.put("isDirectory", Files.isDirectory(p));
                    try {
                        entry.put("size", Files.isDirectory(p) ? 0 : Files.size(p));
                    } catch (IOException e) {
                        entry.put("size", 0);
                    }
                    entries.add(entry);
                });

        ObjectNode result = MAPPER.createObjectNode();
        result.put("path", path);
        result.set("entries", entries);
        callback.success(MAPPER.writeValueAsString(result));
    }

    private void handleReadFile(JsonNode json, CefQueryCallback callback) throws Exception {
        String path = json.has("path") ? json.get("path").asText() : null;
        if (path == null || path.isBlank()) {
            callback.failure(400, "path is required");
            return;
        }
        Path file = Paths.get(path);
        if (!Files.isRegularFile(file)) {
            callback.failure(404, "File not found: " + path);
            return;
        }
        byte[] bytes = Files.readAllBytes(file);
        ObjectNode result = MAPPER.createObjectNode();
        result.put("path", path);
        result.put("content", Base64.getEncoder().encodeToString(bytes));
        result.put("encoding", "base64");
        callback.success(MAPPER.writeValueAsString(result));
    }

    private void handleWriteFile(JsonNode json, CefQueryCallback callback) throws Exception {
        String path = json.has("path") ? json.get("path").asText() : null;
        String content = json.has("content") ? json.get("content").asText() : null;
        if (path == null || path.isBlank()) {
            callback.failure(400, "path is required");
            return;
        }
        if (content == null) {
            callback.failure(400, "content is required");
            return;
        }

        // 解码 base64（对称于前端编码，确保增补字符/emoji 不损坏）
        String encoding = json.has("encoding") ? json.get("encoding").asText() : "";
        if ("base64".equals(encoding)) {
            byte[] bytes = Base64.getDecoder().decode(content);
            content = new String(bytes, StandardCharsets.UTF_8);
        }

        Path file = Paths.get(path);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
        ObjectNode result = MAPPER.createObjectNode();
        result.put("path", path);
        result.put("size", Files.size(file));
        callback.success(MAPPER.writeValueAsString(result));
    }

    private void handleCreateFile(JsonNode json, CefQueryCallback callback) throws Exception {
        String path = json.has("path") ? json.get("path").asText() : null;
        if (path == null || path.isBlank()) {
            callback.failure(400, "path is required");
            return;
        }
        Path file = Paths.get(path);
        if (Files.exists(file)) {
            callback.failure(409, "File already exists: " + path);
            return;
        }
        Files.createDirectories(file.getParent());
        Files.createFile(file);
        ObjectNode result = MAPPER.createObjectNode();
        result.put("path", path);
        callback.success(MAPPER.writeValueAsString(result));
    }

    private void handleCreateDir(JsonNode json, CefQueryCallback callback) throws Exception {
        String path = json.has("path") ? json.get("path").asText() : null;
        if (path == null || path.isBlank()) {
            callback.failure(400, "path is required");
            return;
        }
        Path dir = Paths.get(path);
        if (Files.exists(dir)) {
            callback.failure(409, "Directory already exists: " + path);
            return;
        }
        Files.createDirectories(dir);
        ObjectNode result = MAPPER.createObjectNode();
        result.put("path", path);
        callback.success(MAPPER.writeValueAsString(result));
    }

    private void handleRename(JsonNode json, CefQueryCallback callback) throws Exception {
        String oldPath = json.has("oldPath") ? json.get("oldPath").asText() : null;
        String newPath = json.has("newPath") ? json.get("newPath").asText() : null;
        if (oldPath == null || oldPath.isBlank() || newPath == null || newPath.isBlank()) {
            callback.failure(400, "oldPath and newPath are required");
            return;
        }
        Path source = Paths.get(oldPath);
        if (!Files.exists(source)) {
            callback.failure(404, "Source not found: " + oldPath);
            return;
        }
        Path target = Paths.get(newPath);
        if (Files.exists(target)) {
            callback.failure(409, "Target already exists: " + newPath);
            return;
        }
        Files.createDirectories(target.getParent());
        Files.move(source, target);
        ObjectNode result = MAPPER.createObjectNode();
        result.put("oldPath", oldPath);
        result.put("newPath", newPath);
        callback.success(MAPPER.writeValueAsString(result));
    }

    private void handleDeleteFile(JsonNode json, CefQueryCallback callback) throws Exception {
        String path = json.has("path") ? json.get("path").asText() : null;
        if (path == null || path.isBlank()) {
            callback.failure(400, "path is required");
            return;
        }
        Path target = Paths.get(path);
        if (!Files.exists(target)) {
            callback.failure(404, "Not found: " + path);
            return;
        }
        if (Files.isDirectory(target)) {
            // 只删除空目录，避免误删大量文件
            try (var stream = Files.list(target)) {
                if (stream.findAny().isPresent()) {
                    callback.failure(400, "Directory is not empty: " + path);
                    return;
                }
            }
            Files.delete(target);
        } else {
            Files.delete(target);
        }
        ObjectNode result = MAPPER.createObjectNode();
        result.put("path", path);
        callback.success(MAPPER.writeValueAsString(result));
    }

    private void handleShowItemInFolder(JsonNode json, CefQueryCallback callback) {
        try {
            String path = json.has("path") ? json.get("path").asText() : null;
            if (path == null || path.isBlank()) {
                callback.failure(400, "Missing path parameter");
                return;
            }
            // Windows: explorer /select 会选中文件并打开所在文件夹
            // 如果是目录，直接打开目录本身
            String cmd = "explorer /select,\"" + path.replace("/", "\\") + "\"";
            Runtime.getRuntime().exec(cmd);
            callback.success("{}");
        } catch (Exception e) {
            logger.error("打开文件所在目录失败", e);
            callback.failure(500, e.getMessage());
        }
    }

    private void handleIsDirectory(JsonNode json, CefQueryCallback callback) {
        try {
            String path = json.has("path") ? json.get("path").asText() : null;
            if (path == null || path.isBlank()) {
                callback.failure(400, "Missing path parameter");
                return;
            }
            Path target = Paths.get(path);
            ObjectNode result = MAPPER.createObjectNode();
            result.put("exists", Files.exists(target));
            result.put("isDirectory", Files.isDirectory(target));
            callback.success(MAPPER.writeValueAsString(result));
        } catch (Exception e) {
            logger.error("isDirectory 查询失败", e);
            callback.failure(500, e.getMessage());
        }
    }
}
