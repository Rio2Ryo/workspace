import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';
import { slideToolRoot } from './test-paths.mjs';

const examplesDir = path.join(slideToolRoot, 'examples');
const catalogPath = path.join(examplesDir, 'verification-catalog.json');
const studioScript = path.join(slideToolRoot, 'scripts', 'studio.mjs');
const verifyScript = path.join(slideToolRoot, 'scripts', 'verify.mjs');
const discordReportVerifierScript = path.join(slideToolRoot, 'scripts', 'verify-discord-report.mjs');
const exampleInputPattern = /\.(json|md)$/;
const catalogStatuses = new Set(['verified', 'manual']);

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function listExampleInputs() {
  return fs.readdirSync(examplesDir)
    .filter((file) => exampleInputPattern.test(file))
    .filter((file) => file !== path.basename(catalogPath))
    .sort();
}

function assertKebabCase(value, label) {
  assert.match(value, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label} must be kebab-case`);
}

test('example verification catalog covers every shipped example input', () => {
  const catalog = readCatalog();
  const expectedFiles = listExampleInputs();
  const catalogFiles = catalog.map((entry) => entry.file).sort();
  assert.deepEqual(catalogFiles, expectedFiles);

  for (const entry of catalog) {
    assert.equal(typeof entry.file, 'string');
    assert.equal(typeof entry.name, 'string');
    assertKebabCase(entry.name, `${entry.file} name`);
    assert.equal(catalogStatuses.has(entry.status), true, `${entry.file} has known status`);
    if (entry.status === 'verified') {
      assert.equal(Number.isInteger(entry.expectedSlides), true, `${entry.file} expectedSlides is required`);
      assert.equal(entry.expectedSlides > 0, true, `${entry.file} expectedSlides must be positive`);
      continue;
    }
    assert.equal(typeof entry.reason, 'string', `${entry.file} manual entries need a reason`);
    assert.equal(entry.reason.trim().length > 0, true, `${entry.file} manual reason cannot be empty`);
  }
});

test('verified example catalog entries pass studio verification and delivery gates', () => {
  const verifiedEntries = readCatalog().filter((entry) => entry.status === 'verified');
  const manualEntries = readCatalog().filter((entry) => entry.status === 'manual');
  assert.deepEqual(
    manualEntries.map((entry) => entry.file),
    [],
    'all shipped examples should be promoted to verified or removed from examples',
  );
  assert.equal(verifiedEntries.length >= 2, true, 'keep at least two verified examples ready for reuse');
  assert.equal(
    verifiedEntries.some((entry) => entry.file.endsWith('.json')),
    true,
    'keep at least one structured JSON example verified for reuse',
  );

  for (const entry of verifiedEntries) {
    const input = path.join(examplesDir, entry.file);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), `slide-example-${entry.name}-`));
    const result = runNodeScript(studioScript, [input, '--out', out, '--name', entry.name, '--verify'], {
      env: { SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
    const generated = parseCommandJson(result, 'stdout', `studio ${entry.file}`);
    assert.equal(generated.slides, entry.expectedSlides);
    assert.equal(generated.verification.ok, true);
    assert.equal(generated.acceptance.ok, true);
    assert.equal(generated.acceptance.manifestVerification.ok, true);
    assert.equal(generated.acceptance.manifestVerification.result.checked, 1);
    assert.deepEqual(generated.acceptance.manifestVerification.result.checkedArtifactTypes, ['deck']);
    assert.equal(generated.deliveryReadiness.ok, true);
    assert.deepEqual(generated.deliveryReadiness.reasons, []);

    const verify = runNodeScript(verifyScript, [out, entry.name]);
    assert.equal(verify.status, 0, verify.stderr);
    assert.equal(parseCommandJson(verify, 'stdout', `verify ${entry.file}`).ok, true);

    const reportVerify = runNodeScript(discordReportVerifierScript, [
      generated.discordReport,
      '--delivery-message',
      path.join(out, 'delivery-message.md'),
      '--delivery-manifest',
      path.join(out, 'delivery-manifest.json'),
    ]);
    assert.equal(reportVerify.status, 0, reportVerify.stderr);
    assert.equal(parseCommandJson(reportVerify, 'stdout', `verify-discord-report ${entry.file}`).ok, true);
  }
});

test('verify-example-catalog cli verifies all shipped example inputs', () => {
  const cli = runNodeScript(path.join(slideToolRoot, 'scripts', 'verify-example-catalog.mjs'), []);
  assert.equal(cli.status, 0, cli.stderr);
  const payload = parseCommandJson(cli, 'stdout', 'verify-example-catalog');
  assert.equal(payload.ok, true);
  assert.equal(payload.verified, 5);
  assert.equal(payload.manual, 0);
  assert.equal(payload.skipped, 0);
  assert.equal(payload.entries.length, 5);
  assert.equal(payload.entries.every((entry) => entry.ok === true), true);
  assert.deepEqual(
    payload.entries.map((entry) => entry.file).sort(),
    readCatalog().map((entry) => entry.file).sort(),
  );
});

test('verify-example-catalog cli can focus on a single example by name', () => {
  const cli = runNodeScript(path.join(slideToolRoot, 'scripts', 'verify-example-catalog.mjs'), [
    '--only',
    'discord-report-flat-api',
  ]);
  assert.equal(cli.status, 0, cli.stderr);
  const payload = parseCommandJson(cli, 'stdout', 'verify-example-catalog --only');
  assert.equal(payload.ok, true);
  assert.equal(payload.verified, 1);
  assert.equal(payload.manual, 0);
  assert.equal(payload.skipped, 4);
  assert.equal(payload.entries.length, 5);
  assert.equal(payload.entries.filter((entry) => entry.ok === true).length, 1);
  assert.equal(payload.entries.filter((entry) => entry.skipped === true).length, 4);
  assert.equal(payload.entries.filter((entry) => entry.skipped === true).every((entry) => entry.status === 'skipped'), true);
  assert.equal(
    payload.entries.find((entry) => entry.name === 'discord-report-flat-api')?.ok,
    true,
  );
  assert.equal(
    payload.entries.find((entry) => entry.name === 'discord-report-flat-api')?.file,
    'discord-report-flat-api.md',
  );
});

test('verify-example-catalog cli can render a markdown report to stdout and file', () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-example-report-'));
  const reportPath = path.join(reportDir, 'example-report.md');
  const cli = runNodeScript(path.join(slideToolRoot, 'scripts', 'verify-example-catalog.mjs'), [
    '--only',
    'discord-report-flat-api',
    '--format',
    'md',
    '--report-md',
    reportPath,
    '--label',
    'flat api example verification',
  ]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /# flat api example verification/);
  assert.match(cli.stdout, /- ok: true/);
  assert.match(cli.stdout, /discord-report-flat-api/);
  assert.equal(fs.existsSync(reportPath), true);
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /# flat api example verification/);
  assert.match(report, /- verified: 1/);
  assert.match(report, /discord-report-flat-api/);
  assert.doesNotMatch(report, /reportSummary:\s*\{/);
});
