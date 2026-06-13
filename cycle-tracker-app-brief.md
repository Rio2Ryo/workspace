# Claude Code Task: Cycle Tracker App

Owner request: Build a menstrual cycle management app that calculates period, ovulation day, fertile/high-risk days, and low-risk days automatically from period dates. Include in-app tips/knowledge for recognizing ovulation signs. Work in a new session, commit to Git, and deploy to Vercel.

## Working directory
Create/use: `/Users/umi/.openclaw/workspace/cycle-tracker-app`

## Requirements
- Build a polished responsive web app suitable for Vercel deployment.
- User inputs at minimum:
  - Last period start date
  - Period length (default 5 days)
  - Cycle length (default 28 days)
  - Optional recent period history if feasible.
- Auto-calculate:
  - Next period window
  - Estimated ovulation day: generally ~14 days before next period.
  - Fertile/high-risk window: commonly 5 days before ovulation through ovulation day (optionally +1 day, explain clearly).
  - Low-risk days, but never claim guaranteed safe. Label as `低確率日（安全を保証しません）` or similar.
- Calendar / timeline UI showing:
  - 生理予定日
  - 排卵予測日
  - 妊娠可能性が高い期間 / 危険日
  - 低確率日
- Include tips cards/chips about ovulation signs:
  - LH ovulation tests
  - Basal body temperature rise after ovulation
  - Cervical mucus changes (egg-white/stretchy)
  - Mittelschmerz/ovulation pain
  - Breast tenderness/libido changes as non-definitive hints
  - Irregular cycles, stress, illness, postpartum, medications can shift ovulation
- Important safety/privacy requirements:
  - This is an estimate, not medical advice.
  - Do not market rhythm method as reliable contraception.
  - Add a clear disclaimer: contraception/STI prevention needs condoms or clinician-approved methods; consult a doctor for irregular cycles, severe pain, abnormal bleeding, pregnancy concerns.
  - Since this is sensitive health data and no auth/backend is requested, prefer privacy-first local-only storage if persistence is implemented; clearly say data stays in the browser.
- Japanese UI copy, warm and clear.
- Add basic tests or at least a deterministic calculation test if the stack supports it.
- Run build/test/lint as available.
- Initialize Git repo if needed and create a commit.
- Deploy to Vercel and capture the public deployment URL.
- Report back in Discord thread `1507900090742870097` with: 成果 / 検証 / URL / 残ブロッカー / 次アクション.

## Implementation preference
- Prefer Next.js + TypeScript + Tailwind or Vite + React + TypeScript, whichever is fastest/reliable in this environment.
- Keep scope compact but production-presentable.
- If Vercel login/project setup blocks deployment, document exact blocker and leave repo committed.

## Run mode
Use Claude Code autonomously. Standard local-safe mode is allowed. External publish/deploy is explicitly requested by Yakon, so proceed unless secrets/payment/destructive operations are required.
