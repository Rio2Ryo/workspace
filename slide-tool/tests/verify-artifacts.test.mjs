import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pptxgen from '../pptxgenjs.mjs';
import { slideToolOut, slideToolScript, skillScript } from './test-paths.mjs';
import { unusedNamedImports } from './import-contract-utils.mjs';
import { createDeliveryManifestDeckFixture } from './delivery-manifest-fixtures.mjs';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';

const script = slideToolScript('verify-artifacts.mjs');
const wrapper = skillScript('slide-studio', 'scripts', 'shiro-slide-studio.mjs');
const transparentPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQn7WQAAAABJRU5ErkJggg==';

test('verify-artifacts does not keep stale delivery manifest imports', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.deepEqual(unusedNamedImports(source, './lib/delivery-manifest-utils.mjs'), []);
});

async function makeImageDeckArtifact(root, basename, imageSlide) {
  const artifactDir = path.join(root, basename);
  fs.mkdirSync(artifactDir, { recursive: true });
  const titles = ['Cover', 'Body'];
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
  titles.forEach((title, index) => {
    const slide = pptx.addSlide();
    slide.addText(title, { x: 1, y: 0.6, w: 8, h: 0.4 });
    if (index + 1 === imageSlide) {
      slide.addImage({ path: pngPath, x: 1, y: 1.2, w: 0.25, h: 0.25 });
    }
  });
  await pptx.writeFile({ fileName: path.join(artifactDir, `${basename}.editable.pptx`) });
  return artifactDir;
}

async function makeSpecialElementDeckArtifact(root, basename, specialSlide) {
  const artifactDir = path.join(root, basename);
  fs.mkdirSync(artifactDir, { recursive: true });
  const titles = ['Chart', 'Body'];
  fs.writeFileSync(path.join(artifactDir, `${basename}.outline.json`), JSON.stringify({
    title: basename,
    slides: titles.map((title) => ({ title })),
  }));
  fs.writeFileSync(path.join(artifactDir, `${basename}.preview.html`), `<!doctype html><html><body>${titles.map((title) => `<section class="slide">${title}</section>`).join('')}</body></html>`);
  fs.writeFileSync(path.join(artifactDir, `${basename}.image-prompts.json`), JSON.stringify(titles.map((title, index) => ({ slide: index + 1, title }))));

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  titles.forEach((title, index) => {
    const slide = pptx.addSlide();
    slide.addText(title, { x: 1, y: 0.6, w: 8, h: 0.4 });
    if (index + 1 === specialSlide) {
      slide.addChart(pptx.ChartType.bar, [{ name: 'A', labels: ['Q1', 'Q2'], values: [1, 2] }], { x: 1, y: 1.2, w: 4, h: 2 });
    }
  });
  await pptx.writeFile({ fileName: path.join(artifactDir, `${basename}.editable.pptx`) });
  return artifactDir;
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

function runVerifyArtifacts(options = {}) {
  const result = runNodeScript(script, [], options);
  const output = parseCommandJson(result, 'stdout', 'verify-artifacts');
  return { result, output };
}

function runWrapper(input, args = [], options = {}) {
  return runNodeScript(wrapper, [input, ...args], options);
}

function parseWrapperOutput(result) {
  return parseCommandJson(result, 'stdout', 'slide-studio-wrapper');
}

test('verify-artifacts fails fast with clear manifest validation errors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-invalid-manifest-test-'));
  fs.mkdirSync(path.join(root, 'slide-tool'), { recursive: true });
  const manifestPath = path.join(root, 'slide-tool', 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [
      { name: 'broken artifact', type: 'deck', dir: 'slide-tool/out/missing-basename' },
      { name: 'bad type', type: 'pdf', dir: 'slide-tool/out/x', basename: 'x' },
    ],
  }));

  const { result, output } = runVerifyArtifacts({
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.checked, 0);
  assert.match(output.manifestErrors.join('\n'), /artifacts\[0\]\.basename must be a non-empty string/);
  assert.match(output.manifestErrors.join('\n'), /artifacts\[1\]\.type must be one of/);
});

test('verify-artifacts rejects duplicate artifact names before running checks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-duplicate-name-test-'));
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [
      { name: 'duplicate deck', type: 'deck', dir: path.join(root, 'deck-a'), basename: 'deck-a' },
      { name: 'duplicate deck', type: 'deck', dir: path.join(root, 'deck-b'), basename: 'deck-b' },
    ],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.checked, 0);
  assert.match(output.manifestErrors.join('\n'), /duplicate artifact name in manifest: duplicate deck/);
});

