import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pptxgen from '../pptxgenjs.mjs';
import { slideToolOut, slideToolScript } from './test-paths.mjs';
import { unusedNamedImports } from './import-contract-utils.mjs';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';

const script = slideToolScript('suggest-manifest-policy.mjs');
const verifyArtifactsScript = slideToolScript('verify-artifacts.mjs');
const transparentPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQn7WQAAAABJRU5ErkJggg==';

test('suggest-manifest-policy does not keep stale child process imports', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.deepEqual(unusedNamedImports(source, 'node:child_process'), []);
});

function runSuggestManifestPolicy(args, options = {}) {
  return runNodeScript(script, args, options);
}

function runVerifyArtifacts(options = {}) {
  return runNodeScript(verifyArtifactsScript, [], options);
}

function parseVerifyArtifactsOutput(result) {
  return parseCommandJson(result, 'stdout', 'verify-artifacts');
}

test('suggest-manifest-policy generates enforceable policy from a real PPTX deck', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-test-'));
  const artifactDir = path.join(root, 'deck');
  const basename = 'deck';
  await makeDeckWithImageAndChart(artifactDir, basename);

  const result = runSuggestManifestPolicy([artifactDir, basename]);
  assert.equal(result.status, 0, result.stderr);
  const suggestion = parseCommandJson(result, 'stdout');
  assert.equal(suggestion.ok, true);
  assert.equal(suggestion.artifact.maxPptxImages, 1);
  assert.deepEqual(suggestion.artifact.allowedPptxImageSlides, [1]);
  assert.equal(suggestion.artifact.maxPptxSpecialElements, 1);
  assert.deepEqual(suggestion.artifact.allowedPptxSpecialElementSlides, [2]);
  assert.deepEqual(suggestion.artifact.allowedPptxSpecialElementTypes, ['chart']);
  assert.deepEqual(suggestion.artifact.requiredSlideTitles, ['Cover', 'Chart']);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [suggestion.artifact],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const verification = runVerifyArtifacts({
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });
  assert.equal(verification.status, 0, verification.stdout + verification.stderr);
  assert.equal(parseVerifyArtifactsOutput(verification).ok, true);
});

test('suggest-manifest-policy fails with structured errors when source artifacts are invalid', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-invalid-test-'));
  fs.mkdirSync(root, { recursive: true });

  const result = runSuggestManifestPolicy([root, 'missing']);
  assert.notEqual(result.status, 0);
  const output = parseCommandJson(result, 'stderr');
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /outline missing/);
});

test('suggest-manifest-policy generates enforceable policy from a onepager artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-onepager-test-'));
  const artifactDir = path.join(root, 'onepager');
  const basename = 'onepager';
  makeOnepagerArtifact(artifactDir, basename);

  const result = runSuggestManifestPolicy([artifactDir, basename]);
  assert.equal(result.status, 0, result.stderr);
  const suggestion = parseCommandJson(result, 'stdout');
  assert.equal(suggestion.ok, true);
  assert.deepEqual(suggestion.artifact, {
    name: 'onepager onepager',
    type: 'onepager',
    dir: artifactDir,
    basename,
    requiredTerms: ['課題', '解決', '入力例', '主要機能', '次アクション'],
  });
  assert.equal(suggestion.diagnostics.htmlBytes > 0, true);
  assert.equal(suggestion.diagnostics.svgBytes > 0, true);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [suggestion.artifact],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const verification = runVerifyArtifacts({
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });
  assert.equal(verification.status, 0, verification.stdout + verification.stderr);
});

test('suggest-manifest-policy can print a concise markdown report for onepager artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-onepager-markdown-test-'));
  const artifactDir = path.join(root, 'onepager');
  const basename = 'onepager';
  makeOnepagerArtifact(artifactDir, basename);

  const result = runSuggestManifestPolicy([artifactDir, basename, '--format', 'markdown']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^### Slide artifact policy: onepager onepager/m);
  assert.match(result.stdout, /- type: onepager/);
  assert.match(result.stdout, /- requiredTerms: 課題, 解決, 入力例, 主要機能, 次アクション/);
  assert.doesNotMatch(result.stdout, /^\{/);
});

test('suggest-manifest-policy can print a concise markdown report for deck artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-deck-markdown-test-'));
  const artifactDir = path.join(root, 'deck');
  const basename = 'deck';
  await makeDeckWithImageAndChart(artifactDir, basename);

  const result = runSuggestManifestPolicy([artifactDir, basename, '--format', 'markdown']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^### Slide artifact policy: deck deck/m);
  assert.match(result.stdout, /- type: deck/);
  assert.match(result.stdout, /- slides: 2\.\.2/);
  assert.match(result.stdout, /- allowedPptxImageSlides: 1/);
  assert.match(result.stdout, /- allowedPptxSpecialElementSlides: 2/);
  assert.match(result.stdout, /- allowedPptxSpecialElementTypes: chart/);
  assert.doesNotMatch(result.stdout, /^\{/);
});

