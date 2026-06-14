---
name: slide-studio
description: Use when creating high-quality slide decks from Discord-style natural language, rough requirements, Markdown, or outline JSON. Produces an artifact-first workflow: structured outline, HTML preview, GPT Image 2 image prompts, editable PPTX, and verification notes without publishing or using paid APIs unless approved.
---

# Shiro Slide Studio

Use this skill for slide/deck requests where the user wants to talk naturally and receive a usable presentation.

## Workflow

1. Extract the brief: topic, audience, decision, slide count, tone, required points, forbidden actions, output format.
2. Build the storyline first: use SCQA / Problem → Insight → Recommendation / Before → After → How.
3. Design every slide as claim + explanatory diagram. Decorative images are not enough. Read `references/diagram-playbook.md` when creating business, sales, investor, or strategy decks.
4. For premium/client-ready PPTX, read `references/pptx-best-practices-2026.md` first. Do **not** start from blank `pptxgenjs` shapes for polished decks; use a template-native, HTML/SVG-first, PPT Master-style, or dual-layer workflow.
5. Prefer Artifact/HTML first: create or refine outline JSON, then fixed-size HTML/SVG preview/contact sheet, visually review screenshots, then export/convert to PPTX.
6. Keep body text and diagrams editable in PPTX where reliable. For complex pixel-perfect diagrams, use a rendered visual layer plus editable foreground text rather than misaligned native shapes.
7. Use GPT Image 2 only after the diagram logic is fixed, mainly for hero visuals, atmospheres, or diagram assets unless API use is explicitly approved.
8. Do not publish, upload, use paid APIs, change production settings, or delete files without explicit approval.
9. Verify: generate sample outputs, check PPTX slide count via OpenXML/zip, and create an HTML preview screenshot/contact sheet when Chrome is available.

## Local scripts

Use the wrapper script from the workspace root:

```bash
node skills/slide-studio/scripts/shiro-slide-studio.mjs slide-tool/examples/ai-slide-workflow.md \
  --out slide-tool/out/ai-slide-workflow \
  --name ai-slide-workflow
```

Verify after generation:

```bash
node slide-tool/scripts/verify.mjs slide-tool/out/ai-slide-workflow ai-slide-workflow
```

Read `references/workflow.md` for tool selection and Discord intake guidance when needed.
