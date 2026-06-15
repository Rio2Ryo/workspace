# 会社設立エージェント構成案

## 目的
MCP / Computer Use / Browser automation を組み合わせて、日本法人設立の準備〜入力補助〜設立後初期設定までを半自動化する。

重要な提出・署名・支払い・外部送信は必ず人間承認を挟む。

## 推奨構成

### 1. 判断・GUI操作
- Codex Computer Use / OpenAI系ブラウザ操作
- 用途:
  - freee会社設立 / マネーフォワード会社設立の画面確認
  - UI変更への対応
  - 入力欄の意味理解
  - エラー・警告文の確認

### 2. 再現性あるブラウザ操作
- Playwright MCP / Browser MCP
- 用途:
  - フォーム入力
  - ページ遷移
  - スクリーンショット保存
  - 入力済み内容の検証
  - PoC自動テスト

### 3. 書類・情報管理
- Google Drive MCP
- Gmail MCP
- 用途:
  - ヒアリングシート保存
  - 定款/事業目的/登記情報ドラフト管理
  - freee/MFからの通知メール確認
  - 添付ファイル・PDFの整理

### 4. 設立支援サービス
- freee会社設立 または マネーフォワード会社設立
- 用途:
  - 設立情報入力
  - 定款・登記書類作成支援
  - 設立後の会計連携

### 5. 人間承認ポイント
必ずRyoさん確認:
- 会社名確定
- 事業目的確定
- 資本金・出資者・役員構成確定
- 定款内容確定
- 電子署名
- 支払い
- 登記申請/提出
- 外部専門家への送信
- freee/MF上の最終送信

## フロー

1. ヒアリング
   - 会社名候補
   - 株式会社/合同会社
   - 本店所在地
   - 事業目的
   - 資本金
   - 出資者
   - 役員
   - 決算月
   - 設立希望日

2. 入力データ生成
   - JSON/YAMLで構造化
   - Google Driveに保存
   - 確認用Markdownを生成

3. サービス選定
   - freee会社設立
   - マネーフォワード会社設立
   - 必要に応じて司法書士確認

4. ブラウザ入力補助
   - Browser MCP/Playwright MCPで入力
   - Codex Computer Useで画面変化や警告を判断
   - 各ページでスクリーンショット保存

5. 人間承認
   - 提出前サマリー生成
   - Ryoさんが確認
   - 署名/支払い/送信は人間操作

6. 設立後処理
   - freee会計/MFクラウド会計の初期設定
   - 勘定科目・銀行口座・請求書テンプレート
   - Gmail/Driveに法人関連フォルダ作成

## データモデル案

```yaml
company:
  legal_type: "株式会社 or 合同会社"
  name: ""
  name_kana: ""
  address: ""
  capital_jpy: 0
  fiscal_year_end_month: 0
  incorporation_target_date: "YYYY-MM-DD"

business:
  purposes:
    - ""
  main_activity: ""

founders:
  - name: ""
    address: ""
    investment_jpy: 0

executives:
  - name: ""
    role: "代表取締役 / 取締役 / 代表社員"
    address: ""

approvals:
  company_name: false
  business_purposes: false
  articles: false
  final_submission: false
```

## PoC範囲

最初のPoCでは外部提出しない。

- 入力情報のヒアリング
- 構造化データ作成
- freee/MFの入力画面まで遷移
- 下書き入力まで
- スクリーンショット取得
- 提出直前で停止

## 決定事項

- 第一対象: freee会社設立

## 未決事項

- 株式会社 / 合同会社のどちらを想定するか
- Google Drive/Gmail MCPの利用アカウント
- Codex Computer Useを実行するMac環境
- Playwright MCP / Browser MCPのホスト
