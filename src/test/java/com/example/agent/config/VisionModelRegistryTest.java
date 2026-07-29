package com.example.agent.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;

/**
 * VisionModelRegistry 测试 — 验证内置列表、外部配置加载和合并逻辑。
 */
class VisionModelRegistryTest {

    // =========================================================
    //  已覆盖的内置模型（回归测试）
    // =========================================================

    @Nested
    @DisplayName("内置硬编码列表 - OpenAI")
    class BuiltinOpenAI {
        @Test @DisplayName("GPT-4o 系列")
        void gpt4o() {
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4o", null));
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4o-mini", null));
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4-turbo", null));
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4-vision-preview", null));
        }

        @Test @DisplayName("o1/o3/o4 系列")
        void oSeries() {
            assertTrue(VisionModelRegistry.supportsVision("openai", "o1", null));
            assertTrue(VisionModelRegistry.supportsVision("openai", "o3-mini", null));
            assertTrue(VisionModelRegistry.supportsVision("openai", "o4-mini", null));
        }

        @Test @DisplayName("不支持的旧模型")
        void unsupported() {
            assertFalse(VisionModelRegistry.supportsVision("openai", "gpt-3.5-turbo", null));
            assertFalse(VisionModelRegistry.supportsVision("openai", "gpt-4", null)); // 无后缀
        }
    }

    @Nested
    @DisplayName("内置硬编码列表 - Anthropic")
    class BuiltinAnthropic {
        @Test @DisplayName("Claude 3/4 系列")
        void claudeSeries() {
            assertTrue(VisionModelRegistry.supportsVision("anthropic", "claude-3-5-sonnet", null));
            assertTrue(VisionModelRegistry.supportsVision("anthropic", "claude-4", null));
            assertTrue(VisionModelRegistry.supportsVision("anthropic", "claude-opus-4", null));
            assertTrue(VisionModelRegistry.supportsVision("anthropic", "claude-opus-5", null));
            assertTrue(VisionModelRegistry.supportsVision("anthropic", "claude-sonnet-4", null));
        }

        @Test @DisplayName("不支持的旧模型")
        void unsupported() {
            assertFalse(VisionModelRegistry.supportsVision("anthropic", "claude-2", null));
            assertFalse(VisionModelRegistry.supportsVision("anthropic", "claude-instant-1", null));
        }
    }

    @Nested
    @DisplayName("内置硬编码列表 - Kimi (月之暗面)")
    class BuiltinKimi {
        @Test @DisplayName("Kimi K3/K2.6/K2.5 系列")
        void kimiSeries() {
            assertTrue(VisionModelRegistry.supportsVision("moonshot", "kimi-k3", null));
            assertTrue(VisionModelRegistry.supportsVision("moonshot", "kimi-k2.6", null));
            assertTrue(VisionModelRegistry.supportsVision("moonshot", "kimi-k2.5", null));
        }

        @Test @DisplayName("Moonshot 视觉预览版")
        void moonshotVision() {
            assertTrue(VisionModelRegistry.supportsVision("moonshot", "moonshot-v1-8k-vision-preview", null));
            assertTrue(VisionModelRegistry.supportsVision("moonshot", "moonshot-v1-32k-vision-preview", null));
            assertTrue(VisionModelRegistry.supportsVision("moonshot", "moonshot-v1-128k-vision-preview", null));
        }

        @Test @DisplayName("纯文本 Moonshot 不支持")
        void moonshotTextOnly() {
            assertFalse(VisionModelRegistry.supportsVision("moonshot", "moonshot-v1-8k", null));
            assertFalse(VisionModelRegistry.supportsVision("moonshot", "moonshot-v1-32k", null));
            assertFalse(VisionModelRegistry.supportsVision("moonshot", "moonshot-v1-128k", null));
        }
    }

