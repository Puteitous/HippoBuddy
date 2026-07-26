---
sidebar_position: 5
---

# Hard Constraints, Soft Guidance — A Design Philosophy of HippoBuddy

> What to control, what to let go — and how to decide

***

In the previous article, we introduced a design philosophy: **hard constraints, soft guidance** — enforcing safety rules at the framework level while providing gentle signals through tool responses. This article explores the logic behind this philosophy and how it was applied in HippoBuddy.

## A Path That Didn't Work

Early in HippoBuddy's development, we had a rule: you must read a file before you can edit it. The intent seemed reasonable — prevent the LLM from making blind edits to files it hadn't read. This constraint existed at two levels:

- **In the prompt**: The system prompt said "please read the file content before editing it"
- **In the framework**: The tool call pipeline had checks that would block edit requests without a prior read operation

What happened?

The prompt constraint barely worked. The LLM's "thinking patterns" formed by its training data were far more powerful than a few lines in the system prompt — it followed its own understanding of how things should work. Ironically, in the scenarios where reading before editing was genuinely needed, the LLM **already** read the file first without being told. The constraint only kicked in at fringe cases, while adding pointless overhead to every normal edit operation.

The framework-level constraint was worse — it tried to **teach the LLM how to work**, but the framework couldn't enumerate every scenario where reading was necessary, nor could it determine whether the LLM "truly understood" the file content. Eventually, this constraint was removed entirely.

This experience raises a central question: **In tool design, what should we constrain, and what should we leave alone?**

## Why "Hard Constraints, Soft Guidance"

Before answering that question, we need to establish a premise: **The LLM is smarter than you.**

This isn't a slogan — it's the fundamental assumption behind constraint design. If you treat the LLM like a novice that needs hand-holding, you'll fill your prompts with "first do A, then do B, if C happens do D…" — exactly the path HippoBuddy initially went down. LLMs have their own judgment, and the patterns learned from massive training data are far more reliable than a handful of rules you write in a prompt.

So what does the framework still need to do? Two things:

1. **Hold the line** — Even smart LLMs can make mistakes. Security, permissions, and data integrity are irreversible — the framework must be the safety net.
2. **Give feedback, not instructions** — When a tool call fails, return clear error information and let the LLM decide what to do next. Don't make decisions for it.

This is what "hard constraints, soft guidance" means:

- **Hard constraints**: Framework-enforced rules that cannot be bypassed. The LLM can't override them and doesn't need to understand them — it just complies.
- **Soft guidance**: Information-level hints and suggestions. The LLM can take them or leave them — the decision rests with the LLM.

The fundamental difference isn't "how strong the constraint is" — it's **who bears the responsibility of judgment**. Hard constraints put the responsibility on the framework; soft guidance puts it on the LLM.

## The Decision Framework: Four Questions

How do you decide which rules should be hard constraints and which should be soft guidance? We've developed four diagnostic questions:

### 1. How severe are the consequences?

If violation leads to: data loss, privilege escalation, system crash → **Hard constraint**

If violation leads to: a few extra turns of dialogue, slightly lower efficiency, less elegant code → **Soft guidance**

Security, permissions, and data integrity are non-negotiable — the framework must enforce them. Tool call efficiency, parameter formatting preferences, and call ordering optimization are "suggestions" — the LLM can handle those on its own.

### 2. Can the model judge this on its own?

If the LLM naturally gets it right (or can self-correct when wrong) → **Soft guidance**

If the LLM lacks the information needed to judge (e.g., which commands are dangerous) → **Hard constraint**

"Read before editing" falls in the first category — LLMs have seen countless "read then modify" patterns in training data. "Don't execute rm -rf /" falls in the second — the LLM may know it's dangerous, but could trigger it through parameter concatenation errors, path misunderstandings, etc.

### 3. What's the cost of a mistake?

If the cost of a false negative (letting something dangerous through) is unacceptable → **Hard constraint**

If the cost of a mistake is manageable (at most a few wasted tokens) → **Soft guidance**

A falsely blocked command costs the user a moment of frustration. A dangerous command that slips through could cost data. The former is a UX concern; the latter is irreversible.

### 4. Will this rule become outdated?

If the rule is stable and unlikely to change as models evolve → **Hard constraint**

If the rule may become unnecessary as models improve → **Soft guidance**

"Never delete the root directory" will never become obsolete. "Remind the model to read before editing" — as models get better, the scenarios where this reminder is needed will shrink.

## Hard Constraints in Practice: BlockerChain's Three Locks

HippoBuddy's hard constraints live in the BlockerChain — a chain-of-responsibility pattern that acts like a security checkpoint. Every tool call passes through it, examined by a series of Blockers.

