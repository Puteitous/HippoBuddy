package com.example.agent.llm.stream;

import com.example.agent.llm.model.Usage;

import java.util.List;

/* 
 * 流式输出的分块，包含文本内容、工具调用、完成原因等信息
 */

public class StreamChunk {

    private String content;
    private String reasoning;
    private List<ToolCallDelta> toolCallDeltas;
    private String finishReason;
    private boolean isToolCall;
    private Usage usage;

    public StreamChunk() {
    }

    public StreamChunk(String content) {
        this.content = content;
        this.isToolCall = false;
    }

    public StreamChunk(List<ToolCallDelta> toolCallDeltas) {
        this.toolCallDeltas = toolCallDeltas;
        this.isToolCall = true;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getReasoning() {
        return reasoning;
    }

    public void setReasoning(String reasoning) {
        this.reasoning = reasoning;
    }

    public List<ToolCallDelta> getToolCallDeltas() {
        return toolCallDeltas;
    }

    public void setToolCallDeltas(List<ToolCallDelta> toolCallDeltas) {
        this.toolCallDeltas = toolCallDeltas;
    }

    public String getFinishReason() {
        return finishReason;
    }

    public void setFinishReason(String finishReason) {
        this.finishReason = finishReason;
    }

    public boolean isToolCall() {
        return isToolCall;
    }

    public void setToolCall(boolean toolCall) {
        isToolCall = toolCall;
    }
    
    public Usage getUsage() {
        return usage;
    }
    
    public void setUsage(Usage usage) {
        this.usage = usage;
    }

    public boolean hasContent() {
        return content != null && !content.isEmpty();
    }

    public boolean hasReasoning() {
        return reasoning != null && !reasoning.isEmpty();
    }

    public boolean hasToolCalls() {
        return toolCallDeltas != null && !toolCallDeltas.isEmpty();
    }
    
    public boolean hasUsage() {
        return usage != null;
    }

    @Override
    public String toString() {
        return "StreamChunk{" +
                "content='" + content + '\'' +
                ", reasoning='" + reasoning + '\'' +
                ", toolCallDeltas=" + toolCallDeltas +
                ", finishReason='" + finishReason + '\'' +
                ", isToolCall=" + isToolCall +
                ", usage=" + usage +
                '}';
    }
}
