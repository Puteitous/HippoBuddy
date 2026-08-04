---
sidebar_position: 6
---

# 从 Chat Completions 到 Responses API：Agent 时代的协议长什么样

> 2023 年，OpenAI 用 Chat Completions API 定义了"对话补全"；2025 年，它又推出了 Responses API，目标是成为"Agent 运行时"。两个协议差在哪？为什么 Codex 只认新的？为什么社区要造 cc-switch 这种协议转换工具？DeepSeek 率先原生支持又意味着什么？这篇文章一次讲清楚。

***

## 一、为什么会有 Responses API：Chat Completions 的局限

Chat Completions 诞生于 2023 年，心智模型是"**对话补全**"——一段 `messages[]` 历史，模型补全最后一句话。它把 LLM 变成了一个聊天接口，简单、通用、生态庞大。

但当开发者开始用它构建 **Agent**（让模型自主调用工具、执行任务）时，局限逐渐暴露：

| 局限 | 表现 |
|---|---|
| 工具调用是"塞"进去的 | `tool_calls` 是附加在 `message` 上的约定字段，不是协议一等公民 |
| reasoning 没有标准位置 | 各家靠自定义字段（如 DeepSeek 的 `reasoning_content`）各搞一套 |
| 内置能力无处安放 | 搜索、文件处理这类能力，协议层完全没有位置，客户端得自己接 |
| 流式只有裸增量 | 只有 `chat.completion.chunk` 一种事件，工具调用的开始/结束要客户端自己拼状态 |

**根本问题**：Chat Completions 是为"对话"设计的，而 Agent 需要的是"一次任务的完整执行"——推理、调工具、搜索、给结果，这些动作要在一条响应里结构化表达，还要让客户端知道"模型现在进行到哪一步"。

Responses API 就是为此而生。OpenAI 的定位很直白：**像 Chat Completions 一样简单，像 Assistants API 一样强大**——把原来需要开发者自己编排的工具调用、状态管理、内置工具能力，下沉到协议层。

***

## 二、核心对比：Chat Completions vs Responses

| 维度 | Chat Completions（对话补全） | Responses API（Agent 运行时） |
|---|---|---|
| **端点** | `POST /v1/chat/completions` | `POST /responses` |
| **请求体** | `messages[]` 数组，system 混在消息里 | `input` items + 独立 `instructions` 字段 |
| **响应结构** | `choices[0].message` 单一结构 | `output` item 数组：reasoning / message / function_call / web_search_call 混排 |
| **流式事件** | `chat.completion.chunk` + `data: [DONE]` | 语义化命名事件，以 `completed / incomplete / failed` 收尾 |
| **状态管理** | 无（客户端自己拼历史） | 支持 `previous_response_id` / `conversation`（有状态） |
| **缓存** | 需手动管理或依赖服务商前缀缓存 | 服务端自动管理（`usage.input_tokens_details.cached_tokens`） |
| **内置工具** | 无（搜索要自己接 Brave/Tavily） | `web_search` 等工具**服务端执行** |

一句话总结这张表：**Chat Completions 是为"对话"设计的，Responses 是为"任务"设计的——前者只给一句话，后者给一份完整的"工作日志 + 结果"**。

这个定位从端点名就写在脸上——`POST /chat/completions`，"对话补全"；连 `tool_calls`（函数调用）这个字段，也是后来为了 Agent 场景**补丁式硬加**进去的。协议从骨子里是为"一问一答"而生，推理、搜索、状态管理这些 Agent 刚需，在协议层都没有原生位置——这正是表格里每一行差异的根源。

三个对开发者最关键的差异，下面展开。

***

## 三、三个关键设计

### 1. typed items：一条响应里什么都有

Chat Completions 的响应只有一个 `message` 对象，reasoning、工具调用、正文全靠约定俗成的字段塞。Responses 把输出拆成**带类型的 item 数组**：

```json
{
  "output": [
    {"type": "reasoning", "summary": "..."},
    {"type": "function_call", "call_id": "fc_1", "name": "read_file", "arguments": "{\"path\":\"/src/Main.java\"}"},
    {"type": "web_search_call", "status": "completed", "action": {"queries": ["Responses API 原理"]}},
    {"type": "message", "content": [{"type": "output_text", "text": "找到了…"}]}
  ]
}
```

