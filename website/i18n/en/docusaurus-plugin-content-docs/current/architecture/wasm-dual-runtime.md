---
sidebar_position: 3
---

# From Adaptation to Definition: HippoBuddy's WASM Evolution

> Part two of this series. Part one, *Why Does an Agent Need Syntax Checking*, answered the "why" (selection); this one answers the "how" (implementation): from JNI to external CLI, from borrowed WASM to self-compiled WASM — four generations of approaches, each an improvement on the answer to the same question: **how to let Java gracefully call a parser written by someone else.**

***

## Picking Up from Part One: Direction Set, Half the Problem Remains

Part one, *Why Does an Agent Need Syntax Checking*, covered the "why": LLMs make low-level mistakes like unclosed parentheses and missing semicolons, and the Agentic Loop pays too dearly for them. So HippoBuddy decided to build a lightweight `lint_diagnostics` tool, and finally chose tree-sitter from the three candidates — CLI, LSP, tree-sitter — a fast, robust, general-purpose, easily embeddable parser.

But the selection only answered half the problem. The other half: **tree-sitter's core library is written in C, and the Agent's host is Java — how does Java call a C-written library?**

HippoBuddy answered this question four times. Each answer overturned the previous one.

***

## Recap: Generation One (JNI) and Generation Two (CLI)

Before diving in, a quick recap of the first two failures — they're detailed in part one, so here's just a summary:

**Generation One: JNI.** Used the `java-tree-sitter` library to call C-written Tree-sitter through JNI. It worked, but only on one platform at a time: Windows needs `.dll`, macOS `.dylib`, Linux `.so` — each platform separately compiled, the JVM bitness must match, and a single failed `.so` load can crash the whole process. It also supported only Java.

**Generation Two: External CLI.** `lint_diagnostics` switched to calling each language's official tools (javac / eslint / flake8 / go vet / cargo check), trading process isolation for cross-platform reach. The cost: the tool ballooned to 925 lines — finding classpaths, checking tool availability, one regex per language to parse outputs — all glue code written to "make the tools run," plus dependence on local installation and inconsistent cross-platform behavior.

Both paths were dead ends. The remaining question became: **is there a way to get both "in-process calling efficiency" and "cross-platform distribution convenience"?** That's when WASM entered the picture.

***

## Why WASM?

The question left by the recap: **is there a way to get both "in-process calling efficiency" and "cross-platform distribution convenience"?** WASM happens to answer both at once. First, what it is —

WASM (WebAssembly) is a W3C-standardized **portable bytecode format**, designed for compile-once-run-anywhere, small size, fast loading, and sandbox isolation. Today it's far from a lab technology — you've touched things on the internet that run on it:

- H5 games (WebGL) exported by Unity and Unreal, whose core logic is WASM
- Mini-game platforms like WeChat and Douyin, which support WASM for high-performance computation
- Heavy applications like Figma and Zoom, which use it for in-browser image and video processing
- Even SQLite has an official WASM version

In short, **whenever you want to "run heavy logic in the browser," WASM is the default answer** — and what HippoBuddy wanted was to obtain that same capability inside the JVM.

For HippoBuddy's scenario, it has several decisive advantages:

| Comparison | JNI | External CLI | WASM |
|------|-----|---------|------|
| Cross-platform | One `.dll/.dylib/.so` per platform; JVM bitness must match | Command names and behavior vary by platform | **Compile once, works anywhere** |
| Deployment | Users install version-matched native libraries | Users install per-language toolchains | **A pure bytecode file shipped with the app** |
| Process safety | A failed native load crashes the whole JVM | Process-isolated, but cold-starts cost hundreds of ms | **Sandbox-isolated; a crash doesn't touch the host process** |
| Call overhead | In-process | New process per call | **Resident in memory, millisecond calls** |

In other words: **WASM solves both "cross-platform distribution" and "in-process calling" at once** — precisely the two pain points of generation two. It doesn't load native libraries (unlike JNI's platform binaries), doesn't spawn processes (unlike CLI's cold starts), but instead **resides inside the Java process as bytecode**, executed by a runtime.

