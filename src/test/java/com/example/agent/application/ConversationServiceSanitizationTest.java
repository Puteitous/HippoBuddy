package com.example.agent.application;

import com.example.agent.config.Config;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimator;
import com.example.agent.service.TokenEstimatorFactory;
import com.example.agent.testutil.MockLlmClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖 prepareForInference 投递前的两层兜底：
 *  - 第一层（协议无关）：清除「带 tool_calls 但无 tool 结果」的残缺工具调用。
 *  - 第二层（OpenAI 兼容分支）：为「带 tool_calls 却缺 reasoning_content」的
 *    assistant 回填占位，规避 DeepSeek 400。
 */
@DisplayName("ConversationService 投递前清洗测试")
class ConversationServiceSanitizationTest {

    @TempDir
    Path tempDir;

    private ConversationService service;

    @BeforeEach
    void setUp() {
        WorkspaceManager.overrideBasePath(tempDir);
        LlmClient mockLlmClient = new MockLlmClient();
        TokenEstimator tokenEstimator = TokenEstimatorFactory.getDefault();
        service = new ConversationService(tokenEstimator, mockLlmClient);
    }

    // ── 构造辅助：user + 带 tool_calls 的 assistant ─────────────────────
    private List<Message> userAndToolCallingAssistant() {
        Conversation conv = service.create("You are helpful");
        service.addUserMessage(conv, "帮我执行一个工具");
        ToolCall toolCall = new ToolCall("call_1", new FunctionCall("bash", "{\"command\":\"ls\"}"));
        service.addAssistantMessage(
                conv, Message.assistantWithToolCalls(List.of(toolCall), null), null);
        return new ArrayList<>(service.prepareForInference(conv));
    }

    @Test
    @DisplayName("✅ 第1层：带 tool_calls 却无 tool 结果 → 清除工具并改写为正文")
    void stripsInterruptedToolCall() {
        List<Message> msgs = userAndToolCallingAssistant();

        Message last = msgs.get(msgs.size() - 1);
        assertThat(last.isAssistant()).isTrue();
        // 工具调用被清除
        assertThat(last.getToolCalls()).isNull();
        // 转成正文提示，且思考痕迹一并清掉
        assertThat(last.getContent()).contains("[会话中断]");
        assertThat(last.getReasoningContent()).isNull();
    }

    @Test
    @DisplayName("✅ 第2层：OpenAI 兼容系下带 tool_calls 缺 reasoning → 回填占位")
    void backfillsReasoningForOpenAiCompat() {
        String original = Config.getInstance().getLlm().getProvider();
        try {
            Config.getInstance().getLlm().setProvider("deepseek");

            Conversation conv = service.create("You are helpful");
            service.addUserMessage(conv, "用工具完成");
            ToolCall toolCall = new ToolCall("call_1", new FunctionCall("bash", "{\"command\":\"ls\"}"));
            service.addAssistantMessage(
                    conv, Message.assistantWithToolCalls(List.of(toolCall), null), null);
            // 工具正常执行并回传结果 → 不触发第一层清洗
            service.addToolResult(conv, "call_1", "bash", "ok");

            List<Message> msgs = service.prepareForInference(conv);
            Message toolAssistant = msgs.stream()
                    .filter(m -> m.isAssistant() && m.getToolCalls() != null && !m.getToolCalls().isEmpty())
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("未找到带 tool_calls 的 assistant 消息"));

            // 缺失的 reasoning_content 被回填占位
            assertThat(toolAssistant.getReasoningContent()).isNotBlank();
            // 工具调用本身保留（正常工具循环不受影响）
            assertThat(toolAssistant.getToolCalls()).hasSize(1);
        } finally {
            Config.getInstance().getLlm().setProvider(original);
        }
    }

    @Test
    @DisplayName("✅ 负向：非 OpenAI 兼容（anthropic）下不补 reasoning 占位")
    void doesNotBackfillForAnthropic() {
        String original = Config.getInstance().getLlm().getProvider();
        try {
            Config.getInstance().getLlm().setProvider("anthropic");

            Conversation conv = service.create("You are helpful");
            service.addUserMessage(conv, "用工具完成");
            ToolCall toolCall = new ToolCall("call_1", new FunctionCall("bash", "{\"command\":\"ls\"}"));
            service.addAssistantMessage(
                    conv, Message.assistantWithToolCalls(List.of(toolCall), null), null);
            service.addToolResult(conv, "call_1", "bash", "ok");

            List<Message> msgs = service.prepareForInference(conv);
            Message toolAssistant = msgs.stream()
                    .filter(m -> m.isAssistant() && m.getToolCalls() != null && !m.getToolCalls().isEmpty())
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("未找到带 tool_calls 的 assistant 消息"));

            // 不应被回填
            assertThat(toolAssistant.getReasoningContent()).isNullOrEmpty();
        } finally {
            Config.getInstance().getLlm().setProvider(original);
        }
    }
}