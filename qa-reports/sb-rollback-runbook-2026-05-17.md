# Second Brain WIP — ロールバック Runbook (2026-05-17)

各種変更を取り消す手順。**白判断で実行可能なのはローカル限定操作のみ**。本番 D1 / Vercel / GitHub への書き戻しは Yakon 承認領域。

## 0. 適用範囲

| レイヤ | 対象 | 白の権限 |
|---|---|---|
| ローカルワーキングツリー | git stash / soft reset / file 単位 checkout | ○(報告のうえ実行) |
| 退避中 stash | `stash@{0}: shiro-qa-2026-05-17-security-test-bisect` | drop は禁止(明示承認まで保持) |
| ローカル git 履歴 | commit 削除 / amend | 承認必須(履歴整形は方針判断) |
| origin 履歴 | push / force-push / branch 削除 | **禁止**(Yakon 承認) |
| Cloudflare D1 本番 | migration 反映 / DROP / ALTER | **禁止**(Yakon + Ao 承認) |
| Cloudflare Workers / Pages 本番 | デプロイ / 環境変数 | **禁止**(Yakon 承認) |
| Vercel 本番(threads-watcher-status) | Promote / Rollback | **禁止**(Yakon 承認) |

---

## 1. ワーキングツリーのロールバック(白実行可)

### 1-A. 全 WIP を退避してクリーンに戻したい

```bash
cd /Users/umi/.openclaw/workspace/second-brain
git status --short > /tmp/sb_wip_status_$(date +%Y%m%d_%H%M%S).txt
git stash push -u -m "shiro-rollback-$(date +%Y%m%d-%H%M%S)"
git stash list | head -3
```

→ stash 名は **必ず固有**(日時付き)、`-u` で untracked も保存、`-m` 必須。

### 1-B. 1 ファイルだけ baseline に戻したい

```bash
git diff HEAD -- <path>     # 戻したい差分が想定通りか確認
git checkout HEAD -- <path>  # baseline に強制上書き(WIP 消失!)
```

**注意**: 該当ファイルの WIP は失われる。事前に `git stash push -m "rescue-<path>"` で個別退避するか、`cp <path> <path>.bak` で素朴に控える。

### 1-C. 特定 hunk だけ戻したい

```bash
git checkout -p HEAD -- <path>   # 対話的に hunk 選択
```

各 hunk で `y` = 戻す / `n` = 残す / `q` = 中断。

---

## 2. ローカル commit のロールバック(白実行可、ただし push 前のみ)

### 2-A. 直前 commit を取消して変更は残したい(soft reset)

```bash
git log --oneline -3
git reset --soft HEAD~1
git status --short   # 変更は staged のまま残る
```

### 2-B. 直前 N 件の commit を取消して変更も破棄(危険、白は実行禁止)

```bash
git reset --hard HEAD~N   # ← 白は実行禁止。Yakon 承認領域
```

### 2-C. push 後の取消(force-push を回避するため revert を使う)

```bash
git revert <bad_sha>          # 打ち消し commit を作成(履歴に残る)
git revert <bad_sha1>..<bad_sha2>   # 範囲指定
# git push origin shiro/phase2-perf-metrics   # ← Yakon 承認後
```

**force-push 禁止**: `git push --force` / `--force-with-lease` は履歴破壊のため Yakon 承認が必要。

---

## 3. DB migration のロールバック

WIP は以下 2 件の新規 migration を追加している:

| ファイル | 種別 | 内容 |
|---|---|---|
| `apps/api/src/db/migrations/0054_discord_watch_sources.sql` | `CREATE TABLE` + 3 indexes | `discord_watch_sources` テーブル新規 |
| `apps/api/src/db/migrations/0055_task_source_links.sql` | `CREATE TABLE` + 3 indexes | `task_source_links` テーブル新規 |

### 3-A. ローカル D1 のロールバック(白実行可)

```bash
# まだ適用していないことを確認
cd apps/api
npx wrangler d1 execute <db_name> --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('discord_watch_sources','task_source_links');"

# 適用済の場合は DROP(ローカルのみ)
npx wrangler d1 execute <db_name> --local --command="DROP TABLE IF EXISTS discord_watch_sources;"
npx wrangler d1 execute <db_name> --local --command="DROP TABLE IF EXISTS task_source_links;"
```

