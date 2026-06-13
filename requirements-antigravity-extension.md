# Antigravity 連携 Extension 要件定義書

**作成日**: 2026-02-23  
**作成者**: OpenClaw  
**対象**: 開発部隊（別AI）  

---

## 1. 背景・目的

### 1.1 現状
- **Antigravity**（Google製 AI-first IDE、VS Code fork）がローカルマシンで起動している
- **OpenClaw**（AIアシスタントプラットフォーム）が同一マシンまたは同一ネットワーク内で動作
- 両者間で**双方向通信**ができれば、AIの判断能力 × Antigravityの実装能力を組み合わせたワークフローが可能になる

### 1.2 目的
- OpenClaw エージェントから Antigravity を**プログラマティックに操作**できるようにする
- Antigravity の**実行結果・イベントをOpenClawに通知**できるようにする
- **汎用的な設計**で、異なる環境（OS、マシン構成）でも動作する基盤を構築する
- **最小構成で先行開発**し、後続で機能拡張可能なアーキテクチャとする

---

## 2. システム構成

### 2.1 基本構成

```
┌─────────────────────────────────────────────────────────────┐
│  OpenClaw エージェント（AIアシスタント）                        │
│  - HTTPクライアント（fetch/axios等）                           │
│  - 接続先: localhost:55678（デフォルト）                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP POST/GET
                       │ localhost:55678（デフォルト）
┌──────────────────────▼──────────────────────────────────────┐
│  Antigravity Extension（本開発対象）                           │
│  - HTTPサーバー（Node.js組み込み）                              │
│  - VS Code Extension Host API                                 │
│  - ポート: 55678（設定可能）                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ VS Code Extension API
┌──────────────────────▼──────────────────────────────────────┐
│  Antigravity（Google IDE、VS Code fork）                       │
│  - ファイル操作、エディタ操作、ターミナル、Agent View          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 環境想定

| 項目 | 想定範囲 |
|------|----------|
| **OS** | macOS, Windows, Linux（VS Code/Electronが動作する環境全般） |
| **Antigravity** | デスクトップアプリ版（VS Code fork） |
| **OpenClaw** | 同一マシン、または同一ネットワーク内の別マシン |
| **通信** | HTTP（localhost優先、設定次第でLAN内通信も可能） |

---

## 3. 機能要件（MVP）

### 3.1 OpenClaw → Antigravity（指令）

| ID | 機能 | 詳細 | 優先度 |
|----|------|------|--------|
| F-001 | ファイル作成 | 新規ファイル作成＋内容書き込み | Must |
| F-002 | ファイル読み取り | 既存ファイルの内容取得 | Must |
| F-003 | ファイル更新 | 既存ファイルの内容差し替え | Must |
| F-004 | ファイル削除 | ファイルの削除 | Must |
| F-005 | エディタ操作 | 特定ファイルをエディタで開く | Should |
| F-006 | ターミナル実行 | 統合ターミナルでコマンド実行 | Should |
| F-007 | Agent View指示 | 自然言語指示をAgent Viewに入力 | Could |

### 3.2 Antigravity → OpenClaw（通知）

| ID | 機能 | 詳細 | 優先度 |
|----|------|------|--------|
| N-001 | ファイル変更通知 | ワークスペース内ファイル変更を通知 | Should |
| N-002 | タスク完了通知 | 長時間実行タスクの完了通知 | Could |

### 3.3 制御・管理

| ID | 機能 | 詳細 | 優先度 |
|----|------|------|--------|
| C-001 | ヘルスチェック | 死活確認（ping/pong） | Must |
| C-002 | エラーレポート | 操作失敗時のエラー詳細を返却 | Must |
| C-003 | 設定変更 | ポート番号、通知先URL等の動的変更 | Should |

---

## 4. 技術要件

### 4.1 実装環境

| 項目 | 内容 |
|------|------|
| Extension Type | VS Code Extension（Standard） |
| 言語 | TypeScript（推奨）または JavaScript |
| Node.js API | `http` モジュール（軽量・依存少なさ優先） |
| VS Code API | `vscode` モジュール（ファイル、エディタ、ターミナル操作） |
| 最小VS Codeバージョン | 1.74.0（Antigravity互換性を確認） |

### 4.2 HTTP通信仕様

- **プロトコル**: HTTP（HTTPSはオプション、将来拡張）
- **デフォルトポート**: 55678
- **ポート設定**: `settings.json` で変更可能
- **Content-Type**: `application/json`
- **CORS**: 同一マシン内は無効、LAN通信時は設定で有効化可能

### 4.3 APIエンドポイント

#### 共通リクエスト形式
```json
POST /api/v1/command
{
  "action": "createFile",
  "params": {
    "path": "relative/or/absolute/path",
    "content": "file content"
  },
  "requestId": "uuid-v4"
}
```

#### 共通レスポンス形式
```json
{
  "status": "success" | "error",
  "data": { ... },
  "error": {
    "code": "ERROR_CODE",
    "message": "human readable message",
    "stack": "optional stack trace"
  },
  "requestId": "uuid-v4",
  "timestamp": "2026-02-23T10:00:00.000Z"
}
```

#### 対応アクション一覧

| Action | 説明 | パラメータ |
|--------|------|-----------|
| `ping` | ヘルスチェック | なし |
| `createFile` | ファイル作成 | `path`, `content` |
| `readFile` | ファイル読み取り | `path` |
| `writeFile` | ファイル書き込み | `path`, `content` |
| `deleteFile` | ファイル削除 | `path` |
| `openFile` | エディタで開く | `path`, `preview` (bool) |
| `executeTerminal` | ターミナル実行 | `command`, `cwd` |
| `getWorkspaceFolders` | ワークスペース一覧取得 | なし |

### 4.4 ファイル監視（オプション）

- `vscode.workspace.createFileSystemWatcher` を使用
- 変更検知時、設定されたWebhook URLへHTTP POST
- Webhook設定: `antigravityBridge.webhookUrl`

---

## 5. 設定項目

### 5.1 settings.json 設定

```json
{
  "antigravityBridge.enabled": true,
  "antigravityBridge.port": 55678,
  "antigravityBridge.host": "127.0.0.1",
  "antigravityBridge.webhookUrl": "http://localhost:8080/webhook",
  "antigravityBridge.logLevel": "info"
}
```

### 5.2 設定説明

| 設定キー | 型 | デフォルト | 説明 |
|----------|-----|-----------|------|
| `enabled` | boolean | true | Extensionの有効/無効 |
| `port` | number | 55678 | HTTPサーバーのポート |
| `host` | string | "127.0.0.1" | バインドするホスト（0.0.0.0でLAN公開も可能） |
| `webhookUrl` | string | null | 通知先URL（null時は通知無効） |
| `logLevel` | string | "info" | ログレベル（debug/info/warn/error） |

---

## 6. 非機能要件

### 6.1 互換性・移植性

- **クロスプラットフォーム**: macOS/Windows/Linux対応
- **VS Code互換**: 標準VS Code Extension APIのみ使用
- **Antigravity以外**: 標準VS Codeでも動作（機能制限あり）

### 6.2 エラーハンドリング

- **例外発生時**: スタックトレースを含めてクライアントに返却
- **タイムアウト**: 各操作30秒（ファイル操作）、60秒（ターミナル）
- **リトライ**: クライアント側で判断（Extension側は無責任）
- **ポート競合時**: 自動インクリメント or エラー返却（設定次第）

### 6.3 セキュリティ

- **デフォルト**: localhostのみ（127.0.0.1）
- **LAN通信**: 明示的にhostを0.0.0.0に設定した場合のみ許可
- **認証**: 第2フェーズで検討（現時点では不要）
- **ファイルアクセス**: Antigravityワークスペース内のみ

### 6.4 ログ・デバッグ

- VS Code出力チャンネル（Output > Antigravity Bridge）
- リクエスト/レスポンスのログ記録（debugレベル時）
- ログファイル出力（オプション）

---

## 7. 受け渡し情報

### 7.1 成果物

| 項目 | パス/場所 |
|------|-----------|
| 要件定義書 | 本ファイル |
| Extensionソースコード | `antigravity-bridge-extension/` ディレクトリ |
| ビルド済み .vsix | `antigravity-bridge-extension/` 内 |
| README.md | セットアップ手順、API仕様 |
| LICENSE | MIT License（推奨） |

### 7.2 動作確認環境（例）

- **マシン**: Mac mini（Apple Silicon）/ Windows PC / Linux Workstation
- **OS**: macOS latest / Windows 11 / Ubuntu 22.04
- **Antigravity**: /Applications/Antigravity.app または Program Files\Antigravity
- **OpenClaw**: 同一マシンまたは同一LAN内の別マシン

### 7.3 インストール手順（例）

```bash
# 1. リポジトリクローン
git clone [repository-url]
cd antigravity-bridge-extension

