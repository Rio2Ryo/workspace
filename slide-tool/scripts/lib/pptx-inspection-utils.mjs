import fs from 'node:fs';
import zlib from 'node:zlib';

export function pptxInspectWithDiagnostics(filePath) {
  try {
    return pptxInspect(filePath);
  } catch (error) {
    throw new Error(`PPTX inspection failed for ${filePath}: ${error.message}`);
  }
}

export function pptxInspect(filePath) {
  const entries = readZipEntries(filePath);
  const slideEntries = [...entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(compareNumberedXml);
  const noteEntries = [...entries.keys()]
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
    .sort(compareNumberedXml);
  const templateEntries = [...entries.keys()]
    .filter((name) => /^ppt\/(?:slideLayouts|slideMasters)\/(?:slideLayout|slideMaster)\d+\.xml$/.test(name))
    .sort(compareNumberedXml);

  const slideTexts = [];
  const noteTexts = [];
  const slideDiagnostics = [];
  const templateDiagnostics = [];
  const imageBreakdown = emptyImageBreakdown();
  const specialElementBreakdown = emptySpecialElementBreakdown();
  let hiddenTextCount = 0;

  for (const name of slideEntries) {
    const xml = entries.get(name).toString('utf8');
    const slideImageBreakdown = pptxCountPowerPointImages(xml);
    const slideSpecialElementBreakdown = pptxCountSpecialPowerPointElements(xml);
    const slideHiddenTextCount = pptxCountHiddenDrawingTextRuns(xml);
    mergeCounts(imageBreakdown, slideImageBreakdown);
    mergeCounts(specialElementBreakdown, slideSpecialElementBreakdown);
    hiddenTextCount += slideHiddenTextCount;
    slideDiagnostics.push({
      slide: numberFromXmlName(name),
      path: name,
      imageCount: totalPowerPointImages(slideImageBreakdown),
      imageBreakdown: slideImageBreakdown,
      specialElementCount: sumCounts(slideSpecialElementBreakdown),
      specialElementBreakdown: slideSpecialElementBreakdown,
      hiddenTextCount: slideHiddenTextCount,
    });
    slideTexts.push(pptxExtractDrawingText(xml));
  }

  for (const name of templateEntries) {
    const xml = entries.get(name).toString('utf8');
    const templateImageBreakdown = pptxCountPowerPointImages(xml);
    const templateSpecialElementBreakdown = pptxCountSpecialPowerPointElements(xml);
    mergeCounts(imageBreakdown, templateImageBreakdown);
    mergeCounts(specialElementBreakdown, templateSpecialElementBreakdown);
    templateDiagnostics.push({
      path: name,
      imageCount: totalPowerPointImages(templateImageBreakdown),
      imageBreakdown: templateImageBreakdown,
      specialElementCount: sumCounts(templateSpecialElementBreakdown),
      specialElementBreakdown: templateSpecialElementBreakdown,
    });
  }

  for (const name of noteEntries) {
    noteTexts.push(pptxExtractDrawingText(entries.get(name).toString('utf8')));
  }

  return {
    count: slideEntries.length,
    text: slideTexts.join(' '),
    notesCount: noteEntries.length,
    notesText: noteTexts.join(' '),
    imageCount: totalPowerPointImages(imageBreakdown),
    imageBreakdown,
    specialElementCount: sumCounts(specialElementBreakdown),
    specialElementBreakdown,
    hiddenTextCount,
    slideDiagnostics,
    templateDiagnostics,
  };
}

export function pptxCountPowerPointImages(xml) {
  const picture = countMatches(xml, /<p:pic\b/g);
  const background = countMatches(xml, /<p:bg\b[\s\S]*?<a:blip\b/g);
  const blipReference = countMatches(xml, /<a:blip\b/g);
  return {
    picture,
    background,
    blipReference,
    embeddedBlip: Math.max(0, blipReference - picture - background),
  };
}

export function pptxCountSpecialPowerPointElements(xml) {
  return {
    chart: countMatches(xml, /<c:chart\b/g),
    ole: countMatches(xml, /<p:oleObj\b/g),
    contentPart: countMatches(xml, /<p:contentPart\b/g),
    video: countMatches(xml, /<a:videoFile\b/g),
    audio: countMatches(xml, /<a:audioFile\b/g),
    media: countMatches(xml, /<p:media\b/g),
    smartArt: countMatches(xml, /<dgm:relIds\b/g),
    alternateContent: countMatches(xml, /<mc:AlternateContent\b/g),
    model3d: countMatches(xml, /<(?!\/)[^<\s:>]+:model3d\b/gi),
  };
}

export function pptxCountHiddenDrawingTextRuns(xml) {
  return [...xml.matchAll(/<a:r\b[\s\S]*?<\/a:r>/g)]
    .filter((match) => {
      const run = match[0];
      const text = run.match(/<a:t[^>]*>(.*?)<\/a:t>/s)?.[1] || '';
      if (!normalizeComparable(xmlUnescape(text.replace(/<[^>]+>/g, ' ')))) return false;
      const runProperties = run.match(/<a:rPr\b[\s\S]*?(?:<\/a:rPr>|\/>)/)?.[0] || '';
      return runPropertiesHideText(runProperties);
    })
    .length;
}

export function pptxFormatBreakdown(counts) {
  const details = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}:${count}`)
    .join(', ');
  return details || 'none';
}

export function pptxFormatObjectDiagnostics(pptxInfo, kind = 'image') {
  const slideDetails = formatSlideDiagnostics(pptxInfo.slideDiagnostics, kind);
  const templateDetails = formatTemplateDiagnostics(pptxInfo.templateDiagnostics, kind);
  return `${slideDetails}; ${templateDetails}`;
}

export function pptxFormatHiddenTextDiagnostics(pptxInfo) {
  const details = (pptxInfo.slideDiagnostics || [])
    .filter((slide) => Number(slide.hiddenTextCount || 0) > 0)
    .map((slide) => `slide ${slide.slide}:hiddenText:${slide.hiddenTextCount}`)
    .join('; ');
  return details || 'slides:none';
}

export function pptxExtractDrawingText(xml) {
  return [...xml.matchAll(/<a:t[^>]*>(.*?)<\/a:t>/gs)]
    .map((match) => xmlUnescape(match[1].replace(/<[^>]+>/g, ' ')))
    .join(' ');
}

function emptyImageBreakdown() {
  return { picture: 0, background: 0, blipReference: 0, embeddedBlip: 0 };
}

function totalPowerPointImages(imageBreakdown) {
  return imageBreakdown.picture + imageBreakdown.background + imageBreakdown.embeddedBlip;
}

function runPropertiesHideText(runProperties) {
  return /\bsz="0"/.test(runProperties)
    || /<a:noFill\b/.test(runProperties)
    || /<a:alpha\b[^>]*\bval="0"/.test(runProperties);
}

function emptySpecialElementBreakdown() {
  return { chart: 0, ole: 0, contentPart: 0, video: 0, audio: 0, media: 0, smartArt: 0, alternateContent: 0, model3d: 0 };
}

function mergeCounts(target, counts) {
  for (const key of Object.keys(target)) target[key] += counts[key] || 0;
}

function sumCounts(counts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function formatSlideDiagnostics(slideDiagnostics = [], kind = 'image') {
  const countField = kind === 'special' ? 'specialElementCount' : 'imageCount';
  const breakdownField = kind === 'special' ? 'specialElementBreakdown' : 'imageBreakdown';
  const details = slideDiagnostics
    .filter((slide) => slide[countField] > 0)
    .map((slide) => `slide ${slide.slide}:${pptxFormatBreakdown(slide[breakdownField])}`)
    .join('; ');
  return details || 'slides:none';
}

function formatTemplateDiagnostics(templateDiagnostics = [], kind = 'image') {
  const countField = kind === 'special' ? 'specialElementCount' : 'imageCount';
  const breakdownField = kind === 'special' ? 'specialElementBreakdown' : 'imageBreakdown';
  const details = templateDiagnostics
    .filter((template) => template[countField] > 0)
    .map((template) => `${template.path}:${pptxFormatBreakdown(template[breakdownField])}`)
    .join('; ');
  return details ? `templates:${details}` : 'templates:none';
}

function readZipEntries(filePath) {
  const buffer = fs.readFileSync(filePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`invalid ZIP central directory at offset ${offset}`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');

    entries.set(fileName, readZipEntry(buffer, localHeaderOffset, compressedSize, method));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer, localHeaderOffset, compressedSize, method) {
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error(`invalid ZIP local header at offset ${localHeaderOffset}`);
  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return Buffer.from(compressed);
  if (method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`unsupported ZIP compression method: ${method}`);
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('ZIP end of central directory not found');
}

function compareNumberedXml(a, b) {
  return numberFromXmlName(a) - numberFromXmlName(b);
}

function numberFromXmlName(name) {
  return Number(name.match(/(\d+)\.xml$/)?.[1] || 0);
}

function xmlUnescape(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeComparable(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
