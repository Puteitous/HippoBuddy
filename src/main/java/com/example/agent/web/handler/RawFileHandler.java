package com.example.agent.web.handler;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
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
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 提供原始二进制文件下载（用于图片、PDF、Office 文件的预览）。
 * <p>
 * 路径通过 query parameter {@code path} 传入（绝对路径），
 * 返回文件原始字节流 + 对应 Content-Type。
 * 支持单段 Range 请求（206）用于音视频拖动进度；音视频流式输出，不受大小上限约束。
 * 限制：其余类型超过 50MB 的文件返回 413 错误，避免 OOM。
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
        String fileName = file.getFileName().toString();
        String mimeType = getMimeType(fileName);
        // 音视频走流式输出(不整文件读内存),因此不受预览大小上限约束
        boolean media = mimeType.startsWith("video/") || mimeType.startsWith("audio/");

        // ── 超大文件检查(媒体文件除外) ──
        if (!media && fileSize > MAX_FILE_SIZE) {
            String sizeStr = formatFileSize(fileSize);
            sendError(exchange, 413,
                "文件过大（" + sizeStr + "），超过预览大小上限 " + MAX_FILE_SIZE_STR
                + "，请在本地打开");
            return;
        }

        // ── 缓存校验器(ETag / Last-Modified):让浏览器可重验证,而不是死记旧字节 ──
        FileTime mtime = Files.getLastModifiedTime(file);
        long mtimeMillis = mtime.toMillis();
        String etag = buildEtag(fileSize, mtimeMillis);
        String lastModified = formatHttpDate(mtimeMillis);

        // ── 缓存策略 ──
        // 小 Office / CSV / HTML:始终不缓存(可能随时编辑再预览;CSV 编码转换后不可复用字节)
        // 其余(大 Office、图片、PDF、媒体、二进制):缓存但每次重验证(no-cache),配合 ETag/Last-Modified
        //   返回 304,既即时反映文件变更,又不重复全量下载。
        String lower = fileName.toLowerCase();
        boolean noStore = lower.endsWith(".xlsx") || lower.endsWith(".xls")
                || lower.endsWith(".csv")
                || lower.endsWith(".docx") || lower.endsWith(".pptx")
                ? fileSize < 10L * 1024 * 1024
                : lower.endsWith(".html") || lower.endsWith(".htm");
        String cacheControl = noStore
                ? "no-cache, no-store, must-revalidate"
                : "no-cache";

        // ── Range 请求(视频拖动进度条依赖 206 分段响应) ──
        String rangeHeader = exchange.getRequestHeaders().getFirst("Range");
        if (rangeHeader != null && !rangeHeader.isBlank()) {
            long[] range = parseRange(rangeHeader, fileSize);
            if (range == null) {
                exchange.getResponseHeaders().set("Content-Range", "bytes */" + fileSize);
                sendError(exchange, 416, "请求范围不合法");
                return;
            }
            long start = range[0];
            long end = range[1];
            long length = end - start + 1;
            exchange.getResponseHeaders().set("Content-Type", mimeType);
            exchange.getResponseHeaders().set("Content-Length", String.valueOf(length));
            exchange.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + end + "/" + fileSize);
            exchange.getResponseHeaders().set("Content-Size-Human", formatFileSize(fileSize));
            exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
            exchange.getResponseHeaders().set("Cache-Control", cacheControl);
            exchange.getResponseHeaders().set("ETag", etag);
            exchange.getResponseHeaders().set("Last-Modified", lastModified);
            exchange.sendResponseHeaders(206, length);
            try (InputStream in = Files.newInputStream(file);
                 OutputStream os = exchange.getResponseBody()) {
                in.skipNBytes(start);
                copyExactly(in, os, length);
            }
            return;
        }

        // 条件请求命中(文件未变)→ 直接 304,不读字节、不重发内容。
        // 这样修复损坏文件后下一次预览立刻拿到正确字节,未变更文件则省去全量下载。
        if (isNotModified(exchange, etag, mtimeMillis)) {
            exchange.getResponseHeaders().set("ETag", etag);
            exchange.getResponseHeaders().set("Last-Modified", lastModified);
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.sendResponseHeaders(304, -1);
            exchange.close();
            return;
        }

        // ── 媒体文件:流式输出,避免大视频整文件读入内存 ──
        if (media) {
            exchange.getResponseHeaders().set("Content-Type", mimeType);
            exchange.getResponseHeaders().set("Content-Length", String.valueOf(fileSize));
            exchange.getResponseHeaders().set("Content-Size-Human", formatFileSize(fileSize));
            exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
            exchange.getResponseHeaders().set("Cache-Control", cacheControl);
            exchange.getResponseHeaders().set("ETag", etag);
            exchange.getResponseHeaders().set("Last-Modified", lastModified);
            exchange.sendResponseHeaders(200, fileSize);
            try (InputStream in = Files.newInputStream(file);
                 OutputStream os = exchange.getResponseBody()) {
                copyExactly(in, os, fileSize);
            }
            return;
        }

        byte[] content = Files.readAllBytes(file);

        // ── CSV 文件编码检测与转换 ──
        if (fileName.toLowerCase().endsWith(".csv")) {
            content = ensureUtf8WithBom(content);
            mimeType = "text/csv; charset=UTF-8";
        }

        exchange.getResponseHeaders().set("Content-Type", mimeType);
        exchange.getResponseHeaders().set("Content-Length", String.valueOf(content.length));
        exchange.getResponseHeaders().set("Content-Size-Human", formatFileSize(fileSize));
        exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
        exchange.getResponseHeaders().set("Cache-Control", cacheControl);
        exchange.getResponseHeaders().set("ETag", etag);
        exchange.getResponseHeaders().set("Last-Modified", lastModified);

        exchange.sendResponseHeaders(200, content.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(content);
        }
    }

    /**
     * 解析单段 Range 头(仅支持 {@code bytes=start-end} / {@code bytes=start-} / {@code bytes=-suffix})。
     *
     * @return {@code [start, end]}(闭区间);非法或不可满足时返回 {@code null},由调用方回 416
     */
    static long[] parseRange(String header, long fileSize) {
        String value = header.trim();
        if (!value.startsWith("bytes=")) return null;
        String spec = value.substring("bytes=".length()).trim();
        if (spec.isEmpty() || spec.contains(",")) return null; // 多段 Range 不支持
        int dash = spec.indexOf('-');
        if (dash < 0) return null;
        String startStr = spec.substring(0, dash).trim();
        String endStr = spec.substring(dash + 1).trim();
        try {
            long start;
            long end;
            if (startStr.isEmpty()) {
                if (endStr.isEmpty()) return null;
                long suffix = Long.parseLong(endStr);
                if (suffix <= 0) return null;
                start = Math.max(0, fileSize - suffix);
                end = fileSize - 1;
            } else {
                start = Long.parseLong(startStr);
                end = endStr.isEmpty() ? fileSize - 1 : Long.parseLong(endStr);
            }
            if (fileSize <= 0 || start < 0 || start >= fileSize || end < start) return null;
            return new long[]{start, Math.min(end, fileSize - 1)};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 从输入流精确拷贝 {@code length} 字节到输出流(缓冲 64KB) */
    private static void copyExactly(InputStream in, OutputStream os, long length) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long remaining = length;
        while (remaining > 0) {
            int read = in.read(buffer, 0, (int) Math.min(buffer.length, remaining));
            if (read < 0) break;
            os.write(buffer, 0, read);
            remaining -= read;
        }
    }

    // ============================================================================
    // 缓存校验(ETag / Last-Modified / 条件请求)
    // ============================================================================

    /** 基于文件 size + mtime 构造强校验值:文件任何变化都会改变它 */
    private static String buildEtag(long size, long mtimeMillis) {
        return "\"" + Long.toHexString(size) + "-" + Long.toHexString(mtimeMillis) + "\"";
    }

    /** 按 HTTP 日期格式(RFC 1123, GMT)格式化 mtime */
    private static String formatHttpDate(long mtimeMillis) {
        return DateTimeFormatter.RFC_1123_DATE_TIME.format(
            ZonedDateTime.ofInstant(Instant.ofEpochMilli(mtimeMillis), ZoneOffset.UTC));
    }

    /**
     * 判断是否命中条件请求(文件自上次下载后未变 → 应返回 304)。
     * 优先级:If-None-Match(ETag)命中判定;否则退化为 If-Modified-Since(mtime 秒级比较)。
     */
    private static boolean isNotModified(HttpExchange exchange, String etag, long mtimeMillis) {
        Headers req = exchange.getRequestHeaders();
        String inm = req.getFirst("If-None-Match");
        if (inm != null) {
            if (inm.trim().equals("*")) return true;
            for (String candidate : inm.split(",")) {
                if (candidate.trim().equals(etag)) return true;
            }
        }
        String ims = req.getFirst("If-Modified-Since");
        if (ims != null) {
            try {
                Instant since = Instant.from(DateTimeFormatter.RFC_1123_DATE_TIME.parse(ims));
                // mtime 与请求头都按秒比较(HTTP 头到秒粒度)
                return mtimeMillis / 1000 <= since.getEpochSecond();
            } catch (Exception ignored) {
                // 非法日期忽略,按未命中处理
            }
        }
        return false;
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
        if (name.endsWith(".html") || name.endsWith(".htm")) return "text/html; charset=UTF-8";
        // ── 视频(Chromium 可播放的容器) ──
        if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
        if (name.endsWith(".webm")) return "video/webm";
        if (name.endsWith(".ogv")) return "video/ogg";
        if (name.endsWith(".mov")) return "video/quicktime";
        if (name.endsWith(".mkv")) return "video/x-matroska";
        if (name.endsWith(".avi")) return "video/x-msvideo";
        // ── 音频 ──
        if (name.endsWith(".mp3")) return "audio/mpeg";
        if (name.endsWith(".m4a")) return "audio/mp4";
        if (name.endsWith(".wav")) return "audio/wav";
        if (name.endsWith(".ogg") || name.endsWith(".oga")) return "audio/ogg";
        if (name.endsWith(".aac")) return "audio/aac";
        if (name.endsWith(".flac")) return "audio/flac";
        if (name.endsWith(".opus")) return "audio/opus";
        return "application/octet-stream";
    }
}
