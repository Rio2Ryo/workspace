# threads-watcher 自動同期 — 安全設計案 (rev2 / 2026-05-17)

**改訂理由**: アーキテクチャが「state.json + ローカル PNG」から「SQLite DB(正本) + 監査テーブル + ローカル PNG(副産物)」に進化したため、自動同期の判定ロジックを DB 基準に書き換え。**Yakon 承認が下りるまで実行しない**。

## 0. 現状アーキテクチャ把握(rev2 起点)

| 構成要素 | 役割 | 備考 |
|---|---|---|
| `threads_watcher.db` (SQLite) | **正本** | `posts(BLOB)` + `checks(監査)` テーブル。`.gitignore` 済 |
| `screenshots/<handle>/<post_id>__<ts>.png` | 副産物(目視確認用) | コピーが残るが正本ではない |
| `threads-watcher-status/state.json` | Vercel 配信用 sanitized snapshot | DB から `_write_web_snapshot_from_db` で書き出し |
| `threads-watcher-status/index.html` | Vercel 静的ページ | **新旧両フォーマット対応済**(`data.last_check ?? data.last_checked_at`, `data.posts ?? data.post_ids` のフォールバック) |
| `run-watcher.sh` | 常駐スクリプト | `THREADS_WATCHER_INTERVAL` 環境変数で間隔指定(デフォルト 60s) |
| `import_existing_screenshots.py` | 一回限りのバックフィル | 過去 PNG を DB に取り込む |
| `logs/` | watcher 実行ログ | `.gitignore` 済 |

→ 「daemon 化」と「sanitized snapshot 自動書き出し」は **既に実装済**。残ギャップは **`threads-watcher-status/state.json` を git に反映する自動化**だけ。

## 1. 選択肢比較(rev2 — DB アーキ前提)

| 案 | 仕組み | 利点 | リスク / コスト |
|---|---|---|---|
| **A. cron + git push 自動化** | watcher → DB 書込 → snapshot 書出 → `state.json` の md5 変化を検出 → commit + push | run-watcher.sh が既に常駐するので追加スクリプトは sync.sh 1 本 | 自動 push の常時化、誤検知時の push 連発リスク |
| **B. Vercel CLI 直接デプロイ** | snapshot 書出後に `vercel deploy --prod --yes` | git 履歴汚染なし | Hobby のデプロイ回数 100/月 制限、CLI 認証情報の常時保持 |
| **C. GitHub Actions スケジュール実行** | GH Actions が watcher を起動 + snapshot 反映 | 集約管理 | Playwright/Chromium を GH ランナーで毎回起動 = 分課金 |
| **D. 手動運用継続** | watcher は走らせるが state.json は手動 push | リスク最小 | 検出から本番反映までのラグが人手依存(現状) |
| **E. ハイブリッド** | A + ガード(差分ゼロ skip / 頻度上限 / 1 日 1 回まとめ push) | A の懸念を最小化 | ガード要件で実装やや増 |

### 白の推奨

**E(ハイブリッド)** が現実解。理由は rev1 と同じだが、**rev2 の DB アーキでは判定が一段堅牢になる**:

- 差分判定が `state.json` 内容比較ではなく **DB の `posts` テーブルの MAX(id) 増分**で行えるため、誤検知ゼロ
- 頻度ガードに `checks` 監査テーブルの `status` を併用 → 直近 N 回失敗中なら push を一時停止する自衛が可能

## 2. 推奨設計(rev2)

```
[launchd plist / cron: per 15-30 min — または run-watcher.sh と独立]
    └── sync.sh
        ├── 1. SQLite で MAX(posts.id) を取得 → 前回 push 時の値と比較
        ├── 2. 増分ゼロ: exit 0(commit/push しない)
        ├── 3. 直近 N (=3) 回の checks.status が全て 'ok' でないなら skip(障害ガード)
        ├── 4. 直近 commit が 60 分以内: skip(頻度上限ガード)
        ├── 5. git add threads-watcher-status/state.json
        ├── 6. git commit -m "chore(threads-watcher): snapshot @ <utc> (MAX_id=<N>, last_check.status=ok)"
        └── 7. (任意) git push origin <branch>   ← Yakon 承認次第で「自動」or「1日1回」or「手動」
```

**増分検知の SQL ヒント**:

```sql
-- last cursor を別ファイル(.sync_cursor)に保持
SELECT COALESCE(MAX(id), 0) AS current_max FROM posts;
-- current_max > stored_cursor のみ commit 候補
```

**障害ガードの SQL ヒント**:

```sql
SELECT status FROM checks ORDER BY id DESC LIMIT 3;
-- 結果に 'error' が混じっていたら sync を skip
```

## 3. ローカル dry-run 設計(rev2)

(承認後に実行する想定)

### dry-run-1: DB 増分判定が正しく機能するか

