package com.example.agent.web.handler;

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
import java.util.Comparator;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 标准插件包安装解析端点(对齐 Agent Plugins 1.0 打包结构)。
 * <p>
 * POST /api/plugins/package/install
 * body: { "downloadUrl": "https://..." }  — 指向一个 zip 包
 *
 * 包结构约定(与 Agent Plugins 1.0 对齐):
 * <pre>
 * my-plugin/
 * ├── plugin.json     { name, version, author, description }
 * ├── mcp.json        { id, name, type, command/url, args, env, auto_register_tools }  (可选)
 * └── skills/         多个 .md                                                          (可选)
 * </pre>
 *
 * 流程:下载 → 解压到临时目录(防路径穿越) → 解析 plugin.json / mcp.json / skills →
 * 返回解析结果(装配由前端完成:写 config.mcp.servers、落盘 skills、触发 MCP 热连接),最后清理临时目录。
 * 本端点只做解析,不直接修改 config 或技能文件。
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
    /** 单个技能文件大小上限 1MB */
    private static final long MAX_SKILL_BYTES = 1024 * 1024;

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

            // 3. 解析 plugin.json / mcp.json / skills
            ObjectNode result = parsePackage(tempDir);
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
                if (entry.getSize() > MAX_SKILL_BYTES && entryName.endsWith(".md")) {
                    throw new IllegalArgumentException("技能文件超过大小上限: " + entryName);
                }

                Files.createDirectories(target.getParent());
                long written = Files.copy(zis, target);
                totalBytes += written;
                if (totalBytes > MAX_TOTAL_BYTES) {
                    throw new IllegalArgumentException("插件包解压总量超过上限(" + (MAX_TOTAL_BYTES / 1024 / 1024) + "MB)");
                }
            }
        }
    }

    /** 解析标准包:读 plugin.json / mcp.json / skills/*.md,返回可给前端装配的结果 */
    private ObjectNode parsePackage(Path root) throws IOException {
        // 兼容 zip 顶层包裹目录(如 codeload 下载的 xxx-main/):定位到含 plugin.json 的实际包根
        Path packageRoot = locatePackageRoot(root);
        if (packageRoot == null) {
            throw new IllegalArgumentException("插件包缺少 plugin.json");
        }

        ObjectNode result = MAPPER.createObjectNode();

        // plugin.json(必须)
        Path pluginJson = packageRoot.resolve("plugin.json");
        JsonNode manifest = MAPPER.readTree(pluginJson.toFile());
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
        result.set("plugin", pluginNode);

        // mcp.json(可选)
        Path mcpJson = packageRoot.resolve("mcp.json");
        if (Files.exists(mcpJson)) {
            JsonNode mcpTree = MAPPER.readTree(mcpJson.toFile());
            JsonNode mcpBody = mcpTree.has("mcp") ? mcpTree.get("mcp") : mcpTree;
            McpConfig.McpServerConfig server = MAPPER.treeToValue(mcpBody, McpConfig.McpServerConfig.class);
            if (server.getId() == null || server.getId().isBlank()) {
                throw new IllegalArgumentException("mcp.json 缺少 server id");
            }
            result.set("mcp", MAPPER.valueToTree(server));
        }

        // skills:兼容两种结构
        //   - 扁平 skills/<name>.md
        //   - 标准嵌套 skills/<name>/SKILL.md(Agent Plugins 1.0 / Agent Skills 规范)
        ArrayNode skills = MAPPER.createArrayNode();
        Path skillsDir = packageRoot.resolve("skills");
        if (Files.isDirectory(skillsDir)) {
            try (var stream = Files.list(skillsDir)) {
                var entries = stream.sorted().toList();
                for (Path entry : entries) {
                    if (Files.isRegularFile(entry) && entry.getFileName().toString().endsWith(".md")) {
                        // 扁平形态
                        addSkillNode(skills, entry.getFileName().toString().replaceAll("\\.md$", ""), entry);
                    } else if (Files.isDirectory(entry)) {
                        // 嵌套形态:skills/<name>/SKILL.md
                        Path skillMd = entry.resolve("SKILL.md");
                        if (Files.exists(skillMd)) {
                            addSkillNode(skills, entry.getFileName().toString(), skillMd);
                        }
                    }
                }
            }
        }
        result.set("skills", skills);

        return result;
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

    private void addSkillNode(ArrayNode skills, String name, Path file) throws IOException {
        String content = Files.readString(file, StandardCharsets.UTF_8);
        ObjectNode skillNode = MAPPER.createObjectNode();
        skillNode.put("name", name);
        skillNode.put("content", content);
        skills.add(skillNode);
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
