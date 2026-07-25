---
sidebar_position: 3
---

# Context & Cache: Understanding the Cost and Efficiency Behind Agent Conversations

> Every time you talk to an AI Agent, you're sending a chunk of "context" to the LLM. How that context is structured, read, and cached directly determines your usage cost and response speed.

***

## 1. What's Inside a Single Agent Call

When you ask an Agent a question, what actually gets sent to the LLM is much more than just that one sentence. Taking HippoBuddy as an example, here's what the message list looks like during a tool calling loop:

```
system: "You are HippoBuddy, an AI coding assistant…"
tools:
  - ReadFile: path + offset + limit
  - WriteFile: path + content
  - Grep: pattern + path
  - Bash: command
  - …(potentially dozens of tools)
user: "Find all Java files under src/main"
assistant: "Let me search for that" (tool_call → Grep)
tool_result: "Files found: Main.java, Service.java…"
assistant: "Here's the directory structure: …"
```

**Key point:** The message list is **cumulative**. On the second turn, the entire previous turn's assistant response and tool results are sent along with the new query. If a conversation runs for 20 turns, each call carries "the full 20-turn conversation + the new question."

This raises two questions:
1. **Cost:** LLMs bill by the token — longer context means more expensive calls
2. **Latency:** Longer context means longer processing time

Both optimization paths point to the same core technique — **Prefix Caching**.

***

## 2. How LLMs "Read" Your Context

### Attention Is Not Uniform

LLMs use the Attention mechanism to process input. But for long contexts, attention distribution is far from uniform:

- **Beginning (System Prompt + Tool Definitions):** High attention focus
- **Middle (historical tool calls, assistant responses):** Most prone to attention loss
- **End (latest query):** High attention focus

This is the well-known **Lost in the Middle** phenomenon. Research from Stanford and UC Berkeley (2023) showed that as context length exceeds a certain threshold, the model's retrieval accuracy for information in the middle drops significantly.

### Implications for Agents

- **System Prompt is prime real estate.** Instructions and rules written here are most likely to be "seen" by the model.
- **Tool description quality directly affects decisions.** If a tool description is vague or its parameters are poorly documented, the model may misunderstand it right at the attention peak — and everything downstream goes wrong.
- **Historical turns in the middle may get "ignored."** A critical piece of information returned by a tool call could be effectively forgotten if it's buried in the middle of a long context.

> **A good System Prompt and well-written tool descriptions aren't "nice to have" — they're the foundation for correct Agent behavior.**

***

## 3. Why the "Beginning" Is Both an Attention Peak and a Cache Peak

### How Prefix Caching Works

The most time-consuming step when an LLM generates a response is computing attention. At its core, this revolves around the **KV Cache** (Key-Value Cache). Think of it as the model's "scratch notes" after reading the input — intermediate results that can be reused by subsequent tokens instead of being recomputed.

Prefix caching leverages this mechanism:

```
Call 1: system + tools + "hello"
    → Compute KV Cache for [system + tools + "hello"]
    → Store in cache

Call 2: system + tools + "find files"
    → First two parts [system + tools] already cached
    → Read from cache, only compute ["find files"]
    → GPU computation halved, latency drastically reduced
```

### Why Cache Hit = Lower Cost

Most LLM API pricing works like this:

- **Cache Hit:** Pay only for reading the cached result — typically 1/2 to 1/10 of the normal price
- **Cache Miss:** Full computation, full price

At current mainstream model pricing, **cache hits are typically 50%–90% cheaper than misses**, depending on the provider.

System Prompt and tool definitions are the perfect candidates for prefix caching — **they barely change throughout a conversation**, so their KV Cache can be reused on every turn.

***

## 4. The Brittleness of Caching — Why You Can't Change Things

Prefix caching has one critical constraint: **exact matching**.

The cache system compares the token-level prefix. Any change — even a single punctuation mark or a whitespace difference — invalidates the cache, requiring a full recomputation.

### Implications for Agents

This is a trap that's easy to overlook for Agent developers:

| Scenario | Consequence |
|----------|-------------|
| Changed one punctuation mark in System Prompt | Entire cache invalidated on next call |
| Adjusted a tool's parameter description | All accumulated cache wiped |
| Dynamically enabled/disabled a tool | Tool list changed → prefix changed → cache invalidated |
| Tool registration order changed | Same as above |
| Regenerated tools JSON Schema | Even if content is the same, string order change invalidates cache |

**The most sneaky case — mid-session changes:**

Imagine you're in a long conversation with an Agent, and mid-way through, a tool call dynamically enables a new tool. The tool list is now modified, the prefix (system + tools) has changed, and all the accumulated cache benefits from previous turns are gone. Subsequent calls all bill at full non-cache rates.

> **Prefix caching isn't a "set it and forget it" optimization. It requires developers to consciously design System Prompts and tool registration mechanisms for prefix stability.**

***

## 5. Advice for Developers

### 1. Separate Stable Prefix from Dynamic Parts

When designing your message construction strategy, put "stable" content at the head and "changeable" content further back:

```
[Stable prefix]
  system prompt (fixed core instructions)

[Potentially changing]
  dynamic tool definitions (conditionally enabled tools)
  conversation history
  current query
```

But note: **if the system prompt itself changes on every call** (e.g., it dynamically inserts user info or the current time), prefix caching will never hit. Move the variable parts to the end.

### 2. Three Tips for Tool Design

- **Decide on registration up front:** Register all tools at once; don't add or remove them mid-session. If dynamic enable/disable is truly needed, filter at the application layer rather than modifying the tools list
- **Keep descriptions concise and stable:** Longer tool descriptions mean more prefix tokens — and higher cost when the cache misses. A good tool description tells the model "when to use this tool" in as few words as possible
- **Keep parameter names and schemas stable:** Once parameter names, types, and descriptions are set, don't change them casually. Frequent changes make prefix caching effectively useless

### 3. Service Provider Cache Strategy Differences

| Provider | Mechanism | Trigger | Pricing Advantage |
|----------|-----------|---------|-------------------|
| DeepSeek | Automatic prefix cache (disk-based) | Automatic, prefix match from start | 50–120x gap between miss and hit; Flash cache hit as low as $0.0028/M |
| OpenAI | Automatic Prompt Caching | Automatic, no min token for newer models | ~90% discount on cache hit (GPT-5.x), ~50% for older models (GPT-4o) |
| Anthropic | Explicit caching (cache_control markers) | 5min/1hr TTL after marking; write costs 1.25x/2x base | ~90% discount on cache reads (0.10x base input) |
| Google | Implicit caching + Explicit Context Caching | Implicit auto; explicit via API with hourly storage fee | ~90% discount on cache reads, but +$1.00/M/hr storage fee |

> Note: Specific pricing and strategies change over time. Refer to official docs for the latest details. The above is a reference for technology selection.

### 4. Attention-Level Advice

Drawing from the attention distribution discussion in Section 2:

- **Put core instructions first in the System Prompt:** The model's attention starts high at the beginning and decays. Put your most important rules at the very front
- **Write trigger conditions first in tool descriptions:** Let the model immediately understand "when should I use this tool" — this aligns better with attention distribution than leading with parameter details
- **Reiterate critical results in follow-up queries:** If a tool call returns a result that subsequent decisions depend on, briefly restate it in the next turn's user message to prevent it from "sinking" into the middle of the context.

***

## 6. Summary

Three takeaways from this article:

1. **For everyday users:** Keep each session focused on a single thread. Start a new session for different explorations — each one shares the same prefix cache with no extra cost, and avoids the attention dilution that comes with long, mixed conversations.
2. **For developers:** Cache efficiency depends on prefix stability. Separating "stable" from "changeable" content in your System Prompt and tool registration design is the highest-ROI optimization. More importantly, architect your system (fixed tool list, no dynamic prefix modifications) to prevent mid-session cache breaks — that's far more reliable than asking users to "not switch sessions."
3. **For everyone:** Understanding how LLMs read your context (attention and caching) gives you a better intuition for debugging and using Agents effectively

> **Context quality = Attention × Cache efficiency. Good design benefits both.**