test('verify-artifacts rejects duplicate artifact dirs before running checks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-duplicate-dir-test-'));
  const artifactDir = path.join(root, 'same-dir');
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [
      { name: 'deck a', type: 'deck', dir: artifactDir, basename: 'deck-a' },
      { name: 'deck b', type: 'deck', dir: artifactDir, basename: 'deck-b' },
    ],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.checked, 0);
  assert.match(output.manifestErrors.join('\n'), /duplicate artifact dir in manifest:/);
  assert.match(output.manifestErrors.join('\n'), /same-dir/);
});

test('verify-artifacts rejects artifact dirs that normalize to the same path before running checks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-normalized-duplicate-dir-test-'));
  const directDir = path.join(root, 'same-dir');
  const equivalentDir = `${root}${path.sep}nested${path.sep}..${path.sep}same-dir`;
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [
      { name: 'deck a', type: 'deck', dir: directDir, basename: 'deck-a' },
      { name: 'deck b', type: 'deck', dir: equivalentDir, basename: 'deck-b' },
    ],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.checked, 0);
  assert.match(output.manifestErrors.join('\n'), /duplicate normalized artifact dir in manifest:/);
  assert.match(output.manifestErrors.join('\n'), /same-dir/);
});

test('verify-artifacts fails when a verifiable output dir is not registered in manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-test-'));
  const outDir = path.join(root, 'slide-tool', 'out');
  const artifactDir = path.join(outDir, 'unregistered');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'unregistered.preview.html'), '<html></html>');
  fs.mkdirSync(path.join(root, 'slide-tool'), { recursive: true });
  const manifestPath = path.join(root, 'slide-tool', 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ artifacts: [] }));

  const { result, output } = runVerifyArtifacts({
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.manifestErrors.join('\n'), /unregistered artifact output dir/);
});

test('verify-artifacts can limit checks to manifest artifacts for delivery report re-verification', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-manifest-only-scope-test-'));
  const outDir = path.join(root, 'slide-tool', 'out');
  const artifactDir = path.join(outDir, 'unregistered');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'unregistered.preview.html'), '<html></html>');
  const manifestPath = path.join(root, 'slide-tool', 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ artifacts: [] }));

  const { result, output } = runVerifyArtifacts({
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, SLIDE_TOOL_ARTIFACT_SCOPE: 'manifest-only' },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(output.ok, true);
  assert.deepEqual(output.manifestErrors, []);
});

test('verify-artifacts ignores explicitly ignored output dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-ignore-test-'));
  const outDir = path.join(root, 'slide-tool', 'out');
  const artifactDir = path.join(outDir, 'scratch');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'scratch.preview.html'), '<html></html>');
  fs.mkdirSync(path.join(root, 'slide-tool'), { recursive: true });
  const manifestPath = path.join(root, 'slide-tool', 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [],
    ignoreDirs: ['slide-tool/out/scratch', ...defaultIgnoreDirs()],
  }));

  const { result, output } = runVerifyArtifacts({
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.ok, true);
});

test('verify-artifacts supports prefix wildcards in ignored output dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-ignore-prefix-test-'));
  const outDir = path.join(root, 'slide-tool', 'out');
  const artifactDir = path.join(outDir, 'tmp-run-1');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'tmp.preview.html'), '<html></html>');
  fs.mkdirSync(path.join(root, 'slide-tool'), { recursive: true });
  const manifestPath = path.join(root, 'slide-tool', 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [],
    ignoreDirs: ['slide-tool/out/tmp-*', ...defaultIgnoreDirs()],
  }));

  const { result, output } = runVerifyArtifacts({
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(output.ok, true);
});

test('verify-artifacts reports checked artifact types for acceptance scope', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-checked-types-test-'));
  const deckDir = path.join(root, 'deck');
  const onepagerDir = path.join(root, 'onepager');
  fs.mkdirSync(deckDir, { recursive: true });
  fs.mkdirSync(onepagerDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, [
    '#!/bin/sh',
    'case "$2" in',
    '  *verify-onepager.mjs) printf \'%s\\n\' \'{"ok":true,"required":[]}\';;',
    '  *) printf \'%s\\n\' \'{"ok":true,"outlineSlides":1,"slideTitles":["Cover"]}\';;',
    'esac',
  ].join('\n'));
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [
      { name: 'sample deck', type: 'deck', dir: deckDir, basename: 'deck' },
      { name: 'sample onepager', type: 'onepager', dir: onepagerDir, basename: 'onepager' },
    ],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(output.checkedArtifactTypes, ['deck', 'onepager']);
  assert.deepEqual(output.results.map((entry) => entry.type), ['deck', 'onepager']);
});