# 2. 依存インストール
npm install

# 3. ビルド
npm run compile

# 4. .vsixパッケージ作成
npx vsce package

# 5. Antigravity/VS Codeにインストール
# Extensions → ... → Install from VSIX → .vsixファイル選択
```

---

## 8. 制約・注意事項

### 8.1 既知の制約

- **Agent View操作**: VS Code Extension APIから直接操作するAPIが不明な場合、UI自動化（キー送信）が必要になる可能性あり
- **ターミナル出力取得**: 実行結果のリアルタイム取得には工夫が必要（ストリーミング対応を検討）
- **リモート開発**: SSH/WSL/コンテナ環境での動作は未検証

### 8.2 回避策（調査段階）

- ポート54147で動作しているAntigravity内部サーバーの調査（既有APIの再利用可能性）
- 標準APIで不足する場合は、キーボードショートカット送信による間接操作

---

## 9. スコープ外

以下は本要件定義には**含めない**（将来の拡張で検討）：

- リモートマシン通信（SSHトンネル等）
- HTTPS/認証・認可機能
- 複数ワークスペース同時管理
- GUI設定画面（コマンドパレット/設定JSONで対応）
- スケジュール管理
- 費用見積もり

---

## 10. 質問・確認事項（開発部隊へ）

以下、実装前に確認が必要な項目：

1. **ポート番号**: 55678で競合があれば、自動インクリメント or エラー返却のどちらが良いか
2. **HTTPライブラリ**: 組み込み `http` モジュールで十分か、軽量フレームワーク（koa等）が必要か
3. **通知方式**: OpenClawへの通知はWebhook方式で良いか、SSE（Server-Sent Events）等の検討が必要か
4. **TypeScript strictness**: strictモードで実装するか、柔軟性優先か
5. **テスト**: 単体テスト、E2Eテストの要否

---

**以上**
