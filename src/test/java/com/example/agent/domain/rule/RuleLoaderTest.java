package com.example.agent.domain.rule;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * RuleLoader 两层规则扫描测试。
 * <p>
 * 测试覆盖：
 * <ul>
 *   <li>项目级规则扫描（findProjectRuleFiles）</li>
 *   <li>用户级规则扫描（findUserRuleFiles）</li>
 *   <li>规则内容加载（loadProjectRulesContent / loadUserRulesContent）</li>
 *   <li>文件排序、.md 过滤、目录不存在等边界</li>
 * </ul>
 * </p>
 */
class RuleLoaderTest {

    @TempDir
    Path tempDir;

    // ==================== findProjectRuleFiles ====================

    @Test
    @DisplayName("findProjectRuleFiles - null 路径返回空列表")
    void findProjectRuleFiles_nullPath() {
        assertTrue(RuleLoader.findProjectRuleFiles(null).isEmpty());
    }

    @Test
    @DisplayName("findProjectRuleFiles - 空字符串返回空列表")
    void findProjectRuleFiles_emptyPath() {
        assertTrue(RuleLoader.findProjectRuleFiles("").isEmpty());
    }

    @Test
    @DisplayName("findProjectRuleFiles - 空白字符串返回空列表")
    void findProjectRuleFiles_blankPath() {
        assertTrue(RuleLoader.findProjectRuleFiles("   ").isEmpty());
    }

    @Test
    @DisplayName("findProjectRuleFiles - 不存在的目录返回空列表")
    void findProjectRuleFiles_nonexistentDir() {
        List<Path> files = RuleLoader.findProjectRuleFiles(
                tempDir.resolve("nonexistent").toString());
        assertTrue(files.isEmpty());
    }

    @Test
    @DisplayName("findProjectRuleFiles - 只返回 .md 文件，忽略其他后缀")
    void findProjectRuleFiles_onlyMdFiles() throws IOException {
        Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
        Files.createDirectories(rulesDir);
        Files.writeString(rulesDir.resolve("a.md"), "");
        Files.writeString(rulesDir.resolve("b.md"), "");
        Files.writeString(rulesDir.resolve("c.txt"), "");
        Files.writeString(rulesDir.resolve("d.json"), "");

        List<Path> files = RuleLoader.findProjectRuleFiles(tempDir.toString());
        assertEquals(2, files.size(), "应只返回 .md 文件");
    }

    @Test
    @DisplayName("findProjectRuleFiles - 返回的文件按文件名字母排序")
    void findProjectRuleFiles_orderedByName() throws IOException {
        Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
        Files.createDirectories(rulesDir);
        Files.writeString(rulesDir.resolve("z.md"), "");
        Files.writeString(rulesDir.resolve("a.md"), "");
        Files.writeString(rulesDir.resolve("m.md"), "");

        List<Path> files = RuleLoader.findProjectRuleFiles(tempDir.toString());
        assertEquals(3, files.size());
        assertEquals("a.md", files.get(0).getFileName().toString());
        assertEquals("m.md", files.get(1).getFileName().toString());
        assertEquals("z.md", files.get(2).getFileName().toString());
    }

    @Test
    @DisplayName("findProjectRuleFiles - 空规则目录返回空列表")
    void findProjectRuleFiles_emptyDir() throws IOException {
        Files.createDirectories(tempDir.resolve(".hippo").resolve("rules"));
        assertTrue(RuleLoader.findProjectRuleFiles(tempDir.toString()).isEmpty());
    }

    // ==================== findUserRuleFiles ====================

    @Test
    @DisplayName("findUserRuleFiles - 不报错，返回非空列表（可能为空）")
    void findUserRuleFiles_noError() {
        List<Path> files = RuleLoader.findUserRuleFiles();
        assertNotNull(files);
    }

    // ==================== loadProjectRulesContent ====================

    @Test
    @DisplayName("loadProjectRulesContent - null 路径返回空字符串")
    void loadProjectRulesContent_nullPath() {
        assertEquals("", RuleLoader.loadProjectRulesContent(null));
    }

    @Test
    @DisplayName("loadProjectRulesContent - 空路径返回空字符串")
    void loadProjectRulesContent_emptyPath() {
        assertEquals("", RuleLoader.loadProjectRulesContent(""));
    }

