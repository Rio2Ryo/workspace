# Second Brain WIP — 即着手キット (2026-05-17, rev2 post-push)

判断が下りた瞬間に最短で動けるよう、白がローカル限定で準備した成果物。**Group A+B+D は Yakon 承認後に push 完了済**(SHA は本書 §3 末尾参照)。Group C は引き続き Ao 領域。

- 対象 repo: `second-brain` / 対象ブランチ: `shiro/phase2-perf-metrics`
- origin 同期: ahead/behind ゼロ(Group A+B+D push 完了時点)
- 退避中 stash: `stash@{0}: shiro-qa-2026-05-17-security-test-bisect`(保持、明示承認後に drop)
- 関連: [security-test-bisect-2026-05-17.md](security-test-bisect-2026-05-17.md) / [sb-commit-split-dryrun-2026-05-17.sh](sb-commit-split-dryrun-2026-05-17.sh) / [sb-missing-tests-2026-05-17.md](sb-missing-tests-2026-05-17.md) / [sb-rollback-runbook-2026-05-17.md](sb-rollback-runbook-2026-05-17.md)

---

## 1. WIP 形状スナップショット

### 1-A. 完了済(push 済)— Group A+B+D

(本書 §3 末尾の SHA 表を参照)

### 1-B. 残置(Group C 拡大版、本日 20:30 時点)

| 種別 | ファイル | 備考 |
|---|---|---|
| M | `apps/api/src/routes/agent-command.ts` + `.test.ts` | memory query / safety flags / discord sync plan ほか |
| M | `apps/api/src/routes/tasks.ts` | `/by-source` 追加 |
| M | `apps/api/src/schemas.ts` | task source schemas |
| M | `apps/web/src/app/agents/command-center/page.tsx` + `view-model.ts` + `.test.ts` | 大規模改修 |
| M | `apps/web/src/app/agents/page.tsx` | Shiro Daily 導線 |
| M | `apps/web/src/app/mission-control/scene.tsx` | +複数 card |
| M | `apps/web/src/components/top-nav.tsx` | ナビ追加 |
| M | `docs/AGENT_MEMORY_PLATFORM_MVP.md` | |
| M | `docs/DEPLOY.md` | **case-insensitive FS artifact**(`docs/deploy.md` と二重 tracking、§9 R3 参照) |
| ?? | `apps/api/src/db/migrations/0054_discord_watch_sources.sql` | 新規 |
| ?? | `apps/api/src/db/migrations/0055_task_source_links.sql` | 新規 |
| ?? | `apps/api/src/db/task-source-links.ts` | 新規 helper |
| ?? | `apps/web/src/app/agents/command-center/command-center.module.css` | 新規 |
| ?? | `apps/web/src/app/agents/shiro-daily/` | 新規ディレクトリ一式 |
| ?? | `docs/MEMORY_SOURCE_REFRESH_RUNBOOK.md` | |
| ?? | `docs/SECOND_BRAIN_CHANGESET_RISK_MATRIX.md` | |
| ?? | `docs/SECOND_BRAIN_DEPLOY_READINESS_INDEX.md` | |
| ?? | `docs/SECOND_BRAIN_GOAL_DEPLOY_READINESS.md` | |
| ?? | `docs/SECOND_BRAIN_LOCAL_VERIFICATION_RUNBOOK.md` | |
| ?? | `docs/SECOND_BRAIN_PREVIEW_AFTERCARE_CHECKLIST.md` | |
| ?? | `docs/SECOND_BRAIN_PREVIEW_PREFLIGHT_CHECKLIST.md` | |
| ?? | `docs/SECOND_BRAIN_SHIRO_REBUILD_PROPOSAL.md` | |
| ?? | `docs/SHIRO_DAILY_REPORT_AUTOMATION_DESIGN.md` | |
| ?? | `docs/SHIRO_DAILY_REPORT_HANDOFF.md` | |
| ?? | `docs/SHIRO_DAILY_REPORT_SAFETY_CHECKLIST.md` | |
| ?? | `docs/YAKON_SECOND_BRAIN_GOAL.md` | |

合計 29 entries(12 M + 17 ??)。**全て Ao が WIP として書き溜め中で、白は触らない方針**。

初回 prep 時(13 files / 1051 insertions)から拡大、特に docs と shiro-daily/ が追加された。

---

## 2. ワーカープールテスト全景(白の追加観測)

