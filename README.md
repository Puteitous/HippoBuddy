# Hippo Code - AI 编程助手

## 📋 项目概述

**Hippo Code** 是一个基于 Java 21 构建的AI Agent 编程助手，采用模块化分层架构设计，支持多 LLM 提供商、MCP 协议集成、LSP 语言服务、子代理分布式任务分解、智能上下文压缩等高级特性。

| 属性 | 值 |
|------|-----|
| 项目名称 | Hippo Code |
| 版本 | 1.0.0 |
| Java 版本 | 21 (启用 Preview 特性) |
| 构建工具 | Maven |
| 代码行数 | ~200+ 类, 100+ 测试 |
| 核心特性 | 9 大核心模块, 23+ 工具 |

---

## 🏗️ 整体架构

### 九层分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                   用户交互层 (Console)                           │
│        AgentUi / InputHandler / CommandDispatcher            │
├─────────────────────────────────────────────────────────────────┤
│                   编排层 (Orchestrator)                   │
│    ToolOrchestrator / DagExecutor / DependencyAnalyzer  │
├─────────────────────────────────────────────────────────────────┤
│                   执行控制层                               │
│    ConversationLoop / AgentTurnExecutor / ToolCallProcessor  │
├─────────────────────────────────────────────────────────────────┤
│                   多代理系统 (SubAgent)                         │
│    SubAgentManager / ForkAgent / Permission Control             │
├─────────────────────────────────────────────────────────────────┤
│                   上下文管理层                              │
│    ContextManager / Compressor / TokenBudget             │
├─────────────────────────────────────────────────────────────────┤
│                   安全拦截层 (Blocker)                    │
│    BlockerChain / 10+ 安全拦截器                        │
├─────────────────────────────────────────────────────────────────┤
│                   工具抽象层                               │
│    ToolRegistry / ConcurrentExecutor / MCP Adapter            │
├─────────────────────────────────────────────────────────────────┤
│                   协议适配层                               │
│    LLM Clients / LSP Client / MCP Client             │
├─────────────────────────────────────────────────────────────────┤
│                   基础设施层                               │
│    EventBus / HealthCheck / Metrics / Logging         │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✨ 核心功能

### 🧠 智能对话与规划
- **DAG 任务编排**：基于有向无环图的工具依赖分析，支持并行/顺序混合执行策略
- **智能上下文压缩**：自动分类消息、智能摘要、滑动窗口、预算控制四层压缩
- **会话持久化**：会话转录、断点恢复、自动清理
- **多模式切换**：开发/审查/重构等多种工作模式

### 👥 多代理系统 (SubAgent)
- **任务级并行**：主 Agent 自动分解任务，子 Agent 独立并行执行
- **权限隔离**：基于 `SubAgentPermission` 的细粒度工具权限控制
- **生命周期管理**：子 Agent 创建、执行、取消、状态监控完整生命周期
- **结果合并**：智能合并多子 Agent 执行结果

### 🛡️ 安全防护机制 (10+ Blocker)
| 拦截器 | 功能 |
|---------|------|
| `BashDangerousCommandBlocker` | 危险命令白名单控制 |
| `ConcurrentEditBlocker` | 并发文件编辑冲突检测 |
| `EditBeforeReadBlocker` | 编辑前强制读取验证 |
| `EditConfirmationBlocker` | Diff 预览用户确认 |
| `EditCountBlocker` | 单轮编辑次数限制 |
| `ModePermissionBlocker` | 模式权限控制 |
| `SchemaValidationBlocker` | 工具参数 Schema 校验 |
| `SyntaxValidationBlocker` | 编辑后语法验证 |

### 🔧 全功能工具集 (23+)

| 分类 | 工具列表 |
|------|----------|
| **文件操作** | `read_file` `write_file` `edit_file` `list_directory` |
| **代码搜索** | `glob` `grep` |
| **代码导航** | LSP 系列 | `definition` `references` `hover` `document_symbol` `workspace_symbol` |
| **系统交互** | `bash` `ask_user` `todo_write` |
| **多代理** | `fork_agent` `fork_agents` `list_subagents` `cancel_subagent` |
| **生态扩展** | MCP 协议动态工具 |

### 🌐 多协议生态

#### LLM 客户端
- ✅ **OpenAI** 兼容协议
- ✅ **Ollama** 本地模型
- ✅ **DashScope** (通义千问)
- ✅ 统一重试策略、SSE 流式响应
- ✅ Token 计费统计

