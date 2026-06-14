# コード理解ベースAI E2E QA 運用テンプレート

## 目的
AIにソースコードを読ませて仕様を抽出し、その仕様を画面操作で検証し、重要ケースをPlaywright等の固定E2Eへ落とす。

## 基本方針
- AIは「探索・仕様抽出・テスト案作成・失敗原因分析」を担当
- Playwright等のテストコードは「再現性あるCI検証」を担当
- AIの自然言語判断だけを最終合否にしない
- 仕様は必ず根拠ファイル/該当箇所付きで抽出する

## 禁止事項
- 本番環境での破壊的操作
- 課金、購入、外部送信、メール/Discord/Slack投稿
- 実ユーザー/個人情報を含むデータの利用
- 根拠なしの仕様推測
- `waitForTimeout` 依存のflakyテスト生成

## 実行フロー

### 1. 対象範囲の特定
- 対象機能
- 対象ページ/ルート
- 関連PR/diff/issue
- staging/local URL
- テストユーザー/seed有無

### 2. ソースコード読解
AIが以下を確認する。
- routing
- page/component
- form validation
- API/server actions
- DB schema/model
- auth/permission
- feature flag
- error handling
- external dependency

### 3. 仕様抽出
出力形式:

| 仕様ID | 仕様 | 種別 | 根拠 | UIで確認可能か | 備考 |
|---|---|---|---|---|---|

種別:
- 正常系
- 異常系
- 境界値
- 権限別
- 状態遷移
- 外部依存

### 4. E2Eケース化
出力形式:

| Case ID | 前提 | 操作 | 期待結果 | 優先度 | 自動化可否 | 危険操作 |
|---|---|---|---|---|---|---|

優先度:
- P0: リリースブロッカー
- P1: 主要導線
- P2: 重要だが代替可
- P3: 網羅/回帰

### 5. 画面操作で検証
確認観点:
- 期待通りの表示/遷移
- validation message
- 権限による表示差分
- console error
- network error
- responsive崩れ
- loading/empty/error state

証跡:
- screenshot
- trace
- console log
- network log
- 再現手順

### 6. 失敗分類
- 実装バグ
- 仕様不明/仕様不足
- テストデータ不足
- テスト期待値ミス
- flaky/待機不足
- 外部依存不安定
- UI文言変更

### 7. 固定テスト化
Playwright化する条件:
- 主要導線/P0/P1
- 再現性がある
- seed/mockが用意できる
- CIで安全に実行できる

Playwright方針:
- `getByRole`, `getByLabel`, `getByText`, `data-testid` 優先
- Web-first assertion使用
- 外部APIはmock
- traceはCI失敗時に保存
- テストごとに独立した状態を作る

## 最終レポート形式

```md
# AI E2E QA Report

## 対象
- Repo:
- Branch/Commit:
- Feature:
- URL:

## 仕様抽出サマリー
- 抽出仕様数:
- 根拠不足:

## 実行テスト
- Passed:
- Failed:
- Blocked:

## 重要な発見
1.
2.
3.

## 失敗詳細
| Case | 分類 | 内容 | 再現手順 | 証跡 | 推奨対応 |

## Playwright固定化候補
| Case | 理由 | 優先度 |

## 未解決/確認待ち
- 
```
