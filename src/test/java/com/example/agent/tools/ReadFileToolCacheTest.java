package com.example.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ReadFileTool 文件缓存测试")
class ReadFileToolCacheTest {

    private ReadFileTool readFileTool;
    private ObjectMapper objectMapper;
    private Path testDir;
    private Path testFile;

    @BeforeEach
    void setUp() throws IOException {
        readFileTool = new ReadFileTool();
        objectMapper = new ObjectMapper();
        
        testDir = Paths.get(System.getProperty("user.dir")).resolve("target").resolve("test-temp");
        Files.createDirectories(testDir);
        
        testFile = testDir.resolve("test.txt");
        Files.writeString(testFile, "Hello, World!");
    }

    @AfterEach
    void tearDown() throws IOException {
        readFileTool.clearCache();
        if (Files.exists(testFile)) {
            Files.delete(testFile);
        }
    }

    @Nested
    @DisplayName("缓存命中测试")
    class CacheHitTests {

        @Test
        @DisplayName("首次读取返回完整内容")
        void firstReadReturnsFullContent() throws Exception {
            JsonNode args = createArgs(testFile.toString());
            String result = readFileTool.execute(args);

            assertTrue(result.contains("Hello, World!"));
            assertTrue(result.contains("<file_content>"));
            assertEquals(1, readFileTool.getCacheSize());
        }

        @Test
        @DisplayName("第二次读取返回缓存提示和完整内容")
        void secondReadReturnsCacheHint() throws Exception {
            JsonNode args = createArgs(testFile.toString());
            
            String firstResult = readFileTool.execute(args);
            assertTrue(firstResult.contains("<file_content>"));

            String secondResult = readFileTool.execute(args);
            assertTrue(secondResult.contains("<system-reminder>"));
            assertTrue(secondResult.contains("内容未改变"));
            assertTrue(secondResult.contains("内容已从缓存返回"));
            assertTrue(secondResult.contains("<file_content>"));
            assertTrue(secondResult.contains("Hello, World!"));
        }

        @Test
        @DisplayName("缓存提示包含访问次数")
        void cacheHintIncludesAccessCount() throws Exception {
            JsonNode args = createArgs(testFile.toString());
            
            readFileTool.execute(args);
            String secondResult = readFileTool.execute(args);
            assertTrue(secondResult.contains("第 2 次访问"));

            String thirdResult = readFileTool.execute(args);
            assertTrue(thirdResult.contains("第 3 次访问"));
        }

        @Test
        @DisplayName("缓存提示包含时间信息")
        void cacheHintIncludesTimeInfo() throws Exception {
            JsonNode args = createArgs(testFile.toString());
            
            readFileTool.execute(args);
            String result = readFileTool.execute(args);
            
            assertTrue(result.contains("刚刚") || result.contains("秒前"));
        }
    }

    @Nested
    @DisplayName("缓存失效测试")
    class CacheInvalidationTests {

        @Test
        @DisplayName("文件修改后缓存失效")
        void cacheInvalidatedOnFileModification() throws Exception {
            JsonNode args = createArgs(testFile.toString());
            
            String firstResult = readFileTool.execute(args);
            assertTrue(firstResult.contains("<file_content>"));

            Thread.sleep(10);
            Files.writeString(testFile, "Modified Content!");

            String secondResult = readFileTool.execute(args);
            assertTrue(secondResult.contains("<file_content>"));
            assertTrue(secondResult.contains("Modified Content!"));
        }

        @Test
        @DisplayName("手动清除缓存")
        void manualCacheClear() throws Exception {
            JsonNode args = createArgs(testFile.toString());
            
            readFileTool.execute(args);
            assertEquals(1, readFileTool.getCacheSize());

            readFileTool.clearCache();
            assertEquals(0, readFileTool.getCacheSize());

            String result = readFileTool.execute(args);
            assertTrue(result.contains("<file_content>"));
        }

        @Test
        @DisplayName("单个文件缓存失效")
        void singleFileCacheInvalidation() throws Exception {
            JsonNode args = createArgs(testFile.toString());
            
            readFileTool.execute(args);
            assertEquals(1, readFileTool.getCacheSize());

            readFileTool.invalidateCache(testFile.toString());
            assertEquals(0, readFileTool.getCacheSize());

            String result = readFileTool.execute(args);
            assertTrue(result.contains("<file_content>"));
        }
    }

    @Nested
    @DisplayName("多文件缓存测试")
    class MultiFileCacheTests {

        @Test
        @DisplayName("多个文件独立缓存")
        void multipleFilesCachedIndependently() throws Exception {
            Path file1 = testDir.resolve("file1.txt");
            Path file2 = testDir.resolve("file2.txt");
            Files.writeString(file1, "Content 1");
            Files.writeString(file2, "Content 2");

            JsonNode args1 = createArgs(file1.toString());
            JsonNode args2 = createArgs(file2.toString());

            String result1 = readFileTool.execute(args1);
            String result2 = readFileTool.execute(args2);

            assertTrue(result1.contains("Content 1"));
            assertTrue(result2.contains("Content 2"));
            assertEquals(2, readFileTool.getCacheSize());

            String cached1 = readFileTool.execute(args1);
            String cached2 = readFileTool.execute(args2);

            assertTrue(cached1.contains("<system-reminder>"));
            assertTrue(cached2.contains("<system-reminder>"));
            assertTrue(cached1.contains("Content 1"));
            assertTrue(cached2.contains("Content 2"));
        }
    }

    private JsonNode createArgs(String path) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("path", path);
        return node;
    }
}
