package com.example.agent.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 视觉模型注册表 — 判断当前配置的 LLM 是否支持多模态（图片输入）。
 * <p>
 * 支持三种判断模式：
 * <ul>
 *   <li><b>auto</b>（默认）：根据已知模型列表自动判断</li>
 *   <li><b>true</b>：用户手动声明支持</li>
 *   <li><b>false</b>：用户手动声明不支持</li>
 * </ul>
 * </p>
 *
 * <h3>模型列表来源（优先级从高到低）</h3>
 * <ol>
 *   <li><b>外部配置</b>：{@code vision-models.yaml}（与 config.yaml 同级），
 *       用户可在此文件中追加新模型，无需改代码</li>
 *   <li><b>内置硬编码</b>：本类中静态初始化的已知模型列表（兜底）</li>
 * </ol>
 */
public class VisionModelRegistry {

    private static final Logger logger = LoggerFactory.getLogger(VisionModelRegistry.class);

    /** 外部配置文件名（与 config.yaml 同级） */
    private static final String EXTERNAL_CONFIG_FILE = "vision-models.yaml";

    // =========================================================
    //  内置硬编码列表（兜底）
    // =========================================================

    /** 已知支持视觉的 provider 级别 */
    private static final Set<String> DEFAULT_VISION_PROVIDERS = new HashSet<>(Arrays.asList(
        "google", "gemini"
    ));

    /** 已知支持视觉的精确模型名（小写标准化） */
    private static final Set<String> DEFAULT_VISION_MODELS_EXACT = new HashSet<>(Arrays.asList(
        // OpenAI
        "gpt-4o", "gpt-4o-2024-05-13", "gpt-4o-2024-08-06", "gpt-4o-2024-11-20",
        "gpt-4o-mini", "gpt-4o-mini-2024-07-18",
        "gpt-4-turbo", "gpt-4-turbo-2024-04-09", "gpt-4-vision-preview",
        "gpt-4.5-preview",
        "o1", "o1-2024-12-17", "o3-mini", "o4-mini",
        // Anthropic
        "claude-3-5-sonnet", "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku", "claude-3-5-haiku-20241022",
        "claude-3-opus", "claude-3-opus-20240229",
        "claude-4", "claude-4-20250514",
        "claude-sonnet-4", "claude-sonnet-4-20250514",
        "claude-opus-4", "claude-opus-4-20250514",
        "claude-opus-5", "claude-opus-5-20250514",
        // Kimi (月之暗面) — 原生多模态
        "kimi-k3", "kimi-k2.6", "kimi-k2.5",
        // Moonshot 视觉预览版
        "moonshot-v1-8k-vision-preview",
        "moonshot-v1-32k-vision-preview",
        "moonshot-v1-128k-vision-preview",
        // Qwen Omni 全模态
        "qwen3.5-omni-plus", "qwen3.5-omni-flash", "qwen3.5-omni-light",
        // GLM 视觉模型
        "glm-5v-turbo", "glm-4.6v", "glm-4.6v-flash",
        "glm-4.1v-thinking-flashx", "glm-4.1v-thinking-flash", "glm-4v-flash",
        // Qwen3.7-Plus 多模态交互智能体
        "qwen3.7-plus", "qwen3.7-plus-preview",
        // Qwen3.8-Max-Preview 原生多模态旗舰
        "qwen3.8-max-preview"
    ));

