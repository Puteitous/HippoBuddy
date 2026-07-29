package com.example.agent.llm.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Objects;

/**
 * 文本内容片段。
 * <p>
 * 对应 OpenAI 格式：{@code {"type": "text", "text": "..."}}
 * </p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TextPart extends ContentPart {

    @JsonProperty("text")
    private String text;

    public TextPart() {
    }

    public TextPart(String text) {
        this.text = text != null ? text : "";
    }

    @Override
    public String getType() {
        return "text";
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text != null ? text : "";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof TextPart)) return false;
        TextPart textPart = (TextPart) o;
        return Objects.equals(text, textPart.text);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(text);
    }

    @Override
    public String toString() {
        return "TextPart{text='" + (text != null && text.length() > 50 ? text.substring(0, 50) + "..." : text) + "'}";
    }
}
