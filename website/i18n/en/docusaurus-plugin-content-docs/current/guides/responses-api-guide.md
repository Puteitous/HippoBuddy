---
sidebar_position: 6
---

# From Chat Completions to the Responses API: What an Agent-Era Protocol Looks Like

> In 2023, OpenAI's Chat Completions API defined "conversational completion." In 2025, it introduced the Responses API, aiming to become the "Agent runtime." How are the two protocols different? Why does Codex only accept the new one? Why did the community build protocol-translation tools like cc-switch? And what does it mean that DeepSeek became the first domestic vendor to natively support it? This article explains it all.

***

## 1. Why the Responses API Exists: The Limits of Chat Completions

Chat Completions was born in 2023 with the mental model of "**conversational completion**" — a list of `messages[]` representing history, and the model completes the last utterance. It turned the LLM into a chat interface: simple, universal, with a massive ecosystem.

But as developers started building **Agents** on top of it (letting the model call tools and execute tasks autonomously), the limitations became obvious:

| Limitation | What it looks like |
|---|---|
| Tool calling is "stuffed in" | `tool_calls` is a convention field attached to `message`, not a first-class citizen of the protocol |
| No standard place for reasoning | Every vendor rolls its own custom field (e.g., DeepSeek's `reasoning_content`) |
| No home for built-in capabilities | Search, file handling, etc. have no place in the protocol — the client has to integrate them itself |
| Streaming is raw deltas only | Just one event type (`chat.completion.chunk`); clients must piece together tool-call lifecycle themselves |

**The root problem**: Chat Completions was designed for "conversation," but an Agent needs "execution of a complete task" — reasoning, calling tools, searching, delivering results. These actions need to be expressed structurally in a single response, and the client needs to know "what step the model is on."

That's what the Responses API is for. OpenAI's positioning is blunt: **as simple as Chat Completions, as powerful as the Assistants API** — pushing tool orchestration, state management, and built-in tools down into the protocol layer.

***

## 2. Head-to-Head: Chat Completions vs Responses

| Dimension | Chat Completions (conversational completion) | Responses API (Agent runtime) |
|---|---|---|
| **Endpoint** | `POST /v1/chat/completions` | `POST /responses` |
| **Request body** | `messages[]` array, system mixed into messages | `input` items + separate `instructions` field |
| **Response structure** | Single `choices[0].message` object | `output` item array: reasoning / message / function_call / web_search_call mixed |
| **Streaming events** | `chat.completion.chunk` + `data: [DONE]` | Semantically named events, terminated by `completed / incomplete / failed` |
| **State management** | None (client assembles history) | `previous_response_id` / `conversation` (stateful) |
| **Caching** | Manual management or vendor prefix caching | Server-managed (`usage.input_tokens_details.cached_tokens`) |
| **Built-in tools** | None (bring your own Brave/Tavily for search) | `web_search` and others run **server-side** |

The three differences that matter most to Agent developers, in detail.

***

## 3. Three Key Design Decisions

### 3.1 Typed items: everything in one response

Chat Completions responses have a single `message` object; reasoning, tool calls, and body text are all packed into conventional fields. Responses splits the output into a **typed item array**:

```json
{
  "output": [
    {"type": "reasoning", "summary": "..."},
    {"type": "function_call", "call_id": "fc_1", "name": "read_file", "arguments": "{\"path\":\"/src/Main.java\"}"},
    {"type": "web_search_call", "status": "completed", "action": {"queries": ["Responses API fundamentals"]}},
    {"type": "message", "content": [{"type": "output_text", "text": "Found it…"}]}
  ]
}
```

Compare that with a Chat Completions response — you parse `tool_calls` yourself, reasoning lives in a vendor-specific field, and web search has no place at all:

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Found it…",
      "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "read_file", "arguments": "..."}}]
    }
  }]
}
```

**The difference**: Responses structurally expresses "a complete Agent thought process"; Chat Completions only delivers "a completed sentence."

### 3.2 Built-in tools: the protocol has them, but vendor support varies

The Responses protocol defines a set of **server-side built-in tools** (web_search, file_search, etc.) — they execute on the server, so the client doesn't integrate anything, and results flow back into the output. This is a key "Agent-first" design that Chat Completions lacks.

But be clear-eyed: **protocol support ≠ vendor support**. OpenAI defines these tools; how many of them each vendor actually implements is another matter entirely.

### 3.3 Semantic event stream: a state machine, not raw deltas

Chat Completions streaming has only `chunk` events; the client has to reconstruct tool-call lifecycle itself. Responses streaming uses **semantically named events**, as predictable as a state machine:

```
response.web_search_call.in_progress
response.web_search_call.searching
response.web_search_call.completed
response.output_text.delta        # body text delta
response.completed                # final state, usage attached
```

For Agent developers this means: **you don't infer "what the model is doing" — the protocol tells you.**

***

## 4. The Ecosystem: cc-switch and the Cost of Protocol Translation

After the Responses API launched, an awkward situation emerged: **OpenAI's Codex only accepts the Responses API, while domestic models previously offered little beyond Chat Completions** (GLM, Kimi, etc., at most plus an Anthropic-compatible endpoint) — until DeepSeek natively supported Responses on 2026-07-31, breaking the deadlock.

So the community built **cc-switch** and similar tools: a local router that **rewrites** Codex's Responses requests into Chat Completions, forwards them to the upstream model, then translates the response back into Responses format for Codex.

```
Codex ──Responses──> cc-switch (local router 127.0.0.1:15721)
                        │  rewrite: Responses → Chat Completions
                        ▼
                    Domestic model API (Chat Completions only)
