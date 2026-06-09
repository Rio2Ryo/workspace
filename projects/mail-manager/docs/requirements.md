# Mail Manager 要件定義

> 更新日: 2026-03-26

---

## 背景・目的

メール文化が強い組織において、1テーマあたり10通前後のやり取りが行われる。
過去の返信（特に調査・回答系）が属人化・散逸しており、スタッフが参照できない状態。
Gmail上のメール/スレッドをAIで自動要約・蓄積し、「Notionの議事録DB」に近い形で検索・参照できるようにする。

---

## ユーザーストーリー

| # | As a | I want to | So that |
|---|------|-----------|---------|
| U1 | オーナー | Gmailのスレッドを自動取り込みしたい | 手作業でコピーせずに済む |
| U2 | オーナー | 各スレッドをGeminiで要約したい | 内容を素早く把握できる |
| U3 | オーナー | 「暗号資産」「資格取得」等のキーワードで過去メールを検索したい | 同種の問い合わせに素早く対応できる |
| U4 | スタッフ | 過去の返信事例を閲覧したい | 初めての問い合わせでも自力で回答できる |
| U5 | オーナー | 添付ファイル名を一覧で確認したい | 受け取った資料を把握できる |
| U6 | オーナー | 添付ファイルをルール（送信者・件名等）で自動保存したい | ファイル整理の手間を省ける |
| U7 | オーナー | 重要度・テーマ・ラベルを付与したい | Notion議事録DBと同様に構造化できる |

---

## MVP（フェーズ1）スコープ

**目標: ローカルで動く縦切りパイプライン**

```
Gmail取得 → SQLite保存 → Gemini要約 → テキスト検索
```

| 機能 | 含む |
|------|------|
| Gmail OAuth 認証 | ✅ |
| メール一覧取得（受信・送信） | ✅ |
| スレッド単位でグルーピング | ✅ |
| 件名/本文/差出人/日時をDBに保存 | ✅ |
| Geminiでメール単体要約 | ✅ |
| Geminiでスレッド全体要約 | ✅ |
| 添付ファイル名の記録 | ✅ |
| SQLite全文検索（FTS5） | ✅ |
| CLIで検索・閲覧 | ✅ |
| Webフロント | ❌ |
| 添付ファイルの自動保存 | ❌ |
| Notion連携 | ❌ |
| 自動ラベリング（AI） | ❌ |

---

## フェーズ2 スコープ

| 機能 | 優先度 |
|------|--------|
| Notion DBへの自動書き出し | 高 |
| テーマ・重要度の自動付与（Gemini） | 高 |
| 添付ファイル自動保存ルール（送信者/件名ベース） | 中 |
| Web UI（検索・閲覧） | 中 |
| 差分同期（新着のみ取り込み） | 高 |
| スタッフ向け読み取り専用ビュー | 低 |
| Slack/Discord通知 | 低 |

---

## 主要ユースケース詳細

### UC-1: 初回インポート
1. ユーザーが `python main.py sync --max 200` を実行
2. Gmail OAuth認証（ブラウザ）
3. 受信・送信メールをスレッド単位で取得
4. SQLiteに保存（重複スキップ）
5. Geminiで各スレッドを要約・保存

### UC-2: キーワード検索
1. ユーザーが `python main.py search "暗号資産"` を実行
2. SQLite FTS5で全文検索
3. スレッド単位でヒット件数・要約・日付を表示

### UC-3: スレッド詳細表示
1. ユーザーが `python main.py show <thread_id>` を実行
2. スレッド要約・各メール一覧・添付ファイル名を表示

---

## データモデル（MVP）

```sql
threads(
  thread_id TEXT PRIMARY KEY,
  subject TEXT,
  participants TEXT,       -- JSON array
  first_date TEXT,
  last_date TEXT,
  message_count INTEGER,
  summary TEXT,            -- Gemini生成
  theme TEXT,              -- 将来: AI自動付与
  importance INTEGER,      -- 1-5, 将来
  labels TEXT,             -- JSON array
  synced_at TEXT
)

messages(
  message_id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES threads,
  subject TEXT,
  sender TEXT,
  recipients TEXT,         -- JSON array
  date TEXT,
  body_text TEXT,
  body_html TEXT,
  summary TEXT,            -- Gemini生成
  is_sent INTEGER,         -- 0=受信, 1=送信
  synced_at TEXT
)

attachments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT REFERENCES messages,
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  saved_path TEXT          -- 将来: 自動保存後のパス
)

-- FTS5 仮想テーブル
messages_fts(
  message_id,
  subject,
  body_text,
  summary
)
```

---

## 非機能要件

| 項目 | 要件 |
|------|------|
| セキュリティ | OAuth token はローカルファイルに保存。credentials は .gitignore |
| データ保存先 | ローカル SQLite（`data/mail.db`） |
| Gemini API呼び出し | スレッド要約は初回のみ。再実行時はスキップ |
| レート制限 | Gmail API: 250 quota units/sec。バッチ処理で制御 |
| 外部送信 | 一切行わない（読み取り専用） |

---

## リスク・未確定事項

| # | リスク/未確定 | 対応方針 |
|---|--------------|---------|
| R1 | Gmail APIのscopeは読み取り専用（`gmail.readonly`）で足りるか | MVP は readonly で実装 |
| R2 | Gemini API利用コスト | 長文スレッドは要約前にトークン数確認・上限設定 |
| R3 | 取り込み件数が多い場合のAPI quota | `--max` オプションで件数制限 |
| R4 | HTML本文のパース精度 | html2text or BeautifulSoup でフォールバック |
| R5 | Notion連携のDB IDは確認済みだが、フィールド対応未定義 | Phase2で整理 |
| R6 | スタッフへのアクセス権管理未定 | Phase2で整理 |

---

## 確認が必要な事項（オーナーへ）

1. 取り込み対象: 受信のみ？送信済みも含む？→ **仮設: 両方**
2. 何ヶ月分を初回インポートするか？
3. Gemini API keyはすでに取得済み？
4. Notionの議事録DBのIDを共有いただけるか（Phase2用）
5. 添付ファイルの保存先（ローカルフォルダ？Google Drive？）
