package com.example.agent.llm.model;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * 多模态消息内容片段。
 * <p>
 * 支持文本（text）和图片（image_url）两种类型。
 * 通过 Jackson 多态注解实现自动序列化/反序列化：
 * <pre>{@code
 *   {"type": "text", "text": "hello"}
 *   {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
 * }</pre>
 * </p>
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = TextPart.class, name = "text"),
    @JsonSubTypes.Type(value = ImagePart.class, name = "image_url")
})
public abstract class ContentPart {

    /**
     * 获取此内容片段的类型标识。
     * 由 Jackson {@code @JsonTypeInfo} 自动处理，子类无需额外实现。
     */
    public abstract String getType();
}
