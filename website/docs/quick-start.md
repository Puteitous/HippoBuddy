# 快速开始

## 方式一：桌面端（推荐）

下载[安装包](https://github.com/Puteitous/HippoBuddy/releases/latest) → 安装 → 启动 → 开始使用

| 平台 | 下载 |
|---|---|
| Windows | [HippoBuddy Setup](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| macOS (Intel) | [HippoBuddy.dmg](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| macOS (Apple Silicon) | [HippoBuddy-arm64.dmg](https://github.com/Puteitous/HippoBuddy/releases/latest) |
| Linux (AppImage) | [HippoBuddy.AppImage](https://github.com/Puteitous/HippoBuddy/releases/latest) |

## 方式二：源码启动

```bash
# 1. 编译 Java 后端
mvn package -DskipTests

# 2a. 启动桌面端（Electron）
cd electron && npm install && npm start

# 2b. 或仅启动 Web 端（不带 Electron）
mvn exec:java -Dexec.mainClass="com.example.agent.WebApplication"
```

## 配置说明

源码启动时，应用首次运行会自动根据 `config.yaml.example` 创建 `config.yaml`，编辑其中的 LLM 配置即可：

```yaml
llm:
  api_key: ${DEEPSEEK_API_KEY:-your-api-key-here}
  model: deepseek-v4-flash
  base_url: https://api.deepseek.com
```

支持 **DeepSeek / Claude / GPT / Ollama**。完整配置见项目中的 `config.yaml.example`。

## 项目结构

```
src/main/java/com/example/agent/
├── WebApplication.java           Web 入口
├── DesktopApplication.java       桌面端入口
├── core/                         DI、事件总线、安全拦截
├── llm/                          LLM 客户端（OpenAI、Claude、Ollama...）
├── tools/                        内置工具集（20+）
├── execute/                      Agent 对话循环
├── orchestrator/                 任务编排（DAG）
├── subagent/                     多代理系统
├── mcp/                          MCP 协议集成
├── memory/                       长期记忆
├── session/                      会话存储与转录
├── web/                          HTTP 处理器与 SSE 流式
├── prompt/                       Prompt 库与管理
├── domain/                       规则、技能、内容截断
└── config/                       配置中心
```
