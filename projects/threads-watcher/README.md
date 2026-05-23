# threads-watcher

指定した Threads アカウントの新規投稿を定期的に検出し、投稿ページのスクリーンショットを **DB に即時保存** する最小 PoC。

- 初期テスト対象: `https://www.threads.com/@hal.lifedesign`
- ログイン・投稿操作なし(公開プロフィールの観測のみ)
- 外部サービス・有料 API 依存なし(Playwright + ローカル Chromium + SQLite のみ)
- 投稿削除に備え、投稿 ID だけでなくスクリーンショット PNG バイナリを `threads_watcher.db` に保存する

## アーキテクチャ

| 観点 | 採用 | 理由 |
|---|---|---|
| 取得方式 | Playwright (Python) + Chromium ヘッドレス | Threads は SPA で初期 HTML に投稿情報がほぼ無い。スクショもこのツールで完結するため依存が最小 |
| 正本DB | `threads_watcher.db` (SQLite) | 投稿削除後もスクショ実体を保持するため |
| 重複防止 | DB の `UNIQUE(handle, post_id)` | 同一投稿の二重保存防止 |
| スクショ保存 | DB の `posts.screenshot_png` BLOB | PNG バイナリを即時保存 |
| ローカルPNG | `screenshots/<handle>/<post_id>__<timestamp>.png` | 目視確認用の副産物。正本ではない |
| 実行 | `python watcher.py --once`(単発) / `--watch --interval 600`(ループ) | cron / launchd 連携は将来 |

## 倫理・運用条件

- 観測対象は **公開アカウントの公開投稿のみ**
- 低頻度(デフォルト 10 分間隔以上)
- ログイン・投稿・DM・通知などの能動操作は行わない
- 取得したスクショは個人観測目的のローカル保存のみ。再配布・公開は別途承認が必要

## セットアップ

```bash
cd projects/threads-watcher
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## 使い方

```bash
# 単発: 新規投稿を 1 回だけチェックしてスクショ
python watcher.py --once

# 別アカウントを指定
python watcher.py --once --handle @other.user

# 監視ループ(10 分間隔)
python watcher.py --watch --interval 600

# 運用用: 60秒間隔で常駐実行(現状の最短ポーリング)
# 新規投稿通知: デフォルトで @bmw_intokyo / @hal.lifedesign を専用Discordスレッドへ通知
THREADS_WATCHER_INTERVAL=60 ./run-watcher.sh
```

## 出力 / 保存データ

- `threads_watcher.db`: 正本。`posts` テーブルに以下を保存
  - `handle`
  - `post_id`
  - `post_url`
  - `first_seen_at`
  - `captured_at`
  - `screenshot_png` (PNG BLOB)
  - `screenshot_content_type`
  - `screenshot_size_bytes`
  - `screenshot_width` / `screenshot_height`
  - `local_path` (確認用PNGの相対パス)
- `screenshots/<handle>/<post_id>__<YYYYMMDDTHHMMSSZ>.png`: 目視確認用の副産物

## 静的ステータスページ (`threads-watcher-status/`)

`watcher.py` 実行ごとに DB から `threads-watcher-status/state.json` にサニタイズ済みスナップショットを書き出す。`threads-watcher-status/index.html` がクライアントサイドでそれを読み公開ステータスを表示する。保存済みスクショは DB の BLOB を正本とし、表示用コピーだけを `threads-watcher-status/screenshots/<handle>/...png` に書き出してサムネイル表示する。

公開ステータスにはスクショ BLOB やホストローカル path は含めない。代わりに browser-safe な `screenshot_path` と、`screenshot_size_bytes` / 画像サイズ / 保存時刻を出すことで、投稿URLと保存スクショを同じ画面で確認できる。

```bash
cd threads-watcher-status
vercel deploy --prod --yes   # 初回はプロジェクト作成プロンプトに沿う
```

## 環境変数 (operator runbook)

operator が launchd plist / シェル経由で tune できる環境変数の完全一覧。
**この表は `tests/test_env_vars_documented.py` によって sourceとの整合性が CI でテストされる** (code に新規 env を追加したらここにも書く、消した envはここからも消す)。

| 変数 | 既定値 | range | 用途 | 読み元 |
|---|---|---|---|---|
| `THREADS_WATCHER_INTERVAL` | `60` | sec (>0) | watcher の polling 間隔。`run-watcher.sh` 経由でのみ有効 | `run-watcher.sh` |
| `THREADS_WATCHER_BASELINE_LOOKBACK_DAYS` | (未設定 = 全期間) | integer (≥1) | `watcher.py --baseline-lookback-days` への注入。設定すると初回スキャンが過去 N 日に限定される | `run-watcher.sh` |
| `THREADS_WATCHER_NOTIFY_TARGET` | `channel:1505544095274238192` (run-watcher.sh 既定) / 空 (Python 側) | Discord target id | 新規投稿の通知先。空文字で通知無効 | `watcher.py`, `run-watcher.sh` |
| `THREADS_WATCHER_NOTIFY_HANDLES` | `@bmw_intokyo,@hal.lifedesign` (run-watcher.sh 既定) / 空 (Python 側) | カンマ区切り handle 列 | 通知対象 handle ホワイトリスト | `watcher.py`, `run-watcher.sh` |
| `THREADS_WATCHER_NOTIFY_CHANNEL` | `discord` | `discord` 等 | `tools/post_via_kin.py` への `--channel` 引数 | `watcher.py`, `run-watcher.sh` |
| `THREADS_WATCHER_HEARTBEAT_SEC` | `3600` (1h) | int, `(0, 86400]` | sticky regime の "still active" 再 emit 間隔。0 や > 24h は invalid (loud raise) | `sync_guards.py` |
| `THREADS_WATCHER_SIGNIFICANT_BUCKET_DELTA` | `0.2` | float, `[0.0, 1.0]` | warn-emit dedup 閾値 (バケット 0.1 単位の最小差)。range外は invalid | `sync_guards.py` |
| `THREADS_WATCHER_DISCORD_WEBHOOK_URL` | (未設定 = dry-run mode) | URL string | `discord_post.py` の Discord webhook 送信先。未設定 / 空で安全 dry-run | `discord_post.py` |
| `THREADS_WATCHER_RESTART_KILL_WAIT_SEC` | `1` | numeric (>0) | `restart-watcher.sh` の SIGTERM→SIGKILL grace per-iteration。fast incident-redeploy 時 `0.5` 等で短縮可能 | `restart-watcher.sh` |
| `THREADS_WATCHER_RESTART_LIVENESS_WAIT_SEC` | `3` | numeric (>0) | `restart-watcher.sh` の post-launch liveness check 待機。default で 3 秒 grace | `restart-watcher.sh` |

### よくある operator usage

```bash
# 静かなops: 1h heartbeat + 6h cooldown + warn 以上のみ通知
export THREADS_WATCHER_HEARTBEAT_SEC=21600    # 6h
export THREADS_WATCHER_SIGNIFICANT_BUCKET_DELTA=0.3   # boundary wobble 抑制強化

