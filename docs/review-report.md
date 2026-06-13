# Technical Review Report — Second Brain / Plaud Gmail Cron

_Last updated: 2026-04-28 02:22 JST_

## Verdict

**Status: NOT APPROVED — production rollout blocked**

The code now contains a real Second Brain implementation and the Plaud Gmail cron feature builds successfully, but I found unresolved security/cost/deployment documentation risks that should be fixed before approving production rollout.

## Evidence reviewed

- Repository: `/Users/umi/.openclaw/workspace/second-brain`
- Diff reviewed: `ce9e1d96cc259127fefcfb3cdcb95e5c071e4a28..f8b482d5f57fed1d5d63727e73198066660270ca`
- Main changed files:
  - `apps/api/src/index.ts`
  - `apps/api/src/scheduled/plaud-sync.ts`
  - `apps/api/src/routes/plaud.ts`
  - `apps/api/src/routes/ai.ts`
  - `apps/api/src/env.ts`
  - `apps/api/wrangler.toml`
- Checks run:
  - `pnpm lint` — passed with existing warnings
  - `pnpm typecheck` — passed
  - `pnpm build` — passed
  - `pnpm -C apps/web test` — passed, 14/14 tests

## Findings

### FAIL-01 — Cron can trigger unbounded AI/Gmail work without hard caps

**Severity:** Blocker  
**Area:** Cost / abuse prevention / reliability

`runPlaudSync` defaults to 100 messages per run and accepts `maxPerRun` from the manual endpoint without an explicit upper bound. `fetchLimit` is derived with `Math.max(maxPerRun, env limit)`, so a large manual `maxPerRun` can force a very large Gmail fetch/process loop. Every imported message then attempts `/api/ai/summarize`, potentially creating many Workers AI calls in one request/cron window.

**Evidence:** `apps/api/src/routes/plaud.ts:186-204`, `apps/api/src/scheduled/plaud-sync.ts:302-321`

**Required fix:** Clamp `maxPerRun` and `fetchLimit` to a conservative server-side maximum, add a summary budget/concurrency limit, and document expected hourly worst-case cost. Consider defaulting lower than 100 until real volume is known.

### FAIL-02 — Public AI summarize endpoint remains unauthenticated and can be forced

**Severity:** Blocker  
**Area:** Security / cost

`/api/ai/summarize` accepts any `docId` and optional `force`. There is no auth, internal token, rate limit, or quota check before reading R2 and invoking Workers AI. Because the Pages proxy exposes `/api/*`, this can be called by anyone who can reach the deployed app/API.

**Evidence:** `apps/api/src/routes/ai.ts:59-66`, route exposure in `apps/api/src/index.ts:110`

**Required fix:** Protect AI endpoints with auth/internal token or at least rate limits and disable `force` for anonymous users. Cron-internal calls should use a non-public internal path/token.

### FAIL-03 — Production origin is hard-coded in the scheduled handler

**Severity:** High  
**Area:** Deployment / maintainability

The cron handler always calls `runPlaudSync(env, 'https://second-brain-api.common-gifted-tokyo.workers.dev')`. This makes preview/staging/local deployments trigger summaries against production unless code is changed.

**Evidence:** `apps/api/src/index.ts:121-128`

**Required fix:** Move API origin to an environment variable such as `API_ORIGIN`/`PUBLIC_API_ORIGIN`, validate it at startup/scheduled execution, and document per-environment values.

### FAIL-04 — Gmail/Plaud environment variables are not documented

**Severity:** High  
**Area:** Deployment / operations

`Env` now includes Gmail OAuth, Plaud, webhook, and internal-token fields, but `docs/ENV.md` still only documents `GITHUB_TOKEN`. A production deploy can silently skip cron due to missing Gmail secrets.

**Evidence:** `apps/api/src/env.ts`, `apps/api/src/scheduled/plaud-sync.ts:287-297`, `docs/ENV.md:1-28`

**Required fix:** Update env docs and `.dev.vars`/deployment instructions for `INTERNAL_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER`, `PLAUD_GMAIL_QUERY`, `PLAUD_GMAIL_MAX_PER_RUN`, `PLAUD_GMAIL_FETCH_LIMIT`, `PLAUD_CLIENT_ID`, `PLAUD_SECRET_KEY`, `PLAUD_WEBHOOK_SECRET`, and API origin.

### WARN-01 — Imported Gmail bodies may include sensitive personal content

**Severity:** Medium  
**Area:** Privacy / data handling

The cron stores full email body, snippet, sender, dates, thread ID, labels, and Message-ID in R2 as markdown. This is expected for a note import, but there is no retention/redaction policy or visibility control documented.

**Evidence:** `apps/api/src/scheduled/plaud-sync.ts:238-259`

**Recommendation:** Confirm workspace access model and add a privacy note. Redact headers that are not needed, or make metadata inclusion configurable.

### WARN-02 — Accessibility cleanup remains needed in the Next.js UI

**Severity:** Medium  
**Area:** Accessibility

The app uses accessible primitives in several places, but multiple top-level pages use visual page titles as `<h2>` instead of a page-level `<h1>`. Lint also reports a missing React key in `docs-list.tsx`, which can cause unstable rendered lists.

**Evidence:** `pnpm lint` warnings; examples include `apps/web/src/app/page.tsx`, `apps/web/src/app/docs/page.tsx`, `apps/web/src/app/tasks/page.tsx`

**Recommendation:** Promote primary page headings to one logical `<h1>` per page and resolve the existing lint warnings.

## Positive notes

- TypeScript checks pass for both `apps/api` and `apps/web`.
- Production Next.js build passes.
- Existing web route tests pass: 5 files, 14 tests.
- Manual Plaud Gmail sync endpoint is token-protected when `INTERNAL_TOKEN` is configured.
- Gmail OAuth secrets are not committed in the reviewed diff.
- Structured performance logging improved versus prior string logs.

## Final approval status

**Not approved for production/external rollout.**

Minimum fixes before approval:

1. Add hard cost caps and rate/summary limits for Plaud cron/manual sync.
2. Protect `/api/ai/summarize` from public unauthenticated use, especially `force`.
3. Replace the hard-coded production API origin with environment configuration.
4. Document all required deployment secrets/config.

After those are fixed, rerun `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the web tests.