```bash
cd /Users/umi/.openclaw/workspace/projects/threads-watcher
sqlite3 threads_watcher.db "SELECT COALESCE(MAX(id), 0) FROM posts;"
# 期待: 整数。 watcher が新規投稿を save_post_screenshot した後で値が増えること
```

### dry-run-2: ガード単体検証(commit/push なし)

```bash
LAST_CURSOR=$(cat .sync_cursor 2>/dev/null || echo 0)
CURRENT=$(sqlite3 threads_watcher.db "SELECT COALESCE(MAX(id),0) FROM posts;")
[ "$CURRENT" -gt "$LAST_CURSOR" ] || { echo "no delta"; exit 0; }

RECENT_STATUS=$(sqlite3 threads_watcher.db "SELECT status FROM checks ORDER BY id DESC LIMIT 3;" | sort -u)
[ "$RECENT_STATUS" = "ok" ] || { echo "recent failures, skip"; exit 0; }

echo "would commit (delta=$((CURRENT - LAST_CURSOR)))"
```

### dry-run-3: snapshot 内容の sanity 確認

```bash
# 公開 snapshot に BLOB / local_path が混入していないこと
python3 -c "import json; d=json.load(open('threads-watcher-status/state.json')); 
for p in d.get('posts', []):
    assert 'screenshot_png' not in p, 'BLOB leaked'
    assert 'local_path' not in p, 'local path leaked'
print('snapshot sanitized OK')"
```

## 4. 承認が必要な最小項目(Yakon 向け、rev2)

1. **自動 git commit の可否**(履歴汚染許容範囲)
2. **自動 git push の頻度**(リアルタイム / 1 時間 / 1 日 1 回 / 手動のみ)
3. **launchd / cron 起動間隔**(推奨 15-30 分。`run-watcher.sh` の 60 秒ループとは独立)
4. **commit 著者表示**(`Co-Authored-By: Claude` 維持 or bot コミット分離)
5. **障害時挙動**(本書 §2 の障害ガードで自動 skip するか、警告通知を出すか)
6. **監視ハンドル拡張時の承認フロー**(@hal.lifedesign 以外を追加する際の事前同意手順)
7. **DB 肥大時の運用**(現在 7MB、月 +X MB ペース → ローテーション要否)
8. **`_write_web_snapshot`(旧関数)の取り扱い**(watcher.py 64-78 行に残存。dead code として削除提案するか保持か)

## 5. ロールバック(threads-watcher 専用、rev2 で新設)

| ケース | 手順 | 白権限 |
|---|---|---|
| watcher が暴走的に DB へ書き込んでいる | `pkill -f "python watcher.py"` または launchctl unload | ○(プロセス停止のみ) |
| 直近 commit を取消したい | `git reset --soft HEAD~1`(push 前のみ) | ○ |
| 自動 commit を全 revert | `git revert <sha>..<sha>` | ○(push は禁止) |
| DB を前バックアップに戻したい | `cp threads_watcher.db.bak threads_watcher.db` | ○(バックアップが手元にあれば) |
| DB の特定 handle 分だけ消したい | `sqlite3 threads_watcher.db "DELETE FROM posts WHERE handle = ?"` | **△ Yakon 承認**(データ消去のため) |
| DB 全削除 | `rm threads_watcher.db*` | **× Yakon 承認** |
| Vercel 前デプロイへロールバック | ダッシュボードから Promote | **× Yakon 承認** |

**バックアップ方針(推奨)**:

```bash
# 日次バックアップ(launchd 別エントリで)
cp threads_watcher.db backups/threads_watcher-$(date +%Y%m%d).db
# 7 世代保持で 50MB 弱(現在サイズ x 7)
```

## 6. 白がこの先ローカルで進められる準備

- [ ] `sync.sh` の draft(本書 §2 の擬似コードを完全実装、launchd plist 同梱)— 承認後即動かせる形
- [ ] DB スキーマの test candidates 文書化(別ファイル: `qa-tests-db-py-2026-05-17.md` に整理予定)
- [ ] バックアップ launchd plist の draft
- [ ] DB レコード数の監視スクリプト(肥大化アラート)— 承認なしで dry-run 可能

**ただし上記も 1 つずつ Yakon 確認しながら進める方針**(自律で書きためすぎない)。

---

## Appendix A. rev1 からの変更点

| rev1(撤回) | rev2(現行) |
|---|---|
| 差分判定: `state.json` の md5 / `git diff --quiet` | DB の `MAX(posts.id)` カーソル |
| daemon: 「launchd で `watcher.py --once`」 | `run-watcher.sh`(既存)が常駐、sync.sh は別レイヤ |
| 障害ガードなし | `checks.status` 直近 3 件監視 |
| ロールバック表(threads-watcher 用)未掲載 | §5 で新設 |
| Yakon 承認項目 6 件 | 8 件(DB 肥大運用 + 旧関数取扱を追加) |