Note that "executed by a runtime" matters: running WASM in Java requires a dedicated runtime. HippoBuddy chose **Chicory** (a WASM runtime inside the JVM). Browser engines (embedded V8/QuickJS) and GraalVM were considered but not chosen — the reason is expanded in the "Another WASM in the Same Project" section below; in short: **diagnostics is a backend capability whose results feed the LLM, so it must stay inside the JVM process — hence an embedded JVM runtime, not a browser engine.**

The direction seemed clear: compile C-written Tree-sitter to WASM, load and execute it in the JVM with Chicory — compile once, run anywhere, no native libraries, no processes, no local installation. Sounded perfect.


***

## Generation Three: Borrowed WASM — "The Seemingly Perfect Answer"

So generation three chose **the ready-made WASM files from the official NPM package** — the `tree-sitter.wasm` core plus 9 language plugins, downloaded and used directly.

These WASM files were compiled by the official team with the Emscripten compiler for the **browser** scenario: paired with the official `web-tree-sitter` binding, they do **syntax highlighting**, code folding, and structural analysis in web pages — online editors, code-sharing sites, that kind of product. In other words, their host is the JavaScript environment, and **no one ever imagined a Java program loading them inside its own JVM process**.

But that's exactly the "never imagined" use case HippoBuddy needed.

Then the nightmare began.

**These WASM files were compiled by Emscripten**, which carries its own runtime conventions — it needs 16 system-level imports, including WASI functions, Emscripten runtime functions, globals, memory, and a function table. To make it run, the Java side must **hand-write all 16 exactly-matching stubs**:

```java
// One of the 16 stubs — the signature must match the Emscripten ABI exactly
// fd_seek's Emscripten signature differs from the WASI standard!
Store.addFunction("fd_seek", ...);   // (i32,i32,i32,i32,i32)→i32
```

What made it worse:

- **The registration order must strictly match** the WASM's Import Section; one position off and you get `UnlinkableException`
- The core runtime and language plugins need **double linking** (Store mechanism); plugins depend on the core's memory/table
- All `ts_*` function names carry a `_wasm` suffix, matching no official documentation
- One wrong callback stub and parsing forever returns an **empty tree** — no error, but the results are all wrong

To validate the chain, a 576-line linking test was written — and only half of it passed. The "grab-and-go" WASM in the official NPM package turned out to be a precision instrument that requires you to understand its entire internal contract.

**The lesson of generation three is profound: WASM is not a library; it's a compilation artifact. Whoever compiled it, it carries their ABI baggage.** Borrowing ready-made WASM means accepting every convention someone else's compiler imposed on you.

***

## Generation Four: Self-Compiled WASM — "The Protocol Is Ours to Define"

The common thread in the first three failures: **they were all adapting to someone else's stuff** — JNI adapted to native-library ABIs, CLI adapted to external-command output, Emscripten adapted to another compiler's import conventions.

Generation four made a pivotal shift: **stop adapting; define it ourselves.**

What language to write this thin middle layer in? Rust — and here's a telling fact: **tree-sitter's official CLI is itself written in Rust.**

The language grammars also ship as ready-made Rust crates on crates.io (`tree-sitter-java`, `tree-sitter-javascript`...), directly usable, and `wasm32-wasip1` is a mature Rust compilation target.

Writing the middle layer in Rust means standing on the same side of tree-sitter's official toolchain — minimal glue, fastest integration.

So, a thin middle layer in Rust (~290 lines of `lib.rs`) wraps Tree-sitter, **deciding for ourselves what functions to export and what protocol to use** — only three functions:

```rust
#[no_mangle] pub extern "C" fn alloc(size: i32) -> *mut u8    // allocate memory
#[no_mangle] pub extern "C" fn dealloc(ptr: *mut u8, size: i32) // free memory
#[no_mangle] pub extern "C" fn parse(                          // parse, returns JSON
    code_ptr: i32, code_len: i32, lang_ptr: i32, lang_len: i32,
) -> i64
```