    /** 已知支持视觉的模型名前缀模式 */
    private static final List<Pattern> DEFAULT_VISION_MODEL_PATTERNS = Arrays.asList(
        // OpenAI
        Pattern.compile("^gpt-4o", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^gpt-4-turbo", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^gpt-4-vision", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^o1", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^o3", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^o4", Pattern.CASE_INSENSITIVE),
        // Anthropic
        Pattern.compile("^claude-3", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^claude-4", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^claude-sonnet-4", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^claude-opus-4", Pattern.CASE_INSENSITIVE),
        Pattern.compile("^claude-opus-5", Pattern.CASE_INSENSITIVE),
        // Ollama 视觉模型
        Pattern.compile("llava", Pattern.CASE_INSENSITIVE),
        Pattern.compile("bakllava", Pattern.CASE_INSENSITIVE),
        Pattern.compile("yi-vl", Pattern.CASE_INSENSITIVE),
        // Qwen 视觉模型
        Pattern.compile("qwen.*vl", Pattern.CASE_INSENSITIVE),
        Pattern.compile("qwen2\\.5.*vl", Pattern.CASE_INSENSITIVE),
        Pattern.compile("qwen-vl", Pattern.CASE_INSENSITIVE),
        Pattern.compile("qwen2-vl", Pattern.CASE_INSENSITIVE),
        // Qwen Omni 全模态（文本+图片+音频+视频）
        Pattern.compile("qwen3\\.5-omni", Pattern.CASE_INSENSITIVE),
        Pattern.compile("qwen-image", Pattern.CASE_INSENSITIVE),
        // Qwen3.7-Plus 多模态版（Max 是纯文本，用 plus 区分）
        Pattern.compile("qwen3\\.7-plus", Pattern.CASE_INSENSITIVE),
        // Qwen3.8-Max-Preview 原生多模态旗舰
        Pattern.compile("qwen3\\.8-max", Pattern.CASE_INSENSITIVE),
        // CogVLM
        Pattern.compile("cogvlm", Pattern.CASE_INSENSITIVE),
        // GLM 视觉模型（命名规则：含 v/ocr 的为视觉版，纯数字为纯文本）
        Pattern.compile("glm-\\d.*v", Pattern.CASE_INSENSITIVE),
        Pattern.compile("glm-ocr", Pattern.CASE_INSENSITIVE),
        // InternVL
        Pattern.compile("internvl", Pattern.CASE_INSENSITIVE),
        // DeepSeek VL
        Pattern.compile("deepseek.*vl", Pattern.CASE_INSENSITIVE),
        // MiniCPM
        Pattern.compile("minicpm", Pattern.CASE_INSENSITIVE),
        // Kimi (月之暗面) — k2.5+ 原生多模态
        Pattern.compile("^kimi-k", Pattern.CASE_INSENSITIVE),
        // Moonshot 视觉预览版
        Pattern.compile("moonshot.*vision-preview", Pattern.CASE_INSENSITIVE)
    );

    // =========================================================
    //  运行时合并后的列表（内置 + 外部配置）
    // =========================================================

    /** 运行时生效的 provider 集合 */
    private static volatile Set<String> effectiveVisionProviders;

    /** 运行时生效的精确模型名集合（小写标准化） */
    private static volatile Set<String> effectiveVisionModelsExact;

    /** 运行时生效的模式列表 */
    private static volatile List<Pattern> effectiveVisionModelPatterns;

    /** 外部配置文件路径（仅用于日志和 reload） */
    private static volatile String loadedConfigPath;

    static {
        // 初始加载：合并内置列表 + 外部配置
        reload();
    }

    // =========================================================
    //  外部配置加载
    // =========================================================

    /**
     * 从外部 YAML 文件加载视觉模型配置，与内置列表合并后生效。
     * <p>
     * 搜索路径（优先级从高到低）：
     * <ol>
     *   <li>{@code hippo.data.dir}/vision-models.yaml</li>
     *   <li>{@code user.dir}/vision-models.yaml</li>
     *   <li>内置硬编码列表（无外部文件时）</li>
     * </ol>
     * </p>
     */
    public static synchronized void reload() {
        // 1. 从内置列表初始化
        Set<String> providers = new HashSet<>(DEFAULT_VISION_PROVIDERS);
        Set<String> exactModels = new HashSet<>(DEFAULT_VISION_MODELS_EXACT);
        List<Pattern> patterns = new ArrayList<>(DEFAULT_VISION_MODEL_PATTERNS);

        // 2. 尝试加载外部配置
        VisionModelConfig external = loadExternalConfig();
        if (external != null && !external.isEmpty()) {
            // 合并 provider
            providers.addAll(external.getVisionProvidersNormalized());

            // 合并精确模型名
            exactModels.addAll(external.getVisionModelsExactNormalized());

            // 合并正则模式
            for (String patternStr : external.getVisionModelPatterns()) {
                if (patternStr != null && !patternStr.trim().isEmpty()) {
                    try {
                        patterns.add(Pattern.compile(patternStr.trim(), Pattern.CASE_INSENSITIVE));
                    } catch (Exception e) {
                        logger.warn("忽略无效的正则模式 '{}': {}", patternStr, e.getMessage());
                    }
                }
            }

            logger.info("已加载外部视觉模型配置: {} (providers={}, exact={}, patterns={})",
                loadedConfigPath != null ? loadedConfigPath : "(未知)",
                external.getVisionProviders().size(),
                external.getVisionModelsExact().size(),
                external.getVisionModelPatterns().size());
        }

        // 3. 设置为不可变，发布到运行时
        effectiveVisionProviders = Collections.unmodifiableSet(providers);
        effectiveVisionModelsExact = Collections.unmodifiableSet(exactModels);
        effectiveVisionModelPatterns = Collections.unmodifiableList(patterns);

        logger.debug("视觉模型注册表已刷新: providers={}, exact={}, patterns={}",
            effectiveVisionProviders.size(), effectiveVisionModelsExact.size(), effectiveVisionModelPatterns.size());
    }

    /**
     * 尝试从文件系统加载外部 vision-models.yaml。
     */
    private static VisionModelConfig loadExternalConfig() {
        // 搜索路径列表
        List<Path> searchPaths = new ArrayList<>();

        // 1. hippo.data.dir 系统属性
        String hippoDataDir = System.getProperty("hippo.data.dir");
        if (hippoDataDir != null && !hippoDataDir.isBlank()) {
            searchPaths.add(Paths.get(hippoDataDir, EXTERNAL_CONFIG_FILE));
        }

        // 2. user.dir（项目根目录）
        String userDir = System.getProperty("user.dir");
        if (userDir != null) {
            searchPaths.add(Paths.get(userDir, EXTERNAL_CONFIG_FILE));
        }

        // 3. 当前工作目录
        searchPaths.add(Paths.get(EXTERNAL_CONFIG_FILE));

        // 去重
        searchPaths = searchPaths.stream().distinct().collect(Collectors.toList());

        for (Path path : searchPaths) {
            File file = path.toFile();
            if (file.exists() && file.isFile()) {
                try {
                    ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
                    mapper.findAndRegisterModules();
                    VisionModelConfig config = mapper.readValue(file, VisionModelConfig.class);
                    loadedConfigPath = file.getAbsolutePath();
                    return config;
                } catch (IOException e) {
                    logger.warn("读取外部视觉模型配置失败: {} - {}", file.getAbsolutePath(), e.getMessage());
                }
            }
        }

        loadedConfigPath = null;
        return null;
    }

    // =========================================================
    //  判断逻辑
    // =========================================================

    /**
     * 判断当前配置的模型是否支持视觉（图片输入）。
     *
     * @param provider       模型提供商（openai / anthropic / ollama 等）
     * @param model          模型名称
     * @param visionSupported 用户配置的 vision_supported 值：null/"auto"/"true"/"false"
     * @return true 表示支持视觉
     */
    public static boolean supportsVision(String provider, String model, String visionSupported) {
        // 1. 用户手动声明
        if (visionSupported != null) {
            String trimmed = visionSupported.trim().toLowerCase(Locale.ROOT);
            if ("true".equals(trimmed)) {
                return true;
            }
            if ("false".equals(trimmed)) {
                logger.debug("用户配置声明不支持视觉: provider={}, model={}", provider, model);
                return false;
            }
        }

        // 2. auto 模式：自动判断（使用运行时合并后的列表）
        if (provider == null) {
            return false;
        }
        String normalizedProvider = provider.trim().toLowerCase(Locale.ROOT);

        // 2a. provider 级别判断
        if (effectiveVisionProviders.contains(normalizedProvider)) {
            return true;
        }

        // 2b. 模型名精确匹配
        if (model != null) {
            String normalizedModel = model.trim().toLowerCase(Locale.ROOT);
            if (effectiveVisionModelsExact.contains(normalizedModel)) {
                return true;
            }

            // 2c. 模型名模式匹配
            for (Pattern pattern : effectiveVisionModelPatterns) {
                if (pattern.matcher(normalizedModel).find()) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 简化判断：仅根据配置对象判断。
     */
    public static boolean supportsVision(LlmConfig config) {
        if (config == null) return false;
        return supportsVision(config.getProvider(), config.getModel(), config.getVisionSupported());
    }

    // =========================================================
    //  查询当前生效的配置（用于日志、调试）
    // =========================================================

    public static String getLoadedConfigPath() {
        return loadedConfigPath;
    }

    public static int getProviderCount() {
        return effectiveVisionProviders.size();
    }

    public static int getExactModelCount() {
        return effectiveVisionModelsExact.size();
    }

    public static int getPatternCount() {
        return effectiveVisionModelPatterns.size();
    }
}
