import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pptxCountHiddenDrawingTextRuns,
  pptxCountPowerPointImages,
  pptxCountSpecialPowerPointElements,
  pptxExtractDrawingText,
  pptxFormatBreakdown,
  pptxFormatHiddenTextDiagnostics,
  pptxFormatObjectDiagnostics,
} from '../scripts/lib/pptx-inspection-utils.mjs';

test('PPTX inspection utilities count images and special elements from XML', () => {
  assert.deepEqual(pptxCountPowerPointImages(`
    <p:pic><p:blipFill><a:blip r:embed="rIdPic"/></p:blipFill></p:pic>
    <p:bg><p:bgPr><a:blipFill><a:blip r:embed="rIdBg"/></a:blipFill></p:bgPr></p:bg>
    <p:sp><a:blip r:embed="rIdShape"/></p:sp>
  `), {
    picture: 1,
    background: 1,
    blipReference: 3,
    embeddedBlip: 1,
  });

  assert.deepEqual(pptxCountSpecialPowerPointElements(`
    <c:chart/><p:oleObj/><p:contentPart/><a:videoFile/><a:audioFile/><p:media/>
    <dgm:relIds/><mc:AlternateContent/><am3d:model3d/>
  `), {
    chart: 1,
    ole: 1,
    contentPart: 1,
    video: 1,
    audio: 1,
    media: 1,
    smartArt: 1,
    alternateContent: 1,
    model3d: 1,
  });
});

test('PPTX inspection utilities extract visible text and count hidden text runs', () => {
  const xml = `
    <a:r><a:rPr sz="0"/><a:t>Hidden &amp; counted</a:t></a:r>
    <a:r><a:rPr><a:noFill/></a:rPr><a:t>No fill</a:t></a:r>
    <a:r><a:rPr><a:alpha val="0"/></a:rPr><a:t>Transparent</a:t></a:r>
    <a:r><a:rPr sz="0"/><a:t>   </a:t></a:r>
    <a:r><a:rPr/><a:t>Visible &lt;text&gt;</a:t></a:r>
  `;

  assert.equal(pptxCountHiddenDrawingTextRuns(xml), 3);
  assert.equal(pptxExtractDrawingText(xml).replace(/\s+/g, ' ').trim(), 'Hidden & counted No fill Transparent Visible <text>');
});

test('PPTX inspection utilities format object and hidden-text diagnostics', () => {
  const pptxInfo = {
    slideDiagnostics: [
      {
        slide: 1,
        imageCount: 2,
        imageBreakdown: { picture: 1, background: 0, blipReference: 2, embeddedBlip: 1 },
        specialElementCount: 1,
        specialElementBreakdown: { chart: 1, ole: 0 },
        hiddenTextCount: 2,
      },
    ],
    templateDiagnostics: [
      {
        path: 'ppt/slideLayouts/slideLayout1.xml',
        imageCount: 1,
        imageBreakdown: { picture: 0, background: 1, blipReference: 1, embeddedBlip: 0 },
        specialElementCount: 0,
        specialElementBreakdown: { chart: 0, ole: 0 },
      },
    ],
  };

  assert.equal(pptxFormatBreakdown({ picture: 0, background: 0 }), 'none');
  assert.equal(pptxFormatObjectDiagnostics(pptxInfo, 'image'), 'slide 1:picture:1, blipReference:2, embeddedBlip:1; templates:ppt/slideLayouts/slideLayout1.xml:background:1, blipReference:1');
  assert.equal(pptxFormatObjectDiagnostics(pptxInfo, 'special'), 'slide 1:chart:1; templates:none');
  assert.equal(pptxFormatHiddenTextDiagnostics(pptxInfo), 'slide 1:hiddenText:2');
});
