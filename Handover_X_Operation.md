# X運用（@ai_agent_lab_jp）引き継ぎ資料

## 1. アカウント現状
- **ユーザー名:** @ai_agent_lab_jp
- **表示名:** しろくま｜OpenClaw Lab 🐻‍❄️（※未更新）
- **投稿済みポスト:**
  1. 第1弾 (Telegram音声修正): `2022999949844291606`
  2. 第2弾 (Tips系/thinkingDefault): `2023001949998821572`

## 2. 運用ツール・環境
- **API認証:** 環境変数（`TWITTER_CONSUMER_KEY`等）に設定済み。
- **スクリプト:**
  - `post_x.py`: 投稿用（冪等性ガード付き）
  - `delete_x.py`: 削除用（`python3 delete_x.py <tweet_id>`）
  - `check_x_fixed.py`: 直近の投稿確認用
- **プロフィール更新案（準備済み）:**
  - **表示名:** OpenClaw Lab｜AIエージェント速報 🦞
  - **バイオ:** 自律型AIエージェント基盤「OpenClaw」の専門ラボ。最新ニュース・構築Tips・実運用ログを24時間体制で発信。🚀 実装：マルチチャネル連携 / 自律タスク実行 / ブラウザ操作 #OpenClaw #AIAgent

## 3. 投稿テンプレート
- **速報系:** 新機能やGitHubの更新内容を要約。
- **解説系:** 自律化フローを絵文字付きの縦フローで視覚化。
- **Tips系:** `openclaw.json` の設定など、即真似できる小ネタ。

## 4. 監視ソース
- **GitHub:** `openclaw/openclaw` (Commits/Releases)
- **Official Discord:** #showcase チャンネル
- **その他:** ClawHub, ProductHunt, 開発者Xアカウント等
