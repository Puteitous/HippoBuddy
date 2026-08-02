package com.example.agent.llm.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class Message {

    private String id;
    private String role;
    
    /**
     * 消息内容。
     * <p>
     * 兼容两种形态：
     * <ul>
     *   <li>{@code String} — 纯文本消息（向后兼容）</li>
     *   <li>{@code List<ContentPart>} — 多模态消息（text + image_url 等）</li>
     * </ul>
     * Jackson 序列化时，String 输出为字符串，List 自动输出为数组。
     * </p>
     * <p>
     * 字段上标注 {@code @JsonProperty("content")}，确保反序列化时 content
     * 能被正确写入（{@code getContent()} 上有 {@code @JsonIgnore}，
     * 若仅靠 getter/setter 推断会导致 content 属性被当作只读而丢失）。
     * </p>
     */
    @JsonProperty("content")
    private Object content;
    
    @JsonProperty("reasoning_content")
    private String reasoningContent;
    
    @JsonProperty("tool_calls")
    private List<ToolCall> toolCalls;
    
    @JsonProperty("cache_control")
    private CacheControl cacheControl;
    
    @JsonProperty("tool_call_id")
    private String toolCallId;
    
    private String name;
    
    @JsonProperty("message_type")
    private String messageType;

    @JsonProperty("tool_success")
    private Boolean toolSuccess;

    /**
     * 本回合是否执行过服务端联网搜索（Responses API 的 web_search 内置工具）。
     * 用于前端展示「已联网搜索」标记，随消息持久化到 JSONL，刷新后保持一致。
     */
    @JsonProperty("web_searched")
    private Boolean webSearched;

    /**
     * 本回合服务端联网搜索的动作明细（search / open_page / find_in_page）。
     * 仅承载 action 元数据（搜索词/URL/查找关键词），不含搜索结果正文。
     * 随消息持久化到 JSONL，刷新后前端据此恢复聚合摘要。
     */
    @JsonProperty("web_search_actions")
    private List<WebSearchAction> webSearchActions;

    public Message() {
        this.id = java.util.UUID.randomUUID().toString();
    }

    public Message(String role, String content) {
        // 使用LLM标准role作为默认值，避免发送API不识别的"unknown"
        this.role = (role != null && !role.trim().isEmpty()) ? role.trim() : "user";
        this.content = content != null ? content : "";
        this.id = java.util.UUID.randomUUID().toString();
    }

    /**
     * 创建多模态消息（含图片等非文本内容）。
     *
     * @param role         消息角色（user / assistant / system / tool）
     * @param textContent  文本内容
     * @param imageParts   图片内容片段列表
     */
    public Message(String role, String textContent, List<ImagePart> imageParts) {
        this.role = (role != null && !role.trim().isEmpty()) ? role.trim() : "user";
        this.id = java.util.UUID.randomUUID().toString();

        List<ContentPart> parts = new ArrayList<>();
        if (textContent != null && !textContent.isEmpty()) {
            parts.add(new TextPart(textContent));
        }
        if (imageParts != null) {
            parts.addAll(imageParts);
        }
        this.content = parts.isEmpty() ? "" : parts;
    }

    public static Message system(String content) {
        return new Message("system", content);
    }

    public static Message user(String content) {
        return new Message("user", content);
    }

    public static Message assistant(String content) {
        return new Message("assistant", content);
    }

    public static Message assistantWithToolCalls(List<ToolCall> toolCalls) {
        return assistantWithToolCalls(toolCalls, null);
    }

    public static Message assistantWithToolCalls(List<ToolCall> toolCalls, String reasoningContent) {
        Message message = new Message();
        message.setRole("assistant");
        if (toolCalls != null && !toolCalls.isEmpty()) {
            message.setToolCalls(toolCalls);
        }
        message.setReasoningContent(reasoningContent);
        return message;
    }

    public static Message toolResult(String toolCallId, String name, String content) {
        if (toolCallId == null || toolCallId.trim().isEmpty()) {
            throw new IllegalArgumentException("toolCallId不能为null或空");
        }
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("name不能为null或空");
        }
        Message message = new Message("tool", content != null ? content : "");
        message.setToolCallId(toolCallId.trim());
        message.setName(name.trim());
        return message;
    }

    public static Message memorySaved(List<String> paths) {
        String content = "💾 Memory saved: " + String.join(", ", paths);
        Message msg = new Message("system", content);
        msg.messageType = "memory_saved";
        return msg;
    }

    public boolean isSystem() {
        return "system".equals(role);
    }

    public boolean isUser() {
        return "user".equals(role);
    }

    public boolean isAssistant() {
        return "assistant".equals(role);
    }

    public boolean isTool() {
        return "tool".equals(role);
    }

    public boolean isMemorySaved() {
        return "memory_saved".equals(messageType);
    }

    public boolean isApiVisible() {
        return messageType == null || "normal".equals(messageType);
    }

    public String getMessageType() {
        return messageType;
    }

    public void setMessageType(String messageType) {
        this.messageType = messageType;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        // 使用LLM标准role作为默认值，避免发送API不识别的"unknown"
        this.role = (role != null && !role.trim().isEmpty()) ? role.trim() : "user";
    }

    /**
     * 获取文本内容。
     * <p>
     * 对于多模态消息（含图片），会自动提取所有 TextPart 拼接返回。
     * 如需获取完整的内容片段列表，请使用 {@link #getContentParts()}。
     * </p>
     *
     * @return 文本内容，不会为 null
     */
    @JsonIgnore
    public String getContent() {
        if (content instanceof String) {
            return (String) content;
        }
        if (content instanceof List) {
            @SuppressWarnings("unchecked")
            List<ContentPart> parts = (List<ContentPart>) content;
            return parts.stream()
                .filter(p -> p instanceof TextPart)
                .map(p -> ((TextPart) p).getText())
                .collect(Collectors.joining("\n"));
        }
        return "";
    }

    /**
     * 设置纯文本内容。
     * 如果消息之前包含多模态内容（如图片），调用此方法会清除它们。
     */
    public void setContent(String content) {
        this.content = content != null ? content : "";
    }

    /**
     * 用于 Jackson 序列化的 content 字段。
     * <p>
     * 纯文本消息返回 String，多模态消息返回 ContentPart 数组。
     * 这样发往 LLM API 时 content 字段格式正确：
     * <ul>
     *   <li>纯文本: {@code "content": "hello"}</li>
     *   <li>多模态: {@code "content": [{"type":"text","text":"..."},{"type":"image_url",...}]}</li>
     * </ul>
     * </p>
     */
    @JsonProperty("content")
    public Object getContentForSerialization() {
        if (content instanceof List) {
            return content; // Jackson 会序列化为 JSON 数组
        }
        return getContent(); // 纯文本，返回 String
    }

    /**
     * 获取多模态内容片段列表。
     * <p>
     * 如果消息是纯文本（非多模态），返回 {@code null}。
     * 返回的列表不可修改，如需修改请使用 {@link #setContentParts(List)}。
     * </p>
     *
     * @return 内容片段列表，或 null（纯文本消息）
     */
    @JsonIgnore
    @SuppressWarnings("unchecked")
    public List<ContentPart> getContentParts() {
        if (content instanceof List) {
            List<?> list = (List<?>) content;
            // Jackson 反序列化 Object 类型时，数组元素可能是 LinkedHashMap
            // 需要做一次惰性转换
            if (!list.isEmpty() && !(list.get(0) instanceof ContentPart)) {
                return Collections.unmodifiableList(convertContentParts(list));
            }
            return Collections.unmodifiableList((List<ContentPart>) content);
        }
        return null;
    }

    /**
     * 将 Jackson 反序列化产生的 List&lt;Map&gt; 转换为 List&lt;ContentPart&gt;。
     */
    @SuppressWarnings("unchecked")
    private List<ContentPart> convertContentParts(List<?> rawList) {
        List<ContentPart> parts = new ArrayList<>();
        for (Object item : rawList) {
            if (item instanceof ContentPart) {
                parts.add((ContentPart) item);
            } else if (item instanceof java.util.Map) {
                java.util.Map<String, Object> map = (java.util.Map<String, Object>) item;
                String type = (String) map.get("type");
                if ("text".equals(type)) {
                    TextPart tp = new TextPart();
                    tp.setText((String) map.get("text"));
                    parts.add(tp);
                } else if ("image_url".equals(type)) {
                    ImagePart ip = new ImagePart();
                    java.util.Map<String, Object> imgUrl = (java.util.Map<String, Object>) map.get("image_url");
                    if (imgUrl != null) {
                        ip.setUrl((String) imgUrl.get("url"));
                    }
                    parts.add(ip);
                }
            }
        }
        // 替换为转换后的列表，下次直接命中
        this.content = parts;
        return parts;
    }

    /**
     * 设置多模态内容片段列表。
     * <p>
     * 设置后，{@link #getContent()} 返回的文本会从 TextPart 中提取拼接。
     * 传入 null 或空列表会清除多模态内容，变为空字符串消息。
     * </p>
     */
    public void setContentParts(List<ContentPart> parts) {
        if (parts == null || parts.isEmpty()) {
            this.content = "";
        } else {
            this.content = new ArrayList<>(parts);
        }
    }

    /**
     * 判断是否为多模态消息（含图片等非文本内容）。
     */
    public boolean isMultimodal() {
        return content instanceof List;
    }

    /**
     * 便捷方法：向消息末尾追加一个图片内容片段。
     *
     * @param imagePart 图片内容片段
     */
    public void addImage(ImagePart imagePart) {
        if (imagePart == null) return;

        List<ContentPart> parts;
        if (content instanceof List) {
            @SuppressWarnings("unchecked")
            List<ContentPart> existing = (List<ContentPart>) content;
            parts = new ArrayList<>(existing);
        } else {
            parts = new ArrayList<>();
            // 保留原有文本
            String text = content instanceof String ? (String) content : "";
            if (!text.isEmpty()) {
                parts.add(new TextPart(text));
            }
        }
        parts.add(imagePart);
        this.content = parts;
    }

    public String getReasoningContent() {
        return reasoningContent;
    }

    public void setReasoningContent(String reasoningContent) {
        this.reasoningContent = reasoningContent;
    }

    public CacheControl getCacheControl() {
        return cacheControl;
    }

    public void setCacheControl(CacheControl cacheControl) {
        this.cacheControl = cacheControl;
    }

    public void enableEphemeralCache() {
        this.cacheControl = CacheControl.ephemeral();
    }

    public Message shallowCopy() {
        Message copy = new Message();
        copy.id = this.id;
        copy.role = this.role;
        if (this.content instanceof List) {
            @SuppressWarnings("unchecked")
            List<ContentPart> parts = (List<ContentPart>) this.content;
            copy.content = new ArrayList<>(parts);
        } else {
            copy.content = this.content; // String 是不可变的，直接共享
        }
        copy.reasoningContent = this.reasoningContent;
        copy.toolCalls = this.toolCalls != null ? new ArrayList<>(this.toolCalls) : null;
        copy.cacheControl = this.cacheControl;
        copy.toolCallId = this.toolCallId;
        copy.name = this.name;
        copy.messageType = this.messageType;
        copy.toolSuccess = this.toolSuccess;
        copy.webSearched = this.webSearched;
        if (this.webSearchActions != null) {
            copy.webSearchActions = new ArrayList<>(this.webSearchActions);
        }
        return copy;
    }

    public List<ToolCall> getToolCalls() {
        return toolCalls;
    }

    public void setToolCalls(List<ToolCall> toolCalls) {
        if (toolCalls == null) {
            this.toolCalls = null;
        } else {
            // 过滤掉null元素
            this.toolCalls = toolCalls.stream()
                .filter(tc -> tc != null)
                .collect(java.util.stream.Collectors.toList());
        }
    }

    public void addToolCall(ToolCall toolCall) {
        if (this.toolCalls == null) {
            this.toolCalls = new ArrayList<>();
        }
        this.toolCalls.add(toolCall);
    }

    public String getToolCallId() {
        return toolCallId;
    }

    public void setToolCallId(String toolCallId) {
        this.toolCallId = toolCallId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Boolean getToolSuccess() {
        return toolSuccess;
    }

    public void setToolSuccess(Boolean toolSuccess) {
        this.toolSuccess = toolSuccess;
    }

    public boolean isToolSuccess() {
        return toolSuccess != null && toolSuccess;
    }

    public Boolean getWebSearched() {
        return webSearched;
    }

    public void setWebSearched(Boolean webSearched) {
        this.webSearched = webSearched;
    }

    public boolean isWebSearched() {
        return webSearched != null && webSearched;
    }

    public List<WebSearchAction> getWebSearchActions() {
        return webSearchActions;
    }

    public void setWebSearchActions(List<WebSearchAction> webSearchActions) {
        this.webSearchActions = webSearchActions;
    }

    public Message withId(String id) {
        this.id = id;
        return this;
    }

    @Override
    public String toString() {
        String contentStr;
        if (content instanceof String) {
            String s = (String) content;
            contentStr = s.length() > 100 ? s.substring(0, 100) + "..." : s;
        } else if (content instanceof List) {
            @SuppressWarnings("unchecked")
            List<ContentPart> parts = (List<ContentPart>) content;
            long imageCount = parts.stream().filter(p -> p instanceof ImagePart).count();
            long textCount = parts.stream().filter(p -> p instanceof TextPart).count();
            contentStr = "[multimodal: " + textCount + " text, " + imageCount + " image]";
        } else {
            contentStr = String.valueOf(content);
        }
        return "Message{" +
                "role='" + role + '\'' +
                ", content=" + contentStr +
                ", toolCalls=" + toolCalls +
                ", toolCallId='" + toolCallId + '\'' +
                ", name='" + name + '\'' +
                ", cacheControl=" + cacheControl +
                '}';
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CacheControl {
        private String type = "ephemeral";

        public CacheControl() {
        }

        public CacheControl(String type) {
            this.type = type;
        }

        public static CacheControl ephemeral() {
            return new CacheControl("ephemeral");
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        @Override
        public String toString() {
            return type;
        }
    }
}