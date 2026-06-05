package com.example.agent.tools.web;

import com.fasterxml.jackson.annotation.JsonProperty;

public class WebSearchConfig {

    private String provider = "brave";

    @JsonProperty("api_key")
    private String apiKey = "";

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public boolean isEnabled() {
        return apiKey != null && !apiKey.trim().isEmpty();
    }
}
