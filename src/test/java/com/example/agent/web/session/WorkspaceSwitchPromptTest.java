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

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 契约测试：切换工作区后，已有会话 prompt 中拼接的工作区路径保持不变，
 * 只有新建会话才会使用新工作区路径。
 *
 * <p>核心机制（见 {@link WebSessionManager#getDefaultSystemPrompt()}）：
 * <ol>
 *   <li>工作区路径在「会话创建」时拍快照拼入 system prompt，之后固化在 Conversation 中；</li>
 *   <li>{@link WebSessionManager#getOrCreateConversation(String, String)} 缓存命中时
 *       直接返回内存中的会话，不重新生成 prompt（systemPromptOverride 也被忽略）；</li>
 *   <li>{@code shouldReloadSession} 只比对 conversation.jsonl 的修改时间，
 *       切换工作区（{@link WorkspaceContext#setCurrentFolder(String)}）不会触碰该文件，故不触发重载。</li>
 * </ol>
 *
 * <p>隔离策略：mock ConversationService（create 返回真实 Conversation），
 * 并将 WorkspaceManager 数据根目录重定向到临时目录，避免污染真实数据。
 */
@DisplayName("切换工作区后 prompt 工作区路径行为契约测试")
class WorkspaceSwitchPromptTest {

    private static final String SESSION_A = "ws-switch-session-a";
    private static final String SESSION_B = "ws-switch-session-b";
    private static final String SESSION_DEFAULT = "ws-switch-session-default";

    @TempDir
    Path tempDir;

    private WebSessionManager manager;
    private ConversationService mockConversationService;
    private TokenEstimator mockTokenEstimator;

    private Path workspaceA;
    private Path workspaceB;

    @BeforeEach
    void setUp() throws Exception {
        manager = WebSessionManager.getInstance();
        manager.clear();

        // 数据根目录重定向到临时目录，隔离所有会话/记忆/日志写入
        WorkspaceManager.overrideBasePath(tempDir);

        workspaceA = tempDir.resolve("workspace-a");
        workspaceB = tempDir.resolve("workspace-b");
        Files.createDirectories(workspaceA);
        Files.createDirectories(workspaceB);

        // mock ConversationService：create 返回真实 Conversation（模拟真实固化 prompt 的行为），
        // resumeConversation 返回 NO_TRANSCRIPT，避免触碰真实磁盘与 LLM。
        mockTokenEstimator = mock(TokenEstimator.class);
        when(mockTokenEstimator.estimateMessageTokens(any())).thenReturn(0);
        when(mockTokenEstimator.estimateConversationTokens(any())).thenReturn(0);
        when(mockTokenEstimator.estimateTextTokens(any())).thenReturn(0);

        mockConversationService = mock(ConversationService.class);
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
        // ensureSessionComponents 为 void，mock 默认 no-op

        ServiceLocator.clear();
        ServiceLocator.registerSingleton(ConversationService.class, mockConversationService);
        // 注册真实的 SkillManager，使 getDefaultSystemPrompt 走技能清单注入路径
        // （技能文件在临时目录中按需创建，默认工作区无技能 → 不注入，不影响其他测试）
        ServiceLocator.registerSingleton(SkillManager.class, new SkillManager());

        // 重置为默认工作区，避免受其他测试遗留的 currentFolder 污染
        WorkspaceContext.clear();
    }

    @AfterEach
    void tearDown() {
        manager.clear();
        WorkspaceContext.clear();
        ServiceLocator.clear();
    }

    @Test
    @DisplayName("已有会话的 prompt 保留创建时的工作区路径，切换工作区后不变")
    void existingSessionPromptKeepsOriginalWorkspace() {
        // 工作区 A 下创建会话
        WorkspaceContext.setCurrentFolder(workspaceA.toString());
        Conversation conv = manager.getOrCreateConversation(SESSION_A, null);

        String promptBefore = conv.getSystemPrompt();
        assertTrue(promptBefore.contains(workspaceA.toString()),
            "创建时 prompt 应包含工作区 A 路径");
        assertTrue(promptBefore.contains("## 当前工作区"),
            "非默认工作区应使用「当前工作区」文案");
        assertFalse(promptBefore.contains(workspaceB.toString()),
            "创建时 prompt 不应包含工作区 B 路径");

        // 切换到工作区 B，再次获取同一会话
        WorkspaceContext.setCurrentFolder(workspaceB.toString());
        Conversation sameConv = manager.getOrCreateConversation(SESSION_A, null);

        assertSame(conv, sameConv, "缓存命中应返回同一会话实例");
        assertEquals(promptBefore, sameConv.getSystemPrompt(),
            "已有会话的 prompt 不应因切换工作区而改变");
        assertTrue(sameConv.getSystemPrompt().contains(workspaceA.toString()),
            "已有会话 prompt 应仍指向创建时的工作区 A");
        assertFalse(sameConv.getSystemPrompt().contains(workspaceB.toString()),
            "已有会话 prompt 不应出现新工作区 B");
    }

    @Test
    @DisplayName("切换工作区后新建的会话使用新工作区路径")
    void newSessionUsesCurrentWorkspace() {
        // 工作区 A 下创建旧会话
        WorkspaceContext.setCurrentFolder(workspaceA.toString());
        manager.getOrCreateConversation(SESSION_A, null);

        // 切换到工作区 B 后新建会话
        WorkspaceContext.setCurrentFolder(workspaceB.toString());
        Conversation newConv = manager.getOrCreateConversation(SESSION_B, null);

        assertTrue(newConv.getSystemPrompt().contains(workspaceB.toString()),
            "新会话 prompt 应使用切换后的工作区 B");
        assertFalse(newConv.getSystemPrompt().contains(workspaceA.toString()),
            "新会话 prompt 不应包含旧工作区 A");
    }

    @Test
    @DisplayName("缓存命中时 systemPromptOverride 不生效，prompt 保持原值")
    void cacheHitIgnoresSystemPromptOverride() {
        WorkspaceContext.setCurrentFolder(workspaceA.toString());
        Conversation conv = manager.getOrCreateConversation(SESSION_A, null);
        String originalPrompt = conv.getSystemPrompt();

        // 已存在会话 + 传入 override：缓存命中分支应忽略 override
        Conversation sameConv = manager.getOrCreateConversation(SESSION_A, "自定义 System Prompt");

        assertSame(conv, sameConv, "缓存命中应返回同一会话实例");
        assertEquals(originalPrompt, sameConv.getSystemPrompt(),
            "缓存命中时 override 不应覆盖已有 prompt");
        assertFalse(sameConv.getSystemPrompt().contains("自定义 System Prompt"));
    }

    @Test
    @DisplayName("默认工作区使用「工作目录」文案并指向默认路径")
    void defaultWorkspaceUsesWorkingDirectoryWording() {
        // setUp 中已 WorkspaceContext.clear()，当前处于默认工作区
        Conversation conv = manager.getOrCreateConversation(SESSION_DEFAULT, null);
        String prompt = conv.getSystemPrompt();
        String defaultDir = WorkspaceManager.getDefaultWorkspaceDir().toString();

        assertTrue(prompt.contains("## 工作目录"),
            "默认工作区应使用「工作目录」文案而非「当前工作区」");
        assertTrue(prompt.contains("当前工作目录: " + defaultDir),
            "默认工作区 prompt 应指向默认工作区路径");
        assertFalse(prompt.contains("## 当前工作区"),
            "默认工作区 prompt 不应使用「当前工作区」文案");
    }

    @Test
    @DisplayName("技能清单在会话创建时固化，切换工作区后已有会话不变，新会话用新清单")
    void skillSnapshotFollowsWorkspace() throws Exception {
        // 工作区 A 与 B 各放一个技能文件
        Path skillsA = workspaceA.resolve(".hippo").resolve("skills");
        Path skillsB = workspaceB.resolve(".hippo").resolve("skills");
        Files.createDirectories(skillsA);
        Files.createDirectories(skillsB);
        Files.writeString(skillsA.resolve("skill-a.md"),
            "---\ndescription: from workspace A\n---\n正文");
        Files.writeString(skillsB.resolve("skill-b.md"),
            "---\ndescription: from workspace B\n---\n正文");

        // 工作区 A 下创建会话：prompt 应固化 skill-a 清单
        WorkspaceContext.setCurrentFolder(workspaceA.toString());
        Conversation conv = manager.getOrCreateConversation(SESSION_A, null);
        String promptBefore = conv.getSystemPrompt();
        assertTrue(promptBefore.contains("## 可用技能"),
            "会话创建时 prompt 应包含技能清单段落");
        assertTrue(promptBefore.contains("skill-a.md"),
            "会话创建时 prompt 应固化工作区 A 的技能");
        assertFalse(promptBefore.contains("skill-b.md"),
            "会话创建时 prompt 不应包含工作区 B 的技能");

        // 切换到工作区 B，同一会话的 prompt 技能清单应保持不变
        WorkspaceContext.setCurrentFolder(workspaceB.toString());
        Conversation sameConv = manager.getOrCreateConversation(SESSION_A, null);
        assertSame(conv, sameConv, "缓存命中应返回同一会话实例");
        assertEquals(promptBefore, sameConv.getSystemPrompt(),
            "切换工作区后已有会话的 prompt（含技能清单）不应改变");
        assertTrue(sameConv.getSystemPrompt().contains("skill-a.md"),
            "已有会话 prompt 应仍固化工作区 A 的技能");
        assertFalse(sameConv.getSystemPrompt().contains("skill-b.md"),
            "已有会话 prompt 不应出现工作区 B 的技能");

        // 工作区 B 下新建会话：应固化 skill-b 清单
        Conversation newConv = manager.getOrCreateConversation(SESSION_B, null);
        assertTrue(newConv.getSystemPrompt().contains("skill-b.md"),
            "新会话 prompt 应固化工作区 B 的技能");
        assertFalse(newConv.getSystemPrompt().contains("skill-a.md"),
            "新会话 prompt 不应包含工作区 A 的技能");
    }

    @Test
    @DisplayName("无技能的工作区创建会话时 prompt 不含「可用技能」段落")
    void noSkillsNoSkillSection() {
        // workspaceA / workspaceB 均无 .hippo/skills，默认工作区也无技能
        WorkspaceContext.setCurrentFolder(workspaceA.toString());
        Conversation conv = manager.getOrCreateConversation(SESSION_DEFAULT, null);
        String prompt = conv.getSystemPrompt();
        assertFalse(prompt.contains("## 可用技能"),
            "无技能文件时 prompt 不应注入「可用技能」段落");
    }
}
