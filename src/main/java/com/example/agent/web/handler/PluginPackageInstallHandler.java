package com.example.agent.web.handler;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.skill.SkillLoader;
import com.example.agent.domain.skill.SkillManager;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.mcp.config.McpConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 标准插件包安装端点(对齐 Agent Plugins 1.0 打包结构)。
 * <p>
 * POST /api/plugins/package/install
 * body: { "downloadUrl": "https://...", "scope": "user"|"project", "dryRun": false }  — downloadUrl 指向一个 zip 包
 * <p>
 * dryRun=true 时只解析并汇报将安装的技能,不落盘(供市场预览使用)。
 *
 * 包结构约定(与 Agent Plugins 1.0 对齐):
 * <pre>
 * my-plugin/
 * ├── plugin.json     { name, version, author, description }
 * ├── mcp.json        { id, name, type, command/url, args, env, auto_register_tools }  (可选)
 * └── skills/        多个技能:扁平 &lt;name&gt;.md 或目录 &lt;name&gt;/SKILL.md + 同目录资源        (可选)
 * </pre>
 *
 * 流程:下载 → 解压到临时目录(防路径穿越) → 解析 plugin.json / mcp.json →
 * <b>技能由本端点直接落盘</b>(整目录保留,含 scripts/、references/ 等资源) →
 * 返回 plugin.json 清单、mcp 配置与技能安装摘要,最后清理临时目录。
 * </p>
 * <p>
 * 边界说明:技能落盘收归后端(临时目录里本就有整棵树,越过 HTTP 传树得不偿失);
 * mcp 配置仍只解析不落盘,由前端写入 config.mcp.servers 并触发 /api/mcp/refresh 热连接。
 * 目标技能已存在时跳过并回报(不覆盖用户已有技能)。
 * </p>
 */
