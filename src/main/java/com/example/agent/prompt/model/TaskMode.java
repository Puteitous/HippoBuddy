package com.example.agent.prompt.model;

public enum TaskMode {

    CHAT("chat", "聊天对话模式"),
    CODING("coding", "通用编程模式"),
    OFFICE("office", "办公效率模式");

    private final String key;
    private final String displayName;

    TaskMode(String key, String displayName) {
        this.key = key;
        this.displayName = displayName;
    }

    public String getKey() {
        return key;
    }

    public String getDisplayName() {
        return displayName;
    }
}
