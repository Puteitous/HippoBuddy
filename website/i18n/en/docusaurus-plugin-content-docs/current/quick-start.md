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
# 1. Build the frontend (Vite output goes to src/main/resources/static)
cd frontend && npm install && npm run build && cd ..

# 2. Compile and package the Java backend (includes the static assets above)
mvn package -DskipTests

# 3a. Launch desktop app (Electron)
cd electron && npm install && npm start

# 3b. Or launch web-only (without Electron)
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
├── tools/                        Built-in tools (16, MCP-extensible)
├── execute/                      Agent conversation loop
├── subagent/                     Multi-agent system
├── mcp/                          MCP protocol integration
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
└── config/                       Configuration center
```
