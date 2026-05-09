package com.example.agent.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class MemoryConfig {

    public static final boolean DEFAULT_EXTRACTION_ENABLED = false;
    public static final int DEFAULT_EXTRACTION_INTERVAL = 5;
    public static final boolean DEFAULT_SESSION_EXTRACTION_ENABLED = true;

    @JsonProperty("extraction_enabled")
    private boolean extractionEnabled = DEFAULT_EXTRACTION_ENABLED;

    @JsonProperty("extraction_interval")
    private int extractionInterval = DEFAULT_EXTRACTION_INTERVAL;

    @JsonProperty("session_extraction_enabled")
    private boolean sessionExtractionEnabled = DEFAULT_SESSION_EXTRACTION_ENABLED;

    public MemoryConfig() {
    }

    public boolean isExtractionEnabled() {
        return extractionEnabled;
    }

    public void setExtractionEnabled(boolean extractionEnabled) {
        this.extractionEnabled = extractionEnabled;
    }

    public int getExtractionInterval() {
        return extractionInterval;
    }

    public void setExtractionInterval(int extractionInterval) {
        this.extractionInterval = extractionInterval;
    }

    public boolean isSessionExtractionEnabled() {
        return sessionExtractionEnabled;
    }

    public void setSessionExtractionEnabled(boolean sessionExtractionEnabled) {
        this.sessionExtractionEnabled = sessionExtractionEnabled;
    }

    @Override
    public String toString() {
        return "MemoryConfig{" +
                "extractionEnabled=" + extractionEnabled +
                ", extractionInterval=" + extractionInterval +
                ", sessionExtractionEnabled=" + sessionExtractionEnabled +
                '}';
    }
}
