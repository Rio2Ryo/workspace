---
name: agent-orchestrator
version: 0.1.0
description: Coordinate multiple agents by turning goals into delegated instructions, judging agent outputs, resolving blockers, and issuing the next concrete action without waiting for the human.
metadata:
  openclaw:
    emoji: "🧭"
    category: productivity
---

# Agent Orchestrator

Use this when the user wants Shiro to direct other agents, judge their work, restart stalled work, or keep a multi-agent operation moving.

## Core loop

1. **Observe**: collect current tasks, active sessions, recent outputs, blockers, and owner/channel mapping.
2. **Decide**: classify each item as `continue`, `verify`, `redirect`, `escalate`, or `done`.
3. **Instruct**: send one concrete next action to the responsible agent/session, including success criteria and reporting destination.
4. **Verify**: check evidence before accepting completion: test, build, screenshot, diff, log, URL, or explicit blocker.
5. **Report**: post concise status to the relevant work thread and only summarize to the central channel.

## Delegation format

Every instruction to an agent must include:

- Goal: what outcome is needed
- Context: why it matters / relevant files or URLs
- Constraints: no external publish, no deletion, no paid changes, no secret exposure unless approved
- Done condition: concrete evidence required
- Report target: the Discord thread/channel where results must be posted

## Judgment rules

- If an agent is idle and a safe next step is obvious, issue it immediately.
- If an agent reports completion without evidence, ask for verification rather than accepting it.
- If an agent is looping, narrow the task or switch to diagnosis.
- If work requires human policy judgment, secret values, production config changes, deletion, clear paid spend, or public-scope expansion, escalate with options.
- Do not use vague prompts like “いい感じに進めて”. Convert them into a measurable action.

## Status cadence

- Work thread: whenever state changes materially, with `成果 / 検証 / URL / 残ブロッカー / 次アクション`.
- Central channel: short rollup only, unless human asks for detail.
- Avoid duplicate notifications for unchanged blockers.

## Minimum viable autonomy

Autonomy is considered active when Shiro can:

1. Detect idle/stalled agents.
2. Choose a Ready task or recovery action.
3. Dispatch a specific instruction.
4. Judge the returned output with evidence.
5. Continue or escalate without waiting for a prompt.