```

This solves "can I use it at all," but **protocol translation has a cost**:

| Cost | What it means |
|---|---|
| Built-in tools are unusable | The upstream only speaks Chat Completions, so server-side tools like `web_search` can't run — you fall back to integrating search yourself |
| Typed items get flattened | The translation layer flattens the item array into `message`, losing or degrading the structured reasoning / tool-call information |
| Event semantics are lost | Semantic events degrade into raw deltas — the client is back to reconstructing state itself |
| An extra proxy layer | One more point of failure, one more hop of latency, a longer debugging chain |

**This is the essential difference between "native support" and "translated access":** translation works, but it dilutes the protocol's design intent.

***

## 5. DeepSeek: A Domestic First for Native Support

On 2026-07-31, the DeepSeek V4-Flash production release went live with **native Responses API support**, explicitly adapted for Codex — making DeepSeek the first domestic vendor to natively support the protocol. Codex users can now point directly at DeepSeek without a translation layer.

But "native support" ≠ "full support" — check the matrix:

| Capability | DeepSeek's Responses support |
|---|---|
| Supported models | `deepseek-v4-flash` only; V4-Pro expected in early Aug 2026 |
| State management | Stateless (no `previous_response_id` / `conversation`) — send full input every time |
| Built-in tools | `web_search` only; other built-in tool fields are silently ignored |
| Vision | Not supported (Flash is a text-only model) |
| Ignored params | `parallel_tool_calls`, `metadata`, `store`, etc. silently ignored |

**Conclusion**: DeepSeek provides a "subset of the Responses protocol" — but exactly the subset Agents need most: reasoning / function_call / web_search are all there.

Server-side `web_search` matters most to developers: **no Brave/Tavily integration, no search API key to register** — web search is a built-in capability of the model. We integrated it into HippoBuddy (a Java-based AI desktop assistant) right away: added a protocol client under the unified `LlmClient` abstraction, translating `ChatRequest` into Responses format, with zero impact on the layers above (session, tool loop, frontend). Three things stood out during integration:

- Final-state events (completed / incomplete / failed) nest their `usage` / `output` / `error` **inside `data.response`**, not at the event top level — reading from the top level returns null, silently breaking token accounting;
- `function_call_arguments.delta` events **carry no `call_id`**; arguments arrive fragmented by `item_id`, so the client must accumulate them keyed by item_id.
- `web_search_call`'s **action detail fields** (search queries, opened pages, in-page find keywords) are not in the officially documented events — the docs only expose three status events (in_progress / searching / completed); we confirmed the details by parsing actual payloads during integration.

***

## 6. Summary: Which One, When

| Scenario | Recommendation |
|---|---|
| Building an Agent (multi-tool orchestration, state management) | **Responses** — typed items + built-in tools save most of the orchestration code |
| Single-turn Q&A, light chat | **Chat Completions** — simple, mature ecosystem, widest model coverage |
| Using Codex / Claude Code ecosystem with domestic models | **Prefer vendors with native Responses support** — one less translation layer, one less dilution and failure point |

**In one sentence**: Chat Completions makes the model "talk"; the Responses API makes the model "work." The first defined the chat era; the second is defining the Agent era — at its core, the protocol battle is between "completing a sentence" and "running an Agent."
