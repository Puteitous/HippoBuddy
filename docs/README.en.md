<h1 align="center">🦛 HippoBuddy</h1>

<p align="center">Native Desktop · Multi-Tab Workspace · AI Desktop Buddy</p>

<p align="center">
  <a href="../README.md">简体中文</a> ｜ English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Java-21-ED8B00?logo=openjdk&logoColor=white" alt="Java 21">
  <img src="https://img.shields.io/badge/Maven-3.9-C71A36?logo=apache-maven&logoColor=white" alt="Maven">
  <img src="https://img.shields.io/github/v/release/Puteitous/HippoBuddy?logo=github" alt="Release">
  <img src="https://img.shields.io/github/stars/Puteitous/HippoBuddy?style=flat&logo=github" alt="Stars">
  <img src="https://img.shields.io/badge/license-MIT-555555" alt="License">
  <img src="https://img.shields.io/badge/platform-Desktop%20%7C%20Web%20%7C%20CLI-555555" alt="Platform">
  <img src="https://img.shields.io/github/last-commit/Puteitous/HippoBuddy" alt="Last Commit">
</p>

<p align="center">
  <img src="../image-1.png" alt="HippoBuddy Screenshot" width="100%">
</p>

<p align="center">
  <img src="../image.png" alt="HippoBuddy Screenshot" width="100%">
</p>

HippoBuddy is a **workspace-centric** AI desktop buddy. Open a folder and collaborate with an Agent to write code, edit files, run scripts, organize documents, and analyze projects. Supports DeepSeek / Claude / GPT and other mainstream models. All data stays local.

> Not an IDE. Not an automation bot. It's the buddy at your desk working with you.

---

## What It Can Do

- **Code with AI** — Agent understands your project context, generates, modifies, and refactors code
- **File Operations** — Read, write, edit, delete files with rollback and diff review
- **Run Commands** — Execute shell commands in the terminal, view output, iterate
- **Read Documents** — Preview Markdown, Word, Excel, PDF and more
- **Analyze Projects** — Understand project structure, suggest architecture, generate docs
- **Remember Across Sessions** — Long-term memory, auto-extracts key information

## Key Features

- **Multi-Tab Workspace** — File preview, chat, and tool panels coexist independently
- **Multi-Model Switching** — DeepSeek / Claude / GPT / Ollama local models, no vendor lock-in
- **Interactive Collaboration** — Watch the Agent work, intervene anytime, not a black box
- **Visible File Changes** — Every modification is diff-able, revertible, reviewable
- **Secure by Design** — Confirmation dialogs for risky operations, concurrent edit detection, sandbox
- **Desktop Native** — Local filesystem access, frameless window, drag-and-drop
- **Three Runtimes** — Desktop window / Web Dashboard / Terminal CLI share the same core

---

## Quick Start

```bash
mvn compile -q                          # Compile
mvn test -q                             # Run tests
mvn package -DskipTests                 # Package
```

---

## Launch Modes

| Entry       | Command                                        | Description            |
| ----------- | ---------------------------------------------- | ---------------------- |
| CLI         | `java com.example.agent.CliApplication`        | Terminal interactive   |
| CLI + Web   | Add `--web` flag                               | Terminal + Web Dashboard |
| Web         | `java com.example.agent.WebApplication`        | Web-only service       |
| Desktop     | `java com.example.agent.DesktopApplication`    | Desktop window         |

---

## Configuration

Copy `config.yaml.example` to `config.yaml` and modify LLM settings:

```yaml
llm:
  api_key: your-api-key
  model: gpt-4o
  base_url: https://api.openai.com/v1
```

---

## CLI Commands

| Command     | Description      |
| ----------- | ---------------- |
| `/help`     | Help             |
| `/clear`    | Clear screen     |
| `/reset`    | Reset session    |
| `/tokens`   | Token statistics |
| `/mode`     | Switch mode      |
| `/exit`     | Exit             |

---

## Project Structure

```
src/main/java/com/example/agent/
├── CliApplication.java           CLI entry
├── WebApplication.java           Web entry
├── DesktopApplication.java       Desktop entry
├── core/                         Core (context, security, event bus)
├── llm/                          LLM clients (OpenAI / Ollama / DashScope)
├── tools/                        20+ built-in tools
├── orchestrator/                 DAG orchestration engine
├── subagent/                     Multi-agent system
├── mcp/                          MCP protocol integration
├── lsp/                          LSP language services
├── memory/                       Long-term memory system
├── console/                      Terminal interaction
└── config/                       Configuration center
```

---

## Tech Stack

- **Java 21** + Virtual Threads
- **JLine** Terminal Interaction
- **Jackson / OkHttp / JTokkit**
- **JUnit 5 + Mockito**
- **Maven**
