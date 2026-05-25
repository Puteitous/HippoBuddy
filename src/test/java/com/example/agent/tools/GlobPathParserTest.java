package com.example.agent.tools;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.*;

class GlobPathParserTest {

    @ParameterizedTest
    @CsvSource({
        "C:\\src\\**\\*.java,      true",
        "C:/src/**/*.java,         true",
        "C:/*.txt,                 true",
        "D:\\*.java,               true",
        "/src/**/*.java,           true",
        "/*.txt,                   true",
        "**/*.java,                false",
        "src/**/*.java,            false",
        "*.java,                   false",
        ".gitignore,               false",
        "pom.xml,                  false",
    })
    void testIsAbsolutePattern(String pattern, boolean expected) {
        assertEquals(expected, GlobPathParser.isAbsolutePattern(pattern));
    }

    @Test
    void testIsAbsolutePatternNull() {
        assertFalse(GlobPathParser.isAbsolutePattern(null));
    }

    @Test
    void testIsAbsolutePatternEmpty() {
        assertFalse(GlobPathParser.isAbsolutePattern(""));
    }

    @Test
    void testIsAbsolutePatternUncPath() {
        assertTrue(GlobPathParser.isAbsolutePattern("//server/share/**/*.java"));
    }

    @Test
    void testExtractGlobBaseDirectoryDoubleStar() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("**");
        assertEquals("", result.baseDir());
        assertEquals("**", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryDoubleStarJava() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("**/*.java");
        assertEquals("", result.baseDir());
        assertEquals("**/*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryFromSrc() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("src/**/*.java");
        assertEquals("src", result.baseDir());
        assertEquals("**/*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryDeepPath() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("src/main/java/**/*.java");
        assertEquals("src/main/java", result.baseDir());
        assertEquals("**/*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryWindowsAbsolute() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("C:/src/**/*.java");
        assertEquals("C:/src", result.baseDir());
        assertEquals("**/*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryWindowsDriveRoot() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("C:/*.txt");
        assertEquals("C:\\", result.baseDir());
        assertEquals("*.txt", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryWindowsBackslash() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("C:\\src\\**\\*.java");
        assertEquals("C:\\src", result.baseDir());
        assertEquals("**\\*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryUnixAbsolute() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("/src/**/*.java");
        assertEquals("/src", result.baseDir());
        assertEquals("**/*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryUnixRoot() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("/*.txt");
        assertEquals("/", result.baseDir());
        assertEquals("*.txt", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryNoGlobChars() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory(".gitignore");
        assertEquals("", result.baseDir());
        assertEquals(".gitignore", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryNoGlobCharsWithPath() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("src/main/java/Foo.java");
        assertEquals("src/main/java", result.baseDir());
        assertEquals("Foo.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectorySimplePattern() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("*.java");
        assertEquals("", result.baseDir());
        assertEquals("*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryQuestionMark() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("src/main/?/Foo.java");
        assertEquals("src/main", result.baseDir());
        assertEquals("?/Foo.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryBracket() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("src/[abc]/file.txt");
        assertEquals("src", result.baseDir());
        assertEquals("[abc]/file.txt", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryBrace() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("src/{main,test}/**/*.java");
        assertEquals("src", result.baseDir());
        assertEquals("{main,test}/**/*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryPatternOnly() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("*.{java,xml}");
        assertEquals("", result.baseDir());
        assertEquals("*.{java,xml}", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryAbsoluteWindowsPattern() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("C:\\projects\\src\\**\\*.java");
        assertEquals("C:\\projects\\src", result.baseDir());
        assertEquals("**\\*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryWithDotSlash() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("./src/**/*.java");
        assertEquals("./src", result.baseDir());
        assertEquals("**/*.java", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryWindowsAbsoluteWithForwardSlash() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("D:/data/**/*.csv");
        assertEquals("D:/data", result.baseDir());
        assertEquals("**/*.csv", result.relativePattern());
    }

    @Test
    void testExtractGlobBaseDirectoryMixedSeparators() {
        GlobPathParser.ParsedGlob result = GlobPathParser.extractGlobBaseDirectory("src\\main/java/**/*.java");
        assertEquals("src\\main/java", result.baseDir());
        assertEquals("**/*.java", result.relativePattern());
    }
}
