#!/usr/bin/env bash
# Second Brain shiro/phase2-perf-metrics WIP — 分割 commit dry-run script
#
# 目的: Yakon 承認が下りた時に「迷わず」順番通り実行できる手順書。
# **このスクリプトは実行禁止**(承認前)。各 step を 1 行ずつ確認しながら手動で打鍵すること。
# 実行は外部公開を伴うため Yakon 承認後のみ。
#
# 前提:
#   - cwd: second-brain
#   - 現在 stash@{0} に "shiro-qa-2026-05-17-security-test-bisect" が保持されている
#   - WIP は復元済(18 files, 1051 insertions / 239 deletions)
#
# 構成:
#   Commit 1: chore: ignore wrangler runtime logs              (apps/api/.gitignore + tmp/)
#   Commit 2: fix(api): consolidate cron triggers              (index.ts cron 部分 + wrangler.toml + DEPLOY.md + deploy.md)
#   Commit 3: chore(web,api): allow localhost:3001 + dev SSR   (index.ts CORS 部分 + security.test.ts + next.config.mjs)
#   Commit 4: feat(api): vitest worker pool config             (vitest.config.ts のみ)
#   Commit 5: feat: agent command center / memory / task source / discord watch (Group C 全部)
#   (任意) Commit 5 を C-1〜C-5 にさらに分割

set -e

assert_clean_index() {
  if ! git diff --cached --quiet; then
    echo "ERROR: index has staged changes. abort." >&2
    exit 1
  fi
}

verify_after_commit() {
  echo "--- verification after $1 ---"
  pnpm vitest run --reporter=dot
  echo "--- typecheck ---"
  pnpm --filter @sb/api typecheck
  pnpm --filter @sb/web typecheck
}

# ──────────────────────────────────────────────────────────
# Step 0: 状態確認
# ──────────────────────────────────────────────────────────
git status --short
git diff --stat HEAD
git stash list | head -3
git log --oneline -3

# ──────────────────────────────────────────────────────────
# Commit 1: ignore wrangler runtime logs
# ──────────────────────────────────────────────────────────
assert_clean_index

# .gitignore に "tmp/" を追記(apps/api 配下に置く)
# Yakon 承認後に echo を unquote して実行:
# echo 'tmp/' >> apps/api/.gitignore
# git add apps/api/.gitignore
# git status --short                  # 期待: M apps/api/.gitignore のみ
# git diff --cached --stat            # 期待: 1 file +1 行
# git commit -m "chore(api): ignore wrangler runtime logs"
# verify_after_commit "Commit 1"

# ──────────────────────────────────────────────────────────
# Commit 2: cron quota 統合
# ファイル分布:
#   - apps/api/src/index.ts        @428 hunk のみ(scheduled handler + isWeeklyDigestDue)
#   - apps/api/wrangler.toml       全 hunk
#   - docs/DEPLOY.md               全文(大幅再構成 = 1 commit に同梱)
#   - docs/deploy.md               全 hunk(@1 + @150 とも cron 関連)
# ──────────────────────────────────────────────────────────
assert_clean_index

# git add -p apps/api/src/index.ts
#   y = @185 hunk(CORS)→ NO で skip
#   y = @428 hunk(cron / isWeeklyDigestDue)→ YES でステージ
# git add apps/api/wrangler.toml docs/DEPLOY.md docs/deploy.md
# git diff --cached --stat
#   期待: 4 files changed, index.ts 23+/10-, wrangler.toml 4+/4-, DEPLOY.md 318+/42-, deploy.md 6+/2-
# git commit -m "fix(api): consolidate cron triggers under account quota
#
# Cloudflare の cron quota 制約に対応するため、旧 3 cron を 1 cron に集約し
# isWeeklyDigestDue で weekly digest cadence をコード側でゲーティング。
# 副次効果として、旧ハンドラで sendWeeklyDigest が毎時 :00/:30 の 2 回発火していた
# バグも同時に解消。"
# verify_after_commit "Commit 2"

# ──────────────────────────────────────────────────────────
# Commit 3: CORS 3001 + dev SSR
# ファイル分布:
#   - apps/api/src/index.ts        @185 hunk のみ(CORS)
#   - apps/api/src/tests/security.test.ts  +7 行(127.0.0.1:3001 test 1 件)
#   - apps/web/next.config.mjs     全 hunk(dev SSR)
# ──────────────────────────────────────────────────────────
assert_clean_index

