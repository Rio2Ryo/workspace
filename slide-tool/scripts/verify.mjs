import fs from 'node:fs';
import {
  htmlSlideClippingRiskErrors,
  htmlSlideCount,
  htmlSlideVisibilityErrors,
  htmlVisibleText,
} from './lib/html-verify-utils.mjs';
import {
  outlineSchemaDeckArtifactErrors,
  outlineSchemaImagePromptErrors,
  outlineSchemaImagePromptSlideNumberErrors,
} from './lib/outline-schema-utils.mjs';
import {
  pptxFormatBreakdown,
  pptxFormatHiddenTextDiagnostics,
  pptxFormatObjectDiagnostics,
  pptxInspectWithDiagnostics,
} from './lib/pptx-inspection-utils.mjs';
import { screenshotInspectOptional } from './lib/screenshot-utils.mjs';
import { deliveryManifestDeckVerificationPayload } from './lib/delivery-manifest-utils.mjs';

const [outDir, name = 'deck'] = process.argv.slice(2);
if (!outDir) {
  console.error('Usage: node slide-tool/scripts/verify.mjs <out-dir> <name>');
  process.exit(2);
}

const paths = deckPaths(outDir, name);

try {
  main();
} catch (error) {
  fail([error.message]);
}

function main() {
  for (const [key, file] of Object.entries(requiredDeckPaths(paths))) {
    if (!fs.existsSync(file)) throw new Error(`${key} missing: ${file}`);
  }

  const outline = JSON.parse(fs.readFileSync(paths.outline, 'utf8'));
  const prompts = JSON.parse(fs.readFileSync(paths.prompts, 'utf8'));
  const schemaErrors = [
    ...outlineSchemaDeckArtifactErrors(outline),
    ...outlineSchemaImagePromptErrors(prompts),
  ];
  if (schemaErrors.length) fail(schemaErrors);

  const html = fs.readFileSync(paths.html, 'utf8');
  const htmlSlides = htmlSlideCount(html);
  const htmlVisible = htmlVisibleText(html);
  const htmlVisibilityErrors = htmlSlideVisibilityErrors(html);
  const htmlClippingErrors = htmlSlideClippingRiskErrors(html);
  const screenshotInfo = screenshotInspectOptional(paths.screenshot);

  const pptxInfo = pptxInspectWithDiagnostics(paths.pptx);
  const pptxSlides = Number(pptxInfo.count);
  const pptxText = pptxInfo.text || '';
  const pptxNotesText = pptxInfo.notesText || '';
  const normalizedHtmlVisible = normalizeComparable(htmlVisible);
  const normalizedPptxText = normalizeComparable(pptxText);
  const normalizedPptxNotesText = normalizeComparable(pptxNotesText);
  const expected = outline.slides.length;
  const errors = [];
  errors.push(...htmlVisibilityErrors);
  errors.push(...htmlClippingErrors);
  errors.push(...screenshotInfo.errors);
  if (htmlSlides !== expected) errors.push(`HTML slide count ${htmlSlides} != outline ${expected}`);
  if (pptxSlides !== expected) errors.push(`PPTX slide count ${pptxSlides} != outline ${expected}`);
  if (prompts.length !== expected) errors.push(`prompt count ${prompts.length} != outline ${expected}`);
  errors.push(...outlineSchemaImagePromptSlideNumberErrors(prompts));
  const maxImages = Number(process.env.SLIDE_TOOL_MAX_PPTX_IMAGES || 0);
  if (pptxInfo.imageCount > maxImages) {
    errors.push(`PPTX image count ${pptxInfo.imageCount} exceeds limit ${maxImages} (${pptxFormatBreakdown(pptxInfo.imageBreakdown)}; ${pptxFormatObjectDiagnostics(pptxInfo, 'image')}); editable decks should not hide body content in images`);
  }
  const maxSpecialElements = Number(process.env.SLIDE_TOOL_MAX_PPTX_SPECIAL_ELEMENTS || 0);
  if (pptxInfo.specialElementCount > maxSpecialElements) {
    errors.push(`PPTX special element count ${pptxInfo.specialElementCount} exceeds limit ${maxSpecialElements} (${pptxFormatBreakdown(pptxInfo.specialElementBreakdown)}; ${pptxFormatObjectDiagnostics(pptxInfo, 'special')}); charts/media/OLE/SmartArt/3D models need explicit QA because body content can hide in non-text objects`);
  }
  if (pptxInfo.hiddenTextCount > 0) {
    errors.push(`PPTX hidden text count ${pptxInfo.hiddenTextCount} exceeds limit 0 (${pptxFormatHiddenTextDiagnostics(pptxInfo)}); hidden text can mask image-only body content and should not satisfy editable text QA`);
  }
  for (const [index, slide] of outline.slides.entries()) {
    const title = String(slide.title || '').trim();
    const normalizedTitle = normalizeComparable(title);
    if (!title) errors.push(`outline slide ${index + 1} missing title`);
    if (title && !normalizedHtmlVisible.includes(normalizedTitle)) errors.push(`HTML missing slide title: ${title}`);
    if (title && !normalizedPptxText.includes(normalizedTitle)) errors.push(`PPTX missing slide title: ${title}`);
    for (const expectedText of expectedEditableTexts(slide)) {
      const normalizedExpected = normalizeComparable(expectedText);
      if (!normalizedHtmlVisible.includes(normalizedExpected)) errors.push(`HTML missing expected slide text: ${expectedText}`);
      if (!normalizedPptxText.includes(normalizedExpected)) errors.push(`PPTX missing editable slide text: ${expectedText}`);
    }
    const speakerNotes = String(slide.speakerNotes || slide.notes || '').replace(/\s+/g, ' ').trim();
    if (speakerNotes) {
      const normalizedSpeakerNotes = normalizeComparable(speakerNotes);
      if (!normalizedHtmlVisible.includes(normalizedSpeakerNotes)) errors.push(`HTML missing speaker notes: ${speakerNotes}`);
      if (!normalizedPptxNotesText.includes(normalizedSpeakerNotes)) errors.push(`PPTX missing speaker notes: ${speakerNotes}`);
    }
    if (prompts[index] && prompts[index].title && prompts[index].title !== title) {
      errors.push(`prompt title mismatch at slide ${index + 1}: ${prompts[index].title} != ${title}`);
    }
  }

  const result = deliveryManifestDeckVerificationPayload({
    outlineSlides: expected,
    slideTitles: outline.slides.map((slide) => slide.title),
    htmlSlides,
    pptxSlides,
    promptCount: prompts.length,
    promptSlides: prompts.map((prompt) => prompt?.slide ?? null),
    notesCount: pptxInfo.notesCount,
    imageCount: pptxInfo.imageCount,
    imageBreakdown: pptxInfo.imageBreakdown,
    specialElementCount: pptxInfo.specialElementCount,
    specialElementBreakdown: pptxInfo.specialElementBreakdown,
    hiddenTextCount: pptxInfo.hiddenTextCount,
    slideDiagnostics: pptxInfo.slideDiagnostics,
    templateDiagnostics: pptxInfo.templateDiagnostics,
    screenshot: screenshotInfo.present ? {
      path: paths.screenshot,
      bytes: screenshotInfo.bytes,
      width: screenshotInfo.width,
      height: screenshotInfo.height,
      uniqueSampledColors: screenshotInfo.uniqueSampledColors,
    } : null,
    pptxBytes: fs.statSync(paths.pptx).size,
    errors: [],
  });

  if (errors.length) fail(errors, result);

  console.log(JSON.stringify(result, null, 2));
}

