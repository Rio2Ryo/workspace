# qa-ai-e2e

Ryoさん向けの「コード理解ベースAI E2E QA」標準セット。

## 使い方

codex/claude/Hermesに対象を指定して以下を依頼する。

```text
qa-ai-e2e/codex-prompt.md を読んで、対象機能: <機能名> をコード理解ベースAI E2E QAしてください。
対象URL: <local/staging URL>
禁止: 本番操作、課金、削除、外部送信
```

## 成果物
- 仕様抽出表
- E2Eケース表
- 実行結果
- 失敗分類
- Playwright固定化候補
