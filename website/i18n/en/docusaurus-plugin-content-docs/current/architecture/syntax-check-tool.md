---
sidebar_position: 2
---

# Why Does an Agent Need Syntax Checking: HippoBuddy's Selection Journey

> Among desktop Agent products, it's almost impossible to find another tool dedicated to syntax checking. This "nobody does it" feature is precisely the most cost-effective investment in the Agent coding loop.

***

## An Overlooked Gap

If you survey desktop Agent products on the market — beyond AI-native IDEs like Cursor, Trae, and Windsurf — very few in the coding space have designed a dedicated code syntax check tool. And even when they do, it's most likely piggybacking on the IDE's built-in syntax checking.

This isn't because it's unnecessary. Quite the opposite — it's one of the most frequent operations in AI coding: after the Agent writes code, it needs a lightweight yardstick that returns, within milliseconds, a list of "where a parenthesis is missing, where a semicolon is absent," and then fixes the code based on that list.

HippoBuddy made a different choice here: it designed a dedicated code check tool (`lint_diagnostics`). This article aims to explain **why this tool deserves to exist, and why it ended up looking the way it does**.

***

## Origin: Even LLMs Make Low-level Mistakes

A natural intuition is: code written by LLMs is basically correct — how could it be wrong?

And that's largely true — today's models write small snippets with astonishing accuracy. But if you've used Agent coding long enough, you'll notice a counter-intuitive distribution: **the mistakes models make most often are not logic errors, not even "syntax errors," but a class of even more basic errors.**

This was especially pronounced in the early days when model capabilities were weaker. Recalling real usage, the most common mistakes models made were:

- An unclosed parenthesis
- A missing semicolon `;` at the end of a statement
- A forgotten import

Errors so "basic" they're almost comical. Today's mainstream models rarely make them — but note: **"rarely," not "never."** Especially in long-file editing scenarios, the probability rises noticeably.

Why do LLMs make such errors? It comes down to the model's underlying output mechanism and its "cleverness." An LLM generates content token by token; the longer the sequence, the more attention decays over long distances — dropping a character or missing a semicolon near the end of a file is fundamentally a probabilistic slip. It's not that the model "can't" — it "occasionally forgets." The smarter the model, the lower the probability — but it never reaches zero.

***

## The Cost Ledger: Paying for Agentic Loop Inefficiency

Since errors are unavoidable, the question becomes: **within a single conversation, how does the LLM discover them?**

The answer is usually not "it sees them itself" — the model confidently says "no problem," then misses a semicolon. Most of the time, errors surface only through **compilation or execution**:

```
Edit code → compile/run → error → return to source to find the issue → fix → recompile/rerun to verify → pass ✅
                          ↑________________________________________|
```

This is the so-called **Agentic Loop**.

And this is precisely the problem: **such a trivial mistake ends up costing so many rounds of tool calls — clearly not worth it, and plainly unreasonable.**

- Compile fails → read the error → locate → fix → recompile → possibly another error... A missing semicolon can burn seven or eight tool calls
- Worse, every one of those calls round-trips through the LLM, each with token and latency costs
- And the mistake itself? Perhaps just one missing character

From an architecture perspective, there's a glaring gap: **the LLM already has "read" and "write" abilities, but no "quick check" ability.**

```
LLM already has:
  read  → read files (grep / glob / read_file)
  write → modify files (write_file / edit_file)

LLM lacks:
  check → quickly verify edit results (syntax diagnostics)
```

Of course, using bash to compile, test, and run can also catch these errors — but that's overkill for a project: running the entire build pipeline just to verify a semicolon isn't worth it.

So the conclusion is clear: **for the kind of low-level errors LLMs make, can we design a lightweight tool dedicated to detecting them?**

The answer: yes.

***

## A Shelved Chapter: JNI

Actually, code diagnostics were in HippoBuddy's earliest design: **after the LLM edits code, immediately let it know whether the edited code has syntax errors; if so, return the errors to the LLM right after editing** — instead of waiting for compilation to fail.

Early attempts used JNI (Java Native Interface) — specifically the `java-tree-sitter` library, a JNI binding that wraps Tree-sitter's C interface. But a blocker soon emerged: **it's impossible to introduce a native dependency for every language, or write a separate set of diagnostic rules for each.**

JNI's essence is "loading native shared libraries inside the Java process" — Windows needs `.dll`, macOS `.dylib`, Linux `.so`; **each platform requires a separately compiled binary, and every user's machine needs the matching version.** For a desktop app, that's a disaster:

- Users switch platforms, and the parser must switch binaries
- Native library versions must match the JVM's bitness (32/64-bit)
- A failed `.so` load can crash the entire Java process
- Switch languages, and it's another native library, another set of rules — **and the JNI binding supports only Java anyway**

Maintaining every language separately means linearly exploding effort and terrible extensibility. So the direction was shelved for a while. But shelved doesn't mean abandoned — the need remained; only the implementation path was missing.

***

## Three Candidates: CLI / tree-sitter / LSP

When "syntax detection" was back on the agenda, the question became: **are there existing tools?**

Yes. The three directions that made it into view — and are the most mainstream — are:

| Approach | What it is | One-liner |
|------|--------|-----------|
| **Official CLI tools** | Each language's official check/compile commands | javac, eslint, flake8, go vet, cargo check |
| **tree-sitter** | Parser generator tool + incremental parsing library | Parses code into a syntax tree, detects structural errors |
| **LSP** | Language Server Protocol | The foundation of modern IDEs; navigation, references, diagnostics all included |

