package com.example.agent.llm.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Objects;

/**
 * 图片内容片段。
 * <p>
 * 对应 OpenAI 格式：
 * <pre>{@code
 *   {
 *     "type": "image_url",
 *     "image_url": {
 *       "url": "data:image/png;base64,..."  // 或 "file://.hippo/images/xxx.png"
 *     }
 *   }
 * }</pre>
 * </p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ImagePart extends ContentPart {

    @JsonProperty("image_url")
    private ImageUrl imageUrl;

    public ImagePart() {
    }

    /**
     * @param url 图片 URL，支持 data: URI（发给 LLM 时）或 file:// 路径（存储时）
     */
    public ImagePart(String url) {
        this.imageUrl = new ImageUrl(url);
    }

    @Override
    public String getType() {
        return "image_url";
    }

    public ImageUrl getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(ImageUrl imageUrl) {
        this.imageUrl = imageUrl;
    }

    /**
     * 获取图片 URL 字符串。
     */
    public String getUrl() {
        return imageUrl != null ? imageUrl.getUrl() : null;
    }

    /**
     * 设置图片 URL。
     */
    public void setUrl(String url) {
        if (this.imageUrl == null) {
            this.imageUrl = new ImageUrl();
        }
        this.imageUrl.setUrl(url);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ImagePart)) return false;
        ImagePart imagePart = (ImagePart) o;
        return Objects.equals(imageUrl, imagePart.imageUrl);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(imageUrl);
    }

    @Override
    public String toString() {
        String url = getUrl();
        if (url == null) return "ImagePart{url=null}";
        if (url.startsWith("data:")) {
            return "ImagePart{url=data:..., len=" + url.length() + "}";
        }
        return "ImagePart{url='" + url + "'}";
    }

    /**
     * 图片 URL 对象。
     * <p>
     * 对应 OpenAI 格式中的 {@code "image_url": {"url": "..."}}
     * </p>
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ImageUrl {
        @JsonProperty("url")
        private String url;

        public ImageUrl() {
        }

        public ImageUrl(String url) {
            this.url = url;
        }

        public String getUrl() {
            return url;
        }

        public void setUrl(String url) {
            this.url = url;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof ImageUrl)) return false;
            ImageUrl imageUrl = (ImageUrl) o;
            return Objects.equals(url, imageUrl.url);
        }

        @Override
        public int hashCode() {
            return Objects.hashCode(url);
        }

        @Override
        public String toString() {
            if (url == null) return "null";
            if (url.startsWith("data:")) return "data:..., len=" + url.length();
            return url;
        }
    }
}