test('verify-artifacts passes onepager requiredTerms from manifest to verifier', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-required-terms-test-'));
  const artifactDir = path.join(root, 'custom-onepager');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'custom-onepager.html'), '<html><body>課題 解決 入力例 主要機能 次アクション</body></html>');
  fs.writeFileSync(path.join(artifactDir, 'custom-onepager.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>課題 解決 入力例 主要機能 次アクション</text></svg>');
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'custom onepager',
      type: 'onepager',
      dir: artifactDir,
      basename: 'custom-onepager',
      requiredTerms: ['価格'],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.results[0].ok, false);
  assert.match(output.results[0].error, /価格/);
});

test('verify-artifacts validates artifact policy fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-policy-validation-test-'));
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [
      { name: 'bad terms', type: 'deck', dir: 'slide-tool/out/x', basename: 'x', requiredTerms: ['A'] },
      { name: 'bad images', type: 'onepager', dir: 'slide-tool/out/y', basename: 'y', maxPptxImages: 1 },
      { name: 'bad count', type: 'deck', dir: 'slide-tool/out/z', basename: 'z', maxPptxImages: -1 },
      { name: 'bad special', type: 'deck', dir: 'slide-tool/out/s', basename: 's', maxPptxSpecialElements: -1 },
      { name: 'bad special type', type: 'onepager', dir: 'slide-tool/out/p', basename: 'p', maxPptxSpecialElements: 1 },
      { name: 'bad image slides', type: 'deck', dir: 'slide-tool/out/i', basename: 'i', allowedPptxImageSlides: [0] },
      { name: 'bad image slides type', type: 'onepager', dir: 'slide-tool/out/o', basename: 'o', allowedPptxImageSlides: [1] },
      { name: 'bad special slides', type: 'deck', dir: 'slide-tool/out/ss', basename: 'ss', allowedPptxSpecialElementSlides: [0] },
      { name: 'bad special slides type', type: 'onepager', dir: 'slide-tool/out/so', basename: 'so', allowedPptxSpecialElementSlides: [1] },
      { name: 'bad special element types', type: 'deck', dir: 'slide-tool/out/st', basename: 'st', allowedPptxSpecialElementTypes: [''] },
      { name: 'bad special element types artifact', type: 'onepager', dir: 'slide-tool/out/sto', basename: 'sto', allowedPptxSpecialElementTypes: ['chart'] },
    ],
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.match(output.manifestErrors.join('\n'), /requiredTerms is only supported for onepager/);
  assert.match(output.manifestErrors.join('\n'), /maxPptxImages is only supported for deck/);
  assert.match(output.manifestErrors.join('\n'), /maxPptxImages must be a non-negative integer/);
  assert.match(output.manifestErrors.join('\n'), /maxPptxSpecialElements must be a non-negative integer/);
  assert.match(output.manifestErrors.join('\n'), /maxPptxSpecialElements is only supported for deck/);
  assert.match(output.manifestErrors.join('\n'), /allowedPptxImageSlides must be an array of positive integers/);
  assert.match(output.manifestErrors.join('\n'), /allowedPptxImageSlides is only supported for deck/);
  assert.match(output.manifestErrors.join('\n'), /allowedPptxSpecialElementSlides must be an array of positive integers/);
  assert.match(output.manifestErrors.join('\n'), /allowedPptxSpecialElementSlides is only supported for deck/);
  assert.match(output.manifestErrors.join('\n'), /allowedPptxSpecialElementTypes must be an array of non-empty strings/);
  assert.match(output.manifestErrors.join('\n'), /allowedPptxSpecialElementTypes is only supported for deck/);
});

test('verify-artifacts enforces registered audit files for generated artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-audit-files-test-'));
  const out = path.join(root, 'out');
  fs.mkdirSync(out, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Audit Files\"],\"imageCount\":0,\"specialElementCount\":0,\"hiddenTextCount\":0,\"slideDiagnostics\":[],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);
  const auditPath = path.join(out, 'delivery-manifest.json');
  fs.writeFileSync(auditPath, JSON.stringify({ schemaVersion: 1 }));
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [auditPath, path.join(out, 'missing-audit.json')],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }, null, 2));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /audit file is missing or empty/);
  assert.match(output.results[0].error, /missing-audit\.json/);
});

