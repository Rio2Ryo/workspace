# STATIC_QA_CHECK（現行実装差分メモ）

更新日: 2026-05-17
対象: `src/App.tsx`（現行 top3-goose）

## 目的
既存QA資料（localStorage・自然文入力前提）と、現行実装の差分を静的確認で明確化する。

## 静的確認結果（コード根拠）

1. **順位繰り下げロジック**: 実装あり
   - `rankItems()` で target を指定順位に挿入し、`slice(0, 3)` でTop3に制限、再採番。
   - 根拠行: `App.tsx:65-79`

2. **サンプルデータ投入**: 実装あり（DB保存）
   - `addSamples()` が `/api/items` にPOSTループし保存。
   - 根拠行: `App.tsx:186-203`

3. **Google Mapsリンク**: 実装あり
   - `buildMapsUrl()` で `name + location + tag` を query 化。
   - 根拠行: `App.tsx:44-47`

4. **localStorage**: **現行は不使用**
   - `localStorage.getItem/setItem` 呼び出しなし。
   - 現行は `api('/api/items')` 経由のDB読み書き。
   - 根拠行: `App.tsx:81-92`, `107-119`, `169-172`, `191`, `214-217`, `233`

5. **区切りなし自然文入力**: **現行は未対応**
   - `parseQuickInput/parseNaturalInput` の実装がなく、フォーム入力は `tag/location/name/rank/memo` 個別入力方式。
   - 根拠行: `App.tsx:18-24`, `161-184`, `245-260`

6. **タグ重複除去**: API返却後のタグ一覧では実装あり
   - `setTags(Array.from(new Set(...)))`。
   - 根拠行: `App.tsx:174`, `195`, `219`, `235`

## QA資料への影響（重要）

- `docs/QA.md`, `docs/MANUAL_TEST_CHECKLIST.md`, `docs/QA_RESULT.md` のうち、
  **localStorage前提 / 自然文入力前提の項目は現行実装と不整合**。
- 次回の安全な一手として、上記3資料を「DB/API前提・個別フォーム入力前提」に更新するのが妥当。

## 次の自律候補（小さく実行可能）

1. `docs/MANUAL_TEST_CHECKLIST.md` を現行UI仕様へ更新（不整合項目の置換）
2. `docs/QA_RESULT.md` に「実装差分により再判定要」追記
3. `README.md` の入力方式説明（自然文→フォーム）整合確認
