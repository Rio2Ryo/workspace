# mail-manager 引き継ぎ調査レポート

> 作成: 2026-06-08 / 更新: 2026-06-09 (Shiro/OpenClaw 自律エージェント)
> スレッド: ontrust-gohan › email-manager引き継ぎ調査

---

## TL;DR

このプロジェクトはローカル Python CLI ツール。サーバー / Cloudflare / Docker なし。  
**残ブロッカー: credentials.json 未配置のみ。依存・ディスク・Gemini は解消済。**

---

## リポジトリ概要

| 項目 | 状態 |
|------|------|
| 調査日 | 2026-06-08 / 更新 2026-06-09 |
| 種別 | ローカル CLI (Python 3) |
| サーバー/デプロイ | なし（Cloudflare / Vercel / Docker 設定ファイルなし） |
| データベース | SQLite (`data/mail.db` — 自動生成) |
| 外部 API | Gmail API (読み取り専用) + Gemini API (要約) |
| `data/` ディレクトリ | **空** — credentials.json のみ不足 |
| Python 依存 | **インストール済** ✅ |
| GEMINI_API_KEY | **設定済** ✅ |
| ディスク空き容量 | **3.2 GB** (78%) ✅ |
| Gemini SDK | `google-genai` 1.47.0（新 SDK に移行済） ✅ |
| FTS5 tokenizer | trigram（日本語対応）に変更済 ✅ |
| テストスイート | **48/48 PASSED**（tests/ ディレクトリ新設） ✅ |
| git ブランチ | `shiro/cycle-tracker-app`（origin より4コミット先行、mail-manager ファイル変更あり） |

---

## ブロッカー一覧

### BLOCKER-1: `data/credentials.json` が存在しない（必須 — 未解消）

Gmail OAuth2 クライアント認証情報ファイル。ないと `python main.py sync` が即エラー。

**入手手順:**
1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト選択/作成
2. APIとサービス → ライブラリ → **Gmail API** を有効化
3. APIとサービス → 認証情報 → **OAuth 2.0 クライアント ID** を作成
   - アプリの種類: **デスクトップアプリ**
4. ダウンロードした JSON を `projects/mail-manager/data/credentials.json` として配置

### BLOCKER-2: `GEMINI_API_KEY` 環境変数 — **解消済** ✅

キーは設定済み。

### BLOCKER-3: Python 依存パッケージ — **解消済** ✅

2026-06-09 に pip install 完了。`google-generativeai`（非推奨）→ `google-genai` 1.47.0 に移行済。

### BLOCKER-4: ディスク空き容量 — **解消済** ✅

2026-06-09 時点 3.2 GB (78%) 空き。問題なし。

---

## 次の安全なステップ（順序厳守）

### Step 1: 依存インストール — **完了** ✅ (2026-06-09)

### Step 2: credentials.json を配置（BLOCKER-1 解消後 — **ユーザー作業必須**）
```bash
# Google Cloud Console からダウンロードしたファイルを配置
cp ~/Downloads/client_secret_*.json data/credentials.json
```

### Step 3: Gemini API キー設定（BLOCKER-2 解消後）
```bash
export GEMINI_API_KEY=your_actual_key
```

### Step 4: 最小テスト（要約スキップ、Gmail のみ確認）
```bash
python main.py sync --max 5 --no-summary
```
- 初回実行でブラウザが開き Gmail OAuth 認証フローが走る
- 認証完了後 `data/token.json` が自動生成される
- `data/mail.db` が作られ5スレッド取り込まれれば成功

### Step 5: 動作確認コマンド
```bash
python main.py list --limit 10   # 取り込まれたスレッドを確認
python main.py search "テスト"   # FTS5 検索テスト
```

### Step 6: Gemini 要約テスト（Step 3 完了後）
```bash
python main.py sync --max 5      # 要約あり、少量でコスト確認
```

### Step 7: git push（mail-manager とは無関係の4コミット）
```bash
git push origin shiro/cycle-tracker-app
```
- 現在の4コミット差分は top3-favorites / interaugh のテストコード
- mail-manager 自体の変更はゼロ
- push 自体は安全だが、mail-manager の準備完了とは別の話

---

## Cloudflare / GitHub Token について

このプロジェクトに Cloudflare 関連ファイルは**一切なし**（render.yaml / vercel.json / wrangler.toml なし）。  
「Cloudflare トークン」はタスク記述の汎用フォーマットから来たもので、**mail-manager には不要**。

GitHub Token も特に不要。通常の `git push` は SSH/HTTPS 認証で動作する。

---

## セキュリティ確認済み事項

- `data/` は `.gitignore` に含まれており、credentials.json / token.json / mail.db は絶対にコミットされない
- Gmail API は `gmail.readonly` スコープのみ — メール送信・削除は不可
- Gemini API キーはファイルではなく環境変数で渡す設計（コード内に固定値なし）

---

## Yakon 確認が必要なアクション

現時点では **確認不要のアクション（Step 1〜6）のみ**。いずれもローカル・リードオンリー・コスト最小。

push（Step 7）は mail-manager 変更なしで安全だが、4コミット先行している他プロジェクト変更の push の可否を確認してから実行を推奨。
