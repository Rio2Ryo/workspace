# slide-tool PoC

文章や要件からスライド構成を作り、PowerPoint資料に落とすためのPoCです。現時点では外部APIを使わず、ローカルのMarkdown入力からアウトラインJSONと `.pptx` を生成します。

## 目的

- 入力: 企画メモ、要件、提案内容、議事録などの文章
- 中間成果物: スライド構成JSON
- 出力: 編集可能なPowerPoint資料
- 方針: まず「構成生成」と「資料化」を分離し、後からLLMやテンプレート選択を差し替えられるようにする

## 既存workspace調査メモ

- `create_estimate_pptx.js` / `create_estimate_pptx_v2.js`
  - `pptxgenjs` による編集可能テキストベースのPPTX生成。
  - 日本語フォント、A4横、カードレイアウト、`fit: 'shrink'` などの実績あり。
- `create_2d_vending_onepager_v*.js`
  - `pptxgenjs` 直描画版と、SVGをChromeでPNG化してPPTXへ貼る版がある。
  - 見た目優先ならSVG/PNG貼り付けが強いが、PowerPoint上の文字編集性は落ちる。
- `generated/make_2d_vending_proposal_landscape_ppt.py`
  - `python-pptx` による生成実績。
  - Python版は細かな図形操作ができるが、既存rootには `pptxgenjs` 依存が既にある。

## 技術選定

最小PoCは `Node.js + pptxgenjs` を採用します。

理由:

- workspace rootの `package.json` に `pptxgenjs` が導入済みで追加インストール不要。
- 既存スクリプトと知見を再利用しやすい。
- PowerPoint上で編集可能なテキスト資料を作りやすい。
- 将来、SVG/PNG高品質レンダリング方式との併用も可能。

## 使い方

```bash
node slide-tool/prototype.mjs slide-tool/examples/sample-input.md
```

生成物:

- `slide-tool/out/sample-deck-outline.json`
- `slide-tool/out/sample-deck.pptx`

## Shiro Slide Studio 実用フロー

最新の標準フローは `scripts/studio.mjs` を使います。Markdownまたはoutline JSONから、HTML preview、editable PPTX、GPT Image 2向け画像プロンプトを同時に生成します。

```bash
node slide-tool/scripts/studio.mjs slide-tool/examples/ai-slide-workflow.md \
  --out slide-tool/out/ai-slide-workflow \
  --name ai-slide-workflow
```

生成物:

- `*.outline.json`: スライド構成
- `*.preview.html`: Artifact風HTML preview
- `*.preview.png`: HTML previewのスクリーンショット
- `*.editable.pptx`: 編集可能PPTX
- `*.image-prompts.json` / `*.image-prompts.md`: GPT Image 2向け画像プロンプト

詳しい運用は `references/shiro-slide-studio-workflow.md` と `references/discord-intake-template.md` を参照。

### Discord report の期待値の書き方

Discord report まわりの期待値は、flat な `reportSummaryBundle` / `reportSummaryContext` で書きます。

```js
import {
  createCanonicalDiscordReadyOutput,
  createCanonicalDiscordReportSummaryBundle,
  createCanonicalStudioDiscordReportContext,
  assertStudioDiscordReadyOutputContext,
} from './tests/summary-contract-utils.mjs';

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

assertStudioDiscordReadyOutputContext(generatedOutput, expected);
```

`createCanonicalDiscordReadyOutput()` と `studio --verify` の出力は、flat な `reportSummaryBundle` / `reportSummaryContext` を返します。検証と再利用はこの flat 名を基準に揃えます。

この形に揃えると、`summary` / `reportSummaryBundle` / `reportSummaryContext` / `deliveryReadiness` の役割が分かれたまま検証できます。

## 代表成果物の一括検証

```bash
node slide-tool/scripts/verify-artifacts.mjs
```

または:

```bash
npm run verify:slides
```

例カタログだけを個別に確認したい時は:

```bash
npm run verify:examples
```

特定の例だけを繰り返し確認したい時は:

```bash
npm run verify:examples -- --only discord-report-flat-api
```

レビュー用の markdown レポートを書き出したい時は:

```bash
npm run verify:examples -- --only discord-report-flat-api --format md --report-md /tmp/discord-report-flat-api-report.md
```

shipping 物に flat 以外の report summary 記法が混ざっていないかと、
検証サンプルの delivery gates が崩れていないかを一度に確認したい時は:

```bash
npm run verify:shipping-docs
```

現時点では以下をまとめて確認します。

