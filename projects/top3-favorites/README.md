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
pnpm build
```
