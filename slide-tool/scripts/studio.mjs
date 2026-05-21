import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
import pptxgen from '../pptxgenjs.mjs';
import {
  deliveryManifestBuildDeliveryMessage,
  deliveryManifestBuildFinalManifest,
  deliveryManifestDiscordReportContext,
  deliveryManifestRegisterAuditFiles,
  deliveryManifestWriteDiscordReport,
  deliveryManifestPromptsMarkdownPath,
  deliveryManifestReportIdentityChecks,
  deliveryManifestStudioCaughtErrorSummary,
  deliveryManifestStudioOutputSummary,
  deliveryManifestSummarizeIdentityChecks,
  deliveryManifestSummarizeDeliveryReadiness,
  deliveryManifestSummarizeVisualQa,
} from './lib/delivery-manifest-utils.mjs';
import {
  outlineSchemaInvalidJsonMessage,
  outlineSchemaRawJsonErrors,
} from './lib/outline-schema-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(rootDir, '..');
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const DEFAULT_THEME = {
  mode: 'artifact-first',
  background: 'F6F3EE',
  paper: 'FFFDF8',
  ink: '172033',
  muted: '667085',
  accent: '2563EB',
  accent2: '0F766E',
  warm: 'C2410C',
  line: 'D8DEE8',
};

function parseArgs(argv) {
  const args = { input: null, out: path.join(rootDir, 'out', 'studio-run'), name: 'deck', verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') args.input = readOptionValue(argv, i++, '--input');
    else if (arg === '--out') args.out = readOptionValue(argv, i++, '--out');
    else if (arg === '--name') args.name = readOptionValue(argv, i++, '--name');
    else if (arg === '--verify') args.verify = true;
    else if (arg === '--no-verify') args.verify = false;
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else if (!args.input) args.input = arg;
    else throw new Error(`Unexpected positional argument: ${arg}`);
  }
  args.input ||= path.join(rootDir, 'examples', 'ai-slide-workflow.md');
  return args;
}

function readOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function pptColor(value, fallback) {
  return String(value || fallback).replace(/^#/, '').toUpperCase();
}

function readInput(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    const outline = JSON.parse(raw);
    assertRawJsonOutline(outline);
    return normalizeOutline(outline);
  }
  return outlineFromMarkdown(raw);
}

function outlineFromMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || 'Untitled Deck';
  const meta = {};
  const sections = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('# ')) continue;
    const metaMatch = line.match(/^(Audience|Tone|Thesis):\s*(.+)$/i);
    if (metaMatch) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
      continue;
    }
    if (line.startsWith('## ')) {
      current = { title: line.replace(/^##\s+/, '').trim(), bullets: [] };
      sections.push(current);
      continue;
    }
    if (current && /^[-*]\s+/.test(line)) current.bullets.push(line.replace(/^[-*]\s+/, '').trim());
    else if (current) current.bullets.push(line);
  }

  validateMarkdownSections(sections);

  const slides = [
    {
      type: 'cover',
      title,
      subtitle: meta.thesis || 'Discord自然文から、構成・プレビュー・PPTXまで一気通貫で作る',
      claim: 'Artifact/HTML first, editable PPTX final.',
      bullets: ['自然会話から開始', 'HTMLで速く確認', '本文はPowerPointで編集可能'],
      imagePrompt: `Premium editorial cover for a presentation titled "${title}". Abstract workflow from chat bubbles to HTML canvas to editable PowerPoint slides. Clean Japanese business design, warm neutral paper, precise blue-green accents, no readable tiny text.`,
      speakerNotes: '表紙では、いきなりPPTXではなく会話からプレビューを経て納品する思想を示す。',
    },
  ];

  sections.forEach((section, index) => {
    slides.push({
      type: inferType(section.title, index),
      title: section.title,
      claim: section.bullets[0] || section.title,
      bullets: section.bullets.slice(0, 6),
      columns: bulletsToColumns(section.bullets),
      imagePrompt: promptForSection(title, section),
      speakerNotes: `${section.title}について、要点を短く説明する。`,
    });
  });

  return normalizeOutline({
    title,
    subtitle: meta.thesis,
    audience: meta.audience,
    tone: meta.tone,
    thesis: meta.thesis,
    artifactFirst: true,
    theme: DEFAULT_THEME,
    slides,
  });
}

