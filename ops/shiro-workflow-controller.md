# Shiro Workflow Controller

`ops/shiro-workflow-controller.mjs` is the production controller for #白 thread operations.

## Purpose

The controller replaces reminder-style tmux nudging with durable workflow state.

It tracks each #白 thread/session as a workflow and separates:

- observed results
- pending approval packets
- concrete blockers
- unverified waits
- internal controller prompts

`nudged`, `sent`, `reminded`, and `re投入` are not progress.

## State

Main files:

- `state/shiro-workflows/workflows.json`
- `state/shiro-workflows/last-report.json`
- `state/shiro-workflows/last-message.md`
- `state/shiro-workflows/events.jsonl`
- `state/shiro-workflows/approval-dispatch.json`

Inputs:

- `state/shiro-channel-thread-registry.json`
- `ops/task-session-map.json`
- `ops/session-policies.json`
- legacy `state/shiro-loop/state.json`

## Commands

Dry run:

```sh
node ops/shiro-workflow-controller.mjs --json
```

Persist state:

```sh
node ops/shiro-workflow-controller.mjs --write --json
```

Act on safe internal next steps:

```sh
node ops/shiro-workflow-controller.mjs --act --json --max-actions 6
```

Validate the visible message:

```sh
jq -r .humanMessage state/shiro-workflows/last-report.json | node ops/message-quality-check.mjs
```

Mark an approval request as sent after posting it to the relevant Discord thread:

```sh
node ops/shiro-workflow-controller.mjs --mark-approval-sent <requestId>
```

## Reporting Contract

The visible report must start with:

- `Yakonさんにお願いしたいこと`
- `白が実行/確認したこと`
- `止まっているもの`
- `報告しないもの`

Reportable progress requires at least one of:

- `resultObserved=true`
- `approvalPacket.ready=true`
- concrete blocker
- missing workflow session that needs bootstrapping

The controller must not show a tmux prompt, wait text, or reminder as an observed result.

## Approval Packet Contract

Yakon should only receive a decision request when all fields are concrete:

- subject
- recommended decision
- exact action or command
- risk
- rollback
- wait impact
- evidence

If these fields are not concrete, the controller keeps the item as internal Shiro work.

When a packet becomes ready, the controller emits `.approvalRequests[]`.
Each request body starts with `<@797097185098858508>` and must be posted to the request's `.threadId`, not only to #白.
After successful thread posting, record the `.requestId` with `--mark-approval-sent` to prevent duplicate requests.

## Cron

OpenClaw cron jobs are wired as follows:

- `shiro-loop-tick`: runs `node ops/shiro-workflow-controller.mjs --act --json --max-actions 6`
- `shiro-loop-digest`: runs `node ops/shiro-workflow-controller.mjs --write --json`

Both validate `.humanMessage` with `ops/message-quality-check.mjs` before visible delivery.
Both must post ready `.approvalRequests[]` to their target threads before sending the #白 summary.

## Safety

The controller may prompt tmux agents to do low-risk local work, verification, blocker refinement, and approval-packet preparation.

It must not push, deploy, migrate production DB, delete data, expose secrets, increase costs, or alter external/public state.
