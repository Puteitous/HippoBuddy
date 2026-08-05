package com.example.agent.web.handler;

import com.example.agent.tools.FileChangeTracker;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 获取文件 AI 修改前的原始内容（作为编辑器内联 diff 的基线）。
 *
 * 策略：仅从 AI 变更记录（FileChangeTracker）按"前端当前会话"取最早一次变更的
 *   originalContent 作基线，git 路线已废弃（git show HEAD 为准会显示"工作区 vs
 *   上次提交"的全量 diff，包含用户自己的改动，与"标记 AI 改动"的语义冲突）。
 *
 * 会话语义（跟随当前激活会话）：
 *   前端传入 sessionId（当前正在使用的会话）→ 只查该会话内该文件的变更，
 *   取最早一条作基线，展示"这一轮会话里 AI 对文件动的所有行"（会话净变化）。
 *   刷新 / 重启后前端恢复同一会话 → 基线仍在磁盘，标记重新出现；
 *   切到其他会话 → 按该会话自己的变更显示，不跨会话叠加。
 *
 * 查询参数：?path=<绝对路径>&sessionId=<当前会话ID>
 * 返回 JSON：{"content":"...", "source":"ai"} 或 {"error":"..."} 或 {}（无基线）
 */
public class DiffOriginalHandler implements HttpHandler {

    private static final Logger logger = LoggerFactory.getLogger(DiffOriginalHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        String query = exchange.getRequestURI().getQuery();
        String filePath = null;
        String sessionId = null;

        if (query != null) {
            for (String param : query.split("&")) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2) {
                    if ("path".equals(kv[0])) {
                        filePath = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                    } else if ("sessionId".equals(kv[0])) {
                        sessionId = java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                    }
                }
            }
        }

        if (filePath == null || filePath.isBlank()) {
            sendJson(exchange, 400, "{\"error\":\"Missing path parameter\"}");
            return;
        }

        Path absPath = Path.of(filePath).normalize();
        if (!Files.exists(absPath)) {
            sendJson(exchange, 404, "{\"error\":\"File not found\"}");
            return;
        }

        // AI 变更记录（按当前会话过滤）
        String aiContent = tryAiTracker(absPath, sessionId);
        if (aiContent != null) {
            sendJson(exchange, 200, toJson(aiContent, "ai"));
            return;
        }

        // 无可用基线
        sendJson(exchange, 200, "{}");
    }

    /**
     * 从"当前会话"的 AI 变更记录中取最早一次变更的原始内容作为 diff 基线。
     * <p>
     * 仅按前端传入的 sessionId（当前激活会话）过滤，不跨会话合并：
     * 显示的是"这一轮会话里 AI 对文件动的所有行"（会话净变化，IDE 式），
     * 而非仅最后一次变更——避免前几次编辑动过的行在编辑器中隐身。
     * <p>
     * 刷新 / 重启后前端恢复同一会话 → 基线仍可从磁盘加载的会话记录取到，
     * 标记重新出现；切到其他会话 → 按该会话自己的变更显示。
     * <p>
     * sessionId 缺失 / 会话无该文件变更 → 返回 null（不显示标记）。
     * 新建文件返回空字符串（diff 插件会标记所有行为新增）。
     * 二进制文件跳过（未保存原始内容）。
     */
    static String tryAiTracker(Path absPath, String sessionId) {
        try {
            if (sessionId == null || sessionId.isEmpty()) return null;
            List<FileChangeTracker.FileChange> changes =
                FileChangeTracker.getSessionFileChanges(sessionId, absPath.toString());
            if (changes == null || changes.isEmpty()) return null;

            // 基线 = 该会话内最早一条（getSessionFileChanges 已按时间升序，get(0) 即最早）
            FileChangeTracker.FileChange first = changes.get(0);
            if (first.binary) return null;
            return first.originalContent != null ? first.originalContent : "";
        } catch (Exception e) {
            logger.debug("AI 变更记录查询失败: {} - {}", absPath, e.getMessage());
        }
        return null;
    }

    private static String toJson(String content, String source) {
        try {
            Map<String, String> map = new HashMap<>();
            map.put("content", content);
            map.put("source", source);
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            return "{\"content\":\"\",\"source\":\"" + source + "\"}";
        }
    }

    private static void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