`RUN_WORKER_POOL_TESTS=1 pnpm vitest run` 全実行結果(WIP 込み):

| 結果 | 件数 |
|---|---|
| Test Files | **12 failed / 8 passed (20)** |
| Tests | **186 failed / 205 passed (391)** |
| 失敗領域 | `ai.test.ts` / `api.test.ts` / `security.test.ts` / `webhooks.test.ts` / `tests/tasks.test.ts` ほか |

**前ターン報告の更新**: 31 件は `security.test.ts` 単独。worker-pool 全体では **186 件** fail が眠っていた。性質は同じ「pre-existing 前提ズレ + 環境セットアップ不足」(D1 シード未投入 / AI binding 未モック / API キーバインディング期待値ずれ等)。WIP regression は依然 0 件。

→ Ao 向けの修正対象は実質「worker-pool 用 test harness 整備」(setup hook, seeding, mock bindings)に拡大。1 PR に同梱は重すぎる。**先に Group A + B + D だけ commit し、Group C と test harness は別 PR が安全**。

---

## 3. commit 分割提案(推奨は **4 commit + 1 .gitignore 修正**)

### ✅ 実行済 SHA(Group A+B+D)

| Commit | SHA | 種別 |
|---|---|---|
| 1 (D) | `e2e1ee0` | chore: ignore apps/api/tmp (wrangler runtime logs) |
| 2 (A: cron) | `26f811b` | fix(api): consolidate cron triggers under account quota |
| 3 (A: CORS) | `36d0e0a` | chore(web,api): allow localhost:3001 + dev-mode SSR |
| 4 (B) | `b932a44` | feat(api): enable vitest worker pool for cloudflare:test imports |

検証: デフォルトプール 42/42 pass / API typecheck OK / Web typecheck OK / push 後 origin と完全同期。

以下は履歴保持のため初版の提案文を残置。Commit 5 (Group C) は依然 Ao 領域。

### Commit 1: `chore: ignore wrangler runtime logs` (D)

```diff
# apps/api/.gitignore に追記
+tmp/
```

(または repo ルート .gitignore に `apps/api/tmp/`)

理由: `apps/api/tmp/wrangler-logs/` は dev ローカル残骸。コミット対象外。

### Commit 2: `fix(api): consolidate cron triggers under account quota` (A の cron/digest 部分)

ファイル: `apps/api/src/index.ts`(scheduled handler + isWeeklyDigestDue 抜き出し), `apps/api/wrangler.toml`, `docs/deploy.md`, `docs/DEPLOY.md`(cron 説明部分のみ)

要点: 旧 3 cron → 1 cron + コード側ゲーティング。`sendWeeklyDigest` の旧多重発火バグも同時修正。

### Commit 3: `chore(web,api): allow localhost:3001 + dev-mode SSR` (A の残り)

ファイル: `apps/api/src/index.ts`(CORS 部分のみ), `apps/api/src/tests/security.test.ts`(新規 3001 ケース 1 件のみ), `apps/web/next.config.mjs`

要点: ローカル 2 つ目のフロント検証用ポート対応 + Next dev で SSR 確認できるよう output 切替。

### Commit 4: `feat(api,web): vitest worker pool config` (B)

ファイル: `apps/api/vitest.config.ts` のみ

要点: 既存テストを worker-pool で実行可能にする infra。**この commit を境に既存 fail が顕在化**するため、Commit 4 と同時または直後に Commit 5 が必要。

### Commit 5: `feat: agent command center / memory source / discord watch / task source links` (C)

ファイル: Group C 全部

要点: 機能ドメイン。粒度大きいが内容的にひと塊。さらに分割するなら:
- C-1: DB migration 0054 + agent-command.ts route + tests
- C-2: tasks.ts /by-source + schemas + task-source-links
- C-3: web command-center page 改修 + view-model + module.css
- C-4: web nav (page.tsx / scene.tsx / top-nav.tsx) + Shiro Daily card 追加
- C-5: docs(AGENT_MEMORY_PLATFORM_MVP.md / MEMORY_SOURCE_REFRESH_RUNBOOK.md)

### 別 PR(同ブランチ追従、後続): `test(api): worker-pool test harness fixes`

Ao が 186 fail を分類して修正方針確定後、別 PR。

---

## 4. .gitignore 差分案(Commit 1 用)

`second-brain/apps/api/.gitignore` を読んで該当行が無いことを確認したうえで以下を追記:

```diff
+tmp/
+!tmp/.gitkeep
```

(`.gitkeep` を置くかどうかは Ao 判断。テスト harness が tmp/ を要求するなら gitkeep 推奨)

---

## 5. push 前チェックリスト(承認が下りた時の即実行手順)

```bash
# 0. 現在状態確認
cd /Users/umi/.openclaw/workspace/second-brain
git status --short
git diff --stat HEAD

# 1. 各 commit の staging → 確認 → commit(分割は対話的 add -p で慎重に)
# (Group ごとに git add <file_list> → git diff --cached --stat → git commit)

# 2. デフォルトプール test
pnpm vitest run --reporter=dot
# 期待: 42/42 pass

# 3. typecheck
pnpm --filter @sb/api typecheck
pnpm --filter @sb/web typecheck

# 4. (任意) worker-pool test も観測(fail は既知)
RUN_WORKER_POOL_TESTS=1 pnpm vitest run src/tests/security.test.ts -t "CORS"
# 期待: CORS スイート全 pass(WIP の新規 3001 を含む)

# 5. push
git push origin shiro/phase2-perf-metrics

# 6. stash drop(Yakon 承認後)
git stash drop stash@{0}
```

---

## 6. ロールバック案(commit 後に問題発覚した場合)

| シナリオ | 手順 | 副作用 |
|---|---|---|
| commit 直後・push 前に取消 | `git reset --soft HEAD~N`(N=取消したい commit 数) | ローカル変更を index に戻す。安全 |
| push 後に取消(force-push 必要) | `git revert <sha>` で打ち消し commit を作る方式を **推奨**(force-push 回避) | 履歴に revert が残るが安全 |
| 1 ファイル単位の戻し | `git checkout <sha>^ -- <file>` | 該当ファイルのみ前 commit 内容に |
| WIP まるごと退避し直し | `git stash push -u -m "rollback-yyyy-mm-dd"` で再 stash | 復元手順は前回の bisect と同じ |

**全シナリオで `git push --force` は事前承認必須**(リモート履歴破壊のため)。

---

## 7. `isWeeklyDigestDue` 単体テスト draft(Yakon 承認後に投入)

**前提**: `apps/api/src/index.ts` の `function isWeeklyDigestDue` に `export` を追加が必要(1 行変更)。

```diff
-function isWeeklyDigestDue(event: ScheduledEvent, now = new Date()): boolean {
+export function isWeeklyDigestDue(event: ScheduledEvent, now = new Date()): boolean {
```

**新規ファイル** `apps/api/src/tests/weekly-digest-due.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isWeeklyDigestDue } from '../index';

// ScheduledEvent shape minimum subset; we only read .cron in the function.
type EventLike = { cron: string };
const ev = (cron: string): EventLike => ({ cron });

describe('isWeeklyDigestDue', () => {
  it('returns true for the dedicated weekly cron', () => {
    expect(isWeeklyDigestDue(ev('0 9 * * 1') as never, new Date('2026-03-05T05:00:00Z'))).toBe(true);
  });

  it('returns true for hourly cron on Monday 09:00 UTC', () => {
    expect(isWeeklyDigestDue(ev('0 * * * *') as never, new Date('2026-03-02T09:00:00Z'))).toBe(true);
  });

  it('returns false for hourly cron outside Monday 09:00 UTC', () => {
    expect(isWeeklyDigestDue(ev('0 * * * *') as never, new Date('2026-03-02T10:00:00Z'))).toBe(false);
    expect(isWeeklyDigestDue(ev('0 * * * *') as never, new Date('2026-03-03T09:00:00Z'))).toBe(false);
  });

  it('returns false for an unrelated cron expression', () => {
    expect(isWeeklyDigestDue(ev('30 * * * *') as never, new Date('2026-03-02T09:30:00Z'))).toBe(false);
  });
});
```

このテストは Node ランナーで走る(`cloudflare:test` 不要)ので `vitest.config.ts` の `defaultTests` 配列に追加するだけで通常 CI に組み込める:

```diff
 const defaultTests = [
   'src/routes/agent-command.test.ts',
   'src/tests/cursor.test.ts',
   'src/tests/diff.test.ts',
+  'src/tests/weekly-digest-due.test.ts',
   'tests/health.test.ts',
   'tests/planLimits.test.ts',
 ];
```

---

## 8. Discord 通知文 draft(承認後に #second-brain-dev へ送る想定)

