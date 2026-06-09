# mail-manager

Gmail メール管理 + AI 要約 + 全文検索ツール

```
Gmail取得 → SQLite保存 → Gemini要約 → キーワード検索
```

---

## 機能（MVP）

- Gmail のスレッドを取得（受信・送信）
- SQLite に保存（重複スキップ対応）
- Gemini でメール単体 / スレッド全体を日本語要約
- 添付ファイル名の記録
- SQLite FTS5 による全文検索（件名・本文・要約）
- CLI で検索・閲覧

---

## セットアップ

### 1. 依存パッケージのインストール

```bash
cd projects/mail-manager
pip install -r requirements.txt
```

### 2. Google Cloud Console での設定

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. プロジェクトを作成（または既存を選択）
3. **APIとサービス → ライブラリ** から **Gmail API** を有効化
4. **APIとサービス → 認証情報** → **OAuth 2.0 クライアント ID** を作成
   - アプリの種類: **デスクトップアプリ**
5. ダウンロードした JSON を `data/credentials.json` として保存

```
projects/mail-manager/
└── data/
    └── credentials.json   ← ここに配置
```

### 3. Gemini API キーの設定

```bash
export GEMINI_API_KEY=your_gemini_api_key_here
```

永続化する場合は `~/.zshrc` または `~/.bashrc` に追記してください。

---

## 使い方

### メールの同期

```bash
# 最大100スレッドを取得・要約
python main.py sync

# 件数を指定
python main.py sync --max 50

# 要約をスキップして高速取り込みのみ
python main.py sync --max 200 --no-summary
```

初回実行時にブラウザが開き、Gmail の OAuth 認証が求められます。
認証後は `data/token.json` にトークンが保存され、次回以降は自動更新されます。

### キーワード検索

```bash
python main.py search "暗号資産"
python main.py search "資格取得"
python main.py search "契約書"
```

### スレッド詳細表示

```bash
python main.py show <thread_id>
```

検索結果に表示される thread_id を使ってください。

### スレッド一覧

```bash
python main.py list
python main.py list --limit 50
```

一覧の `✓` マークは要約済み、`○` は未要約を示します。

### 未要約スレッドの一括要約

```bash
python main.py summarize-pending
```

`--no-summary` で取り込んだ後や、Gemini API エラーがあった場合に使用。

---

## ディレクトリ構成

```
mail-manager/
├── main.py                # CLI エントリポイント
├── requirements.txt
├── .gitignore
├── src/
│   ├── __init__.py
│   ├── db.py              # SQLite CRUD + FTS5 検索
│   ├── gmail_client.py    # Gmail API 取得
│   ├── summarizer.py      # Gemini 要約
│   └── sync.py            # 取得→保存→要約 パイプライン
├── data/                  # ← .gitignore 対象
│   ├── credentials.json   # Google OAuth クライアント ID（要配置）
│   ├── token.json         # 自動生成
│   └── mail.db            # SQLite DB（自動生成）
└── docs/
    └── requirements.md    # 要件定義書
```

---

## データモデル

| テーブル | 概要 |
|---------|------|
| `threads` | スレッド単位（件名・参加者・要約・テーマ・重要度） |
| `messages` | 個別メール（本文・要約・送受信フラグ） |
| `attachments` | 添付ファイル情報（名前・種類・サイズ） |
| `messages_fts` | FTS5 全文検索インデックス（自動同期） |

---

## Phase 2 予定機能

- [ ] Notion DB への自動書き出し
- [ ] テーマ・重要度の AI 自動付与
- [ ] 添付ファイル自動保存ルール
- [ ] 差分同期（新着のみ）
- [ ] Web UI

---

## 注意事項

- 読み取り専用スコープ（`gmail.readonly`）のみ使用。メール送信・削除は行いません。
- `data/` 配下はすべて `.gitignore` に含まれています。credentials, token は絶対にコミットしないでください。
- Gemini API の利用料金はご自身の Google Cloud アカウントに発生します。
