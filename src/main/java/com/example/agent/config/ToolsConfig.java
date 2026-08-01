package com.example.agent.config;

import com.example.agent.tools.web.WebSearchConfig;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ToolsConfig {

    private static final Logger logger = LoggerFactory.getLogger(ToolsConfig.class);

    private BashToolConfig bash = new BashToolConfig();
    private FileToolConfig file = new FileToolConfig();
    private SubAgentToolConfig subagent = new SubAgentToolConfig();

    @JsonProperty("delete_file")
    private DeleteFileToolConfig deleteFile = new DeleteFileToolConfig();

    @JsonProperty("web_search")
    private WebSearchConfig webSearch = new WebSearchConfig();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class BashToolConfig {
        private boolean enabled = true;
        private List<String> whitelist = new ArrayList<>();
        
        @JsonProperty("require_confirmation")
        private boolean requireConfirmation = true;

        public BashToolConfig() {
            whitelist.add("git");
            whitelist.add("mvn");
            whitelist.add("npm");
            whitelist.add("docker");
            whitelist.add("ls");
            whitelist.add("cat");
            whitelist.add("grep");
        }

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public List<String> getWhitelist() {
            return whitelist;
        }

        public void setWhitelist(List<String> whitelist) {
            this.whitelist = whitelist;
        }

        public boolean isRequireConfirmation() {
            return requireConfirmation;
        }

        public void setRequireConfirmation(boolean requireConfirmation) {
            this.requireConfirmation = requireConfirmation;
        }

        /**
         * 配置层是否允许该命令。
         * <p>
         * ⚠️ 安全语义：白名单未配置（空/null）时按<b>拒绝</b>处理（默认拒绝，
         * 宁缺毋滥），由 Blocker 链作为最终安全防线兜底。
         * 注意：本方法在生产执行路径上由 Blocker 链承担最终判断，此配置层
         * 检查仅作第一道粗粒度过滤。
         */
        public boolean isCommandAllowed(String command) {
            if (!enabled) {
                return false;
            }
            if (whitelist == null || whitelist.isEmpty()) {
                // 未配置白名单 → 配置层不表态放行，按拒绝处理
                logger.warn("bash whitelist 未配置（空），配置层默认拒绝所有命令，由 Blocker 链兜底");
                return false;
            }
            String trimmedCommand = command.trim();
            if (trimmedCommand.isEmpty()) {
                return false;
            }
            if (trimmedCommand.contains(";") || trimmedCommand.contains("&&") || 
                trimmedCommand.contains("||") || trimmedCommand.contains("|") ||
                trimmedCommand.contains(">") || trimmedCommand.contains("`") || 
                trimmedCommand.contains("$(")) {
                return false;
            }
            String baseCommand = trimmedCommand.split("\\s+")[0];
            return whitelist.contains(baseCommand);
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