#### LSP 语言服务
- ✅ Java LSP 客户端集成
- ✅ 代码跳转、引用查找、悬停文档
- ✅ 健康检查、优雅降级

#### MCP 协议
- ✅ MCP (Model Context Protocol)
- ✅ Stdio / SSE 双传输
- ✅ 动态工具注册
- ✅ Prompts / Resources / Tools 三模支持

### 💾 长期记忆系统
- **后台提取**：对话中自动提取关键信息
- **语义检索**：基于相似度的记忆召回
- **会话关联**：跨会话知识关联
- **MEMORY.md**：人工维护 + 自动整理

### 📊 可观测性
- **健康检查**：配置/LLM/系统三级健康检查
- **事件总线**：解耦式事件驱动架构
- **指标收集**：Token/Cost/Compaction 全链路指标
- **对话日志**：完整会话转录 JSON 导出

---

## 📦 核心技术栈

| 领域 | 技术选型 | 说明 |
|------|----------|------|
| 语言 | Java 21 + 虚拟线程 |
| 终端 | JLine 3.25.1 | 原生终端体验 |
| HTTP | OkHttp 4.12.0 | SSE 流式支持 |
| JSON | Jackson 2.16.1 | 完整数据绑定 |
| 依赖注入 | Guice + ServiceLocator | 模块化 DI |
| Token 计数 | JTokkit | Tiktoken 兼容 |
| 缓存 | Caffeine 3.1.8 | 高性能缓存 |
| AST 解析 | TreeSitter | 语法树解析 |
| 日志 | SLF4J + Logback | 结构化日志 |
| 测试 | JUnit 5 + Mockito + AssertJ | 高质量测试套件 |

---

## 📁 项目结构

```
hippo-code/
├── pom.xml                              # Maven 配置
├── config.yaml.example                   # 配置文件示例
├── MEMORY.md                            # Agent 长期记忆
├── .hipporules_example.md              # Agent 行为规则
├── README.md                            # 项目说明
└── src/
    ├── main/java/com/example/agent/
    │   ├── AgentApplication.java         # 应用入口
    │   ├── SimpleJavaAgent.java          # Agent 主程序
    │   ├── subagent/                   # 子代理系统
    │   │   ├── SubAgentManager.java      # 子代理管理器
    │   │   ├── SubAgentPermission.java     # 权限定义
    │   │   ├── SubAgentRunner.java        # 子代理执行器
    │   │   └── event/                 # 子代理事件
    │   ├── orchestrator/               # 工具编排
    │   │   ├── ToolOrchestrator.java     # DAG 编排器
    │   │   ├── analyzer/                 # 依赖分析
    │   │   └── executor/               # DAG 执行器
    │   ├── core/                       # 核心模块
    │   │   ├── blocker/                  # 10+ 安全拦截器
    │   │   ├── event/                    # EventBus 事件总线
    │   │   ├── health/                   # 健康检查
    │   │   ├── todo/                     # Todo 管理
    │   │   ├── di/                        # 依赖注入
    │   │   ├── error/                   # 统一错误处理
    │   │   └── AgentContext.java        # Agent 全局上下文
    │   ├── mcp/                        # MCP 协议
    │   │   ├── client/                 # Stdio/SSE 客户端
    │   │   ├── registry/                # 工具/Prompts 注册
    │   │   └── McpServiceManager.java  # MCP 服务管理
    │   ├── lsp/                        # LSP 语言服务
    │   │   ├── tools/                    # LSP 导航工具
    │   │   └── LspServiceManager.java # LSP 生命周期
    │   ├── memory/                     # 长期记忆
    │   │   ├── session/                # 会话记忆模块
    │   │   │   ├── SessionMemoryManager.java # 会话记忆管理器
    │   │   │   └── SessionMemoryExtractor.java # 会话记忆提取器
    │   │   ├── extraction/             # 实时提取模块
    │   │   │   ├── ExtractionTrigger.java # 提取触发器
    │   │   │   └── MemoryExtractor.java # 长期记忆提取器
    │   │   ├── consolidation/          # 后台整合模块
    │   │   │   ├── ConsolidationGate.java # 三重门触发器
    │   │   │   └── MemoryConsolidator.java # 后台整合器
    │   │   └── MemoryRetriever.java    # 记忆检索
    │   ├── context/                      # 上下文管理
    │   │   ├── compressor/               # 5 种压缩策略
    │   │   ├── budget/                   # Token 预算
    │   │   └── ContextManager.java      # 上下文管理器
    │   ├── domain/                     # 领域模型
    │   │   ├── ast/                      # TreeSitter 解析
    │   │   ├── index/                    # 代码语义索引
    │   │   ├── rule/                     # 规则引擎
    │   │   └── truncation/               # 内容智能截断
    │   ├── llm/                        # LLM 多客户端
    │   │   ├── client/                   # OpenAI/Ollama/DashScope
    │   │   ├── stream/                   # SSE 流解析
    │   │   ├── retry/                    # 重试策略
    │   │   └── pricing/                  # 计费模型
    │   ├── tools/                      # 内置工具集
    │   │   ├── concurrent/               # 并发执行器
    │   │   └── 15+ 工具实现
    │   ├── prompt/                     # Prompt 管理
    │   ├── config/                     # 统一配置中心
    │   ├── session/                    # 会话持久化
    │   ├── logging/                    # 日志与指标
    │   ├── service/                    # 领域服务
    │   ├── execute/                    # 执行引擎
    │   ├── progress/                 # 进度展示
    │   ├── console/                      # 终端交互
    │   └── application/                # 应用服务
    └── test/                             # 100+ 测试用例
```

