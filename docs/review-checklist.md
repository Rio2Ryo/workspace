# Technical Review Checklist — AI Swarm Factory

_Last updated: 2026-04-28 02:25 JST_

## Scope

This checklist is for the AI Swarm Factory app once its implementation lands in the workspace. At the time of creation, no identifiable AI Swarm Factory source tree was present; this checklist is based on the existing `docs/qa-plan.md` and the expected product shape: a web app or landing/demo for configuring or launching coordinated AI agents/workers.

## Pre-review intake

- [ ] Confirm target app directory and framework.
- [ ] Identify runtime surface: static page, server-rendered app, API routes, background jobs, external AI APIs, auth, database, queue, storage.
- [ ] Record deployment target and region: Vercel, Cloudflare, Render, VPS, etc.
- [ ] Record required environment variables and which are server-only vs public/client-safe.
- [ ] Review `git diff` against the intended base branch before approving.

## Security & privacy

- [ ] No real secrets, tokens, credentials, private URLs, or customer data committed.
- [ ] Public env vars are intentionally prefixed and safe for browser exposure; AI/API keys are server-only.
- [ ] API routes validate inputs with explicit schemas, size limits, and safe defaults.
- [ ] Prompt/user content is treated as untrusted data; no raw HTML injection or unsafe markdown rendering.
- [ ] External links use `rel="noopener noreferrer"` with `_blank`.
- [ ] Forms and launch actions include CSRF/session protections if authenticated or state-changing.
- [ ] Rate limiting, abuse protection, or quota guards exist for AI-generation/agent-launch endpoints.
- [ ] Errors do not leak stack traces, prompts, tokens, model provider responses, or internal URLs.
- [ ] Logs avoid sensitive prompt payloads and personal data unless explicitly needed and redacted.
- [ ] Security headers are configured where supported: CSP or documented exception, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

## Deployment & reliability

- [ ] Production build passes from a clean install using documented commands.
- [ ] Runtime versions are pinned or constrained (`engines`, lockfile, `runtime.txt`, etc.).
- [ ] Required env vars are documented in `.env.example` without real values.
- [ ] Missing env vars fail loudly at startup/build or show a clear disabled state, not silent runtime breakage.
- [ ] API/network failures render user-visible recovery states.
- [ ] Long-running agent/AI operations have timeouts, cancellation or retry guidance, and loading states.
- [ ] Deployment config avoids accidental high-cost always-on workers unless intentional.
- [ ] Rollback path is clear: static deploy rollback, feature flag, or disabled integrations.

## Cost & quota control

- [ ] AI/model calls are server-side only and guarded from anonymous unlimited use.
- [ ] Model/provider, max tokens, concurrency, retries, and timeout limits are explicit.
- [ ] Demo mode or mock mode is available when real provider keys are absent.
- [ ] Expensive background work is not triggered by page render, bots, refresh loops, or unauthenticated crawlers.
- [ ] Caching is used for static/demo content where appropriate.
- [ ] Cost-sensitive actions show confirmation or clear user intent before launch.

## Accessibility & UX quality

- [ ] One logical `h1`; heading hierarchy is meaningful.
- [ ] Interactive elements are native controls or have correct roles, names, and keyboard handling.
- [ ] All form controls have visible labels or accessible labels.
- [ ] Focus states are visible; keyboard-only users can reach and operate every CTA/control.
- [ ] Color contrast is sufficient for text, buttons, status badges, and glass/gradient sections.
- [ ] Motion/animation respects `prefers-reduced-motion` or is non-blocking.
- [ ] Images/icons have useful alt text or are marked decorative.
- [ ] Mobile layout works at 375px width without horizontal overflow or clipped controls.
- [ ] Loading, empty, success, and error states are understandable without relying only on color.

## Maintainability

- [ ] Product copy, mock data, and configuration are separated from layout where practical.
- [ ] Components have clear boundaries for landing, agent cards, configuration forms, and results/status.
- [ ] TypeScript types or schemas cover external API payloads and form data.
- [ ] Dead code, template boilerplate, unused dependencies, and placeholder TODOs are removed or tracked.
- [ ] Tests or at least deterministic smoke scripts exist for critical paths.
- [ ] README documents setup, local run, build, deploy, env vars, and known limitations.
- [ ] Dependency versions are current enough and lockfile is committed.
- [ ] The app does not depend on local-only artifacts (`.next`, generated DB files, local absolute paths) for production.

## Minimum approval gates

- [ ] `git status --short` reviewed for intended files only.
- [ ] `npm/pnpm/yarn install` or equivalent dependency state verified.
- [ ] `lint` passes or documented as unavailable.
- [ ] `typecheck` passes or documented as unavailable.
- [ ] `build` passes.
- [ ] Browser smoke test passes on the primary route and key CTA/config path.
- [ ] Security/cost risks are either resolved or explicitly accepted by Ryo/main agent.
