package com.example.agent.llm.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * 服务端联网搜索动作（Responses API web_search_call.action）。
 * <p>
 * 对应 DeepSeek Responses API 内置 web_search 工具的三种动作：
 * <ul>
 *   <li>{@code search} — 搜索（queries 数组，真实搜索词）</li>
 *   <li>{@code open_page} — 打开网页（url）</li>
 *   <li>{@code find_in_page} — 页内查找（url + pattern）</li>
 * </ul>
 * {@code status} 为 web_search_call 自身的终态（completed / failed），
 * 用于前端聚合摘要时区分成功与失败动作。
 * </p>
 * <p>
 * 注意：该对象只承载服务端已给出的 action 元数据（搜索词/URL/查找关键词），
 * 不含搜索结果正文或来源摘要（sources / annotations DeepSeek 不返回）。
 * </p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class WebSearchAction {

    /** 动作类型：search / open_page / find_in_page */
    private String type;

    /** search 动作的搜索词列表（可能为空） */
    private List<String> queries;

    /** open_page / find_in_page 动作的目标 URL（含服务端附加的 #ws_call_id= 尾巴） */
    private String url;

    /** find_in_page 动作的页内查找关键词 */
    private String pattern;

    /** web_search_call 终态：completed / failed */
    private String status;

    public WebSearchAction() {
    }

    @JsonProperty("type")
    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    @JsonProperty("queries")
    public List<String> getQueries() {
        return queries;
    }

    public void setQueries(List<String> queries) {
        this.queries = queries;
    }

    @JsonProperty("url")
    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    @JsonProperty("pattern")
    public String getPattern() {
        return pattern;
    }

    public void setPattern(String pattern) {
        this.pattern = pattern;
    }

    @JsonProperty("status")
    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    @Override
    public String toString() {
        return "WebSearchAction{" +
                "type='" + type + '\'' +
                ", queries=" + queries +
                ", url='" + url + '\'' +
                ", pattern='" + pattern + '\'' +
                ", status='" + status + '\'' +
                '}';
    }
}
