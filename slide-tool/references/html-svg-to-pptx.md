# HTML/SVG to PPTX 手順メモ

slide-toolで作ったHTML/SVG成果物を、提案資料や営業資料へ差し込む時の安全な手順。

## 方針

- 本文編集性が必要な資料は `outline JSON -> editable PPTX` を優先する
- 見た目を1枚で固定したいLP/onepagerは `HTML/SVG -> 画像 -> PPTX貼り付け` が向く
- 外部サービスへのアップロード、公開、課金API利用は事前確認する

## 方式A: SVGをPPTXへ貼る

向く用途:

- LP/紹介用1枚資料
- 図解やキービジュアル
- 文字編集より見た目再現を優先する場合

確認:

```bash
xmllint --noout path/to/file.svg
```

注意:

- SVG内テキストはPowerPoint上で編集しにくい
- 日本語フォントの表示差が出る場合がある
- 配布前にPowerPointまたはプレビューで目視確認する

## 方式B: HTML previewを画像化してPPTXへ貼る

向く用途:

- Artifact風previewをそのまま資料化したい場合
- ブラウザ上の見た目を固定したい場合

想定コマンド:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --screenshot=out.png \
  --window-size=1280,720 \
  file:///absolute/path/to/preview.html
```

既知の制約:

- この環境ではChrome headlessが終了コード134で失敗した実績がある
- 失敗時はHTML内容確認、SVG妥当性、PPTX内部slide数確認を代替検証にする

## 方式C: PPTXへ画像として1枚配置する最小スクリプト案

`pptxgenjs` で16:9スライドに画像を全面配置する。

```js
import pptxgen from 'pptxgenjs';

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
const slide = pptx.addSlide();
slide.addImage({ path: 'onepager.png', x: 0, y: 0, w: 13.333, h: 7.5 });
await pptx.writeFile({ fileName: 'onepager.pptx' });
```

## 検証チェック

- [ ] 元HTML/SVGに必須セクションが含まれる
- [ ] SVGの場合 `xmllint --noout` が成功する
- [ ] PPTX化した場合、内部のslide数が期待値と一致する
- [ ] 画像化した場合、ファイルサイズが0でない
- [ ] 文字が画像化される箇所と編集可能に残す箇所を区別している
- [ ] `references/acceptance-checklist-template.md` の納品QA行を満たしている
- [ ] Discord report / delivery-message / final delivery manifest を作る場合は `verify-discord-report.mjs` が成功する
- [ ] Discord report の期待値は `reportSummaryBundle` / `reportSummaryContext` の flat 指定で記録している
- [ ] ネストした reportSummary ブロックではなく、bundle と context の flat 指定で期待値を書いている
- [ ] `npm run verify:shipping-docs` が成功している
- [ ] delivery readiness: ready になっている
- [ ] PPTX images: 画像貼り付けの有無と理由を明記している

## Top3 LP onepagerの現状

```bash
node slide-tool/scripts/verify-onepager.mjs \
  slide-tool/out/top3-favorites-app-lp-onepager \
  top3-favorites-app-lp-onepager
```

この検証でHTML/SVGの存在、必須文言、SVG root、`xmllint` を確認できる。
