# threads-watcher

指定した Threads アカウントの新規投稿を定期的に検出し、投稿ページのスクリーンショットをローカル保存する最小 PoC。

- 初期テスト対象: `https://www.threads.com/@hal.lifedesign`
- ログイン・投稿操作なし(公開プロフィールの観測のみ)
- 外部サービス・有料 API 依存なし(Playwright + ローカル Chromium のみ)

## アーキテクチャ

| 観点 | 採用 | 理由 |
|---|---|---|
| 取得方式 | Playwright (Python) + Chromium ヘッドレス | Threads は SPA で初期 HTML に投稿情報がほぼ無い。スクショもこのツールで完結するため依存が最小 |
| 状態保存 | `state.json` に投稿 ID / URL を記録 | 重複保存防止 |
| スクショ保存 | `screenshots/<post_id>__<timestamp>.png` | フルページ |
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
```

## 出力

- `state.json`: `{"<handle>": {"seen_post_ids": [...], "last_checked_at": "..."}}`
- `screenshots/<handle>/<post_id>__<YYYYMMDDTHHMMSSZ>.png`

## 既知の制約 / TODO

- Threads の DOM 構造変更でセレクタが壊れる可能性。フォールバックとして anchor href の正規表現抽出を併用
- Cloudflare/ボット検知に当たる可能性。低頻度運用と `user-agent` の現実的設定で回避を試みる
- Vercel など serverless へのデプロイは Playwright + Chromium のサイズ・実行時間制約あり(別途検討)
