package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 视觉模型外部配置模型 — 从 {@code .hippo/vision-models.yaml} 加载。
 * <p>
 * 用于扩展 {@link VisionModelRegistry} 的内置硬编码列表，
 * 用户可以在不修改代码的情况下新增支持视觉的模型。
 * </p>
 *
 * <pre>{@code
 * # .hippo/vision-models.yaml
 * vision_providers:
 *   - google
 *   - gemini
 *
 * vision_models_exact:
 *   - gpt-5.2
 *   - claude-opus-4.5
 *
 * vision_model_patterns:
 *   - "^gpt-5"
 *   - "^claude-"
 * }</pre>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class VisionModelConfig {

    /** 支持视觉的 provider 名称列表（如 google, gemini） */
    @JsonProperty("vision_providers")
    private List<String> visionProviders = new ArrayList<>();

    /** 支持视觉的精确模型名列表（大小写不敏感，匹配时会做标准化） */
    @JsonProperty("vision_models_exact")
    private List<String> visionModelsExact = new ArrayList<>();

    /** 支持视觉的模型名正则模式列表 */
    @JsonProperty("vision_model_patterns")
    private List<String> visionModelPatterns = new ArrayList<>();

    public VisionModelConfig() {
    }

    public List<String> getVisionProviders() {
        return visionProviders;
    }

    public void setVisionProviders(List<String> visionProviders) {
        this.visionProviders = visionProviders != null ? visionProviders : new ArrayList<>();
    }

    public List<String> getVisionModelsExact() {
        return visionModelsExact;
    }

    public void setVisionModelsExact(List<String> visionModelsExact) {
        this.visionModelsExact = visionModelsExact != null ? visionModelsExact : new ArrayList<>();
    }

    public List<String> getVisionModelPatterns() {
        return visionModelPatterns;
    }

    public void setVisionModelPatterns(List<String> visionModelPatterns) {
        this.visionModelPatterns = visionModelPatterns != null ? visionModelPatterns : new ArrayList<>();
    }

    /** 转换为大写标准化的 Set，便于精确匹配 */
    public Set<String> getVisionModelsExactNormalized() {
        Set<String> normalized = new HashSet<>();
        for (String model : visionModelsExact) {
            if (model != null) {
                normalized.add(model.trim().toLowerCase());
            }
        }
        return normalized;
    }

    /** 转换为大写标准化的 Set，便于 provider 匹配 */
    public Set<String> getVisionProvidersNormalized() {
        Set<String> normalized = new HashSet<>();
        for (String provider : visionProviders) {
            if (provider != null) {
                normalized.add(provider.trim().toLowerCase());
            }
        }
        return normalized;
    }

    public boolean isEmpty() {
        return visionProviders.isEmpty() && visionModelsExact.isEmpty() && visionModelPatterns.isEmpty();
    }
}