# Discord 通知有効化 (URL provisioned 後)
export THREADS_WATCHER_DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/.../...'
.venv/bin/python discord_post.py --min-severity warn --cooldown 21600
```

## オペレーター CLI ツール

operator-facing 一発実行用 Python CLI 群。**この表は `tests/test_env_vars_documented.py::TestCliToolsDocumented` で source との整合性が CI で保証される**。

| ツール | 一行説明 |
|---|---|
| `status.py` | state.json から severity / open incidents / mttr を render。Discord embed と byte-identical の 1-line summary 込み。`--watch` で tmux pane 常駐運用 (commit 32afd2b + 97f76ba) |
| `discord_payload.py` | state.json → Discord webhook embed dict builder。pure helper (no network)。Discord URL なしで dry-run JSON 出力可能 (commit cedc586) |
| `discord_post.py` | Discord webhook poster。`--dry-run` / `--min-severity warn` / `--cooldown 21600` / `--max-retries 1` で sticky-regime spam 制御 + 429 retry + URL token redaction (commits 785a75d, ce5ca04, 23ef7fc, 334c6cb) |
| `mttr.py` | sync.log の warn/recovered ペアから per-handle MTTR 統計。`--json` で machine-readable |
| `sticky_regime_diagnosis.py` | `--allow-sticky-partial-error-regime` enable の empirical decision tool。production DB に対し guard を両モード実行 + 比較で `SAFE_TO_ENABLE` / `NO_OP` / `INSUFFICIENT_DATA` verdict (commit e7b568d)。`--watch` で transition tracking (9f03dc9) |

### Discord webhook 自動 POST セットアップ (Yakon URL 待ち)

`com.shiro.threads-watcher-discord-post.plist.example` を ~/Library/
LaunchAgents/ に cp + URL provision 後 7 step:

```bash
# 1. Discord channel → Integrations → Webhooks → New Webhook → URL コピー
# 2. テンプレートを LaunchAgents へコピー
cp projects/threads-watcher/com.shiro.threads-watcher-discord-post.plist.example \
   ~/Library/LaunchAgents/com.shiro.threads-watcher-discord-post.plist

# 3. __SET_BY_OPERATOR__ を実 webhook URL で置換 (in-place edit)
# 4. install-time 3-layer 安全網 (preflight) で検証
bash qa-reports/preflight-plist.sh --check-only \
  ~/Library/LaunchAgents/com.shiro.threads-watcher-discord-post.plist
# → expected: "all invariants pass"
# → fails if: placeholder 残存 / URL shape 不正 / CLI flag (--min-severity / --cooldown / --max-retries) 値不正

# 5. cron 有効化
launchctl load -w ~/Library/LaunchAgents/com.shiro.threads-watcher-discord-post.plist

# 6. Verify
launchctl list | grep com.shiro.threads-watcher-discord-post
tail -f projects/threads-watcher/logs/discord-post.err.log

