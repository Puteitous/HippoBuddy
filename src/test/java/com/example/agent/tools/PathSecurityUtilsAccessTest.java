package com.example.agent.tools;

import com.example.agent.config.Config;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mockStatic;

/**
 * 权限范围安全语义测试：strict（仅工作区）／balanced（读写分离）／relaxed（全目录 + 高危护栏）。
 * <p>
 * 通过 mockStatic(Config) 精确控制 tools.mode，不依赖真实 config（测试环境默认可能处于 relaxed）。
 * 覆盖：
 *  - balanced 读放行工作区外、写仍限工作区
 *  - .ssh/.gnupg 凭据目录按任意层段名拦截（所有模式）
 *  - Unix 根级 /root 护栏
 *  - Windows 盘根下系统目录段拦截（C:\Windows）
 */
class PathSecurityUtilsAccessTest {

    @FunctionalInterface
    private interface ThrowingAction {
        void run() throws Exception;
    }

    /** 以指定权限模式上下文执行动作，运行结束后恢复真实 Config 单例。 */
    private static void withMode(String mode, ThrowingAction action) throws Exception {
        try (MockedStatic<Config> cfgMock = mockStatic(Config.class)) {
            Config cfg = new Config();
            cfg.getTools().setMode(mode);
            cfgMock.when(Config::getInstance).thenReturn(cfg);
            action.run();
        }
    }

    // ==================== strict（仅工作区） ====================

    @Nested
    class StrictMode {
        @Test
        void readOutsideWorkspaceRejected() throws Exception {
            withMode("strict", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead("/outside/test.txt")));
        }

        @Test
        void writeOutsideWorkspaceRejected() throws Exception {
            withMode("strict", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolve("/outside/test.txt")));
        }

        @Test
        void withinWorkspaceAllowed() throws Exception {
            withMode("strict", () -> {
                Path p = assertDoesNotThrow(() -> PathSecurityUtils.validateAndResolve("src"));
                assertNotNull(p);
            });
        }
    }

    // ==================== balanced（读写分离） ====================

    @Nested
    class BalancedMode {
        @Test
        void readOutsideWorkspaceAllowed() throws Exception {
            withMode("balanced", () -> {
                Path p = assertDoesNotThrow(() -> PathSecurityUtils.validateAndResolveRead("/outside/test.txt"));
                assertNotNull(p);
            });
        }

        @Test
        void writeOutsideWorkspaceStillRejected() throws Exception {
            withMode("balanced", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolve("/outside/test.txt")));
        }

        @Test
        void readEtcAllowedAsReadOnly() throws Exception {
            // 只读护栏仅拦 /root 与凭据目录；/etc 属系统可公开读内容，balanced 读放行
            withMode("balanced", () -> {
                Path p = assertDoesNotThrow(() -> PathSecurityUtils.validateAndResolveRead("/etc/hosts"));
                assertNotNull(p);
            });
        }
    }

    // ==================== relaxed（全目录 + 高危护栏） ====================

    @Nested
    class RelaxedMode {
        @Test
        void outsideWorkspaceAllowed() throws Exception {
            withMode("relaxed", () -> {
                Path p = assertDoesNotThrow(() -> PathSecurityUtils.validateAndResolve("/outside/test.txt"));
                assertNotNull(p);
            });
        }

        @Test
        @EnabledOnOs({OS.MAC, OS.LINUX})
        void rootPrivilegeDirStillRejected() throws Exception {
            withMode("relaxed", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead("/root/secret.txt")));
        }
    }

    // ==================== 凭据目录段名拦截（所有模式强制） ====================

    @Nested
    class CredentialSegments {
        @Test
        void sshSegmentRejectedInStrict() throws Exception {
            withMode("strict", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead("src/.ssh/id_rsa")));
        }

        @Test
        void sshSegmentRejectedInBalancedRead() throws Exception {
            // balanced 读放行工作区外普通路径，但任意层级的 .ssh 一律拦截
            withMode("balanced", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead("/users/alice/.ssh/id_rsa")));
        }

        @Test
        void sshSegmentRejectedInRelaxed() throws Exception {
            withMode("relaxed", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead("src/.ssh/id_rsa")));
        }

        @Test
        void gnupgSegmentRejected() throws Exception {
            withMode("relaxed", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead("src/config/.gnupg/pubring.gpg")));
        }

        @Test
        void writeToSshRejected() throws Exception {
            withMode("relaxed", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolve("src/.ssh/authorized_keys")));
        }
    }

    // ==================== 符号链接加固（工作区内链接指向凭据目录） ====================

    @Nested
    @EnabledOnOs({OS.MAC, OS.LINUX})
    class SymlinkHardening {
        @TempDir
        Path tmpDir;

        @Test
        void symlinkToCredentialDirRejected() throws Exception {
            // 工作区内一个普通名字的链接，指向真正的 .ssh 凭据目录
            Path credential = tmpDir.resolve("target").resolve(".ssh");
            Files.createDirectories(credential);
            Path link = tmpDir.resolve("link");
            Files.createSymbolicLink(link, credential);

            // 原始路径无 .ssh 段，但 realpath 复检应拦截凭据目录
            withMode("balanced", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead(link.toString())));
        }

        @Test
        void symlinkToOrdinaryDirAllowed() throws Exception {
            // 普通目录符号链接不触发护栏，正常放行
            Path target = tmpDir.resolve("target");
            Files.createDirectories(target);
            Path link = tmpDir.resolve("link-ordinary");
            Files.createSymbolicLink(link, target);

            withMode("balanced", () -> {
                Path p = assertDoesNotThrow(() -> PathSecurityUtils.validateAndResolveRead(link.toString()));
                assertNotNull(p);
            });
        }
    }

    @Nested
    @EnabledOnOs(OS.WINDOWS)
    class WindowsSystemRoot {
        @Test
        void windowsDirRejected() throws Exception {
            withMode("relaxed", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead("C:\\Windows\\System32\\drivers\\etc\\hosts")));
        }

        @Test
        void programFilesRejected() throws Exception {
            withMode("relaxed", () ->
                    assertThrows(ToolExecutionException.class,
                            () -> PathSecurityUtils.validateAndResolveRead("C:\\Program Files\\SomeApp\\readme.txt")));
        }

        @Test
        void nonSystemRootAllowed() throws Exception {
            // 盘根下普通目录不受系统段拦遮挡
            withMode("relaxed", () -> {
                Path p = assertDoesNotThrow(() -> PathSecurityUtils.validateAndResolveRead("C:\\Users\\alice\\notes.txt"));
                assertNotNull(p);
            });
        }
    }
}