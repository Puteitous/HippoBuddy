<h1 align="center">🦛 Hippo Code</h1>

<p align="center">Java 21 AI Coding Assistant · Multi-LLM · DAG Orchestration · Multi-Agent Parallelism</p>

<p align="center">
  <a href="../README.md">简体中文</a> ｜ English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Java-21-ED8B00?logo=openjdk&logoColor=white" alt="Java 21">
  <img src="https://img.shields.io/badge/Maven-3.9-C71A36?logo=apache-maven&logoColor=white" alt="Maven">
  <img src="https://img.shields.io/github/actions/workflow/status/Puteitous/Hippo-Code/ci.yml?branch=main&label=CI&logo=github" alt="CI">
  <img src="https://img.shields.io/github/v/release/Puteitous/Hippo-Code?logo=github" alt="Release">
  <img src="https://img.shields.io/github/stars/Puteitous/Hippo-Code?style=flat&logo=github" alt="Stars">
  <img src="https://img.shields.io/badge/license-MIT-555555" alt="License">
  <img src="https://img.shields.io/badge/platform-CLI%20%7C%20Web%20%7C%20Desktop-555555" alt="Platform">
  <img src="https://img.shields.io/github/last-commit/Puteitous/Hippo-Code" alt="Last Commit">
</p>

<p align="center">
  <img src="../image-1.png" alt="Hippo Code Screenshot" width="860">
</p>

Hippo Code is a Java 21-based AI coding assistant that supports multiple LLM providers, multi-agent parallel execution, and MCP/LSP protocol integration. It runs in three modes: terminal CLI, Web Dashboard, and Desktop window.

---

## ✨ Features

- **DAG Task Orchestration** — Auto-analyze tool dependencies, hybrid parallel/sequential execution
- **Multi-Agent System** — Main Agent decomposes tasks, sub-agents execute independently in parallel
- **10+ Security Interceptors** — Dangerous command whitelist, concurrent edit detection, Diff confirmation, and more
- **Long-Term Memory** — Auto-extract key information during conversations, cross-session knowledge association
- **MCP / LSP Protocols** — Dynamic tool registration, code navigation (go-to-definition/references/hover)
- **Multi-LLM Providers** — Unified interface for OpenAI / Ollama / DashScope
- **Three Runtimes** — Terminal CLI / Web Dashboard / Desktop Window

---

## 🚀 Quick Start

```bash
mvn compile -q                          # Compile
mvn test -q                             # Run tests
mvn package -DskipTests                 # Package
```

---

## 🎮 Launch Modes

| Entry       | Command                                        | Description            |
| ----------- | ---------------------------------------------- | ---------------------- |
| CLI         | `java com.example.agent.CliApplication`        | Terminal interactive   |
| CLI + Web   | Add `--web` flag                               | Terminal + Web Dashboard |
| Web         | `java com.example.agent.WebApplication`        | Web-only service       |
| Desktop     | `java com.example.agent.DesktopApplication`    | Desktop window         |

---

## ⚙️ Configuration

Copy `config.yaml.example` to `config.yaml` and modify LLM settings:

```yaml
llm:
  api_key: your-api-key
  model: gpt-4o
  base_url: https://api.openai.com/v1
```

---

## ⌨️ CLI Commands

| Command     | Description      |
| ----------- | ---------------- |
| `/help`     | Help             |
| `/clear`    | Clear screen     |
| `/reset`    | Reset session    |
| `/tokens`   | Token statistics |
| `/mode`     | Switch mode      |
| `/exit`     | Exit             |

---

## 📁 Project Structure

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

## 🧰 Tech Stack

- **Java 21** + Virtual Threads
- **JLine** Terminal Interaction
- **Jackson / OkHttp / JTokkit**
- **JUnit 5 + Mockito**
- **Maven**
