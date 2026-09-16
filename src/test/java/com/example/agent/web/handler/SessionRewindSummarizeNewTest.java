package com.example.agent.web.handler;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.llm.client.LlmClient;
import com.example.agent.llm.model.ChatResponse;
import com.example.agent.llm.model.Choice;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.web.session.WebSessionManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖 SessionRewindHandler.handleSummarizeNew —— 上下文快满时总结并新建会话。
 *
 * <p>由于 handler 依赖 WebSessionManager / ServiceLocator / WorkspaceManager 等静态入口，
 * 本测试用 MockedStatic 打桩这些静态方法，再用临时目录模拟新会话落盘，验证：
 * 正常总结建新会话、非活跃会话拒绝、LLM 空总结失败。</p>
 */
@DisplayName("summarize-new 总结并新开会话测试")
class SessionRewindSummarizeNewTest {

    private static final String SESSION_ID = "root-sess";
    private static final String SUMMARY = "- 目标：xxx\n- 待办：yyy";

    private final SessionRewindHandler handler = new SessionRewindHandler();

    private ConversationService cs;
    private LlmClient llm;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        ServiceLocator.clear();
        cs = mock(ConversationService.class);
        llm = mock(LlmClient.class);
    }

    @AfterEach
    void tearDown() {
        ServiceLocator.clear();
    }

    private Path createSourceSession() throws IOException {
        Path sourceDir = Files.createDirectories(tempDir.resolve("source"));
        Path sourceJsonl = sourceDir.resolve("conversation.jsonl");
        // custom-title 便于断言新会话命名
        Files.writeString(sourceJsonl,
            "{\"type\":\"custom-title\",\"uuid\":\"t1\",\"sessionId\":\"" + SESSION_ID +
                "\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"version\":\"1.0.0\",\"cwd\":\".\",\"title\":\"我的任务\"}\n",
            StandardCharsets.UTF_8);
        Files.writeString(sourceDir.resolve("session.json"),
            "{\"workspacePath\":\"/tmp/ws\"}", StandardCharsets.UTF_8);
        return sourceJsonl;
    }

    private ChatResponse assistantResponse(String content) {
        Message assistant = new Message();
        assistant.setRole("assistant");
        assistant.setContent(content);
        Choice choice = new Choice();
        choice.setMessage(assistant);
        ChatResponse resp = new ChatResponse();
        resp.setChoices(List.of(choice));
        return resp;
    }

    @Nested
    @DisplayName("正常路径")
    class HappyPathTests {

        @Test
        @DisplayName("活跃会话成功生成总结并写入新会话，同时保留原会话")
        void testSummarizeCreatesNewSession() throws Exception {
            // given
            Path sourceJsonl = createSourceSession();
            Path newSessionDir = tempDir.resolve("new-session");

            when(cs.prepareForInference(Mockito.any(Conversation.class)))
                .thenReturn(List.of(Message.system("sys")));
            when(cs.flushTranscript(SESSION_ID)).thenReturn(sourceJsonl);
            when(llm.chat(anyList())).thenReturn(assistantResponse(SUMMARY));

            try (MockedStatic<ServiceLocator> sl = Mockito.mockStatic(ServiceLocator.class);
                 MockedStatic<WebSessionManager> wsm = Mockito.mockStatic(WebSessionManager.class);
                 MockedStatic<WorkspaceManager> wkm = Mockito.mockStatic(WorkspaceManager.class)) {

                // 打桩静态入口
                when(ServiceLocator.get(ConversationService.class)).thenReturn(cs);
                when(ServiceLocator.get(LlmClient.class)).thenReturn(llm);

                WebSessionManager wm = mock(WebSessionManager.class);
                when(wm.getSessions()).thenReturn(Map.of(SESSION_ID, mock(Conversation.class)));
                when(WebSessionManager.getInstance()).thenReturn(wm);

                when(WorkspaceManager.getSessionDir(anyString())).thenReturn(newSessionDir);

                SessionApiHandlerTest.FakeHttpExchange exchange =
                    new SessionApiHandlerTest.FakeHttpExchange("POST",
                        "/api/sessions/" + SESSION_ID + "/summarize-new", "");

                // when
                handler.handleSummarizeNew(exchange, SESSION_ID);

                // then
                assertEquals(200, exchange.getResponseCode());
                String body = exchange.getResponseBodyAsString();
                assertTrue(body.contains("root-sess_summary_"), "返回 newSessionId");
                // JSON 序列化会把换行转义为 \n，故用无换行子串断言
                assertTrue(body.contains("目标：xxx"), "返回总结全文");
                assertTrue(body.contains("待办：yyy"), "返回总结全文");

                verify(cs).prepareForInference(Mockito.any(Conversation.class));
                verify(llm).chat(anyList());

                // 新会话 jsonl：首行 custom-title（命名 我的任务（续）），次行 user 总结
                Path newJsonl = newSessionDir.resolve("conversation.jsonl");
                assertTrue(Files.exists(newJsonl));
                List<String> lines = Files.readAllLines(newJsonl, StandardCharsets.UTF_8);
                assertEquals(2, lines.size());
                assertTrue(lines.get(0).contains("custom-title"));
                assertTrue(lines.get(0).contains("我的任务（续）"));
                assertTrue(lines.get(1).contains("\"user\""));
                assertTrue(lines.get(1).contains("目标：xxx"));
                assertTrue(lines.get(1).contains("待办：yyy"));

                // 新会话继承 source session.json 元数据
                assertTrue(Files.exists(newSessionDir.resolve("session.json")));

                // 原会话 source jsonl 未被改动
                assertTrue(Files.readString(sourceJsonl, StandardCharsets.UTF_8).contains("我的任务"));
            }
        }
    }

    @Nested
    @DisplayName("异常路径")
    class FailurePathTests {

        @Test
        @DisplayName("非活跃会话返回 400")
        void testNonActiveSessionReturns400() throws IOException {
            try (MockedStatic<WebSessionManager> wsm = Mockito.mockStatic(WebSessionManager.class)) {
                WebSessionManager wm = mock(WebSessionManager.class);
                when(wm.getSessions()).thenReturn(Map.of());
                when(WebSessionManager.getInstance()).thenReturn(wm);

                SessionApiHandlerTest.FakeHttpExchange exchange =
                    new SessionApiHandlerTest.FakeHttpExchange("POST",
                        "/api/sessions/" + SESSION_ID + "/summarize-new", "");

                handler.handleSummarizeNew(exchange, SESSION_ID);

                assertEquals(400, exchange.getResponseCode());
                assertTrue(exchange.getResponseBodyAsString().contains("必须处于活跃状态"));
            }
        }

        @Test
        @DisplayName("LLM 返回空总结返回 500")
        void testBlankSummaryReturns500() throws Exception {
            // given
            Path sourceJsonl = createSourceSession();
            Path newSessionDir = tempDir.resolve("new-session");

            when(cs.prepareForInference(Mockito.any(Conversation.class)))
                .thenReturn(List.of(Message.system("sys")));
            when(cs.flushTranscript(SESSION_ID)).thenReturn(sourceJsonl);
            when(llm.chat(anyList())).thenReturn(assistantResponse("  "));

            try (MockedStatic<ServiceLocator> sl = Mockito.mockStatic(ServiceLocator.class);
                 MockedStatic<WebSessionManager> wsm = Mockito.mockStatic(WebSessionManager.class);
                 MockedStatic<WorkspaceManager> wkm = Mockito.mockStatic(WorkspaceManager.class)) {

                when(ServiceLocator.get(ConversationService.class)).thenReturn(cs);
                when(ServiceLocator.get(LlmClient.class)).thenReturn(llm);

                WebSessionManager wm = mock(WebSessionManager.class);
                when(wm.getSessions()).thenReturn(Map.of(SESSION_ID, mock(Conversation.class)));
                when(WebSessionManager.getInstance()).thenReturn(wm);
                when(WorkspaceManager.getSessionDir(anyString())).thenReturn(newSessionDir);

                SessionApiHandlerTest.FakeHttpExchange exchange =
                    new SessionApiHandlerTest.FakeHttpExchange("POST",
                        "/api/sessions/" + SESSION_ID + "/summarize-new", "");

                // when
                handler.handleSummarizeNew(exchange, SESSION_ID);

                // then
                assertEquals(500, exchange.getResponseCode());
                assertTrue(exchange.getResponseBodyAsString().contains("总结生成结果为空"));
                // 空总结不应新建会话文件
                assertFalse(Files.exists(newSessionDir.resolve("conversation.jsonl")));
            }
        }
    }
}