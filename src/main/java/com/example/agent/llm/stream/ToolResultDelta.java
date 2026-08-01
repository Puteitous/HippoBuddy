package com.example.agent.llm.stream;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

/*
 * 工具结果的增量通知，用于流式过程中标记某个工具已完成（成功或失败）。
 * 典型场景：Responses API 服务端内置 web_search 完成时，由客户端
 * 转换为 ToolResultDelta，供上层（WebAgentOrchestrator）发送 tool_result
 * SSE 事件收尾前端进度卡片。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ToolResultDelta {

    private String id;

    private String name;

    private boolean success;

    private String error;

    private String resultContent;

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

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public String getResultContent() {
        return resultContent;
    }

    public void setResultContent(String resultContent) {
        this.resultContent = resultContent;
    }

    @Override
    public String toString() {
        return "ToolResultDelta{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", success=" + success +
                ", error='" + error + '\'' +
                '}';
    }
}
