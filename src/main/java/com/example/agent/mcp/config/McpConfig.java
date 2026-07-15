package com.example.agent.mcp.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public class McpConfig {

    private boolean enabled = true;

    @JsonProperty("auto_connect")
    private boolean autoConnect = true;

    @JsonProperty("auto_reconnect")
    private boolean autoReconnect = true;

    @JsonProperty("max_reconnect_attempts")
    private int maxReconnectAttempts = 5;

    @JsonProperty("reconnect_delay_seconds")
    private int reconnectDelaySeconds = 5;

    @JsonProperty("request_timeout")
    private int requestTimeout = 60000;

    private List<McpServerConfig> servers = new ArrayList<>();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class McpServerConfig {
        private String id;
        private String name;
        private String type = "stdio";
        private String command;
        private List<String> args = new ArrayList<>();
        private String url;
        private Map<String, String> env = new HashMap<>();

        @JsonProperty("auto_register_tools")
        private boolean autoRegisterTools = true;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getCommand() {
            return command;
        }

        public void setCommand(String command) {
            this.command = command;
        }

        public List<String> getArgs() {
            return args;
        }

        public void setArgs(List<String> args) {
            this.args = args;
        }

        public String getUrl() {
            return url;
        }

        public void setUrl(String url) {
            this.url = url;
        }

        public Map<String, String> getEnv() {
            return env;
        }

        public void setEnv(Map<String, String> env) {
            this.env = env;
        }

        public boolean isAutoRegisterTools() {
            return autoRegisterTools;
        }

        public void setAutoRegisterTools(boolean autoRegisterTools) {
            this.autoRegisterTools = autoRegisterTools;
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isAutoConnect() {
        return autoConnect;
    }

    public void setAutoConnect(boolean autoConnect) {
        this.autoConnect = autoConnect;
    }

    public boolean isAutoReconnect() {
        return autoReconnect;
    }

    public void setAutoReconnect(boolean autoReconnect) {
        this.autoReconnect = autoReconnect;
    }

    public int getMaxReconnectAttempts() {
        return maxReconnectAttempts;
    }

    public void setMaxReconnectAttempts(int maxReconnectAttempts) {
        this.maxReconnectAttempts = maxReconnectAttempts;
    }

    public int getReconnectDelaySeconds() {
        return reconnectDelaySeconds;
    }

    public void setReconnectDelaySeconds(int reconnectDelaySeconds) {
        this.reconnectDelaySeconds = reconnectDelaySeconds;
    }

    public int getRequestTimeout() {
        return requestTimeout;
    }

    public void setRequestTimeout(int requestTimeout) {
        this.requestTimeout = requestTimeout;
    }

    public List<McpServerConfig> getServers() {
        return servers;
    }

    public void setServers(List<McpServerConfig> servers) {
        this.servers = servers;
    }
}
