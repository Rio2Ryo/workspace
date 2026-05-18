# top3-favorites 自動QAカバレッジ

最終更新: 2026-05-18

## 目的

手動QAチェックリストのうち、Playwright / API / 静的検査で自動確認できる項目を可視化する。
新しい E2E spec を追加したら、この文書にも対応ファイルを追記する。
`tests/qa-coverage-doc.test.mjs` が `tests/*.e2e.spec.ts` の記載漏れを検出する。

## 自動確認済み

### 起動・基本保存・検索・Top3順位繰り下げ

- `tests/top3.e2e.spec.ts`
- `tests/api-load-retry.e2e.spec.ts`

### 編集/削除/ミューテーションの状態整合性

- `tests/delete-clears-stale-tag-filter.e2e.spec.ts`
- `tests/delete-confirmation.e2e.spec.ts`
- `tests/delete-disabled-while-import-preview.e2e.spec.ts`
- `tests/delete-multi-tag-boundary.e2e.spec.ts`
- `tests/edit-cancel-clears-stale-notice.e2e.spec.ts`
- `tests/edit-clears-stale-tag-filter.e2e.spec.ts`
- `tests/edit-disabled-while-import-preview.e2e.spec.ts`
- `tests/edit-form-accessibility.e2e.spec.ts`
- `tests/edit-start-clears-pending-import-preview.e2e.spec.ts`
- `tests/edit-start-clears-stale-notice.e2e.spec.ts`
- `tests/edit-tag-move-syncs-registration-tag.e2e.spec.ts`
- `tests/mutation-error-clears-stale-success-notice.e2e.spec.ts`

### JSON import/export/validation/Top3正規化

- `tests/api-import-top3-normalization.e2e.spec.ts`
- `tests/api-import-validation.e2e.spec.ts`
- `tests/export-download-roundtrip.e2e.spec.ts`
- `tests/import-broken-json.e2e.spec.ts`
- `tests/import-confirmation-preview.e2e.spec.ts`
- `tests/import-excluded-names-deterministic-order.e2e.spec.ts`
- `tests/import-excluded-reasons-preview.e2e.spec.ts`
- `tests/import-export-rank-validation.e2e.spec.ts`
- `tests/import-export.e2e.spec.ts`
- `tests/import-fail-closed-matrix.e2e.spec.ts`
- `tests/import-impact-math-consistency.e2e.spec.ts`
- `tests/import-impact-summary.e2e.spec.ts`
- `tests/import-impact-tags-deterministic-order.e2e.spec.ts`
- `tests/import-invalid-after-valid-clears-preview.e2e.spec.ts`
- `tests/import-minimal-shape-defaults.e2e.spec.ts`
- `tests/import-preview-operation-guards-matrix.e2e.spec.ts`
- `tests/import-rank-string-normalization.e2e.spec.ts`
- `tests/import-retry-trigger-clears-stale-error.e2e.spec.ts`
- `tests/import-retry-trigger-clears-stale-preview.e2e.spec.ts`
- `tests/import-start-closes-edit-context.e2e.spec.ts`
- `tests/import-summary-json-consistency.e2e.spec.ts`
- `tests/import-summary-json-recovery-transition.e2e.spec.ts`
- `tests/import-top3-ui-normalization.e2e.spec.ts`
- `tests/import-validation-trimmed-fields.e2e.spec.ts`

### コンテキスト遷移・インポート確認中の操作ガード

- `tests/context-transition-matrix.e2e.spec.ts`
- `tests/form-inputs-disabled-while-import-preview.e2e.spec.ts`
- `tests/save-actions-disabled-while-import-preview.e2e.spec.ts`

### 検索タグ同期・タグ連動ステータス

- `tests/clear-tag-filter-syncs-registration-tag.e2e.spec.ts`
- `tests/search-clear-closes-import-preview.e2e.spec.ts`
- `tests/search-select-closes-import-preview.e2e.spec.ts`
- `tests/search-tag-select-syncs-registration-tag.e2e.spec.ts`
- `tests/tag-manual-edit-breaks-sync.e2e.spec.ts`
- `tests/tag-manual-edit-shows-sync-break-notice.e2e.spec.ts`
- `tests/tag-sync-break-notice-auto-dismiss.e2e.spec.ts`
- `tests/tag-sync-break-notice-dedup.e2e.spec.ts`
- `tests/tag-sync-notice-clears-on-reselect.e2e.spec.ts`
- `tests/tag-sync-space-normalization.e2e.spec.ts`
- `tests/tag-sync-status-a11y.e2e.spec.ts`
- `tests/tag-sync-visibility.e2e.spec.ts`
- `tests/tag-sync-whitespace-no-false-break.e2e.spec.ts`

### アクセシビリティ・フィードバック・Maps安全性

- `tests/error-clears-stale-success-notice.e2e.spec.ts`
- `tests/feedback-accessibility.e2e.spec.ts`
- `tests/item-action-accessibility.e2e.spec.ts`
- `tests/maps-link-import-safety.e2e.spec.ts`
- `tests/maps-link-query.e2e.spec.ts`
- `tests/rank-picker-accessibility.e2e.spec.ts`
- `tests/sample-error-clears-stale-success-notice.e2e.spec.ts`
- `tests/save-error-clears-stale-success-notice.e2e.spec.ts`
- `tests/search-accessibility.e2e.spec.ts`

## 静的QA

- `tests/qa-coverage-doc.test.mjs`
  - `tests/*.e2e.spec.ts` がこの文書に全件記載されていることを検証する。
  - E2Eを増やしたのにカバレッジ表を更新しない drift を防ぐ。

## 手動に残す項目

- 実機ブラウザでの見た目崩れ、タップしやすさ、スクリーンショット取得
- API停止やネットワーク障害など、ローカルpreviewでは再現しにくい障害注入
- LP/紹介資料の文体・名称採用判断

## 実行コマンド

```bash
pnpm test:qa-docs
pnpm test:e2e
pnpm build
```
