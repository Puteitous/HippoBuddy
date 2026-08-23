package com.example.agent.config;

import com.example.agent.tools.web.WebSearchConfig;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ToolsConfig {

    /** 权限模式：strict=仅工作区 + 需确认；relaxed=全目录 + 跳过确认。默认 strict */
    private String mode = "strict";

    private BashToolConfig bash = new BashToolConfig();
    private FileToolConfig file = new FileToolConfig();
    private SubAgentToolConfig subagent = new SubAgentToolConfig();

    @JsonProperty("delete_file")
    private DeleteFileToolConfig deleteFile = new DeleteFileToolConfig();

    @JsonProperty("web_search")
    private WebSearchConfig webSearch = new WebSearchConfig();

    /** 当前是否为宽松模式 */
    public boolean isModeRelaxed() {
        return "relaxed".equalsIgnoreCase(mode);
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class BashToolConfig {
        private boolean enabled = true;
        
        @JsonProperty("require_confirmation")
        private boolean requireConfirmation = true;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public boolean isRequireConfirmation() {
            return requireConfirmation;
        }

        public void setRequireConfirmation(boolean requireConfirmation) {
            this.requireConfirmation = requireConfirmation;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class FileToolConfig {
        public FileToolConfig() {
        }
    }

    public BashToolConfig getBash() {
        return bash;
    }

    public void setBash(BashToolConfig bash) {
        this.bash = bash;
    }

    public FileToolConfig getFile() {
        return file;
    }

    public void setFile(FileToolConfig file) {
        this.file = file;
    }

    public SubAgentToolConfig getSubagent() {
        return subagent;
    }

    public void setSubagent(SubAgentToolConfig subagent) {
        this.subagent = subagent;
    }

    public boolean isSubAgentEnabled() {
        return subagent != null && subagent.isEnabled();
    }

    public WebSearchConfig getWebSearch() {
        return webSearch;
    }

    public void setWebSearch(WebSearchConfig webSearch) {
        this.webSearch = webSearch;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SubAgentToolConfig {
        private boolean enabled = false;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DeleteFileToolConfig {
        @JsonProperty("require_confirmation")
        private boolean requireConfirmation = true;

        public boolean isRequireConfirmation() {
            return requireConfirmation;
        }

        public void setRequireConfirmation(boolean requireConfirmation) {
            this.requireConfirmation = requireConfirmation;
        }
    }

    public DeleteFileToolConfig getDeleteFile() {
        return deleteFile;
    }

    public void setDeleteFile(DeleteFileToolConfig deleteFile) {
        this.deleteFile = deleteFile;
    }
}
