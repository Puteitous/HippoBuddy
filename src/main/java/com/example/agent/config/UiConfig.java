package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class UiConfig {

    private static final String DEFAULT_THEME = "dark";
    private static final String DEFAULT_PROMPT = "agent";

    /**
     * 默认展示模式:full=完整展示处理过程(思考+工具,收起展开);result=只展示最终结果(默认收起)。
     * 对应前端 ChatPanel 回合折叠容器 processCollapsed 的初始值。
     */
    @JsonProperty("default_process_view")
    private String defaultProcessView = "full";

    private String theme = DEFAULT_THEME;
    private String prompt = DEFAULT_PROMPT;
    
    @JsonProperty("syntax_highlight")
    private boolean syntaxHighlight = true;
    
    @JsonProperty("show_token_usage")
    private boolean showTokenUsage = true;
    
    @JsonProperty("show_timestamp")
    private boolean showTimestamp = false;
    
    @JsonProperty("color_output")
    private boolean colorOutput = true;

    public UiConfig() {
    }

    public String getTheme() {
        return theme;
    }

    public void setTheme(String theme) {
        this.theme = theme;
    }

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    public String getDefaultProcessView() {
        return defaultProcessView;
    }

    public void setDefaultProcessView(String defaultProcessView) {
        this.defaultProcessView = defaultProcessView;
    }

    public boolean isSyntaxHighlight() {
        return syntaxHighlight;
    }

    public void setSyntaxHighlight(boolean syntaxHighlight) {
        this.syntaxHighlight = syntaxHighlight;
    }

    public boolean isShowTokenUsage() {
        return showTokenUsage;
    }

    public void setShowTokenUsage(boolean showTokenUsage) {
        this.showTokenUsage = showTokenUsage;
    }

    public boolean isShowTimestamp() {
        return showTimestamp;
    }

    public void setShowTimestamp(boolean showTimestamp) {
        this.showTimestamp = showTimestamp;
    }

    public boolean isColorOutput() {
        return colorOutput;
    }

    public void setColorOutput(boolean colorOutput) {
        this.colorOutput = colorOutput;
    }

    @Override
    public String toString() {
        return "UiConfig{" +
                "theme='" + theme + '\'' +
                ", prompt='" + prompt + '\'' +
                ", defaultProcessView='" + defaultProcessView + '\'' +
                ", syntaxHighlight=" + syntaxHighlight +
                ", showTokenUsage=" + showTokenUsage +
                ", showTimestamp=" + showTimestamp +
                ", colorOutput=" + colorOutput +
                '}';
    }
}
