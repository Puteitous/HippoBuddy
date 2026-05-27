package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class WebConfig {

    public static final int DEFAULT_PORT = 9090;

    private int port = DEFAULT_PORT;

    public WebConfig() {
    }

    @JsonProperty("port")
    public int getPort() {
        return port;
    }

    public void setPort(int port) {
        this.port = port;
    }

    @Override
    public String toString() {
        return "WebConfig{" +
                "port=" + port +
                '}';
    }
}