The compilation target switched from Emscripten to **`wasm32-wasip1`** — the WASI standard. This choice was the key: WASI is WebAssembly's **standard system interface**, and Chicory (Java's WASM runtime) **natively implements WASI**. Hence:

```
Old: borrowed Emscripten WASM → 16 hand-written non-standard stubs → double linking → edge of collapse
New: self-compiled wasip1 WASM → Chicory's WasiPreview1 provides all imports automatically → zero stubs
```

The cost comparison is striking:

| Dimension | Generation 3 (Emscripten) | Generation 4 (Rust wasip1) |
|------|---------------------|----------------------|
| Stubs | 16 hand-written, signatures must match exactly | **0**, provided automatically by WASI |
| WASM files | 1 core + 9 language plugins, double-linked | **1** self-contained file |
| Linking tests | 576 lines, only half passing | deleted |
| LintDiagnosticsTool | — | **925 lines → 287 lines** (core logic ~80 lines) |
| Languages | — | 9 (all compiled into one file) |

The truth behind the 925 lines of glue code disappearing: **those lines should never have existed.** `findJavaProjectRoot`, `resolveMavenClasspathFromPom`, PATH augmentation, regex parsing, tool-availability checks — all of them existed only to "make someone else's parser run." Once the parser became self-compiled WASM called through a standard interface, **their reason to exist vanished**.

The final shape is a much cleaner architecture:

```
Java side (Chicory runtime)
  ├─ load tree-sitter-parser.wasm (5.6MB, once)
  ├─ write source code into shared linear memory
  ├─ call parse() → Rust actually parses → returns JSON
  └─ read JSON → list of errors
```

Rust does the "work" (actual parsing), WASM handles "delivery" (cross-platform format), Chicory provides the "environment" (execution inside the JVM). Each does its job, and **the protocol is entirely ours to define — no one's ABI to accommodate**.


Putting it all together, the complete chain of a single syntax-diagnosis call looks like this:

```
LLM decides to verify code → calls lint_diagnostics(paths)
  → Java collects files by extension, groups by language
  → source written into WASM linear memory → calls parse(code, lang)
  → Rust parses the syntax tree → collects ERROR / MISSING nodes → returns JSON
  → Java parses the JSON → formats into an error list (file, line, column, message)
  → the list returns to the LLM context → the LLM fixes the code directly
```

The whole thing runs inside the JVM process with millisecond response — the LLM receives a structured list of "where the parenthesis is missing, where the semicolon is absent," and can fix it in place, without the multi-round "edit → compile/run → find error → edit again" loop. This is exactly the gap described in part one (has read, has write, lacks check) being filled: **check — now it has that too.**

***

## Boundary: Pure Syntax, Not Semantics

To be honest about this chain's boundary: Tree-sitter is a **syntax parser**, not a compiler frontend.

- ✅ Catches: mismatched parentheses, missing semicolons, illegal syntax — **structural errors**
- ❌ Cannot catch: type mismatches, undefined variables, calls to nonexistent methods — **semantic errors**

What `lint_diagnostics` covers is "whether the code can be parsed"; "whether the code logic is correct" is backed by model self-review plus running tests. This is a **positioning choice, not a defect** — it lands exactly in the densest region of AI coding error distribution (the errors model-generated code makes most often are precisely missing parentheses and semicolons), without carrying the weight of a compiler frontend.

***

## Another WASM in the Same Project: OOXML Preview

The story doesn't end here. HippoBuddy has a second WASM chain — Office file preview (`@silurus/ooxml`).

Interestingly, this chain took a **completely different path**:

| Dimension | Syntax diagnostics | OOXML preview |
|------|---------|-----------|
| Capability belongs to | LLM toolchain (backend) | UI interaction (frontend) |
| Result goes to | LLM context (text JSON) | Screen (Canvas rendering) |
| WASM runtime | **Chicory** (embedded in JVM) | **Browser native engine** |
| Acquisition | Self-compiled | Off-the-shelf library |

