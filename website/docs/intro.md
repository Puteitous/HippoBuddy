# HippoBuddy

AI-powered desktop assistant for chat, coding, and office productivity.

---

## 界面预览

![HippoBuddy 主界面](pathname:///img/screenshot-main.png)

*主界面：聊天面板与工具调用可视化*

![Chat 与预览面板](pathname:///img/screenshot-chat.png)

*Chat 面板与预览面板协同工作*

---

## 为什么选择 HippoBuddy？

与市面上其他 AI Agent 产品（Codex、Claude Code、Copilot、Kimi、Trae Work、WorkBuddy 等）的对比：

| 维度 | HippoBuddy |
|---|---|
| **开源免费** | 全部源码开源，Apache 2.0 协议 |
| **开箱即用** | 无需登录、无需第三方账号，下载即用 |
| **LLM 行为可视化** | 工具调用与思考过程全透明，实时可见 |
| **代码编辑** | 完整读/写/编辑，支持 diff 预览与回滚 |
| **Office 文档** | 内置 PDF / Word / Excel / PPT 等格式浏览 |
| **文件变更系统** | 文件级与会话级变更追踪，随时回滚 |
| **上下文与 Token 监控** | 实时 Token 统计、上下文用量、LLM 监控 |
| **内置工具** | 10+ 种工具：终端、浏览器、搜索、代码分析等 |
| **性能** | 轻量桌面应用，Java 虚拟线程高并发 |
| **UI 设计** | 极简精美，专注内容 |
| **平台** | 桌面端（Windows / macOS / Linux） |

## 当前不足

HippoBuddy 正在积极开发中，目前存在以下局限：

- 需要个人 LLM API 密钥及联网搜索工具配置
- Subagent、MCP、Memory 等功能尚在完善中
- 暂无插件系统、自动化任务流水线、浏览器操控等能力
- Office 文件生成编辑依赖 skill 调用及第三方编辑器
- 第三方软件集成不足（归于插件范畴）
- 大规模长上下文场景的稳定性仍在验证中
- 更偏向个人任务执行与效率提升，非 7×24 在线服务

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | **Electron 32** |
| 前端 | 原生 JS + CSS |
| 后端 | **Java 21** + 虚拟线程 |
| 构建 | Maven 3.9 |
| AI 协议 | OpenAI SDK / Ollama / DashScope |
| 测试 | JUnit 5 + Playwright |

## 功能概览

| 功能 | 说明 |
|---|---|
| **智能对话** | 聊天 / 代码 / 办公三种模式，自由切换 |
| **AI 编程协助** | 理解项目上下文，生成、修改、重构代码 |
| **文件操作** | 读、写、编辑、删除，支持 diff 回滚 |
| **会话管理** | 新建、重命名、删除、分叉讨论 |
| **工具箱** | Token 统计、终端、浏览器、实时监控等 |
| **新手指引** | 首次启动聚光灯导览，快速上手 |

## 许可证

[Apache License 2.0](https://github.com/Puteitous/HippoBuddy/blob/main/LICENSE)
