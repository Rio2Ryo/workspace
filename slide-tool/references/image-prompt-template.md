# Image Prompt Template for Slide Tool

GPT Image 2などの画像生成向けプロンプトを作る時の共通テンプレート。API実行は別判断。ここではプロンプト作成だけを扱う。

## 原則

- 本文テキストはPPTX/HTML側で編集可能に残す
- 画像内に読ませる文字を入れない
- 表紙、キービジュアル、図解、アイコン、質感素材に限定する
- 生成画像は主役または理解補助として使い、装飾だけの画像は作らない
- 外部API、課金、公開アップロードが絡む場合は事前確認する

## 基本テンプレート

```text
Create a 16:9 presentation visual for "{deck_title} / {slide_title}".
Purpose: {visual_role}.
Audience: {audience}.
Style: {style_direction}.
Content: {subject_matter}.
Composition: {layout_instruction}.
Palette: {palette}.
Leave safe empty space for editable slide text.
Avoid readable text, logos, fake UI screenshots, brand marks, clutter, and dense details.
```

## 役割別テンプレート

### Cover / Key Visual

```text
Create a premium editorial cover visual for a presentation titled "{deck_title}".
Show {central_metaphor} in a clean, memorable composition.
Use {palette} with generous negative space for editable Japanese title text.
The image should feel specific to this product, not a generic tech background.
Avoid readable text, logos, fake UI, stock-photo cliches, and decorative clutter.
```

### Product UI Mood

```text
Create an abstract product UI mood visual for "{product_name}".
Show simplified mobile screens, cards, gestures, or flows that imply {core_interaction}.
Do not include readable UI text; use blank shapes and visual hierarchy only.
Use {palette}; keep the design friendly, polished, and presentation-ready.
Leave safe empty space for editable labels in the slide.
```

### Diagram Support Visual

```text
Create a diagram-like support visual for "{slide_title}".
Represent {concept} with simple objects, arrows, layers, or modules.
Keep it clean enough to sit beside editable slide text.
Use {palette}; avoid tiny details, dense labels, and fake data.
```

### Icon Set

```text
Create a cohesive icon set for "{deck_title}".
Include icons for: {icon_list}.
Style: simple, rounded, presentation-native, consistent stroke/shape language.
Use transparent or plain light background.
Avoid text, logos, photorealistic rendering, and inconsistent perspectives.
```

## Quality Gate

- [ ] The prompt states the image role
- [ ] The prompt states the audience or use context
- [ ] The prompt reserves empty space for editable text
- [ ] The prompt forbids readable text/logos/fake UI where needed
- [ ] The prompt specifies palette and visual style
- [ ] The prompt is specific to the slide, not reusable generic decoration
