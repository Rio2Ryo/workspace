# Shiro Slide Studio 標準ワークフロー

## 基本思想

高品質な資料制作は「PPTXを一発生成」だけに寄せない。Discordで自然文を受け、要件を構造化し、まずHTML/Artifact風プレビューで流れと見た目を確認し、最後に編集可能PPTXへ落とす。

```text
Discord自然文
  -> 要件抽出
  -> outline JSON
  -> HTML / Artifact風preview
  -> 画像素材プロンプト
  -> editable PPTX
  -> --verify / acceptance manifest / Discord report検証
  -> 修正ループ
  -> 納品
```

## なぜ Artifact/HTML first か

- 会話中の修正が速い
- 1枚ごとの主張、余白、順序をブラウザで確認しやすい
- GPT Image 2やCanvaに渡すキービジュアル指示を先に固められる
- 最終PPTXは本文を編集可能に残せる

## 役割分担

### Shiro Slide Studio

- Discord自然文から目的、相手、制約、納品形式を抽出
- outline JSONを作る
- HTML previewを作る
- GPT Image 2向け画像プロンプトを作る
- editable PPTXを生成する
- 生成物、acceptance manifest、Discord report、検証ログを残す

### GPT Image 2 / ChatGPT Images 2.0

- 表紙、キービジュアル、図解、アイコン、質感素材を担当
- 本文テキストは画像化せず、PPTX側で編集可能に残す
- 外部API/課金が絡むため、このPoCではプロンプト生成まで
- 参考: OpenAIのGPT Image 2モデルページでは、高品質な画像生成・編集、柔軟な画像サイズ、画像入出力対応が説明されている。
  - https://developers.openai.com/api/docs/models/gpt-image-2
  - https://openai.com/index/introducing-chatgpt-images-2-0/

### Canva

- ブランド素材の適用、手動仕上げ、SNS/営業資料など複数フォーマット展開に向く
- 2026年時点ではCanva AI 2.0やMagic Studio系の会話型・レイヤー編集強化が進んでいる
- 内製フローでは「最後の仕上げ候補」として扱う。外部アップロードや公開は事前確認
- 参考: https://www.canva.com/create/ai-presentations/

### Gamma

- 初期案、構成探索、Web共有に向く
- PPTX exportは便利だが、納品用の完全編集性を保証したい場合は内製PPTX生成と併用する
- 参考: https://gamma.app/explore/content/guides/best-ai-presentation-tools-export-beyond-live-link

### Presenton

- OSS/ローカル寄りのAI presentation generator
- PPTX/PDF exportとローカル運用検証の候補
- 内製フローでは「セルフホスト候補」「比較検証対象」
- 参考: https://docs.presenton.ai/index

### Plus AI

- PowerPointやGoogle Slides上の既存編集ワークフローを維持したい時に向く
- 内製フローでは「社内テンプレートへの流し込み・既存PPTX編集」の比較対象
- 参考: https://plusai.com/

### Claude Design / Artifacts

- 会話しながらHTML/デザイン案を詰める発想に近い
- Claude DesignはPPTX/Canva/HTML exportを掲げており、Artifact-first発想の外部比較対象
- 内製フローでは、同じ考え方をローカルHTML previewとして再現する
- 参考: https://www.anthropic.com/news/claude-design-anthropic-labs

## Discord入力から抽出する項目

- 何の資料か
- 誰が見るか
- 見た人に何を決めてほしいか
- 何枚くらいか
- トーン
- 必須要素
- 禁止事項
- 納品形式
- 画像素材の必要性
- 外部公開/課金/API利用の可否

## 品質基準

- 1スライド1メッセージ
- 表紙はdeck固有の印象を作る
- 本文は編集可能なテキストとして残す
- 画像は意味のある素材だけに使う
- HTML preview、PPTX、画像プロンプト、slide数を検証する
- `--verify` で acceptance manifest を生成し、納品前チェックが ready になるまで送らない
- Discord report / delivery message / final delivery manifest は `verify-discord-report.mjs` で再検証する
- Discord report の期待値は `reportSummaryBundle` / `reportSummaryContext` の flat 指定で統一する
- ネストした reportSummary ブロックは使わず、bundle と context を分けて書く
- shipping 物に旧ネスト記法が戻っていないかと delivery gates が崩れていないか `npm run verify:shipping-docs` で確認する
- acceptance checklist には delivery readiness、checked artifacts、checked artifact types、visual QA、PPTX内部QAを残す
- HTML/SVGをPPTXへ変換する場合は `references/html-svg-to-pptx.md` の方式と検証チェックを使う
- 外部API、公開、課金、本番変更は事前確認

## ローカル検証コマンド

```bash
node slide-tool/scripts/studio.mjs slide-tool/examples/ai-slide-workflow.md \
  --out slide-tool/out/ai-slide-workflow \
  --name ai-slide-workflow \
  --verify

node slide-tool/scripts/verify.mjs slide-tool/out/ai-slide-workflow ai-slide-workflow

node slide-tool/scripts/verify-discord-report.mjs \
  slide-tool/out/ai-slide-workflow/discord-report.md \
  --delivery-message slide-tool/out/ai-slide-workflow/delivery-message.md \
  --delivery-manifest slide-tool/out/ai-slide-workflow/ai-slide-workflow.acceptance.manifest.json
```
