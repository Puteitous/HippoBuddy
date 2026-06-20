package com.example.agent.web.handler;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 提供原始二进制文件下载（用于图片、PDF、Office 文件的预览）。
 * <p>
 * 路径通过 query parameter {@code path} 传入（绝对路径），
 * 返回文件原始字节流 + 对应 Content-Type。
 * 限制：超过 50MB 的文件返回 413 错误，避免 OOM。
 * </p>
 */
public class RawFileHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(RawFileHandler.class);

    /** 单文件预览大小上限：50MB */
    private static final long MAX_FILE_SIZE = 50L * 1024 * 1024;
    /** 人类可读的大小上限 */
    private static final String MAX_FILE_SIZE_STR = "50MB";

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");

        String query = exchange.getRequestURI().getRawQuery();
        if (query == null || query.isBlank()) {
            sendError(exchange, 400, "缺少 'path' 查询参数");
            return;
        }

        String filePath = null;
        for (String param : query.split("&")) {
            String[] kv = param.split("=", 2);
            if (kv.length == 2 && "path".equals(kv[0])) {
                filePath = URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                break;
            }
        }

        if (filePath == null || filePath.isBlank()) {
            sendError(exchange, 400, "缺少 'path' 查询参数");
            return;
        }

        Path file = Paths.get(filePath).normalize();
        if (!Files.isRegularFile(file)) {
            sendError(exchange, 404, "文件未找到: " + filePath);
            return;
        }

        long fileSize = Files.size(file);

        // ── 超大文件检查 ──
        if (fileSize > MAX_FILE_SIZE) {
            String sizeStr = formatFileSize(fileSize);
            sendError(exchange, 413,
                "文件过大（" + sizeStr + "），超过预览大小上限 " + MAX_FILE_SIZE_STR
                + "，请在本地打开");
            return;
        }

        String fileName = file.getFileName().toString();
        String mimeType = getMimeType(fileName);

        byte[] content = Files.readAllBytes(file);

        // ── CSV 文件编码检测与转换 ──
        if (fileName.toLowerCase().endsWith(".csv")) {
            content = ensureUtf8WithBom(content);
            mimeType = "text/csv; charset=UTF-8";
        }

        // Office 文件（xlsx/xls/csv/docx/pptx）：小于 10MB 不缓存，大文件缓存 1 小时
        // CSV 的编码检测若缓存可能显示乱码，但 CSV 通常很小（远低于 10MB），走小文件不缓存即可
        String lower = fileName.toLowerCase();
        String cacheControl;
        if (lower.endsWith(".xlsx") || lower.endsWith(".xls")
                || lower.endsWith(".csv")
                || lower.endsWith(".docx") || lower.endsWith(".pptx")) {
            if (fileSize < 10L * 1024 * 1024) {
                cacheControl = "no-cache, no-store, must-revalidate";
            } else {
                cacheControl = "private, max-age=3600";
            }
        } else {
            cacheControl = "private, max-age=3600";
        }

        exchange.getResponseHeaders().set("Content-Type", mimeType);
        exchange.getResponseHeaders().set("Content-Length", String.valueOf(content.length));
        exchange.getResponseHeaders().set("Content-Size-Human", formatFileSize(fileSize));
        exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
        exchange.getResponseHeaders().set("Cache-Control", cacheControl);

        exchange.sendResponseHeaders(200, content.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(content);
        }
    }

    /**
     * 检测 CSV 字节数组的编码，确保返回 UTF-8 with BOM 的字节数组。
     * <p>
     * 检测策略：
     *   1. 已有 UTF-8 BOM（EF BB BF）→ 保留原始字节
     *   2. 尝试 UTF-8 解码 → 成功则添加 BOM
     *   3. UTF-8 解码失败 → 按 GBK 解码，再编码为 UTF-8 并添加 BOM
     * </p>
     */
    static byte[] ensureUtf8WithBom(byte[] input) {
        if (input == null || input.length == 0) {
            return input;
        }

        // 1. 检查是否已有 UTF-8 BOM
        if (input.length >= 3 && (input[0] & 0xFF) == 0xEF
            && (input[1] & 0xFF) == 0xBB && (input[2] & 0xFF) == 0xBF) {
            return input;
        }

        // 2. 尝试 UTF-8 解码
        CharsetDecoder utf8Decoder = StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT);
        try {
            utf8Decoder.decode(ByteBuffer.wrap(input));
            // UTF-8 合法 → 添加 BOM 后返回
            return addBom(input);
        } catch (CharacterCodingException e) {
            // 3. UTF-8 解码失败 → 尝试 GBK
            try {
                Charset gbk = Charset.forName("GBK");
                String text = gbk.decode(ByteBuffer.wrap(input)).toString();
                byte[] utf8Bytes = text.getBytes(StandardCharsets.UTF_8);
                return addBom(utf8Bytes);
            } catch (Exception ex) {
                logger.warn("CSV encoding fallback (GBK) failed, returning raw bytes with BOM", ex);
                return addBom(input);
            }
        }
    }

    /** 为字节数组添加 UTF-8 BOM（EF BB BF） */
    private static byte[] addBom(byte[] data) {
        byte[] bom = new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
        byte[] result = new byte[bom.length + data.length];
        System.arraycopy(bom, 0, result, 0, bom.length);
        System.arraycopy(data, 0, result, bom.length, data.length);
        return result;
    }

    /** 格式化文件大小为人类可读形式 */
    private static String formatFileSize(long bytes) {
        if (bytes < 1024) return bytes + "B";
        if (bytes < 1024 * 1024) return String.format("%.1fKB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.1fMB", bytes / (1024.0 * 1024));
        return String.format("%.1fGB", bytes / (1024.0 * 1024 * 1024));
    }

    private void sendError(HttpExchange exchange, int statusCode, String message) throws IOException {
        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=UTF-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String getMimeType(String fileName) {
        String name = fileName.toLowerCase();
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".bmp")) return "image/bmp";
        if (name.endsWith(".ico")) return "image/x-icon";
        if (name.endsWith(".pdf")) return "application/pdf";
        return "application/octet-stream";
    }
}
