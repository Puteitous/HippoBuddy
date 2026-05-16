package com.example.agent.execute;

import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.model.FunctionCall;
import com.example.agent.llm.model.Message;
import com.example.agent.llm.model.ToolCall;
import com.example.agent.service.TokenEstimatorFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("循环防护集成测试")
class LoopProtectionIntegrationTest {

    private RepetitionPatternHook repetitionHook;
    private TaskCompletionHook taskHook;
    private Conversation conversation;

    @BeforeEach
    void setUp() {
        repetitionHook = new RepetitionPatternHook();
        taskHook = new TaskCompletionHook();
        conversation = new Conversation(200000, TokenEstimatorFactory.getDefault());
    }

    @Nested
    @DisplayName("场景 1：重复读取回归测试（模拟 6 次重复读取）")
    class RepeatedReadRegressionTests {

        @Test
        @DisplayName("第 1-2 次读取：缓存引导，不拦截")
        void firstTwoReadsAllowed() {
            List<Message> messages = createAssistantMessagesWithArgs(
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}"),
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}")
            );

            StopHook.StopHookContext context = createContext(messages, 2);
            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);
            StopHook.StopHookResult taskResult = taskHook.evaluate(context);

            assertFalse(repResult.isShouldStop());
            assertFalse(taskResult.isShouldStop());
        }

        @Test
        @DisplayName("第 3 次读取：RepetitionPatternHook 强制终止")
        void thirdReadTriggersRepetitionHook() {
            List<Message> messages = createAssistantMessagesWithArgs(
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}"),
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}"),
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}")
            );

            StopHook.StopHookContext context = createContext(messages, 3);
            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);

            assertTrue(repResult.isShouldStop());
            assertTrue(repResult.isPreventContinuation());
        }

        @Test
        @DisplayName("第 6 次读取：早已在第 3 次被终止")
        void sixthReadWouldHaveBeenStoppedAtThird() {
            List<Message> messages = createAssistantMessagesWithArgs(
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}"),
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}"),
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}"),
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}"),
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}"),
                List.of("read_file", "{\"path\":\"ContextConfig.java\"}")
            );

            StopHook.StopHookContext context = createContext(messages, 6);
            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);

            assertTrue(repResult.isShouldStop());
        }
    }

    @Nested
    @DisplayName("场景 2：复杂重构任务验证 TaskCompletionHook 不误判")
    class ComplexRefactorTaskTests {

        @Test
        @DisplayName("包含写入操作，不触发停滞警告")
        void writeOperationPreventsStagnationWarning() {
            List<Message> messages = new ArrayList<>();

            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"UserService.java\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"UserRepository.java\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"UserController.java\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"UserDTO.java\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"UserMapper.java\"}"));
            messages.add(createAssistantMessageWithArgs("edit_file", "{\"path\":\"UserService.java\"}"));

            StopHook.StopHookContext context = createContext(messages, 6);
            StopHook.StopHookResult result = taskHook.evaluate(context);

            assertFalse(result.isShouldStop());
            assertFalse(result.isWarning());
        }

        @Test
        @DisplayName("包含完成信号，不触发终止")
        void completionSignalPreventsStop() {
            List<Message> messages = new ArrayList<>();

            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"Config.java\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"Loader.java\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"Parser.java\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"Validator.java\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"Builder.java\"}"));
            messages.add(Message.assistant("重构完成，主要修改如下：\n1. 优化了配置加载逻辑\n2. 增加了参数校验"));

            StopHook.StopHookContext context = createContext(messages, 6);
            StopHook.StopHookResult result = taskHook.evaluate(context);

            assertFalse(result.isShouldStop());
            assertFalse(result.isWarning());
        }

        @Test
        @DisplayName("不同文件读取：仍触发停滞警告（因为都是只读工具）")
        void differentFilesStillTriggerStagnationWarning() {
            List<Message> messages = new ArrayList<>();

            for (int i = 0; i < 16; i++) {
                messages.add(createAssistantMessageWithArgs(
                    "read_file",
                    "{\"path\":\"File" + i + ".java\"}"
                ));
            }

            StopHook.StopHookContext context = createContext(messages, 16);
            StopHook.StopHookResult result = taskHook.evaluate(context);

            // 注意：虽然文件不同，但都是只读工具，TaskCompletionHook 仍会触发警告
            // 这是预期行为：连续 15+ 轮只读操作 = 潜在停滞
            assertFalse(result.isShouldStop());
            assertTrue(result.isWarning());
        }
    }

    @Nested
    @DisplayName("场景 3：缓存引导 → Blocker 兜底递进效果")
    class CacheThenBlockerProgressionTests {

        @Test
        @DisplayName("第 1-2 次：缓存引导阶段（Blocker 不拦截）")
        void cacheGuidancePhase() {
            List<Message> messages = createAssistantMessagesWithArgs(
                List.of("read_file", "{\"path\":\"Config.java\"}"),
                List.of("read_file", "{\"path\":\"Config.java\"}")
            );

            StopHook.StopHookContext context = createContext(messages, 2);
            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);

            assertFalse(repResult.isShouldStop());
        }

        @Test
        @DisplayName("第 3 次：Blocker 兜底阶段（强制终止）")
        void blockerFallbackPhase() {
            List<Message> messages = createAssistantMessagesWithArgs(
                List.of("read_file", "{\"path\":\"Config.java\"}"),
                List.of("read_file", "{\"path\":\"Config.java\"}"),
                List.of("read_file", "{\"path\":\"Config.java\"}")
            );

            StopHook.StopHookContext context = createContext(messages, 3);
            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);

            assertTrue(repResult.isShouldStop());
            assertTrue(repResult.isPreventContinuation());
        }

        @Test
        @DisplayName("混合工具调用：不触发重复检测")
        void mixedToolCallsDoNotTriggerRepetition() {
            List<Message> messages = createAssistantMessagesWithArgs(
                List.of("read_file", "{\"path\":\"Config.java\"}"),
                List.of("grep", "{\"pattern\":\"public\"}"),
                List.of("read_file", "{\"path\":\"Config.java\"}"),
                List.of("grep", "{\"pattern\":\"private\"}"),
                List.of("read_file", "{\"path\":\"Config.java\"}")
            );

            StopHook.StopHookContext context = createContext(messages, 5);
            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);

            assertFalse(repResult.isShouldStop());
        }
    }

    @Nested
    @DisplayName("场景 4：多 Hook 协同工作")
    class MultiHookCollaborationTests {

        @Test
        @DisplayName("RepetitionPatternHook 优先于 TaskCompletionHook 触发")
        void repetitionHookTriggersBeforeTaskHook() {
            List<Message> messages = createAssistantMessagesWithArgs(
                List.of("read_file", "{\"path\":\"Config.java\"}"),
                List.of("read_file", "{\"path\":\"Config.java\"}"),
                List.of("read_file", "{\"path\":\"Config.java\"}")
            );

            StopHook.StopHookContext context = createContext(messages, 3);

            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);
            StopHook.StopHookResult taskResult = taskHook.evaluate(context);

            assertTrue(repResult.isShouldStop());
            assertFalse(taskResult.isShouldStop());
        }

        @Test
        @DisplayName("长时间纯读取：TaskCompletionHook 发送警告")
        void longReadOnlyLoopTriggersTaskHookWarning() {
            List<Message> messages = new ArrayList<>();

            // 使用不同的只读工具组合，避免 RepetitionPatternHook 触发
            // 但仍然触发 TaskCompletionHook 的停滞警告
            String[] readOnlyTools = {"read_file", "grep", "list_directory", "glob"};

            for (int i = 0; i < 15; i++) {
                String tool = readOnlyTools[i % readOnlyTools.length];
                messages.add(createAssistantMessageWithArgs(
                    tool,
                    "{\"path\":\"File" + i + ".java\"}"
                ));
            }

            StopHook.StopHookContext context = createContext(messages, 15);
            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);
            StopHook.StopHookResult taskResult = taskHook.evaluate(context);

            // RepetitionPatternHook 不触发（工具不同）
            assertFalse(repResult.isShouldStop());
            // TaskCompletionHook 触发警告（15 轮只读）
            assertTrue(taskResult.isWarning());
            assertTrue(taskResult.getReason().contains("15"));
        }

        @Test
        @DisplayName("正常任务流程：两个 Hook 都不触发")
        void normalWorkflowNoHooksTrigger() {
            List<Message> messages = new ArrayList<>();

            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"Main.java\"}"));
            messages.add(createAssistantMessageWithArgs("grep", "{\"pattern\":\"class\"}"));
            messages.add(createAssistantMessageWithArgs("read_file", "{\"path\":\"Service.java\"}"));
            messages.add(createAssistantMessageWithArgs("edit_file", "{\"path\":\"Service.java\"}"));

            StopHook.StopHookContext context = createContext(messages, 4);

            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);
            StopHook.StopHookResult taskResult = taskHook.evaluate(context);

            assertFalse(repResult.isShouldStop());
            assertFalse(taskResult.isShouldStop());
            assertFalse(taskResult.isWarning());
        }
    }

    @Nested
    @DisplayName("场景 5：边界情况")
    class EdgeCaseTests {

        @Test
        @DisplayName("空消息列表：不触发任何 Hook")
        void emptyMessagesNoHooksTrigger() {
            StopHook.StopHookContext context = createContext(List.of(), 0);

            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);
            StopHook.StopHookResult taskResult = taskHook.evaluate(context);

            assertFalse(repResult.isShouldStop());
            assertFalse(taskResult.isShouldStop());
        }

        @Test
        @DisplayName("单轮对话：不触发任何 Hook")
        void singleTurnNoHooksTrigger() {
            List<Message> messages = List.of(
                Message.user("分析代码"),
                Message.assistant("好的")
            );

            StopHook.StopHookContext context = createContext(messages, 1);

            StopHook.StopHookResult repResult = repetitionHook.evaluate(context);
            StopHook.StopHookResult taskResult = taskHook.evaluate(context);

            assertFalse(repResult.isShouldStop());
            assertFalse(taskResult.isShouldStop());
        }
    }

    private List<Message> createAssistantMessagesWithArgs(List<String>... toolCallSets) {
        List<Message> messages = new ArrayList<>();

        for (List<String> toolCall : toolCallSets) {
            String toolName = toolCall.get(0);
            String args = toolCall.size() > 1 ? toolCall.get(1) : "{}";

            FunctionCall function = new FunctionCall(toolName, args);
            ToolCall toolCallObj = new ToolCall("id_" + toolName + "_" + messages.size(), function);
            Message msg = Message.assistantWithToolCalls(List.of(toolCallObj));
            messages.add(msg);
        }

        return messages;
    }

    private Message createAssistantMessageWithArgs(String toolName, String args) {
        FunctionCall function = new FunctionCall(toolName, args);
        ToolCall toolCallObj = new ToolCall("id_" + toolName, function);
        return Message.assistantWithToolCalls(List.of(toolCallObj));
    }

    private StopHook.StopHookContext createContext(List<Message> messages, int turnCount) {
        return new StopHook.StopHookContext(
            conversation, messages, turnCount, AgentTurnResult.CONTINUE
        );
    }
}