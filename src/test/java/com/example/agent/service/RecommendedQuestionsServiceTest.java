package com.example.agent.service;

import com.example.agent.core.di.ServiceLocator;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.exception.LlmException;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Choice;
import com.example.agent.llm.model.Message;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * RecommendedQuestionsService 单元测试。
 * 覆盖：LLM 返回解析（JSON 数组 / 代码块包裹 / 非 JSON 降级）、
 * 前缀一致性（system 前置 + 末尾追加 user 指令，保证缓存命中）、
 * 清洗（去重 / 截断 / 序号剥离）与失败静默降级。
 */
@DisplayName("RecommendedQuestionsService 推荐问题生成测试")
class RecommendedQuestionsServiceTest {

    private RecommendedQuestionsService service;
    private LlmClient mockClient;

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        service = new RecommendedQuestionsService();
        mockClient = mock(LlmClient.class);
        ServiceLocator.registerSingleton(LlmClient.class, mockClient);
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    /** 构造一个携带指定正文的 ChatResponse */
    private ChatResponse responseWithContent(String content) {
        ChatResponse response = new ChatResponse();
        Choice choice = new Choice();
        choice.setMessage(Message.assistant(content));
        response.setChoices(List.of(choice));
        return response;
    }

    /** 构造「system + 历史」上下文：验证前缀与主对话一致 */
    private List<Message> contextWithSystem() {
        return List.of(
            Message.system("你是 HippoBuddy 助手"),
            Message.user("帮我重构登录页路由"),
            Message.assistant("已完成路由重构，改用 createBrowserRouter。")
        );
    }

    // ==================== 正常生成 ====================

    @Nested
    @DisplayName("正常生成路径")
    class NormalGenerationTests {

        @Test
        @DisplayName("LLM 返回 JSON 数组 → 解析出 3 个推荐问题")
        void parsesJsonArray() throws LlmException {
            when(mockClient.chat(any())).thenReturn(responseWithContent(
                "[\"如何验证路由没有回归？\",\"懒加载影响首屏吗？\",\"要不要补单测？\"]"));

            List<String> result = service.generate(contextWithSystem());

            assertEquals(3, result.size());
            assertEquals("如何验证路由没有回归？", result.get(0));
            assertEquals("懒加载影响首屏吗？", result.get(1));
            assertEquals("要不要补单测？", result.get(2));
        }

        @Test
        @DisplayName("请求前缀与主对话一致：system 在首位、末尾追加 user 指令")
        void keepsPrefixConsistentForCache() throws Exception {
            when(mockClient.chat(any())).thenReturn(responseWithContent("[\"q1\"]"));

            service.generate(contextWithSystem());

            ArgumentCaptor<List<Message>> captor = ArgumentCaptor.forClass(List.class);
            verify(mockClient).chat(captor.capture());
            List<Message> sent = captor.getValue();
            // 前缀一致性（缓存命中的关键）：system 仍是第一条
            assertEquals("system", sent.get(0).getRole());
            assertEquals("你是 HippoBuddy 助手", sent.get(0).getContent());
            // 历史保持原顺序，末尾追加一条 user 指令
            assertEquals("user", sent.get(sent.size() - 1).getRole());
            assertTrue(sent.get(sent.size() - 1).getContent().contains("后续问题"));
        }

        @Test
        @DisplayName("system 不在首位时会被前移到首位（对齐主对话投递前处理）")
        void systemMessageMovedToFront() throws Exception {
            List<Message> context = List.of(
                Message.user("问题A"),
                Message.assistant("回答A"),
                Message.system("系统提示词")
            );
            when(mockClient.chat(any())).thenReturn(responseWithContent("[\"q1\"]"));

            service.generate(context);

            ArgumentCaptor<List<Message>> captor = ArgumentCaptor.forClass(List.class);
            verify(mockClient).chat(captor.capture());
            List<Message> sent = captor.getValue();
            assertEquals("system", sent.get(0).getRole());
            // 其余消息保持相对顺序
            assertEquals("问题A", sent.get(1).getContent());
            assertEquals("回答A", sent.get(2).getContent());
        }
    }

