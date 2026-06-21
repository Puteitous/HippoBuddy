package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class WorkspaceConfig {

    private String defaultWorkspacePath = "";

    public WorkspaceConfig() {
    }

    public String getDefaultWorkspacePath() {
        return defaultWorkspacePath;
    }

    public void setDefaultWorkspacePath(String defaultWorkspacePath) {
        this.defaultWorkspacePath = defaultWorkspacePath;
    }

    @Override
    public String toString() {
        return "WorkspaceConfig{" +
                "defaultWorkspacePath='" + defaultWorkspacePath + '\'' +
                '}';
    }
}
