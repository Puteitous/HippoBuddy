package com.example.agent.web.handler;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.skill.SkillManager;
import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpPrincipal;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * {@link PluginPackageInstallHandler} 单元测试。
 * <p>
 * 覆盖：请求校验（方法/URL 白名单/下载失败）、包解析（plugin.json 缺失、author 两种形态、
 * 顶层包裹目录）、mcp.json（包裹与裸形态、缺 id）、技能落盘（扁平 / 目录带资源 / dryRun 预览 /
 * 同名跳过 / 无 skills 目录）、以及落盘后的技能热重载触发。
 * </p>
 * <p>
 * 下载链路用本地 {@link HttpServer} 提供真实 zip 响应，避免 mock OkHttp 的 final 类型。
 * </p>
 */
@DisplayName("PluginPackageInstallHandler 标准插件包安装单元测试")
class PluginPackageInstallHandlerTest {

    private static final String ENDPOINT = "/api/plugins/package/install";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private PluginPackageInstallHandler handler;

    private HttpServer server;
    private String zipUrl;
    /** 本地服务将要返回的响应体 / 状态码 */
    private volatile byte[] servedBody = new byte[0];
    private volatile int servedStatus = 200;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() throws IOException {
        handler = new PluginPackageInstallHandler();
        WorkspaceContext.setCurrentFolder(tempDir.toString());

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/pkg.zip", exchange -> {
            try {
                if (servedStatus == 200 && servedBody.length > 0) {
                    exchange.sendResponseHeaders(200, servedBody.length);
                    try (OutputStream os = exchange.getResponseBody()) {
                        os.write(servedBody);
                    }
                } else if (servedStatus == 200) {
                    exchange.sendResponseHeaders(200, -1);
                } else {
                    exchange.sendResponseHeaders(servedStatus, -1);
                }
            } finally {
                exchange.close();
            }
        });
        server.start();
        zipUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/pkg.zip";
    }

    @AfterEach
    void tearDown() {
        WorkspaceContext.clear();
        if (server != null) {
            server.stop(0);
        }
    }

    // ==================== 请求校验 ====================

    @Nested
    @DisplayName("请求校验")
    class RequestValidationTests {

        @Test
        @DisplayName("OPTIONS 预检返回 204")
        void testOptionsPreflight() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("OPTIONS", ENDPOINT);
            handler.handle(exchange);

            assertEquals(204, exchange.getResponseCode());
        }

        @Test
        @DisplayName("非 POST 方法返回 405")
        void testGetMethodRejected() throws IOException {
            FakeHttpExchange exchange = new FakeHttpExchange("GET", ENDPOINT);
            handler.handle(exchange);

            assertEquals(405, exchange.getResponseCode());
        }

        @Test
        @DisplayName("downloadUrl 为空返回 400")
        void testEmptyDownloadUrl() throws IOException {
            FakeHttpExchange exchange = post(Map.of("downloadUrl", "  "));

            assertEquals(400, exchange.getResponseCode());
            assertFalse((Boolean) body(exchange).get("success"));
        }

        @Test
        @DisplayName("非 https 且非本地回环的 URL 返回 400")
        void testNonAllowlistedUrl() throws IOException {
            FakeHttpExchange exchange = post(Map.of("downloadUrl", "http://example.com/pkg.zip"));

            assertEquals(400, exchange.getResponseCode());
            assertTrue(String.valueOf(body(exchange).get("message")).contains("https"));
        }

        @Test
        @DisplayName("下载返回 404 时返回 500")
        void testDownloadFailure() throws IOException {
            servedStatus = 404;
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl));

            assertEquals(500, exchange.getResponseCode());
            assertTrue(String.valueOf(body(exchange).get("message")).contains("404"));
        }

        @Test
        @DisplayName("下载内容为空时返回 500")
        void testEmptyDownloadBody() throws IOException {
            servedBody = new byte[0];
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl));

            assertEquals(500, exchange.getResponseCode());
        }

        @Test
        @DisplayName("压缩包含路径穿越条目返回 400")
        void testPathTraversalRejected() throws IOException {
            servedBody = zipBytes(Map.of("../evil.md", "恶意内容"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(400, exchange.getResponseCode());
            assertFalse(Files.exists(tempDir.resolve("evil.md")));
        }
    }

    // ==================== 包解析 ====================

    @Nested
    @DisplayName("plugin.json 解析")
    class ManifestTests {

        @Test
        @DisplayName("缺少 plugin.json 返回 400")
        void testMissingManifest() throws IOException {
            servedBody = zipBytes(Map.of("README.md", "没有清单"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl));

            assertEquals(400, exchange.getResponseCode());
            assertTrue(String.valueOf(body(exchange).get("message")).contains("plugin.json"));
        }

        @Test
        @DisplayName("解析出 name/version/author(字符串)/description")
        void testParsesManifest() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"widget-pack\",\"version\":\"1.2.0\","
                            + "\"author\":\"张三\",\"description\":\"演示包\"}",
                    "skills/alpha.md", "---\nname: alpha\n---\n正文"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            Map<String, Object> result = body(exchange);
            assertTrue((Boolean) result.get("success"));
            Map<String, Object> plugin = asMap(result.get("plugin"));
            assertEquals("widget-pack", plugin.get("name"));
            assertEquals("1.2.0", plugin.get("version"));
            assertEquals("张三", plugin.get("author"));
            assertEquals("演示包", plugin.get("description"));
        }

        @Test
        @DisplayName("author 为对象形态时取 name；缺省字段有兜底值")
        void testAuthorObjectAndDefaults() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"author\":{\"name\":\"李四\",\"email\":\"a@b.c\"}}"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            Map<String, Object> plugin = asMap(body(exchange).get("plugin"));
            assertEquals("李四", plugin.get("author"));
            assertEquals("unnamed-plugin", plugin.get("name"));
            assertEquals("0.0.0", plugin.get("version"));
        }

        @Test
        @DisplayName("顶层被包裹目录包住也能定位到包根")
        void testWrappedPackageRoot() throws IOException {
            servedBody = zipBytes(Map.of(
                    "widget-main/plugin.json", "{\"name\":\"wrapped\"}",
                    "widget-main/skills/alpha.md", "---\nname: alpha\n---\n正文"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            assertEquals("wrapped", asMap(body(exchange).get("plugin")).get("name"));
            assertTrue(Files.exists(projectSkillsDir().resolve("alpha.md")));
        }
    }

    // ==================== mcp.json ====================

    @Nested
    @DisplayName("mcp.json 解析")
    class McpTests {

        @Test
        @DisplayName("mcp 包裹形态解析为 server 配置（不落盘）")
        void testWrappedMcpForm() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"mcp-pack\"}",
                    "mcp.json", "{\"mcp\":{\"id\":\"mcp-memory\",\"name\":\"Memory\",\"type\":\"stdio\","
                            + "\"command\":\"npx\",\"args\":[\"-y\",\"server-memory\"],"
                            + "\"auto_register_tools\":true}}"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            Map<String, Object> mcp = asMap(body(exchange).get("mcp"));
            assertEquals("mcp-memory", mcp.get("id"));
            assertEquals("Memory", mcp.get("name"));
            assertEquals("stdio", mcp.get("type"));
            assertEquals("npx", mcp.get("command"));
            assertEquals(List.of("-y", "server-memory"), mcp.get("args"));
            assertEquals(Boolean.TRUE, mcp.get("auto_register_tools"));
        }

        @Test
        @DisplayName("裸 mcp 配置形态同样解析")
        void testBareMcpForm() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"bare-pack\"}",
                    "mcp.json", "{\"id\":\"bare\",\"url\":\"https://example.com/sse\"}"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            Map<String, Object> mcp = asMap(body(exchange).get("mcp"));
            assertEquals("bare", mcp.get("id"));
            assertEquals("https://example.com/sse", mcp.get("url"));
        }

        @Test
        @DisplayName("mcp.json 缺少 id 返回 400")
        void testMcpMissingId() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"bad-mcp\"}",
                    "mcp.json", "{\"name\":\"无 id 服务\"}"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl));

            assertEquals(400, exchange.getResponseCode());
            assertTrue(String.valueOf(body(exchange).get("message")).contains("id"));
        }

        @Test
        @DisplayName("无 mcp.json 时结果不含 mcp 字段")
        void testNoMcpConfig() throws IOException {
            servedBody = zipBytes(Map.of("plugin.json", "{\"name\":\"skill-only\"}"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl));

            assertEquals(200, exchange.getResponseCode());
            assertNull(body(exchange).get("mcp"));
        }
    }

    // ==================== 技能落盘 ====================

    @Nested
    @DisplayName("skills 安装")
    class SkillsTests {

        @Test
        @DisplayName("扁平技能落盘到项目技能目录")
        void testInstallsFlatSkill() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"flat-pack\"}",
                    "skills/alpha.md", "---\nname: alpha\n---\n正文"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            Path target = projectSkillsDir().resolve("alpha.md");
            assertTrue(Files.exists(target));
            assertTrue(Files.readString(target).contains("正文"));

            List<Object> skills = asList(body(exchange).get("skills"));
            assertEquals(1, skills.size());
            assertEquals("alpha", asMap(skills.get(0)).get("skillId"));
            assertEquals(Boolean.FALSE, asMap(skills.get(0)).get("isDirectory"));
        }

        @Test
        @DisplayName("目录技能整棵树落盘（SKILL.md + 同目录资源）")
        void testInstallsDirectorySkill() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"dir-pack\"}",
                    "skills/pdf-tools/SKILL.md", "---\nname: pdf-tools\n---\n正文",
                    "skills/pdf-tools/references/api.md", "接口细节"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            Path targetDir = projectSkillsDir().resolve("pdf-tools");
            assertTrue(Files.exists(targetDir.resolve("SKILL.md")));
            assertTrue(Files.exists(targetDir.resolve("references").resolve("api.md")));

            Map<String, Object> summary = asMap(asList(body(exchange).get("skills")).get(0));
            assertEquals("pdf-tools", summary.get("skillId"));
            assertEquals(Boolean.TRUE, summary.get("isDirectory"));
        }

        @Test
        @DisplayName("dryRun=true 只汇报不落盘")
        void testDryRunDoesNotWrite() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"dry-pack\"}",
                    "skills/pdf-tools/SKILL.md", "---\nname: pdf-tools\n---\n正文"));
            FakeHttpExchange exchange = post(Map.of(
                    "downloadUrl", zipUrl, "scope", "project", "dryRun", true));

            assertEquals(200, exchange.getResponseCode());
            Map<String, Object> result = body(exchange);
            assertEquals(Boolean.TRUE, result.get("dryRun"));
            assertEquals("pdf-tools", asMap(asList(result.get("skills")).get(0)).get("skillId"));
            assertFalse(Files.exists(projectSkillsDir().resolve("pdf-tools")),
                    "dryRun 不应写入技能目录");
        }

        @Test
        @DisplayName("同名技能已存在时跳过并回报")
        void testExistingSkillSkipped() throws IOException {
            Path existing = projectSkillsDir().resolve("alpha.md");
            Files.createDirectories(projectSkillsDir());
            Files.writeString(existing, "用户已有内容");

            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"dup-pack\"}",
                    "skills/alpha.md", "---\nname: alpha\n---\n包内正文"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            Map<String, Object> summary = asMap(asList(body(exchange).get("skills")).get(0));
            assertEquals(Boolean.TRUE, summary.get("skipped"));
            assertEquals("用户已有内容", Files.readString(existing), "不应覆盖用户已有技能");
        }

        @Test
        @DisplayName("无 skills 目录时返回空数组")
        void testNoSkillsDir() throws IOException {
            servedBody = zipBytes(Map.of("plugin.json", "{\"name\":\"empty-pack\"}"));
            FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

            assertEquals(200, exchange.getResponseCode());
            assertTrue(asList(body(exchange).get("skills")).isEmpty());
        }

        @Test
        @DisplayName("scope=project 但未设置工作区返回 400")
        void testProjectScopeWithoutWorkspace() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"ws-pack\"}",
                    "skills/alpha.md", "---\nname: alpha\n---\n正文"));

            try (MockedStatic<WorkspaceContext> wc = Mockito.mockStatic(WorkspaceContext.class)) {
                wc.when(WorkspaceContext::getCurrentFolder).thenReturn(null);
                FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

                assertEquals(400, exchange.getResponseCode());
                assertFalse(Files.exists(tempDir.resolve(".hippo")), "未设置工作区时不应落盘");
            }
        }

        @Test
        @DisplayName("scope=user 落盘到用户技能目录")
        void testUserScopeTarget() throws IOException {
            Path userSkillsDir = tempDir.resolve("user-skills");
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"user-pack\"}",
                    "skills/alpha.md", "---\nname: alpha\n---\n正文"));

            try (MockedStatic<WorkspaceManager> wm = Mockito.mockStatic(WorkspaceManager.class)) {
                wm.when(WorkspaceManager::getUserSkillsDir).thenReturn(userSkillsDir);
                FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "user"));

                assertEquals(200, exchange.getResponseCode());
                assertTrue(Files.exists(userSkillsDir.resolve("alpha.md")));
            }
        }

        @Test
        @DisplayName("非 dryRun 落盘后触发技能热重载")
        void testReloadsSkillManagerAfterInstall() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"reload-pack\"}",
                    "skills/alpha.md", "---\nname: alpha\n---\n正文"));
            SkillManager skillManager = mock(SkillManager.class);

            try (MockedStatic<ServiceLocator> sl = Mockito.mockStatic(ServiceLocator.class)) {
                sl.when(() -> ServiceLocator.getOrNull(SkillManager.class)).thenReturn(skillManager);
                FakeHttpExchange exchange = post(Map.of("downloadUrl", zipUrl, "scope", "project"));

                assertEquals(200, exchange.getResponseCode());
                verify(skillManager, times(1)).reload();
            }
        }

        @Test
        @DisplayName("dryRun=true 不触发技能热重载")
        void testDryRunDoesNotReload() throws IOException {
            servedBody = zipBytes(Map.of(
                    "plugin.json", "{\"name\":\"dry-reload-pack\"}",
                    "skills/alpha.md", "---\nname: alpha\n---\n正文"));
            SkillManager skillManager = mock(SkillManager.class);

            try (MockedStatic<ServiceLocator> sl = Mockito.mockStatic(ServiceLocator.class)) {
                sl.when(() -> ServiceLocator.getOrNull(SkillManager.class)).thenReturn(skillManager);
                post(Map.of("downloadUrl", zipUrl, "scope", "project", "dryRun", true));

                verify(skillManager, times(0)).reload();
            }
        }
    }

    // ==================== 工具 ====================

    private Path projectSkillsDir() {
        return tempDir.resolve(".hippo").resolve("skills");
    }

    private FakeHttpExchange post(Map<String, Object> payload) throws IOException {
        FakeHttpExchange exchange = new FakeHttpExchange(
                "POST", ENDPOINT, objectMapper.writeValueAsString(payload));
        handler.handle(exchange);
        return exchange;
    }

    private Map<String, Object> body(FakeHttpExchange exchange) throws IOException {
        return objectMapper.readValue(exchange.getResponseBodyAsString(), new TypeReference<>() {});
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> asList(Object value) {
        return (List<Object>) value;
    }

    /** 在内存里打一个 zip */
    private static byte[] zipBytes(Map<String, String> entries) throws IOException {
        Map<String, String> ordered = new LinkedHashMap<>(entries);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(bos)) {
            for (Map.Entry<String, String> entry : ordered.entrySet()) {
                zos.putNextEntry(new ZipEntry(entry.getKey()));
                zos.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
            }
        }
        return bos.toByteArray();
    }

    // ==================== FakeHttpExchange ====================

    static class FakeHttpExchange extends HttpExchange {

        private final String requestMethod;
        private final String requestUri;
        private final Headers responseHeaders = new Headers();
        private final Headers requestHeaders = new Headers();
        private final ByteArrayOutputStream responseBody = new ByteArrayOutputStream();
        private final ByteArrayInputStream requestBody;
        private int responseCode = -1;

        FakeHttpExchange(String requestMethod, String requestUri) {
            this(requestMethod, requestUri, "");
        }

        FakeHttpExchange(String requestMethod, String requestUri, String requestBodyContent) {
            this.requestMethod = requestMethod;
            this.requestUri = requestUri;
            this.requestBody = new ByteArrayInputStream(
                    requestBodyContent.getBytes(StandardCharsets.UTF_8));
            requestHeaders.add("Host", "localhost");
        }

        @Override
        public Headers getRequestHeaders() { return requestHeaders; }
        @Override
        public Headers getResponseHeaders() { return responseHeaders; }
        @Override
        public String getRequestMethod() { return requestMethod; }

        @Override
        public URI getRequestURI() {
            return URI.create("http://localhost" + requestUri);
        }

        @Override
        public void sendResponseHeaders(int rCode, long rLen) {
            this.responseCode = rCode;
        }

        @Override
        public OutputStream getResponseBody() { return responseBody; }
        @Override
        public InputStream getRequestBody() { return requestBody; }
        @Override
        public void close() { }

        public int getResponseCode() { return responseCode; }

        String getResponseBodyAsString() {
            return responseBody.toString(StandardCharsets.UTF_8);
        }

        @Override
        public InetSocketAddress getRemoteAddress() {
            return new InetSocketAddress("127.0.0.1", 12345);
        }

        @Override
        public InetSocketAddress getLocalAddress() {
            return new InetSocketAddress("127.0.0.1", 8080);
        }

        @Override
        public String getProtocol() { return "HTTP/1.1"; }
        @Override
        public Object getAttribute(String name) { return null; }
        @Override
        public void setAttribute(String name, Object value) { }
        @Override
        public void setStreams(InputStream i, OutputStream o) { }
        @Override
        public HttpPrincipal getPrincipal() { return null; }
        @Override
        public HttpContext getHttpContext() { return null; }
    }
}