function validateMarkdownSections(sections) {
  const errors = [];
  if (sections.length === 0) errors.push('add at least one ## section after the deck title');
  sections.forEach((section, index) => {
    if (!section.title) errors.push(`section ${index + 1} is missing a title`);
    if (section.bullets.length === 0) errors.push(`section "${section.title || index + 1}" must include at least one bullet or body line`);
  });
  if (errors.length) throw new Error(`Invalid Markdown outline:\n- ${errors.join('\n- ')}`);
}

function inferType(title, index) {
  if (/使い分け|比較|ツール/.test(title)) return 'comparison';
  if (/フロー|標準|次/.test(title)) return 'process';
  if (/品質|基準|役割/.test(title)) return 'matrix';
  return index === 0 ? 'section' : 'visual';
}

function bulletsToColumns(bullets = []) {
  return bullets.slice(0, 6).map((bullet, i) => {
    const [head, ...rest] = bullet.split(/[:：]/);
    return {
      title: rest.length ? head.trim() : `Point ${i + 1}`,
      body: rest.length ? rest.join('：').trim() : bullet,
    };
  });
}

function promptForSection(deckTitle, section) {
  const subject = `${deckTitle} / ${section.title}`;
  return `Create a 16:9 presentation visual for "${subject}". Use a premium Japanese business editorial style, artifact/HTML canvas motif, subtle warm paper background, blue and teal accents, crisp diagram-like composition. Leave safe empty space for editable slide text. Avoid logos, fake UI screenshots, dense text, and decorative clutter.`;
}

function normalizeOutline(outline) {
  const theme = { ...DEFAULT_THEME, ...(outline.theme || {}) };
  const slides = (outline.slides || []).map((slide, i) => ({
    type: slide.type || (i === 0 ? 'cover' : 'section'),
    title: slide.title || `Slide ${i + 1}`,
    subtitle: slide.subtitle || '',
    claim: slide.claim || '',
    bullets: Array.isArray(slide.bullets) ? slide.bullets : [],
    columns: Array.isArray(slide.columns) ? slide.columns : bulletsToColumns(slide.bullets || []),
    imagePrompt: slide.imagePrompt || promptForSection(outline.title || 'Deck', slide),
    speakerNotes: slide.speakerNotes || slide.notes || '',
  }));
  return {
    title: outline.title || 'Untitled Deck',
    subtitle: outline.subtitle || '',
    audience: outline.audience || '',
    tone: outline.tone || '',
    thesis: outline.thesis || outline.subtitle || '',
    artifactFirst: outline.artifactFirst !== false,
    clientFacing: Boolean(outline.clientFacing),
    hideStudioBadge: Boolean(outline.hideStudioBadge || outline.clientFacing),
    generatedBy: 'Shiro Slide Studio',
    theme,
    slides,
  };
}

