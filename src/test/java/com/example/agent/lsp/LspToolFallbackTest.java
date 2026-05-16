package com.example.agent.lsp;

import com.example.agent.lsp.tools.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LspToolFallbackTest {

    private LspClient mockLspClient;
    private JsonNodeFactory nodeFactory;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        mockLspClient = mock(LspClient.class);
        nodeFactory = JsonNodeFactory.instance;
    }

    @Test
    void gotoDefinition_shouldReturnFriendlyMessageWhenLspNotInitialized() throws Exception {
        when(mockLspClient.isInitialized()).thenReturn(false);

        GoToDefinitionTool tool = new GoToDefinitionTool(mockLspClient, "java");
        ObjectNode args = nodeFactory.objectNode();
        args.put("file", "Test.java");
        args.put("line", 0);
        args.put("column", 0);

        String result = tool.execute(args);

        assertThat(result)
                .contains("LSP 服务正在启动中")
                .contains("grep")
                .contains("60-120 秒");
    }

    @Test
    void findReferences_shouldReturnFriendlyMessageWhenLspNotInitialized() throws Exception {
        when(mockLspClient.isInitialized()).thenReturn(false);

        FindReferencesTool tool = new FindReferencesTool(mockLspClient, "java");
        ObjectNode args = nodeFactory.objectNode();
        args.put("file", "Test.java");
        args.put("line", 0);
        args.put("column", 0);

        String result = tool.execute(args);

        assertThat(result)
                .contains("LSP 服务正在启动中")
                .contains("grep")
                .contains("60-120 秒");
    }

    @Test
    void hover_shouldReturnFriendlyMessageWhenLspNotInitialized() throws Exception {
        when(mockLspClient.isInitialized()).thenReturn(false);

        HoverTool tool = new HoverTool(mockLspClient, "java");
        ObjectNode args = nodeFactory.objectNode();
        args.put("file", "Test.java");
        args.put("line", 0);
        args.put("column", 0);

        String result = tool.execute(args);

        assertThat(result)
                .contains("LSP 服务正在启动中")
                .contains("read_file")
                .contains("60-120 秒");
    }

    @Test
    void documentSymbol_shouldReturnFriendlyMessageWhenLspNotInitialized() throws Exception {
        when(mockLspClient.isInitialized()).thenReturn(false);

        DocumentSymbolTool tool = new DocumentSymbolTool(mockLspClient, "java");
        ObjectNode args = nodeFactory.objectNode();
        args.put("file", "Test.java");

        String result = tool.execute(args);

        assertThat(result)
                .contains("LSP 服务正在启动中")
                .contains("read_file")
                .contains("60-120 秒");
    }

    @Test
    void workspaceSymbol_shouldReturnFriendlyMessageWhenLspNotInitialized() throws Exception {
        when(mockLspClient.isInitialized()).thenReturn(false);

        WorkspaceSymbolTool tool = new WorkspaceSymbolTool(mockLspClient, "java");
        ObjectNode args = nodeFactory.objectNode();
        args.put("query", "Test");

        String result = tool.execute(args);

        assertThat(result)
                .contains("LSP 服务正在启动中")
                .contains("grep")
                .contains("60-120 秒");
    }

    @Test
    void allTools_shouldRunInBackground() {
        List<LspBaseTool> tools = List.of(
                new GoToDefinitionTool(mockLspClient, "java"),
                new FindReferencesTool(mockLspClient, "java"),
                new HoverTool(mockLspClient, "java"),
                new DocumentSymbolTool(mockLspClient, "java"),
                new WorkspaceSymbolTool(mockLspClient, "java")
        );

        for (LspBaseTool tool : tools) {
            assertThat(tool.shouldRunInBackground())
                    .as(tool.getName() + " should run in background")
                    .isTrue();
        }
    }

    @Test
    void tools_shouldHaveCorrectNamingConvention() {
        List<LspBaseTool> tools = List.of(
                new GoToDefinitionTool(mockLspClient, "java"),
                new FindReferencesTool(mockLspClient, "java"),
                new HoverTool(mockLspClient, "java"),
                new DocumentSymbolTool(mockLspClient, "java"),
                new WorkspaceSymbolTool(mockLspClient, "java")
        );

        for (LspBaseTool tool : tools) {
            assertThat(tool.getName())
                    .startsWith("lsp_")
                    .doesNotContain("java");
        }
    }

    @Test
    void toolDescriptions_shouldBeMeaningful() {
        List<LspBaseTool> tools = List.of(
                new GoToDefinitionTool(mockLspClient, "java"),
                new FindReferencesTool(mockLspClient, "java"),
                new HoverTool(mockLspClient, "java"),
                new DocumentSymbolTool(mockLspClient, "java"),
                new WorkspaceSymbolTool(mockLspClient, "java")
        );

        for (LspBaseTool tool : tools) {
            assertThat(tool.getDescription())
                    .isNotEmpty();
        }
    }

    @Test
    void toolSchemas_shouldBeValidJson() {
        List<LspBaseTool> tools = List.of(
                new GoToDefinitionTool(mockLspClient, "java"),
                new FindReferencesTool(mockLspClient, "java"),
                new HoverTool(mockLspClient, "java"),
                new DocumentSymbolTool(mockLspClient, "java"),
                new WorkspaceSymbolTool(mockLspClient, "java")
        );

        for (LspBaseTool tool : tools) {
            String schema = tool.getParametersSchema();
            assertThat(schema)
                    .isNotEmpty()
                    .contains("type")
                    .contains("properties");
        }
    }
}
