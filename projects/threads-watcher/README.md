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

## 既知の制約 / TODO

- Threads の DOM 構造変更でセレクタが壊れる可能性。フォールバックとして anchor href の正規表現抽出を併用
- Cloudflare/ボット検知に当たる可能性。低頻度運用と `user-agent` の現実的設定で回避を試みる
- 収集スクリプト本体は Vercel に乗らない(Playwright + Chromium のサイズ・実行時間・永続ストレージ制約のため)。ローカル / Mac mini での cron / launchd 実行が前提
