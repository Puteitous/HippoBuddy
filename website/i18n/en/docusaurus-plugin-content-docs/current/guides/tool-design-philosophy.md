---
sidebar_position: 4
---

# From Locking to Unlocking: The Evolution of Tool Design in HippoBuddy

> From adding constraints to removing them — the evolution of tool design in HippoBuddy

***

## A Scene

An Agent tried to call `read_file` on a file that didn't exist. It got an error. Then it tried a different path. Still didn't exist. It tried again… 20 rounds later, hundreds of thousands of tokens had evaporated into thin air.

This wasn't the model being dumb. The model was just "doing its job" — its goal is to fulfill the user's instruction. When a tool call fails, it tries another approach. That's exactly what a responsible agent should do. The real problem is: **when a tool call fails, the model has no good way to decide whether to give up or retry**, and the Agent design didn't give it the information to make that call.

Scenes like this played out many times during HippoBuddy's development. This article documents the journey from "adding constraints" to "removing constraints" in tool design, along with some reflections along the way.

> For user-side tips on working with AI Agents, check out [AI Agent Usage Tips](./agent-mindset.md). This one is from a **developer's** perspective — the design trade-offs in building an Agent.

***

## 1. Early Days: Just Get It Running

HippoBuddy's initial tool set was bare-minimum — only three tools:

- `read_file` — read file content
- `write_file` — write to a file
- `grep` — search text

Each tool was roughly implemented — barely any parameter validation, error handling was just throwing exceptions, let alone caching, retry strategies, or concurrency control.

**But this was intentional.**

The early goal was **quickly validating feasibility**: Can an Agent actually work on a real Java project? Is the architecture sound? If these fundamental questions weren't answered, polishing tools would have been premature.

The strategy was clear: **architecture first, tools just need to be good enough.**

Tools were just "test payloads" for validating the architecture. Rough was fine, as long as they supported basic testing.

***

## 2. Mid Stage: Failures → Death Loops → Add Constraints

As testing deepened, problems surfaced fast.

The most painful and common scenario was the one from the opening: **after a tool call failed, the model fell into a death loop.**

This wasn't specific to `read_file`. Any tool could trigger it:

- `bash` command fails → model retries the same command, thinking it used wrong parameters
- `write_file` path doesn't exist → model tries a different directory, fails, tries another
- `grep` finds nothing → model tries a different pattern, searches further and further off track

Each failed round burned tokens, and the model would never volunteer "I can't do this" — it would keep trying until manually stopped.

### The Response: Add Constraints

To solve this, constraints were added at both the framework and tool levels:

**Framework-level constraints:**
- Per-conversation tool call limit
- Circuit breaker for repeated failures on the same tool
- Timeout control
- Subagent task splitting (break big tasks into smaller ones to limit blast radius)

**Tool-level constraints:**
- Strict parameter validation (wrong type → reject outright)
- File size limits, path sanity checks
- BlockerChain — dangerous command interception, concurrent edit conflict detection

These constraints did solve the death loop problem. **The cost of a failed tool call went up, making the model more cautious about retrying.**

But side effects were on their way.

***

## 3. Polishing Tools: Treat the Cause, Not the Symptom

Alongside adding constraints, another effort was underway — **making the tools themselves better to use.**

Constraints treat symptoms. Tool polishing treats the cause. In hindsight, this phase had the highest return on investment:

**Improve fault tolerance, don't just refuse execution**
- `read_file` got an LRU cache — repeated reads of the same file don't hit disk
- File paths now auto-handle forward/backward slashes and relative path resolution
- Error messages evolved from throwing exceptions to concise hints, letting the model decide its next move

**Streamline error messages**
- Early error messages were full of stack traces and internal details
- Later they became concise descriptions — just telling the model "what happened," not making decisions for it

This points to a deeper design philosophy: **hard constraints, soft guidance.** The framework enforces hard safety constraints (no path traversal, no dangerous commands, no concurrent edit conflicts), while tool outputs provide soft guidance — concise, clear, but leaving the judgment to the model. This design philosophy is explored in its own article: [_Hard Constraints, Soft Guidance — A Design Philosophy of HippoBuddy_](/docs/guides/hard-constraints-soft-guidance).