function validateOutline(outline) {
  const errors = [];
  if (!outline.title) errors.push('title is required');
  if (!Array.isArray(outline.slides) || outline.slides.length === 0) errors.push('slides must contain at least one slide');
  outline.slides?.forEach((slide, i) => {
    if (!slide.title) errors.push(`slides[${i}].title is required`);
    if (isTooLongForSlideTitle(slide.title)) errors.push(`slides[${i}].title is too long; split it into title plus claim/body`);
    if (String(slide.subtitle || '').length > 140) errors.push(`slides[${i}].subtitle is too long; shorten or move detail to speakerNotes`);
    if (String(slide.claim || '').length > 160) errors.push(`slides[${i}].claim is too long; shorten or split into bullets`);
    if ((slide.bullets || []).some((b) => String(b).length > 110)) errors.push(`slides[${i}] has a long bullet; split or shorten it`);
    (slide.columns || []).forEach((column, columnIndex) => {
      if (isTooLongForColumnTitle(column.title)) errors.push(`slides[${i}].columns[${columnIndex}].title is too long; shorten the column heading`);
      if (String(column.body || '').length > 140) errors.push(`slides[${i}].columns[${columnIndex}].body is too long; split it into bullets or another slide`);
      if ((column.bullets || []).some((b) => String(b).length > 90)) errors.push(`slides[${i}].columns[${columnIndex}] has a long bullet; split or shorten it`);
    });
  });
  if (errors.length) throw new Error(`Invalid outline:\n- ${errors.join('\n- ')}`);
}