public class PluginPackageInstallHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(PluginPackageInstallHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final int TIMEOUT_SECONDS = 15;
    /** 下载上限 50MB */
    private static final long MAX_DOWNLOAD_BYTES = 50L * 1024 * 1024;
    /** 解包文件数上限 */
    private static final int MAX_ENTRIES = 200;
    /** 解包总量上限 100MB(防 zip 炸弹) */
    private static final long MAX_TOTAL_BYTES = 100L * 1024 * 1024;
    /** 单个技能文件大小上限 5MB */
    private static final long MAX_FILE_BYTES = 5L * 1024 * 1024;
    /** 单个技能目录落盘总量上限 20MB */
    private static final long MAX_SKILL_DIR_BYTES = 20L * 1024 * 1024;

    private final OkHttpClient httpClient;

    public PluginPackageInstallHandler() {
        this(new OkHttpClient.Builder()
                .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .followRedirects(true)
                .build());
    }

    // 包级可见,便于测试注入 mock HttpClient
    PluginPackageInstallHandler(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "POST, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, error("Method not allowed"));
            return;
        }

        Path tempDir = null;
        try {
            byte[] reqBytes = exchange.getRequestBody().readAllBytes();
            JsonNode json = MAPPER.readTree(reqBytes);
            String downloadUrl = json.has("downloadUrl") ? json.get("downloadUrl").asText().trim() : "";
            String scope = json.has("scope") ? json.get("scope").asText().trim() : "user";
            boolean dryRun = json.has("dryRun") && json.get("dryRun").asBoolean(false);
            if (downloadUrl.isEmpty()) {
                sendJson(exchange, 400, error("downloadUrl 不能为空"));
                return;
            }
            if (!isAllowedUrl(downloadUrl)) {
                sendJson(exchange, 400, error("downloadUrl 仅支持 https:// 或本地 http://localhost|127.0.0.1"));
                return;
            }

            // 1. 下载 zip
            byte[] zipBytes = downloadZip(downloadUrl);

            // 2. 解压到临时目录(防路径穿越)
            tempDir = Files.createTempDirectory("hippo-plugin-");
            extractZip(zipBytes, tempDir);

            // 3. 解析 plugin.json / mcp.json,并把技能(整目录)落盘
            ObjectNode result = parseAndInstall(tempDir, scope, dryRun);
            result.put("success", true);
            sendJson(exchange, 200, MAPPER.writeValueAsString(result));
        } catch (IllegalArgumentException e) {
            logger.warn("插件包解析被拒绝: {}", e.getMessage());
            sendJson(exchange, 400, error(e.getMessage()));
        } catch (Exception e) {
            logger.error("插件包安装解析失败", e);
            sendJson(exchange, 500, error(e.getMessage() == null ? String.valueOf(e) : e.getMessage()));
        } finally {
            if (tempDir != null) {
                deleteRecursively(tempDir);
            }
        }
    }

    /** 仅允许 https 或本地回环 http(用于本地测试) */
    private boolean isAllowedUrl(String url) {
        if (url.startsWith("https://")) {
            return true;
        }
        return url.startsWith("http://localhost")
                || url.startsWith("http://127.0.0.1")
                || url.startsWith("http://[::1]");
    }

    private byte[] downloadZip(String url) throws IOException {
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", "HippoBuddy-Python/1.0 (plugin-package)")
                .header("Accept", "application/zip, application/octet-stream, */*")
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("下载插件包失败: HTTP " + response.code() + " " + response.message());
            }
            byte[] bytes = response.body() != null ? response.body().bytes() : new byte[0];
            if (bytes.length == 0) {
                throw new IOException("插件包内容为空");
            }
            if (bytes.length > MAX_DOWNLOAD_BYTES) {
                throw new IllegalArgumentException("插件包超过大小上限(" + (MAX_DOWNLOAD_BYTES / 1024 / 1024) + "MB)");
            }
            return bytes;
        }
    }

    /** 解压 zip 到临时目录,严格防路径穿越 */
    private void extractZip(byte[] zipBytes, Path destRoot) throws IOException {
        long totalBytes = 0;
        int entryCount = 0;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                if (entryCount > MAX_ENTRIES) {
                    throw new IllegalArgumentException("插件包文件数超过上限(" + MAX_ENTRIES + ")");
                }

                if (entry.isDirectory()) {
                    continue;
                }

                String entryName = entry.getName();
                // 防路径穿越:拒绝绝对路径与 ../
                Path entryPath = Path.of(entryName);
                if (entryPath.isAbsolute() || entryName.contains("..")) {
                    throw new IllegalArgumentException("插件包包含非法路径: " + entryName);
                }

                Path target = destRoot.resolve(entryPath).normalize();
                if (!target.startsWith(destRoot)) {
                    throw new IllegalArgumentException("插件包路径越界: " + entryName);
                }

                // 限制单文件大小
                if (entry.getSize() > MAX_FILE_BYTES) {
                    throw new IllegalArgumentException("单个文件超过大小上限: " + entryName);
                }

                Files.createDirectories(target.getParent());
                long written = Files.copy(zis, target);
                if (written > MAX_FILE_BYTES) {
                    throw new IllegalArgumentException("单个文件超过大小上限("
                            + (MAX_FILE_BYTES / 1024 / 1024) + "MB): " + entryName);
                }
                totalBytes += written;
                if (totalBytes > MAX_TOTAL_BYTES) {
                    throw new IllegalArgumentException("插件包解压总量超过上限(" + (MAX_TOTAL_BYTES / 1024 / 1024) + "MB)");
                }
            }
        }
    }

    /** 解析包清单与 mcp 配置,并把 skills/ 下的技能落盘到目标目录(由 scope 指定);dryRun 只预览不落盘 */
    private ObjectNode parseAndInstall(Path root, String scope, boolean dryRun) throws IOException {
        // 兼容 zip 顶层包裹目录(如 codeload 下载的 xxx-main/):定位到含 plugin.json 的实际包根
        Path packageRoot = locatePackageRoot(root);
        if (packageRoot == null) {
            throw new IllegalArgumentException("插件包缺少 plugin.json");
        }

        ObjectNode result = MAPPER.createObjectNode();
        result.set("plugin", readPluginManifest(packageRoot));

        // mcp.json(可选):只解析,由前端写入 config.mcp.servers 并触发热连接
        JsonNode mcp = readMcpConfig(packageRoot);
        if (mcp != null) {
            result.set("mcp", mcp);
        }

        // skills(可选):整目录落盘(dryRun 时仅汇报)
        result.set("skills", installSkills(packageRoot, scope, dryRun));
        result.put("dryRun", dryRun);

        return result;
    }

    /** 读 plugin.json 清单(必须) */
    private ObjectNode readPluginManifest(Path packageRoot) throws IOException {
        JsonNode manifest = MAPPER.readTree(packageRoot.resolve("plugin.json").toFile());
        ObjectNode pluginNode = MAPPER.createObjectNode();
        pluginNode.put("name", textOr(manifest.get("name"), "unnamed-plugin"));
        pluginNode.put("version", textOr(manifest.get("version"), "0.0.0"));
        // author 可能是字符串或 { name, email } 对象
        JsonNode authorNode = manifest.get("author");
        if (authorNode != null && authorNode.isObject()) {
            pluginNode.put("author", textOr(authorNode.get("name"), ""));
        } else {
            pluginNode.put("author", textOr(authorNode, ""));
        }
        pluginNode.put("description", textOr(manifest.get("description"), ""));
        return pluginNode;
    }

    /**
     * 读 mcp.json(可选),返回 server 配置节点;不存在返回 null。
     * 兼容 {@code { mcp: {...} }} 包裹与裸配置两种形态。
     */
    private JsonNode readMcpConfig(Path packageRoot) throws IOException {
        Path mcpJson = packageRoot.resolve("mcp.json");
        if (!Files.exists(mcpJson)) {
            return null;
        }
        JsonNode mcpTree = MAPPER.readTree(mcpJson.toFile());
        JsonNode mcpBody = mcpTree.has("mcp") ? mcpTree.get("mcp") : mcpTree;
        McpConfig.McpServerConfig server = MAPPER.treeToValue(mcpBody, McpConfig.McpServerConfig.class);
        if (server.getId() == null || server.getId().isBlank()) {
            throw new IllegalArgumentException("mcp.json 缺少 server id");
        }
        return MAPPER.valueToTree(server);
    }

    /**
     * 把 {@code skills/} 下的技能落盘到目标技能目录(整目录保留)。
     * <p>
     * 兼容两种结构:扁平 {@code skills/<name>.md} 与目录 {@code skills/<name>/SKILL.md}(含同目录资源)。
     * 目标已存在同名技能时<b>跳过并回报</b>,不覆盖用户已有技能。
     */
    private ArrayNode installSkills(Path packageRoot, String scope, boolean dryRun) throws IOException {
        ArrayNode installed = MAPPER.createArrayNode();
        Path skillsDir = packageRoot.resolve("skills");
        if (!Files.isDirectory(skillsDir)) {
            return installed;
        }

        Path targetRoot = dryRun ? null : resolveSkillsTargetRoot(scope);

        try (var stream = Files.list(skillsDir)) {
            for (Path entry : stream.sorted().toList()) {
                String name = entry.getFileName().toString();
                boolean flat = Files.isRegularFile(entry) && name.endsWith(".md");
                boolean directory = Files.isDirectory(entry)
                        && Files.exists(entry.resolve(SkillLoader.ENTRY_FILE_NAME));
                if (!flat && !directory) {
                    continue;
                }
                String skillId = flat ? name.substring(0, name.length() - 3) : name;
                if (dryRun) {
                    // 预览:只汇报会安装什么,不落盘
                    installed.add(skillSummary(skillId, directory));
                } else if (flat) {
                    installed.add(installFlatSkill(entry, targetRoot, skillId, name));
                } else {
                    installed.add(installDirectorySkill(entry, targetRoot, skillId));
                }
            }
        }

        // 落盘后热重载技能列表,使新技能立即可用
        if (!dryRun && !installed.isEmpty()) {
            SkillManager skillManager = ServiceLocator.getOrNull(SkillManager.class);
            if (skillManager != null) {
                skillManager.reload();
            }
        }
        return installed;
    }

    /** 安装扁平技能(单个 .md) */
    private ObjectNode installFlatSkill(Path source, Path targetRoot, String skillId, String fileName)
            throws IOException {
        Files.createDirectories(targetRoot);
        Path target = targetRoot.resolve(fileName);
        ObjectNode node = skillSummary(skillId, false);
        if (Files.exists(target)) {
            return skipped(node);
        }
        Files.copy(source, target);
        node.put("path", target.toAbsolutePath().normalize().toString());
        return node;
    }

    /** 安装目录技能(整棵目录:SKILL.md + scripts/ + references/ 等) */
    private ObjectNode installDirectorySkill(Path sourceDir, Path targetRoot, String skillId) throws IOException {
        Files.createDirectories(targetRoot);
        Path targetDir = targetRoot.resolve(skillId);
        ObjectNode node = skillSummary(skillId, true);
        if (Files.exists(targetDir)) {
            return skipped(node);
        }
        node.put("bytes", copySkillTree(sourceDir, targetDir));
        node.put("path", targetDir.toAbsolutePath().normalize().toString());
        return node;
    }

    private ObjectNode skillSummary(String skillId, boolean directory) {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("skillId", skillId);
        node.put("isDirectory", directory);
        return node;
    }

    private ObjectNode skipped(ObjectNode node) {
        node.put("skipped", true);
        node.put("reason", "同名技能已存在");
        return node;
    }

    /** 目标技能根目录:project → 工作区 .hippo/skills;其余按 user 处理 */
    private Path resolveSkillsTargetRoot(String scope) {
        if ("project".equals(scope)) {
            String workspacePath = WorkspaceContext.getCurrentFolder();
            if (workspacePath == null || workspacePath.isBlank()) {
                throw new IllegalArgumentException("未设置工作区,无法安装项目级技能");
            }
            return Path.of(workspacePath).toAbsolutePath().normalize()
                    .resolve(".hippo").resolve("skills");
        }
        return WorkspaceManager.getUserSkillsDir();
    }

    /** 递归复制技能目录,校验单文件与目录总量上限 */
    private long copySkillTree(Path sourceDir, Path targetDir) throws IOException {
        long total = 0;
        try (var stream = Files.walk(sourceDir)) {
            for (Path source : stream.toList()) {
                Path relative = sourceDir.relativize(source);
                Path target = targetDir.resolve(relative);
                if (Files.isDirectory(source)) {
                    Files.createDirectories(target);
                    continue;
                }
                long size = Files.size(source);
                if (size > MAX_FILE_BYTES) {
                    throw new IllegalArgumentException("技能文件超过大小上限("
                            + (MAX_FILE_BYTES / 1024 / 1024) + "MB): " + relative);
                }
                total += size;
                if (total > MAX_SKILL_DIR_BYTES) {
                    throw new IllegalArgumentException("技能目录超过大小上限("
                            + (MAX_SKILL_DIR_BYTES / 1024 / 1024) + "MB): " + sourceDir.getFileName());
                }
                Files.createDirectories(target.getParent());
                Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
            }
        }
        return total;
    }

    /** 定位含 plugin.json 的包根:优先自身,否则向下扫一层子目录(兼容 zip 顶层包裹目录) */
    private Path locatePackageRoot(Path root) throws IOException {
        if (Files.exists(root.resolve("plugin.json"))) {
            return root;
        }
        try (var stream = Files.list(root)) {
            var children = stream.toList();
            for (Path child : children) {
                if (Files.isDirectory(child) && Files.exists(child.resolve("plugin.json"))) {
                    return child;
                }
            }
        }
        return null;
    }

    private String textOr(JsonNode node, String fallback) {
        return node != null && node.isTextual() ? node.asText() : fallback;
    }

    private void deleteRecursively(Path dir) {
        try (var stream = Files.walk(dir)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    // 忽略清理失败
                }
            });
        } catch (IOException e) {
            logger.warn("清理临时目录失败: {}", dir);
        }
    }

    private static String error(String message) throws IOException {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("success", false);
        node.put("message", message);
        return MAPPER.writeValueAsString(node);
    }

    private void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