# git add -p apps/api/src/index.ts
#   y = @185 hunk(CORS)→ YES
# git add apps/api/src/tests/security.test.ts apps/web/next.config.mjs
# git diff --cached --stat
#   期待: 3 files changed, index.ts 7+/1-, security.test.ts 7+, next.config.mjs 3+/1-
# git commit -m "chore(web,api): allow localhost:3001 + dev-mode SSR"
# verify_after_commit "Commit 3"

# ──────────────────────────────────────────────────────────
# Commit 4: vitest worker pool config
# ──────────────────────────────────────────────────────────
assert_clean_index

# git add apps/api/vitest.config.ts
# git diff --cached --stat
#   期待: 1 file +22/-3
# git commit -m "feat(api): enable vitest worker pool for cloudflare:test imports
#
# RUN_WORKER_POOL_TESTS=1 で @cloudflare/vitest-pool-workers を使うようになり、
# 既存の security.test.ts / webhooks.test.ts / ai.test.ts などが初めて実行可能になる。
# **直後に既存テストの環境セットアップ不足が顕在化する**(186 fail)ため、
# 修正は別 PR で対応する(qa-reports/sb-prep-kit-2026-05-17.md §2-§3 参照)。"
# verify_after_commit "Commit 4"

# ──────────────────────────────────────────────────────────
# Commit 5: Agent Command Center / Memory Source / Discord Watch / Task Source Links
# ファイル分布:
#   API:
#     - apps/api/src/db/migrations/0054_discord_watch_sources.sql  (新規)
#     - apps/api/src/routes/agent-command.ts
#     - apps/api/src/routes/agent-command.test.ts
#     - apps/api/src/routes/tasks.ts                                (/by-source 追加)
#     - apps/api/src/schemas.ts                                     (task source schemas)
#   Web:
#     - apps/web/src/app/agents/command-center/page.tsx
#     - apps/web/src/app/agents/command-center/view-model.ts
#     - apps/web/src/app/agents/command-center/view-model.test.ts
#     - apps/web/src/app/agents/command-center/command-center.module.css  (新規)
#     - apps/web/src/app/agents/page.tsx                            (Shiro Daily ナビ)
#     - apps/web/src/app/mission-control/scene.tsx                  (+4 cards)
#     - apps/web/src/components/top-nav.tsx
#   Docs:
#     - docs/AGENT_MEMORY_PLATFORM_MVP.md
#     - docs/MEMORY_SOURCE_REFRESH_RUNBOOK.md                       (新規)
# ──────────────────────────────────────────────────────────
assert_clean_index

# git add apps/api/src/db/migrations/0054_discord_watch_sources.sql \
#         apps/api/src/routes/agent-command.ts \
#         apps/api/src/routes/agent-command.test.ts \
#         apps/api/src/routes/tasks.ts \
#         apps/api/src/schemas.ts \
#         apps/web/src/app/agents/command-center/page.tsx \
#         apps/web/src/app/agents/command-center/view-model.ts \
#         apps/web/src/app/agents/command-center/view-model.test.ts \
#         apps/web/src/app/agents/command-center/command-center.module.css \
#         apps/web/src/app/agents/page.tsx \
#         apps/web/src/app/mission-control/scene.tsx \
#         apps/web/src/components/top-nav.tsx \
#         docs/AGENT_MEMORY_PLATFORM_MVP.md \
#         docs/MEMORY_SOURCE_REFRESH_RUNBOOK.md
# git diff --cached --stat
# git commit -m "feat: agent command center + memory source + discord watch + task source links"
# verify_after_commit "Commit 5"

# ──────────────────────────────────────────────────────────
# (任意) Commit 5 を C-1〜C-5 に分割する場合は、上の git add を 5 回に分けて
# それぞれ commit する。粒度詳細は qa-reports/sb-prep-kit-2026-05-17.md §3 参照。
# ──────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────
# Final: 状態確認 → push(承認後のみ)
# ──────────────────────────────────────────────────────────
git status --short                # 期待: clean(? のみ残る場合あり)
git log --oneline -10
# git push origin shiro/phase2-perf-metrics   # ← Yakon 承認後

# stash の drop(WIP commit 確定後)
# git stash drop stash@{0}

echo "dry-run script end. このスクリプトは実行を伴わない設計です。"