对比 Chat Completions 的响应——工具调用要自己解析 `tool_calls` 字段，reasoning 靠厂商自定义字段，联网搜索更是完全没有位置：

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "找到了…",
      "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "read_file", "arguments": "..."}}]
    }
  }]
}
```

**差别**：Responses 把"Agent 的一次完整思考过程"结构化表达；Chat Completions 只给"一句话补全"。

这个差别背后，是厂商生态的乱象。Chat Completions 协议只给了两个正规位置——`content` 和 `tool_calls`，新能力只能往 `content` 里硬塞：

| 厂商想加的能力 | 以前的做法 | 后果 |
|---|---|---|
| 推理过程 | 塞 `content` 或自定义字段 | 每家字段名不一样，挨个适配 |
| 联网搜索 | 塞 `content` 加一句"根据搜索…" | 没有标准位置，靠关键词猜 |
| 多模态（图片/音频） | 塞 `content` 用 Markdown/Base64 | 解析痛苦 |
| 代码执行结果 | 塞 `content` 混在正文 | 分不清哪句是结果 |

打个比方：旧协议像只提供大纸箱的快递公司，厂商什么都往里塞——A 塞张"这是推理"的纸条，B 塞张"这是搜索结果"的纸条，写法还各不相同。开发者作为收件人，得拆箱逐张翻找、逐家适配。Responses 把纸箱换成了**带标签的独立快递袋**：推理进 `reasoning` 袋、搜索进 `web_search` 袋——看标签即知是什么，且所有厂商标签统一。这就是 typed items 的另一半价值：**协议在源头把"车道"分好，厂商按类归类，开发者直接取用**。

### 2. 内置工具：协议有，但支持要看厂商

Responses 协议设计了一套**服务端内置工具**（web_search、file_search 等）——工具在服务端执行，客户端不用自己接，结果直接注入输出。这是它比 Chat Completions 更"Agent 化"的关键设计。

但要清醒：**协议支持 ≠ 厂商适配**。OpenAI 定义了这些工具，各厂商适配多少是另一回事。

### 3. 语义化事件流：状态机而非裸 delta

Chat Completions 的流式只有 `chunk` 一种事件，工具调用的开始/结束要靠客户端自己拼。Responses 的流式是**语义化命名事件**，像状态机一样可预测：

```
response.web_search_call.in_progress
response.web_search_call.searching
response.web_search_call.completed
response.output_text.delta        # 正文增量
response.completed                # 收尾，usage 随附
```

对 Agent 开发者意味着：**不用自己推断"模型现在在干嘛"，协议直接告诉你**。

***

## 四、生态：cc-switch 与协议转换的代价

Responses API 推出后，一个尴尬的生态局面出现了：**OpenAI 的 Codex 只认 Responses API，而国产模型此前几乎都只提供 Chat Completions API**（GLM、Kimi 等，顶多再加个 Anthropic 兼容端点）——直到 2026-07-31，DeepSeek 率先原生支持 Responses，这个局面才被打破。

于是社区造出了 **cc-switch** 这类工具：起一个本地路由，把 Codex 发出的 Responses 请求**改写成 Chat Completions** 转发给上游模型，响应再转回 Responses 推给 Codex。

```
Codex ──Responses──> cc-switch（本地路由 127.0.0.1:15721）
                        │  协议改写：Responses → Chat Completions
                        ▼
                    国产模型 API（只有 Chat Completions）
```

这确实解决了"能不能用"的问题，但**协议转换是有代价的**：

| 代价 | 说明 |
|---|---|
| 内置工具用不上 | 上游只有 Chat Completions，`web_search` 这类服务端工具无处执行，得退回客户端自己接搜索 |
| typed items 扁平化 | 转换层把 item 数组拍扁成 `message`，reasoning / 工具调用的结构化信息丢失或降级 |
| 事件语义丢失 | 语义化事件流转成裸 delta，客户端又回到"自己拼状态"的老路 |
| 多一层代理 | 多一层故障点、多一层延迟，出问题排查链路更长 |

**这就是"原生支持"和"中转转换"的本质区别**：转换能用，但协议的设计意图被稀释了。

***

## 五、DeepSeek：率先原生支持的实践

2026-07-31，DeepSeek V4-Flash 正式版上线，**原生支持 Responses API 格式**并针对性适配 Codex——成为国内率先原生支持该协议的厂商。这意味着 Codex 用户可以直接用 DeepSeek，不必搭中转站。

但"原生支持"不等于"全量支持"，看支持矩阵：

| 能力 | DeepSeek 的 Responses 支持情况 |
|---|---|
| 支持的模型 | 仅 `deepseek-v4-flash`；V4-Pro 预计 2026-08 初支持 |
| 状态管理 | 无状态（不支持 `previous_response_id` / `conversation`），每次传完整 input |
| 内置工具 | 仅适配 `web_search`（联网搜索），其他内置工具字段会被静默忽略 |
| 视觉 | 不支持（Flash 本就是纯文本模型） |
| 忽略参数 | `parallel_tool_calls`、`metadata`、`store` 等静默忽略 |

**结论**：DeepSeek 提供的是"Responses 协议的子集"，但恰好是 Agent 最需要的核心子集——reasoning / function_call / web_search 全有。

其中 `web_search` 服务端执行对开发者意义最大：**不用自己接 Brave/Tavily，不用注册搜索 API Key**，联网是模型服务端内置能力。我们在 HippoBuddy（Java 的 AI 桌面助手）中第一时间完成了接入：在统一 `LlmClient` 抽象层下新增一个协议客户端，把 `ChatRequest` 翻译成 Responses 格式，上层（会话、工具循环、前端）零感知。接入中最值得注意的三点：

- 终态事件（completed/incomplete/failed）的 `usage`/`output`/`error` **嵌套在 `data.response` 对象内**，而非事件顶层——从顶层读会得到 null，导致 token 统计缺失；
- `function_call_arguments.delta` 事件**不含 call_id**，参数按 `item_id` 散落发送，需要客户端按 item_id 归位累积；
- `web_search_call` 的**动作详情字段**（搜索词、打开的网页、页内查找关键词）不在官方公开的事件文档里——官方只公开了 in_progress / searching / completed 三个状态事件，这些详情是我们在对接时通过实际报文解析确认的。

***

## 六、小结：什么时候用什么

| 场景 | 建议 |
|---|---|
| 构建 Agent（多工具编排、需要状态管理） | **Responses**——typed items + 内置工具省掉一大半编排代码 |
| 单轮问答、轻量对话 | **Chat Completions**——简单，生态成熟，模型覆盖面广 |
| Codex / Claude Code 生态接国产模型 | **优先选原生支持 Responses 的厂商**——少一层协议转换，就少一层稀释和故障 |

**一句话**：Chat Completions 让模型"说话"，Responses 让模型"干活"。前者定义了对话时代，后者正在定义 Agent 时代——协议之争的本质，是"补全一句话"和"跑完一个 Agent"之争。