    @Nested
    @DisplayName("内置硬编码列表 - GLM 视觉模型")
    class BuiltinGLM {
        @Test @DisplayName("GLM 视觉版（含 v/ocr）")
        void glmVision() {
            assertTrue(VisionModelRegistry.supportsVision("zhipu", "glm-5v-turbo", null));
            assertTrue(VisionModelRegistry.supportsVision("zhipu", "glm-4.6v", null));
            assertTrue(VisionModelRegistry.supportsVision("zhipu", "glm-4.6v-flash", null));
            assertTrue(VisionModelRegistry.supportsVision("zhipu", "glm-4.1v-thinking-flashx", null));
            assertTrue(VisionModelRegistry.supportsVision("zhipu", "glm-4v-flash", null));
            assertTrue(VisionModelRegistry.supportsVision("zhipu", "glm-ocr", null));
        }

        @Test @DisplayName("GLM 纯文本版应该不支持")
        void glmTextOnly() {
            assertFalse(VisionModelRegistry.supportsVision("zhipu", "glm-5.2", null));
            assertFalse(VisionModelRegistry.supportsVision("zhipu", "glm-5.1", null));
            assertFalse(VisionModelRegistry.supportsVision("zhipu", "glm-5", null));
            assertFalse(VisionModelRegistry.supportsVision("zhipu", "glm-4.7", null));
            assertFalse(VisionModelRegistry.supportsVision("zhipu", "glm-4.6", null));
        }
    }

    @Nested
    @DisplayName("内置硬编码列表 - Qwen Omni 全模态")
    class BuiltinQwenOmni {
        @Test @DisplayName("Qwen3.5-Omni 系列")
        void qwenOmni() {
            assertTrue(VisionModelRegistry.supportsVision("dashscope", "qwen3.5-omni-plus", null));
            assertTrue(VisionModelRegistry.supportsVision("dashscope", "qwen3.5-omni-flash", null));
            assertTrue(VisionModelRegistry.supportsVision("dashscope", "qwen3.5-omni-light", null));
        }

        @Test @DisplayName("qwen-image 图像生成")
        void qwenImage() {
            assertTrue(VisionModelRegistry.supportsVision("dashscope", "qwen-image-3.0-pro", null));
        }

        @Test @DisplayName("Qwen3.7-Plus 多模态版")
        void qwen37Plus() {
            assertTrue(VisionModelRegistry.supportsVision("dashscope", "qwen3.7-plus", null));
            assertTrue(VisionModelRegistry.supportsVision("dashscope", "qwen3.7-plus-preview", null));
        }

        @Test @DisplayName("Qwen3.8-Max-Preview 原生多模态")
        void qwen38Max() {
            assertTrue(VisionModelRegistry.supportsVision("dashscope", "qwen3.8-max-preview", null));
        }

        @Test @DisplayName("Qwen3.7-Max 纯文本版不支持")
        void qwen37MaxTextOnly() {
            assertFalse(VisionModelRegistry.supportsVision("dashscope", "qwen3.7-max", null));
        }
    }

    @Nested
    @DisplayName("内置硬编码列表 - Provider 级")
    class BuiltinProvider {
        @Test @DisplayName("Google/Gemini 全系列支持")
        void googleProvider() {
            assertTrue(VisionModelRegistry.supportsVision("google", "gemini-2.0-pro", null));
            assertTrue(VisionModelRegistry.supportsVision("gemini", "gemini-3-pro", null));
            assertTrue(VisionModelRegistry.supportsVision("google", "gemini-3.5-flash", null));
        }
    }

    @Nested
    @DisplayName("内置硬编码列表 - 社区/开源模型")
    class BuiltinCommunity {
        @Test @DisplayName("Ollama 视觉模型")
        void ollamaVision() {
            assertTrue(VisionModelRegistry.supportsVision("ollama", "llava", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "llava-v1.6", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "bakllava", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "yi-vl", null));
        }

        @Test @DisplayName("Qwen-VL 系列")
        void qwenVL() {
            assertTrue(VisionModelRegistry.supportsVision("ollama", "qwen-vl", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "qwen2.5-vl-72b", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "qwen2-vl-7b", null));
        }

