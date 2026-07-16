package com.example.agent.console;

import com.example.agent.config.Config;
import com.example.agent.config.LlmConfig;
import com.example.agent.config.ToolsConfig;
import com.example.agent.config.SessionConfig;
import com.example.agent.config.UiConfig;
import com.example.agent.mcp.config.McpConfig;
import org.jline.terminal.Terminal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.PrintWriter;
import java.io.StringWriter;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AgentUiTest {

    private Terminal terminal;
    private Config config;
    private LlmConfig llmConfig;
    private AgentUi ui;
    private StringWriter stringWriter;
    private PrintWriter printWriter;

    @BeforeEach
    void setUp() {
        terminal = mock(Terminal.class);
        config = mock(Config.class);
        llmConfig = mock(LlmConfig.class);
        stringWriter = new StringWriter();
        printWriter = new PrintWriter(stringWriter);
        
        when(terminal.writer()).thenReturn(printWriter);
        when(config.getLlm()).thenReturn(llmConfig);
        when(llmConfig.getModel()).thenReturn("test-model");
        when(llmConfig.getBaseUrl()).thenReturn("https://api.test.com");
        when(llmConfig.getApiKey()).thenReturn("test-api-key-12345");
        when(config.getConfigFilePath()).thenReturn("/path/to/config.yaml");
        when(llmConfig.getMaxTokens()).thenReturn(2048);
        
        when(llmConfig.getProvider()).thenReturn("test-provider");
        when(llmConfig.getTemperature()).thenReturn(0.7);
        when(llmConfig.getTimeout()).thenReturn(30000);
        
        // Mock ToolsConfig
        ToolsConfig toolsConfig = mock(ToolsConfig.class);
        ToolsConfig.BashToolConfig bashConfig = mock(ToolsConfig.BashToolConfig.class);
        when(bashConfig.isEnabled()).thenReturn(true);
        when(toolsConfig.getBash()).thenReturn(bashConfig);
        when(config.getTools()).thenReturn(toolsConfig);
        
        // Mock SessionConfig
        SessionConfig sessionConfig = mock(SessionConfig.class);
        when(config.getSession()).thenReturn(sessionConfig);
        
        // Mock UiConfig
        UiConfig uiConfig = mock(UiConfig.class);
        when(uiConfig.getTheme()).thenReturn("default");
        when(uiConfig.getPrompt()).thenReturn("> ");
        when(uiConfig.isSyntaxHighlight()).thenReturn(true);
        when(config.getUi()).thenReturn(uiConfig);
        
        // Mock McpConfig
        McpConfig mcpConfig = mock(McpConfig.class);
        when(mcpConfig.isEnabled()).thenReturn(false);
        when(mcpConfig.isAutoConnect()).thenReturn(true);
        when(mcpConfig.getServers()).thenReturn(java.util.Collections.emptyList());
        when(config.getMcp()).thenReturn(mcpConfig);
        
        ui = new AgentUi(terminal, config);
    }

    @Nested
    @DisplayName("构造函数测试")
    class ConstructorTests {

        @Test
        @DisplayName("正常构造")
        void testNormalConstructor() {
            assertNotNull(ui);
        }

        @Test
        @DisplayName("null terminal抛出异常")
        void testNullTerminal() {
            assertThrows(NullPointerException.class, () -> {
                new AgentUi(null, config);
            });
        }

        @Test
        @DisplayName("null config抛出异常")
        void testNullConfig() {
            assertThrows(NullPointerException.class, () -> {
                new AgentUi(terminal, null);
            });
        }
    }

    @Nested
    @DisplayName("maskApiKey方法测试")
    class MaskApiKeyTests {

        @Test
        @DisplayName("null API Key返回****")
        void testNullApiKey() {
            assertEquals("****", ui.maskApiKey(null));
        }

        @Test
        @DisplayName("空API Key返回****")
        void testEmptyApiKey() {
            assertEquals("****", ui.maskApiKey(""));
        }

        @Test
        @DisplayName("短API Key返回****")
        void testShortApiKey() {
            assertEquals("****", ui.maskApiKey("abc"));
        }

        @Test
        @DisplayName("刚好8字符的API Key")
        void testExactly8CharsApiKey() {
            assertEquals("test****1234", ui.maskApiKey("test1234"));
        }

        @Test
        @DisplayName("正常长度API Key")
        void testNormalApiKey() {
            String result = ui.maskApiKey("test-api-key-12345");
            
            assertTrue(result.startsWith("test"));
            assertTrue(result.endsWith("2345"));
            assertTrue(result.contains("****"));
        }

        @Test
        @DisplayName("超长API Key")
        void testVeryLongApiKey() {
            String longKey = "sk-" + "a".repeat(100);
            String result = ui.maskApiKey(longKey);
            
            assertTrue(result.startsWith("sk-"));
            assertTrue(result.endsWith("aaaa"));
        }
    }

    @Nested
    @DisplayName("truncate方法测试")
    class TruncateTests {

        @Test
        @DisplayName("null文本返回空字符串")
        void testNullText() {
            assertEquals("", ui.truncate(null, 10));
        }

        @Test
        @DisplayName("maxLength为零返回空字符串")
        void testZeroMaxLength() {
            assertEquals("", ui.truncate("test", 0));
        }

        @Test
        @DisplayName("maxLength为负数返回空字符串")
        void testNegativeMaxLength() {
            assertEquals("", ui.truncate("test", -5));
        }

        @Test
        @DisplayName("文本短于maxLength不截断")
        void testTextShorterThanMaxLength() {
            assertEquals("test", ui.truncate("test", 10));
        }

        @Test
        @DisplayName("文本长于maxLength截断并添加省略号")
        void testTextLongerThanMaxLength() {
            String result = ui.truncate("hello world", 5);
            
            assertEquals("hello...", result);
        }

        @Test
        @DisplayName("换行符被替换为空格")
        void testNewlinesReplaced() {
            String result = ui.truncate("line1\nline2", 10);
            
            assertTrue(result.contains(" "));
            assertFalse(result.contains("\n"));
        }

        @Test
        @DisplayName("回车符被替换为空格")
        void testCarriageReturnReplaced() {
            String result = ui.truncate("line1\rline2", 10);
            
            assertTrue(result.contains(" "));
            assertFalse(result.contains("\r"));
        }
    }

    @Nested
    @DisplayName("打印方法测试")
    class PrintMethodTests {

        @Test
        @DisplayName("println()输出空行")
        void testPrintlnEmpty() {
            stringWriter.getBuffer().setLength(0);
            ui.println();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("\n"));
        }

        @Test
        @DisplayName("println(text)输出文本")
        void testPrintlnText() {
            stringWriter.getBuffer().setLength(0);
            ui.println("test message");
            
            String output = stringWriter.toString();
            assertTrue(output.contains("test message"));
        }

        @Test
        @DisplayName("print(text)输出文本")
        void testPrintText() {
            stringWriter.getBuffer().setLength(0);
            ui.print("test");
            
            String output = stringWriter.toString();
            assertTrue(output.contains("test"));
        }
    }

    @Nested
    @DisplayName("欢迎和帮助信息测试")
    class WelcomeAndHelpTests {

        @Test
        @DisplayName("printWelcome输出欢迎信息")
        void testPrintWelcome() {
            stringWriter.getBuffer().setLength(0);
            ui.printWelcome();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("Code Agent"));
        }

        @Test
        @DisplayName("printHelp输出帮助信息")
        void testPrintHelp() {
            stringWriter.getBuffer().setLength(0);
            ui.printHelp();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("可用命令"));
        }

        @Test
        @DisplayName("printConfig输出配置信息")
        void testPrintConfig() {
            stringWriter.getBuffer().setLength(0);
            ui.printConfig();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("当前配置"));
            assertTrue(output.contains("test-model"));
        }

        @Test
        @DisplayName("printGoodbye输出再见信息")
        void testPrintGoodbye() {
            stringWriter.getBuffer().setLength(0);
            ui.printGoodbye();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("再见"));
        }
    }

    @Nested
    @DisplayName("错误和警告信息测试")
    class ErrorAndWarningTests {

        @Test
        @DisplayName("printConfigValidationError输出错误")
        void testPrintConfigValidationError() {
            stringWriter.getBuffer().setLength(0);
            ui.printConfigValidationError();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("API Key 未配置"));
        }

        @Test
        @DisplayName("printDefaultApiKeyWarning输出警告")
        void testPrintDefaultApiKeyWarning() {
            stringWriter.getBuffer().setLength(0);
            ui.printDefaultApiKeyWarning();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("API Key 仍为默认值"));
        }

        @Test
        @DisplayName("printInterrupted输出中断信息")
        void testPrintInterrupted() {
            stringWriter.getBuffer().setLength(0);
            ui.printInterrupted();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("中断"));
        }

        @Test
        @DisplayName("printCtrlC输出Ctrl+C")
        void testPrintCtrlC() {
            stringWriter.getBuffer().setLength(0);
            ui.printCtrlC();
            
            String output = stringWriter.toString();
            assertTrue(output.contains("^C"));
        }
    }

    @Nested
    @DisplayName("clearScreen方法测试")
    class ClearScreenTests {

        @Test
        @DisplayName("clearScreen调用terminal")
        void testClearScreen() {
            ui.clearScreen();
            
            verify(terminal).puts(any());
            verify(terminal).flush();
        }
    }

    @Nested
    @DisplayName("showLastConversationLog方法测试")
    class ShowLogTests {

        @Test
        @DisplayName("null会话ID显示提示")
        void testNullConversationId() {
            stringWriter.getBuffer().setLength(0); // 清空缓冲区
            ui.showLastConversationLog(null);
            
            String output = stringWriter.toString();
            assertTrue(output.contains("还没有对话记录"));
        }
    }

    @Nested
    @DisplayName("边界条件测试")
    class BoundaryTests {

        @Test
        @DisplayName("truncate边界值-maxLength为1")
        void testTruncateMaxLengthOne() {
            assertEquals("a...", ui.truncate("abc", 1));
        }

        @Test
        @DisplayName("truncate边界值-单字符文本")
        void testTruncateSingleChar() {
            assertEquals("a", ui.truncate("a", 10));
        }

        @Test
        @DisplayName("maskApiKey边界值-刚好8字符")
        void testMaskApiKeyExactly8Chars() {
            assertEquals("1234****5678", ui.maskApiKey("12345678"));
        }

        @Test
        @DisplayName("maskApiKey边界值-7字符")
        void testMaskApiKey7Chars() {
            assertEquals("****", ui.maskApiKey("1234567"));
        }
    }

    @Nested
    @DisplayName("特殊字符测试")
    class SpecialCharacterTests {

        @Test
        @DisplayName("truncate包含Unicode字符")
        void testTruncateWithUnicode() {
            String result = ui.truncate("你好世界测试", 3);
            
            assertEquals("你好世...", result);
        }

        @Test
        @DisplayName("truncate包含混合换行符")
        void testTruncateWithMixedNewlines() {
            String result = ui.truncate("line1\r\nline2\nline3", 10);
            
            assertTrue(result.contains(" "));
        }

        @Test
        @DisplayName("maskApiKey包含特殊字符")
        void testMaskApiKeyWithSpecialChars() {
            String result = ui.maskApiKey("sk-test_12345!@#$%");
            
            assertTrue(result.startsWith("sk-t"));
            assertTrue(result.contains("****"));
        }
    }
}