test('verify-artifacts validates delivery manifest audit file schema', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-delivery-manifest-schema-test-'));
  const out = path.join(root, 'out');
  fs.mkdirSync(out, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Schema\"],\"imageCount\":0,\"specialElementCount\":0,\"hiddenTextCount\":0,\"slideDiagnostics\":[],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);
  const deliveryManifestPath = path.join(out, 'delivery-manifest.json');
  fs.writeFileSync(deliveryManifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Schema',
    readyHeader: '納品準備OK: Schema',
    verificationHeader: '検証: ready',
    deliverablePaths: 'not-an-array',
    auditPaths: [],
    identityChecks: {
      report: { matched: 'yes', mismatches: 'none' },
    },
  }));
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryManifestPath],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }, null, 2));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /delivery manifest deliverablePaths must be an array/);
  assert.match(output.results[0].error, /delivery manifest qaLines must be an array/);
  assert.match(output.results[0].error, /delivery manifest identityChecks\.report\.matched must be a boolean/);
  assert.match(output.results[0].error, /delivery manifest identityChecks\.report\.mismatches must be an array/);
});

test('verify-artifacts validates delivery manifest referenced files exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-delivery-manifest-files-test-'));
  const out = path.join(root, 'out');
  fs.mkdirSync(out, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Files\"],\"imageCount\":0,\"specialElementCount\":0,\"hiddenTextCount\":0,\"slideDiagnostics\":[],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);
  const pptxPath = path.join(out, 'deck.editable.pptx');
  const auditPath = path.join(out, 'deck.acceptance.manifest.json');
  const deliveryManifestPath = path.join(out, 'delivery-manifest.json');
  fs.writeFileSync(pptxPath, 'pptx');
  fs.writeFileSync(auditPath, '{}');
  fs.writeFileSync(deliveryManifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Files',
    readyHeader: '納品準備OK: Files',
    verificationHeader: '検証: ready',
    qaLines: ['delivery readiness: ready'],
    deliverablePaths: [pptxPath, path.join(out, 'missing.preview.html')],
    auditPaths: [auditPath, path.join(out, 'missing.acceptance.manifest.json')],
    warnings: [],
  }));
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryManifestPath],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }, null, 2));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /delivery manifest deliverable file is missing or empty/);
  assert.match(output.results[0].error, /missing\.preview\.html/);
  assert.match(output.results[0].error, /delivery manifest audit file is missing or empty/);
  assert.match(output.results[0].error, /missing\.acceptance\.manifest\.json/);
});

test('verify-artifacts reports duplicate delivery manifest QA lines', () => {
  const fixture = createDeliveryManifestDeckFixture({
    prefix: 'verify-artifacts-delivery-manifest-duplicate-qa-test-',
    artifactName: 'deck',
    title: 'Duplicate QA',
    message: 'ready',
    includeAuxiliaryDeliverables: true,
    writeAuditFiles: true,
  });
  const root = fixture.dir;
  const out = fixture.out;
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Duplicate QA\"],\"imageCount\":0,\"specialElementCount\":0,\"hiddenTextCount\":0,\"slideDiagnostics\":[],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);
  const deliveryManifestPath = path.join(out, 'delivery-manifest.json');
  const identityLine = 'identity checks: report ready / deliveryMessage ready / deliveryManifest ready';
  fs.writeFileSync(deliveryManifestPath, JSON.stringify({
    ...fixture.parsed,
    qaLines: ['delivery readiness: ready', identityLine, identityLine],
    warnings: [],
  }));
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryManifestPath, fixture.reportPath, fixture.deliveryMessagePath],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }, null, 2));

  const { result, output } = runVerifyArtifacts({
    env: {
      SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath,
      SLIDE_TOOL_SKIP_DISCORD_REPORT_AUDIT: '1',
      PATH: `${binDir}:${process.env.PATH}`,
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /delivery manifest duplicate QA line: identity checks: report ready \/ deliveryMessage ready \/ deliveryManifest ready/);
});

