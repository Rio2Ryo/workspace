# top3-favorites 自動QAカバレッジ

最終更新: 2026-05-18

## 自動確認済み

- 起動・基本保存・検索・Top3順位繰り下げ
  - `tests/top3.e2e.spec.ts`
- 編集フォームのアクセシビリティと必須入力バリデーション
  - `tests/edit-form-accessibility.e2e.spec.ts`
- 削除確認、削除対象境界、削除後のタグフィルタ復旧、再読み込み後の削除永続化
  - `tests/delete-confirmation.e2e.spec.ts`
  - `tests/delete-multi-tag-boundary.e2e.spec.ts`
  - `tests/delete-clears-stale-tag-filter.e2e.spec.ts`
- JSON import/export fail-closed、確認プレビュー、影響サマリー、Top3正規化、rank文字列正規化
  - `tests/import-export.e2e.spec.ts`
  - `tests/import-confirmation-preview.e2e.spec.ts`
  - `tests/import-impact-summary.e2e.spec.ts`
  - `tests/import-top3-ui-normalization.e2e.spec.ts`
  - `tests/import-rank-string-normalization.e2e.spec.ts`
  - `tests/import-broken-json.e2e.spec.ts`
  - `tests/import-validation-trimmed-fields.e2e.spec.ts`
  - `tests/import-export-rank-validation.e2e.spec.ts`
- API側のreplace import検証
  - `tests/api-import-top3-normalization.e2e.spec.ts`
  - `tests/api-import-validation.e2e.spec.ts`
- Mapsリンクのクエリ安全性
  - `tests/maps-link-query.e2e.spec.ts`
  - `tests/maps-link-import-safety.e2e.spec.ts`
- 操作ボタン・検索・順位選択・フィードバックのアクセシビリティ
  - `tests/item-action-accessibility.e2e.spec.ts`
  - `tests/search-accessibility.e2e.spec.ts`
  - `tests/rank-picker-accessibility.e2e.spec.ts`
  - `tests/feedback-accessibility.e2e.spec.ts`

## 手動に残す項目

- 実機ブラウザでの見た目崩れ、タップしやすさ、スクリーンショット取得
- API停止やネットワーク障害など、ローカルpreviewでは再現しにくい障害注入
- LP/紹介資料の文体・名称採用判断

## 実行コマンド

```bash
pnpm test:e2e
pnpm build
```
