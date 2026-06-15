# Status

*Who's working on what. Self-updated by agents.*

---

## Active Work

| Agent | Task | Started | Status |
|-------|------|---------|--------|
| shiro | **cycle-tracker-app** — lint ✅ / test 34/34 ✅ / build ✅。local `0522e96`(feat: profile label customization, 2026-06-15) が remote より 24 commits 先行・未 push・未 deploy。承認パケット準備済み。 | 2026-06-15 | 🔴 Blocked: Yakon push+deploy 承認待ち |
| shiro | **yosuke-matsuura-profile** — build ✅ lint ✅ / remote ff6916f = local HEAD (push 済み確認) / Vercel project prj_79FCkPc5rnW780zlzzk0OBu0yB98 存在。ワークフロー完了。 | 2026-06-15 | ✅ Done |
| shiro | **second-brain** — deploy 完了 ✅ (2026-06-15): CF Workers `7f831188` + CF Pages `f3597f17`. smoke test 全6チェック PASS (`47b86c9`). | 2026-06-15 | ✅ Done |
| shiro | **RAKUI** (Real Estate Investment Decision App) — Yakon A OK (2026-06-15) → [DONE] 付与承認。bundle.js 全パターン確認済・Node.js トレース全PASS・HEAD `d0bc983`。Discord thread `1510430269822468166` リネーム待ち（Sora or Yakon）。 | 2026-06-15 | ✅ Done (Discord rename 待ち) |
| shiro | **food-dx** — Yakon A OK → brew install postgresql@15 実施。DB接続確認・20テーブル作成・seed完了(Users:3/Companies:2/Products:5/Orders:3)。a11y-contract PASS / handoff-contract PASS。次: GitHub push + Vercel deploy 承認待ち | 2026-06-15 | 🟡 In Progress: GitHub push 承認待ち |
| hermes-jp | top3-favorites — バリデーションエラー時のalert文言とfocus復帰をE2Eで固定する | 2026-05-23 21:21:12 UTC | 🟡 In Progress |
| codex-goal | restaurant-sales-intel — 権限のあるシェルでcommit scriptを実行し、完了後に tasks/QUEUE.md の | 2026-05-24 00:06:24 UTC | 🟠 Re-prompted |
| codex-goal | restaurant-sales-intel — 権限のあるシェルで .preflight/commit-scripts/commit-all.sh を実行し、35件差分 | 2026-05-24 00:21:25 UTC | 🟠 Re-prompted |
| codex-goal | restaurant-sales-intel — 権限のあるシェルで .preflight/commit-scripts/commit-all.sh を実行し、4分割 | 2026-05-22 23:09:23 UTC | 🟠 Re-prompted |
| codex-goal | restaurant-sales-intel — 権限のあるシェルで4分割commitを実行し、tasks/QUEUE.md の restaurant-sales- | 2026-05-22 22:54:22 UTC | 🟠 Re-prompted |
| codex | Second Brain Web/API — git index 書き込み可能かつネットワーク有効な環境で deploy:remote-readiness を | 2026-05-24 00:11:24 UTC | 🟠 Re-prompted |
| claude | threads-watcher — ✶ Churning… (6m 32s · ↓ 20.6k tokens · thought for 53s) | 2026-05-23 11:25:27 UTC | 🟠 Re-prompted |
| claude | threads-watcher — ⏺ 次の監査対象 agents.ts のタスク/ドキュメント一覧ハンドラを点検します。 | 2026-05-22 16:08:45 UTC | 🟡 In Progress |
| codex | Second Brain Web/API — ネットワーク有効かつ git index 書き込み可能な環境で、artifact に出る直接コマン | 2026-05-23 22:46:19 UTC | 🟠 Re-prompted |
| codex | Second Brain Web/API — ネットワーク有効かつgit index書き込み可能な環境で pnpm deploy:remote-readiness | 2026-05-22 15:53:44 UTC | 🟡 In Progress |
| claude | ⏺ One regression — security.test.ts:148. Likely my prior doc-comments fix | 2026-05-22 15:33:43 UTC | 🟡 In Progress |
| codex | Second Brain Web/API — ネットワークとgit index権限がある環境で git ls-remote と git push --dry-run を | 2026-05-22 21:44:16 UTC | 🟠 Re-prompted |
| codex | Second Brain Web/API — Yakon 判断として、70 件削除になる manifest refresh を承認するか、欠落 patch 群 | 2026-05-22 21:49:16 UTC | 🟠 Re-prompted |
| claude | threads-watcher — ⏺ Checking whether doc_tags has other access patterns the new lint doesn't cover | 2026-05-23 11:50:29 UTC | 🟠 Re-prompted |
| codex | Second Brain Web/API — ネットワーク有効環境で git ls-remote / git push --dry-run を実行し、成功後に | 2026-05-22 20:54:11 UTC | 🟠 Re-prompted |
| claude | threads-watcher — ✶ Canoodling… (15m 1s · ↑ 508 tokens) | 2026-05-22 14:18:38 UTC | 🟡 In Progress |
| claude | 1. 次回クラッシュ時の logs/watcher.log 確認 — received signal ... SIGTERM | 2026-05-22 14:03:36 UTC | 🟡 In Progress |
| claude | threads-watcher — ● How is Claude doing this session? (optional) | 2026-05-22 13:58:36 UTC | 🟡 In Progress |
| claude | threads-watcher — ⏺ Disk OK, zero crash reports today, zero [watch] startup lines in the log | 2026-05-22 13:38:35 UTC | 🟡 In Progress |
| claude | threads-watcher — 1. live watcher の復旧（auto-restart-if-stale.sh / | 2026-05-22 13:33:34 UTC | 🟡 In Progress |
| claude | threads-watcher — ──────────────────────────────────────────────────────────────────────────────── | 2026-05-22 22:19:19 UTC | 🟠 Re-prompted |
| codex | Second Brain Web/API — ネットワーク有効環境で nextActions[0].runnableCommands を実行し、成功後に | 2026-05-24 07:26:48 UTC | 🟠 Re-prompted |
| top3-goose | top3-favorites — 診断品質の次段として、`canonicalizeItemsById` を使うAPI整合テスト群（CRUD/muta | 2026-05-22 12:53:32 UTC | 🟡 In Progress |
| top3-goose | top3-favorites — 診断の拡張として、**import preview中にキャンセルした場合も localStorage/API が | 2026-05-22 12:48:31 UTC | 🟡 In Progress |
| top3-goose | top3-favorites — import/export後のlocalStorage/API差分を検出する診断テストを追加する | 2026-05-22 12:43:31 UTC | 🟡 In Progress |
| codex-goal | restaurant-sales-intel — 権限のあるシェルで .preflight/commit-scripts/commit-all.sh を実行して4分割 | 2026-05-24 07:51:49 UTC | 🟠 Re-prompted |
| codex-goal | restaurant-sales-intel — 権限のあるシェルで .preflight/commit-scripts/commit-all.sh を再実行し、4 | 2026-05-24 08:06:50 UTC | 🟠 Re-prompted |
| top3-goose | top3-favorites — 追加→reload→API一致まで含むCRUD永続性E2Eを追加する | 2026-05-22 12:18:29 UTC | 🟡 In Progress |
| codex-goal | restaurant-sales-intel — 権限のあるシェルで .preflight/commit-scripts/commit-all.sh を実行し、4 commit | 2026-05-24 08:26:51 UTC | 🟠 Re-prompted |
| codex-goal | restaurant-sales-intel — 権限のある環境で .preflight/commit-scripts/commit-all.sh を実行し、4分割commit | 2026-05-22 18:13:56 UTC | 🟠 Re-prompted |
| codex | Second Brain Web/API — ネットワーク有効環境で --run-remote-check を再実行し、push/preview URL 作成へ | 2026-05-24 05:26:42 UTC | 🟠 Re-prompted |
| codex-goal | restaurant-sales-intel — preflightの安全ガードは強化済み。次は31件の差分をpreflightの4分割どおりに整理 | 2026-05-22 18:03:55 UTC | 🟠 Re-prompted |
| codex-goal | restaurant-sales-intel — git status --short のコピー/未マージなど、まだ未対応の複合ステータスを --plan- | 2026-05-22 17:48:54 UTC | 🟠 Re-prompted |
| claude | Second Brain — task_source_links同期APIのローカルdry-runとテストを追加する | 2026-05-22 11:18:24 UTC | 🟡 In Progress |
| claude | threads-watcher — stale heartbeat時だけDiscordへ異常報告する判定をunit testで固定する | 2026-05-22 11:11:03 UTC | 🟡 In Progress |
| hermes-jp | top3-favorites — キーボード操作だけで順位変更できるアクセシビリティE2Eを追加する | 2026-05-22 11:10:20 UTC | 🔴 Blocked: Hermes auth missing |
| codex | Second Brain Web/API — public GET workspace scope漏れの横展開監査を routes docs/tasks 以外にも自動チェック化する | 2026-05-22 17:28:52 UTC | 🟠 Re-prompted |
| codex-goal | restaurant-sales-intel — outreach draft生成のdry-run結果をCLIで確認できるsmoke scriptを追加する | 2026-05-18 08:51:22 UTC | 🟡 In Progress |
| daily-report-codex | daily-report-app — Second Brain同期失敗時の管理画面エラー表示をテストで固定する | 2026-05-18 08:46:21 UTC | ✅ Done (2026-06-15: admin-second-brain-sync-status.test.ts 12件 / role=alert aria-live確認済 / 461/461 pass) |
| codex-goal | restaurant-sales-intel — campaign一括生成後の重複防止をDB/store層テストで固定する | 2026-05-22 17:33:53 UTC | 🟠 Re-prompted |
| daily-report-codex | daily-report-app — APIフィルタテスト完了後、cursor pagination の境界条件テストを追加する | 2026-05-18 08:36:21 UTC | ✅ Done (2026-06-15: second-brain-cursor.test.ts / unsafe offset/oversized/invalid ID/MIN-MAX境界 全カバー / 461/461 pass) |
| codex | Second Brain Web/API — Shiro Daily実ブラウザE2Eの listen EPERM 回避用に preview port/host fallback を追加して実行可能化する | 2026-05-18 08:35:12 UTC | 🟡 In Progress |
| slide-tool-codex | slide-tool — 画像化された本文/特殊PowerPoint要素が検証から漏れる問題を検出するQAを追加する | 2026-05-18 06:21:18 UTC | 🟡 In Progress |
| top3-goose | top3-favorites — 4件入りJSONインポート後、UI一覧表示も3件に正規化されるE2Eを追加する | 2026-05-18 06:16:18 UTC | 🟡 In Progress |
| codex-goal | restaurant-sales-intel — draft生成済みleadをスキップし、未生成分からcampaign一括生成する改善を実装/テストする | 2026-05-18 06:11:18 UTC | 🟡 In Progress |
| daily-report-codex | daily-report-app — Second Brain APIの limit/cursor/status/updatedSince フィルタをHTTPハンドラ単位のテストで固める | 2026-05-18 06:06:18 UTC | ✅ Done (2026-06-15: second-brain-reports-route.test.ts / limit/cursor/status/updatedSince HTTP handler 全カバー / 461/461 pass) |
| codex | Second Brain Web/API — Shiro Daily専用Playwright specを追加し、cron controls disabled / write actionなし / activity fetchがShiro限定をブラウザレベルで検証する | 2026-05-18 06:05:51 UTC | 🟡 In Progress |
| | | | |

---

## Status Key

- 🟡 In Progress — Working on it
- 🔴 Blocked — Stuck, needs help
- 🟢 Done — Ready to move to Backlog

---

## Recently Completed

| Agent | Task | Completed |
|-------|------|-----------|
| daily-report-codex | daily-report-app — `POST /api/agent-command/daily-report/preview` 実装 + builder 11テスト追加 (472/472 pass, tsc clean, build ✅) | 2026-06-15 |
| daily-report-codex | daily-report-app — curl E2E: 投稿/管理/AI再生成/sent/Second Brain sync/preview 全通過。QA_CHECKLIST 14/18 ✅。commit 776008e。GitHub push + Vercel deploy 承認待ち | 2026-06-15 |

---

## Notes

- **Claim format:** Add your row when you pick up a task
- **Update often:** Change status as work progresses
- **Move when done:** Completed work → Backlog Done section
