package com.example.agent.session;

import com.example.agent.llm.model.Message;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class SessionData {

    public enum Status {
        ACTIVE,
        COMPLETED,
        INTERRUPTED,
        IGNORED
    }

    private String sessionId;
    private List<Message> messages;
    private LocalDateTime createdAt;
    private LocalDateTime lastActiveAt;
    private Status status;
    private int messageCount;
    private String lastUserMessage;
    private String workspacePath;

    public SessionData() {
        this.messages = new ArrayList<>();
        this.createdAt = LocalDateTime.now();
        this.lastActiveAt = LocalDateTime.now();
        this.status = Status.ACTIVE;
    }

    public SessionData(String sessionId) {
        this();
        this.sessionId = sessionId;
    }

    public static SessionData create(String sessionId, List<Message> messages, Status status) {
        SessionData data = new SessionData(sessionId);
        data.setMessages(messages);
        data.setStatus(status);
        data.setMessageCount(messages != null ? messages.size() : 0);
        data.extractLastUserMessage(messages);
        return data;
    }

    private void extractLastUserMessage(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return;
        }
        for (int i = messages.size() - 1; i >= 0; i--) {
            Message msg = messages.get(i);
            String role = msg.getRole();
            String content = msg.getContent();
            if ("user".equals(role) && content != null && !content.isEmpty()) {
                this.lastUserMessage = content.length() > 100 
                    ? content.substring(0, 100) + "..." 
                    : content;
                break;
            }
        }
    }

    public void touch() {
        this.lastActiveAt = LocalDateTime.now();
    }

    public boolean isActive() {
        return status == Status.ACTIVE || status == Status.INTERRUPTED;
    }

    public boolean canResume() {
        return status == Status.INTERRUPTED;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public List<Message> getMessages() {
        return messages;
    }

    public void setMessages(List<Message> messages) {
        this.messages = messages != null ? messages : new ArrayList<>();
        this.messageCount = this.messages.size();
        extractLastUserMessage(this.messages);
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getLastActiveAt() {
        return lastActiveAt;
    }

    public void setLastActiveAt(LocalDateTime lastActiveAt) {
        this.lastActiveAt = lastActiveAt;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public int getMessageCount() {
        return messageCount;
    }

    public void setMessageCount(int messageCount) {
        this.messageCount = messageCount;
    }

    public String getLastUserMessage() {
        return lastUserMessage;
    }

    public void setLastUserMessage(String lastUserMessage) {
        this.lastUserMessage = lastUserMessage;
    }

    public String getWorkspacePath() {
        return workspacePath;
    }

    public void setWorkspacePath(String workspacePath) {
        this.workspacePath = workspacePath;
    }

    public String getLastToolCalls() {
        if (messages == null || messages.isEmpty()) {
            return null;
        }
        
        Message lastMessage = messages.get(messages.size() - 1);
        if (lastMessage.getToolCalls() == null || lastMessage.getToolCalls().isEmpty()) {
            return null;
        }
        
        return lastMessage.getToolCalls().stream()
            .filter(tc -> tc != null && tc.getFunction() != null)
            .map(tc -> tc.getFunction().getName())
            .filter(name -> name != null && !name.isEmpty())
            .collect(java.util.stream.Collectors.joining(", "));
    }

    @Override
    public String toString() {
        return "SessionData{" +
                "sessionId='" + sessionId + '\'' +
                ", status=" + status +
                ", messageCount=" + messageCount +
                ", createdAt=" + createdAt +
                ", lastActiveAt=" + lastActiveAt +
                '}';
    }
}
