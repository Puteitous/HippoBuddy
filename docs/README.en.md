<h1 align="center">
  <img src="../electron/assets/icon.svg" alt="HippoBuddy" width="40" height="40" style="vertical-align: middle; margin-right: 8px;">
  HippoBuddy
</h1>

<p align="center">AI-powered desktop assistant for chat, coding, and office productivity.</p>

<p align="center">
  <a href="../README.md">简体中文</a> ｜ English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Java-21-ED8B00?logo=openjdk&logoColor=white" alt="Java 21">
  <img src="https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/github/v/release/Puteitous/HippoBuddy?logo=github" alt="Release">
  <img src="https://img.shields.io/github/stars/Puteitous/HippoBuddy?style=flat&logo=github" alt="Stars">
  <img src="https://img.shields.io/badge/license-Apache%202.0-555555" alt="License">
  <img src="https://img.shields.io/badge/platform-Desktop%20%7C%20Web-555555" alt="Platform">
  <img src="https://img.shields.io/github/last-commit/Puteitous/HippoBuddy" alt="Last Commit">
</p>

<p align="center">
  <img src="../electron/assets/image.png" alt="HippoBuddy 主界面" width="100%">
</p>

---

## Download

| Platform | Download |
|---|---|
| Windows | [HippoBuddy Setup](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| macOS (Intel) | [HippoBuddy.dmg](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| macOS (Apple Silicon) | [HippoBuddy-arm64.dmg](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| Linux (AppImage) | [HippoBuddy.AppImage](https://github.com/Puteitous/HippoBuddy/releases/latest) |

> 📖 Online documentation: [https://www.hippobuddy.cn/](https://www.hippobuddy.cn/)
>
> 🪞 Gitee mirror repository: https://gitee.com/putetou/HippoBuddy
>
> 🔗 Baidu Netdisk: https://pan.baidu.com/s/1L78e0I7N4zaz_yZsVTeW7A?pwd=pfga
>
> 💬 QQ Group (1102524202) — feedback, feature requests, help, and casual chat

---

## Features

| Feature | Description |
|---|---|
| **Smart Chat** | Chat / Code / Office modes, switch anytime |
| **AI Coding** | Understand project context, generate & refactor code |
| **File Ops** | Read, write, edit, delete with diff preview & rollback |
| **Sessions** | Create, rename, delete, fork discussions |
| **Office Read/Write** | Native parse & generation for Word / Excel / PPT / CSV |
| **Subagent** | Fork, cancel, and run parallel subagents (worker agents) |
| **Memory** | Extract, consolidate & retrieve cross-session memory |
| **MCP Extension** | Built-in SSE & Stdio MCP clients, plug in external tools |
| **Skill System** | Load and orchestrate reusable skill libraries on demand |
| **Toolbox** | Token stats, terminal, browser, live monitor |
| **Onboarding** | Spotlight tour on first launch |

<p align="center">
  <img src="../electron/assets/image1.png" alt="Chat 与预览面板" width="100%">
  <br>
  <em>Chat panel and preview panel working together</em>
</p>

---

## Why HippoBuddy?

Compared to other AI agent tools (Codex, Claude Code, Copilot, Kimi, Trae Work, WorkBuddy):

| Dimension | HippoBuddy |
|---|---|
| **Open Source** | Full source, Apache 2.0 license |
| **Zero Setup** | No login, no accounts, no third-party services — download and use |
| **LLM Visibility** | Every tool call and thinking step is visible in real-time |
| **Code Editing** | Full read/write/edit with diff preview and rollback |
| **Office Documents** | Built-in viewer for PDF, Word, Excel, PPT, and more |
| **File Change System** | Track changes at file and session level, rollback anytime |
| **Context & Token Monitor** | Real-time token stats, context usage, LLM monitoring |
| **Built-in Tools** | 16+ built-in tools: terminal, browser, search, code analysis, etc., extensible via MCP |
| **Performance** | Lightweight desktop app, Java virtual-thread concurrency |
| **UI Design** | Minimalist and clean |
| **Platform** | Desktop (Windows / macOS / Linux) |

### Roadmap

HippoBuddy is under active iteration. Core capabilities (MCP, subagents, memory, Office read/write, skill system) are already shipped and will be continuously polished:

- Requires personal LLM API key + web search tool config
- Subagent, MCP, and Memory are supported but being hardened for stability & ease of use
- Automated task pipeline and browser automation are planned
- More complex Office layout editing will be improved further
- Third-party software integration is still limited
- Designed for personal task efficiency, not 24/7 online service

---

## 🎬 Video Intro

A 6-minute quick look at HippoBuddy:

<p align="center">
  <a href="https://www.bilibili.com/video/BV13xud6KEXw/">
    <img src="../assets/bilibili-cover.jpg" alt="HippoBuddy Intro Video" width="320">
  </a>
  <br>
  <a href="https://www.bilibili.com/video/BV13xud6KEXw/">
    <img src="https://img.shields.io/badge/Bilibili-%E2%96%B6%20Watch%20Intro%20Video-FB7299?logo=bilibili&logoColor=white" alt="Watch Intro Video on Bilibili">
  </a>
</p>

---

## Quick Start

### Option 1: Desktop (Recommended)

Download [installer](https://github.com/Puteitous/HippoBuddy/releases/latest) -> Install -> Launch -> Start using

### Option 2: From Source

```bash
# 1. Build the frontend (Vite output goes to src/main/resources/static)
cd frontend && npm install && npm run build && cd ..

# 2. Compile and package the Java backend (includes the static assets above)
mvn package -DskipTests

# 3a. Launch desktop (Electron)
cd electron && npm install && npm start

# 3b. Or run web-only (no Electron)
mvn exec:java -Dexec.mainClass="com.example.agent.WebApplication"
```

> **Configuration** — When running from source, the app auto-creates `config.yaml` from [`config.yaml.example`](../config.yaml.example) on first launch. Edit it with your LLM settings:
>
> ```yaml
> llm:
>   api_key: ${DEEPSEEK_API_KEY:-your-api-key-here}
>   model: deepseek-v4-flash
>   base_url: https://api.deepseek.com
> ```
>
> Supports **DeepSeek / Claude / GPT / Ollama**. See [`config.yaml.example`](../config.yaml.example) for full reference.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | **Electron 35** |
| Frontend | **React 18** + TypeScript + Vite 5 |
| State Management | Zustand 4 |
| Code Editor | CodeMirror 6 |
| Backend | **Java 21** + Virtual Threads |
| Build | Maven 3.9 + npm |
| AI Protocol | OpenAI / Claude / Ollama |
| Testing | JUnit 5 + Vitest + Testing Library |

---

## Project Structure

```
src/main/java/com/example/agent/
├── WebApplication.java           Web entry
├── DesktopApplication.java       Desktop entry
├── core/                         DI, event bus, security blockers
├── llm/                          LLM clients (OpenAI, Claude, Ollama...)
├── tools/                        Built-in tools (16, MCP-extensible)
├── execute/                      Agent conversation loop
├── subagent/                     Multi-agent system
├── mcp/                          MCP protocol
├── memory/                       Long-term memory
├── context/                      Context budget & compaction
├── session/                      Session storage & transcripts
├── web/                          HTTP handlers & SSE streaming
│   └── orchestrator/             Task orchestration (DAG)
├── application/                  Conversation application service
├── service/                      Token estimation, title generation
├── desktop/                      Desktop workspace context
├── console/                      Console interaction
├── progress/                     Progress & diff preview
├── logging/                      Logging & metrics collection
├── prompt/                       Prompt library & management
├── domain/                       Rules, skills, content truncation
└── config/                       Configuration models
```

---

## Documentation

| Title | Link |
|---|---|
| HippoBuddy — Introduction | [docs/intro](https://www.hippobuddy.cn/docs/intro) |
| Quick Start | [docs/quick-start](https://www.hippobuddy.cn/docs/quick-start) |
| HippoBuddy Architecture Philosophy | [docs/architecture/philosophy](https://www.hippobuddy.cn/docs/architecture/philosophy) |
| AI Agent Usage Tips | [docs/guides/agent-mindset](https://www.hippobuddy.cn/docs/guides/agent-mindset) |
| What Is an AI Desktop App Loading on Startup? | [docs/guides/startup-loading](https://www.hippobuddy.cn/docs/guides/startup-loading) |

---

## License

[Apache License 2.0](../LICENSE)