test('suggest-manifest-policy reports unsupported formats as structured JSON errors', () => {
  const result = runSuggestManifestPolicy(['/tmp/missing', 'deck', '--format', 'yaml']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, /Error: unsupported --format/);
  const output = parseCommandJson(result, 'stderr');
  assert.equal(output.ok, false);
  assert.equal(output.source, 'suggest-manifest-policy');
  assert.deepEqual(output.errors, ['unsupported --format: yaml']);
});

test('suggest-manifest-policy updates and verifies a manifest for onepager artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-onepager-update-test-'));
  const artifactDir = path.join(root, 'onepager');
  const basename = 'onepager';
  makeOnepagerArtifact(artifactDir, basename);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ artifacts: [], ignoreDirs: defaultIgnoreDirs() }));

  const result = runSuggestManifestPolicy([artifactDir, basename, '--update-manifest', manifestPath, '--verify-manifest']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = parseCommandJson(result, 'stdout');
  assert.equal(output.manifestUpdate.action, 'added');
  assert.equal(output.manifestVerification.ok, true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.artifacts[0].type, 'onepager');
  assert.deepEqual(manifest.artifacts[0].requiredTerms, ['課題', '解決', '入力例', '主要機能', '次アクション']);
});

test('suggest-manifest-policy supports custom onepager required terms', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-onepager-custom-test-'));
  const artifactDir = path.join(root, 'onepager');
  const basename = 'onepager';
  makeOnepagerArtifact(artifactDir, basename, ['価格', '導入']);

  const result = runSuggestManifestPolicy([artifactDir, basename, '--required-term', '価格', '--required-term', '導入']);
  assert.equal(result.status, 0, result.stderr);
  const output = parseCommandJson(result, 'stdout');
  assert.deepEqual(output.artifact.requiredTerms, ['価格', '導入']);
});

test('suggest-manifest-policy updates a manifest by adding a generated artifact policy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-update-add-test-'));
  const artifactDir = path.join(root, 'deck');
  const basename = 'deck';
  await makeDeckWithImageAndChart(artifactDir, basename);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  const initialIgnoreDirs = defaultIgnoreDirs();
  fs.writeFileSync(manifestPath, JSON.stringify({ artifacts: [], ignoreDirs: initialIgnoreDirs }));

  const result = runSuggestManifestPolicy([artifactDir, basename, '--update-manifest', manifestPath]);
  assert.equal(result.status, 0, result.stderr);
  const output = parseCommandJson(result, 'stdout');
  assert.deepEqual(output.manifestUpdate, { path: manifestPath, action: 'added', index: 0 });

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(manifest.ignoreDirs, initialIgnoreDirs);
  assert.equal(manifest.artifacts[0].dir, artifactDir);
  assert.equal(manifest.artifacts[0].maxPptxImages, 1);
  assert.deepEqual(manifest.artifacts[0].allowedPptxSpecialElementSlides, [2]);
  assert.deepEqual(manifest.artifacts[0].allowedPptxSpecialElementTypes, ['chart']);

  const verification = runVerifyArtifacts({
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });
  assert.equal(verification.status, 0, verification.stdout + verification.stderr);
});

test('suggest-manifest-policy seeds ignoreDirs for new manifests under slide-tool/out', async () => {
  const unique = `suggest-policy-${process.pid}-${Date.now()}`;
  const artifactDir = slideToolOut(unique);
  const basename = 'deck';
  await makeDeckWithImageAndChart(artifactDir, basename);
  const manifestPath = path.join(artifactDir, 'acceptance.manifest.json');

  const result = runSuggestManifestPolicy([artifactDir, basename, '--update-manifest', manifestPath, '--verify-manifest']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = parseCommandJson(result, 'stdout');
  assert.equal(output.manifestVerification.ok, true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.artifacts[0].dir, artifactDir);
  assert.equal(manifest.ignoreDirs.includes(artifactDir), false);
  assert.equal(manifest.ignoreDirs.some((dir) => dir.startsWith(path.join('slide-tool', 'out'))), true);
});

test('suggest-manifest-policy verifies an updated manifest when requested', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-verify-update-test-'));
  const artifactDir = path.join(root, 'deck');
  const basename = 'deck';
  await makeDeckWithImageAndChart(artifactDir, basename);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ artifacts: [], ignoreDirs: defaultIgnoreDirs() }));

  const result = runSuggestManifestPolicy([artifactDir, basename, '--update-manifest', manifestPath, '--verify-manifest']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = parseCommandJson(result, 'stdout');
  assert.equal(output.ok, true);
  assert.equal(output.manifestVerification.ok, true);
  assert.equal(output.manifestVerification.result.checked, 1);
});

test('suggest-manifest-policy verifies an updated manifest in manifest-only scope even without ignoreDirs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-verify-fail-test-'));
  const artifactDir = path.join(root, 'deck');
  const basename = 'deck';
  await makeDeckWithImageAndChart(artifactDir, basename);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ artifacts: [], ignoreDirs: [] }));

  const result = runSuggestManifestPolicy([artifactDir, basename, '--update-manifest', manifestPath, '--verify-manifest']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = parseCommandJson(result, 'stdout');
  assert.equal(output.ok, true);
  assert.equal(output.manifestVerification.ok, true);
  assert.equal(output.manifestVerification.scope, 'manifest-only');
  assert.equal(output.manifestVerification.result.checked, 1);
});

