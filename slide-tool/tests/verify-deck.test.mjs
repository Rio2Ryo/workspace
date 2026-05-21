import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import pptxgen from '../pptxgenjs.mjs';
import JSZip from 'jszip';
import { slideToolScript } from './test-paths.mjs';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';

const script = slideToolScript('verify.mjs');
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

async function makeDeckFixture(name, outlineTitles, htmlTitles, pptxTitles, promptTitles = outlineTitles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-test-'));
  fs.writeFileSync(path.join(dir, `${name}.outline.json`), JSON.stringify({
    title: name,
    slides: outlineTitles.map((title) => ({ title })),
  }));
  fs.writeFileSync(path.join(dir, `${name}.preview.html`), `<!doctype html><html><body>${htmlTitles.map((title) => `<section class="slide">${title}</section>`).join('')}</body></html>`);
  fs.writeFileSync(path.join(dir, `${name}.image-prompts.json`), JSON.stringify(promptTitles.map((title, index) => ({ slide: index + 1, title }))));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  for (const title of pptxTitles) {
    const slide = pptx.addSlide();
    slide.addText(title, { x: 1, y: 1, w: 8, h: 1 });
  }
  await pptx.writeFile({ fileName: path.join(dir, `${name}.editable.pptx`) });
  return dir;
}

function runVerifier(dir, name, options = {}) {
  return runNodeScript(script, [dir, name], options);
}

function parseVerifierOutput(result) {
  return parseCommandJson(result, 'stdout', 'verify');
}

function parseVerifierError(result) {
  return parseCommandJson(result, 'stderr', 'verify');
}

function solidPng(width, height, [red, green, blue, alpha = 255]) {
  const scanline = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x += 1) {
    scanline[1 + x * 4] = red;
    scanline[1 + x * 4 + 1] = green;
    scanline[1 + x * 4 + 2] = blue;
    scanline[1 + x * 4 + 3] = alpha;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.concat([
      uint32be(width),
      uint32be(height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => scanline)))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([
    uint32be(data.length),
    typeBuffer,
    data,
    uint32be(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
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

test('verify deck accepts class="slide" and matching titles', async () => {
  const titles = ['Required Slide One', 'Required Slide Two'];
  const dir = await makeDeckFixture('good', titles, titles, titles);
  const result = runVerifier(dir, 'good');
  assert.equal(result.status, 0, result.stderr);
  const report = parseVerifierOutput(result);
  assert.equal(report.ok, true);
  assert.deepEqual(report.slideDiagnostics, [
    {
      slide: 1,
      path: 'ppt/slides/slide1.xml',
      imageCount: 0,
      imageBreakdown: { picture: 0, background: 0, blipReference: 0, embeddedBlip: 0 },
      specialElementCount: 0,
      specialElementBreakdown: {
        chart: 0,
        ole: 0,
        contentPart: 0,
        video: 0,
        audio: 0,
        media: 0,
        smartArt: 0,
        alternateContent: 0,
        model3d: 0,
      },
      hiddenTextCount: 0,
    },
    {
      slide: 2,
      path: 'ppt/slides/slide2.xml',
      imageCount: 0,
      imageBreakdown: { picture: 0, background: 0, blipReference: 0, embeddedBlip: 0 },
      specialElementCount: 0,
      specialElementBreakdown: {
        chart: 0,
        ole: 0,
        contentPart: 0,
        video: 0,
        audio: 0,
        media: 0,
        smartArt: 0,
        alternateContent: 0,
        model3d: 0,
      },
      hiddenTextCount: 0,
    },
  ]);
});

test('verify deck fails when generated HTML screenshot is corrupt', async () => {
  const titles = ['Screenshot Guard'];
  const dir = await makeDeckFixture('screenshot', titles, titles, titles);
  fs.writeFileSync(path.join(dir, 'screenshot.preview.png'), 'not a png');

  const result = runVerifier(dir, 'screenshot');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /HTML screenshot QA failed/);
});

test('verify deck fails when generated HTML screenshot is visually blank', async () => {
  const titles = ['Blank Screenshot Guard'];
  const dir = await makeDeckFixture('blank', titles, titles, titles);
  fs.writeFileSync(path.join(dir, 'blank.preview.png'), solidPng(800, 450, [255, 255, 255, 255]));

  const result = runVerifier(dir, 'blank');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /pixel diversity too low/);
  assert.equal(report.screenshot.uniqueSampledColors, 1);
});

test('verify deck matches titles across line breaks and normalized whitespace', async () => {
  const outlineTitle = '出会いを、\n営業資産へ。';
  const renderedTitle = '出会いを、 営業資産へ。';
  const dir = await makeDeckFixture('newline', [outlineTitle], [renderedTitle], [renderedTitle]);
  const result = runVerifier(dir, 'newline');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parseVerifierOutput(result).ok, true);
});

test('verify deck fails when HTML and PPTX slide titles do not match outline', async () => {
  const outlineTitles = ['Required Slide One', 'Required Slide Two'];
  const wrongTitles = ['Wrong A', 'Wrong B'];
  const dir = await makeDeckFixture('bad', outlineTitles, wrongTitles, wrongTitles);
  const result = runVerifier(dir, 'bad');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /HTML missing slide title/);
  assert.match(report.errors.join('\n'), /PPTX missing slide title/);
});