test('verify-artifacts validates delivery manifest deck deliverable set', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-delivery-manifest-set-test-'));
  const out = path.join(root, 'out');
  fs.mkdirSync(out, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Set\"],\"imageCount\":0,\"specialElementCount\":0,\"hiddenTextCount\":0,\"slideDiagnostics\":[],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);
  const pptxPath = path.join(out, 'deck.editable.pptx');
  const htmlPath = path.join(out, 'deck.preview.html');
  const outlinePath = path.join(out, 'deck.outline.json');
  const promptsPath = path.join(out, 'deck.image-prompts.md');
  const extraPath = path.join(out, 'extra.md');
  const auditPath = path.join(out, 'deck.acceptance.manifest.json');
  const deliveryManifestPath = path.join(out, 'delivery-manifest.json');
  for (const filePath of [pptxPath, htmlPath, outlinePath, promptsPath, extraPath, auditPath]) fs.writeFileSync(filePath, path.basename(filePath));
  fs.writeFileSync(deliveryManifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Set',
    readyHeader: '納品準備OK: Set',
    verificationHeader: '検証: ready',
    qaLines: ['delivery readiness: ready'],
    deliverablePaths: [pptxPath, htmlPath, outlinePath, extraPath],
    auditPaths: [auditPath],
    warnings: [],
  }));
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryManifestPath],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }, null, 2));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /delivery manifest deliverablePaths mismatch/);
  assert.match(output.results[0].error, /deck\.image-prompts\.md/);
  assert.match(output.results[0].error, /extra\.md/);
});

test('verify-artifacts validates delivery manifest deck audit set', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-delivery-manifest-audit-set-test-'));
  const out = path.join(root, 'out');
  fs.mkdirSync(out, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Audit Set\"],\"imageCount\":0,\"specialElementCount\":0,\"hiddenTextCount\":0,\"slideDiagnostics\":[],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);
  const pptxPath = path.join(out, 'deck.editable.pptx');
  const htmlPath = path.join(out, 'deck.preview.html');
  const outlinePath = path.join(out, 'deck.outline.json');
  const promptsPath = path.join(out, 'deck.image-prompts.md');
  const acceptancePath = path.join(out, 'deck.acceptance.manifest.json');
  const extraAuditPath = path.join(out, 'extra-audit.json');
  const deliveryManifestPath = path.join(out, 'delivery-manifest.json');
  for (const filePath of [pptxPath, htmlPath, outlinePath, promptsPath, acceptancePath, extraAuditPath]) fs.writeFileSync(filePath, path.basename(filePath));
  fs.writeFileSync(deliveryManifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Audit Set',
    readyHeader: '納品準備OK: Audit Set',
    verificationHeader: '検証: ready',
    qaLines: ['delivery readiness: ready'],
    deliverablePaths: [pptxPath, htmlPath, outlinePath, promptsPath],
    auditPaths: [extraAuditPath],
    warnings: [],
  }));
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryManifestPath],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }, null, 2));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /delivery manifest auditPaths mismatch/);
  assert.match(output.results[0].error, /deck\.acceptance\.manifest\.json/);
  assert.match(output.results[0].error, /extra-audit\.json/);
});

test('verify-artifacts validates registered discord report audit file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-discord-report-audit-test-'));
  const out = path.join(root, 'out');
  fs.mkdirSync(out, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Report\"],\"imageCount\":0,\"specialElementCount\":0,\"hiddenTextCount\":0,\"slideDiagnostics\":[],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);
  const reportPath = path.join(out, 'discord-report.md');
  const deliveryManifestPath = path.join(out, 'delivery-manifest.json');
  fs.writeFileSync(reportPath, '作成物:\n- broken report without status sections\n');
  fs.writeFileSync(deliveryManifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Report',
    readyHeader: '納品準備OK: Report',
    verificationHeader: '検証: ready',
    qaLines: ['delivery readiness: ready'],
    deliverablePaths: [
      path.join(out, 'deck.editable.pptx'),
      path.join(out, 'deck.preview.html'),
      path.join(out, 'deck.outline.json'),
      path.join(out, 'deck.image-prompts.md'),
    ],
    auditPaths: [path.join(out, 'deck.acceptance.manifest.json')],
    warnings: [],
  }));
  for (const filePath of JSON.parse(fs.readFileSync(deliveryManifestPath, 'utf8')).deliverablePaths) fs.writeFileSync(filePath, path.basename(filePath));
  fs.writeFileSync(path.join(out, 'deck.acceptance.manifest.json'), '{}');
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryManifestPath, reportPath],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }, null, 2));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /discord report audit failed/);
  assert.match(output.results[0].error, /検証結果 section is missing status/);
});