function isTooLongForSlideTitle(value) {
  const text = String(value || '').trim();
  return text.length > 80 || /[A-Za-z0-9][A-Za-z0-9._:/?#@!$&'()*+,;=%-]{64,}/.test(text);
}

function isTooLongForColumnTitle(value) {
  const text = String(value || '').trim();
  return text.length > 42 || /[A-Za-z0-9][A-Za-z0-9._:/?#@!$&'()*+,;=%-]{36,}/.test(text);
}

function assertRawJsonOutline(outline) {
  const errors = outlineSchemaRawJsonErrors(outline);
  if (errors.length) throw new Error(outlineSchemaInvalidJsonMessage(errors));
}

function renderHtml(outline, outPath) {
  const theme = outline.theme;
  const slides = outline.slides.map((slide, i) => {
    const bullets = slide.bullets.map((b) => `<li>${esc(b)}</li>`).join('');
    const columns = slide.columns.slice(0, 6).map((col) => `<article><h3>${esc(col.title)}</h3><p>${esc(col.body || (col.bullets || []).join(' / '))}</p></article>`).join('');
    return `
      <section class="slide ${esc(slide.type)} ${outline.hideStudioBadge ? 'no-badge' : ''}">
        <div class="kicker">${String(i + 1).padStart(2, '0')} / ${esc(outline.title)}</div>
        ${slide.type === 'cover'
          ? `<h1>${esc(slide.title)}</h1><p class="subtitle">${esc(slide.subtitle)}</p><p class="claim">${esc(slide.claim)}</p><ul>${bullets}</ul>`
          : `<h2>${esc(slide.title)}</h2><p class="claim">${esc(slide.claim)}</p>${slide.type === 'process' ? `<ol>${slide.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ol>` : `<div class="grid">${columns || `<ul>${bullets}</ul>`}</div>`}`}
        <aside>${esc(slide.speakerNotes)}</aside>
      </section>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(outline.title)}</title>
  <style>
    :root {
      --bg: #${pptColor(theme.background, DEFAULT_THEME.background)};
      --paper: #${pptColor(theme.paper, DEFAULT_THEME.paper)};
      --ink: #${pptColor(theme.ink, DEFAULT_THEME.ink)};
      --muted: #${pptColor(theme.muted, DEFAULT_THEME.muted)};
      --accent: #${pptColor(theme.accent, DEFAULT_THEME.accent)};
      --accent2: #${pptColor(theme.accent2, DEFAULT_THEME.accent2)};
      --warm: #${pptColor(theme.warm, DEFAULT_THEME.warm)};
      --line: #${pptColor(theme.line, DEFAULT_THEME.line)};
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #211f1b; color: var(--ink); font-family: "Hiragino Sans", "Yu Gothic", system-ui, sans-serif; }
    main { display: grid; gap: 28px; padding: 28px; }
    .slide { position: relative; width: min(1280px, calc(100vw - 56px)); aspect-ratio: 16 / 9; margin: 0 auto; overflow: hidden; background: var(--bg); padding: 64px 76px; box-shadow: 0 18px 50px rgba(0,0,0,.28); }
    .slide::before { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,.72), rgba(255,255,255,0) 46%), radial-gradient(circle at 90% 12%, rgba(37,99,235,.18), transparent 28%), radial-gradient(circle at 15% 92%, rgba(194,65,12,.13), transparent 34%); pointer-events: none; }
    .slide > * { position: relative; z-index: 1; }
    .kicker { font-size: 14px; color: var(--muted); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 42px; }
    h1 { font-size: 78px; line-height: .96; letter-spacing: 0; width: 72%; margin: 0 0 26px; }
    h2 { font-size: 52px; line-height: 1.02; letter-spacing: 0; width: 78%; margin: 0 0 18px; }
    h3 { font-size: 20px; margin: 0 0 8px; color: var(--accent); }
    p, li { font-size: 23px; line-height: 1.38; }
    .subtitle { width: 74%; color: var(--muted); font-size: 26px; }
    .claim { width: 70%; font-size: 28px; line-height: 1.25; color: var(--accent2); font-weight: 700; }
    ul, ol { width: 62%; padding-left: 1.2em; margin-top: 30px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 40px; }
    article { min-height: 132px; border-top: 3px solid var(--accent); padding-top: 16px; }
    article p { font-size: 18px; color: var(--ink); margin: 0; }
    .process ol { counter-reset: step; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 22px 44px; width: 84%; padding: 0; list-style: none; }
    .process ol li { position: relative; padding-left: 54px; min-height: 54px; }
    .process ol li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 0; width: 36px; height: 36px; border-radius: 50%; background: var(--ink); color: white; display: grid; place-items: center; font-size: 16px; font-weight: 800; }
    aside { position: absolute; right: 76px; bottom: 44px; width: 34%; font-size: 15px; line-height: 1.45; color: var(--muted); border-top: 1px solid var(--line); padding-top: 14px; }
    .cover aside { display: none; }
    .cover:not(.no-badge)::after { content: "HTML first → editable PPTX"; position: absolute; right: 72px; bottom: 64px; font-weight: 800; color: var(--warm); font-size: 28px; z-index: 1; }
    @media print { body { background: white; } main { padding: 0; gap: 0; } .slide { width: 100vw; box-shadow: none; page-break-after: always; } }
  </style>
</head>
<body><main>${slides}</main></body></html>`;
  fs.writeFileSync(outPath, html, 'utf8');
}

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(String(text || ''), {
    x, y, w, h,
    fontFace: 'Yu Gothic',
    fontSize: opts.fontSize || 14,
    bold: opts.bold || false,
    color: opts.color || DEFAULT_THEME.ink,
    align: opts.align || 'left',
    valign: opts.valign || 'top',
    fit: 'shrink',
    margin: opts.margin ?? 0.04,
    breakLine: false,
    paraSpaceAfterPt: 0,
    lineSpacingMultiple: opts.lineSpacingMultiple,
  });
}

function renderPptx(outline, outPath) {
  const theme = outline.theme;
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Shiro Slide Studio';
  pptx.company = 'OpenClaw';
  pptx.subject = 'Artifact-first slide workflow';
  pptx.title = outline.title;
  pptx.lang = 'ja-JP';
  pptx.theme = { headFontFace: 'Yu Gothic', bodyFontFace: 'Yu Gothic', lang: 'ja-JP' };

  outline.slides.forEach((spec, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: pptColor(theme.background, DEFAULT_THEME.background) };
    slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.16, fill: { color: pptColor(theme.accent, DEFAULT_THEME.accent) }, line: { color: pptColor(theme.accent, DEFAULT_THEME.accent) } });
    addText(slide, `${String(i + 1).padStart(2, '0')} / ${outline.title}`, 0.58, 0.38, 7.5, 0.2, { fontSize: 8.5, color: pptColor(theme.muted, DEFAULT_THEME.muted), margin: 0 });

    if (spec.type === 'cover') {
      addText(slide, spec.title, 0.72, 1.18, 8.3, 1.45, { fontSize: 38, bold: true, color: pptColor(theme.ink, DEFAULT_THEME.ink), margin: 0 });
      addText(slide, spec.subtitle, 0.76, 2.83, 8.55, 0.72, { fontSize: 18, color: pptColor(theme.muted, DEFAULT_THEME.muted), margin: 0 });
      addText(slide, spec.claim, 0.78, 4.02, 5.8, 0.36, { fontSize: 20, bold: true, color: pptColor(theme.accent2, DEFAULT_THEME.accent2), margin: 0 });
      spec.bullets.slice(0, 3).forEach((b, idx) => {
        const x = 0.78 + idx * 2.7;
        slide.addShape('line', { x, y: 5.25, w: 2.05, h: 0, line: { color: pptColor([theme.accent, theme.accent2, theme.warm][idx], DEFAULT_THEME.accent), width: 2 } });
        addText(slide, b, x, 5.42, 2.1, 0.42, { fontSize: 13.5, bold: true, color: pptColor(theme.ink, DEFAULT_THEME.ink), margin: 0 });
      });
      if (!outline.hideStudioBadge) addText(slide, 'HTML first -> editable PPTX', 8.85, 6.72, 3.55, 0.28, { fontSize: 15, bold: true, color: pptColor(theme.warm, DEFAULT_THEME.warm), align: 'right', margin: 0 });
    } else {
      addText(slide, spec.title, 0.72, 0.92, 9.5, 0.62, { fontSize: 28, bold: true, color: pptColor(theme.ink, DEFAULT_THEME.ink), margin: 0 });
      addText(slide, spec.claim, 0.74, 1.68, 8.8, 0.52, { fontSize: 16.5, bold: true, color: pptColor(theme.accent2, DEFAULT_THEME.accent2), margin: 0 });
      if (spec.type === 'process') {
        spec.bullets.slice(0, 6).forEach((b, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const x = 0.82 + col * 5.95;
          const y = 2.55 + row * 1.22;
          slide.addShape('ellipse', { x, y: y + 0.02, w: 0.34, h: 0.34, fill: { color: pptColor(theme.ink, DEFAULT_THEME.ink) }, line: { color: pptColor(theme.ink, DEFAULT_THEME.ink) } });
          addText(slide, String(idx + 1), x, y + 0.09, 0.34, 0.12, { fontSize: 8.5, bold: true, color: 'FFFFFF', align: 'center', margin: 0 });
          addText(slide, b, x + 0.52, y - 0.02, 4.9, 0.5, { fontSize: 15.2, color: pptColor(theme.ink, DEFAULT_THEME.ink), margin: 0 });
        });
      } else {
        const cols = spec.columns.length ? spec.columns : bulletsToColumns(spec.bullets);
        cols.slice(0, 6).forEach((col, idx) => {
          const x = 0.84 + (idx % 3) * 4.08;
          const y = 2.58 + Math.floor(idx / 3) * 1.75;
          slide.addShape('line', { x, y, w: 2.95, h: 0, line: { color: pptColor([theme.accent, theme.accent2, theme.warm][idx % 3], DEFAULT_THEME.accent), width: 2 } });
          addText(slide, col.title, x, y + 0.18, 3.25, 0.28, { fontSize: 14.5, bold: true, color: pptColor(theme.accent, DEFAULT_THEME.accent), margin: 0 });
          addText(slide, col.body || (col.bullets || []).join(' / '), x, y + 0.58, 3.25, 0.72, { fontSize: 11.5, color: pptColor(theme.ink, DEFAULT_THEME.ink), margin: 0 });
        });
      }
      addText(slide, spec.speakerNotes, 8.55, 6.55, 3.9, 0.34, { fontSize: 8.7, color: pptColor(theme.muted, DEFAULT_THEME.muted), align: 'right', margin: 0 });
    }

    if (spec.speakerNotes) slide.addNotes(spec.speakerNotes);
  });

  return pptx.writeFile({ fileName: outPath });
}

