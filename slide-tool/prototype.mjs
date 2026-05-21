import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pptxgen from './pptxgenjs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inputPath = process.argv[2] || path.join(__dirname, 'examples', 'sample-input.md');
const outDir = path.join(__dirname, 'out');
const outlinePath = path.join(outDir, 'sample-deck-outline.json');
const pptxPath = path.join(outDir, 'sample-deck.pptx');

const C = {
  navy: '172033',
  blue: '2563EB',
  green: '0F766E',
  orange: 'C2410C',
  bg: 'F7F8FA',
  card: 'FFFFFF',
  line: 'D8DEE8',
  text: '111827',
  muted: '5B6472',
  paleBlue: 'EAF1FF',
};

function parseMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || 'Untitled Deck';
  const sections = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('# ')) continue;

    if (line.startsWith('## ')) {
      current = { title: line.replace(/^##\s+/, '').trim(), bullets: [] };
      sections.push(current);
      continue;
    }

    if (current && /^[-*]\s+/.test(line)) {
      current.bullets.push(line.replace(/^[-*]\s+/, '').trim());
    } else if (current) {
      current.bullets.push(line);
    }
  }

  return { title, sections };
}

function buildOutline(parsed) {
  const slides = [
    {
      type: 'title',
      title: parsed.title,
      subtitle: '文章/要件からスライド構成を生成するPoC',
      bullets: ['ローカル完結', '編集可能PPTX', '構成JSONを中間成果物化'],
      notes: 'PoCの狙い、対象、生成物を短く説明する。',
    },
  ];

  for (const section of parsed.sections) {
    slides.push({
      type: 'section',
      title: section.title,
      bullets: section.bullets.slice(0, 6),
      notes: `${section.title}の要点を説明する。`,
    });
  }

  slides.push({
    type: 'summary',
    title: '次に決めること',
    bullets: ['入力形式を固定する', '資料テンプレートを3種類に絞る', 'LLM接続の可否とコスト上限を確認する'],
    notes: 'PoC後の判断ポイントを確認する。',
  });

  return {
    title: parsed.title,
    generatedBy: 'slide-tool/prototype.mjs',
    slides,
  };
}

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontFace: 'Yu Gothic',
    fontSize: opts.fontSize || 14,
    bold: opts.bold || false,
    color: opts.color || C.text,
    align: opts.align || 'left',
    valign: opts.valign || 'top',
    fit: 'shrink',
    margin: opts.margin ?? 0.05,
    breakLine: false,
    paraSpaceAfterPt: 0,
    lineSpacingMultiple: opts.lineSpacingMultiple,
  });
}

function addHeader(slide, label, index, total) {
  slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.55, fill: { color: C.navy }, line: { color: C.navy } });
  addText(slide, label, 0.45, 0.17, 8.5, 0.18, { fontSize: 9.5, bold: true, color: 'FFFFFF', margin: 0 });
  addText(slide, `${index}/${total}`, 12.18, 0.17, 0.7, 0.18, { fontSize: 9.5, color: 'DCE6F8', align: 'right', margin: 0 });
}

function addBulletList(slide, bullets, x, y, w, h) {
  const text = bullets.map((bullet) => `• ${bullet}`).join('\n');
  addText(slide, text, x, y, w, h, { fontSize: 17, lineSpacingMultiple: 1.05 });
}

async function renderPptx(outline) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'OpenClaw slide-tool PoC';
  pptx.company = 'OpenClaw';
  pptx.subject = 'slide-tool PoC';
  pptx.title = outline.title;
  pptx.lang = 'ja-JP';
  pptx.theme = { headFontFace: 'Yu Gothic', bodyFontFace: 'Yu Gothic', lang: 'ja-JP' };

  outline.slides.forEach((spec, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: C.bg };
    addHeader(slide, outline.title, i + 1, outline.slides.length);

    if (spec.type === 'title') {
      slide.addShape('roundRect', { x: 0.72, y: 1.25, w: 11.9, h: 4.55, rectRadius: 0.18, fill: { color: C.card }, line: { color: C.line, width: 1 } });
      addText(slide, spec.title, 1.12, 1.78, 10.8, 0.62, { fontSize: 34, bold: true, color: C.navy });
      addText(slide, spec.subtitle, 1.14, 2.55, 10.5, 0.35, { fontSize: 18, color: C.muted });
      addBulletList(slide, spec.bullets, 1.18, 3.35, 10.7, 1.2);
    } else {
      addText(slide, spec.title, 0.74, 1.05, 8.4, 0.45, { fontSize: 27, bold: true, color: C.navy });
      slide.addShape('roundRect', { x: 0.72, y: 1.82, w: 7.3, h: 4.8, rectRadius: 0.14, fill: { color: C.card }, line: { color: C.line, width: 1 } });
      addBulletList(slide, spec.bullets, 1.05, 2.2, 6.68, 3.95);
      slide.addShape('roundRect', { x: 8.45, y: 1.82, w: 4.15, h: 4.8, rectRadius: 0.14, fill: { color: C.paleBlue }, line: { color: 'CBD7F3', width: 1 } });
      addText(slide, 'Speaker Notes', 8.78, 2.2, 3.5, 0.25, { fontSize: 13, bold: true, color: C.blue });
      addText(slide, spec.notes || '', 8.78, 2.68, 3.45, 2.4, { fontSize: 13, color: C.text });
    }

    if (spec.notes) slide.addNotes(spec.notes);
  });

  await pptx.writeFile({ fileName: pptxPath });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const markdown = fs.readFileSync(inputPath, 'utf8');
  const outline = buildOutline(parseMarkdown(markdown));
  fs.writeFileSync(outlinePath, `${JSON.stringify(outline, null, 2)}\n`, 'utf8');
  await renderPptx(outline);
  console.log(JSON.stringify({ inputPath, outlinePath, pptxPath, slides: outline.slides.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