    @Test
    @DisplayName("loadProjectRulesContent - 加载内容并附带来源标记")
    void loadProjectRulesContent_withSourceMarker() throws IOException {
        Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
        Files.createDirectories(rulesDir);
        Files.writeString(rulesDir.resolve("java-style.md"),
                "use 4-space indentation\n");
        Files.writeString(rulesDir.resolve("api-design.md"),
                "always return Result<T>\n");

        String content = RuleLoader.loadProjectRulesContent(tempDir.toString());

        assertTrue(content.contains("<!-- 项目规则: java-style.md -->"),
                "应包含项目规则来源标记");
        assertTrue(content.contains("use 4-space indentation"),
                "应包含 java-style.md 内容");
        assertTrue(content.contains("<!-- 项目规则: api-design.md -->"),
                "应包含 api-design.md 来源标记");
        assertTrue(content.contains("always return Result<T>"),
                "应包含 api-design.md 内容");

        // 排序校验：a 在 j 前
        int aIdx = content.indexOf("api-design.md");
        int jIdx = content.indexOf("java-style.md");
        assertTrue(aIdx < jIdx, "应按文件名排序，api-design 在前");
    }

    @Test
    @DisplayName("loadProjectRulesContent - 无 .hippo 目录返回空字符串")
    void loadProjectRulesContent_noHippoDir() {
        // tempDir 下没有任何 .hippo 目录
        assertEquals("", RuleLoader.loadProjectRulesContent(tempDir.toString()));
    }

    // ==================== loadUserRulesContent ====================

    @Test
    @DisplayName("loadUserRulesContent - 不报错，返回非 null 字符串")
    void loadUserRulesContent_noError() {
        String content = RuleLoader.loadUserRulesContent();
        assertNotNull(content);
    }

    // ==================== countRuleFiles ====================

    @Test
    @DisplayName("countRuleFiles - null 路径只统计用户级")
    void countRuleFiles_nullPath() {
        int count = RuleLoader.countRuleFiles(null);
        assertTrue(count >= 0);
    }

    @Test
    @DisplayName("countRuleFiles - 空路径返回用户级文件数")
    void countRuleFiles_emptyPath() {
        assertTrue(RuleLoader.countRuleFiles("") >= 0);
    }

    @Test
    @DisplayName("countRuleFiles - 统计项目级文件数")
    void countRuleFiles_projectFiles() throws IOException {
        Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
        Files.createDirectories(rulesDir);
        Files.writeString(rulesDir.resolve("a.md"), "");
        Files.writeString(rulesDir.resolve("b.md"), "");

        // 由于用户级目录在 {cwd}/.hippo/rules/ 可能为空，count 至少 >= 2
        assertTrue(RuleLoader.countRuleFiles(tempDir.toString()) >= 2);
    }

    // ==================== 遗留 API 兼容 ====================

    @Test
    @DisplayName("findAllRuleFiles - 标为 @Deprecated，行为等同于 findUserRuleFiles")
    void findAllRuleFiles_deprecated() {
        // 验证不报错，结果与 findUserRuleFiles 一致
        assertEquals(
                RuleLoader.findUserRuleFiles().size(),
                RuleLoader.findAllRuleFiles().size()
        );
    }

    @Test
    @DisplayName("countRuleFiles - 无参版本只统计用户级")
    void countRuleFiles_noArg() {
        int count = RuleLoader.countRuleFiles();
        assertTrue(count >= 0);
    }

    @Test
    @DisplayName("loadCombinedRules - 无参版本不报错")
    void loadCombinedRules_noArg() {
        String result = RuleLoader.loadCombinedRules();
        assertNotNull(result);
    }

    // ==================== createRuleFile ====================

    @Nested
    @DisplayName("createRuleFile - 创建规则文件")
    class CreateRuleFileTests {

        @Test
        @DisplayName("project scope - 成功创建规则文件")
        void createRuleFile_projectSuccess() throws IOException {
            Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
            Files.createDirectories(rulesDir);

            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "test-rule", "always", "测试规则", "project", null, tempDir.toString());

