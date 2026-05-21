# Discord report flat API guide

## 目的

- `summary` / `reportSummaryBundle` / `reportSummaryContext` / `deliveryReadiness` の役割を混ぜずに検証したい
- `reportSummaryBundle` と `reportSummaryContext` を flat に書く例を残したい
- flat API だけで期待値を書けることを示したい

## 想定読者

- slide-tool のテンプレートを直す人
- Discord report の期待値を書く人
- 参照テンプレートやREADMEのサンプルを保守する人

## この資料で見せたいこと

- report summary の期待値は bundle と context に分けて書く
- 受け入れ確認は flat API で記録する
- 手元で `--verify` と `verify-discord-report.mjs` を通してから送る

## 構成案

### 1. 問題

- flat API だと、summary bundle と full context の境界を分けて書ける
- `summary` / `reportSummaryBundle` / `reportSummaryContext` の役割が読み取りやすい

### 2. Flat API の書き方

- `reportSummaryBundle` に bundle の期待値を書く
- `reportSummaryContext` に full context の期待値を書く
- `deliveryReadiness` は delivery readiness のみを検証する

### 3. 受け入れ確認

- `references/acceptance-checklist-template.md` の QA 行をそのまま使う
- `reportSummaryBundle` / `reportSummaryContext` を期待値メモに残す

### 4. 検証コマンド

```bash
node slide-tool/scripts/studio.mjs slide-tool/examples/discord-report-flat-api.md \
  --out slide-tool/out/discord-report-flat-api \
  --name discord-report-flat-api \
  --verify

node slide-tool/scripts/verify.mjs slide-tool/out/discord-report-flat-api discord-report-flat-api

node slide-tool/scripts/verify-discord-report.mjs \
  slide-tool/out/discord-report-flat-api/discord-report.md \
  --delivery-message slide-tool/out/discord-report-flat-api/delivery-message.md \
  --delivery-manifest slide-tool/out/discord-report-flat-api/discord-report-flat-api.acceptance.manifest.json
```

### 5. そのまま使える flat 期待値の書き方

```js
import {
  createCanonicalDiscordReadyOutput,
  createCanonicalDiscordReportSummaryBundle,
  createCanonicalStudioDiscordReportContext,
} from '../tests/summary-contract-utils.mjs';

const expected = createCanonicalDiscordReadyOutput({
  summary: createCanonicalDiscordReportSummaryBundle({
    deliveryReadiness: { visualQaUniqueSampledColors: 4 },
  }),
  reportSummaryBundle: createCanonicalDiscordReportSummaryBundle({
    deliveryReadiness: { visualQaUniqueSampledColors: 9 },
  }),
  reportSummaryContext: createCanonicalStudioDiscordReportContext({
    reportSummaryBundle: {
      deliveryReadiness: { visualQaUniqueSampledColors: 9 },
    },
  }),
});
```

## 注意

- bundle と context を flat に分ける
- README やテンプレートでも同じ書き方を示す
