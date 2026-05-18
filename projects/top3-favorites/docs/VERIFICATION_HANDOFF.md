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

- [ ] JSONインポートが fail-closed である（不正入力時は既存データ保持）
- [ ] 配列以外JSONは反映されない
- [ ] 不正要素が1件でもある配列は全体反映しない

- [ ] コンセプトが「Top3で好きが見える」に絞られている
- [ ] 初回ユーザーが何を入力すればよいか分かる
- [ ] README/LPに転用できる短文がある
- [ ] 実装変更なしでドキュメントだけ確認できる
- [ ] `pnpm build` が成功している
- [ ] 外部公開・本番反映・課金増が行われていない

## 残る未確認

- 実ブラウザでの手動QA
- コピー採用案の人間判断
- README/LPへの実反映判断
