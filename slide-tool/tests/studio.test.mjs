import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { slideToolRoot, workspaceRoot } from './test-paths.mjs';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';
import {
  assertStudioDiscordReadyOutputContext,
} from './summary-contract-utils.mjs';

const script = path.join(slideToolRoot, 'scripts', 'studio.mjs');
const verifier = path.join(slideToolRoot, 'scripts', 'verify.mjs');

function runStudio(input, out, name = 'deck', extraArgs = [], options = {}) {
  return runNodeScript(script, [input, '--out', out, '--name', name, ...extraArgs], options);
}

function runStudioArgs(args, options = {}) {
  return runNodeScript(script, args, options);
}

function runVerify(out, name) {
  return runNodeScript(verifier, [out, name]);
}

function parseStudioOutput(result) {
  return parseCommandJson(result, 'stdout', 'studio');
}

function parseStudioError(result) {
  return parseCommandJson(result, 'stderr', 'studio');
}

function parseVerifyOutput(result) {
  return parseCommandJson(result, 'stdout', 'verify');
}

function parseLastJsonObject(text, label) {
  for (let index = text.lastIndexOf('{'); index >= 0; index = text.lastIndexOf('{', index - 1)) {
    const candidate = text.slice(index).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep scanning backward until the root JSON object is found.
    }
  }
  assert.fail(`${label} output was not parseable JSON`);
}

function makeValidJsonOutline(input) {
  fs.writeFileSync(input, JSON.stringify({
    title: 'Valid Deck',
    subtitle: 'Schema checked before generation',
    slides: [
      {
        type: 'cover',
        title: 'Valid Deck',
        subtitle: 'Schema checked before generation',
        claim: 'Broken briefs stop early',
        bullets: ['自然文から構造化', '検証して生成', '編集可能PPTX'],
        speakerNotes: '正常系のspeaker notesです。',
      },
      {
        type: 'process',
        title: 'Validated Flow',
        claim: 'Validate before writing artifacts',
        bullets: ['JSONを読む', '必須項目を確認', 'HTMLを生成', 'PPTXを生成'],
        speakerNotes: '生成前検証により、壊れた入力を早く止めます。',
      },
    ],
  }));
}

test('studio rejects invalid JSON outline before creating artifacts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-invalid-json-test-'));
  const input = path.join(dir, 'bad.json');
  const out = path.join(dir, 'out');
  fs.writeFileSync(input, JSON.stringify({
    title: '',
    slides: [{ title: 'Valid slide' }],
  }));

  const result = runStudio(input, out, 'bad');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid JSON outline/);
  assert.match(result.stderr, /title must be a non-empty string/);
  assert.equal(fs.existsSync(out), false);
});

test('studio generates verifiable artifacts from a valid JSON outline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-valid-json-test-'));
  const input = path.join(dir, 'good.json');
  const out = path.join(dir, 'out');
  makeValidJsonOutline(input);

  const result = runStudio(input, out, 'good', [], {
    env: { ...process.env, SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  assert.equal(generated.slides, 2);

  const verify = runVerify(out, 'good');
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(parseVerifyOutput(verify).ok, true);
});

test('studio reports blocked delivery readiness when verification is skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-no-verify-readiness-test-'));
  const input = path.join(dir, 'good.json');
  const out = path.join(dir, 'out');
  makeValidJsonOutline(input);

  const result = runStudio(input, out, 'good', [], {
    env: { ...process.env, SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  assert.equal(generated.verification, null);
  assert.equal(generated.acceptance, null);
  assert.deepEqual(generated.deliveryReadiness, {
    ok: false,
    verification: 'blocked',
    acceptance: 'blocked',
    visualQa: 'blocked',
    visualQaSource: 'fallback',
    visualQaWidth: null,
    visualQaHeight: null,
    visualQaUniqueSampledColors: null,
    pptxImages: 0,
    pptxSpecialElements: 0,
    pptxHiddenText: 0,
    line: 'delivery readiness: blocked',
    reasonsLine: 'reasons: verification not ready; acceptance not ready; visual QA not ready: blocked',
    reasons: [
      'verification not ready',
      'acceptance not ready',
      'visual QA not ready: blocked',
    ],
    message: 'blocked before Discord delivery',
  });
  const report = fs.readFileSync(generated.discordReport, 'utf8');
  assert.match(report, /納品前チェック:[\s\S]*delivery readiness: blocked/);
  assert.match(report, /納品前チェック:[\s\S]*reasons: verification not ready; acceptance not ready; visual QA not ready: blocked/);
});

test('studio accepts explicit --input for Discord-style command templates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-explicit-input-test-'));
  const input = path.join(dir, 'good.json');
  const out = path.join(dir, 'out');
  makeValidJsonOutline(input);

  const result = runStudioArgs(['--input', input, '--out', out, '--name', 'good', '--verify']);
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  assert.equal(generated.input, input);
  assert.equal(generated.slides, 2);
  assert.equal(generated.verification.ok, true);
});

