<h1 align="center">HippoBuddy</h1>

<p align="center">AI-powered desktop assistant for chat, coding, and office productivity.</p>

<p align="center">
  <a href="./docs/README.zh.md">简体中文</a> ｜ English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Java-21-ED8B00?logo=openjdk&logoColor=white" alt="Java 21">
  <img src="https://img.shields.io/badge/Electron-32-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/github/v/release/Puteitous/HippoBuddy?logo=github" alt="Release">
  <img src="https://img.shields.io/github/stars/Puteitous/HippoBuddy?style=flat&logo=github" alt="Stars">
  <img src="https://img.shields.io/badge/license-Apache%202.0-555555" alt="License">
  <img src="https://img.shields.io/badge/platform-Desktop%20%7C%20Web-555555" alt="Platform">
  <img src="https://img.shields.io/github/last-commit/Puteitous/HippoBuddy" alt="Last Commit">
</p>

<p align="center">
  <img src="./image.png" alt="HippoBuddy Screenshot" width="100%">
</p>

---

## Download

| Platform | Download |
|---|---|
| **Windows** | [HippoBuddy Setup 1.0.0.exe](https://github.com/Puteitous/Hippo-Code/releases) |
| macOS / Linux | Coming soon |

Built-in JRE -- download, install, and go. No Java setup required.

---

## Features

| Feature | Description |
|---|---|
| **Smart Chat** | Chat / Code / Office modes, switch anytime |
| **AI Coding** | Understand project context, generate & refactor code |
| **File Ops** | Read, write, edit, delete with diff & rollback |
| **Sessions** | Create, rename, delete, fork discussions |
| **Toolbox** | Token stats, terminal, browser, live monitor |
| **Onboarding** | Spotlight tour on first launch |

---

## Quick Start

### Desktop (Recommended)

Download installer -> Install -> Launch -> Start using

### From Source

```bash
# Compile
mvn compile -q

# Run Web
mvn exec:java -Dexec.mainClass="com.example.agent.WebApplication"

# Run Desktop
mvn exec:java -Dexec.mainClass="com.example.agent.DesktopApplication"
```

---

## Configuration

Copy `config.yaml.example` to `config.yaml` and set your LLM:

```yaml
llm:
  api_key: your-api-key
  model: deepseek-chat
  base_url: https://api.deepseek.com/v1
```

Supports DeepSeek / Claude / GPT / Ollama local models.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | **Electron 32** |
| Frontend | Vanilla JS + CSS |
| Backend | **Java 21** + Virtual Threads |
| Build | Maven 3.9 |
| AI Protocol | OpenAI SDK / Ollama / DashScope |
| Testing | JUnit 5 + Playwright |

---

## Project Structure

```
src/main/java/com/example/agent/
├── WebApplication.java           Web entry
├── DesktopApplication.java       Desktop entry
├── core/                         Core modules
├── llm/                          LLM clients
├── tools/                        Built-in tools
├── orchestrator/                 Task orchestration
├── subagent/                     Multi-agent system
├── mcp/                          MCP protocol
├── lsp/                          LSP services
├── memory/                       Long-term memory
└── config/                       Configuration
```

---

## License

[Apache License 2.0](../LICENSE)
