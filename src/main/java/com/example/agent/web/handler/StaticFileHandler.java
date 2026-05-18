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
        if (!"/static".equals(basePath)) return null;
        Path candidate = Paths.get("src", "main", "resources", "static").toAbsolutePath().normalize();
        if (Files.isDirectory(candidate)) {
            return candidate;
        }
        return null;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();

        if ("/".equals(path) || "/cockpit".equals(path)) {
            path = "/cockpit.html";
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
        exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
        exchange.getResponseHeaders().set("Pragma", "no-cache");
        exchange.getResponseHeaders().set("Expires", "0");
        exchange.sendResponseHeaders(200, content.length);
        exchange.getResponseBody().write(content);
        exchange.close();
    }

    private String getMimeType(String path) {
        if (path.endsWith(".html")) {
            return "text/html; charset=UTF-8";
        } else if (path.endsWith(".css")) {
            return "text/css; charset=UTF-8";
        } else if (path.endsWith(".js")) {
            return "application/javascript; charset=UTF-8";
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
        } else if (path.endsWith(".woff")) {
            return "font/woff";
        } else if (path.endsWith(".woff2")) {
            return "font/woff2";
        } else if (path.endsWith(".ttf")) {
            return "font/ttf";
        }
        return "application/octet-stream";
    }
}
