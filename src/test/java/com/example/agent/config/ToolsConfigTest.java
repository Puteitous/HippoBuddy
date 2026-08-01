package com.example.agent.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

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
        assertNotNull(bash.getWhitelist());
        assertTrue(bash.getWhitelist().contains("git"));
        assertTrue(bash.getWhitelist().contains("mvn"));
        assertTrue(bash.getWhitelist().contains("npm"));
        assertTrue(bash.getWhitelist().contains("docker"));
        assertTrue(bash.getWhitelist().contains("ls"));
        assertTrue(bash.getWhitelist().contains("cat"));
        assertTrue(bash.getWhitelist().contains("grep"));
    }

    @Test
    void testIsCommandAllowedWhenDisabled() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        bash.setEnabled(false);
        
        assertFalse(bash.isCommandAllowed("git status"));
        assertFalse(bash.isCommandAllowed("ls"));
    }

    @Test
    void testIsCommandAllowedWithWhitelistedCommand() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertTrue(bash.isCommandAllowed("git status"));
        assertTrue(bash.isCommandAllowed("mvn clean install"));
        assertTrue(bash.isCommandAllowed("npm install"));
        assertTrue(bash.isCommandAllowed("docker ps"));
        assertTrue(bash.isCommandAllowed("ls -la"));
        assertTrue(bash.isCommandAllowed("cat file.txt"));
        assertTrue(bash.isCommandAllowed("grep pattern file.txt"));
    }

    @Test
    void testIsCommandAllowedWithNonWhitelistedCommand() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed("rm -rf /"));
        assertFalse(bash.isCommandAllowed("sudo reboot"));
        assertFalse(bash.isCommandAllowed("format c:"));
    }

    @Test
    void testIsCommandAllowedWithEmptyWhitelist() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        bash.setWhitelist(Collections.emptyList());

        // 收紧：空白名单不再全放行，配置层默认拒绝，由 Blocker 链兜底
        assertFalse(bash.isCommandAllowed("git status"));
        assertFalse(bash.isCommandAllowed("rm -rf /"));
    }

    @Test
    void testIsCommandAllowedWithNullWhitelist() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        bash.setWhitelist(null);

        // 收紧：null 白名单同样默认拒绝
        assertFalse(bash.isCommandAllowed("git status"));
    }

    @Test
    void testIsCommandAllowedWithEmptyCommand() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed(""));
        assertFalse(bash.isCommandAllowed("   "));
    }

    @Test
    void testIsCommandAllowedWithSemicolonInjection() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed("git status; rm -rf /"));
        assertFalse(bash.isCommandAllowed("ls; cat /etc/passwd"));
        assertFalse(bash.isCommandAllowed("git status ; ls"));
    }

    @Test
    void testIsCommandAllowedWithAndInjection() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed("git status && rm -rf /"));
        assertFalse(bash.isCommandAllowed("ls && cat /etc/passwd"));
    }

    @Test
    void testIsCommandAllowedWithOrInjection() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed("git status || rm -rf /"));
        assertFalse(bash.isCommandAllowed("ls || cat /etc/passwd"));
    }

    @Test
    void testIsCommandAllowedWithPipeInjection() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed("git status | rm -rf /"));
        assertFalse(bash.isCommandAllowed("cat file | grep secret"));
    }

    @Test
    void testIsCommandAllowedWithBacktickInjection() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed("git `rm -rf /` status"));
        assertFalse(bash.isCommandAllowed("echo `cat /etc/passwd`"));
    }

    @Test
    void testIsCommandAllowedWithCommandSubstitutionInjection() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed("git $(rm -rf /) status"));
        assertFalse(bash.isCommandAllowed("echo $(cat /etc/passwd)"));
    }

    @Test
    void testIsCommandAllowedWithMixedInjection() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertFalse(bash.isCommandAllowed("git status; ls && cat file || echo test"));
    }

    @Test
    void testIsCommandAllowedWithLeadingWhitespace() {
        ToolsConfig.BashToolConfig bash = toolsConfig.getBash();
        
        assertTrue(bash.isCommandAllowed("   git status"));
        assertTrue(bash.isCommandAllowed("\tgit status"));
    }

    @Test
    void testBashConfigSetters() {
        ToolsConfig.BashToolConfig bash = new ToolsConfig.BashToolConfig();
        
        bash.setEnabled(false);
        bash.setRequireConfirmation(false);
        bash.setWhitelist(Arrays.asList("git", "npm"));
        
        assertFalse(bash.isEnabled());
        assertFalse(bash.isRequireConfirmation());
        assertEquals(2, bash.getWhitelist().size());
        assertTrue(bash.getWhitelist().contains("git"));
        assertTrue(bash.getWhitelist().contains("npm"));
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