test('verify-artifacts validates registered delivery message audit file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-delivery-message-audit-test-'));
  const out = path.join(dir, 'out');
  const generatedRun = runWrapper('slide-tool/examples/ai-slide-workflow.md', [
    '--out',
    out,
    '--name',
    'sample',
  ]);
  assert.equal(generatedRun.status, 0, generatedRun.stderr);
  const generated = parseWrapperOutput(generatedRun);
  fs.writeFileSync(generated.discordReady.deliveryMessagePath, '納品準備OK: broken\n検証: broken\n');

  const { result, output } = runVerifyArtifacts({
    env: {
      SLIDE_TOOL_ARTIFACT_MANIFEST: path.join(out, 'sample.acceptance.manifest.json'),
      SLIDE_TOOL_ARTIFACT_SCOPE: 'manifest-only',
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /discord report audit failed/);
  assert.match(output.results[0].error, /delivery message missing QA section/);
});

test('verify-artifacts validates expected audit file set', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-audit-set-test-'));
  const out = path.join(dir, 'out');
  const generatedRun = runWrapper('slide-tool/examples/ai-slide-workflow.md', [
    '--out',
    out,
    '--name',
    'sample',
  ]);
  assert.equal(generatedRun.status, 0, generatedRun.stderr);
  const generated = parseWrapperOutput(generatedRun);
  const manifestPath = path.join(out, 'sample.acceptance.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.artifacts[0].auditFiles = [
    generated.discordReady.deliveryManifestPath,
    generated.discordReport,
  ];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const { result, output } = runVerifyArtifacts({
    env: {
      SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath,
      SLIDE_TOOL_ARTIFACT_SCOPE: 'manifest-only',
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /auditFiles mismatch/);
  assert.match(output.results[0].error, /delivery-message\.md/);
});

test('verify-artifacts validates delivery manifest artifact identity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-delivery-manifest-identity-test-'));
  const out = path.join(dir, 'out');
  const generatedRun = runWrapper('slide-tool/examples/ai-slide-workflow.md', [
    '--out',
    out,
    '--name',
    'sample',
  ]);
  assert.equal(generatedRun.status, 0, generatedRun.stderr);
  const generated = parseWrapperOutput(generatedRun);
  const deliveryManifest = JSON.parse(fs.readFileSync(generated.discordReady.deliveryManifestPath, 'utf8'));
  deliveryManifest.basename = 'other-sample';
  fs.writeFileSync(generated.discordReady.deliveryManifestPath, `${JSON.stringify(deliveryManifest, null, 2)}\n`);

  const { result, output } = runVerifyArtifacts({
    env: {
      SLIDE_TOOL_ARTIFACT_MANIFEST: path.join(out, 'sample.acceptance.manifest.json'),
      SLIDE_TOOL_ARTIFACT_SCOPE: 'manifest-only',
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /delivery manifest basename mismatch/);
});

test('verify-artifacts fails final delivery manifest when identity checks are missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-delivery-manifest-identity-checks-test-'));
  const out = path.join(dir, 'out');
  const generatedRun = runWrapper('slide-tool/examples/ai-slide-workflow.md', [
    '--out',
    out,
    '--name',
    'sample',
  ]);
  assert.equal(generatedRun.status, 0, generatedRun.stderr);
  const generated = parseWrapperOutput(generatedRun);
  const deliveryManifest = JSON.parse(fs.readFileSync(generated.discordReady.deliveryManifestPath, 'utf8'));
  delete deliveryManifest.identityChecks;
  deliveryManifest.qaLines = deliveryManifest.qaLines.filter((line) => !line.startsWith('identity checks:'));
  fs.writeFileSync(generated.discordReady.deliveryManifestPath, `${JSON.stringify(deliveryManifest, null, 2)}\n`);

  const { result, output } = runVerifyArtifacts({
    env: {
      SLIDE_TOOL_ARTIFACT_MANIFEST: path.join(out, 'sample.acceptance.manifest.json'),
      SLIDE_TOOL_ARTIFACT_SCOPE: 'manifest-only',
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /discord report audit failed/);
  assert.match(output.results[0].error, /delivery manifest identityChecks missing/);
});

