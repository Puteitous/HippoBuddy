package com.example.agent.web.handler;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.prompt.PromptLibrary;
import com.example.agent.prompt.PromptService;
import com.example.agent.prompt.model.Prompt;
import com.example.agent.prompt.model.PromptType;
import com.example.agent.prompt.model.TaskMode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class SystemPromptApiHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(SystemPromptApiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private static final List<Map<String, String>> BUILTIN_PRESETS = List.of(
        Map.of(
            "id", "coder",
            "name", "💻 代码助手",
            "description", "专注于代码编写、调试和架构设计",
            "prompt", "You are an expert coding assistant. You write clean, efficient, and well-structured code. When debugging, you systematically analyze problems. When designing, you consider scalability and maintainability. Always respond in the same language as the user's message. Format code with proper syntax. Prefer practical solutions over theoretical ones."
        ),
        Map.of(
            "id", "writer",
            "name", "✍️ 写作助手",
            "description", "专注于文档撰写、文案创作和内容优化",
            "prompt", "You are a skilled writing assistant. You help with documentation, creative writing, content editing, and copywriting. You adapt your writing style to the context - formal for technical docs, engaging for marketing, clear for user guides. Always respond in the same language as the user's message. Structure content with clear headings and paragraphs."
        ),
        Map.of(
            "id", "analyst",
            "name", "🔍 分析助手",
            "description", "专注于数据分析、问题诊断和方案评估",
            "prompt", "You are an analytical assistant focused on data analysis, problem diagnosis, and solution evaluation. You break down complex problems systematically, present findings with clear evidence, and provide balanced assessments with pros and cons. Always respond in the same language as the user's message. Support your analysis with specific data and examples when possible."
        ),
        Map.of(
            "id", "reviewer",
            "name", "👀 代码审查",
            "description", "专注于代码审查、安全检查和最佳实践建议",
            "prompt", "You are a senior code reviewer. You identify bugs, security vulnerabilities, performance issues, and violations of best practices. You suggest improvements with clear explanations. You consider edge cases and error handling. Always respond in the same language as the user's message. Prioritize findings by severity: critical > major > minor > suggestion."
        )
    );

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        try {
            if ("GET".equals(method) && path.equals("/api/system-prompts/presets")) {
                handleGetPresets(exchange);
            } else if ("GET".equals(method) && path.matches("/api/system-prompts/presets/[^/]+")) {
                String presetId = path.substring("/api/system-prompts/presets/".length());
                handleGetPreset(exchange, presetId);
            } else {
                sendError(exchange, 404, "未找到");
            }
        } catch (Exception e) {
            logger.error("SystemPrompt API 错误", e);
            sendError(exchange, 500, "内部错误: " + e.getMessage());
        } finally {
            exchange.close();
        }
    }

    private List<Map<String, String>> buildPresetList() {
        List<Map<String, String>> presetList = new ArrayList<>();

        Map<String, String> defaultPreset = new LinkedHashMap<>();
        defaultPreset.put("id", "default");
        defaultPreset.put("name", "🦛 河马助手");
        defaultPreset.put("description", "通用AI助手，支持文件操作、代码搜索和命令执行");
        defaultPreset.put("prompt", loadPromptFromLibrary(TaskMode.CODING));
        presetList.add(defaultPreset);

        Map<String, String> chatPreset = new LinkedHashMap<>();
        chatPreset.put("id", "chat");
        chatPreset.put("name", "💬 代码顾问");
        chatPreset.put("description", "专注讨论、分析和建议，不直接修改文件");
        chatPreset.put("prompt", loadPromptFromLibrary(TaskMode.CHAT));
        presetList.add(chatPreset);

        presetList.addAll(BUILTIN_PRESETS);

        return presetList;
    }

    private String loadPromptFromLibrary(TaskMode mode) {
        try {
            PromptLibrary library = ServiceLocator.getOrNull(PromptLibrary.class);
            if (library == null) {
                library = PromptLibrary.getInstance();
                library.initialize();
            }
            PromptService promptService = new PromptService();
            return promptService.getSystemPrompt(new PromptService.TaskContext(mode, null, false, 8000));
        } catch (Exception e) {
            logger.warn("从 PromptLibrary 加载 {} 模式失败: {}", mode, e.getMessage());
            return "";
        }
    }

    private void handleGetPresets(HttpExchange exchange) throws IOException {
        List<Map<String, String>> presetList = buildPresetList();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("presets", presetList);
        sendJson(exchange, 200, response);
    }

    private void handleGetPreset(HttpExchange exchange, String presetId) throws IOException {
        List<Map<String, String>> presetList = buildPresetList();
        for (Map<String, String> preset : presetList) {
            if (preset.get("id").equals(presetId)) {
                Map<String, Object> response = new LinkedHashMap<>(preset);
                sendJson(exchange, 200, response);
                return;
            }
        }
        sendError(exchange, 404, "预设不存在: " + presetId);
    }

    private void sendJson(HttpExchange exchange, int statusCode, Object data) throws IOException {
        String json = objectMapper.writeValueAsString(data);
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    private void sendError(HttpExchange exchange, int statusCode, String message) throws IOException {
        Map<String, Object> error = Map.of("error", message);
        String json = objectMapper.writeValueAsString(error);
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        exchange.getResponseBody().write(bytes);
    }
}
