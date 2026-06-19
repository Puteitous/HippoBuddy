<h1 align="center">🦛 HippoBuddy</h1>

<p align="center">原生桌面 · 多标签工作台 · 以工作区为核心的 AI 桌面伙伴</p>

<p align="center">
  简体中文 ｜ <a href="./docs/README.en.md">English</a>
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
  <img src="./image-1.png" alt="HippoBuddy 界面预览" width="100%">
</p>

<p align="center">
  <img src="./image.png" alt="HippoBuddy 界面预览" width="100%">
</p>

HippoBuddy 是一个以**工作区文件夹为核心**的 AI 桌面伙伴。打开一个文件夹，就能和 Agent 一起写代码、改文件、跑脚本、整理文档、分析项目。支持 DeepSeek / Claude / GPT 等主流模型，数据全在本地。

> 不是 IDE，不是自动化机器人，是你桌上一起干活的小伙伴。

---

## 它能做什么

- **编写与修改代码** — 用 Agent 理解项目上下文，自动生成、修改、重构代码
- **文件操作与管理** — 读、写、编辑、删除文件，支持回滚与 diff 确认
- **运行命令与脚本** — 在终端执行命令，查看输出并根据结果继续工作
- **阅读多种文档** — 支持 Markdown、Word、Excel、PDF 等格式预览
- **分析项目结构** — 理解项目全貌，给出架构建议或生成文档
- **知识关联** — 跨会话长期记忆，自动提取关键信息并沉淀

## 核心特性

- **多标签页工作台** — 文件预览、对话、工具面板独立共存，不互相覆盖
- **多模型自由切换** — DeepSeek / Claude / GPT / Ollama 本地模型，不绑定
- **交互式协作** — 看着 Agent 干活，随时介入修正，不是黑盒自动化
- **文件变更可视** — 每次修改可 diff、可回撤、可审查
- **安全可控** — 危险操作弹窗确认，并发编辑检测，沙箱隔离
- **桌面原生** — 本地文件系统、无标题栏窗口、拖拽操作
- **三端统一** — 桌面窗口 / Web Dashboard / 终端 CLI 共用同一核心

---

## 快速开始

```bash
mvn compile -q                          # 编译
mvn test -q                             # 运行测试
mvn package -DskipTests                 # 打包
```

---

## 启动方式

| 入口        | 命令                                          | 说明                 |
| ----------- | --------------------------------------------- | -------------------- |
| CLI         | `java com.example.agent.CliApplication`       | 终端交互模式         |
| CLI + Web   | 加 `--web` 参数                               | 终端 + Web Dashboard |
| Web         | `java com.example.agent.WebApplication`       | 纯 Web 服务          |
| Desktop     | `java com.example.agent.DesktopApplication`   | 桌面窗口             |

---

## 配置

复制 `config.yaml.example` 为 `config.yaml`，修改 LLM 配置：

```yaml
llm:
  api_key: your-api-key
  model: gpt-4o
  base_url: https://api.openai.com/v1
```

---

## CLI 端核心命令

| 命令        | 说明       |
| ----------- | --------   |
| `/help`     | 帮助       |
| `/clear`    | 清屏       |
| `/reset`    | 重置会话   |
| `/tokens`   | Token 统计 |
| `/mode`     | 切换工作模式 |
| `/exit`     | 退出       |

---

## 项目结构

```
src/main/java/com/example/agent/
├── CliApplication.java           CLI 入口
├── WebApplication.java           Web 入口
├── DesktopApplication.java       桌面端入口
├── core/                         核心模块（上下文、安全拦截、事件总线）
├── llm/                          LLM 客户端（OpenAI / Ollama / DashScope）
├── tools/                        内置工具集（20+ 工具）
├── orchestrator/                 DAG 任务编排引擎
├── subagent/                     多代理系统
├── mcp/                          MCP 协议集成
├── lsp/                          LSP 语言服务
├── memory/                       长期记忆系统
├── console/                      终端交互
└── config/                       配置中心
```

---

## 技术栈

- **Java 21** + 虚拟线程
- **JLine** 终端交互
- **Jackson / OkHttp / JTokkit**
- **JUnit 5 + Mockito**
- **Maven**