test('verify-artifacts validates delivery message artifact identity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-delivery-message-identity-test-'));
  const out = path.join(dir, 'out');
  const generatedRun = runWrapper('slide-tool/examples/ai-slide-workflow.md', [
    '--out',
    out,
    '--name',
    'sample',
  ]);
  assert.equal(generatedRun.status, 0, generatedRun.stderr);
  const generated = parseWrapperOutput(generatedRun);
  const deliveryMessage = fs.readFileSync(generated.discordReady.deliveryMessagePath, 'utf8')
    .replace('- basename: sample', '- basename: other-sample');
  fs.writeFileSync(generated.discordReady.deliveryMessagePath, deliveryMessage);

  const { result, output } = runVerifyArtifacts({
    env: {
      SLIDE_TOOL_ARTIFACT_MANIFEST: path.join(out, 'sample.acceptance.manifest.json'),
      SLIDE_TOOL_ARTIFACT_SCOPE: 'manifest-only',
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(output.ok, false);
  assert.match(output.results[0].error, /delivery message artifact basename mismatch/);
});

test('verify-artifacts enforces allowed PPTX image slide policy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-image-slide-policy-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":2,\"slideTitles\":[\"Cover\",\"Body\"],\"imageCount\":1,\"slideDiagnostics\":[{\"slide\":1,\"imageCount\":0},{\"slide\":2,\"imageCount\":1}],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'sample deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'sample',
      maxPptxImages: 1,
      allowedPptxImageSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(output.results[0].error, /PPTX image found on unallowed slide 2/);
});

test('verify-artifacts rejects template images when image slide policy is enabled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-template-image-policy-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Cover\"],\"imageCount\":1,\"slideDiagnostics\":[{\"slide\":1,\"imageCount\":0}],\"templateDiagnostics\":[{\"path\":\"ppt/slideLayouts/slideLayout1.xml\",\"imageCount\":1}]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'sample deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'sample',
      maxPptxImages: 1,
      allowedPptxImageSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(output.results[0].error, /PPTX image found in template ppt\/slideLayouts\/slideLayout1\.xml/);
});

test('verify-artifacts passes real PPTX when image is on an allowed slide', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-real-image-allowed-test-'));
  const artifactDir = await makeImageDeckArtifact(root, 'allowed-image', 1);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'real allowed image deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'allowed-image',
      maxPptxImages: 1,
      allowedPptxImageSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(output.results[0].ok, true);
  assert.equal(output.results[0].result.slideDiagnostics[0].imageCount, 1);
  assert.equal(output.results[0].result.slideDiagnostics[1].imageCount, 0);
});

test('verify-artifacts fails real PPTX when image is on an unallowed slide', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-real-image-unallowed-test-'));
  const artifactDir = await makeImageDeckArtifact(root, 'unallowed-image', 2);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'real unallowed image deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'unallowed-image',
      maxPptxImages: 1,
      allowedPptxImageSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.results[0].result.slideDiagnostics[1].imageCount, 1);
  assert.match(output.results[0].error, /PPTX image found on unallowed slide 2/);
});

test('verify-artifacts enforces allowed PPTX special element slide policy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-special-slide-policy-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":2,\"slideTitles\":[\"Chart\",\"Body\"],\"specialElementCount\":1,\"slideDiagnostics\":[{\"slide\":1,\"specialElementCount\":0},{\"slide\":2,\"specialElementCount\":1}],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'sample deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'sample',
      maxPptxSpecialElements: 1,
      allowedPptxSpecialElementSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(output.results[0].error, /PPTX special element found on unallowed slide 2/);
});

test('verify-artifacts reports special element breakdown for unallowed slides', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-special-breakdown-policy-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":2,\"slideTitles\":[\"Cover\",\"Extension\"],\"specialElementCount\":1,\"slideDiagnostics\":[{\"slide\":1,\"specialElementCount\":0,\"specialElementBreakdown\":{\"alternateContent\":0}},{\"slide\":2,\"specialElementCount\":1,\"specialElementBreakdown\":{\"alternateContent\":1}}],\"templateDiagnostics\":[]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'extension deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'extension',
      maxPptxSpecialElements: 1,
      allowedPptxSpecialElementSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(output.results[0].error, /PPTX special element found on unallowed slide 2/);
  assert.match(output.results[0].error, /alternateContent:1/);
});

test('verify-artifacts rejects template special elements when special element slide policy is enabled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-template-special-policy-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"Chart\"],\"specialElementCount\":1,\"slideDiagnostics\":[{\"slide\":1,\"specialElementCount\":0}],\"templateDiagnostics\":[{\"path\":\"ppt/slideMasters/slideMaster1.xml\",\"specialElementCount\":1}]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'sample deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'sample',
      maxPptxSpecialElements: 1,
      allowedPptxSpecialElementSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(output.results[0].error, /PPTX special element found in template ppt\/slideMasters\/slideMaster1\.xml/);
});

