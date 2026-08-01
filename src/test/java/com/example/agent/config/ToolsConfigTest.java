package com.example.agent.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ToolsConfigTest {

    private ToolsConfig toolsConfig;

    @BeforeEach
    void setUp() {
        toolsConfig = new ToolsConfig();
    }

    @Test
    void testDefaultBashConfig() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();

        assertTrue(bash.isEnabled());
        assertTrue(bash.isRequireConfirmation());
    }

    @Test
    void testBashConfigSetters() {
        ToolsConfig.BashToolConfig bash = new ToolsConfig.BashToolConfig();

        bash.setEnabled(false);
        bash.setRequireConfirmation(false);

        assertFalse(bash.isEnabled());
        assertFalse(bash.isRequireConfirmation());
    }

    @Test
    void testToolsConfigSetters() {
        ToolsConfig config = new ToolsConfig();
        ToolsConfig.BashToolConfig newBash = new ToolsConfig.BashToolConfig();
        ToolsConfig.FileToolConfig newFile = new ToolsConfig.FileToolConfig();

        config.setBash(newBash);
        config.setFile(newFile);

        assertSame(newBash, config.getBash());
        assertSame(newFile, config.getFile());
    }
}
