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
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * 技能管理 API（GET /api/skills/list, GET /api/skills/get,
 * POST /api/skills/create, POST /api/skills/save,
 * POST /api/skills/delete, POST /api/skills/reload,
 * POST /api/skills/import）。
 * <p>
 * GET /list    — 返回当前工作区下所有可用的技能文件，区分项目级和用户级。
 * GET /get     — 读取单个技能文件内容（?filePath=xxx）。
 * POST create  — 创建新的技能文件，支持 project/user 两种作用域。
 * POST save    — 保存编辑后的技能文件内容。
 * POST delete  — 删除指定技能文件。
 * POST reload  — 触发 SkillManager 重新加载。
 * POST import   — 从 URL（后端代拉，规避 CORS）或本地内容导入技能：单个 .md（扁平）或 .zip（压缩包，可含目录技能）。
 * </p>
 */
public class SkillsApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(SkillsApiHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 导入 URL 拉取超时（秒） */
    private static final int IMPORT_TIMEOUT_SECONDS = 8;
    /** 纯文本（.md）导入内容体积上限（字节） */
    private static final long IMPORT_MAX_BYTES = 1024 * 1024;
    /** 压缩包导入体积上限（字节） */
    private static final long IMPORT_MAX_ZIP_BYTES = 50L * 1024 * 1024;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(IMPORT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(IMPORT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(IMPORT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .followRedirects(true)
            .build();

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
            } else if ("POST".equals(method) && path.endsWith("/import")) {
                handleImport(exchange);
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
            node.put("skillId", skill.getSkillId());
            node.put("isDirectory", skill.isDirectorySkill());
            node.put("name", skill.getName());
            node.put("description", skill.getDescription());
            node.put("fileName", skill.getFileName());
            node.put("filePath", skill.getFilePath());

            // 目录技能附带资源（只读浏览用；内容按需经 /api/skills/get 读取）
            if (skill.isDirectorySkill()) {
                ArrayNode resources = MAPPER.createArrayNode();
                Path skillRoot = Path.of(skill.getRootDir());
                for (String relative : SkillLoader.listResources(skill)) {
                    ObjectNode res = MAPPER.createObjectNode();
                    res.put("path", relative);
                    res.put("filePath", skillRoot.resolve(relative).toAbsolutePath().normalize().toString());
                    resources.add(res);
                }
                node.set("resources", resources);
            }

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
        // 目录形态技能：入口固定为 <dir>/SKILL.md，只改写内容，不做重命名
        boolean directory = json.has("directory") && json.get("directory").asBoolean(false);

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

        Path targetFile;
        if (directory) {
            // 目录技能：入口文件就地改写，保持 <dir>/SKILL.md 位置不变
            targetFile = oldFile;
        } else {
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

            targetFile = targetDir.resolve(fileName);

            // 如果目标文件已存在且不是当前文件本身，报错
            if (Files.exists(targetFile) && !targetFile.toAbsolutePath().normalize().equals(oldFile.toAbsolutePath().normalize())) {
                sendJson(exchange, 400, "{\"success\":false,\"message\":\"目标文件已存在: " + fileName + "\"}");
                return;
            }
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
        // 目录形态技能：删除整个技能目录
        boolean directory = json.has("directory") && json.get("directory").asBoolean(false);

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

        Path skillDir = null;
        if (directory) {
            // 递归删除前先确认：入口必须名为 SKILL.md，且其父目录就是某个技能根目录下的技能目录
            skillDir = resolveSkillDirForDelete(targetFile);
            if (skillDir == null) {
                sendJson(exchange, 400, "{\"success\":false,\"message\":\"非法的目录技能路径\"}");
                return;
            }
        }

        try {
            if (skillDir != null) {
                deleteRecursively(skillDir);
                logger.info("目录技能已删除: {}", skillDir);
            } else {
                Files.delete(targetFile);
                logger.info("技能文件已删除: {}", targetFile);
            }
        } catch (IOException e) {
            logger.error("删除技能失败: {}", targetFile, e);
            sendJson(exchange, 500, "{\"success\":false,\"message\":\"删除失败\"}");
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

    /**
     * 导入技能，支持两种形态：
     * <ul>
     *   <li><b>单个 .md</b> → 扁平技能（正文经规范化后落盘）</li>
     *   <li><b>.zip 压缩包</b> → 可含目录技能（{@code <name>/SKILL.md} + 同目录资源），整目录落盘</li>
     * </ul>
     * 请求体（JSON，三选一来源）：
     * <pre>
     * {
     *   "url":         "https://.../x.md",   // URL 由后端代拉，规避前端 CORS；指向 zip 时按压缩包处理
     *   "content":     "---\nname: ...",     // 从本地 .md 读取后的原始文本
     *   "zipBase64":   "UEsDBBQ...",         // 从本地 .zip 读取后的 base64
     *   "fileName":    "x.md",               // 可选，content 来源无 Frontmatter 时用于推导技能名
     *   "scope":       "user",               // 可选，默认 user；否则项目级
     *   "name":        "自定义名",            // 可选（仅 .md 生效），显式覆盖
     *   "description": "自定义描述",          // 可选（仅 .md 生效）
     *   "overwrite":   false                 // 可选，目标已存在时是否覆盖（zip 覆盖会替换同名技能，含形态变更）
     * }
     * </pre>
     * .md：落盘内容统一规范为 Frontmatter(name/description) + 正文（剥离原 Frontmatter 后）。<br>
     * .zip：只取技能，忽略包内 {@code plugin.json}/{@code mcp.json}（装 MCP 请走插件市场）。<br>
     * 目标已存在且未指定 overwrite 时返回 409（前端据此询问是否覆盖）。
     * </p>
     */
    private void handleImport(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        JsonNode json = MAPPER.readTree(body);

        String url = json.has("url") ? json.get("url").asText().trim() : "";
        String rawContent = json.has("content") ? json.get("content").asText() : "";
        String zipBase64 = json.has("zipBase64") ? json.get("zipBase64").asText() : "";
        String fileNameHint = json.has("fileName") ? json.get("fileName").asText().trim() : "";
        String scope = json.has("scope") ? json.get("scope").asText().trim() : "user";
        String explicitName = json.has("name") ? json.get("name").asText().trim() : "";
        String explicitDesc = json.has("description") ? json.get("description").asText().trim() : "";
        boolean overwrite = json.has("overwrite") && json.get("overwrite").asBoolean(false);

        // 1. URL 来源：后端代拉（前端直连受 CORS 限制）；指向 zip 则按压缩包导入
        if (!url.isBlank()) {
            byte[] bytes;
            try {
                validateImportUrl(url);
                bytes = downloadSkillBytes(url);
            } catch (IOException e) {
                sendJson(exchange, 400, errJson("拉取技能失败: " + e.getMessage()));
                return;
            }
            if (fileNameHint.isBlank()) {
                fileNameHint = fileNameFromUrl(url);
            }
            if (isZip(bytes)) {
                handleZipImport(exchange, bytes, scope, overwrite);
                return;
            }
            if (bytes.length > IMPORT_MAX_BYTES) {
                sendJson(exchange, 400, errJson("文件过大(超过 " + (IMPORT_MAX_BYTES / 1024) + "KB)"));
                return;
            }
            rawContent = new String(bytes, StandardCharsets.UTF_8);
        } else if (!zipBase64.isBlank()) {
            // 2. 本地压缩包：前端读成 base64 上送
            byte[] bytes;
            try {
                bytes = Base64.getDecoder().decode(zipBase64);
            } catch (IllegalArgumentException e) {
                sendJson(exchange, 400, errJson("压缩包内容不是合法的 Base64"));
                return;
            }
            if (!isZip(bytes)) {
                sendJson(exchange, 400, errJson("不是有效的 zip 压缩包"));
                return;
            }
            handleZipImport(exchange, bytes, scope, overwrite);
            return;
        }

        if (rawContent == null || rawContent.isBlank()) {
            sendJson(exchange, 400, errJson("未提供技能内容、URL 或压缩包"));
            return;
        }

        // 2. 解析技能名与描述：显式入参 > Frontmatter > 文件名
        SkillLoader.Frontmatter fm = SkillLoader.parseFrontmatter(rawContent);
        String name = !explicitName.isBlank()
                ? explicitName
                : (fm.name() != null && !fm.name().isBlank() ? fm.name() : "");
        if (name.isBlank()) {
            name = stripMdSuffix(fileNameHint);
        }
        if (name.isBlank()) {
            name = "imported-skill";
        }
        String description = !explicitDesc.isBlank()
                ? explicitDesc
                : (fm.description() != null ? fm.description() : "");

        // 3. 目标目录与文件名
        Path targetDir = resolveTargetDir(scope, exchange, "导入");
        if (targetDir == null) {
            return;
        }
        try {
            Files.createDirectories(targetDir);
        } catch (IOException e) {
            logger.error("创建技能目录失败: {}", targetDir, e);
            sendJson(exchange, 500, errJson("创建目录失败"));
            return;
        }

        String fileName = name.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (!fileName.endsWith(".md")) {
            fileName = fileName + ".md";
        }
        Path targetFile = targetDir.resolve(fileName);

        // 同名目录技能存在 → 拒绝：落盘扁平 .md 会与目录技能撞 skillId，
        // 而扫描时目录形态优先，该 .md 将永不生效（覆盖也无意义，故不提供 overwrite）
        String skillId = stripMdSuffix(fileName);
        Path existingDir = targetDir.resolve(skillId);
        if (Files.isDirectory(existingDir) && Files.exists(existingDir.resolve(SkillLoader.ENTRY_FILE_NAME))) {
            sendJson(exchange, 400, errJson("已存在同名目录技能「" + skillId + "」，请先删除或改用其它名称"));
            return;
        }

        if (Files.exists(targetFile) && !overwrite) {
            sendJson(exchange, 409, errJson("技能已存在: " + fileName));
            return;
        }

        // 4. 规范化写入：Frontmatter(name/description) + 正文
        String bodyContent = SkillLoader.stripFrontmatter(rawContent);
        StringBuilder fileContent = new StringBuilder();
        fileContent.append("---\n");
        fileContent.append("name: ").append(name).append("\n");
        if (!description.isBlank()) {
            fileContent.append("description: ").append(description).append("\n");
        }
        fileContent.append("---\n\n");
        if (!bodyContent.isBlank()) {
            fileContent.append(bodyContent);
            if (!bodyContent.endsWith("\n")) {
                fileContent.append("\n");
            }
        }

        try {
            Files.writeString(targetFile, fileContent, StandardCharsets.UTF_8);
            logger.info("技能文件已导入: {}", targetFile);
        } catch (IOException e) {
            logger.error("写入技能文件失败: {}", targetFile, e);
            sendJson(exchange, 500, errJson("写入文件失败"));
            return;
        }

        reloadSkills();

        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("success", true);
        resp.put("message", "技能已导入");
        resp.put("name", name);
        resp.put("description", description);
        resp.put("filePath", targetFile.toAbsolutePath().normalize().toString());
        sendJson(exchange, 201, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
    }

    /** 校验导入 URL：仅允许 http/https 且含主机名（挡 file:// 等） */
    private static void validateImportUrl(String url) throws IOException {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new IOException("非法的 URL");
        }
        String scheme = uri.getScheme();
        if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            throw new IOException("仅支持 http/https 协议");
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IOException("URL 缺少主机名");
        }
    }

    /**
     * 下载远程内容原始字节。
     * <p>
     * 体积上限按压缩包上限放宽（可能是 zip），纯文本的 1MB 限制由调用方在判定形态后再施加。
     */
    private byte[] downloadSkillBytes(String url) throws IOException {
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", "HippoBuddy-Python/1.0 (skill-import)")
                .header("Accept", "text/markdown, application/zip, text/plain, */*")
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("HTTP " + response.code() + " " + response.message());
            }
            ResponseBody responseBody = response.body();
            if (responseBody == null) {
                throw new IOException("响应内容为空");
            }
            if (responseBody.contentLength() > IMPORT_MAX_ZIP_BYTES) {
                throw new IOException("文件过大(超过 " + (IMPORT_MAX_ZIP_BYTES / 1024 / 1024) + "MB)");
            }
            byte[] bytes = responseBody.bytes();
            if (bytes.length == 0) {
                throw new IOException("远程内容为空");
            }
            if (bytes.length > IMPORT_MAX_ZIP_BYTES) {
                throw new IOException("文件过大(超过 " + (IMPORT_MAX_ZIP_BYTES / 1024 / 1024) + "MB)");
            }
            return bytes;
        }
    }

    /** 是否为 zip：校验本地文件头魔数（PK\x03\x04 普通包 / PK\x05\x06 空包） */
    private static boolean isZip(byte[] bytes) {
        return bytes.length >= 4
                && bytes[0] == 'P' && bytes[1] == 'K'
                && ((bytes[2] == 3 && bytes[3] == 4) || (bytes[2] == 5 && bytes[3] == 6));
    }

    /**
     * 从压缩包导入技能：解包 → 定位技能 → 落盘（整目录）。
     * <p>
     * 只取技能，忽略包内 {@code plugin.json} / {@code mcp.json}。同名技能按 {@code overwrite}
     * 决定「409 待确认」还是「替换」；替换会连同形态一并替换（同名目录 ↔ 同名扁平）。</p>
     */
    private void handleZipImport(HttpExchange exchange, byte[] zipBytes, String scope, boolean overwrite)
            throws IOException {
        Path targetDir = resolveTargetDir(scope, exchange, "导入");
        if (targetDir == null) {
            return;
        }

        Path tempDir = null;
        try {
            tempDir = Files.createTempDirectory("hippo-skill-import-");
            ZipPackageUtils.extractZip(zipBytes, tempDir);

            Path skillsSource = locateSkillsSource(tempDir);
            List<Path> entries = skillsSource == null ? List.of() : listSkillEntries(skillsSource);
            if (entries.isEmpty()) {
                sendJson(exchange, 400, errJson("压缩包中未找到技能（需为 <name>.md 或 <name>/SKILL.md）"));
                return;
            }

            // 同名冲突：未指定 overwrite 时交前端确认
            if (!overwrite) {
                List<String> conflicts = new ArrayList<>();
                for (Path entry : entries) {
                    String skillId = skillIdOf(entry);
                    if (skillExists(targetDir, skillId)) {
                        conflicts.add(skillId);
                    }
                }
                if (!conflicts.isEmpty()) {
                    sendJson(exchange, 409, errJson("技能已存在: " + String.join(", ", conflicts)));
                    return;
                }
            }

            Files.createDirectories(targetDir);
            ArrayNode installed = MAPPER.createArrayNode();
            for (Path entry : entries) {
                installed.add(installZipSkillEntry(entry, targetDir));
            }

            reloadSkills();

            ObjectNode resp = MAPPER.createObjectNode();
            resp.put("success", true);
            resp.put("message", "技能已导入");
            resp.put("count", installed.size());
            resp.set("skills", installed);
            sendJson(exchange, 201, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(resp));
        } catch (IllegalArgumentException e) {
            sendJson(exchange, 400, errJson("导入失败: " + e.getMessage()));
        } finally {
            if (tempDir != null) {
                ZipPackageUtils.deleteRecursively(tempDir);
            }
        }
    }

    /** 落盘单个技能条目（扁平 .md 或目录技能），返回摘要；同名先按形态清理再写入 */
    private ObjectNode installZipSkillEntry(Path entry, Path targetDir) throws IOException {
        String skillId = skillIdOf(entry);
        boolean directory = Files.isDirectory(entry);
        ObjectNode node = MAPPER.createObjectNode();
        node.put("skillId", skillId);
        node.put("isDirectory", directory);

        // 同名不同形态时先清掉旧形态，避免「目录优先」让新写入的扁平文件失效
        Path sameIdDir = targetDir.resolve(skillId);
        Path sameIdFile = targetDir.resolve(skillId + ".md");
        if (directory) {
            Files.deleteIfExists(sameIdFile);
            if (Files.exists(sameIdDir)) {
                ZipPackageUtils.deleteRecursively(sameIdDir);
            }
            Files.createDirectories(sameIdDir);
            node.put("bytes", ZipPackageUtils.copySkillTree(entry, sameIdDir));
            node.put("path", sameIdDir.toAbsolutePath().normalize().toString());
        } else {
            if (Files.isDirectory(sameIdDir)) {
                ZipPackageUtils.deleteRecursively(sameIdDir);
            }
            Files.copy(entry, sameIdFile, StandardCopyOption.REPLACE_EXISTING);
            node.put("path", sameIdFile.toAbsolutePath().normalize().toString());
        }
        return node;
    }

    /** 目标下是否已存在同名技能（扁平文件或目录形态） */
    private static boolean skillExists(Path targetDir, String skillId) {
        return Files.isDirectory(targetDir.resolve(skillId))
                || Files.exists(targetDir.resolve(skillId + ".md"));
    }

    /**
     * 定位压缩包内技能所在目录，兼容三种常见结构：
     * <ol>
     *   <li>顶层即为技能（{@code <name>.md} / {@code <name>/SKILL.md}）</li>
     *   <li>技能在 {@code skills/} 下（标准插件包布局）</li>
     *   <li>顶层被包裹目录包住（如 {@code xxx-main/}）→ 向下探最多 3 层</li>
     * </ol>
     *
     * @return 技能所在目录；找不到返回 null
     */
    private static Path locateSkillsSource(Path root) throws IOException {
        Path current = root;
        for (int depth = 0; depth < 3; depth++) {
            Path skillsSub = current.resolve("skills");
            if (Files.isDirectory(skillsSub)) {
                return skillsSub;
            }
            if (!listSkillEntries(current).isEmpty()) {
                return current;
            }
            Path next = null;
            try (Stream<Path> stream = Files.list(current)) {
                for (Path child : stream.sorted().toList()) {
                    if (Files.isDirectory(child)
                            && (Files.isDirectory(child.resolve("skills"))
                                    || !listSkillEntries(child).isEmpty())) {
                        next = child;
                        break;
                    }
                }
            }
            if (next == null) {
                return null;
            }
            current = next;
        }
        return null;
    }

    /** 列出目录一层的技能条目：扁平 {@code <name>.md} 与含 SKILL.md 的目录（按名排序） */
    private static List<Path> listSkillEntries(Path dir) throws IOException {
        if (dir == null || !Files.isDirectory(dir)) {
            return List.of();
        }
        List<Path> entries = new ArrayList<>();
        try (Stream<Path> stream = Files.list(dir)) {
            for (Path child : stream.sorted().toList()) {
                String name = child.getFileName().toString();
                if (Files.isRegularFile(child) && name.endsWith(".md")) {
                    entries.add(child);
                } else if (Files.isDirectory(child) && Files.exists(child.resolve(SkillLoader.ENTRY_FILE_NAME))) {
                    entries.add(child);
                }
            }
        }
        return entries;
    }

    /** 技能条目的 skillId：扁平去 .md 后缀，目录取目录名 */
    private static String skillIdOf(Path entry) {
        String name = entry.getFileName().toString();
        return Files.isDirectory(entry) ? name : stripMdSuffix(name);
    }

    /** 取 URL 路径最后一段作为文件名提示（可能为空） */
    private static String fileNameFromUrl(String url) {
        try {
            String pathStr = URI.create(url).getPath();
            if (pathStr == null || pathStr.isBlank()) {
                return "";
            }
            int slash = pathStr.lastIndexOf('/');
            return slash >= 0 ? pathStr.substring(slash + 1) : pathStr;
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    /** 去掉 .md 后缀（不区分大小写） */
    private static String stripMdSuffix(String name) {
        return name != null && name.toLowerCase().endsWith(".md")
                ? name.substring(0, name.length() - 3)
                : (name == null ? "" : name);
    }

    /**
     * 解析技能写入目录：scope=user → 用户级；否则项目级（需已设工作区）。
     * 失败时已写出错误响应并返回 null。
     */
    private Path resolveTargetDir(String scope, HttpExchange exchange, String action) throws IOException {
        if ("user".equals(scope)) {
            return WorkspaceManager.getUserSkillsDir();
        }
        String workspacePath = WorkspaceContext.getCurrentFolder();
        if (workspacePath == null || workspacePath.isBlank()) {
            sendJson(exchange, 400, errJson("未设置工作区，无法" + action + "为项目级技能"));
            return null;
        }
        return Path.of(workspacePath).toAbsolutePath().normalize().resolve(".hippo").resolve("skills");
    }

    /** 触发 SkillManager 重新加载，使新技能即时生效 */
    private static void reloadSkills() {
        SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
        if (skillManager != null) {
            skillManager.reload();
        }
    }

    /** 构造 { success:false, message } 错误体 */
    private static String errJson(String message) {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("success", false);
        node.put("message", message);
        return node.toString();
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

    /**
     * 校验 targetFile 是否为合法的目录技能入口（{@code <skillsRoot>/<name>/SKILL.md}）。
     * <p>
     * 递归删除属破坏性操作，故不信任入参路径：入口文件名必须是 {@code SKILL.md}，
     * 且其祖父目录必须恰好是用户级或项目级技能根目录。
     *
     * @return 合法的技能目录；不合法返回 null
     */
    private Path resolveSkillDirForDelete(Path targetFile) {
        Path normalized = targetFile.toAbsolutePath().normalize();
        if (!SkillLoader.ENTRY_FILE_NAME.equals(normalized.getFileName().toString())) {
            return null;
        }
        Path skillDir = normalized.getParent();
        if (skillDir == null || !Files.isDirectory(skillDir)) {
            return null;
        }
        Path skillsRoot = skillDir.getParent();
        if (skillsRoot == null) {
            return null;
        }

        Path userRoot = WorkspaceManager.getUserSkillsDir().toAbsolutePath().normalize();
        String workspacePath = WorkspaceContext.getCurrentFolder();
        Path projectRoot = (workspacePath == null || workspacePath.isBlank())
                ? null
                : Path.of(workspacePath).toAbsolutePath().normalize().resolve(".hippo").resolve("skills");

        boolean allowed = skillsRoot.equals(userRoot)
                || (projectRoot != null && skillsRoot.equals(projectRoot));
        return allowed ? skillDir : null;
    }

    /** 递归删除目录（先子后父） */
    private void deleteRecursively(Path dir) throws IOException {
        try (Stream<Path> stream = Files.walk(dir)) {
            for (Path path : stream.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
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