test('verify-artifacts passes real PPTX when special element is on an allowed slide', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-real-special-allowed-test-'));
  const artifactDir = await makeSpecialElementDeckArtifact(root, 'allowed-special', 1);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'real allowed special deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'allowed-special',
      maxPptxSpecialElements: 1,
      allowedPptxSpecialElementSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(output.results[0].ok, true);
  assert.equal(output.results[0].result.slideDiagnostics[0].specialElementCount, 1);
  assert.equal(output.results[0].result.slideDiagnostics[1].specialElementCount, 0);
});

test('verify-artifacts fails real PPTX when special element is on an unallowed slide', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-real-special-unallowed-test-'));
  const artifactDir = await makeSpecialElementDeckArtifact(root, 'unallowed-special', 2);
  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'real unallowed special deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'unallowed-special',
      maxPptxSpecialElements: 1,
      allowedPptxSpecialElementSlides: [1],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.results[0].result.slideDiagnostics[1].specialElementCount, 1);
  assert.match(output.results[0].error, /PPTX special element found on unallowed slide 2/);
});

test('verify-artifacts fails when PPTX special element type is not explicitly allowed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-special-type-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, [
    '#!/bin/sh',
    'cat <<JSON',
    '{"ok":true,"outlineSlides":1,"slideTitles":["Model"],"specialElementCount":1,"specialElementBreakdown":{"model3d":1},"slideDiagnostics":[{"slide":1,"specialElementCount":1,"specialElementBreakdown":{"model3d":1}}],"templateDiagnostics":[]}',
    'JSON',
    'exit 0',
  ].join('\n'));
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'sample deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'sample',
      maxPptxSpecialElements: 1,
      allowedPptxSpecialElementSlides: [1],
      allowedPptxSpecialElementTypes: ['chart'],
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    env: { SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.notEqual(result.status, 0);
  assert.equal(output.results[0].ok, false);
  assert.match(output.results[0].error, /PPTX special element type model3d is not allowed/);
});

test('verify-artifacts passes deck special element limit to verifier', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-special-limit-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"課題\"],\"specialLimit\":\"%s\"}\\n' "$SLIDE_TOOL_MAX_PPTX_SPECIAL_ELEMENTS"\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'sample deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'sample',
      maxPptxSpecialElements: 2,
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(output.results[0].result.specialLimit, '2');
});

test('verify-artifacts enforces deck requiredSlideTitles from manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-required-slide-titles-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'sample.outline.json'), JSON.stringify({
    title: 'sample',
    slides: [{ title: '課題' }],
  }));
  fs.writeFileSync(path.join(artifactDir, 'sample.preview.html'), '<html><body><section class="slide">課題</section></body></html>');
  fs.writeFileSync(path.join(artifactDir, 'sample.image-prompts.json'), JSON.stringify([{ slide: 1, title: '課題' }]));
  fs.writeFileSync(path.join(artifactDir, 'sample.editable.pptx'), 'not used because verifier is stubbed by node script path');

  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"課題\"]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'sample deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'sample',
      requiredSlideTitles: ['課題', '解決'],
      minSlides: 1,
      maxSlides: 2,
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(output.results[0].error, /missing required slide title: 解決/);
});

test('verify-artifacts enforces deck minSlides and maxSlides from manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-artifacts-slide-count-policy-test-'));
  const artifactDir = path.join(root, 'deck');
  fs.mkdirSync(artifactDir, { recursive: true });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  const nodeStub = path.join(binDir, 'node');
  fs.writeFileSync(nodeStub, `#!/bin/sh\nprintf '%s\\n' '{\"ok\":true,\"outlineSlides\":1,\"slideTitles\":[\"課題\"]}'\nexit 0\n`);
  fs.chmodSync(nodeStub, 0o755);

  const manifestPath = path.join(root, 'artifacts.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'sample deck',
      type: 'deck',
      dir: artifactDir,
      basename: 'sample',
      minSlides: 2,
      maxSlides: 3,
    }],
    ignoreDirs: defaultIgnoreDirs(),
  }));

  const { result, output } = runVerifyArtifacts({
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath, PATH: `${binDir}:${process.env.PATH}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(output.results[0].error, /slide count 1 < minSlides 2/);
});