        @Test @DisplayName("其他开源视觉模型")
        void otherVision() {
            assertTrue(VisionModelRegistry.supportsVision("ollama", "cogvlm", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "glm-4v", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "internvl", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "deepseek-vl", null));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "minicpm", null));
        }
    }

    // =========================================================
    //  用户配置覆盖
    // =========================================================

    @Nested
    @DisplayName("用户配置覆盖")
    class UserOverride {
        @Test @DisplayName("vision_supported=true 强制开启")
        void forceTrue() {
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-3.5-turbo", "true"));
            assertTrue(VisionModelRegistry.supportsVision("ollama", "some-random-model", "true"));
            assertTrue(VisionModelRegistry.supportsVision("unknown", "unknown", "true"));
        }

        @Test @DisplayName("vision_supported=false 强制关闭")
        void forceFalse() {
            assertFalse(VisionModelRegistry.supportsVision("openai", "gpt-4o", "false"));
            assertFalse(VisionModelRegistry.supportsVision("google", "gemini-2.0", "false"));
        }

        @Test @DisplayName("vision_supported=auto/null 走自动判断")
        void autoMode() {
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4o", "auto"));
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4o", null));
            assertFalse(VisionModelRegistry.supportsVision("openai", "gpt-3.5-turbo", "auto"));
        }
    }

    // =========================================================
    //  外部配置加载
    // =========================================================

    @Nested
    @DisplayName("外部配置加载（vision-models.yaml）")
    class ExternalConfig {

        @TempDir
        Path tempDir;

        private String originalUserDir;
        private String originalHippoDataDir;

        @BeforeEach
        void setUp() {
            // 保存原始系统属性
            originalUserDir = System.getProperty("user.dir");
            originalHippoDataDir = System.getProperty("hippo.data.dir");
            // 清除 hippo.data.dir，让加载器使用 user.dir
            System.clearProperty("hippo.data.dir");
        }

        @AfterEach
        void tearDown() {
            // 恢复原始系统属性
            if (originalUserDir != null) {
                System.setProperty("user.dir", originalUserDir);
            } else {
                System.clearProperty("user.dir");
            }
            if (originalHippoDataDir != null) {
                System.setProperty("hippo.data.dir", originalHippoDataDir);
            } else {
                System.clearProperty("hippo.data.dir");
            }
            // 重新加载恢复默认状态
            VisionModelRegistry.reload();
        }

        @Test
        @DisplayName("外部配置合并到内置列表 - 模型名精确匹配")
        void externalExactModel() throws IOException {
            // 模拟 user.dir 指向临时目录
            System.setProperty("user.dir", tempDir.toString());

            // 创建 vision-models.yaml
            File configFile = tempDir.resolve("vision-models.yaml").toFile();
            String yaml = """
                vision_models_exact:
                  - gpt-5.2
                  - claude-opus-4.5
                  - llama-4-scout
                """;
            ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
            mapper.writeValue(configFile, mapper.readTree(yaml));

            // 重新加载
            VisionModelRegistry.reload();

            // 验证：外部配置中的模型应该被识别
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-5.2", null),
                "外部配置的 gpt-5.2 应该被识别");
            assertTrue(VisionModelRegistry.supportsVision("anthropic", "claude-opus-4.5", null),
                "外部配置的 claude-opus-4.5 应该被识别");
            assertTrue(VisionModelRegistry.supportsVision("meta", "llama-4-scout", null),
                "外部配置的 llama-4-scout 应该被识别");

            // 验证：内置列表仍然有效（回归）
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4o", null),
                "内置列表的 gpt-4o 仍然应该被识别");
            assertTrue(VisionModelRegistry.supportsVision("google", "gemini-2.0-pro", null),
                "内置列表的 google provider 仍然应该被识别");
        }

        @Test
        @DisplayName("外部配置 - 正则模式匹配")
        void externalPatterns() throws IOException {
            System.setProperty("user.dir", tempDir.toString());

            File configFile = tempDir.resolve("vision-models.yaml").toFile();
            String yaml = """
                vision_model_patterns:
                  - "^gpt-5"
                  - "^claude-opus-4\\\\."
                  - "^kimi"
                  - "^seed-2"
                  - "pixtral"
                """;
            ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
            mapper.writeValue(configFile, mapper.readTree(yaml));

            VisionModelRegistry.reload();

            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-5.2-thinking", null));
            assertTrue(VisionModelRegistry.supportsVision("anthropic", "claude-opus-4.5", null));
            assertTrue(VisionModelRegistry.supportsVision("moonshot", "kimi-k2", null));
            assertTrue(VisionModelRegistry.supportsVision("bytedance", "seed-2.0-pro", null));
            assertTrue(VisionModelRegistry.supportsVision("mistral", "pixtral-large", null));

            // 不匹配的应该返回 false
            assertFalse(VisionModelRegistry.supportsVision("openai", "gpt-4", null));
        }

        @Test
        @DisplayName("外部配置 - Provider 级别匹配")
        void externalProviders() throws IOException {
            System.setProperty("user.dir", tempDir.toString());

            File configFile = tempDir.resolve("vision-models.yaml").toFile();
            String yaml = """
                vision_providers:
                  - moonshot
                  - bytedance
                  - baidu
                """;
            ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
            mapper.writeValue(configFile, mapper.readTree(yaml));

            VisionModelRegistry.reload();

            assertTrue(VisionModelRegistry.supportsVision("moonshot", "kimi-k2", null));
            assertTrue(VisionModelRegistry.supportsVision("bytedance", "seed-2.0-pro", null));
            assertTrue(VisionModelRegistry.supportsVision("baidu", "ernie-6.0", null));
        }

        @Test
        @DisplayName("外部配置文件不存在时，回退到内置列表")
        void fallbackToBuiltin() {
            System.setProperty("user.dir", tempDir.toString());
            // 不创建 vision-models.yaml

            VisionModelRegistry.reload();

            // 内置列表应该正常工作
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4o", null));
            assertFalse(VisionModelRegistry.supportsVision("openai", "gpt-3.5-turbo", null));
        }

        @Test
        @DisplayName("外部配置文件格式错误时，回退到内置列表")
        void fallbackOnInvalidYaml() throws IOException {
            System.setProperty("user.dir", tempDir.toString());

            // 创建格式错误的 YAML
            File configFile = tempDir.resolve("vision-models.yaml").toFile();
            java.nio.file.Files.writeString(configFile.toPath(), "{invalid: yaml: broken: }");

            // 不应该抛异常
            assertDoesNotThrow(() -> VisionModelRegistry.reload());

            // 内置列表应该正常工作
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4o", null));
        }

        @Test
        @DisplayName("reload() 多次调用后合并结果正确")
        void reloadMultipleTimes() throws IOException {
            System.setProperty("user.dir", tempDir.toString());

            // 第一次：加一些模型
            File configFile = tempDir.resolve("vision-models.yaml").toFile();
            String yaml1 = """
                vision_models_exact:
                  - gpt-5.2
                """;
            ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
            mapper.writeValue(configFile, mapper.readTree(yaml1));
            VisionModelRegistry.reload();
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-5.2", null));

            // 第二次：换一批模型
            String yaml2 = """
                vision_models_exact:
                  - claude-opus-4.5
                """;
            mapper.writeValue(configFile, mapper.readTree(yaml2));
            VisionModelRegistry.reload();
            assertTrue(VisionModelRegistry.supportsVision("anthropic", "claude-opus-4.5", null));

            // 内置列表始终有效
            assertTrue(VisionModelRegistry.supportsVision("openai", "gpt-4o", null));
        }
    }

    // =========================================================
    //  边缘情况
    // =========================================================

    @Nested
    @DisplayName("边缘情况")
    class EdgeCases {
        @Test @DisplayName("provider 为 null 返回 false")
        void nullProvider() {
            assertFalse(VisionModelRegistry.supportsVision(null, "gpt-4o", null));
        }

        @Test @DisplayName("model 为 null 但 provider 匹配时返回 true")
        void nullModel() {
            assertTrue(VisionModelRegistry.supportsVision("google", null, null));
        }

        @Test @DisplayName("config 为 null 返回 false")
        void nullConfig() {
            assertFalse(VisionModelRegistry.supportsVision((LlmConfig) null));
        }

        @Test @DisplayName("大小写不敏感")
        void caseInsensitive() {
            assertTrue(VisionModelRegistry.supportsVision("OPENAI", "GPT-4O", null));
            assertTrue(VisionModelRegistry.supportsVision("Anthropic", "Claude-4", null));
            assertTrue(VisionModelRegistry.supportsVision("Google", "gemini-pro", null));
        }
    }
}
