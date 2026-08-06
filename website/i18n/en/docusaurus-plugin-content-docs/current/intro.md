# HippoBuddy

AI-powered desktop assistant for chat, coding, and office productivity.

---

## Screenshots

![HippoBuddy Main Interface](pathname:///img/screenshot-main.png)

*Main interface: chat panel with tool call visualization*

![Chat & Preview Panel](pathname:///img/screenshot-chat.png)

*Chat panel working alongside the preview panel*

---

## Why HippoBuddy?

Compared to other AI Agent products (Codex, Claude Code, Copilot, Kimi, Trae Work, WorkBuddy, etc.):

| Aspect | HippoBuddy |
|---|---|
| **Open-source & Free** | Fully open-source under Apache 2.0 |
| **Ready to Use** | No login, no third-party account required — download and go |
| **LLM Behavior Visibility** | Full transparency into tool calls and reasoning |
| **Code Editing** | Read/write/edit with diff preview and rollback |
| **Office Documents** | Built-in PDF / Word / Excel / PPT viewers |
| **File Change System** | File-level and session-level change tracking with rollback |
| **Context & Token Monitoring** | Real-time token stats, context usage, LLM monitoring |
| **Built-in Tools** | 10+ tools: terminal, browser, search, code analysis, etc. |
| **Performance** | Lightweight desktop app with Java virtual threads |
| **UI Design** | Minimalist, elegant, content-focused |
| **Platform** | Desktop (Windows / macOS / Linux) |

## Current Limitations

HippoBuddy is under active development. Current limitations include:

- Requires a personal LLM API key and web search tool configuration
- Subagent, MCP, Memory features are still being refined
- No plugin system, automated task pipelines, or browser automation yet
- Office file generation/editing depends on skill calls and third-party editors
- Limited third-party software integration (falls under plugin scope)
- Stability in large long-context scenarios is still being verified
- Designed for personal task execution and productivity, not 24/7 online service

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | **Electron 32** |
| Frontend | Vanilla JS + CSS |
| Backend | **Java 21** + Virtual Threads |
| Build | Maven 3.9 |
| AI Protocol | OpenAI SDK / Ollama / DashScope |
| Testing | JUnit 5 + Playwright |

## Feature Overview

| Feature | Description |
|---|---|
| **Smart Chat** | Chat / Code / Office modes, freely switchable |
| **AI Coding Assistance** | Understands project context, generates/modifies/refactors code |
| **File Operations** | Read, write, edit, delete with diff rollback |
| **Session Management** | Create, rename, delete, fork discussions |
| **Toolbox** | Token stats, terminal, browser, real-time monitoring, etc. |
| **Beginner Guide** | Spotlight tour on first launch for quick onboarding |

## License

[Apache License 2.0](https://github.com/Puteitous/HippoBuddy/blob/main/LICENSE)