(`<db_name>` は `wrangler.toml` の `[[d1_databases]]` セクション参照。秘密値ではないが念のため本書では空白)

### 3-B. 本番 D1 のロールバック(**Yakon + Ao 承認領域**)

**白は実行禁止**。手順案のみ:

1. Ao に「ロールバック必要」確認 → 影響範囲評価
2. 既存データのバックアップ(`wrangler d1 export <db_name> --output backup-$(date +%Y%m%d).sql --remote`)
3. テーブル DROP(他テーブルからの FK 参照を確認のうえ)
4. アプリ側のコードロールバック(commit revert)を **先に** 完了させる

→ 推奨フロー: 「コード revert → push → 動作確認 → 本番マイグレ DROP」の順。マイグレ DROP を先にやるとアプリが 500 を吐く。

### 3-C. migration ファイル自体の取り消し

新規ファイルは ローカルでは:
```bash
rm apps/api/src/db/migrations/0054_discord_watch_sources.sql
rm apps/api/src/db/migrations/0055_task_source_links.sql
```

(白は `rm` も禁止対象 → Yakon 承認後実行)

---

## 4. テストランナー設定のロールバック

WIP は `apps/api/vitest.config.ts` に `@cloudflare/vitest-pool-workers` を導入している(security.test.ts などが初めて実行可能になった原因)。

### 4-A. ローカルで pool 無効化して baseline に戻したい

```bash
git checkout HEAD -- apps/api/vitest.config.ts
```

これで 42/42 pass のデフォルト構成に戻る。worker-pool 系 186 fail は再び見えなくなる(=隠蔽)が、prod 影響なし。

### 4-B. WIP 自体は残しつつ `RUN_WORKER_POOL_TESTS=1` を CI から外したい

WIP の現状の `vitest.config.ts` は環境変数で切替なので、CI に `RUN_WORKER_POOL_TESTS=1` を **入れない限り**問題なし。Yakon 承認後は CI 設定追加する/しないの判断のみ。

---

## 5. Vercel / Cloudflare 本番のロールバック(白実行禁止、手順のみ)

### 5-A. threads-watcher-status (Vercel) を前 deployment に戻す

```
1. https://vercel.com/commongiftedtokyo/threads-watcher-status へアクセス
2. Deployments タブから 1 つ前の deployment を選択
3. 右上 [...] → Promote to Production
```

→ **Yakon 承認領域**。白はリンクのみ提示。

### 5-B. second-brain-api / second-brain-web (Cloudflare) のロールバック

- Workers: `wrangler deployments rollback <deployment-id>`
- Pages: ダッシュボードから過去 deployment を Rollback

→ **Yakon + Ao 承認領域**。

---

## 6. stash の取り扱い

現在保持中: `stash@{0}: shiro-qa-2026-05-17-security-test-bisect`

| 操作 | 白権限 | 備考 |
|---|---|---|
| `git stash list` | ○ | 確認のみ |
| `git stash show -p stash@{0}` | ○ | 内容表示 |
| `git stash apply stash@{0}` | ○(慎重) | WIP に hunk マージ。conflict 注意 |
| `git stash drop stash@{0}` | **禁止**(明示承認まで保持) | 復元不能 |
| `git stash clear` | **禁止** | 全 stash 消去 |

---

## 7. 失敗時の最小確認チェックリスト

ロールバック直後に必ず確認:

```bash
git status --short              # 期待通りの shape か
git log --oneline -5            # 期待した commit 範囲か
git stash list                  # stash が期待通り残っているか
pnpm vitest run --reporter=dot  # 42/42 pass か
pnpm --filter @sb/api typecheck # 型エラーゼロか
pnpm --filter @sb/web typecheck # 型エラーゼロか
```

1 つでも期待外なら、その場で `git status --short` をログ保存して報告。さらなる reset は禁止。

---

## 8. ロールバック前後の通知(Yakon 承認後のみ)

`#second-brain-dev` に投稿テンプレ:

```
@青

ロールバック実施報告:
- 対象: <ファイル/commit/migration>
- 理由: <regression / 設計変更 / 計測値悪化>
- 手順: <本 runbook §N>
- 影響: <prod / staging / local のみ>
- 戻り先: <sha / version>
- 検証: vitest <pass/fail>, typecheck <ok/ng>
```

(投稿は Yakon 承認後)