test('studio reports CLI option mistakes as structured JSON errors', () => {
  const result = runStudioArgs(['--input', '--out', '/tmp/unused']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, /Error: --input/);
  const output = parseStudioError(result);
  assert.equal(output.ok, false);
  assert.equal(output.source, 'studio');
  assert.deepEqual(output.errors, ['--input requires a value']);
});

test('studio --verify includes generated deck verification in output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-verify-json-test-'));
  const input = path.join(dir, 'good.json');
  const out = path.join(dir, 'out');
  fs.writeFileSync(input, JSON.stringify({
    title: 'Verified Deck',
    slides: [
      {
        type: 'cover',
        title: 'Verified Deck',
        subtitle: 'Verification is part of generation',
        claim: 'Generation should prove the deck is usable',
        bullets: ['HTML preview', 'Editable PPTX', 'Prompt files'],
        speakerNotes: 'Verification runs after generation.',
      },
    ],
  }));

  const result = runStudio(input, out, 'good', ['--verify'], {
    env: { ...process.env, SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  assert.equal(generated.verification.ok, true);
  assert.equal(generated.acceptance.ok, true);
  assert.equal(generated.acceptance.manifestVerification.ok, true);
  assert.deepEqual(generated.deliveryReadiness, {
    ok: true,
    verification: 'ready',
    acceptance: 'ready',
    visualQa: 'ready',
    visualQaSource: 'fallback',
    visualQaWidth: 1280,
    visualQaHeight: 900,
    visualQaUniqueSampledColors: 4,
    pptxImages: 0,
    pptxSpecialElements: 0,
    pptxHiddenText: 0,
    line: 'delivery readiness: ready',
    reasonsLine: 'reasons: none',
    reasons: [],
    message: 'ready for Discord delivery',
  });
  assert.notStrictEqual(generated.deliveryReadiness, input.deliveryReadiness);
  assert.equal(generated.verification.outlineSlides, 1);
  assert.equal(generated.verification.pptxSlides, 1);
  assert.equal(Object.hasOwn(generated, 'visualQa'), true);
  assert.equal(Object.hasOwn(generated.visualQa, 'uniqueSampledColors'), true);
  assert.equal(generated.visualQa.status, 'ready');
  assert.equal(generated.visualQa.source, 'fallback');
  assert.equal(Number.isInteger(generated.visualQa.uniqueSampledColors), true);
  assert.equal(generated.visualQa.uniqueSampledColors >= 4, true);
  assert.deepEqual(generated.visualQa, {
    status: 'ready',
    source: 'fallback',
    screenshot: path.join(out, 'good.preview.png'),
    width: 1280,
    height: 900,
    bytes: generated.visualQa.bytes,
    uniqueSampledColors: 4,
  });
  assert.notStrictEqual(generated.visualQa, input.visualQa);
  assert.equal(generated.identityChecks.report.matched, true);
  assert.deepEqual(generated.identityChecks.report.mismatches, []);
  assert.notStrictEqual(generated.identityChecks.report, generated.identityChecks);
  assert.equal(generated.verification.ok, true);
  assert.notStrictEqual(generated.verification, input.verification);
  assert.equal(generated.acceptance.ok, true);
  assert.notStrictEqual(generated.acceptance, input.acceptance);
  assert.equal(generated.discordReport, path.join(out, 'discord-report.md'));
  const report = fs.readFileSync(generated.discordReport, 'utf8');
  assert.match(report, /作成物:/);
  assert.match(report, /検証結果:/);
  assert.match(report, /検証結果:\n- status: ready\n- ok: true/);
  assert.match(report, /slides: outline 1 \/ HTML 1 \/ PPTX 1/);
  assert.match(report, /PPTX images: 0 \(none\)/);
  assert.match(report, /PPTX hidden text: 0/);
  assert.match(report, /visual QA:/);
  assert.match(report, /source: fallback/);
  assert.match(report, /uniqueSampledColors:/);
  assert.match(report, /納品前チェック:/);
  assert.match(report, /納品前チェック:\n- status: ready\n- ok: true/);
  assert.match(report, /納品前チェック:[\s\S]*delivery readiness: ready/);
  assert.match(report, /納品前チェック:[\s\S]*reasons: none/);
  assert.match(report, /納品前チェック:[\s\S]*PPTX images: 0 \(none\)/);
  assert.match(report, /納品前チェック:[\s\S]*PPTX special elements: 0 \(none\)/);
  assert.match(report, /納品前チェック:[\s\S]*PPTX hidden text: 0/);
  assert.match(report, /納品前チェック:[\s\S]*visual QA:/);
  assert.match(report, /- artifact policy: added/);
  assert.match(report, /- manifest verification: ok/);
  assert.match(report, /- manifest verification scope: manifest-only/);
  assert.match(report, /- checked artifacts: 1/);
  assert.match(report, /- checked artifact types: deck/);
  assert.match(report, /- identity checks: report ready/);
  assert.match(report, new RegExp(`node ${path.join(workspaceRoot, 'skills', 'slide-studio', 'scripts', 'shiro-slide-studio.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} --input .*good\\.json --out .*\\/out --name good --verify`));
  assert.match(report, new RegExp(path.join(slideToolRoot, 'scripts', 'verify.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(report, new RegExp(path.join(slideToolRoot, 'scripts', 'suggest-manifest-policy.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('studio --verify scopes acceptance manifest verification to the generated artifact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-acceptance-scope-test-'));
  const input = path.join(dir, 'good.json');
  const out = path.join(dir, 'out');
  const manifestPath = path.join(out, 'good.acceptance.manifest.json');
  const driftDir = path.join('slide-tool', 'out', `suggest-policy-studio-scope-drift-${process.pid}-${Date.now()}`);
  makeValidJsonOutline(input);
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(driftDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ artifacts: [], ignoreDirs: [] }));
  fs.writeFileSync(path.join(driftDir, 'drift.preview.html'), '<html><body>unrelated parallel artifact</body></html>');

  const result = runStudio(input, out, 'good', ['--verify'], {
    env: { ...process.env, SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1' },
  });

  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  assert.equal(generated.acceptance.ok, true);
  assert.equal(generated.acceptance.manifestVerification.ok, true);
  assert.equal(generated.acceptance.manifestVerification.result.checked, 1);
  assert.equal(generated.deliveryReadiness.ok, true);
});

test('studio --verify exposes a root-only discord report summary bundle', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-verify-summary-test-'));
  const input = path.join(dir, 'good.json');
  const out = path.join(dir, 'out');
  makeValidJsonOutline(input);

  const result = runStudio(input, out, 'good', ['--verify'], {
    env: { ...process.env, SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1' },
  });

  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  assertStudioDiscordReadyOutputContext(generated.discordReady);
});

test('studio discord report includes shell-safe regeneration command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-report-command-test-'));
  const input = path.join(dir, 'brief with space.json');
  const out = path.join(dir, 'out with space');
  makeValidJsonOutline(input);

  const result = runStudio(input, out, 'deck name', ['--verify']);
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  assert.equal(generated.acceptance.ok, true);
  const report = fs.readFileSync(generated.discordReport, 'utf8');
  assert.match(report, new RegExp(`node ${path.join(workspaceRoot, 'skills', 'slide-studio', 'scripts', 'shiro-slide-studio.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} --input '`));
  assert.match(report, /brief with space\.json'/);
  assert.match(report, /--out '.*out with space'/);
  assert.match(report, /--name 'deck name' --verify/);
  assert.match(report, new RegExp(path.join(slideToolRoot, 'scripts', 'verify.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + " '.*out with space' 'deck name'"));
  assert.match(report, /--update-manifest '.*out with space\/deck name\.acceptance\.manifest\.json' --verify-manifest --format markdown/);
});

test('studio discord report regeneration command can be executed as written', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-report-command-e2e-test-'));
  const input = path.join(dir, 'brief with space.json');
  const out = path.join(dir, 'out with space');
  makeValidJsonOutline(input);

  const result = runStudio(input, out, 'deck name', ['--verify']);
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  const report = fs.readFileSync(generated.discordReport, 'utf8');
  const command = report.split('\n').find((line) => line.includes('shiro-slide-studio.mjs --input'));
  assert.ok(command, 'discord report should contain a regeneration command');

  const rerunStdout = execSync(command, { cwd: workspaceRoot, encoding: 'utf8' });
  const rerun = parseLastJsonObject(rerunStdout, 'studio regeneration command');
  assert.equal(rerun.input, input);
  assert.equal(rerun.outline, path.join(out, 'deck name.outline.json'));
  assert.equal(rerun.verification.ok, true);
  assert.equal(fs.existsSync(path.join(out, 'deck name.editable.pptx')), true);
});

test('studio discord report manifest policy command can be executed as written', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-report-manifest-command-e2e-test-'));
  const input = path.join(dir, 'brief with space.json');
  const out = path.join(dir, 'out with space');
  makeValidJsonOutline(input);

  const result = runStudio(input, out, 'deck name', ['--verify']);
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  const report = fs.readFileSync(generated.discordReport, 'utf8');
  const command = report.split('\n').find((line) => line.includes('suggest-manifest-policy.mjs'));
  assert.ok(command, 'discord report should contain a manifest policy command');

  const markdown = execSync(command, { cwd: workspaceRoot, encoding: 'utf8' });
  assert.match(markdown, /^### Slide artifact policy: deck name deck/m);
  assert.match(markdown, /- ok: true/);
  assert.match(markdown, /- basename: deck name/);
  assert.match(markdown, /- requiredSlideTitles: Valid Deck, Validated Flow/);
});

test('studio discord report acceptance manifest command can be executed as written', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-report-acceptance-command-e2e-test-'));
  const input = path.join(dir, 'brief with space.json');
  const out = path.join(dir, 'out with space');
  makeValidJsonOutline(input);

  const result = runStudio(input, out, 'deck name', ['--verify']);
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  const report = fs.readFileSync(generated.discordReport, 'utf8');
  const command = report.split('\n').find((line) => line.includes('--update-manifest') && line.includes('--verify-manifest'));
  assert.ok(command, 'discord report should contain an acceptance manifest command');

  const markdown = execSync(command, { cwd: workspaceRoot, encoding: 'utf8' });
  assert.match(markdown, /^### Slide artifact policy: deck name deck/m);
  assert.match(markdown, /- ok: true/);
  assert.match(markdown, /- manifestUpdate: replaced /);
  assert.match(markdown, /- manifestVerification: ok/);

  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'deck name.acceptance.manifest.json'), 'utf8'));
  assert.equal(manifest.artifacts[0].basename, 'deck name');
  assert.deepEqual(manifest.artifacts[0].requiredSlideTitles, ['Valid Deck', 'Validated Flow']);
});