function deckPaths(directory, basename) {
  return {
    outline: `${directory}/${basename}.outline.json`,
    html: `${directory}/${basename}.preview.html`,
    screenshot: `${directory}/${basename}.preview.png`,
    pptx: `${directory}/${basename}.editable.pptx`,
    prompts: `${directory}/${basename}.image-prompts.json`,
  };
}

function requiredDeckPaths(allPaths) {
  const { screenshot, ...required } = allPaths;
  return required;
}

function fail(errors, result = {}) {
  console.error(JSON.stringify(deliveryManifestDeckVerificationPayload({
    ...result,
    ok: false,
    paths,
    errors,
  }), null, 2));
  process.exit(1);
}

function normalizeComparable(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function countOccurrences(source, pattern) {
  return source.split(pattern).length - 1;
}

function expectedEditableTexts(slide) {
  const texts = [];
  const add = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text && !texts.includes(text)) texts.push(text);
  };

  add(slide.title);
  add(slide.subtitle);
  add(slide.claim);

  if (slide.type === 'cover') {
    for (const bullet of (slide.bullets || []).slice(0, 3)) add(bullet);
    return texts;
  }

  if (slide.type === 'process' || !Array.isArray(slide.columns) || slide.columns.length === 0) {
    for (const bullet of slide.bullets || []) add(bullet);
    return texts;
  }

  for (const column of slide.columns) {
    add(column.title);
    add(column.body);
    for (const bullet of column.bullets || []) add(bullet);
  }

  return texts;
}