test('verify deck fails when image prompt slide numbers do not match outline order', async () => {
  const titles = ['Prompt Slide One', 'Prompt Slide Two'];
  const dir = await makeDeckFixture('bad-prompts', titles, titles, titles);
  fs.writeFileSync(path.join(dir, 'bad-prompts.image-prompts.json'), JSON.stringify([
    { slide: 2, title: titles[0] },
    { slide: 2, title: titles[1] },
  ]));

  const result = runVerifier(dir, 'bad-prompts');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /prompt slide number mismatch at slide 1: 2 != 1/);
  assert.match(report.errors.join('\n'), /prompt slide number duplicate: 2/);
});

test('verify deck reports image prompt schema errors instead of runtime exceptions', async () => {
  const titles = ['Prompt Schema Slide'];
  const dir = await makeDeckFixture('bad-prompt-schema', titles, titles, titles);
  fs.writeFileSync(path.join(dir, 'bad-prompt-schema.image-prompts.json'), JSON.stringify({
    slide: 1,
    title: titles[0],
  }));

  const result = runVerifier(dir, 'bad-prompt-schema');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /image-prompts must be an array/);
  assert.doesNotMatch(report.errors.join('\n'), /entries is not a function/);
});

test('verify deck fails when HTML slide CSS hides rendered slides', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-hidden-html-test-'));
  const title = 'Hidden Slide';
  const claim = 'Claim text';
  const bullet = 'Visible in source only';
  fs.writeFileSync(path.join(dir, 'hidden.outline.json'), JSON.stringify({
    title: 'hidden',
    slides: [{ title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'hidden.preview.html'), `<!doctype html><html><head><style>.slide{display:none}</style></head><body><section class="slide"><h1>${title}</h1><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'hidden.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 1 });
  slide.addText(claim, { x: 1, y: 2, w: 8, h: 1 });
  slide.addText(bullet, { x: 1, y: 3, w: 8, h: 1 });
  await pptx.writeFile({ fileName: path.join(dir, 'hidden.editable.pptx') });

  const result = runVerifier(dir, 'hidden');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /HTML slide visibility check failed/);
});

test('verify deck fails when tagged HTML slide selector hides rendered slides', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-tagged-hidden-html-test-'));
  const title = 'Tagged Hidden Slide';
  const claim = 'Claim text';
  const bullet = 'Hidden by tagged selector';
  fs.writeFileSync(path.join(dir, 'hidden.outline.json'), JSON.stringify({
    title: 'hidden',
    slides: [{ title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'hidden.preview.html'), `<!doctype html><html><head><style>section.slide{display:none}</style></head><body><section class="slide"><h1>${title}</h1><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'hidden.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 1 });
  slide.addText(claim, { x: 1, y: 2, w: 8, h: 1 });
  slide.addText(bullet, { x: 1, y: 3, w: 8, h: 1 });
  await pptx.writeFile({ fileName: path.join(dir, 'hidden.editable.pptx') });

  const result = runVerifier(dir, 'hidden');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /HTML slide visibility check failed/);
});

test('verify deck fails when CSS hides core slide text elements', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-hidden-title-test-'));
  const title = 'Hidden Title Slide';
  const claim = 'Claim text';
  const bullet = 'Body remains visible';
  fs.writeFileSync(path.join(dir, 'hidden.outline.json'), JSON.stringify({
    title: 'hidden',
    slides: [{ title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'hidden.preview.html'), `<!doctype html><html><head><style>h1{display:none}</style></head><body><section class="slide"><h1>${title}</h1><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'hidden.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 1 });
  slide.addText(claim, { x: 1, y: 2, w: 8, h: 1 });
  slide.addText(bullet, { x: 1, y: 3, w: 8, h: 1 });
  await pptx.writeFile({ fileName: path.join(dir, 'hidden.editable.pptx') });

  const result = runVerifier(dir, 'hidden');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /CSS rule hides core slide text elements/);
});

test('verify deck fails when CSS makes core slide text unreadable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-unreadable-title-test-'));
  const title = 'Zero Font Slide';
  const claim = 'Claim text';
  const bullet = 'Body remains visible';
  fs.writeFileSync(path.join(dir, 'hidden.outline.json'), JSON.stringify({
    title: 'hidden',
    slides: [{ title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'hidden.preview.html'), `<!doctype html><html><head><style>h1{font-size:0}.claim{color:transparent}</style></head><body><section class="slide"><h1>${title}</h1><p class="claim">${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'hidden.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 1 });
  slide.addText(claim, { x: 1, y: 2, w: 8, h: 1 });
  slide.addText(bullet, { x: 1, y: 3, w: 8, h: 1 });
  await pptx.writeFile({ fileName: path.join(dir, 'hidden.editable.pptx') });

  const result = runVerifier(dir, 'hidden');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /CSS rule hides core slide text elements/);
});

test('verify deck fails when inline style makes core slide text unreadable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-inline-unreadable-title-test-'));
  const title = 'Inline Zero Slide';
  const claim = 'Claim text';
  const bullet = 'Body remains visible';
  fs.writeFileSync(path.join(dir, 'hidden.outline.json'), JSON.stringify({
    title: 'hidden',
    slides: [{ title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'hidden.preview.html'), `<!doctype html><html><body><section class="slide"><h1 style="font-size:0">${title}</h1><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'hidden.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 1 });
  slide.addText(claim, { x: 1, y: 2, w: 8, h: 1 });
  slide.addText(bullet, { x: 1, y: 3, w: 8, h: 1 });
  await pptx.writeFile({ fileName: path.join(dir, 'hidden.editable.pptx') });

  const result = runVerifier(dir, 'hidden');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /inline style hides core slide text elements/);
});

test('verify deck fails when overflow hidden can clip long core slide text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-clipping-risk-test-'));
  const title = 'This title is intentionally far too long for a single slide title area and should be flagged because overflow hidden can clip it in the HTML preview before anyone notices during Discord review loops';
  const claim = 'Claim text';
  const bullet = 'Body remains present';
  fs.writeFileSync(path.join(dir, 'clip.outline.json'), JSON.stringify({
    title: 'clip',
    slides: [{ title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'clip.preview.html'), `<!doctype html><html><head><style>.slide{overflow:hidden}</style></head><body><section class="slide"><h1>${title}</h1><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'clip.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 1 });
  slide.addText(claim, { x: 1, y: 2, w: 8, h: 1 });
  slide.addText(bullet, { x: 1, y: 3, w: 8, h: 1 });
  await pptx.writeFile({ fileName: path.join(dir, 'clip.editable.pptx') });

  const result = runVerifier(dir, 'clip');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /HTML clipping risk/);
});

test('verify deck fails when body text is image-only in PPTX', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-image-body-test-'));
  const title = '課題';
  const claim = '本文は編集可能であるべき';
  const bullet = 'この重要本文が画像化されると編集できない';
  fs.writeFileSync(path.join(dir, 'bad.outline.json'), JSON.stringify({
    title: 'bad',
    slides: [{ type: 'section', title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'bad.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'bad.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pngPath = path.join(dir, 'body-as-image.png');
  const transparentPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQn7WQAAAABJRU5ErkJggg==';
  fs.writeFileSync(pngPath, Buffer.from(transparentPixel, 'base64'));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 1 });
  slide.addImage({ path: pngPath, x: 1, y: 2, w: 6, h: 3 });
  await pptx.writeFile({ fileName: path.join(dir, 'bad.editable.pptx') });

  const result = runVerifier(dir, 'bad');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /PPTX missing editable slide text/);
  assert.match(report.errors.join('\n'), new RegExp(claim));
});

test('verify deck fails when image-based body is masked by hidden PPTX text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-hidden-pptx-text-test-'));
  const title = 'Hidden Text Slide';
  const claim = '本文は画像ではなく編集可能であるべき';
  const bullet = '透明テキストで検証をすり抜けてはいけない';
  fs.writeFileSync(path.join(dir, 'hidden.outline.json'), JSON.stringify({
    title: 'hidden',
    slides: [{ type: 'section', title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'hidden.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'hidden.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pngPath = path.join(dir, 'body-as-image.png');
  const transparentPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQn7WQAAAABJRU5ErkJggg==';
  fs.writeFileSync(pngPath, Buffer.from(transparentPixel, 'base64'));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.7, w: 8, h: 0.5 });
  slide.addImage({ path: pngPath, x: 1, y: 1.4, w: 6, h: 3 });
  const pptxPath = path.join(dir, 'hidden.editable.pptx');
  await pptx.writeFile({ fileName: pptxPath });

  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
  const hiddenTextBox = `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="902" name="Hidden verifier text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr sz="0"><a:solidFill><a:srgbClr val="000000"><a:alpha val="0"/></a:srgbClr></a:solidFill></a:rPr><a:t>${claim}</a:t></a:r></a:p>
        <a:p><a:r><a:rPr><a:noFill/></a:rPr><a:t>${bullet}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>`;
  zip.file('ppt/slides/slide1.xml', slideXml.replace('</p:spTree>', `${hiddenTextBox}</p:spTree>`));
  fs.writeFileSync(pptxPath, await zip.generateAsync({ type: 'nodebuffer' }));

  const result = runVerifier(dir, 'hidden', {
    env: { ...process.env, SLIDE_TOOL_MAX_PPTX_IMAGES: '1' },
  });
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.equal(report.hiddenTextCount, 2);
  assert.equal(report.slideDiagnostics[0].hiddenTextCount, 2);
  assert.match(report.errors.join('\n'), /PPTX hidden text count 2/);
  assert.match(report.errors.join('\n'), /slide 1:hiddenText:2/);
});

test('verify deck fails when speaker notes are missing from PPTX notes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-notes-test-'));
  const title = '課題';
  const claim = '本文は編集可能';
  const bullet = '本文もある';
  const speakerNotes = 'このspeaker notesが必要';
  fs.writeFileSync(path.join(dir, 'bad.outline.json'), JSON.stringify({
    title: 'bad',
    slides: [{ type: 'section', title, claim, bullets: [bullet], speakerNotes }],
  }));
  fs.writeFileSync(path.join(dir, 'bad.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p><aside>${speakerNotes}</aside></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'bad.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 0.5 });
  slide.addText(claim, { x: 1, y: 1.7, w: 8, h: 0.5 });
  slide.addText(bullet, { x: 1, y: 2.4, w: 8, h: 0.5 });
  await pptx.writeFile({ fileName: path.join(dir, 'bad.editable.pptx') });

  const result = runVerifier(dir, 'bad');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /PPTX missing speaker notes/);
});

test('verify deck passes when speaker notes are present in PPTX notes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-notes-good-test-'));
  const title = '課題';
  const claim = '本文は編集可能';
  const bullet = '本文もある';
  const speakerNotes = 'このspeaker notesが必要';
  fs.writeFileSync(path.join(dir, 'good.outline.json'), JSON.stringify({
    title: 'good',
    slides: [{ type: 'section', title, claim, bullets: [bullet], speakerNotes }],
  }));
  fs.writeFileSync(path.join(dir, 'good.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p><aside>${speakerNotes}</aside></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'good.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 8, h: 0.5 });
  slide.addText(claim, { x: 1, y: 1.7, w: 8, h: 0.5 });
  slide.addText(bullet, { x: 1, y: 2.4, w: 8, h: 0.5 });
  slide.addNotes(speakerNotes);
  await pptx.writeFile({ fileName: path.join(dir, 'good.editable.pptx') });

  const result = runVerifier(dir, 'good');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parseVerifierOutput(result).ok, true);
});