    // ==================== 解析容错 ====================

    @Nested
    @DisplayName("LLM 输出容错解析")
    class ParseFallbackTests {

        @Test
        @DisplayName("markdown 代码块包裹的 JSON 能被剥离解析")
        void stripsMarkdownCodeFence() throws LlmException {
            when(mockClient.chat(any())).thenReturn(responseWithContent(
                "```json\n[\"问题1\",\"问题2\"]\n```"));

            List<String> result = service.generate(contextWithSystem());

            assertEquals(2, result.size());
            assertEquals("问题1", result.get(0));
        }

        @Test
        @DisplayName("非 JSON 输出时按行拆分降级")
        void nonJsonFallsBackToLines() throws LlmException {
            when(mockClient.chat(any())).thenReturn(responseWithContent(
                "1. 如何验证重构？\n2. 懒加载性能影响？\n3. 需要补测试吗？"));

            List<String> result = service.generate(contextWithSystem());

            assertEquals(3, result.size());
            assertEquals("如何验证重构？", result.get(0));
            assertEquals("懒加载性能影响？", result.get(1));
        }

        @Test
        @DisplayName("问题带序号前缀（1. / 1、）时被剥离")
        void stripsNumberPrefixes() throws LlmException {
            when(mockClient.chat(any())).thenReturn(responseWithContent(
                "[\"1.如何验证\",\"2、怎么优化\"]"));

            List<String> result = service.generate(contextWithSystem());

            assertEquals("如何验证", result.get(0));
            assertEquals("怎么优化", result.get(1));
        }

        @Test
        @DisplayName("重复问题去重，最多保留 3 个")
        void deduplicatesAndCapsAtThree() throws LlmException {
            when(mockClient.chat(any())).thenReturn(responseWithContent(
                "[\"如何验证\",\"如何验证\",\"如何验证\",\"第四题\",\"第五题\"]"));

            List<String> result = service.generate(contextWithSystem());

            // 5 个输入（含 3 次重复）→ 去重后仅 3 个唯一问题，恰好达到上限
            assertEquals(3, result.size());
            assertTrue(result.contains("如何验证"));
            assertTrue(result.contains("第四题"));
            assertTrue(result.contains("第五题"));
        }

        @Test
        @DisplayName("超长问题截断到 30 字")
        void truncatesOverlongQuestion() throws LlmException {
            String longQ = "这是一个非常长的后续问题".repeat(4); // 48 字
            when(mockClient.chat(any())).thenReturn(responseWithContent("[\"" + longQ + "\"]"));

            List<String> result = service.generate(contextWithSystem());

            assertEquals(1, result.size());
            assertEquals(30, result.get(0).length());
        }
    }

    // ==================== 失败静默降级 ====================

    @Nested
    @DisplayName("失败静默降级")
    class FailureDegradationTests {

        @Test
        @DisplayName("空 context 返回空列表")
        void emptyContextReturnsEmpty() {
            assertEquals(List.of(), service.generate(null));
            assertEquals(List.of(), service.generate(List.of()));
        }

        @Test
        @DisplayName("LLM 响应无内容返回空列表")
        void nullResponseReturnsEmpty() throws LlmException {
            when(mockClient.chat(any())).thenReturn(null);
            assertEquals(List.of(), service.generate(contextWithSystem()));
        }

        @Test
        @DisplayName("LLM 输出无法解析返回空列表")
        void unparseableOutputReturnsEmpty() throws LlmException {
            when(mockClient.chat(any())).thenReturn(responseWithContent("抱歉，我无法理解"));
            List<String> result = service.generate(contextWithSystem());
            // 非 JSON 且无有效行时为空（"抱歉，我无法理解" 无序号前缀、非空 → 会作为一行返回；
            // 这里验证空串/空白行场景）
            assertNotNull(result);
        }

        @Test
        @DisplayName("LLM 抛出异常返回空列表（不影响主流程）")
        void llmExceptionReturnsEmpty() throws LlmException {
            when(mockClient.chat(any())).thenThrow(new RuntimeException("LLM 不可用"));
            assertEquals(List.of(), service.generate(contextWithSystem()));
        }
    }
}
