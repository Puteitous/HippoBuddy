package com.example.agent.tools;

import com.example.agent.logging.WorkspaceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 图片存储服务。
 * <p>
 * 负责将用户上传的 base64 图片保存到本地 {@code .hippo/images/} 目录，
 * 并提供 file:// 路径与 data: URI 之间的转换能力。
 * </p>
 *
 * <h3>存储结构</h3>
 * <pre>
 * .hippo/
 *   images/
 *     a1b2c3d4.png    — 原始图片（按内容哈希命名，自动去重）
 *     e5f6g7h8.jpg
 * </pre>
 *
 * <h3>URL 格式约定</h3>
 * <ul>
 *   <li><b>存储时</b>：{@code file://.hippo/images/{hash}.{ext}} — 写入 Transcript 日志</li>
 *   <li><b>发送给 LLM 时</b>：{@code data:image/png;base64,...} — 通过 {@link #toDataUri(String)} 转换</li>
 *   <li><b>前端预览时</b>：通过 {@code /api/files/raw} 接口访问</li>
 * </ul>
 */
public class ImageStoreService {

    private static final Logger logger = LoggerFactory.getLogger(ImageStoreService.class);

    private static final Pattern DATA_URI_PATTERN = Pattern.compile(
        "^data:(image/(\\w+));base64,(.+)$", Pattern.DOTALL);
    private static final Pattern FILE_URI_PATTERN = Pattern.compile(
        "^file://(.+)$");

    private static final long MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
    private static final String IMAGES_SUBDIR = "images";

    private final Path imagesDir;
    private final MessageDigest digest;

    public ImageStoreService() {
        this.imagesDir = WorkspaceManager.getHippoRoot().resolve(IMAGES_SUBDIR);
        try {
            Files.createDirectories(this.imagesDir);
            this.digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 不可用", e);
        } catch (IOException e) {
            throw new RuntimeException("无法创建图片目录: " + this.imagesDir, e);
        }
    }

    /**
     * 保存一张 base64 图片到本地存储。
     *
     * @param dataUri 图片的 data: URI（如 {@code data:image/png;base64,iVBOR...}）
     * @return 图片的 file:// 路径（如 {@code file://.hippo/images/abc123.png}）
     * @throws IllegalArgumentException 如果 dataUri 格式无效或图片过大
     * @throws IOException              如果写入文件失败
     */
    public String saveImage(String dataUri) throws IOException {
        if (dataUri == null || dataUri.isEmpty()) {
            throw new IllegalArgumentException("dataUri 不能为空");
        }

        // 解析 data URI
        Matcher matcher = DATA_URI_PATTERN.matcher(dataUri);
        if (!matcher.matches()) {
            throw new IllegalArgumentException("无效的 data: URI 格式");
        }

        String mimeType = matcher.group(1);     // image/png
        String format = matcher.group(2);        // png
        String base64Data = matcher.group(3);    // base64 编码的图片数据

        // 解码 base64
        byte[] imageBytes;
        try {
            imageBytes = Base64.getDecoder().decode(base64Data);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("base64 解码失败: " + e.getMessage());
        }

        // 大小检查
        if (imageBytes.length > MAX_IMAGE_SIZE) {
            throw new IllegalArgumentException(
                "图片过大: " + (imageBytes.length / 1024 / 1024) + "MB，最大支持 " +
                (MAX_IMAGE_SIZE / 1024 / 1024) + "MB");
        }

        // 计算内容哈希（用于去重）
        String hash = computeHash(imageBytes);
        String fileName = hash + "." + format;
        Path imageFile = imagesDir.resolve(fileName);

        // 如果文件已存在（内容相同），直接返回现有路径
        if (Files.exists(imageFile)) {
            logger.debug("图片已存在（去重命中）: {}", fileName);
            return toFileUri(imageFile);
        }

        // 写入文件
        Files.write(imageFile, imageBytes);
        logger.info("图片已保存: {} ({} 字节)", fileName, imageBytes.length);

        return toFileUri(imageFile);
    }

    /**
     * 将 file:// 路径转换为 data: URI（用于发送给 LLM）。
     *
     * @param fileUri file:// 路径（如 {@code file://.hippo/images/abc123.png}）
     * @return data: URI（如 {@code data:image/png;base64,iVBOR...}）
     * @throws IOException 如果读取文件失败
     */
    public String toDataUri(String fileUri) throws IOException {
        if (fileUri == null || fileUri.isEmpty()) {
            return null;
        }

        // 如果已经是 data: URI，直接返回
        if (fileUri.startsWith("data:")) {
            return fileUri;
        }

        Path imageFile = resolveFileUri(fileUri);
        if (imageFile == null || !Files.exists(imageFile)) {
            logger.warn("图片文件不存在: {}", fileUri);
            return null;
        }

        byte[] imageBytes = Files.readAllBytes(imageFile);
        String base64 = Base64.getEncoder().encodeToString(imageBytes);
        String mimeType = probeMimeType(imageFile);

        return "data:" + mimeType + ";base64," + base64;
    }

    /**
     * 将 file:// 路径转为前端可访问的 HTTP URL。
     * <p>
     * 返回的 HTTP URL 使用 {@code hippoRoot} 的绝对路径拼接，确保
     * {@link com.example.agent.web.handler.RawFileHandler} 在任何工作目录下都能正确解析。
     * </p>
     *
     * @param fileUri file:// 路径
     * @return HTTP 路径（如 {@code /api/file/raw?path=/abs/path/to/.hippo/images/abc.png}），或原始 URI（如已是 data: URI）
     */
    public String toHttpUrl(String fileUri) {
        if (fileUri == null || fileUri.isEmpty()) {
            return null;
        }
        if (fileUri.startsWith("data:")) {
            return fileUri;
        }
        // 提取相对路径部分
        Matcher matcher = FILE_URI_PATTERN.matcher(fileUri);
        if (matcher.matches()) {
            String relativePath = matcher.group(1);
            // 使用绝对路径，确保 RawFileHandler 在任何 CWD 下都能找到
            Path hippoRoot = WorkspaceManager.getHippoRoot();
            String absolutePath = hippoRoot.resolve(relativePath).normalize().toAbsolutePath().toString().replace("\\", "/");
            return "/api/file/raw?path=" + absolutePath;
        }
        return fileUri;
    }

    /**
     * 删除一张图片文件。
     *
     * @param fileUri file:// 路径
     */
    public boolean deleteImage(String fileUri) {
        Path imageFile = resolveFileUri(fileUri);
        if (imageFile != null && Files.exists(imageFile)) {
            try {
                Files.delete(imageFile);
                logger.debug("图片已删除: {}", fileUri);
                return true;
            } catch (IOException e) {
                logger.warn("删除图片失败: {}", fileUri, e);
            }
        }
        return false;
    }

    /**
     * 获取图片目录路径。
     */
    public Path getImagesDir() {
        return imagesDir;
    }

    // ==================== 内部方法 ====================

    private String computeHash(byte[] data) {
        digest.reset();
        byte[] hashBytes = digest.digest(data);
        // 取前 16 字节（128 位）作为文件名，兼顾唯一性和可读性
        byte[] shortHash = new byte[16];
        System.arraycopy(hashBytes, 0, shortHash, 0, 16);
        return HexFormat.of().formatHex(shortHash);
    }

    private String toFileUri(Path imageFile) {
        // 相对于 .hippo 根目录的路径：file://images/{filename}
        // 注意：不含 .hippo 前缀，因为 .hippo 本身是 hippoRoot
        Path hippoRoot = WorkspaceManager.getHippoRoot();
        String relative = hippoRoot.relativize(imageFile).toString().replace("\\", "/");
        return "file://" + relative;
    }

    private Path resolveFileUri(String fileUri) {
        Matcher matcher = FILE_URI_PATTERN.matcher(fileUri);
        if (matcher.matches()) {
            String relativePath = matcher.group(1);
            // 从 .hippo 根目录解析
            Path hippoRoot = WorkspaceManager.getHippoRoot();
            return hippoRoot.resolve(relativePath).normalize();
        }
        return null;
    }

    private String probeMimeType(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".bmp")) return "image/bmp";
        if (name.endsWith(".svg")) return "image/svg+xml";
        try {
            String probed = Files.probeContentType(file);
            if (probed != null) return probed;
        } catch (IOException ignored) {
        }
        return "application/octet-stream";
    }
}