---

## 🔄 核心执行流程

```
用户输入
   │
   ▼
┌─────────────────┐
│  InputHandler   │ 多行输入、命令解析
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TaskOrchestrator│ DAG 任务分析、依赖分析
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌──────────┐
│ Main Agent│ │ SubAgent 1..N│ 任务分解、并行执行
└────┬─────┘ └──────┬─────┘
     │                │
     └────────┬───────┘
              │
              ▼
┌─────────────────┐
│ BlockerChain   │ 10层安全拦截校验
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ToolCallProcessor│ 并发工具调度执行
└────────┬────────┘
         │
    ┌────┴────┬────────┐
    ▼         ▼        ▼
┌───────┐ ┌───────┐┌───────┐
│ LLM   │ │ LSP   ││ MCP   │ 多协议客户端
└───┬───┘ └───┬───┘└───┬───┘
    │         │        │
    └─────────┴────────┘
              │
              ▼
┌─────────────────┐
│ ContextManager  │ 压缩、摘要、预算控制
└────────┬────────┘
         │
         ▼
    UI 渲染 / 事件 / 持久化
```

---

## ⚙️ 快速开始

### 环境要求
- JDK 21+
- Maven 3.9+
- 配置 LLM API Key

### 构建运行

```bash
# 编译项目
mvn compile

# 运行全部测试 (100+)
mvn test

# 打包可执行 Jar
mvn package

# 启动 Agent
java -jar target/Hippo-code-1.0.0.jar
```

### 配置文件

复制 `config.yaml.example` 为 `config.yaml`：

```yaml
llm:
  provider: openai / ollama / dashscope
  api_key: ${YOUR_API_KEY}
  model: gpt-4o
  base_url: https://api.openai.com/v1
  stream: true

mcp:
  servers:
    - name: my-mcp-server
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem"]
      env: {}

lsp:
  java:
    enabled: true
    command: jdtls
    args: []

subagent:
  enabled: true
  max_concurrent: 3
  max_memory_per_agent: 8000

blocker:
  edit_confirmation: true
  max_edits_per_turn: 5
```

---

## 🎯 交互命令

| 命令 | 功能 |
|------|------|
| `/help` | 显示帮助 |
| `/clear` | 清屏 |
| `/reset` | 重置会话 |
| `/tokens` | Token 统计 |
| `/health` | 系统健康检查 |
| `/transcripts` | 历史会话列表 |
| `/subagents` | 子代理状态 |
| `/memory` | 显示记忆内容 |
| `/config` | 显示配置 |
| `/mode` | 切换工作模式 |
| `/exit` | 退出程序 |

---

## 🏛️ 设计理念

1. **模块化优先**：每一个功能都是独立可替换的模块
2. **安全为核心**：层层拦截，安全第一
3. **可观测性**：全链路可观测
4. **开发者体验**：优雅的终端交互体验
5. **测试驱动**：核心模块 100% 测试覆盖

---

## 📄 许可证

MIT License

---

*文档版本：2.0.0 | 最后更新：2026-04