package com.example.agent.session;

import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.Usage;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class TranscriptEntry {

    private String type;
    private String uuid;
    private String parentUuid;
    private String sessionId;
    private String timestamp;
    private String version;
    private String cwd;
    private String gitBranch;
    private String userType;

    private Message message;
    private Usage usage;
    private String toolName;
    private String toolCallId;
    private Long toolDurationMs;
    private Boolean toolSuccess;

    private String title;
    private String tag;
    private String boundaryUuid;
    private String summary;

    private Map<String, Object> metadata;

    public TranscriptEntry() {
        this.timestamp = Instant.now().toString();
    }

    public static TranscriptEntry user(String sessionId, Message message) {
        TranscriptEntry entry = baseEntry(sessionId, TranscriptType.USER);
        entry.setMessage(message);
        entry.setUuid(message.getId() != null ? message.getId() : java.util.UUID.randomUUID().toString());
        return entry;
    }

    public static TranscriptEntry assistant(String sessionId, Message message, Usage usage) {
        TranscriptEntry entry = baseEntry(sessionId, TranscriptType.ASSISTANT);
        entry.setMessage(message);
        entry.setUuid(message.getId() != null ? message.getId() : java.util.UUID.randomUUID().toString());
        entry.setUsage(usage);
        return entry;
    }

    public static TranscriptEntry toolResult(String sessionId, Message message, 
                                            String toolName, long durationMs, boolean success) {
        TranscriptEntry entry = baseEntry(sessionId, TranscriptType.TOOL_RESULT);
        entry.setMessage(message);
        entry.setUuid(message.getId() != null ? message.getId() : java.util.UUID.randomUUID().toString());
        entry.setToolName(toolName);
        entry.setToolCallId(message.getToolCallId());
        entry.setToolDurationMs(durationMs);
        entry.setToolSuccess(success);
        return entry;
    }

    public static TranscriptEntry system(String sessionId, String content) {
        TranscriptEntry entry = baseEntry(sessionId, TranscriptType.SYSTEM);
        entry.setUuid(java.util.UUID.randomUUID().toString());
        entry.setMessage(Message.system(content));
        return entry;
    }

    public static TranscriptEntry compactBoundary(String sessionId, String boundaryUuid) {
        TranscriptEntry entry = baseEntry(sessionId, TranscriptType.COMPACT_BOUNDARY);
        entry.setUuid(java.util.UUID.randomUUID().toString());
        entry.setBoundaryUuid(boundaryUuid);
        return entry;
    }

    public static TranscriptEntry customTitle(String sessionId, String title) {
        TranscriptEntry entry = baseEntry(sessionId, TranscriptType.CUSTOM_TITLE);
        entry.setUuid(java.util.UUID.randomUUID().toString());
        entry.setTitle(title);
        return entry;
    }

    public static TranscriptEntry tag(String sessionId, String tag) {
        TranscriptEntry entry = baseEntry(sessionId, TranscriptType.TAG);
        entry.setUuid(java.util.UUID.randomUUID().toString());
        entry.setTag(tag);
        return entry;
    }

    private static TranscriptEntry baseEntry(String sessionId, TranscriptType type) {
        TranscriptEntry entry = new TranscriptEntry();
        entry.setType(type.getValue());
        entry.setSessionId(sessionId);
        entry.setCwd(System.getProperty("user.dir"));
        entry.setVersion("1.0.0");
        return entry;
    }

    public TranscriptType getTypeEnum() {
        return TranscriptType.fromString(type);
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getUuid() {
        return uuid;
    }

    public void setUuid(String uuid) {
        this.uuid = uuid;
    }

    public String getParentUuid() {
        return parentUuid;
    }

    public void setParentUuid(String parentUuid) {
        this.parentUuid = parentUuid;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public String getCwd() {
        return cwd;
    }

    public void setCwd(String cwd) {
        this.cwd = cwd;
    }

    public String getGitBranch() {
        return gitBranch;
    }

    public void setGitBranch(String gitBranch) {
        this.gitBranch = gitBranch;
    }

    public String getUserType() {
        return userType;
    }

    public void setUserType(String userType) {
        this.userType = userType;
    }

    public Message getMessage() {
        return message;
    }

    public void setMessage(Message message) {
        this.message = message;
    }

    public Usage getUsage() {
        return usage;
    }

    public void setUsage(Usage usage) {
        this.usage = usage;
    }

    public String getToolName() {
        return toolName;
    }

    public void setToolName(String toolName) {
        this.toolName = toolName;
    }

    public String getToolCallId() {
        return toolCallId;
    }

    public void setToolCallId(String toolCallId) {
        this.toolCallId = toolCallId;
    }

    public Long getToolDurationMs() {
        return toolDurationMs;
    }

    public void setToolDurationMs(Long toolDurationMs) {
        this.toolDurationMs = toolDurationMs;
    }

    public Boolean getToolSuccess() {
        return toolSuccess;
    }

    public void setToolSuccess(Boolean toolSuccess) {
        this.toolSuccess = toolSuccess;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getTag() {
        return tag;
    }

    public void setTag(String tag) {
        this.tag = tag;
    }

    public String getBoundaryUuid() {
        return boundaryUuid;
    }

    public void setBoundaryUuid(String boundaryUuid) {
        this.boundaryUuid = boundaryUuid;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }
}