test('studio rejects overlong slide titles before creating artifacts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-long-title-test-'));
  const input = path.join(dir, 'bad.json');
  const out = path.join(dir, 'out');
  fs.writeFileSync(input, JSON.stringify({
    title: 'Long Title Deck',
    slides: [
      {
        title: 'This title is intentionally far too long for a single slide title area and should be rejected by studio before HTML and PPTX artifacts are generated because it will likely clip in preview',
        claim: 'Short claim',
        bullets: ['Short bullet'],
      },
    ],
  }));

  const result = runStudio(input, out, 'bad');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid outline/);
  assert.match(result.stderr, /title is too long/);
  assert.equal(fs.existsSync(out), false);
});

test('studio rejects overlong column copy before creating artifacts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-long-column-test-'));
  const input = path.join(dir, 'bad.json');
  const out = path.join(dir, 'out');
  fs.writeFileSync(input, JSON.stringify({
    title: 'Long Column Deck',
    slides: [
      {
        type: 'matrix',
        title: 'Short title',
        claim: 'Short claim',
        columns: [
          {
            title: 'Column A',
            body: 'This column body is intentionally far too long for a compact three-column slide cell and should be rejected before HTML and PPTX artifacts are generated because it will likely clip or shrink into unreadable text during Discord review loops and final PowerPoint export',
          },
        ],
      },
    ],
  }));

  const result = runStudio(input, out, 'bad');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid outline/);
  assert.match(result.stderr, /columns\[0\]\.body is too long/);
  assert.equal(fs.existsSync(out), false);
});