# 7. (Optional) sticky-regime flag の有効化判断
.venv/bin/python projects/threads-watcher/sticky_regime_diagnosis.py
# → 🟢 SAFE_TO_ENABLE なら sync.plist に --allow-sticky-partial-error-regime 追加
# → 🟡 NO_OP なら待機 (regime が pure sticky に固まるまで)
```

### 既デプロイ済: publish-if-delta sync cron

`com.shiro.threads-watcher-sync.plist` は既に ~/Library/LaunchAgents/ に
ライブで運用中 (`launchctl list | grep threads-watcher-sync` で確認可能)。
`com.shiro.threads-watcher-sync.plist.example` は legacy reference のみ
(operator 再インストール時の参照用、通常は触らない)。詳細は live plist
ファイルの先頭 docstring を参照。

### Sticky-regime transition alert cron (Yakon 承認待ち)

`com.shiro.threads-watcher-sticky-regime-alert.plist.example` を hourly
launchd 化すると、sticky-regime recommendation が flip した時のみ log
にエントリ追加 (silent-on-no-change cron-friendly behaviour、commit
de9369a)。

```bash
# 1. テンプレートを LaunchAgents へコピー (placeholder なし、no edit 不要)
cp projects/threads-watcher/com.shiro.threads-watcher-sticky-regime-alert.plist.example \
   ~/Library/LaunchAgents/com.shiro.threads-watcher-sticky-regime-alert.plist

# 2. preflight (XML + paths + WorkingDirectory)
bash qa-reports/preflight-plist.sh --check-only \
  ~/Library/LaunchAgents/com.shiro.threads-watcher-sticky-regime-alert.plist

# 3. cron 有効化
launchctl load -w ~/Library/LaunchAgents/com.shiro.threads-watcher-sticky-regime-alert.plist

# 4. Verify + triage workflow
tail -f projects/threads-watcher/logs/sticky-regime-alert.out.log
# → 通常 silent。transition 発生時のみ 1 line:
#   TRANSITION: WAIT → STRONG_ENABLE
#     rationale: Every evaluable window (...) reports SAFE_TO_ENABLE...
```

#### Optional: transition → Discord 自動通知 chain

`qa-reports/sticky-alert-to-discord.sh` で sticky-regime alerter
の transition と discord_post.py を chain 化、operator が log を tail
していなくても Discord channel に transition 通知が落ちる (commit 5122f4a)。

```bash
# Discord URL provision 後 (sticky-regime-alert.plist と択一推奨):
# com.shiro.threads-watcher-sticky-alert-discord.plist.example を hourly
# cron 化すると wrapper が transition 時のみ TRANSITION line + Discord
# embed post を fire する。両方 enable は同 transition で 2 重発火する
# ので避ける。

# テンプレートを LaunchAgents へコピー (placeholder なし、no edit 不要)
cp projects/threads-watcher/com.shiro.threads-watcher-sticky-alert-discord.plist.example \
   ~/Library/LaunchAgents/com.shiro.threads-watcher-sticky-alert-discord.plist

# preflight
bash qa-reports/preflight-plist.sh --check-only \
  ~/Library/LaunchAgents/com.shiro.threads-watcher-sticky-alert-discord.plist

# cron 有効化
launchctl load -w ~/Library/LaunchAgents/com.shiro.threads-watcher-sticky-alert-discord.plist

# Manual smoke test (--dry-run で discord_post の embed 出力のみ確認)
bash qa-reports/sticky-alert-to-discord.sh --dry-run
# → no-transition は silent、transition 時のみ:
#   1. TRANSITION line を stdout に emit
#   2. discord_post.py を --min-severity warn --max-retries 1 で invoke
#   3. operator は Discord channel で transition timing を catch
```

### DB hot-snapshot backup cron (Yakon 承認待ち)

`com.shiro.threads-watcher-backup.plist.example` で daily 03:00 JST に
`backup_db.py` を hot-safe SQLite snapshot 起動、`backups/` に世代管理
(`--keep 7` で 7 generations retain)。

```bash
# 1. テンプレートを LaunchAgents へコピー (placeholder なし、no edit 不要)
cp projects/threads-watcher/com.shiro.threads-watcher-backup.plist.example \
   ~/Library/LaunchAgents/com.shiro.threads-watcher-backup.plist

# 2. preflight
bash qa-reports/preflight-plist.sh --check-only \
  ~/Library/LaunchAgents/com.shiro.threads-watcher-backup.plist

# 3. cron 有効化
launchctl load -w ~/Library/LaunchAgents/com.shiro.threads-watcher-backup.plist

# 4. Verify (daily 03:00 fire 待ち、または手動 dry-run)
.venv/bin/python projects/threads-watcher/backup_db.py --dry-run --keep 7
```

## 既知の制約 / TODO

- Threads の DOM 構造変更でセレクタが壊れる可能性。フォールバックとして anchor href の正規表現抽出を併用
- Cloudflare/ボット検知に当たる可能性。低頻度運用と `user-agent` の現実的設定で回避を試みる
- 収集スクリプト本体は Vercel に乗らない(Playwright + Chromium のサイズ・実行時間・永続ストレージ制約のため)。ローカル / Mac mini での cron / launchd 実行が前提
