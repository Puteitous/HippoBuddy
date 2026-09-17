package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 插件目录配置。
 * <p>
 * registry_url:远程插件目录 index.json 地址(留空表示仅使用内置目录)。
 * 前端经插件市场从后端读取此地址(由 ConfigApiHandler 暴露 plugins 节),
 * 并由 /api/plugins/registry 代理拉取远程目录内容,避免前端直连跨域。
 * </p>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PluginConfig {

    // 默认远程目录:Gitee raw(仓库镜像,国内可达性好)。可在 config.yaml 的 plugins.registry_url 覆盖。
    private String registry_url = "https://gitee.com/putetou/HippoBuddy/raw/main/plugin-index.json";

    public PluginConfig() {
    }

    @JsonProperty("registry_url")
    public String getRegistryUrl() {
        return registry_url;
    }

    public void setRegistryUrl(String registryUrl) {
        this.registry_url = registryUrl;
    }

    @Override
    public String toString() {
        return "PluginConfig{" +
                "registry_url='" + registry_url + '\'' +
                '}';
    }
}