# Shiro Loop v2

Shiro Loop v2 changes the unit of operation from a recurring cron tick to a per-thread loop definition.

Current policy:

- All OpenClaw cron jobs are disabled.
- Loop v2 is manual until Yakon approves a new scheduler.
- Each thread/session gets a verifiable goal, pass criteria, allowed autonomous actions, confirmation gates, and a separate verifier requirement.
- Executor output is not completion evidence by itself.
- Yakon should only receive decision-ready packets: scope, exact action, rollback, risk, recommendation, deadline, and consequence of waiting.

Run:

```sh
node ops/shiro-loop-v2.mjs --write
```

Outputs:

- `state/shiro-loop-v2/loops.json`
- `state/shiro-loop-v2/next-actions.md`

Do not add cron back until the loop definitions and verifier flow are reviewed.
