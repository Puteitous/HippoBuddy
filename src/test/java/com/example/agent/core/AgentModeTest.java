package com.example.agent.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("AgentMode 枚举测试")
class AgentModeTest {

    @Nested
    @DisplayName("CHAT 模式测试")
    class ChatModeTests {

        @Test
        @DisplayName("CHAT 模式图标正确")
        void testChatIcon() {
            assertEquals("💬", AgentMode.CHAT.getIcon());
        }

        @Test
        @DisplayName("CHAT 模式显示名称正确")
        void testChatDisplayName() {
            assertEquals("聊天模式", AgentMode.CHAT.getDisplayName());
        }

        @Test
        @DisplayName("CHAT 模式描述正确")
        void testChatDescription() {
            assertEquals("只读探索，提供建议，不修改文件", AgentMode.CHAT.getDescription());
        }

        @Test
        @DisplayName("CHAT 模式允许 read_file 工具")
        void testChatAllowsReadFile() {
            assertTrue(AgentMode.CHAT.isToolAllowed("read_file"));
        }

        @Test
        @DisplayName("CHAT 模式允许 glob 工具")
        void testChatAllowsGlob() {
            assertTrue(AgentMode.CHAT.isToolAllowed("glob"));
        }

        @Test
        @DisplayName("CHAT 模式允许 grep 工具")
        void testChatAllowsGrep() {
            assertTrue(AgentMode.CHAT.isToolAllowed("grep"));
        }

        @Test
        @DisplayName("CHAT 模式允许 ask_user 工具")
        void testChatAllowsAskUser() {
            assertTrue(AgentMode.CHAT.isToolAllowed("ask_user"));
        }

        @Test
        @DisplayName("CHAT 模式允许 recall_memory 工具")
        void testChatAllowsRecallMemory() {
            assertTrue(AgentMode.CHAT.isToolAllowed("recall_memory"));
        }

        @Test
        @DisplayName("CHAT 模式不允许 write_file 工具")
        void testChatDeniesWriteFile() {
            assertFalse(AgentMode.CHAT.isToolAllowed("write_file"));
        }

        @Test
        @DisplayName("CHAT 模式不允许 edit_file 工具")
        void testChatDeniesEditFile() {
            assertFalse(AgentMode.CHAT.isToolAllowed("edit_file"));
        }

        @Test
        @DisplayName("CHAT 模式不允许 bash 工具")
        void testChatDeniesBash() {
            assertFalse(AgentMode.CHAT.isToolAllowed("bash"));
        }

        @Test
        @DisplayName("CHAT 模式不允许 todo_write 工具")
        void testChatDeniesTodoWrite() {
            assertFalse(AgentMode.CHAT.isToolAllowed("todo_write"));
        }
    }

    @Nested
    @DisplayName("CODING 模式测试")
    class CodingModeTests {

        @Test
        @DisplayName("CODING 模式图标正确")
        void testCodingIcon() {
            assertEquals("🛠️", AgentMode.CODING.getIcon());
        }

        @Test
        @DisplayName("CODING 模式显示名称正确")
        void testCodingDisplayName() {
            assertEquals("构建模式", AgentMode.CODING.getDisplayName());
        }

        @Test
        @DisplayName("CODING 模式描述正确")
        void testCodingDescription() {
            assertEquals("全权限执行，自动完成任务", AgentMode.CODING.getDescription());
        }

        @Test
        @DisplayName("CODING 模式允许 read_file 工具")
        void testCodingAllowsReadFile() {
            assertTrue(AgentMode.CODING.isToolAllowed("read_file"));
        }

        @Test
        @DisplayName("CODING 模式允许 write_file 工具")
        void testCodingAllowsWriteFile() {
            assertTrue(AgentMode.CODING.isToolAllowed("write_file"));
        }

        @Test
        @DisplayName("CODING 模式允许 edit_file 工具")
        void testCodingAllowsEditFile() {
            assertTrue(AgentMode.CODING.isToolAllowed("edit_file"));
        }

        @Test
        @DisplayName("CODING 模式允许 bash 工具")
        void testCodingAllowsBash() {
            assertTrue(AgentMode.CODING.isToolAllowed("bash"));
        }

        @Test
        @DisplayName("CODING 模式允许 todo_write 工具")
        void testCodingAllowsTodoWrite() {
            assertTrue(AgentMode.CODING.isToolAllowed("todo_write"));
        }

        @Test
        @DisplayName("CODING 模式允许 ask_user 工具")
        void testCodingAllowsAskUser() {
            assertTrue(AgentMode.CODING.isToolAllowed("ask_user"));
        }

        @Test
        @DisplayName("CODING 模式允许 recall_memory 工具")
        void testCodingAllowsRecallMemory() {
            assertTrue(AgentMode.CODING.isToolAllowed("recall_memory"));
        }

        @Test
        @DisplayName("CODING 模式允许所有 CHAT 模式的工具")
        void testCodingAllowsAllChatTools() {
            Set<String> chatTools = AgentMode.CHAT.getAllowedTools();
            for (String tool : chatTools) {
                assertTrue(AgentMode.CODING.isToolAllowed(tool), 
                    "CODING 模式应该允许 CHAT 模式的所有工具：" + tool);
            }
        }
    }

    @Nested
    @DisplayName("通用方法测试")
    class CommonMethodTests {

        @Test
        @DisplayName("CHAT 模式完整显示名称正确")
        void testChatFullDisplayName() {
            assertEquals("💬 聊天模式", AgentMode.CHAT.getFullDisplayName());
        }

        @Test
        @DisplayName("CODING 模式完整显示名称正确")
        void testCodingFullDisplayName() {
            assertEquals("🛠️ 构建模式", AgentMode.CODING.getFullDisplayName());
        }

        @Test
        @DisplayName("CHAT 模式允许的工具数量正确")
        void testChatAllowedToolsCount() {
            assertEquals(16, AgentMode.CHAT.getAllowedTools().size());
        }

        @Test
        @DisplayName("CODING 模式允许的工具数量正确")
        void testCodingAllowedToolsCount() {
            assertEquals(20, AgentMode.CODING.getAllowedTools().size());
        }

        @Test
        @DisplayName("未知工具在两种模式下都被拒绝")
        void testUnknownToolDenied() {
            assertFalse(AgentMode.CHAT.isToolAllowed("unknown_tool"));
            assertFalse(AgentMode.CODING.isToolAllowed("unknown_tool"));
        }
    }
}
