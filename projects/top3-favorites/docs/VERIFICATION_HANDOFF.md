# top3-favorites 検証・引き継ぎメモ

作成日: 2026-05-17
対象: top3-favorites-app の直近成果（コンセプト整理 / 既存MVP）

## 今回の安全な一手

`pnpm build` による typecheck + production build の確認結果を、次の担当者が追えるように整理した。

## 確認済み

- `pnpm build` 成功
  - `tsc -b` 成功
  - `vite build` 成功
  - production assets 生成成功
- 外部公開なし
- GitHub pushなし
- 課金増なし
- 本番変更なし
- 秘密値投入なし

## 現在の主な成果物

- `docs/CONCEPT_COPY.md`
  - 名前案
  - タグライン
  - オンボーディング文言
  - README/LP向け短文
  - 将来機能案

- `docs/QA_RESULT.md`
  - 静的確認結果
  - 実ブラウザ未確認項目

- `docs/MANUAL_TEST_CHECKLIST.md`
  - 手動受け入れ確認の観点

## 次に人間または担当者が見るべきポイント

1. `docs/CONCEPT_COPY.md` の名前案から、採用候補を1つに絞る
2. READMEやLPへ反映するコピーの文体を決める
3. 実ブラウザで `docs/MANUAL_TEST_CHECKLIST.md` を実施する
4. 問題なければ、次フェーズとして以下を検討する
   - 日替わりお題
   - 殿堂入り
   - 惜しくも4位
   - 週間/月間の偏愛レポート

## 受け入れチェックリスト

- [x] JSONインポートが fail-closed である（不正入力時は既存データ保持）
  - 証拠: `tests/import-fail-closed-matrix.e2e.spec.ts` — 全無効入力で既存データ保持・プレビュークリアを Playwright E2E で確認（qa-current 52/52 pass 内）
- [x] 配列以外JSONは反映されない
  - 証拠: `tests/api-import-validation.e2e.spec.ts` + `tests/import-fail-closed-matrix.e2e.spec.ts`
- [x] 不正要素が1件でもある配列は全体反映しない
  - 証拠: `tests/import-fail-closed-matrix.e2e.spec.ts`

- [x] コンセプトが「Top3で好きが見える」に絞られている
  - 証拠: `docs/CONCEPT_COPY.md` に「Top3で好きが見える」明記
- [x] 初回ユーザーが何を入力すればよいか分かる
  - 証拠: Playwright chromium スクリーンショット `test-results/.../01-home-seeded-list.png`（2026-06-15）
    - ヘッダー直下に「タグを選ぶ → いまの順位を見る → 店舗と場所を入れて保存。」の3ステップ説明
    - タグ・場所・店舗名の各フィールドに日本語プレースホルダー例あり
    - 順位は「1位に入れる」「2位に入れる」「3位に入れる」ボタンで迷いなく選択可
    - 「サンプルをDB保存」ボタンで初回ユーザーがゼロから体験できる
- [x] README/LPに転用できる短文がある
  - 証拠: `docs/CONCEPT_COPY.md` L119「README/LP向け短文」セクションあり
- [x] 実装変更なしでドキュメントだけ確認できる
- [x] `pnpm build` が成功している
  - 証拠: 2026-06-15 09:28 UTC `tsc -b && vite build` clean（dist/assets/index-BiIDhYbz.js 175.83 kB）
- [x] 外部公開・本番反映・課金増が行われていない

## 残る未確認（Yakon 判断のみ）

- コピー採用案の人間判断: `docs/CONCEPT_COPY.md` の名前案から1つ選定（Yakon）
- README/LPへの実反映: 採用案決定後（Yakon）
- 次フェーズ機能方針: 日替わりお題・殿堂入り・週間レポートの採否（Yakon）

## Shiro 確認完了（全9項目 ✅）

更新日: 2026-06-15 by Shiro — `pnpm test:quick` 57/57 pass, `pnpm build` clean, Playwright screenshot 2/2 pass