test('suggest-manifest-policy requires update-manifest when verifying a manifest', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-verify-without-update-test-'));
  const artifactDir = path.join(root, 'deck');
  const basename = 'deck';
  await makeDeckWithImageAndChart(artifactDir, basename);

  const result = runSuggestManifestPolicy([artifactDir, basename, '--verify-manifest']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, /Error: --verify-manifest/);
  const output = parseCommandJson(result, 'stderr');
  assert.equal(output.ok, false);
  assert.equal(output.source, 'suggest-manifest-policy');
  assert.deepEqual(output.errors, ['--verify-manifest requires --update-manifest <manifest-path>']);
});

test('suggest-manifest-policy rejects missing option values before verifier work', () => {
  const result = runSuggestManifestPolicy(['/tmp/missing', 'deck', '--update-manifest']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  const output = parseCommandJson(result, 'stderr');
  assert.equal(output.ok, false);
  assert.deepEqual(output.errors, ['--update-manifest requires a manifest path']);
});

test('suggest-manifest-policy updates a manifest by replacing a matching artifact policy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-manifest-policy-update-replace-test-'));
  const artifactDir = path.join(root, 'deck');
  const basename = 'deck';
  await makeDeckWithImageAndChart(artifactDir, basename);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'stale',
      type: 'deck',
      dir: artifactDir,
      basename,
      minSlides: 1,
      maxSlides: 1,
    }],
  }));

  const result = runSuggestManifestPolicy([artifactDir, basename, '--update-manifest', manifestPath]);
  assert.equal(result.status, 0, result.stderr);
  const output = parseCommandJson(result, 'stdout');
  assert.deepEqual(output.manifestUpdate, { path: manifestPath, action: 'replaced', index: 0 });

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.artifacts.length, 1);
  assert.equal(manifest.artifacts[0].name, 'deck deck');
  assert.equal(manifest.artifacts[0].minSlides, 2);
  assert.deepEqual(manifest.artifacts[0].requiredSlideTitles, ['Cover', 'Chart']);
});

async function makeDeckWithImageAndChart(artifactDir, basename) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const titles = ['Cover', 'Chart'];
  fs.writeFileSync(path.join(artifactDir, `${basename}.outline.json`), JSON.stringify({
    title: basename,
    slides: titles.map((title) => ({ title })),
  }));
  fs.writeFileSync(path.join(artifactDir, `${basename}.preview.html`), `<!doctype html><html><body>${titles.map((title) => `<section class="slide">${title}</section>`).join('')}</body></html>`);
  fs.writeFileSync(path.join(artifactDir, `${basename}.image-prompts.json`), JSON.stringify(titles.map((title, index) => ({ slide: index + 1, title }))));
  const pngPath = path.join(artifactDir, 'tiny.png');
  fs.writeFileSync(pngPath, Buffer.from(transparentPixel, 'base64'));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const cover = pptx.addSlide();
  cover.addText('Cover', { x: 1, y: 0.6, w: 8, h: 0.4 });
  cover.addImage({ path: pngPath, x: 1, y: 1.2, w: 0.25, h: 0.25 });

  const chart = pptx.addSlide();
  chart.addText('Chart', { x: 1, y: 0.6, w: 8, h: 0.4 });
  chart.addChart(pptx.ChartType.bar, [{ name: 'A', labels: ['Q1', 'Q2'], values: [1, 2] }], { x: 1, y: 1.2, w: 4, h: 2 });

  await pptx.writeFile({ fileName: path.join(artifactDir, `${basename}.editable.pptx`) });
}

function makeOnepagerArtifact(artifactDir, basename, extraTerms = []) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const terms = ['課題', '解決', '入力例', '主要機能', '次アクション', ...extraTerms];
  fs.writeFileSync(path.join(artifactDir, `${basename}.html`), `<!doctype html><html><body>${terms.join(' ')}</body></html>`);
  fs.writeFileSync(path.join(artifactDir, `${basename}.svg`), `<svg xmlns="http://www.w3.org/2000/svg"><text>${terms.join(' ')}</text></svg>`);
}

function defaultIgnoreDirs() {
  return [
    'slide-tool/out/ai-slide-workflow',
    'slide-tool/out/json-input-test',
    'slide-tool/out/kataomoi-org-showcase',
    'slide-tool/out/skill-wrapper-test',
    'slide-tool/out/top3-favorites-app-lp-onepager',
    'slide-tool/out/top3-favorites-app-mvp',
    'slide-tool/out/suggest-policy-*',
    ...generatedOutDirsForTests(),
  ];
}

function generatedOutDirsForTests() {
  const outRoot = slideToolOut();
  if (!fs.existsSync(outRoot)) return [];
  return fs.readdirSync(outRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(outRoot, entry.name));
}