function writeImagePrompts(outline, outPath) {
  const prompts = outline.slides.map((slide, i) => ({
    slide: i + 1,
    title: slide.title,
    role: slide.type === 'cover' ? 'cover/key visual' : 'diagram/icon/support visual',
    modelIntent: 'GPT Image 2 / ChatGPT Images 2.0 prompt only; do not run paid API without approval',
    prompt: slide.imagePrompt,
  }));
  const markdown = ['# GPT Image 2 prompts', '', ...prompts.map((p) => `## Slide ${p.slide}: ${p.title}\n\nRole: ${p.role}\n\n${p.prompt}\n`)].join('\n');
  fs.writeFileSync(outPath.replace(/\.json$/, '.md'), markdown, 'utf8');
  fs.writeFileSync(outPath, `${JSON.stringify(prompts, null, 2)}\n`, 'utf8');
}

async function screenshotHtml(htmlPath, pngPath) {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.env.SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT === '1' || !fs.existsSync(chrome)) {
    return writeFallbackScreenshot(htmlPath, pngPath);
  }
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--screenshot=${pngPath}`,
      '--window-size=1280,900',
      `file://${htmlPath}`,
    ], { stdio: 'ignore' });
    return { ok: true, source: 'chrome' };
  } catch {
    return writeFallbackScreenshot(htmlPath, pngPath);
  }
}

