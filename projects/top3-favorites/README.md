# top3-favorites-app

好きな店を **タグ別Top3** としてDB保存するMVPアプリです。

## UX方針

1. 登録済みタグを選ぶ、または新規タグを入力する
2. 場所（松戸 / 柏の葉など）と店舗名を入れる
3. 既存Top3を見ながら順位を選ぶ
4. DBに直接保存する
5. 一覧はアコーディオンで1行表示し、詳細だけ開く

## 機能

- Vercel Blob backed DB（`/api/items`）へ直接保存
- JSONインポート/エクスポート削除
- 場所フィールドを独立管理
- 店舗名 + 場所 + タグからGoogle Maps URLを自動保存
- タグチップで検索/絞り込み
- 新規タグ作成（タグ欄へ入力）
- Top3の自動繰り下げ
- アコーディオン詳細表示

## 開発

```bash
pnpm install
vercel env pull .env.local
vercel dev
```

## 検証

```bash
pnpm test:e2e
pnpm build
```

## 受け入れ条件（インポート安全性）

- JSONインポート時、入力が**配列でない**場合は反映しない
- JSONインポート時、配列内に1件でも不正要素（`id/name/rank/tags`不備）があれば**全体を反映しない**
- インポート失敗時は、**既存データを保持**する（fail-closed）
- インポート成功時のみデータを置き換える

## 関連ドキュメント

- `docs/CONCEPT_COPY.md`
  - 名前案、タグライン、オンボーディング文言、README/LP向けコピー、将来機能案
- `docs/MANUAL_TEST_CHECKLIST.md`
  - 実ブラウザで確認する手動QA観点
- `docs/AUTOMATED_QA_COVERAGE.md`
  - E2Eで自動確認済みのQA観点と手動に残す項目
- `docs/QA_RESULT.md`
  - コード読解ベースの静的QA結果
- `docs/VERIFICATION_HANDOFF.md`
  - 直近のbuild確認、成果物、次アクション、受け入れチェックリスト

## 次に確認すること

1. `docs/CONCEPT_COPY.md` から採用する名前・タグラインを決める
2. `docs/MANUAL_TEST_CHECKLIST.md` に沿って実ブラウザQAを行う
3. 問題なければ README/LP に採用コピーを反映する

外部公開、GitHub push、課金、本番変更はこの手順には含めません。
