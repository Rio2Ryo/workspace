import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  artifactManifestArtifactValidationErrors,
  artifactManifestDuplicateIdentityErrors,
  artifactManifestValidationErrors,
  artifactManifestVerificationPolicyErrors,
  normalizeArtifactManifestDir,
} from '../scripts/lib/artifact-manifest-utils.mjs';

test('artifact manifest utilities report duplicate names and dirs', () => {
  const root = path.join(path.sep, 'tmp', 'slide-tool');
  const errors = artifactManifestDuplicateIdentityErrors([
    { name: 'deck', dir: path.join(root, 'out', 'deck-a') },
    { name: 'deck', dir: path.join(root, 'out', 'deck-b') },
    { name: 'other', dir: path.join(root, 'out', 'deck-b') },
  ], { manifestRootDir: root });

  assert.match(errors.join('\n'), /duplicate artifact name in manifest: deck/);
  assert.match(errors.join('\n'), /duplicate artifact dir in manifest:/);
  assert.match(errors.join('\n'), /deck-b/);
});

test('artifact manifest utilities report normalized duplicate dirs', () => {
  const root = path.join(path.sep, 'tmp', 'slide-tool');
  const errors = artifactManifestDuplicateIdentityErrors([
    { name: 'deck a', dir: path.join(root, 'out', 'same-dir') },
    { name: 'deck b', dir: path.join(root, 'out', 'nested', '..', 'same-dir') },
  ], { manifestRootDir: root });

  assert.match(errors.join('\n'), /duplicate normalized artifact dir in manifest:/);
  assert.match(errors.join('\n'), /same-dir/);
});

test('artifact manifest utilities normalize slide-tool manifest dirs from repo roots', () => {
  const root = path.join(path.sep, 'workspace', 'slide-tool');

  assert.equal(
    normalizeArtifactManifestDir('slide-tool/out/sample', root),
    path.join(path.sep, 'workspace', 'slide-tool', 'out', 'sample'),
  );
  assert.equal(
    normalizeArtifactManifestDir('out/sample', root),
    path.join(path.sep, 'workspace', 'slide-tool', 'out', 'sample'),
  );
});

test('artifact manifest utilities validate artifact policy fields without CLI execution', () => {
  const errors = artifactManifestArtifactValidationErrors({
    name: 'bad policy',
    type: 'deck',
    dir: 'out/deck',
    basename: 'deck',
    requiredTerms: ['onepager-only'],
    maxPptxImages: -1,
    allowedPptxImageSlides: [0],
    maxPptxSpecialElements: -1,
    allowedPptxSpecialElementSlides: [0],
    allowedPptxSpecialElementTypes: [''],
    minSlides: 4,
    maxSlides: 3,
    requiredSlideTitles: [''],
    auditFiles: [''],
  }, 'artifacts[0]');

  assert.match(errors.join('\n'), /artifacts\[0\]\.requiredTerms is only supported for onepager/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.maxPptxImages must be a non-negative integer/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.allowedPptxImageSlides must be an array of positive integers/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.maxPptxSpecialElements must be a non-negative integer/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.allowedPptxSpecialElementSlides must be an array of positive integers/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.allowedPptxSpecialElementTypes must be an array of non-empty strings/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.minSlides must be <= maxSlides/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.requiredSlideTitles must be an array of non-empty strings/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.auditFiles must be an array of non-empty strings/);
});

test('artifact manifest utilities validate deck verification policy results without CLI execution', () => {
  const errors = artifactManifestVerificationPolicyErrors({
    name: 'deck',
    type: 'deck',
    minSlides: 3,
    maxSlides: 4,
    requiredSlideTitles: ['解決'],
    allowedPptxImageSlides: [1],
    allowedPptxSpecialElementSlides: [1],
    allowedPptxSpecialElementTypes: ['chart'],
  }, {
    outlineSlides: 2,
    slideTitles: ['課題'],
    slideDiagnostics: [
      { slide: 1, imageCount: 0, specialElementCount: 0 },
      { slide: 2, imageCount: 1, imageBreakdown: { raster: 1 }, specialElementCount: 1, specialElementBreakdown: { model3d: 1 } },
    ],
    templateDiagnostics: [
      { path: 'ppt/slideLayouts/slideLayout1.xml', imageCount: 1, imageBreakdown: { raster: 1 } },
      { path: 'ppt/slideMasters/slideMaster1.xml', specialElementCount: 1, specialElementBreakdown: { alternateContent: 1 } },
    ],
    specialElementBreakdown: { model3d: 1 },
  });

  const joined = errors.join('\n');
  assert.match(joined, /slide count 2 < minSlides 3/);
  assert.match(joined, /missing required slide title: 解決/);
  assert.match(joined, /PPTX image found on unallowed slide 2 \(raster:1\)/);
  assert.match(joined, /PPTX image found in template ppt\/slideLayouts\/slideLayout1\.xml \(raster:1\)/);
  assert.match(joined, /PPTX special element found on unallowed slide 2 \(model3d:1\)/);
  assert.match(joined, /PPTX special element found in template ppt\/slideMasters\/slideMaster1\.xml \(alternateContent:1\)/);
  assert.match(joined, /PPTX special element type model3d is not allowed \(model3d:1\)/);
});

test('artifact manifest utilities validate complete manifest shape and artifacts', () => {
  assert.deepEqual(artifactManifestValidationErrors(null, { manifestRootDir: '/tmp/slide-tool' }), ['manifest must be an object']);

  const errors = artifactManifestValidationErrors({
    artifacts: [
      { name: 'deck', type: 'deck', dir: '/tmp/slide-tool/out/a', basename: 'a', minSlides: 3, maxSlides: 2 },
      { name: 'deck', type: 'onepager', dir: '/tmp/slide-tool/out/b', basename: 'b', maxPptxImages: 1 },
    ],
    ignoreDirs: 'out/tmp-*',
  }, { manifestRootDir: '/tmp/slide-tool' });

  assert.match(errors.join('\n'), /manifest.ignoreDirs must be an array when provided/);
  assert.match(errors.join('\n'), /duplicate artifact name in manifest: deck/);
  assert.match(errors.join('\n'), /artifacts\[0\]\.minSlides must be <= maxSlides/);
  assert.match(errors.join('\n'), /artifacts\[1\]\.maxPptxImages is only supported for deck artifacts/);
});