test('verify deck fails when PPTX contains images by default', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-image-count-test-'));
  const title = '課題';
  const claim = '本文は編集可能';
  const bullet = '本文もある';
  const speakerNotes = 'notesもある';
  fs.writeFileSync(path.join(dir, 'bad.outline.json'), JSON.stringify({
    title: 'bad',
    slides: [{ type: 'section', title, claim, bullets: [bullet], speakerNotes }],
  }));
  fs.writeFileSync(path.join(dir, 'bad.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p><aside>${speakerNotes}</aside></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'bad.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pngPath = path.join(dir, 'tiny.png');
  const transparentPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQn7WQAAAABJRU5ErkJggg==';
  fs.writeFileSync(pngPath, Buffer.from(transparentPixel, 'base64'));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.6, w: 8, h: 0.4 });
  slide.addText(claim, { x: 1, y: 1.1, w: 8, h: 0.4 });
  slide.addText(bullet, { x: 1, y: 1.6, w: 8, h: 0.4 });
  slide.addImage({ path: pngPath, x: 1, y: 2.2, w: 0.25, h: 0.25 });
  slide.addNotes(speakerNotes);
  await pptx.writeFile({ fileName: path.join(dir, 'bad.editable.pptx') });

  const result = runVerifier(dir, 'bad');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.equal(report.imageCount, 1);
  assert.deepEqual(report.imageBreakdown, { picture: 1, background: 0, blipReference: 1, embeddedBlip: 0 });
  assert.equal(report.slideDiagnostics[0].imageCount, 1);
  assert.deepEqual(report.slideDiagnostics[0].imageBreakdown, { picture: 1, background: 0, blipReference: 1, embeddedBlip: 0 });
  assert.match(report.errors.join('\n'), /PPTX image count/);
  assert.match(report.errors.join('\n'), /slide 1:picture:1/);
});

