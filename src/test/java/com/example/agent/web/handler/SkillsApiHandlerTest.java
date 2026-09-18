package com.example.agent.web.handler;

import com.example.agent.desktop.WorkspaceContext;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

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
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SkillsApiHandler 导入单元测试")
class SkillsApiHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private SkillsApiHandler handler;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        handler = new SkillsApiHandler();
        WorkspaceContext.setCurrentFolder(tempDir.toString());
    }

    @AfterEach
    void tearDown() {
        WorkspaceContext.clear();
    }

    private Path projectSkillsDir() {
        return tempDir.resolve(".hippo").resolve("skills");
    }

    // ==================== 单个 .md ====================

    @Nested
    @DisplayName("POST /api/skills/import - 单个 .md")
    class MarkdownImportTests {

        @Test
        @DisplayName("从 content 导入：按 Frontmatter 落盘为 <name>.md")
        void importsMarkdownContent() throws IOException {
            String body = objectMapper.writeValueAsString(Map.of(
                    "content", "---\nname: 我的技能\ndescription: 演示\n---\n\n正文内容",
                    "fileName", "whatever.md",
                    "scope", "project"));

            FakeHttpExchange exchange = createExchangeWithBody("POST", "/api/skills/import", body);
            handler.handle(exchange);

            assertEquals(201, exchange.getResponseCode());
            Map<String, Object> result = objectMapper.readValue(
                    exchange.getResponseBodyAsString(), new TypeReference<>() {});
            assertTrue((Boolean) result.get("success"));
            assertEquals("我的技能", result.get("name"));

            Path target = projectSkillsDir().resolve("我的技能.md");
            assertTrue(Files.exists(target));
            String written = Files.readString(target);
            assertTrue(written.startsWith("---\nname: 我的技能\ndescription: 演示\n---\n"));
            assertTrue(written.contains("正文内容"));
        }

        @Test
        @DisplayName("同名扁平文件已存在时返回 409")
        void existingFlatReturns409() throws IOException {
            Files.createDirectories(projectSkillsDir());
            Files.writeString(projectSkillsDir().resolve("dup.md"), "old");

            String body = objectMapper.writeValueAsString(Map.of(
                    "content", "---\nname: dup\n---\n新内容",
                    "scope", "project"));

            FakeHttpExchange exchange = createExchangeWithBody("POST", "/api/skills/import", body);
            handler.handle(exchange);

            assertEquals(409, exchange.getResponseCode());
            assertTrue(Files.readString(projectSkillsDir().resolve("dup.md")).contains("old"));
        }

        @Test
        @DisplayName("存在同名目录技能时拒绝（400），不写入永不生效的扁平文件")
        void existingDirectoryRejected() throws IOException {
            Path dir = projectSkillsDir().resolve("dup");
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("SKILL.md"), "---\nname: dup\n---\n目录正文");

            String body = objectMapper.writeValueAsString(Map.of(
                    "content", "---\nname: dup\n---\n扁平正文",
                    "scope", "project"));

            FakeHttpExchange exchange = createExchangeWithBody("POST", "/api/skills/import", body);
            handler.handle(exchange);

            assertEquals(400, exchange.getResponseCode());
            assertFalse(Files.exists(projectSkillsDir().resolve("dup.md")));
        }
    }

    // ==================== zip ====================

    @Nested
    @DisplayName("POST /api/skills/import - zip 压缩包")
    class ZipImportTests {

        @Test
        @DisplayName("导入目录技能：SKILL.md + 资源整目录落盘")
        void importsDirectorySkill() throws IOException {
            Map<String, String> entries = new LinkedHashMap<>();
            entries.put("skills/pdf-tools/SKILL.md", "---\nname: pdf-tools\n---\n正文");
            entries.put("skills/pdf-tools/references/api.md", "接口细节");
            entries.put("skills/plain.md", "---\nname: plain\n---\n扁平技能");

            String body = objectMapper.writeValueAsString(Map.of(
                    "zipBase64", zipBase64(entries),
                    "scope", "project"));

            FakeHttpExchange exchange = createExchangeWithBody("POST", "/api/skills/import", body);
            handler.handle(exchange);

            assertEquals(201, exchange.getResponseCode());
            Map<String, Object> result = objectMapper.readValue(
                    exchange.getResponseBodyAsString(), new TypeReference<>() {});
            assertEquals(2, result.get("count"));

            assertTrue(Files.exists(projectSkillsDir().resolve("pdf-tools").resolve("SKILL.md")));
            assertTrue(Files.exists(projectSkillsDir().resolve("pdf-tools")
                    .resolve("references").resolve("api.md")));
            assertTrue(Files.exists(projectSkillsDir().resolve("plain.md")));
        }

        @Test
        @DisplayName("顶层被包裹目录包住也能定位到技能")
        void locatesSkillsInsideWrappingDir() throws IOException {
            Map<String, String> entries = new LinkedHashMap<>();
            entries.put("pkg-main/README.md", "说明");
            entries.put("pkg-main/pdf-tools/SKILL.md", "---\nname: pdf-tools\n---\n正文");

            String body = objectMapper.writeValueAsString(Map.of(
                    "zipBase64", zipBase64(entries),
                    "scope", "project"));

            FakeHttpExchange exchange = createExchangeWithBody("POST", "/api/skills/import", body);
            handler.handle(exchange);

            assertEquals(201, exchange.getResponseCode());
            assertTrue(Files.exists(projectSkillsDir().resolve("pdf-tools").resolve("SKILL.md")));
        }

        @Test
        @DisplayName("同名技能：先 409，带 overwrite 后替换（含形态变更）")
        void conflictThenOverwrite() throws IOException {
            // 已有同名目录技能，压缩包里是同名扁平技能 → 覆盖应替换形态
            Path existingDir = projectSkillsDir().resolve("pdf-tools");
            Files.createDirectories(existingDir);
            Files.writeString(existingDir.resolve("SKILL.md"), "旧目录正文");

            Map<String, String> entries = new LinkedHashMap<>();
            entries.put("pdf-tools.md", "---\nname: pdf-tools\n---\n新扁平正文");

            String conflictBody = objectMapper.writeValueAsString(Map.of(
                    "zipBase64", zipBase64(entries), "scope", "project"));
            FakeHttpExchange first = createExchangeWithBody("POST", "/api/skills/import", conflictBody);
            handler.handle(first);
            assertEquals(409, first.getResponseCode());
            assertTrue(Files.exists(existingDir.resolve("SKILL.md")), "未确认覆盖前不应改动");

            String overwriteBody = objectMapper.writeValueAsString(Map.of(
                    "zipBase64", zipBase64(entries), "scope", "project", "overwrite", true));
            FakeHttpExchange second = createExchangeWithBody("POST", "/api/skills/import", overwriteBody);
            handler.handle(second);

            assertEquals(201, second.getResponseCode());
            assertFalse(Files.exists(existingDir), "同名目录技能应被形态替换清除");
            assertTrue(Files.exists(projectSkillsDir().resolve("pdf-tools.md")));
        }

        @Test
        @DisplayName("压缩包含路径穿越条目 → 400")
        void pathTraversalRejected() throws IOException {
            Map<String, String> entries = new LinkedHashMap<>();
            entries.put("../evil.md", "恶意内容");

            String body = objectMapper.writeValueAsString(Map.of(
                    "zipBase64", zipBase64(entries), "scope", "project"));
            FakeHttpExchange exchange = createExchangeWithBody("POST", "/api/skills/import", body);
            handler.handle(exchange);

            assertEquals(400, exchange.getResponseCode());
            assertFalse(Files.exists(tempDir.resolve("evil.md")));
        }

        @Test
        @DisplayName("base64 内容不是 zip → 400")
        void notAZipRejected() throws IOException {
            String body = objectMapper.writeValueAsString(Map.of(
                    "zipBase64", Base64.getEncoder().encodeToString("hello".getBytes(StandardCharsets.UTF_8)),
                    "scope", "project"));
            FakeHttpExchange exchange = createExchangeWithBody("POST", "/api/skills/import", body);
            handler.handle(exchange);

            assertEquals(400, exchange.getResponseCode());
        }
    }

    // ==================== 工具 ====================

    /** 在内存里打一个 zip 并返回 base64 */
    private static String zipBase64(Map<String, String> entries) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(bos)) {
            for (Map.Entry<String, String> entry : entries.entrySet()) {
                zos.putNextEntry(new ZipEntry(entry.getKey()));
                zos.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
            }
        }
        return Base64.getEncoder().encodeToString(bos.toByteArray());
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
        private long responseLength = -1;
        private boolean closed = false;

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
            this.responseLength = rLen;
        }

        @Override
        public OutputStream getResponseBody() { return responseBody; }
        @Override
        public InputStream getRequestBody() { return requestBody; }
        @Override
        public void close() { this.closed = true; }

        public int getResponseCode() { return responseCode; }

        String getResponseBodyAsString() {
            return responseBody.toString(StandardCharsets.UTF_8);
        }

        boolean isClosed() { return closed; }

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
        public void setAttribute(String name, Object value) {}
        @Override
        public void setStreams(InputStream i, OutputStream o) {}
        @Override
        public HttpPrincipal getPrincipal() { return null; }
        @Override
        public HttpContext getHttpContext() { return null; }
    }

    private static FakeHttpExchange createExchangeWithBody(String method, String uri, String body) {
        return new FakeHttpExchange(method, uri, body);
    }
}