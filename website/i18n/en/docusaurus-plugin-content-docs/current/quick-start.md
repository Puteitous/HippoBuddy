# Quick Start

## Method 1: Desktop App (Recommended)

Download the [installer](https://github.com/Puteitous/HippoBuddy/releases/latest) → Install → Launch → Start using

| Platform | Download |
|---|---|
| Windows | [HippoBuddy Setup](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| macOS (Intel) | [HippoBuddy.dmg](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| macOS (Apple Silicon) | [HippoBuddy-arm64.dmg](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| Linux (AppImage) | [HippoBuddy.AppImage](https://github.com/Puteitous/HippoBuddy/releases/latest) |

## Method 2: Run from Source

```bash
# 1. Build the Java backend
mvn package -DskipTests

# 2a. Launch desktop app (Electron)
cd electron && npm install && npm start

# 2b. Or launch web-only (without Electron)
mvn exec:java -Dexec.mainClass="com.example.agent.WebApplication"
```

## Configuration

When running from source, the app will create `config.yaml` from `config.yaml.example` on first launch. Edit the LLM configuration:

```yaml
llm:
  api_key: ${DEEPSEEK_API_KEY:-your-api-key-here}
  model: deepseek-v4-flash
  base_url: https://api.deepseek.com
```

Supports **DeepSeek / Claude / GPT / Ollama**. See `config.yaml.example` in the project for the full configuration reference.

## Project Structure

```
src/main/java/com/example/agent/
├── WebApplication.java           Web entry point
├── DesktopApplication.java       Desktop entry point
├── core/                         DI, event bus, security interceptor
├── llm/                          LLM clients (OpenAI, Claude, Ollama...)
├── tools/                        Built-in tools (20+)
├── execute/                      Agent conversation loop
├── orchestrator/                 Task orchestration (DAG)
├── subagent/                     Multi-agent system
├── mcp/                          MCP protocol integration
├── memory/                       Long-term memory
├── session/                      Session storage & transcripts
├── web/                          HTTP handlers & SSE streaming
├── prompt/                       Prompt library & management
├── domain/                       Rules, skills, content truncation
└── config/                       Configuration center
```
