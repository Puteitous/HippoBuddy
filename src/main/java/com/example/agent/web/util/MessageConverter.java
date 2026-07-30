package com.example.agent.web.util;

import com.example.agent.llm.model.ContentPart;
import com.example.agent.llm.model.ImagePart;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.TextPart;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.logging.WorkspaceManager;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MessageConverter {

    public List<Map<String, Object>> convertMessages(List<Message> msgList) {
        List<Map<String, Object>> messages = new ArrayList<>();
        for (Message msg : msgList) {
            String role = msg.getRole();
            if ("system".equals(role)) continue;

            boolean hasToolCalls = "assistant".equals(role) && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty();
            boolean hasReasoning = "assistant".equals(role) && msg.getReasoningContent() != null && !msg.getReasoningContent().isEmpty();
            if ((msg.getContent() == null || msg.getContent().isBlank()) && !hasToolCalls && !hasReasoning) continue;

            Map<String, Object> msgMap = new HashMap<>();
            msgMap.put("id", msg.getId());
            msgMap.put("role", role);

            // 多模态消息：content 为数组，包含 text 和 image_url 片段
            if (msg.isMultimodal()) {
                List<Map<String, Object>> contentParts = new ArrayList<>();
                for (ContentPart part : msg.getContentParts()) {
                    if (part instanceof TextPart) {
                        Map<String, Object> tp = new HashMap<>();
                        tp.put("type", "text");
                        tp.put("text", ((TextPart) part).getText());
                        contentParts.add(tp);
                    } else if (part instanceof ImagePart) {
                        ImagePart ip = (ImagePart) part;
                        String url = ip.getUrl();
                        // 将 file:// 路径转为前端可访问的 HTTP URL
                        String httpUrl = fileUriToHttpUrl(url);
                        Map<String, Object> urlObj = new HashMap<>();
                        urlObj.put("url", httpUrl);
                        Map<String, Object> imgObj = new HashMap<>();
                        imgObj.put("type", "image_url");
                        imgObj.put("image_url", urlObj);
                        contentParts.add(imgObj);
                    }
                }
                msgMap.put("content", contentParts);
            } else {
                msgMap.put("content", msg.getContent());
            }

            if (msg.getReasoningContent() != null && !msg.getReasoningContent().isEmpty()) {
                msgMap.put("reasoning_content", msg.getReasoningContent());
            }

            if (hasToolCalls) {
                List<Map<String, Object>> calls = new ArrayList<>();
                for (ToolCall tc : msg.getToolCalls()) {
                    Map<String, Object> call = new HashMap<>();
                    call.put("id", tc.getId());
                    call.put("name", tc.getFunction().getName());
                    call.put("arguments", tc.getFunction().getArguments());
                    calls.add(call);
                }
                msgMap.put("tool_calls", calls);
            }

            if ("tool".equals(role)) {
                msgMap.put("toolName", msg.getName() != null ? msg.getName() : "");
                msgMap.put("toolCallId", msg.getToolCallId() != null ? msg.getToolCallId() : "");

                boolean success = true;
                if (msg.getToolSuccess() != null) {
                    success = msg.isToolSuccess();
                } else {
                    String content = msg.getContent();
                    if (content != null && !content.isBlank()) {
                        String lowerContent = content.toLowerCase();
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
                }
                msgMap.put("success", success);
            }

            messages.add(msgMap);
        }
        return messages;
    }

    /**
     * 将 file:// 路径转为前端可访问的 HTTP URL。
     * <p>
     * file:// 路径相对于 hippoRoot（如 {@code file://images/abc.png}），
     * 转为使用 hippoRoot 绝对路径的 HTTP URL，确保
     * {@link com.example.agent.web.handler.RawFileHandler} 在任何工作目录下都能正确解析。
     * </p>
     * <p>
     * 兼容旧格式：{@code file://{filename}}（相对于 imagesDir）,
     * 新格式：{@code file://images/{filename}}（相对于 hippoRoot）。
     * </p>
     *
     * @param fileUri file:// 路径或 data: URI
     * @return HTTP URL 或原始 data: URI
     */
    private String fileUriToHttpUrl(String fileUri) {
        if (fileUri == null || fileUri.isEmpty()) return null;
        // data: URI 无需转换
        if (fileUri.startsWith("data:")) return fileUri;
        // file:// 路径转为绝对路径的 HTTP URL
        if (fileUri.startsWith("file://")) {
            String relativePath = fileUri.substring(7);
            Path hippoRoot = WorkspaceManager.getHippoRoot();
            Path resolved;
            if (relativePath.contains("/")) {
                // 新格式：包含目录前缀，相对于 hippoRoot 解析
                resolved = hippoRoot.resolve(relativePath);
            } else {
                // 旧格式：只有文件名，相对于 imagesDir 解析
                resolved = hippoRoot.resolve("images").resolve(relativePath);
            }
            String absolutePath = resolved.normalize().toAbsolutePath().toString().replace("\\", "/");
            return "/api/file/raw?path=" + absolutePath;
        }
        return fileUri;
    }
}
