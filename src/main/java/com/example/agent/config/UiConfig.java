package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.HashMap;
import java.util.Map;

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

    /**
     * 用户自定义系统提示词,按任务模式(coding/chat/office)分开存。
     * 某模式下取不到或为空字符串,表示该模式未自定义,聊天时使用内置默认提示词(含规则/技能/工作区增强)。
     */
    @JsonProperty("system_prompts")
    private Map<String, String> systemPrompts = new HashMap<>();

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

    public Map<String, String> getSystemPrompts() {
        return systemPrompts;
    }

    public void setSystemPrompts(Map<String, String> systemPrompts) {
        this.systemPrompts = systemPrompts;
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
