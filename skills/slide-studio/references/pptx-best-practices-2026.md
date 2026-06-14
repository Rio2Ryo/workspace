# PPTX Best Practices Research — 2026-05-17

Purpose: raise Shiro Slide Studio quality by adopting established Claude/Windsurf/Codeium/PowerPoint workflows instead of improvising with cheap shapes.

## Sources checked

- Anthropic / Composio-style `pptx` skill docs: HTML-first with strict dimensions, `html2pptx`, PptxGenJS, visual validation.
- `hugohe3/ppt-master`: native editable PPTX workflow for Claude Code / Windsurf / Cursor, template replication, live preview, SVG/OOXML-driven generation.
- `danny0926/ppt-skills`: Excalidraw-style dual-layer workflow: visual background rendered from HTML/rough.js + editable foreground text/images.
- `icip-cas/PPTAgent` / DeepPresenter: agentic deck generation with research, autonomous asset creation, text-to-image, offline/export workflow.
- X / web search around Claude Code, Windsurf/Codeium, Gamma, Canva, GPT Image 2, and PPTX generation workflows.

## Main conclusion

The current failure is architectural, not just visual. Generating arbitrary diagrams directly with `pptxgenjs` from scratch makes PowerPoint drift and looks cheap. Mature workflows use one of these paths:

1. **Template-native PPTX**: start from a strong `.pptx` template / Slide Master, duplicate proven layouts, edit OOXML or use library bindings only where safe.
2. **HTML/SVG first**: design a slide as a fixed-size artifact, visually inspect it, then export/convert to PPTX with strict rules.
3. **PPT Master-style native editable**: use an existing workflow that preserves real DrawingML shapes/text/charts and supports template replication.
4. **Dual-layer fallback**: use a high-quality rendered visual layer for complex diagrams, with editable foreground titles/text where editability matters.

## Non-negotiable rules for future decks

### 1. Never start from blank PPTX shapes for premium decks
Use one of:
- a client/brand/reference PPTX template;
- a replicated template from a high-quality sample;
- a fixed-size HTML/SVG artifact that is rendered and reviewed before PPTX export;
- PPT Master or equivalent native editable workflow.

### 2. Every slide needs a visual argument, not decoration
For each slide define:
- **claim**: one sentence title with the takeaway;
- **evidence / mechanism**: what proves or explains it;
- **diagram type**: process, funnel, flywheel, architecture, matrix, timeline, before/after, stack, map, KPI tree;
- **reading order**: where the eye starts and ends;
- **business outcome**: what decision or value it supports.

Do not place a generic AI image unless it explains the claim.

### 3. Use HTML/SVG coordinates before PPTX
For artifact-first decks:
- fixed canvas: `720pt x 405pt` for 16:9;
- no CSS gradients directly in conversion; rasterize gradients/icons first;
- text must live in semantic tags (`h1`-`h6`, `p`, `ul`, `ol`), not naked div/span;
- use web-safe fonts for conversion reliability;
- validate overflow and screenshot thumbnails before packaging.

### 4. Use native PPTX only where it is reliable
Good native PPTX elements:
- text boxes, simple shapes, tables, native charts, lines, connectors.

Risky / often cheap when hand-coded:
- complex diagrams with many aligned objects;
- decorative backgrounds;
- gradients, shadows, icons, illustration-heavy slides;
- layouts requiring pixel-perfect polish.

For risky slides, use HTML/SVG rendering + visual review, then either:
- convert carefully to editable objects, or
- use rendered diagram background + editable text overlay.

### 5. Template-first is preferred for client-ready decks
If user wants real sales/board quality:
- ask for, find, or create a strong reference template first;
- extract palette, spacing, typography, slide types;
- duplicate layouts instead of inventing from scratch;
- keep a thumbnail grid review loop.

### 6. Recommended quality gate
Before delivering:
- generate a thumbnail/contact sheet or preview PNG;
- visually review for PowerPoint drift, clipping, font mismatch, bad line breaks;
- inspect PPTX contents count via zip/OpenXML;
- if a deck is meant to be editable, open/export with PowerPoint/LibreOffice/QuickLook and confirm actual rendered state, not just code output.

## Recommended workflow for Shiro Slide Studio v2

1. **Research / brief**: audience, sales goal, source facts, brand cues.
2. **Storyboard**: slide list with claims + diagram type + outcome.
3. **Design system**: palette, fonts, grid, component set, references.
4. **Artifact preview**: HTML/SVG or PPT Master template output first.
5. **Visual review**: screenshot/contact sheet; fix layout before PPTX.
6. **PPTX export**:
   - preferred: template-native/PPT Master route;
   - acceptable: html2pptx route;
   - fallback: dual-layer rendered background + editable text.
7. **Self-critique**: check if each visual explains the argument.

## Tool selection

- **PPT Master**: best candidate for high-quality native editable PPTX; should be evaluated/installed locally as a separate tool before next serious deck.
- **Anthropic/Composio pptx skill**: good reference for strict HTML→PPTX conversion rules.
- **Excalidraw Slides**: useful for explanation-heavy, hand-drawn/consulting concept diagrams; not ideal for luxury enterprise visual style unless restyled.
- **PPTAgent / DeepPresenter**: promising but heavier; useful as research/reference rather than immediate dependency.
- **Gamma / Canva**: strong for visual inspiration and final polish; less ideal if full local/editable PPTX automation is required.

## Immediate fix to our practice

Stop presenting `pptxgenjs` generated diagrams as premium output. For the next KATAOMOI deck, use this order:

1. Build a high-quality HTML/SVG contact sheet for 6–10 slides.
2. Review screenshots first.
3. Only after screenshots pass, convert/export to PPTX.
4. If native conversion drifts, deliver dual-layer PPTX: rendered diagram background + editable headline/body/notes.
5. In parallel, evaluate `hugohe3/ppt-master` as the production-grade route.
