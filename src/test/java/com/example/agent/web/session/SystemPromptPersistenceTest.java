package com.example.agent.web.session;

import com.example.agent.application.ConversationService;
import com.example.agent.core.di.ServiceLocator;
import com.example.agent.desktop.WorkspaceContext;
import com.example.agent.domain.conversation.Conversation;
import com.example.agent.domain.skill.SkillManager;
import com.example.agent.llm.model.Message;
import com.example.agent.logging.WorkspaceManager;
import com.example.agent.service.TokenEstimator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 契约测试：System Prompt 固化跨重启保持（方案 C — system-prompt.txt）。
 *
 * <p>核心语义：会话创建时固化的 prompt（含当时的工作区/规则/技能快照）必须
 * 持久化到独立文件，重启后恢复该会话时优先从文件还原原值，而不是按【当前】
 * 工作区重算——否则 prompt 内容变化会击穿 LLM 前缀缓存（曾观测到 96% → 6.7%），
 * 且 LLM 会以为仍在旧工作区。</p>
 *
 * <p>隔离策略（与 {@link WorkspaceSwitchPromptTest} 一致）：mock ConversationService，
 * create 返回真实 Conversation、resume 返回 NO_TRANSCRIPT；WorkspaceManager 数据根目录
 * 重定向到临时目录，隔离磁盘写入。</p>
 */
@DisplayName("System Prompt 固化跨重启保持契约测试（方案 C）")
class SystemPromptPersistenceTest {

    private static final String SESSION_ID = "sys-prompt-persist-test";

    @TempDir
    Path tempDir;

    private WebSessionManager manager;

    private Path workspaceA;
    private Path workspaceB;

    @BeforeEach
    void setUp() throws Exception {
        manager = WebSessionManager.getInstance();
        manager.clear();

        WorkspaceManager.overrideBasePath(tempDir);

        workspaceA = tempDir.resolve("workspace-a");
        workspaceB = tempDir.resolve("workspace-b");
        Files.createDirectories(workspaceA);
        Files.createDirectories(workspaceB);

        TokenEstimator mockTokenEstimator = mock(TokenEstimator.class);
        when(mockTokenEstimator.estimateMessageTokens(any())).thenReturn(0);
        when(mockTokenEstimator.estimateConversationTokens(any())).thenReturn(0);
        when(mockTokenEstimator.estimateTextTokens(any())).thenReturn(0);

        ConversationService mockConversationService = mock(ConversationService.class);
        lenient().when(mockConversationService.create(anyString(), anyInt(), anyString()))
            .thenAnswer(inv -> {
                String prompt = inv.getArgument(0);
                int maxTokens = inv.getArgument(1);
                String sessionId = inv.getArgument(2);
                Conversation conv = new Conversation(maxTokens, mockTokenEstimator, sessionId);
                conv.setSystemPrompt(prompt);
                if (prompt != null && !prompt.isEmpty()) {
                    conv.addMessage(Message.system(prompt));
                }
                return conv;
            });
        lenient().when(mockConversationService.resumeConversation(any(), anyString()))
            .thenAnswer(inv -> new ConversationService.ResumeResult(inv.getArgument(1)));

        ServiceLocator.clear();
        ServiceLocator.registerSingleton(ConversationService.class, mockConversationService);
        // 真实 SkillManager：getDefaultSystemPrompt 走技能清单注入路径（临时目录无技能 → 不注入）
        ServiceLocator.registerSingleton(SkillManager.class, new SkillManager());

        WorkspaceContext.clear();
    }

    @AfterEach
    void tearDown() {
        manager.clear();
        WorkspaceContext.clear();
        ServiceLocator.clear();
    }

    @Test
    @DisplayName("重启后恢复历史会话：优先还原 system-prompt.txt 中的固化 prompt，而非当前工作区重算")
    void restartRestoresHistoricalPromptFromFile() {
        // 工作区 A 下创建会话，prompt 固化 A 路径并落盘
        WorkspaceContext.setCurrentFolder(workspaceA.toString());
        Conversation conv = manager.getOrCreateConversation(SESSION_ID, null);
        String promptAtCreation = conv.getSystemPrompt();
        assertTrue(promptAtCreation.contains(workspaceA.toString()),
            "创建时 prompt 应包含工作区 A 路径");
        assertFalse(promptAtCreation.contains(workspaceB.toString()),
            "创建时 prompt 不应包含工作区 B 路径");

        // 落盘校验：system-prompt.txt 存在且内容与固化 prompt 逐字节一致
        Path promptFile = WorkspaceManager.getSessionDir(SESSION_ID).resolve("system-prompt.txt");
        assertTrue(Files.exists(promptFile), "会话创建后应落盘 system-prompt.txt");
        try {
            assertEquals(promptAtCreation, Files.readString(promptFile),
                "文件内容应与创建时固化的 prompt 逐字节一致");
        } catch (Exception e) {
            fail("读取 system-prompt.txt 失败", e);
        }

        // 切到工作区 B，再模拟重启（内存会话清空，磁盘文件保留）
        WorkspaceContext.setCurrentFolder(workspaceB.toString());
        manager.clear();

        // 重启后恢复同一会话：必须还原 A 的 prompt，而非按当前工作区 B 重算
        Conversation restored = manager.getOrCreateConversation(SESSION_ID, null);
        assertEquals(promptAtCreation, restored.getSystemPrompt(),
            "重启恢复后 prompt 应与创建时逐字节一致");
        assertTrue(restored.getSystemPrompt().contains(workspaceA.toString()),
            "重启恢复后 prompt 应仍指向创建时的工作区 A");
        assertFalse(restored.getSystemPrompt().contains(workspaceB.toString()),
            "重启恢复后 prompt 不应出现当前工作区 B");
    }

    @Test
    @DisplayName("无固化文件的全新会话：走默认路径，用当前工作区重算")
    void newSessionWithoutFileUsesCurrentWorkspace() {
        WorkspaceContext.setCurrentFolder(workspaceB.toString());
        Conversation conv = manager.getOrCreateConversation("fresh-session-no-file", null);
        assertTrue(conv.getSystemPrompt().contains(workspaceB.toString()),
            "全新会话（创建时无固化文件）应使用当前工作区 B 重算");
    }
}