function writeFallbackScreenshot(htmlPath, pngPath) {
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const text = htmlVisibleText(html);
    fs.writeFileSync(pngPath, fallbackPreviewPng(text || 'slide preview'));
    return { ok: true, source: 'fallback' };
  } catch {
    return { ok: false, source: 'none' };
  }
}

function htmlVisibleText(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackPreviewPng(text, width = 1280, height = 900) {
  const data = Buffer.alloc(height * (1 + width * 4));
  const palette = [
    [246, 243, 238, 255],
    [23, 32, 51, 255],
    [37, 99, 235, 255],
    [15, 118, 110, 255],
    [194, 65, 12, 255],
    [216, 222, 232, 255],
  ];
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    data[row] = 0;
    for (let x = 0; x < width; x += 1) {
      let color = palette[0];
      if (y < 90) color = palette[1];
      else if (x < 24 || x > width - 25 || y > height - 25) color = palette[5];
      const textSeed = text.charCodeAt((x + y) % text.length) || 0;
      if (y > 140 && y < 190 && x > 80 && x < 80 + Math.min(760, text.length * 12)) color = palette[2];
      if (y > 250 && y < 690 && x > 80 && x < width - 80 && ((Math.floor((y - 250) / 70) + Math.floor((x - 80) / 260) + textSeed) % 5 === 0)) color = palette[3];
      if (y > 720 && y < 780 && x > 80 && x < 480) color = palette[4];
      const offset = row + 1 + x * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.concat([uint32be(width), uint32be(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk('IDAT', zlib.deflateSync(data)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([uint32be(data.length), typeBuffer, data, uint32be(crc32(Buffer.concat([typeBuffer, data])))]);
}

function uint32be(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function verifyDeck(outDir, name) {
  const verifier = path.join(rootDir, 'scripts', 'verify.mjs');
  const run = spawnSync(process.execPath, [verifier, outDir, name], { encoding: 'utf8' });
  const payload = run.status === 0 ? run.stdout : run.stderr;
  let report;
  try {
    report = JSON.parse(payload);
  } catch {
    report = { ok: false, errors: [payload.trim() || `verify exited with status ${run.status}`] };
  }
  if (run.status !== 0) {
    const error = new Error(`Generated deck failed verification:\n- ${(report.errors || []).join('\n- ')}`);
    error.verify = report;
    throw error;
  }
  return report;
}

function runAcceptanceManifest(outDir, name) {
  const manifestPath = path.join(outDir, `${name}.acceptance.manifest.json`);
  const policyScript = path.join(rootDir, 'scripts', 'suggest-manifest-policy.mjs');
  const run = spawnSync(process.execPath, [policyScript, outDir, name, '--update-manifest', manifestPath, '--verify-manifest'], {
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_SCOPE: 'manifest-only' },
  });
  const report = parseJsonPayload(run.status === 0 ? run.stdout : run.stdout || run.stderr);
  return report || {
    ok: false,
    manifestUpdate: { path: manifestPath },
    manifestVerification: {
      ok: false,
      error: (run.stderr || run.stdout || `acceptance manifest exited with status ${run.status}`).trim(),
    },
  };
}

function parseJsonPayload(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function verifyDiscordReport(reportPath, args = []) {
  const verifier = path.join(rootDir, 'scripts', 'verify-discord-report.mjs');
  const run = spawnSync(process.execPath, [verifier, reportPath, ...args], { encoding: 'utf8' });
  const report = parseJsonPayload(run.stdout || run.stderr);
  if (run.status !== 0) {
    const error = new Error(`Generated discord report failed delivery verification:\n- ${(report?.errors || [run.stderr || run.stdout || `verify-discord-report exited with status ${run.status}`]).join('\n- ')}`);
    error.verify = report || { ok: false, errors: [error.message] };
    throw error;
  }
  return report;
}

function writeVerifiedDeliveryArtifacts({ generated, reportReady, outDir, discordReport }) {
  const deliveryMessagePath = path.join(outDir, 'delivery-message.md');
  const deliveryManifestPath = path.join(outDir, 'delivery-manifest.json');
  const warnings = reportReady?.warnings || [];
  const reportSummary = mergeVerifiedDiscordReportSummary(reportReady?.summary || null);
  const baseOptions = {
    summary: reportSummary,
    warnings,
    deliveryReadiness: generated.deliveryReadiness,
    generated,
  };

  let deliveryMessage = deliveryManifestBuildDeliveryMessage(baseOptions);
  fs.writeFileSync(deliveryMessagePath, `${deliveryMessage}\n`, 'utf8');
  let deliveryManifest = deliveryManifestBuildFinalManifest(baseOptions);
  fs.writeFileSync(deliveryManifestPath, `${JSON.stringify(deliveryManifest, null, 2)}\n`, 'utf8');
  deliveryManifestRegisterAuditFiles(reportReady?.summary?.acceptanceManifest?.path, [
    deliveryManifestPath,
    discordReport,
    deliveryMessagePath,
  ]);

  const deliveryReady = verifyDiscordReport(discordReport, [
    '--delivery-message',
    deliveryMessagePath,
    '--delivery-manifest',
    deliveryManifestPath,
  ]);
  const identityChecks = deliveryReady?.summary?.identityChecks || null;
  const deliveryMessageIdentityChecks = deliveryManifestSummarizeIdentityChecks(identityChecks, {
    names: ['report', 'deliveryMessage'],
  });
  deliveryMessage = deliveryManifestBuildDeliveryMessage({
    ...baseOptions,
    identityChecks: deliveryMessageIdentityChecks,
  });
  fs.writeFileSync(deliveryMessagePath, `${deliveryMessage}\n`, 'utf8');
  deliveryManifest = deliveryManifestBuildFinalManifest({
    ...baseOptions,
    identityChecks,
  });
  fs.writeFileSync(deliveryManifestPath, `${JSON.stringify(deliveryManifest, null, 2)}\n`, 'utf8');

  const finalDeliveryReady = verifyDiscordReport(discordReport, [
    '--delivery-message',
    deliveryMessagePath,
    '--delivery-manifest',
    deliveryManifestPath,
  ]);
  const reportSummaryBundle = structuredClone(finalDeliveryReady?.summary?.summary || reportSummary?.summary || null);
  const reportSummaryContext = mergeVerifiedDiscordReportSummary(finalDeliveryReady?.summary || reportReady?.summary || null);
  return {
    ok: finalDeliveryReady.ok === true,
    message: finalDeliveryReady?.summary?.message || null,
    deliveryReadiness: generated.deliveryReadiness || null,
    summary: reportSummaryBundle,
    reportSummaryBundle,
    reportSummaryContext,
    attachments: finalDeliveryReady?.summary?.attachments || reportReady?.summary?.attachments || null,
    warnings: finalDeliveryReady?.warnings || warnings,
    deliveryMessage,
    deliveryMessagePath,
    deliveryMessageVerified: true,
    deliveryManifest,
    deliveryManifestPath,
    deliveryManifestVerified: true,
    identityChecks: finalDeliveryReady?.summary?.identityChecks || identityChecks,
  };
}

function mergeVerifiedDiscordReportSummary(summary) {
  if (!summary || typeof summary !== 'object') return summary;
  const gateSummary = summary.summary && typeof summary.summary === 'object' ? summary.summary : null;
  if (!gateSummary) return summary;
  return {
    ...summary,
    deliveryReadiness: summary.deliveryReadiness || gateSummary.deliveryReadiness || null,
    checkedArtifactTypes: summary.checkedArtifactTypes || gateSummary.checkedArtifactTypes || null,
    checkedArtifacts: summary.checkedArtifacts || gateSummary.checkedArtifacts || null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  const inputPath = path.resolve(args.input);
  const outline = readInput(inputPath);
  validateOutline(outline);
  fs.mkdirSync(outDir, { recursive: true });

  const outlinePath = path.join(outDir, `${args.name}.outline.json`);
  const htmlPath = path.join(outDir, `${args.name}.preview.html`);
  const pptxPath = path.join(outDir, `${args.name}.editable.pptx`);
  const promptsPath = path.join(outDir, `${args.name}.image-prompts.json`);
  const promptsMarkdownPath = deliveryManifestPromptsMarkdownPath(promptsPath);
  const screenshotPath = path.join(outDir, `${args.name}.preview.png`);

  fs.writeFileSync(outlinePath, `${JSON.stringify(outline, null, 2)}\n`, 'utf8');
  renderHtml(outline, htmlPath);
  writeImagePrompts(outline, promptsPath);
  await renderPptx(outline, pptxPath);
  const screenshot = await screenshotHtml(htmlPath, screenshotPath);
  const verification = args.verify ? verifyDeck(outDir, args.name) : null;
  const acceptance = args.verify ? runAcceptanceManifest(outDir, args.name) : null;
  const visualQa = deliveryManifestSummarizeVisualQa(screenshot, screenshotPath, verification);
  const deliveryReadiness = deliveryManifestSummarizeDeliveryReadiness(verification, acceptance, visualQa);
  const identityChecks = deliveryManifestReportIdentityChecks(acceptance, outDir, args.name);
  const discordReportContext = deliveryManifestDiscordReportContext({
    inputPath,
    outDir,
    name: args.name,
    outline,
    htmlPath,
    pptxPath,
    outlinePath,
    promptsPath,
    screenshotPath,
    screenshot,
    verification,
    acceptance,
    deliveryReadiness,
    identityChecks,
    visualQa,
  });
  const discordReport = deliveryManifestWriteDiscordReport(discordReportContext, { workspaceRoot, rootDir });

  const output = deliveryManifestStudioOutputSummary({
    inputPath,
    outlinePath,
    htmlPath,
    pptxPath,
    promptsPath,
    promptsMarkdownPath,
    screenshotPath,
    screenshot,
    visualQa,
    deliveryReadiness,
    identityChecks,
    discordReport,
    slides: outline.slides.length,
    verification,
    acceptance,
  });
  if (args.verify) {
    const reportReady = verifyDiscordReport(discordReport);
    output.discordReady = writeVerifiedDeliveryArtifacts({
      generated: output,
      reportReady,
      outDir,
      discordReport,
    });
  }
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify(deliveryManifestStudioCaughtErrorSummary(error), null, 2));
  process.exit(1);
});
