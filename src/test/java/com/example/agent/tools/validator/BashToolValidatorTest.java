package com.example.agent.tools.validator;

import com.example.agent.tools.ToolExecutionException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BashToolValidatorTest {

    private BashToolValidator validator;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        validator = new BashToolValidator();
        objectMapper = new ObjectMapper();
    }

    @Test
    void testValidateMissingCommand() {
        ObjectNode args = objectMapper.createObjectNode();

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("缺少必需参数: command"));
    }

    @Test
    void testValidateNullCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.putNull("command");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("缺少必需参数: command"));
    }

    @Test
    void testValidateEmptyCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("command 参数不能为空"));
    }

    @Test
    void testValidateWhitespaceCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "   ");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("command 参数不能为空"));
    }

    @Test
    void testAllowedCommands() throws ToolExecutionException {
        String[] allowedCommands = {
            "git status",
            "ls -la",
            "cat file.txt",
            "type file.txt",
            "more file.txt",
            "pwd",
            "echo hello",
            "mkdir newdir",
            "touch file.txt",
            "grep -r foo .",
            "find . -name *.java",
            "findstr foo file.txt",
            "wc -l file.txt",
            "head -n 10 file.txt",
            "tail -f log.txt",
            "sort data.txt",
            "uniq lines.txt",
            "curl https://example.com",
            "wget http://example.com/file",
            "where git",
            "mvn clean install",
            "gradle build",
            "npm install",
            "yarn add lodash",
            "pnpm install",
            "javac Main.java",
            "java -jar app.jar",
            "jar cf app.jar .",
            "javadoc -d docs src",
            "dir",
            "mvn test -Dskip=false"
        };

        for (String command : allowedCommands) {
            ObjectNode args = objectMapper.createObjectNode();
            args.put("command", command);
            assertDoesNotThrow(() -> validator.validateParameters(args),
                "期望允许的命令通过: " + command);
        }
    }

    @Test
    void testBlockedCommands() {
        String[] blockedCommands = {
            "rm file.txt",
            "del file.txt",
            "rmdir dir",
            "rd dir",
            "format d:",
            "fdisk",
            "sudo apt-get update",
            "su root",
            "chmod 755 file",
            "chown user:group file",
            "shutdown -h now",
            "reboot",
            "halt",
            "poweroff",
            "dd if=/dev/zero of=/dev/sda",
            "mkfs /dev/sda1",
            "fsck /dev/sda1"
        };

        for (String command : blockedCommands) {
            ObjectNode args = objectMapper.createObjectNode();
            args.put("command", command);
            ToolExecutionException exception = assertThrows(ToolExecutionException.class,
                () -> validator.validateParameters(args),
                "期望阻止的命令抛出异常: " + command);
            assertTrue(exception.getMessage().contains("被禁止执行"),
                "期望" + command + "的提示包含'被禁止执行'，实际: " + exception.getMessage());
        }
    }

    @Test
    void testDangerousPatternsInAllowedCommands() {
        String[] dangerousWithinAllowed = {
            "echo rm -rf /",
            "cat > /dev/null",
            "grep 'dd if=' file.txt"
        };

        for (String command : dangerousWithinAllowed) {
            ObjectNode args = objectMapper.createObjectNode();
            args.put("command", command);
            ToolExecutionException exception = assertThrows(ToolExecutionException.class,
                () -> validator.validateParameters(args),
                "期望危险模式被检测到: " + command);
            assertTrue(exception.getMessage().contains("危险命令模式"),
                "期望" + command + "的提示包含'危险命令模式'，实际: " + exception.getMessage());
        }
    }

    @Test
    void testDangerousPatternTakesPrecedenceOverBlockedCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "sudo echo hello");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("危险命令模式"));
    }

    @Test
    void testNotAllowedCommand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "python script.py");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("不在允许列表中"));
        assertTrue(exception.getMessage().contains("python"));
    }

    @Test
    void testNotAllowedCommandWithBlockedFirstWord() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "unknown_command --help");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("不在允许列表中"));
        assertTrue(exception.getMessage().contains("unknown_command"));
    }

    @Test
    void testShellOperatorSemicolon() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status; rm -rf /");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("shell 操作符"));
    }

    @Test
    void testShellOperatorDoubleAmpersand() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status && rm -rf /");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("shell 操作符"));
    }

    @Test
    void testShellOperatorDoublePipe() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "false || echo fail");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("shell 操作符"));
    }

    @Test
    void testShellOperatorBacktick() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo `whoami`");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("shell 操作符"));
    }

    @Test
    void testShellOperatorDollarBracket() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo $(whoami)");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("shell 操作符"));
    }

    @Test
    void testShellOperatorPrecedesDangerousPattern() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo 'rm -rf /' ; echo done");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("shell 操作符"));
    }

    @Test
    void testForkBombCaughtBySemicolonCheckFirst() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo ':(){ :|:& };:'");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("shell 操作符"));
    }

    @Test
    void testAllowedCommandCaseInsensitive() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "GIT status");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testBlockedCommandCaseInsensitive() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "RM file.txt");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("被禁止执行"));
    }

    @Test
    void testAllowedCommandWithFullPathCaseInsensitive() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "/UsR/BiN/Git status");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testExtractCommandNameWithFullPath() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "/usr/bin/git status");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testExtractCommandNameWithPipe() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "cat file.txt | grep error");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testExtractCommandNameWithRedirect() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello > output.txt");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testExtractCommandNameWithAppendRedirect() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "echo hello >> output.txt");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testExtractCommandNameWithPipeAndRedirect() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "grep error log.txt | head -n 10 > result.txt");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testExtractCommandNameWithFullPathAndPipe() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "/bin/cat /etc/hosts | /usr/bin/grep localhost");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testTimeoutNoParameter() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testTimeoutValidMin() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", 1);

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testTimeoutValidMax() throws ToolExecutionException {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", 300);

        assertDoesNotThrow(() -> validator.validateParameters(args));
    }

    @Test
    void testTimeoutTooSmall() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", 0);

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("超时时间必须在 1-300 秒之间"));
    }

    @Test
    void testTimeoutTooLarge() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", 301);

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("超时时间必须在 1-300 秒之间"));
    }

    @Test
    void testTimeoutNegative() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.put("timeout", -1);

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("超时时间必须在 1-300 秒之间"));
    }

    @Test
    void testTimeoutNullIsTreatedAsZero() {
        ObjectNode args = objectMapper.createObjectNode();
        args.put("command", "git status");
        args.putNull("timeout");

        ToolExecutionException exception = assertThrows(ToolExecutionException.class, () -> {
            validator.validateParameters(args);
        });

        assertTrue(exception.getMessage().contains("超时时间必须在 1-300 秒之间"));
    }
}