The common theme of all these improvements: **make tools easier to call correctly.** Constraints tell the model what _not_ to do; polishing tells it how to _get it right_.

***

## 4. Later Stage: Constraints Became Shackles

As tools got better, call success rates improved naturally. But the old constraints, added back when death loops were the norm, were still there.

That's when an unintuitive pattern emerged: **constraints were causing the model to make more tool calls, not fewer.**

Two specific issues surfaced:

- **Truncated tool output**: when tool results were too long, they got cut off. The model couldn't see the full picture and had to call the same tool multiple times to get different pieces of information
- **Call limits killing sessions mid-task**: when a session hit the tool call limit mid-task, it was forcefully terminated — a terrible experience

These two issues compounded each other, producing the opposite of the intended effect.

More examples:

| Constraint | Intended Effect | Actual Effect |
|-----------|----------------|---------------|
| Call limit | Prevent death loops | Task killed mid-way |
| Output truncation | Save context tokens | Model can't see full info, makes more calls |
| Tool circuit breaker | Avoid repeated failures | Model takes longer detours to complete the same task |

Another major shift was the **arrival of million-token context windows**. When DeepSeek V4 launched in late April, million-token windows were no longer a luxury. Previously, limited context meant framework-level truncation, compression, message eviction, and even subagents to share the context burden. With million-token windows, most sessions didn't need any of that — **abundant context made many "token-saving" constraints suddenly redundant.**

So in the later stage, the work flipped in the opposite direction: **remove the constraints that were added earlier.**

- Lifted the tool call limit
- Reduced framework-level intervention, letting the model and tools talk directly
- Dropped unnecessary truncation and compression logic

This isn't to say constraints had no value — they solved real problems at the time. But it's crucial to recognize: **constraints have a cost, and that cost grows as models get smarter and tools get better.** When a phase-specific measure has served its purpose, it should be retired.

***

## 5. Reflection: Tool Design Deserves Early Investment

Looking back at the entire development journey, tool design is one of the areas most worth investing in during the early-to-mid stages.

Framework design answers "can the system run?"; tool design answers "can the Agent actually do work?" The Agent's core working loop — the **Agentic Loop** — is essentially "model decides which tool to call → calls tool → feeds result back to model → model decides next step." The efficiency and quality of this loop depend directly on how well the tools are designed.

The model is the brain; tools are the hands and feet. Without capable tools, even the smartest brain can only theorize. An Agent's capability ceiling = the model's reasoning ability × the tool's execution ability. A weakness in either side limits the whole.

Sharpen the tools and design the Agentic Loop well, and many problems naturally resolve:
- Fewer death loops → because tools work better, the model doesn't need to retry as much
- Higher task completion → because tool error tolerance and hints help the model get it right
- Less framework code → because fewer constraints are needed to compensate

***

## 6. Looking Back

If starting over, a few things would be done differently:

**1. Early tools can be rough, but recognize it as technical debt**

Quick validation in the early stage is the right call. But don't kick the can down the road. Rough tools will cause problems in mid-stage testing — and your users will pay for it. The best time to polish a tool is when you "feel it works but something's off."

**2. Design constraints with an expiration date**

Every time you add a constraint, ask yourself: under what conditions can this be removed? Will it make the model take detours? If a constraint's side effects (more rounds, more token consumption) outweigh the problem it solves, it should go.

**3. Error messages are for the model, not the developer**

The error message a tool returns is the model's only clue for recovery. Keep it concise, clear, and let the model decide what to do next — this pays off far more than piling on retry logic at the framework level.

**4. Keep an eye on model capabilities**

Models are improving fast. Million-token windows, better instruction following — these changes constantly rewrite the answer to "what constraints are necessary." Stay sensitive to model capability shifts and adjust your Agent design accordingly. **The best Agent architecture is one that gets simpler as the model gets smarter, not more complex.**

***

## Closing

If starting over today, more effort would go into tool design from day one. The early focus was on architecture, framework, and UI — tools just needed to be "good enough." That prioritization made sense at the time, but the further the project went, the clearer it became: **tool quality directly determines an Agent's ceiling.** How much effort would you put into polishing an API? Tools deserve the same — because that's what they are: the Agent's API.

> **Give your Agent capable hands — they matter more than an elaborate skeleton.**