- `ai-slide-workflow`
- `top3-favorites-app-mvp`
- `top3-favorites-app-lp-onepager`
- `discord-report-flat-api` (Discord report の flat 期待値サンプル)

`verify:examples` は `examples/verification-catalog.json` をそのまま使い、各サンプルの `expectedSlides` と `--verify` / delivery gates をまとめて検査します。
`--only` を付けると、指定した `name` または `file` だけを回せます。テンプレート修正や flat API の置換を局所的に詰めたい時に使えます。
`--report-md <path>` を付けると、共有用の markdown レポートを同時に保存できます。親ディレクトリは自動生成されます。`--format` を省略した場合は stdout も markdown になります。`--format json --report-md <path>` にすると stdout は JSON のまま、レポートだけ markdown にできます。レポートには再実行用のコマンドと検証スコープ（label / catalog / sample filter / flat roots）も出るので、acceptance checklist に貼ったあとに同じ検証をすぐ再現できます。
`--format checklist` を付けると、acceptance checklist に貼る最小ブロックだけを stdout に出せます。`--checklist-md <path>` を付けると、その最小ブロックを markdown ファイルとして保存できます。`--checklist-json <path>` を付けると、同じ内容を機械処理しやすい JSON として保存できます。親ディレクトリは自動生成されます。JSON には example catalog の `entries` と flat report summary の `matches` も残るので、checklist への転記用と bot 向け再利用用を分けたい時に使えます。
`verify:shipping-docs` は `verify:examples` と `verify:flat-report-summary` をまとめて走らせて、shipping 物に flat 以外の report summary 記法が残っていないかと、検証サンプルの delivery gates が崩れていないかを一度に確認します。`--report-md <path>` を付けると、stdout は markdown になり、acceptance checklist にそのまま貼れる共有用レポートも保存できます。markdown レポートには `## Acceptance checklist` が入り、verified / skipped の各サンプル名も出るので、どの shipping 物を通したかを checklist にそのまま転記できます。flat API へ移行した後の再混入防止と、acceptance checklist への転記短縮に使えます。
`--checklist-md <path>` では、command 行つきの checklist ブロックだけを保存できるので、検証結果をそのまま acceptance checklist に貼る時の手戻りが減ります。`--checklist-json <path>` では、同じ検証結果を bot や後続 CI が読みやすい JSON で残せます。
checklist には verified / skipped の sample 名も入るので、どの shipping 物を通したかをそのまま追えます。
`--catalog <path>` を付けると、カスタムな verification catalog でも同じ shipping check を回せます。テンポラリ catalog で expectedSlides のズレを再現して、レポートを checklist に貼るときに便利です。
`verify:flat-report-summary` は ルート直下の Markdown / `.json` / `.yaml` / `.yml` / examples / references / `~/.codex/memories` を走査して、shipping 物に flat 以外の report summary 記法が残っていないかを個別に一括確認します。Markdown は fenced code block を言語に関係なく検査し、さらに indented code block / blockquote / HTML comment / raw HTML の `<pre><code>` や `<pre> ... <code> ... </code> ... </pre>` のような分割ブロックも拾うので、`bash` などの例示、コメント内、引用内、HTML 埋め込みのコード例に残った旧記法も見逃しません。YAML は通常のキー表記に加えて list item 内の `- reportSummary:` も拾うので、配列ベースの例示も検査できます。flat API へ移行した後の再混入防止に使えます。
Markdown はコードフェンス内だけを検査するので、説明文で legacy 名に触れても落ちません。生成メモに書く再発防止コメントも残しやすいです。

## 追加サンプル

`examples/discord-report-flat-api.md` は、`reportSummaryBundle` / `reportSummaryContext` を flat に書く検証例です。
Discord report の期待値や受け入れチェックを整える時のコピー元として使えます。

## PoC範囲

今回作る最小PoC:

- Markdown風の文章からタイトル、目的、要件、構成案を抽出
- スライドアウトラインJSONを生成
- そのJSONから編集可能テキスト中心のPPTXを生成

今回やらないこと:

- 外部公開
- 課金API利用
- 本番環境変更
- 既存ファイル削除
- LLM API接続

## 次の拡張候補

- LLM構成生成: 入力文章から `outline.schema.json` 相当の構造へ変換
- テンプレート選択: 提案書、見積書、事業計画、営業資料、報告書
- レイアウト品質検証: 生成PPTXをPNG/PDF化して視覚QA
- PowerPoint編集性と見た目の二系統出力: editable版 / polished版