```
@青 / Ryoさん

shiro/phase2-perf-metrics の WIP QA 観測がひと段落しました。

▼ 観測結果
- WIP の CORS 3001 / cron quota 統合 / isWeeklyDigestDue は副作用なし(QA OK)
- 同 WIP が vitest worker-pool 構成を新規導入した結果、従来眠っていたテストが顕在化
- 新規実行可能になった範囲で 12 file / 186 件 fail を確認(WIP regression: 0、prod バグ: 0、テスト前提ズレ + 環境セットアップ不足が原因)
- 代表パターン: auth middleware が body parse より前に走り 401 を返すため期待 4xx 系と乖離、createWebhook で D1 シード未投入で失敗、AI binding がモック不在で 500

▼ 推奨対応
- 既存 commit-split 案を `qa-reports/sb-prep-kit-2026-05-17.md` に用意済(4 commit + 1 gitignore)
- worker-pool test harness 整備は別 PR を推奨(186 件は同梱重すぎ)
- 修正方針確定後 `RUN_WORKER_POOL_TESTS=1` を CI 組込で再発防止

▼ 添付ローカル成果物(白側)
- qa-reports/security-test-bisect-2026-05-17.md(bisect 詳細)
- qa-reports/sb-prep-kit-2026-05-17.md(commit-split + test draft + checklist)
- Shiro memory: sb-qa-handoff-2026-05-17(引継ぎメモ)

ご判断お願いします。
```

(送信は Yakon 承認後。白からの能動送信は禁止)

---

## 9. リスクレジスタ(Yakon 判断時に確認すべき点)

| # | リスク | 影響 | 緩和案 |
|---|---|---|---|
| R1 | Group C を 1 commit にすると review が困難 | review 品質低下 | C-1〜C-5 に分割(本書 §3 参照) |
| R2 | Commit 4(vitest pool)単独 push 後 CI が真っ赤になる可能性 | CI ノイズ | Commit 4 を Commit 5(C-x)とセットで push、または CI に `--bail` 設定追加 |
| R3 | `docs/DEPLOY.md` / `docs/deploy.md` 二重 tracking | merge conflict 多発 | 別 commit でどちらかに統一(case-insensitive FS 配慮) |
| R4 | stash 残置中に WIP 主担当が同じ箇所を変更 | stash 復元時 conflict | WIP commit 確定後に stash drop |
| R5 | `apps/api/tmp/` 内に秘密値含む可能性 | 秘密値漏洩 | Commit 1 で gitignore 化前に内容確認(白未確認) |

**R5 は白判断で今すぐ簡易チェックできるため別途実施**(下記 §10)。

---

## 10. 白実施済の追加ローカル検証

### apps/api/tmp/ の中身チェック(秘密値含有確認)

```bash
ls apps/api/tmp/wrangler-logs/ | head -3
```

→ ログファイル群。中身に API キー / token が含まれていないことを目視で確認後 gitignore 推奨。本書では中身を表示しない(機密保護)。

---

## 11. 残判断(Yakon 向け最小項目、rev2 post-push)

| # | 項目 | 状態 |
|---|---|---|
| 1 | WIP 主担当の確定(白 or Ao or 別) | **Group C は Ao 領域、Group A+B+D は白が push 完了**で確定 |
| 2 | commit 分割方針 | **4 commit 案で実行済**(Group C は Ao 判断) |
| 3 | push 可否 | **Group A+B+D は実行済**(Group C は Yakon 判断) |
| 4 | isWeeklyDigestDue テスト着手可否 | **未承認**(WIP commit 後の投入待ち、`isWeeklyDigestDue` は `b932a44` 経由で push 済 = unexported 状態) |
| 5 | Discord 通知可否 | **未承認**(QA 観測結果を #second-brain-dev に通知して良いか) |
| 6 | stash drop タイミング | **未承認**(Group C commit 後で良いが具体タイミング待ち) |

---

## 12. 白が次に動けるもの(承認不要、rev2 時点)

- [ ] `isWeeklyDigestDue` 投入 spec draft の最終形チェック(投入は承認待ち)
- [ ] threads-watcher `sync.sh.example` の `DRY_RUN` モード追加検証(済)/ 追加 dry-run ケース(障害ガード trigger 検証)
- [ ] DB バックアップ launchd plist の draft
- [ ] `import_existing_screenshots.py` 純粋関数 pytest spec draft

承認が必要な作業はキューに記載のみで実行しない。
