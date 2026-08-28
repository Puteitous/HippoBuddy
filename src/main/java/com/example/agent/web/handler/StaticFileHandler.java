package com.example.agent.web.handler;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class StaticFileHandler implements HttpHandler {

    private final String basePath;
    private final Path devStaticDir;

    public StaticFileHandler(String basePath) {
        this.basePath = basePath;
        this.devStaticDir = findDevStaticDir(basePath);
    }

    /** 开发模式下优先从源文件系统加载，实时反映修改 */
    private static Path findDevStaticDir(String basePath) {
        if (!"/static".equals(basePath) && !"/static-v2".equals(basePath)) return null;
        String rel = basePath.substring(1); // "static" / "static-v2"
        Path candidate = Paths.get("src", "main", "resources", rel).toAbsolutePath().normalize();
        if (Files.isDirectory(candidate)) {
            return candidate;
        }
        return null;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();

        // 根路径与 cockpit 入口:按 basePath 分流。
        //  - static-v2(React 新前端):/ 与 /app 都重定向到 /app/(相对资源需带尾斜杠)
        //  - static(旧 cockpit):/ 与 /cockpit 都加载 cockpit.html
        if ("/".equals(path) && "/static-v2".equals(basePath)) {
            String rawQuery = exchange.getRequestURI().getRawQuery();
            redirect(exchange, rawQuery != null && !rawQuery.isEmpty()
                ? "/app/?" + rawQuery
                : "/app/");
            return;
        } else if ("/".equals(path) || "/cockpit".equals(path)) {
            path = "/cockpit.html";
        } else if ("/app".equals(path)) {
            // 新前端(React + TS)入口。必须先重定向到 /app/(带尾部斜杠),
            // 否则 HTML 内的相对资源 ./assets/* 会被浏览器解析到根路径 /assets/*,
            // 因缺少 /app 前缀而 404(详见 vite base: './' 的产物引用方式)。
            // 保留原 query(如 Electron 加载 /app?skipSplash=true)。
            String rawQuery = exchange.getRequestURI().getRawQuery();
            redirect(exchange, rawQuery != null && !rawQuery.isEmpty()
                ? "/app/?" + rawQuery
                : "/app/");
            return;
        } else if ("/app/".equals(path)) {
            path = "/index.html";
        }

        // 剥离 context 前缀:HttpServer 将请求路由到 /app context 后,
        // getRequestURI().getPath() 仍是完整路径(如 /app/assets/index.js),
        // 需去掉 /app 再按 static-v2 目录 resolve, 否则会 404。
        // 按路径段匹配(equals(context) 或 startsWith(context + "/")),
        // 避免误伤 /cockpit.html 这类同前缀但不同段的路径。
        String contextPath = exchange.getHttpContext() != null
            ? exchange.getHttpContext().getPath()
            : "";
        if (contextPath.length() > 1
            && (path.equals(contextPath) || path.startsWith(contextPath + "/"))) {
            path = path.substring(contextPath.length());
            if (path.isEmpty()) path = "/";
        }

        byte[] content = null;
        String mimeType = getMimeType(path);

        // 1) 开发模式：优先从源文件系统读取
        if (devStaticDir != null) {
            Path filePath = devStaticDir.resolve(path.startsWith("/") ? path.substring(1) : path).normalize();
            if (filePath.startsWith(devStaticDir) && Files.isRegularFile(filePath)) {
                content = Files.readAllBytes(filePath);
            }
        }

        // 2) 回退到 classpath（生产 JAR 模式）
        if (content == null) {
            String resourcePath = basePath + path;
            var resource = getClass().getResource(resourcePath);
            if (resource != null) {
                content = resource.openStream().readAllBytes();
            }
        }

        // 3) 404
        if (content == null) {
            String response = "404 Not Found";
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=UTF-8");
            exchange.sendResponseHeaders(404, response.getBytes("UTF-8").length);
            exchange.getResponseBody().write(response.getBytes("UTF-8"));
            exchange.close();
            return;
        }

        exchange.getResponseHeaders().set("Content-Type", mimeType);
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");

        // 带内容 hash 的 .wasm 文件（如 pptx_parser_bg.a1b2c3d4.wasm）不可变，
        // 使用强缓存，浏览器无需重新验证。
        if (path.endsWith(".wasm")) {
            exchange.getResponseHeaders().set("Cache-Control", "public, max-age=31536000, immutable");
        } else {
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
            exchange.getResponseHeaders().set("Pragma", "no-cache");
            exchange.getResponseHeaders().set("Expires", "0");
        }
        exchange.sendResponseHeaders(200, content.length);
        exchange.getResponseBody().write(content);
        exchange.close();
    }

    private String getMimeType(String path) {
        if (path.endsWith(".html")) {
            return "text/html; charset=UTF-8";
        } else if (path.endsWith(".css")) {
            return "text/css; charset=UTF-8";
        } else if (path.endsWith(".js") || path.endsWith(".mjs")) {
            return "application/javascript; charset=UTF-8";
        } else if (path.endsWith(".wasm")) {
            return "application/wasm";
        } else if (path.endsWith(".json")) {
            return "application/json; charset=UTF-8";
        } else if (path.endsWith(".png")) {
            return "image/png";
        } else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
            return "image/jpeg";
        } else if (path.endsWith(".gif")) {
            return "image/gif";
        } else if (path.endsWith(".svg")) {
            return "image/svg+xml";
        } else if (path.endsWith(".ico")) {
            return "image/x-icon";
        } else if (path.endsWith(".md")) {
            return "text/markdown; charset=UTF-8";
        } else if (path.endsWith(".woff")) {
            return "font/woff";
        } else if (path.endsWith(".woff2")) {
            return "font/woff2";
        } else if (path.endsWith(".ttf")) {
            return "font/ttf";
        }
        return "application/octet-stream";
    }

    /** 302 重定向到指定位置(用于 /app → /app/,保证相对资源路径带 context 前缀) */
    private void redirect(HttpExchange exchange, String location) throws IOException {
        exchange.getResponseHeaders().set("Location", location);
        exchange.sendResponseHeaders(302, -1);
        exchange.close();
    }
}
