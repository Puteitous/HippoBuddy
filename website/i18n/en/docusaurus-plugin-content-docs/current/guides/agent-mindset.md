---
sidebar_position: 1
---

# AI Agent Usage Tips

> Lessons learned from months of deep AI Coding Agent usage and building HippoBuddy from scratch

***

## Preface

Over the past few months, I built HippoBuddy from zero to completion with the help of AI Coding Agents. Along the way, I stepped into plenty of pitfalls and developed a set of effective workflows. The 14 tips below cover five dimensions: **context management, session division, defensive rules, judgment & correction, and tool risk awareness** — hopefully useful for those deeply using Agents.

***

## I. Context Management

### 1. Context Coherence & Purity

**One session, one coherent task.** Don't cram multiple unrelated tasks into the same session. An Agent's context is limited; mixed tasks interfere with each other, degrading reasoning quality.

### 2. Watch Out for Context Bloat

When context gets too long, the model's thinking and responses become rigid —思路 gets stuck, falls into fixed patterns, reactions slow down. This is a common ailment of context bloat, regardless of IDE or model. Additionally, **each tool call sends the entire context**, so the larger the context, the more tokens consumed per call — and the cost差异 adds up over dozens of rounds. When you feel the conversation starting to "stall," it's time to start a fresh session.

### 3. Make Good Use of Session Forking

Most IDEs (Trae, Cursor, etc.) have a "fork session" or "create copy" feature. This essentially **truncates the conversation while fully reusing the current context cache.** It's incredibly useful when you need to branch out and explore different approaches without losing context.

***

## II. Session Division

### 4. Summarize Progress, Start a New Session

When a piece of work reaches a natural milestone, ask the LLM to summarize the current progress and results. Then copy that summary to the **beginning of a new session** as background. This lets you travel light while preserving关键 context.

### 5. One Round, One Clear Purpose

Before starting a round of conversation, be clear about whether the goal is **exploration** or **execution**. Keep them separate:

- **Exploration phase**: Allow the Agent to read code broadly and propose solutions
- **Execution phase**: Focus on implementation, promptly interrupt the Agent's overthinking

This way, when problems arise, rolling back and understanding the Agent's intent is much clearer.

***

## III. Defensive Rules

### 6. Use Rules to Constrain Model Behavior

Don't assume models naturally understand your project conventions. Use workspace-level rule files to tell the model upfront:

- **Things to NEVER do**: Don't引入 new frameworks, don't modify config files, don't upgrade dependencies without permission
- **Must-follow style**: Naming conventions, file splitting principles, comment style
- **Project background knowledge**: Current tech stack, architecture conventions, historical decision rationale

This gives the model **hard constraints** when executing tasks — far more effective than repeatedly reminding it in every prompt.

### 7. Leverage Skills to Compensate for Model Weaknesses

Models perform poorly on certain tasks:

- Generating complex documents (Word, PPT, Excel) → Let the model call specialized doc libraries/SDKs
- High-fidelity UI reproduction → Let the model reference design files or component libraries
- Multi-step mathematical calculations → Let the model write code to compute, not do the math itself

**Don't expect the model to excel at everything.** Identify its weaknesses and use skills or toolchains to compensate — efficiency will skyrocket.

***

## IV. Judgment & Correction

### 8. Watch Out for "Fixing Tunnel Vision"

When the model's thinking gets excessively long,陷入 a cycle of doubt and self-negation, stop and判断:

- Is the direction itself wrong?
- Or is the LLM misunderstanding?
- Or is your prompt意图不够清晰?

Timely termination of meaningless cycles — realign the goal with the model.

### 9. Models Have Inertial Thinking

Models tend to **leverage the current context and stubbornly push in one direction.** Don't blindly trust the model's judgment — you need to人工辨别 whether the direction is right and correct course in time.

### 10. Go Online When You Need To

Models tend to answer from training knowledge, but for time-sensitive or deeply specialized questions, **explicitly asking the model to search the web** is far better than working in isolation. Don't assume the model knows everything by default.

### 11. Combine Free Web LLMs for Discussion

For scenarios requiring brainstorming — architecture design,方案 comparison — open a web-based LLM (free ChatGPT, Claude, etc.) for an initial round of discussion. Web versions are often faster and more flexible, suitable for early-stage exploration.

***

## V. Tool Risk Awareness

### 12. Shell Commands Can Easily Fall Into Infinite Loops

When an Agent uses bash to run commands, it can sometimes fall into infinite loops (retrying repeatedly,反复 checking). **Long-running commands should be manually executed in the terminal** — don't let the Agent run them in the chat pane.

### 13. read / edit / write Also Risk Infinite Loops

Don't think only bash can get stuck. read, edit, and write tools can also fall into loops — like the Agent repeatedly reading the same file, writing the same changes over and over. **You need to判断 and terminate promptly.**

### 14. Dangerous Commands Risk Accidental Deletion

Be especially careful with bash and delete tool operations. **Back up important code regularly.** Better safe than sorry.

***

## VI. Final Thoughts

### 15. Dialogue is More Than Just Task Completion

Don't treat Agent sessions as one-off tool calls. **Document, summarize, and update records during the conversation.** Tasks are sessions, sessions are documentation. Make the most of every session — they're not just channels for完成任务, but valuable assets for future review and reuse.