The choice of "chain of responsibility" itself reflects a design principle: **hard constraints should be independent, composable, and observable.** Each Blocker focuses on one dimension of safety; Blockers can be added or removed without affecting others; each Blocker's execution time and interception count are tracked, making it easy to spot constraints that have "expired."

### Lock 1: BashDangerousCommandBlocker

The most complex Blocker, using a **six-tier classification system**:

```
Tier 1: Command substitution (`, $())             → Block
Tier 2: Dangerous patterns (rm -rf /, etc.)       → Block
Tier 3: Local script execution (./ prefix)        → Require confirmation
Tier 4: Strictly blocked list (format, shutdown)  → Block
Tier 5: Confirmation list (rm, kill, etc.)        → Require confirmation
Tier 6: Allowlist (git, ls, etc.)                 → Allow
Default: Unknown commands                         → Require confirmation
```

This tiered system embodies a key principle: **hard constraints aren't binary.** For clearly dangerous operations (command injection, destructive patterns), the framework blocks without negotiation. For operations that have legitimate uses but also carry risk (deleting files, running local scripts), the framework delegates to the user. For safe operations, the framework stays out of the way.

### Lock 2: ConcurrentEditBlocker

Concurrent edit protection. When multiple tool calls execute concurrently, this prevents simultaneous writes to the same file.

This Blocker is deliberately simple — check if a file is locked, return a guided error if it is, allow otherwise. **Simplicity because it doesn't need to understand business logic** — it only needs to know whether a file is currently being modified.

### Lock 3: SchemaValidationBlocker

Parameter validation. Checks whether tool calls have required parameters and correct types.

Though called a "validator," this Blocker is itself **a blend of hard constraint and soft guidance**: it blocks invalid calls (hard), while providing correct parameter examples (soft). When it blocks a `read_file` call missing the `path` parameter, it returns:

```
⛔ Execution blocked
❌ Reason: Missing required parameter: path
💡 Example: {"path": "src/main/java/com/example/Example.java"}
```

The 💡 part is soft guidance — it doesn't tell the LLM "you should check your parameters before calling" — it shows the LLM what correct parameters look like and lets it figure out the fix.

## Three Principles of Hard Constraint Design

From these three locks, we can extract three principles:

**1. Hold the line, don't teach**

Hard constraints only block operations that are irreversible. They don't ask "why are you doing this" or judge "is this the optimal approach" — they only check "is this operation allowed."

**2. Execute silently, don't consume LLM attention**

BlockerChain operates at the 1ms level, completely transparent to the LLM. Hard constraints shouldn't be something the LLM needs to be aware of — they should work like a foundation, unseen but essential.

**3. Be observable and adjustable**

Each Blocker's execution time and interception count are tracked. If a Blocker has zero interceptions for a long time, or its interception rate spikes suddenly, it's time to reconsider whether that constraint is still necessary. **Hard constraints should come with an expiration date.**

## Soft Guidance in Practice: The Evolution of Error Messages

If hard constraints are about "what not to do," soft guidance is about "how to get it right."

HippoBuddy's soft guidance lives primarily in tool error messages. The HookResult class provides five return types, each with a different guidance strategy:

| Return Type | Meaning | Guidance Strategy |
|------------|---------|-------------------|
| `allow()` | Let it through | None |
| `warn()` | Let through with warning | Gentle reminder, no blocking |
| `validationError()` | Parameter error | Error reason + correct example |
| `block()` | Forbidden | Error code only, no guidance |
| `requireConfirmation()` | Needs user approval | Delegate to user |

The contrast between `block()` and `validationError()` is particularly instructive:

- **`block()`**: Tells the LLM "this operation is forbidden" with no alternatives or suggestions. This is because blocked operations (like command injection) have no "correct form" — the LLM shouldn't try to fix the parameters, it should change its approach entirely.
- **`validationError()`**: Tells the LLM "wrong parameters, here's what correct ones look like." This guides the LLM to fix its call without doing the fix for it.

The logic behind this distinction: **Error messages shouldn't solve the problem for the LLM — they should give the LLM enough information to solve it on its own.**

Earlier versions of error messages were more verbose — "please check your parameters, make sure the path field is not null, path should be a string…" — like error messages written for human developers. But the LLM isn't a developer. These were later simplified to:

```
⛔ Execution blocked
❌ Reason: Missing required parameter: path
💡 Example: {"path": "src/main/java/com/example/Example.java"}
```

Three-part structure: **Indicator → Reason → Example**. The indicator tells the LLM "something went wrong," the reason tells it "what," the example tells it "what right looks like." No wasted words — and full judgment is left to the LLM.

## The Gray Zone: requireConfirmation

`requireConfirmation` is a special middle ground — neither hard constraint nor soft guidance, but **a handoff of decision-making to the user**.

When the framework detects an operation that "might be risky but might also be legitimate" (like running `rm` or executing a local script), it doesn't decide whether to block or allow. Instead, it tells the LLM "this needs the user's approval" and pauses for confirmation.

The beauty of this design: **the framework avoids making value judgments for the user.** "Deleting a file" is perfectly reasonable in some contexts (cleaning up temp files) and destructive in others. The framework doesn't have enough context to know which situation this is — but the user does.

`requireConfirmation` is essentially a **liability mechanism**: the framework enforces "no dangerous operation happens silently," while handing the final decision to someone who can make an informed judgment.

## Looking Back

Let's revisit the "read-before-edit" example from the beginning. Why couldn't that constraint work?

Applying the four diagnostic questions:

1. **How severe are the consequences?** → An LLM editing a file without reading it first can at most make a recoverable mistake. Not severe → Not a hard constraint
2. **Can the model judge this on its own?** → LLMs naturally understand they need to know file content before modifying it → Not a hard constraint
3. **What's the cost of a mistake?** → Blocking a legitimate edit costs at most one extra conversation turn → Not a hard constraint
4. **Will this rule become outdated?** → As models improve, this constraint becomes increasingly unnecessary → Not a hard constraint

All four say "not a hard constraint." This was actually a **soft guidance problem** — when the LLM does make a blind edit, the tool's error message should help it realize "that edit went wrong," rather than preventing it from trying in the first place.

## Beyond Tools: The Philosophy Across the Framework

"Hard constraints, soft guidance" isn't exclusive to the tool layer. Looking through HippoBuddy's codebase, this pattern appears repeatedly across every level of the framework — it's become a **framework-level design instinct** that emerged from years of iteration.

### StopHook Layer: stop vs. warn

```
StopHook.java

