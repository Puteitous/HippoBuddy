package com.example.agent.web.handler;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.skill.SkillEntry;
import com.example.agent.domain.skill.SkillLoader;
import com.example.agent.domain.skill.SkillManager;
import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * 技能管理 API（GET /api/skills/list, GET /api/skills/get,
 * POST /api/skills/create, POST /api/skills/save,
 * POST /api/skills/delete, POST /api/skills/reload）。
 * <p>
 * GET /list    — 返回当前工作区下所有可用的技能文件，区分项目级和用户级。
 * GET /get     — 读取单个技能文件内容（?filePath=xxx）。
 * POST create  — 创建新的技能文件，支持 project/user 两种作用域。
 * POST save    — 保存编辑后的技能文件内容。
 * POST delete  — 删除指定技能文件。
 * POST reload  — 触发 SkillManager 重新加载。
 * </p>
 */
public class SkillsApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(SkillsApiHandler.class);
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

        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        try {
            if ("GET".equals(method) && path.endsWith("/list")) {
                handleList(exchange);
            } else if ("GET".equals(method) && path.endsWith("/get")) {
                handleGet(exchange);
            } else if ("POST".equals(method) && path.endsWith("/create")) {
                handleCreate(exchange);
            } else if ("POST".equals(method) && path.endsWith("/save")) {
                handleSave(exchange);
            } else if ("POST".equals(method) && path.endsWith("/update")) {
                handleUpdate(exchange);
            } else if ("POST".equals(method) && path.endsWith("/delete")) {
                handleDelete(exchange);
            } else if ("POST".equals(method) && path.endsWith("/reload")) {
                handleReload(exchange);
            } else {
                sendJson(exchange, 404, "{\"error\":\"Not found: " + path + "\"}");
            }
        } catch (Exception e) {
            logger.error("Skills API error", e);
            sendJson(exchange, 500, "{\"error\":\"Internal server error\"}");
        }
    }

    private void handleList(HttpExchange exchange) throws IOException {
        String workspacePath = WorkspaceContext.getCurrentFolder();
        List<SkillEntry> skills = SkillLoader.loadAllSkills(workspacePath);

        ObjectNode root = MAPPER.createObjectNode();
        ArrayNode projectArray = MAPPER.createArrayNode();
        ArrayNode userArray = MAPPER.createArrayNode();

        for (SkillEntry skill : skills) {
            ObjectNode node = MAPPER.createObjectNode();
            node.put("name", skill.getName());
            node.put("description", skill.getDescription());
            node.put("fileName", skill.getFileName());
            node.put("filePath", skill.getFilePath());

            if ("project".equals(skill.getSource())) {
                projectArray.add(node);
            } else {
                userArray.add(node);
            }
        }

        root.set("projectSkills", projectArray);
        root.set("userSkills", userArray);

        sendJson(exchange, 200, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(root));
    }

    private void handleCreate(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = MAPPER.readTree(body);

        String name = json.has("name") ? json.get("name").asText().trim() : "";
        String description = json.has("description") ? json.get("description").asText().trim() : "";
        String scope = json.has("scope") ? json.get("scope").asText().trim() : "project";
        String content = json.has("content") ? json.get("content").asText() : "";

        if (name.isBlank()) {
            sendJson(exchange, 400, "{\"success\":false,\"message\":\"技能名称不能为空\"}");
            return;
        }

        // 确保文件名不含非法字符，不含 .md 后缀
        String fileName = name.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (!fileName.endsWith(".md")) {
            fileName = fileName + ".md";
        }

        // 确定目标目录
        Path targetDir;
        if ("user".equals(scope)) {
            targetDir = WorkspaceManager.getUserSkillsDir();
        } else {
            String workspacePath = WorkspaceContext.getCurrentFolder();
            if (workspacePath == null || workspacePath.isBlank()) {
                sendJson(exchange, 400, "{\"success\":false,\"message\":\"未设置工作区，无法创建项目级技能\"}");
                return;
            }
            targetDir = Path.of(workspacePath).toAbsolutePath().normalize()
                    .resolve(".hippo").resolve("skills");
        }

        try {
            Files.createDirectories(targetDir);
        } catch (IOException e) {
            logger.error("创建技能目录失败: {}", targetDir, e);
            sendJson(exchange, 500, "{\"success\":false,\"message\":\"创建目录失败\"}");
            return;
        }

        Path targetFile = targetDir.resolve(fileName);

        if (Files.exists(targetFile)) {
            sendJson(exchange, 400, "{\"success\":false,\"message\":\"技能文件已存在: " + fileName + "\"}");
            return;
        }

        // 构建技能文件内容
        StringBuilder fileContent = new StringBuilder();
        fileContent.append("---\n");
        fileContent.append("name: ").append(name).append("\n");
        if (!description.isBlank()) {
            fileContent.append("description: ").append(description).append("\n");
        }
        fileContent.append("---\n\n");
        if (!content.isBlank()) {
            fileContent.append(content).append("\n");
        }

        try {
            Files.writeString(targetFile, fileContent, StandardCharsets.UTF_8);
            logger.info("技能文件已创建: {}", targetFile);
        } catch (IOException e) {
            logger.error("写入技能文件失败: {}", targetFile, e);
            sendJson(exchange, 500, "{\"success\":false,\"message\":\"写入文件失败\"}");
            return;
        }

        // 触发 SkillManager 重新加载
        SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
        if (skillManager != null) {
            skillManager.reload();
        }

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        resp.put("message", "技能已创建");
        resp.put("filePath", targetFile.toAbsolutePath().normalize().toString());

        sendJson(exchange, 201, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
    }

    private void handleGet(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String filePath = null;
        if (query != null) {
            for (String param : query.split("&")) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2 && "filePath".equals(kv[0])) {
                    filePath = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                }
            }
        }

        if (filePath == null || filePath.isBlank()) {
            sendJson(exchange, 400, "{\"error\":\"Missing filePath parameter\"}");
            return;
        }

        Path file = Path.of(filePath);
        if (!Files.exists(file) || !Files.isRegularFile(file)) {
            sendJson(exchange, 404, "{\"error\":\"File not found\"}");
            return;
        }

        try {
            String content = Files.readString(file, StandardCharsets.UTF_8);
            ObjectNode resp = MAPPER.createObjectNode();
            resp.put("filePath", file.toAbsolutePath().normalize().toString());
            resp.put("content", content);
            sendJson(exchange, 200, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
        } catch (IOException e) {
            logger.error("读取技能文件失败: {}", filePath, e);
            sendJson(exchange, 500, "{\"error\":\"Failed to read file\"}");
        }
    }

    private void handleSave(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = MAPPER.readTree(body);

        String filePath = json.has("filePath") ? json.get("filePath").asText().trim() : "";
        String content = json.has("content") ? json.get("content").asText() : "";

        if (filePath.isBlank()) {
            sendJson(exchange, 400, "{\"success\":false,\"message\":\"filePath 不能为空\"}");
            return;
        }

        Path file = Path.of(filePath);
        if (!Files.exists(file) || !Files.isRegularFile(file)) {
            sendJson(exchange, 404, "{\"success\":false,\"message\":\"文件不存在\"}");
            return;
        }

        try {
            Files.writeString(file, content, StandardCharsets.UTF_8);
            logger.info("技能文件已保存: {}", file);
        } catch (IOException e) {
            logger.error("保存技能文件失败: {}", file, e);
            sendJson(exchange, 500, "{\"success\":false,\"message\":\"保存失败\"}");
            return;
        }

        // 触发 SkillManager 重新加载
        SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
        if (skillManager != null) {
            skillManager.reload();
        }

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        resp.put("message", "技能已保存");

        sendJson(exchange, 200, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
    }

    private void handleUpdate(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = MAPPER.readTree(body);

        String oldFilePath = json.has("filePath") ? json.get("filePath").asText().trim() : "";
        String name = json.has("name") ? json.get("name").asText().trim() : "";
        String description = json.has("description") ? json.get("description").asText().trim() : "";
        String scope = json.has("scope") ? json.get("scope").asText().trim() : "project";
        String content = json.has("content") ? json.get("content").asText() : "";

        if (oldFilePath.isBlank()) {
            sendJson(exchange, 400, "{\"success\":false,\"message\":\"filePath 不能为空\"}");
            return;
        }
        if (name.isBlank()) {
            sendJson(exchange, 400, "{\"success\":false,\"message\":\"技能名称不能为空\"}");
            return;
        }

        Path oldFile = Path.of(oldFilePath);
        if (!Files.exists(oldFile) || !Files.isRegularFile(oldFile)) {
            sendJson(exchange, 404, "{\"success\":false,\"message\":\"原文件不存在\"}");
            return;
        }

        // 从 content 中剥离 Frontmatter，只保留 body
        String bodyContent = SkillLoader.stripFrontmatter(content);

        // 构建新 Frontmatter + body
        StringBuilder newContent = new StringBuilder();
        newContent.append("---\n");
        newContent.append("name: ").append(name).append("\n");
        if (!description.isBlank()) {
            newContent.append("description: ").append(description).append("\n");
        }
        newContent.append("---\n\n");
        newContent.append(bodyContent);
        if (!bodyContent.endsWith("\n")) {
            newContent.append("\n");
        }

        // 确定新文件路径
        String fileName = name.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (!fileName.endsWith(".md")) {
            fileName = fileName + ".md";
        }

        Path targetDir;
        if ("user".equals(scope)) {
            targetDir = WorkspaceManager.getUserSkillsDir();
        } else {
            String workspacePath = WorkspaceContext.getCurrentFolder();
            if (workspacePath == null || workspacePath.isBlank()) {
                sendJson(exchange, 400, "{\"success\":false,\"message\":\"未设置工作区，无法保存为项目级技能\"}");
                return;
            }
            targetDir = Path.of(workspacePath).toAbsolutePath().normalize()
                    .resolve(".hippo").resolve("skills");
        }

        try {
            Files.createDirectories(targetDir);
        } catch (IOException e) {
            logger.error("创建技能目录失败: {}", targetDir, e);
            sendJson(exchange, 500, "{\"success\":false,\"message\":\"创建目录失败\"}");
            return;
        }

        Path targetFile = targetDir.resolve(fileName);

        // 如果目标文件已存在且不是当前文件本身，报错
        if (Files.exists(targetFile) && !targetFile.toAbsolutePath().normalize().equals(oldFile.toAbsolutePath().normalize())) {
            sendJson(exchange, 400, "{\"success\":false,\"message\":\"目标文件已存在: " + fileName + "\"}");
            return;
        }

        try {
            // 写入新路径
            Files.writeString(targetFile, newContent.toString(), StandardCharsets.UTF_8);
            // 如果路径变了，删除旧文件
            if (!targetFile.toAbsolutePath().normalize().equals(oldFile.toAbsolutePath().normalize())) {
                Files.deleteIfExists(oldFile);
                logger.info("技能文件已移动: {} → {}", oldFile, targetFile);
            } else {
                logger.info("技能文件已更新: {}", targetFile);
            }
        } catch (IOException e) {
            logger.error("写入技能文件失败: {}", targetFile, e);
            sendJson(exchange, 500, "{\"success\":false,\"message\":\"保存失败\"}");
            return;
        }

        // 触发 SkillManager 重新加载
        SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
        if (skillManager != null) {
            skillManager.reload();
        }

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        resp.put("message", "技能已更新");
        resp.put("filePath", targetFile.toAbsolutePath().normalize().toString());

        sendJson(exchange, 200, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
    }

    private void handleDelete(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = MAPPER.readTree(body);

        String filePath = json.has("filePath") ? json.get("filePath").asText().trim() : "";
        String scope = json.has("scope") ? json.get("scope").asText().trim() : "";
        String fileName = json.has("fileName") ? json.get("fileName").asText().trim() : "";

        Path targetFile = null;

        // 优先使用绝对路径
        if (!filePath.isBlank()) {
            Path p = Path.of(filePath);
            if (Files.exists(p)) {
                targetFile = p;
            }
        }

        // 备选：scope + fileName 定位
        if (targetFile == null && !fileName.isBlank()) {
            if ("user".equals(scope)) {
                targetFile = WorkspaceManager.getUserSkillsDir().resolve(fileName);
            } else {
                String workspacePath = WorkspaceContext.getCurrentFolder();
                if (workspacePath != null && !workspacePath.isBlank()) {
                    targetFile = Path.of(workspacePath).toAbsolutePath().normalize()
                            .resolve(".hippo").resolve("skills").resolve(fileName);
                }
            }
        }

        if (targetFile == null || !Files.exists(targetFile)) {
            sendJson(exchange, 404, "{\"success\":false,\"message\":\"技能文件不存在\"}");
            return;
        }

        try {
            Files.delete(targetFile);
            logger.info("技能文件已删除: {}", targetFile);
        } catch (IOException e) {
            logger.error("删除技能文件失败: {}", targetFile, e);
            sendJson(exchange, 500, "{\"success\":false,\"message\":\"删除文件失败\"}");
            return;
        }

        // 触发 SkillManager 重新加载
        SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
        if (skillManager != null) {
            skillManager.reload();
        }

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        resp.put("message", "技能已删除");

        sendJson(exchange, 200, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
    }

    private void handleReload(HttpExchange exchange) throws IOException {
        SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
        if (skillManager != null) {
            skillManager.reload();
        }

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        resp.put("message", "技能已重新加载");

        sendJson(exchange, 200, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
    }

    private void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        OutputStream os = exchange.getResponseBody();
        os.write(bytes);
        os.close();
    }
}
