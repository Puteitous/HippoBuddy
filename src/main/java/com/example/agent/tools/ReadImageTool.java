package com.example.agent.tools;

import com.example.agent.config.Config;
import com.example.agent.config.VisionModelRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 读取本地图片并交给视觉模型查看。
 * <p>
 * 工具的返回值只能是文本，因此图片本体通过 {@link #drainPendingImages()} 旁路交给编排层，
 * 由编排层在下一轮 LLM 调用前注入为多模态消息（见 WebAgentOrchestrator）。
 * </p>
 */
public class ReadImageTool implements ToolExecutor {

    private static final Logger logger = LoggerFactory.getLogger(ReadImageTool.class);

    private static final long MAX_INPUT_BYTES = 20 * 1024 * 1024;
    private static final long DOWNSCALE_THRESHOLD_BYTES = 1_500_000;
    private static final int MAX_DIMENSION = 1568;
    private static final float JPEG_QUALITY = 0.85f;

    private static final Set<String> SUPPORTED_EXTENSIONS = Set.of("png", "jpg", "jpeg", "gif", "bmp");

    /** 单轮（一次工具批次）最多读取的图片数，防止一次注入过多图片撑爆上下文 */
    private static final int MAX_IMAGES_PER_TURN = 8;

    /**
     * 当前线程本轮已读取的图片数。工具同步执行于编排线程，按轮重置
     * （编排层在每轮 LLM 调用前调用 {@link #resetTurnImageCount()}）。
     */
    private static final ThreadLocal<Integer> TURN_IMAGE_COUNT = ThreadLocal.withInitial(() -> 0);

    /**
     * 待注入图片（按执行线程隔离）。图片在工具执行时写入，编排层在本轮工具批次结束后取走。
     */
    private static final ThreadLocal<List<ReadImage>> PENDING_IMAGES =
            ThreadLocal.withInitial(ArrayList::new);

    /**
     * 工具产出的图片。
     *
     * @param fileUri     存储路径（{@code file://images/{hash}.{ext}}）
     * @param displayPath 展示用的相对路径
     * @param width       宽度
     * @param height      高度
     */
    public record ReadImage(String fileUri, String displayPath, int width, int height) {
    }

    /**
     * 取走当前线程上待注入的图片（读取后清空）。
     */
    public static List<ReadImage> drainPendingImages() {
        List<ReadImage> pending = PENDING_IMAGES.get();
        if (pending.isEmpty()) {
            return Collections.emptyList();
        }
        List<ReadImage> result = new ArrayList<>(pending);
        PENDING_IMAGES.remove();
        return result;
    }

    /** 重置本轮图片计数（编排层每轮 LLM 调用前调用）。 */
    public static void resetTurnImageCount() {
        TURN_IMAGE_COUNT.remove();
    }

    private volatile ImageStoreService imageStore;

    @Override
    public String getName() {
        return "read_image";
    }

    @Override
    public String getDescription() {
        return "读取本地图片文件并交给视觉模型查看，支持 png/jpg/jpeg/gif/bmp。";
    }

    @Override
    public String getParametersSchema() {
        return """
            {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要读取的图片路径（绝对路径或相对路径）"
                    }
                },
                "required": ["path"]
            }
            """;
    }

    @Override
    public List<String> getAffectedPaths(JsonNode arguments) {
        if (arguments.has("path") && !arguments.get("path").isNull()) {
            return Collections.singletonList(arguments.get("path").asText());
        }
        return Collections.emptyList();
    }

    @Override
    public String execute(JsonNode arguments) throws ToolExecutionException {
        if (!arguments.has("path") || arguments.get("path").isNull()) {
            throw new ToolExecutionException("缺少必需参数: path");
        }
        String filePath = arguments.get("path").asText();
        if (filePath == null || filePath.trim().isEmpty()) {
            throw new ToolExecutionException("path 参数不能为空");
        }

        Path path = PathSecurityUtils.validateAndResolveRead(filePath);
        if (!Files.exists(path)) {
            throw new ToolExecutionException("文件不存在: " + filePath);
        }
        if (!Files.isRegularFile(path)) {
            throw new ToolExecutionException("不是常规文件: " + filePath);
        }

        String extension = extensionOf(path);
        if (!SUPPORTED_EXTENSIONS.contains(extension)) {
            throw new ToolExecutionException(
                    "不支持的图片格式: " + (extension.isEmpty() ? "(无扩展名)" : extension)
                    + "。read_image 仅支持 png/jpg/jpeg/gif/bmp；svg/webp 等请先转换为 png 后重试。");
        }

        if (!isVisionSupported()) {
            throw new ToolExecutionException(
                    "当前模型不支持图片识别（vision_supported=false 或未匹配到视觉模型），无法查看图片。");
        }

        if (TURN_IMAGE_COUNT.get() >= MAX_IMAGES_PER_TURN) {
            throw new ToolExecutionException(
                    "本轮已读取 " + MAX_IMAGES_PER_TURN + " 张图片，已达上限。"
                    + "请先基于已读取的图片回答，或下一轮继续读取。");
        }

        try {
            long size = Files.size(path);
            if (size > MAX_INPUT_BYTES) {
                throw new ToolExecutionException(String.format(
                        "图片过大（%d 字节），最大支持 %d MB", size, MAX_INPUT_BYTES / 1024 / 1024));
            }

            byte[] original = Files.readAllBytes(path);
            BufferedImage image;
            try (ByteArrayInputStream in = new ByteArrayInputStream(original)) {
                image = ImageIO.read(in);
            }
            if (image == null) {
                throw new ToolExecutionException("无法解析该文件为图片，请确认文件未损坏: " + filePath);
            }

            int width = image.getWidth();
            int height = image.getHeight();
            boolean needReencode = original.length > DOWNSCALE_THRESHOLD_BYTES
                    || Math.max(width, height) > MAX_DIMENSION;

            byte[] payload = original;
            String format = extension;
            String mimeType = mimeTypeOf(extension);
            if (needReencode) {
                BufferedImage scaled = scale(image);
                width = scaled.getWidth();
                height = scaled.getHeight();
                payload = encodeJpeg(scaled);
                format = "jpeg";
                mimeType = "image/jpeg";
            }

            String dataUri = "data:" + mimeType + ";base64,"
                    + Base64.getEncoder().encodeToString(payload);
            String fileUri = getImageStore().saveImage(dataUri);
            String displayPath = PathSecurityUtils.getRelativePath(path);

            PENDING_IMAGES.get().add(new ReadImage(fileUri, displayPath, width, height));
            TURN_IMAGE_COUNT.set(TURN_IMAGE_COUNT.get() + 1);
            logger.info("read_image 已加载图片: {} -> {} ({}x{}, {} 字节)",
                    displayPath, fileUri, width, height, payload.length);

            return String.format("图片已读取: %s (%dx%d, %s)。图片内容将随下一条消息提供给模型查看。",
                    displayPath, width, height, humanSize(payload.length));
        } catch (IOException e) {
            throw new ToolExecutionException("读取图片失败: " + e.getMessage(), e);
        }
    }

    private ImageStoreService getImageStore() {
        if (imageStore == null) {
            synchronized (this) {
                if (imageStore == null) {
                    imageStore = new ImageStoreService();
                }
            }
        }
        return imageStore;
    }

    private static String extensionOf(Path path) {
        String name = path.getFileName() != null ? path.getFileName().toString().toLowerCase(Locale.ROOT) : "";
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot + 1) : "";
    }

    private static String mimeTypeOf(String extension) {
        return switch (extension) {
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "bmp" -> "image/bmp";
            default -> "image/png";
        };
    }

    private static String humanSize(int bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        return String.format("%.1f KB", bytes / 1024.0);
    }

    private static boolean isVisionSupported() {
        try {
            Config config = Config.getInstance();
            return config == null || config.getLlm() == null
                    || VisionModelRegistry.supportsVision(config.getLlm());
        } catch (Throwable t) {
            // 配置不可用时不做拦截，交给客户端的多模态降级逻辑处理
            return true;
        }
    }

    private static BufferedImage scale(BufferedImage source) {
        int maxSide = Math.max(source.getWidth(), source.getHeight());
        if (maxSide <= MAX_DIMENSION) {
            return source;
        }
        double ratio = (double) MAX_DIMENSION / maxSide;
        int width = Math.max(1, (int) Math.round(source.getWidth() * ratio));
        int height = Math.max(1, (int) Math.round(source.getHeight() * ratio));

        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            // JPEG 不支持透明通道，先铺白底，避免 PNG 透明区域变黑
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        return target;
    }

    private static byte[] encodeJpeg(BufferedImage image) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(JPEG_QUALITY);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream imageOutput = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(imageOutput);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }
}