Each approach has its advocates and its costs. HippoBuddy actually walked all three paths — two of them were paved with potholes.

***

## CLI: Seemingly Simple, Everywhere Pitfalls

The first reaction is always: CLI tools are so simple, just call them — why make it complicated?

The original `lint_diagnostics` tool did indeed use the official CLI approach: `javac -Xlint` for Java, `eslint` for JavaScript, `flake8` for Python, `go vet` for Go, `cargo check` for Rust... The idea was clean: **the Agent doesn't parse anything itself — it lets each language's most authoritative parser do the job.**

But once designed and actually used, the problems surfaced. The tool ballooned to **925 lines**, most of which weren't "diagnostic logic" but "glue code serving external tools":

```java
// Find Java project's classpath (parsed from pom.xml, ~150 lines)
private Path findJavaProjectRoot(Path target) { ... }
private String resolveMavenClasspathFromPom(Path pomFile) { ... }

// Check whether the tool is installed (where / which); error if not
private String checkToolAvailable(String language) { ... }

// One regex per language, extracting errors from tool output
Pattern GO_VET_LINE = Pattern.compile("^(.+\\.go):(\\d+):(\\d+):\\s*(.+)$", Pattern.MULTILINE);
```

The problems went far beyond "ugly code" — each one was fatal:

1. **Depends on local installation**: The user's machine must have the corresponding tools and runtimes. Not installed? Then set up the entire environment first. Java also needs a proper classpath, or `javac` can't even find its dependencies.
2. **Output formats all over the place**: javac emits plain text, eslint emits JSON, go vet emits yet another text format... each language needs its own regex parser.
3. **Configuration hell**: To make the tools run, you need PATH augmentation, Maven classpath resolution, runtime path configuration... the code written to "serve the tools" exceeds the code that does the actual diagnosing.
4. **Process overhead**: Every diagnostic cold-starts a new process, typically hundreds of milliseconds.
5. **Cross-platform inconsistency**: Windows and Linux don't even share the same command names.
6. **Fragmented cross-language checks**: Multiple files of the same language can be checked in one pass, but different languages must be checked separately.

In practice, results were disappointing. The CLI approach traded "deployment problems" for "integration problems" — the problems didn't disappear, they just moved.

***

## LSP: Comprehensive, but Not for This Scenario

After CLI was eliminated, two candidates remained: tree-sitter and LSP.

LSP looks like the "rightest" answer — it's too comprehensive: navigation, reference lookup, completion, diagnostics. Modern IDEs embed an LSP server per language. Look at Claude Code, Codex — they've designed similar tools. Integrating LSP would be a one-shot deal, just like an IDE, right?

HippoBuddy did integrate LSP midway, using its navigation and reference-lookup abilities to build a dedicated tool. But real usage revealed several insurmountable hurdles:

1. **The model doesn't favor calling LSP**: This was the fatal one. In practice, the LLM often completes basic code exploration with `grep`, `glob`, and `read` alone — LSP never gets called. The heavily integrated capability has a near-zero call rate.
2. **One server per language**: Every language requires downloading its own LSP server and plugins — tedious and complex. The more languages supported, the more servers to maintain.
3. **Heavy memory footprint**: LSP builds a global index at runtime; a single LSP server consumes roughly several hundred MB of memory. As a resident process, that resource footprint is unacceptable for a desktop app.

This brings a key judgment: **HippoBuddy's goal was never to become an IDE.** An IDE needs the full capability set for human developers; an Agent needs lightweight validation to check its own work. LSP's capability was severely over-provisioned, and it carried the cost of that over-provisioning. So the LSP approach was cut.

***

## tree-sitter: The Last One Standing

After three rounds of elimination, only one candidate remained: tree-sitter.

What is tree-sitter? Per its official site: **a parser generator tool and an incremental parsing library**. Its core goal is to provide programming tools with fast, robust, general-purpose, easily embeddable code parsing.

What do we use it for? The answer is direct: **its code parsing ability.**

Compared to LSP, tree-sitter is far lighter:

- No global index, no resident service
- Results come out immediately after parsing; it leaves when done
- Pure in-memory operation, millisecond response
- One grammar definition per language, but negligible load cost

Back to our scenario — **detecting the low-level errors LLMs make when editing code** — tree-sitter happens to be built for exactly this:

| Need | tree-sitter's capability |
|------|-------------------|
| Mismatched parentheses | Parse-tree structural error detection ✅ |
| Missing semicolon | Parse-tree MISSING node detection ✅ |
| Illegal structure | ERROR node detection ✅ |

What it catches is "whether the code can be parsed" — structural errors. Semantic errors like type mismatches and undefined variables are never its job; those are covered by model self-review plus running tests.

And with that, the direction was set.

***

## Direction Set — Now, Integration?

The selection ends here, but the story is just beginning — **tree-sitter's core library is written in C, and HippoBuddy's backend is Java.**

Must we return to the shelved JNI path? Compile native libraries for every language, adapt `.dll`/`.so` for every platform?

This question leads to another technology: **WASM**. How it lets Java gracefully call a C-written parser, and the pitfalls along the way, is the topic of the next article — part two of this series: *From Adaptation to Definition: HippoBuddy's WASM Evolution*.