test('verify deck fails when PPTX contains a background image by default', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-background-image-test-'));
  const title = 'Background Image Slide';
  const claim = 'Text remains editable';
  const bullet = 'Background image should be counted';
  fs.writeFileSync(path.join(dir, 'bg.outline.json'), JSON.stringify({
    title: 'bg',
    slides: [{ type: 'section', title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'bg.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'bg.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pngPath = path.join(dir, 'tiny.png');
  const transparentPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQn7WQAAAABJRU5ErkJggg==';
  fs.writeFileSync(pngPath, Buffer.from(transparentPixel, 'base64'));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.background = { path: pngPath };
  slide.addText(title, { x: 1, y: 0.5, w: 8, h: 0.5 });
  slide.addText(claim, { x: 1, y: 1.1, w: 8, h: 0.5 });
  slide.addText(bullet, { x: 1, y: 1.7, w: 8, h: 0.5 });
  await pptx.writeFile({ fileName: path.join(dir, 'bg.editable.pptx') });

  const result = runVerifier(dir, 'bg');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.equal(report.imageCount, 1);
  assert.deepEqual(report.imageBreakdown, { picture: 0, background: 1, blipReference: 1, embeddedBlip: 0 });
  assert.equal(report.slideDiagnostics[0].imageCount, 1);
  assert.deepEqual(report.slideDiagnostics[0].imageBreakdown, { picture: 0, background: 1, blipReference: 1, embeddedBlip: 0 });
  assert.match(report.errors.join('\n'), /PPTX image count/);
  assert.match(report.errors.join('\n'), /background:1/);
  assert.match(report.errors.join('\n'), /slide 1:background:1/);
});

test('verify deck fails when PPTX template layouts contain images by default', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-layout-image-test-'));
  const title = 'Layout Image Slide';
  fs.writeFileSync(path.join(dir, 'layout.outline.json'), JSON.stringify({
    title: 'layout',
    slides: [{ title }],
  }));
  fs.writeFileSync(path.join(dir, 'layout.preview.html'), `<!doctype html><html><body><section class="slide">${title}</section></body></html>`);
  fs.writeFileSync(path.join(dir, 'layout.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.5, w: 8, h: 0.5 });
  const pptxPath = path.join(dir, 'layout.editable.pptx');
  await pptx.writeFile({ fileName: pptxPath });

  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const layoutPath = Object.keys(zip.files).find((file) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(file));
  assert.ok(layoutPath, 'fixture should contain at least one slide layout XML file');
  const layoutXml = await zip.file(layoutPath).async('string');
  zip.file(layoutPath, layoutXml.replace('</p:cSld>', '<p:bg><p:bgPr><a:blipFill><a:blip r:embed="rIdInjected"/></a:blipFill></p:bgPr></p:bg></p:cSld>'));
  fs.writeFileSync(pptxPath, await zip.generateAsync({ type: 'nodebuffer' }));

  const result = runVerifier(dir, 'layout');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.equal(report.imageCount, 1);
  assert.deepEqual(report.imageBreakdown, { picture: 0, background: 1, blipReference: 1, embeddedBlip: 0 });
  assert.equal(report.slideDiagnostics[0].imageCount, 0);
  assert.equal(report.templateDiagnostics.find((template) => template.path === layoutPath).imageCount, 1);
  assert.match(report.errors.join('\n'), /PPTX image count/);
  assert.match(report.errors.join('\n'), /templates:ppt\/slideLayouts\/slideLayout\d+\.xml:background:1/);
});

test('verify deck fails when PPTX hides an image in a shape blip fill', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-shape-blip-image-test-'));
  const title = 'Shape Blip Slide';
  const claim = 'Text remains editable';
  const bullet = 'A shape fill image should still be counted';
  fs.writeFileSync(path.join(dir, 'shape.outline.json'), JSON.stringify({
    title: 'shape',
    slides: [{ type: 'section', title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'shape.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'shape.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.5, w: 8, h: 0.5 });
  slide.addText(claim, { x: 1, y: 1.1, w: 8, h: 0.5 });
  slide.addText(bullet, { x: 1, y: 1.7, w: 8, h: 0.5 });
  const pptxPath = path.join(dir, 'shape.editable.pptx');
  await pptx.writeFile({ fileName: pptxPath });

  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
  const injectedShape = `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="900" name="Injected image fill"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:blipFill><a:blip r:embed="rIdInjectedShapeImage"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>`;
  zip.file('ppt/slides/slide1.xml', slideXml.replace('</p:spTree>', `${injectedShape}</p:spTree>`));
  fs.writeFileSync(pptxPath, await zip.generateAsync({ type: 'nodebuffer' }));

  const result = runVerifier(dir, 'shape');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.equal(report.imageCount, 1);
  assert.deepEqual(report.imageBreakdown, { picture: 0, background: 0, blipReference: 1, embeddedBlip: 1 });
  assert.equal(report.slideDiagnostics[0].imageCount, 1);
  assert.deepEqual(report.slideDiagnostics[0].imageBreakdown, { picture: 0, background: 0, blipReference: 1, embeddedBlip: 1 });
  assert.match(report.errors.join('\n'), /PPTX image count/);
  assert.match(report.errors.join('\n'), /embeddedBlip:1/);
  assert.match(report.errors.join('\n'), /slide 1:.*embeddedBlip:1/);
});

test('verify deck fails when PPTX contains special elements by default', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-special-elements-test-'));
  const title = 'Chart Slide';
  const claim = 'Text is editable but chart object is special';
  const bullet = 'Special element should be surfaced';
  fs.writeFileSync(path.join(dir, 'chart.outline.json'), JSON.stringify({
    title: 'chart',
    slides: [{ type: 'section', title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'chart.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'chart.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.5, w: 8, h: 0.5 });
  slide.addText(claim, { x: 1, y: 1.1, w: 8, h: 0.5 });
  slide.addText(bullet, { x: 1, y: 1.7, w: 8, h: 0.5 });
  slide.addChart(pptx.ChartType.bar, [{ name: 'A', labels: ['Q1', 'Q2'], values: [1, 2] }], { x: 1, y: 2.4, w: 4, h: 2 });
  await pptx.writeFile({ fileName: path.join(dir, 'chart.editable.pptx') });

  const result = runVerifier(dir, 'chart');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.equal(report.specialElementCount, 1);
  assert.deepEqual(report.specialElementBreakdown, {
    chart: 1,
    ole: 0,
    contentPart: 0,
    video: 0,
    audio: 0,
    media: 0,
    smartArt: 0,
    alternateContent: 0,
    model3d: 0,
  });
  assert.equal(report.slideDiagnostics[0].specialElementCount, 1);
  assert.equal(report.slideDiagnostics[0].specialElementBreakdown.chart, 1);
  assert.match(report.errors.join('\n'), /PPTX special element count/);
  assert.match(report.errors.join('\n'), /chart:1/);
  assert.match(report.errors.join('\n'), /slide 1:chart:1/);
});

test('verify deck fails when PPTX contains AlternateContent extension markup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-alternate-content-test-'));
  const title = 'Extension Slide';
  const claim = 'Text is editable but extension markup is special';
  const bullet = 'AlternateContent should be surfaced';
  fs.writeFileSync(path.join(dir, 'extension.outline.json'), JSON.stringify({
    title: 'extension',
    slides: [{ type: 'section', title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'extension.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'extension.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.5, w: 8, h: 0.5 });
  slide.addText(claim, { x: 1, y: 1.1, w: 8, h: 0.5 });
  slide.addText(bullet, { x: 1, y: 1.7, w: 8, h: 0.5 });
  const pptxPath = path.join(dir, 'extension.editable.pptx');
  await pptx.writeFile({ fileName: pptxPath });

  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
  const injectedExtension = `
    <mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
      <mc:Choice Requires="p14">
        <p:sp><p:nvSpPr><p:cNvPr id="901" name="Extension object"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>
      </mc:Choice>
      <mc:Fallback/>
    </mc:AlternateContent>`;
  zip.file('ppt/slides/slide1.xml', slideXml.replace('</p:spTree>', `${injectedExtension}</p:spTree>`));
  fs.writeFileSync(pptxPath, await zip.generateAsync({ type: 'nodebuffer' }));

  const result = runVerifier(dir, 'extension');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.equal(report.specialElementCount, 1);
  assert.equal(report.specialElementBreakdown.alternateContent, 1);
  assert.equal(report.slideDiagnostics[0].specialElementCount, 1);
  assert.equal(report.slideDiagnostics[0].specialElementBreakdown.alternateContent, 1);
  assert.match(report.errors.join('\n'), /PPTX special element count/);
  assert.match(report.errors.join('\n'), /alternateContent:1/);
  assert.match(report.errors.join('\n'), /slide 1:alternateContent:1/);
});

test('verify deck fails when PPTX contains 3D model markup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-3d-model-test-'));
  const title = '3D Model Slide';
  const claim = 'Text is editable but 3D model object is special';
  const bullet = '3D model markup should be surfaced';
  fs.writeFileSync(path.join(dir, 'model.outline.json'), JSON.stringify({
    title: 'model',
    slides: [{ type: 'section', title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'model.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'model.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.5, w: 8, h: 0.5 });
  slide.addText(claim, { x: 1, y: 1.1, w: 8, h: 0.5 });
  slide.addText(bullet, { x: 1, y: 1.7, w: 8, h: 0.5 });
  const pptxPath = path.join(dir, 'model.editable.pptx');
  await pptx.writeFile({ fileName: pptxPath });

  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
  const model3d = `
    <am3d:model3D xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" r:embed="rIdModel3D">
      <am3d:camera/>
    </am3d:model3D>`;
  zip.file('ppt/slides/slide1.xml', slideXml.replace('</p:spTree>', `${model3d}</p:spTree>`));
  fs.writeFileSync(pptxPath, await zip.generateAsync({ type: 'nodebuffer' }));

  const result = runVerifier(dir, 'model');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.equal(report.specialElementCount, 1);
  assert.equal(report.specialElementBreakdown.model3d, 1);
  assert.equal(report.slideDiagnostics[0].specialElementBreakdown.model3d, 1);
  assert.match(report.errors.join('\n'), /PPTX special element count/);
  assert.match(report.errors.join('\n'), /model3d:1/);
  assert.match(report.errors.join('\n'), /slide 1:model3d:1/);
});

test('verify deck reports a concise structured error for corrupt PPTX files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-corrupt-pptx-test-'));
  fs.writeFileSync(path.join(dir, 'bad.outline.json'), JSON.stringify({
    title: 'bad',
    slides: [{ title: '課題' }],
  }));
  fs.writeFileSync(path.join(dir, 'bad.preview.html'), '<html><body><section class="slide">課題</section></body></html>');
  fs.writeFileSync(path.join(dir, 'bad.image-prompts.json'), JSON.stringify([{ slide: 1, title: '課題' }]));
  fs.writeFileSync(path.join(dir, 'bad.editable.pptx'), 'not a pptx zip');

  const result = runVerifier(dir, 'bad');
  assert.notEqual(result.status, 0);
  const report = parseVerifierError(result);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /PPTX inspection failed/);
  assert.match(report.errors.join('\n'), /ZIP end of central directory not found/);
  assert.equal(report.paths.pptx, path.join(dir, 'bad.editable.pptx'));
  assert.doesNotMatch(result.stderr, /at inspectPptx/);
});

test('verify deck allows images when explicit image limit is raised', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-image-count-allowed-test-'));
  const title = '課題';
  const claim = '本文は編集可能';
  const bullet = '本文もある';
  const speakerNotes = 'notesもある';
  fs.writeFileSync(path.join(dir, 'ok.outline.json'), JSON.stringify({
    title: 'ok',
    slides: [{ type: 'section', title, claim, bullets: [bullet], speakerNotes }],
  }));
  fs.writeFileSync(path.join(dir, 'ok.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p><aside>${speakerNotes}</aside></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'ok.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pngPath = path.join(dir, 'tiny.png');
  const transparentPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQn7WQAAAABJRU5ErkJggg==';
  fs.writeFileSync(pngPath, Buffer.from(transparentPixel, 'base64'));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.6, w: 8, h: 0.4 });
  slide.addText(claim, { x: 1, y: 1.1, w: 8, h: 0.4 });
  slide.addText(bullet, { x: 1, y: 1.6, w: 8, h: 0.4 });
  slide.addImage({ path: pngPath, x: 1, y: 2.2, w: 0.25, h: 0.25 });
  slide.addNotes(speakerNotes);
  await pptx.writeFile({ fileName: path.join(dir, 'ok.editable.pptx') });

  const result = runVerifier(dir, 'ok', {
    env: { ...process.env, SLIDE_TOOL_MAX_PPTX_IMAGES: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = parseVerifierOutput(result);
  assert.equal(report.imageCount, 1);
  assert.deepEqual(report.imageBreakdown, { picture: 1, background: 0, blipReference: 1, embeddedBlip: 0 });
  assert.equal(report.slideDiagnostics[0].imageCount, 1);
});

test('verify deck allows special elements when explicit limit is raised', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-deck-special-elements-allowed-test-'));
  const title = 'Chart Slide';
  const claim = 'Text is editable but chart object is special';
  const bullet = 'Special element is intentionally allowed';
  fs.writeFileSync(path.join(dir, 'chart.outline.json'), JSON.stringify({
    title: 'chart',
    slides: [{ type: 'section', title, claim, bullets: [bullet] }],
  }));
  fs.writeFileSync(path.join(dir, 'chart.preview.html'), `<!doctype html><html><body><section class="slide"><h2>${title}</h2><p>${claim}</p><p>${bullet}</p></section></body></html>`);
  fs.writeFileSync(path.join(dir, 'chart.image-prompts.json'), JSON.stringify([{ slide: 1, title }]));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 1, y: 0.5, w: 8, h: 0.5 });
  slide.addText(claim, { x: 1, y: 1.1, w: 8, h: 0.5 });
  slide.addText(bullet, { x: 1, y: 1.7, w: 8, h: 0.5 });
  slide.addChart(pptx.ChartType.bar, [{ name: 'A', labels: ['Q1', 'Q2'], values: [1, 2] }], { x: 1, y: 2.4, w: 4, h: 2 });
  await pptx.writeFile({ fileName: path.join(dir, 'chart.editable.pptx') });

  const result = runVerifier(dir, 'chart', {
    env: { ...process.env, SLIDE_TOOL_MAX_PPTX_SPECIAL_ELEMENTS: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = parseVerifierOutput(result);
  assert.equal(report.specialElementCount, 1);
  assert.equal(report.specialElementBreakdown.chart, 1);
  assert.equal(report.slideDiagnostics[0].specialElementBreakdown.chart, 1);
});