test('studio rejects Markdown sections without content before creating artifacts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-empty-markdown-test-'));
  const input = path.join(dir, 'empty.md');
  const out = path.join(dir, 'out');
  fs.writeFileSync(input, [
    '# Empty Section Deck',
    'Audience: internal',
    'Tone: concise',
    'Thesis: Empty sections should not become slides.',
    '',
    '## Valid Section',
    '- One concrete point',
    '',
    '## Empty Section',
  ].join('\n'));

  const result = runStudio(input, out, 'empty');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid Markdown outline/);
  assert.match(result.stderr, /Empty Section/);
  assert.equal(fs.existsSync(out), false);
});

test('studio generates verifiable artifacts from the sample Markdown brief', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-sample-markdown-test-'));
  const input = path.join(slideToolRoot, 'examples', 'ai-slide-workflow.md');
  const out = path.join(dir, 'out');

  const result = runStudio(input, out, 'sample', ['--verify'], {
    env: { ...process.env, SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = parseStudioOutput(result);
  assert.equal(generated.slides, 7);
  assert.equal(generated.verification.ok, true);
  assert.equal(generated.acceptance.ok, true);
  assert.equal(generated.acceptance.manifestVerification.ok, true);
  assert.equal(generated.acceptance.manifestVerification.result.checked, 1);
  assert.deepEqual(generated.acceptance.manifestVerification.result.checkedArtifactTypes, ['deck']);
  assert.equal(generated.deliveryReadiness.ok, true);
  assert.deepEqual(generated.deliveryReadiness.reasons, []);
  assert.equal(generated.identityChecks.report.matched, true);
  assert.deepEqual(generated.identityChecks.report.mismatches, []);
  assert.equal(generated.verification.outlineSlides, 7);
  assert.equal(generated.verification.pptxSlides, 7);
  assert.notStrictEqual(generated.verification, input.verification);
  assert.notStrictEqual(generated.acceptance, input.acceptance);

  const report = fs.readFileSync(generated.discordReport, 'utf8');
  assert.match(report, /検証結果:\n- status: ready\n- ok: true/);
  assert.match(report, /slides: outline 7 \/ HTML 7 \/ PPTX 7/);
  assert.match(report, /納品前チェック:\n- status: ready\n- ok: true/);
  assert.match(report, /納品前チェック:[\s\S]*delivery readiness: ready/);
  assert.match(report, /納品前チェック:[\s\S]*reasons: none/);
  assert.match(report, /- artifact policy: added/);
  assert.match(report, /- manifest verification: ok/);
  assert.match(report, /- manifest verification scope: manifest-only/);
  assert.match(report, /- checked artifacts: 1/);
  assert.match(report, /- checked artifact types: deck/);
  assert.match(report, /- identity checks: report ready/);
  assert.match(report, /納品前チェック:[\s\S]*visual QA: ready \/ source: fallback/);
  assert.match(report, /納品前チェック:[\s\S]*PPTX images: 0 \(none\)/);
  assert.match(report, /納品前チェック:[\s\S]*PPTX special elements: 0 \(none\)/);
  assert.match(report, /納品前チェック:[\s\S]*PPTX hidden text: 0/);

  const verify = runVerify(out, 'sample');
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(parseVerifyOutput(verify).ok, true);
});