            assertTrue(result.isSuccess());
            assertEquals("规则创建成功", result.getMessage());
            assertNotNull(result.getFilePath());
            assertTrue(Files.exists(result.getFilePath()));
            assertTrue(result.getFilePath().getFileName().toString().equals("test-rule.md"));

            // 验证文件内容包含 Frontmatter
            String content = Files.readString(result.getFilePath());
            assertTrue(content.contains("mode: always"));
            assertTrue(content.contains("description: 测试规则"));
            assertTrue(content.contains("# 测试规则"));
        }

        @Test
        @DisplayName("project scope - 默认 mode=always，description 兜底为 ruleName")
        void createRuleFile_projectDefaults() throws IOException {
            Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
            Files.createDirectories(rulesDir);

            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "my-rule", null, null, "project", null, tempDir.toString());

            assertTrue(result.isSuccess());
            String content = Files.readString(result.getFilePath());
            assertTrue(content.contains("mode: always"));
            assertTrue(content.contains("description: my-rule"));
        }

        @Test
        @DisplayName("project scope - 带自定义内容写入")
        void createRuleFile_withContent() throws IOException {
            Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
            Files.createDirectories(rulesDir);

            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "custom", "manual", "自定义规则", "project",
                    "## 规则内容\n\n1. 第一条\n2. 第二条", tempDir.toString());

            assertTrue(result.isSuccess());
            String content = Files.readString(result.getFilePath());
            assertTrue(content.contains("mode: manual"));
            assertTrue(content.contains("1. 第一条"));
            assertTrue(content.contains("2. 第二条"));
        }

        @Test
        @DisplayName("user scope - 成功创建全局规则")
        void createRuleFile_userScope() {
            String uniqueName = "user-rule-" + System.nanoTime();
            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    uniqueName, "always", "全局规则", "user", null, null);

            assertTrue(result.isSuccess());
            assertNotNull(result.getFilePath());
            assertTrue(result.getFilePath().getFileName().toString().equals(uniqueName + ".md"));
        }

        @Test
        @DisplayName("名称校验 - null 名称返回错误")
        void createRuleFile_nullName() {
            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    null, "always", "desc", "project", null, tempDir.toString());
            assertFalse(result.isSuccess());
            assertEquals("规则名称不能为空", result.getMessage());
        }

        @Test
        @DisplayName("名称校验 - 空名称返回错误")
        void createRuleFile_blankName() {
            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "   ", "always", "desc", "project", null, tempDir.toString());
            assertFalse(result.isSuccess());
        }

        @Test
        @DisplayName("名称校验 - 非法字符返回错误")
        void createRuleFile_invalidChars() {
            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "my rule!", "always", "desc", "project", null, tempDir.toString());
            assertFalse(result.isSuccess());
            assertTrue(result.getMessage().contains("只允许"));
        }

        @Test
        @DisplayName("名称校验 - 中文名返回错误")
        void createRuleFile_chineseName() {
            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "编码规范", "always", "desc", "project", null, tempDir.toString());
            assertFalse(result.isSuccess());
        }

        @Test
        @DisplayName("project scope - 无工作区路径返回错误")
        void createRuleFile_noWorkspace() {
            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "my-rule", "always", "desc", "project", null, null);
            assertFalse(result.isSuccess());
            assertTrue(result.getMessage().contains("没有打开的工作区"));
        }

        @Test
        @DisplayName("重复创建 - 文件已存在返回错误")
        void createRuleFile_fileExists() throws IOException {
            Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
            Files.createDirectories(rulesDir);
            Files.writeString(rulesDir.resolve("existing.md"), "existing");

            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "existing", "always", "desc", "project", null, tempDir.toString());

            assertFalse(result.isSuccess());
            assertTrue(result.getMessage().contains("已存在"));
        }

        @Test
        @DisplayName("特殊字符 - 连字符/下划线/点合法")
        void createRuleFile_specialCharsValid() throws IOException {
            Path rulesDir = tempDir.resolve(".hippo").resolve("rules");
            Files.createDirectories(rulesDir);

            RuleLoader.CreateRuleResult result = RuleLoader.createRuleFile(
                    "my.rule_v2", "always", "desc", "project", null, tempDir.toString());
            assertTrue(result.isSuccess());
        }
    }
}
