package com.example.agent.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("工具清单一致性：AgentMode 白名单 vs Prompt 文档")
class ToolConsistencyTest {

    private static final Pattern TOOL_PATTERN = Pattern.compile("^-\\s+([a-z][a-z_]*):");

    @Test
    @DisplayName("base_chat.md 的工具清单与 CHAT 模式白名单一致")
    void baseChatToolsMatchChatMode() {
        Set<String> promptTools = extractTools("prompts/base/base_chat.md");
        Set<String> modeTools = AgentMode.CHAT.getAllowedTools();

        Set<String> extraInPrompt = new HashSet<>(promptTools);
        extraInPrompt.removeAll(modeTools);

        Set<String> missingInPrompt = new HashSet<>(modeTools);
        missingInPrompt.removeAll(promptTools);

        assertTrue(extraInPrompt.isEmpty(),
            "base_chat.md 中以下工具不在 CHAT 模式白名单中: " + extraInPrompt);
        assertTrue(missingInPrompt.isEmpty(),
            "CHAT 模式白名单中的以下工具未在 base_chat.md 中列出: " + missingInPrompt);
    }

    @Test
    @DisplayName("base_coding.md 的工具清单与 CODING 模式白名单一致")
    void baseCodingToolsMatchCodingMode() {
        Set<String> promptTools = extractTools("prompts/base/base_coding.md");
        Set<String> modeTools = AgentMode.CODING.getAllowedTools();

        Set<String> extraInPrompt = new HashSet<>(promptTools);
        extraInPrompt.removeAll(modeTools);

        Set<String> missingInPrompt = new HashSet<>(modeTools);
        missingInPrompt.removeAll(promptTools);

        assertTrue(extraInPrompt.isEmpty(),
            "base_coding.md 中以下工具不在 CODING 模式白名单中: " + extraInPrompt);
        assertTrue(missingInPrompt.isEmpty(),
            "CODING 模式白名单中的以下工具未在 base_coding.md 中列出: " + missingInPrompt);
    }

    private Set<String> extractTools(String resourcePath) {
        Set<String> tools = new HashSet<>();
        InputStream inputStream = getClass().getClassLoader().getResourceAsStream(resourcePath);
        if (inputStream == null) {
            throw new AssertionError("找不到资源文件: " + resourcePath);
        }
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                Matcher matcher = TOOL_PATTERN.matcher(line);
                if (matcher.find()) {
                    tools.add(matcher.group(1));
                }
            }
        } catch (IOException e) {
            throw new AssertionError("读取资源文件失败: " + resourcePath, e);
        }
        return tools;
    }
}
