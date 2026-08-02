package com.example.agent.web.util;

import com.example.agent.logging.WorkspaceManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

public class ConversationJsonlReader {

    private static final Logger logger = LoggerFactory.getLogger(ConversationJsonlReader.class);

    private final ObjectMapper objectMapper;
    private final Map<String, Path> sessionIdToFileCache = new HashMap<>();

    public ConversationJsonlReader(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void refreshFileCache() {
        sessionIdToFileCache.clear();
        Path sessionsDir = WorkspaceManager.getHippoRoot().resolve("sessions");
        if (!Files.exists(sessionsDir)) return;

        try (Stream<Path> dateDirs = Files.list(sessionsDir)) {
            dateDirs.filter(Files::isDirectory).forEach(dateDir -> {
                try (Stream<Path> sessionDirs = Files.list(dateDir)) {
                    sessionDirs.filter(Files::isDirectory).forEach(sessionDir -> {
                        Path jsonl = sessionDir.resolve("conversation.jsonl");
                        if (Files.exists(jsonl)) {
                            sessionIdToFileCache.put(sessionDir.getFileName().toString(), jsonl);
                        }
                    });
                } catch (IOException e) {
                    logger.debug("扫描日期目录失败: {}", dateDir, e);
                }
            });
        } catch (IOException e) {
            logger.error("扫描会话目录失败", e);
        }
    }

    public Path findJsonlFile(String sessionId) {
        if (sessionIdToFileCache.containsKey(sessionId)) {
            return sessionIdToFileCache.get(sessionId);
        }
        refreshFileCache();
        return sessionIdToFileCache.get(sessionId);
    }

    public Map<String, Path> getFileCache() {
        return sessionIdToFileCache;
    }

    public void removeFromCache(String sessionId) {
        sessionIdToFileCache.remove(sessionId);
    }

    public List<Map<String, Object>> readMessages(Path jsonl) {
        List<Map<String, Object>> messages = new ArrayList<>();
        try (Stream<String> lines = Files.lines(jsonl)) {
            lines.forEach(line -> {
                try {
                    JsonNode node = objectMapper.readTree(line);
                    String type = node.path("type").asText("");
                    JsonNode msgNode = node.path("message");
                    String role = msgNode.path("role").asText("");
                    JsonNode contentNode = msgNode.path("content");

                    // 多模态消息：content 可能是数组 [{type:"text",...},{type:"image_url",...}]
                    Object content;
                    boolean isMultimodal = contentNode.isArray();
                    if (isMultimodal) {
                        content = convertMultimodalContent(contentNode);
                    } else {
                        content = contentNode.asText("");
                    }
                    String contentStr = content instanceof String ? (String) content : "";

                    if ("system".equals(role) || "system".equals(type)) return;
                    if (!"user".equals(role) && !"assistant".equals(role) && !"tool".equals(role) && !"tool-result".equals(type)) return;

                    boolean hasToolCalls = "assistant".equals(role) && msgNode.has("tool_calls");
                    boolean hasReasoning = msgNode.has("reasoning_content") && !msgNode.path("reasoning_content").asText().isBlank();
                    // 多模态消息（content 为非空数组）不应被跳过
                    boolean hasMultimodalContent = isMultimodal && content instanceof List && !((List<?>) content).isEmpty();
                    if (contentStr.isBlank() && !hasMultimodalContent && !"tool-result".equals(type) && !hasToolCalls && !hasReasoning) return;

                    Map<String, Object> msgMap = new HashMap<>();
                    msgMap.put("id", msgNode.path("id").asText(""));
                    msgMap.put("role", role.isEmpty() ? type : role);
                    msgMap.put("content", content);

                    if (msgNode.has("reasoning_content")) {
                        msgMap.put("reasoning_content", msgNode.path("reasoning_content").asText());
                    }

                    // 服务端联网搜索标记：随 assistant 消息持久化，刷新后前端据此恢复「已联网搜索」标记
                    if (msgNode.has("web_searched") && msgNode.path("web_searched").asBoolean()) {
                        msgMap.put("web_searched", true);
                    }

                    // 服务端联网搜索动作明细：随 assistant 消息持久化，刷新后前端据此恢复聚合摘要
                    if ("assistant".equals(role) && msgNode.has("web_search_actions")
                            && msgNode.path("web_search_actions").isArray()) {
                        JsonNode actions = msgNode.path("web_search_actions");
                        List<Map<String, Object>> actionList = new ArrayList<>();
                        for (JsonNode act : actions) {
                            Map<String, Object> actionMap = new HashMap<>();
                            String actType = act.path("type").asText("");
                            if (!actType.isEmpty()) {
                                actionMap.put("type", actType);
                            }
                            if (act.has("queries") && act.path("queries").isArray()) {
                                List<String> queries = new ArrayList<>();
                                for (JsonNode q : act.path("queries")) {
                                    queries.add(q.asText());
                                }
                                actionMap.put("queries", queries);
                            }
                            if (act.has("url")) {
                                actionMap.put("url", act.path("url").asText());
                            }
                            if (act.has("pattern")) {
                                actionMap.put("pattern", act.path("pattern").asText());
                            }
                            if (act.has("status")) {
                                actionMap.put("status", act.path("status").asText());
                            }
                            actionList.add(actionMap);
                        }
                        if (!actionList.isEmpty()) {
                            msgMap.put("web_search_actions", actionList);
                        }
                    }

                    if ("assistant".equals(role) && msgNode.has("tool_calls")) {
                        JsonNode toolCalls = msgNode.path("tool_calls");
                        List<Map<String, Object>> calls = new ArrayList<>();
                        for (JsonNode tc : toolCalls) {
                            Map<String, Object> call = new HashMap<>();
                            call.put("id", tc.path("id").asText(""));
                            call.put("name", tc.path("function").path("name").asText(""));
                            call.put("arguments", tc.path("function").path("arguments").asText(""));
                            calls.add(call);
                        }
                        msgMap.put("tool_calls", calls);
                    }

                    if ("tool".equals(role) || "tool-result".equals(type)) {
                        msgMap.put("toolName", msgNode.path("name").asText(""));
                        msgMap.put("toolCallId", msgNode.path("tool_call_id").asText(""));

                        boolean success = true;
                        if (node.has("toolSuccess")) {
                            success = node.path("toolSuccess").asBoolean(true);
                        } else if (msgNode.has("tool_success")) {
                            success = msgNode.path("tool_success").asBoolean(true);
                        } else if (msgNode.has("isError")) {
                            success = !msgNode.path("isError").asBoolean();
                        } else if (!contentStr.isBlank()) {
                            String lowerContent = contentStr.toLowerCase();
                            if (lowerContent.contains("错误:") ||
                                lowerContent.contains("error:") ||
                                lowerContent.contains("失败") ||
                                lowerContent.contains("cancelled") ||
                                lowerContent.contains("user_cancelled") ||
                                lowerContent.contains("权限受限") ||
                                lowerContent.contains("权限拒绝")) {
                                success = false;
                            }
                        }

                        msgMap.put("success", success);
                    }

                    messages.add(msgMap);
                } catch (Exception e) {
                }
            });
        } catch (IOException e) {
            logger.warn("读取 JSONL 失败: {}", jsonl, e);
        }
        return messages;
    }

    /**
     * 将多模态 content 的 JSON 数组节点转为前端可用的 List&lt;Map&gt;。
     * <p>
     * JSONL 中存储的 content 格式：
     * <pre>{@code
     * [{"type":"text","text":"描述下图片"},
     *  {"type":"image_url","image_url":{"url":"file://.hippo/images/abc123.png"}}]
     * }</pre>
     * 转换后 image_url 的 url 从 file:// 转为 HTTP URL。
     * </p>
     */
    private List<Map<String, Object>> convertMultimodalContent(JsonNode contentNode) {
        List<Map<String, Object>> parts = new ArrayList<>();
        if (contentNode == null || !contentNode.isArray()) return parts;

        for (JsonNode item : contentNode) {
            String type = item.path("type").asText("");
            Map<String, Object> part = new HashMap<>();
            part.put("type", type);

            if ("text".equals(type)) {
                part.put("text", item.path("text").asText(""));
            } else if ("image_url".equals(type)) {
                // JSONL 中可能有两种格式：
                //   1. 嵌套格式: {"type":"image_url","image_url":{"url":"file://..."}}  (OpenAI 格式，前端渲染用)
                //   2. 扁平格式: {"type":"image_url","url":"file://..."}  (Jackson @JsonAnyGetter 序列化的 JSONL 格式)
                String url;
                JsonNode imageUrlNode = item.path("image_url");
                if (!imageUrlNode.isMissingNode()) {
                    url = imageUrlNode.path("url").asText("");
                } else {
                    url = item.path("url").asText("");
                }
                // 将 file:// 路径转为前端可访问的 HTTP URL（使用绝对路径）
                if (url != null && url.startsWith("file://")) {
                    String relativePath = url.substring(7);
                    Path hippoRoot = WorkspaceManager.getHippoRoot();
                    // 兼容旧格式：file://{filename}（相对于 imagesDir） vs 新格式：file://images/{filename}（相对于 hippoRoot）
                    Path resolved;
                    if (relativePath.contains("/")) {
                        // 新格式：包含目录前缀，相对于 hippoRoot 解析
                        resolved = hippoRoot.resolve(relativePath);
                    } else {
                        // 旧格式：只有文件名，相对于 imagesDir 解析
                        resolved = hippoRoot.resolve("images").resolve(relativePath);
                    }
                    url = resolved.normalize().toAbsolutePath().toString().replace("\\", "/");
                    url = "/api/file/raw?path=" + url;
                }
                Map<String, Object> urlObj = new HashMap<>();
                urlObj.put("url", url);
                part.put("image_url", urlObj);
            }
            parts.add(part);
        }
        return parts;
    }

    public String extractFirstUserMessage(Path jsonl) {
        try (Stream<String> lines = Files.lines(jsonl)) {
            java.util.Optional<String> customTitle = lines
                .map(line -> {
                    try {
                        JsonNode node = objectMapper.readTree(line);
                        if ("custom-title".equals(node.path("type").asText())) {
                            return node.path("title").asText(null);
                        }
                        return null;
                    } catch (Exception e) {
                        return null;
                    }
                })
                .filter(t -> t != null && !t.isBlank())
                .findFirst();

            if (customTitle.isPresent()) {
                return customTitle.get();
            }

            return Files.lines(jsonl)
                .limit(50)
                .map(line -> {
                    try {
                        JsonNode node = objectMapper.readTree(line);
                        if ("user".equals(node.path("type").asText()) ||
                            "user".equals(node.path("message").path("role").asText())) {
                            return node.path("message").path("content").asText("");
                        }
                        return null;
                    } catch (Exception e) {
                        return null;
                    }
                })
                .filter(c -> c != null && !c.isBlank())
                .findFirst()
                .orElse(null);
        } catch (IOException e) {
            return null;
        }
    }
}