stop("Dead loop detected, force terminating")  → Hard constraint: stop immediately
warn("Abnormal tool call pattern detected")     → Soft guidance: warn only, let the loop decide
```

StopHook is BlockerChain's mirror image at a higher abstraction level — their return structures are nearly identical (stop/continue/warning mirroring block/allow/warn). This isn't coincidence; it's the same design philosophy projected onto different layers.

### Concurrent Execution Layer: File Lock vs. Callback Notification

```
ConcurrentToolExecutor.java

Hard constraint: FileLockManager file locks
                 — Only one tool can write to a file at a time
Soft guidance:   ToolExecutionCallback notifications
                 — Notify upstream "execution complete" without controlling next steps

Hard constraint: Background vs. foreground task separation
                 — Operations requiring user wait can't execute silently in background
Soft guidance:   Results sorted by index before returning
                 — Prevents LLM confusion from out-of-order tool results
```

Interestingly, **file locking is itself a "hard constraint"** — it operates at the tool level (ConcurrentEditBlocker checking lock status) and at the concurrent execution level (ConcurrentToolExecutor managing locks). The same protection mechanism follows the same design philosophy on two levels.

### The Common Thread

These examples aren't meant to show "there are hard and soft things everywhere in the code" — they show: **when you're confident enough in a design philosophy, it seeps into every layer of decision-making without conscious effort.**

Look at what they have in common:

- **Hard constraints always protect something irreversible**: StopHook protects against infinite dead loops, file locks protect against data corruption
- **Soft guidance always provides information for "what to do next"**: Issuing warnings, callback notifications — information only, no decisions made
- **The boundary between the two is always clear**: Force terminate vs. issue warning, lock file vs. notify completion

This shows that "hard constraints, soft guidance" isn't a design pattern you deliberately apply — it's something that naturally grows out of understanding what each layer of the framework should and shouldn't do.

## Summary

Hard constraints and soft guidance aren't opposites — they're complementary dimensions of tool design:

- **Hard constraints hold the line** — Security, permissions, data integrity. These are the framework's non-negotiable responsibilities.
- **Soft guidance provides feedback** — Through clear, concise error messages that let the LLM decide its next move.
- **The gray zone goes to the user** — When you're not sure, the user decides.

The core of tool design isn't "how to constrain the LLM" — it's **how to give the LLM maximum freedom while holding an unbreakable line**. The framework shouldn't teach the LLM how to work — the LLM is far smarter than any framework. But the framework must catch the worst outcomes when the LLM makes mistakes, and communicate what happened in terms the LLM can understand.

Let the LLM decide. Let the framework hold the line. That's what "hard constraints, soft guidance" is all about.