**Syntax diagnostics** is a backend capability — the result feeds the LLM, so it must stay inside the JVM process, hence Chicory; **file preview** is a frontend capability — the result is drawn onto Canvas, natively belonging to the rendering process, hence the browser's built-in engine.

The two decisions are two sides of the same judgment: **the runtime isn't a technical preference — it's decided by "who the capability belongs to."** What the backend needs (results into the model) uses an embedded JVM runtime; what the frontend needs (results onto the screen) uses the browser native engine — each in its place.

> A natural question: since Tree-sitter runs perfectly in the browser (the official `web-tree-sitter` binding is right there), why not put diagnostics on the frontend, reuse the official WASM, and skip compiling it ourselves?
>
> Technically feasible — the frontend parses and sends the error list back to the backend via IPC. But this path moves the problem from "how to parse" to "who the capability belongs to": lint is a backend capability (the result goes into the LLM context), so putting it on the frontend means tests, API calls, and headless usage all break, plus an extra cross-process round trip. And "skipping the compilation" only outsources the Emscripten adaptation to the official JS binding — the cost is traded for the backend depending on the UI existing.
>
> So diagnostics didn't choose the browser engine back then not because it wasn't considered, but because **who the capability belongs to dictates that it must stay inside the JVM process**.

***

## Conclusion: What Four Generations Taught Us

Looking back over the evolution:

| Generation | Approach | Essence | Outcome |
|------|------|------|------|
| 1 | JNI | Adapting to native-library ABI | Cross-platform nightmare, Java only |
| 2 | External CLI | Adapting to external-command output | 925 lines of glue code, depends on local install |
| 3 | Borrowed WASM | Adapting to someone else's compiler conventions | 16 stubs, stuck |
| 4 | **Self-compiled WASM** | **Defining our own protocol** | Zero dependencies, ~80 lines of core logic |

The first three failures share a common thread: **they all operated inside someone else's rules** — someone else's ABI, someone else's output format, someone else's compilation conventions. Generation four succeeded not because the technology choice was smarter, but because **it took the right to define the protocol back into its own hands**.

Underneath this is a more general judgment:

> **When you need to call code written by someone else, the first question isn't "how to call it" — it's "can I define the protocol myself?"**
>
> If you can only adapt — you'll be held hostage by any one detail of their ABI, output format, or compilation conventions.
> If you can define it yourself — a thin middle layer can keep the complexity on the far side of the boundary.

WASM is the end of this road not because it's "more advanced" than JNI or CLI, but because it's the **only approach that truly returns the right to define the protocol to you** — Rust writes the logic, WASM delivers it, Chicory executes it, and every interface is yours to define. The disappearance of 925 lines of glue code is the best proof that the right to define the protocol came home.

Taken together, the two articles form a complete decision loop: *Why Does an Agent Need Syntax Checking* answers the "why" — the LLM's low-level mistakes are probabilistic and can never be eliminated; engineering can only keep them out of the loop, rather than let them become the cost of multiple compile-run rounds. This article answers the "how" — with "the protocol is ours to define," Java gracefully calls a C-written parser.

***

## Extending: Decidable Correctness, and Undecidable Correctness

This chain's existence rests on an implicit premise: **code correctness is "written in stone"** — syntax has specifications, structure has rules, so it can be verified at the engineering level. Tools like `lint_diagnostics` can exist precisely because of this "determinism."

But in another scenario, we're not so lucky: **for an LLM's knowledge-question answers, we cannot judge correctness at the engineering level.** Code can be parsed, compiled, and tested; but an answer explaining "how Spring's AOP works" — no syntax tree can tell you whether it's right.

This extends to a core difficulty in the RAG world: **how do you guarantee an LLM's answer is as expected and correct?** Code-checking tools solve "decidable correctness"; knowledge-question answering faces "undecidable correctness" — and the latter has no "yardstick" like tree-sitter. We'll write a separate article on this later.
