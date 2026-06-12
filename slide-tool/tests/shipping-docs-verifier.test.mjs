import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';
import { slideToolRoot } from './test-paths.mjs';

const verifier = path.join(slideToolRoot, 'scripts', 'verify-shipping-docs.mjs');

test('shipping docs verifier passes on the shipped repository docs and sample catalog', () => {
  const result = runNodeScript(verifier, ['--only', 'discord-report-flat-api']);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseCommandJson(result, 'stdout', 'verify-shipping-docs');
  assert.equal(payload.ok, true);
  assert.match(payload.command, /^npm run verify:shipping-docs/);
  assert.equal(payload.exampleCatalog.ok, true);
  assert.equal(payload.flatReportSummary.ok, true);
  assert.equal(payload.exampleCatalog.verified >= 1, true);
  assert.equal(payload.flatReportSummary.legacyHits, 0);
  assert.equal(payload.errors.length, 0);
});

test('shipping docs verifier rejects legacy nested reportSummary markdown and reports both sections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-'));
  fs.writeFileSync(path.join(root, 'legacy.md'), '# legacy\n\n```yaml\nreportSummary:\n  summary: {}\n```\n', 'utf8');
  const markdownResult = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--flat-root',
    root,
    '--format',
    'md',
  ]);
  assert.notEqual(markdownResult.status, 0);
  assert.match(markdownResult.stdout, /# shipping docs verification/);
  assert.match(markdownResult.stdout, /- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --flat-root /);
  assert.match(markdownResult.stdout, /## Example catalog/);
  assert.match(markdownResult.stdout, /## Flat report summary sweep/);
  assert.match(markdownResult.stdout, /legacy nested reportSummary usage/);

  const jsonResult = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--flat-root',
    root,
    '--format',
    'json',
  ]);
  assert.notEqual(jsonResult.status, 0);
  const payload = parseCommandJson(jsonResult, 'stdout', 'verify-shipping-docs --format json');
  assert.equal(payload.ok, false);
  assert.equal(payload.flatReportSummary.ok, false);
  assert.equal(payload.flatReportSummary.legacyHits, 1);
  assert.equal(path.basename(payload.flatReportSummary.matches[0].file), 'legacy.md');
});

test('shipping docs verifier can emit a checklist-ready checklist block', () => {
  const result = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--format',
    'checklist',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --format checklist`/m);
  assert.match(result.stdout, /^- label: shipping docs verification/m);
  assert.match(result.stdout, /^- catalog: .*verification-catalog\.json/m);
  assert.match(result.stdout, /^- sample filter: discord-report-flat-api/m);
  assert.match(result.stdout, /^- flat roots: default repository shipping docs/m);
  assert.ok(result.stdout.includes('- [x] Example catalog verified 1 example(s)'));
  assert.match(result.stdout, /- entries:/);
  assert.match(result.stdout, /discord-report-flat-api\.md \(discord-report-flat-api\): verified/);
  assert.match(result.stdout, /- \[x\] Flat report summary sweep \d+ file\(s\), 0 legacy hit\(s\)/);
  assert.doesNotMatch(result.stdout, /## Example catalog/);
  assert.doesNotMatch(result.stdout, /## Flat report summary sweep/);
});

test('shipping docs verifier checklist output includes flat report summary matches when blocked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-checklist-matches-'));
  fs.writeFileSync(path.join(root, 'legacy.md'), '# legacy\n\n```yaml\nreportSummary:\n  summary: {}\n```\n', 'utf8');

  const result = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--flat-root',
    root,
    '--format',
    'checklist',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /- \[ \] Flat report summary sweep \d+ legacy hit\(s\)/);
  assert.match(result.stdout, /- matches:/);
  assert.match(result.stdout, /legacy\.md/);
  assert.match(result.stdout, /legacy nested reportSummary usage/);
});

test('shipping docs verifier can save a checklist-only markdown artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-checklist-'));
  const checklistPath = path.join(root, 'shipping-docs-checklist.md');
  const result = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--checklist-md',
    checklistPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --checklist-md /m);
  assert.match(result.stdout, /^- label: shipping docs verification/m);
  assert.match(result.stdout, /^- catalog: .*verification-catalog\.json/m);
  assert.match(result.stdout, /^- sample filter: discord-report-flat-api/m);
  assert.match(result.stdout, /^- flat roots: default repository shipping docs/m);
  assert.match(result.stdout, /- \[x\] Example catalog verified 1 example\(s\)/);
  assert.match(result.stdout, /- \[x\] Flat report summary sweep \d+ file\(s\), 0 legacy hit\(s\)/);
  assert.equal(fs.existsSync(checklistPath), true);
  const checklist = fs.readFileSync(checklistPath, 'utf8');
  assert.match(checklist, /^- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --checklist-md /m);
  assert.match(checklist, /^- label: shipping docs verification/m);
  assert.match(checklist, /^- catalog: .*verification-catalog\.json/m);
  assert.match(checklist, /^- sample filter: discord-report-flat-api/m);
  assert.match(checklist, /^- flat roots: default repository shipping docs/m);
  assert.match(checklist, /- \[x\] Example catalog verified 1 example\(s\)/);
  assert.match(checklist, /- entries:/);
  assert.match(checklist, /discord-report-flat-api\.md \(discord-report-flat-api\): verified/);
  assert.match(checklist, /- \[x\] Flat report summary sweep \d+ file\(s\), 0 legacy hit\(s\)/);
  assert.doesNotMatch(checklist, /## Example catalog/);
  assert.doesNotMatch(checklist, /## Flat report summary sweep/);
});

test('shipping docs verifier can save a checklist JSON artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-checklist-json-artifact-'));
  const checklistPath = path.join(root, 'shipping-docs-checklist.json');
  const result = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--checklist-json',
    checklistPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseCommandJson(result, 'stdout', 'verify-shipping-docs --checklist-json');
  assert.equal(payload.ok, true);
  assert.equal(payload.command, `npm run verify:shipping-docs -- --only discord-report-flat-api --checklist-json ${checklistPath}`);
  assert.equal(fs.existsSync(checklistPath), true);
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  assert.equal(checklist.ok, true);
  assert.equal(checklist.label, 'shipping docs verification');
  assert.equal(checklist.catalogPath, 'examples/verification-catalog.json');
  assert.equal(checklist.only, 'discord-report-flat-api');
  assert.equal(checklist.flatRoots, null);
  assert.deepEqual(checklist.checklist.map((entry) => entry.id), ['example-catalog', 'flat-report-summary']);
  assert.equal(checklist.checklist[0].ok, true);
  assert.equal(checklist.checklist[1].ok, true);
  assert.equal(checklist.checklist[0].summary, 'verified 1 example(s)');
  assert.match(checklist.checklist[1].summary, /^\d+ file\(s\), 0 legacy hit\(s\)$/);
  assert.equal(checklist.checklist[0].entries.length, 6);
  assert.equal(checklist.checklist[1].matches.length, 0);
  assert.equal(checklist.checklist[0].entries.some((entry) => entry.name === 'discord-report-flat-api'), true);
  assert.equal(checklist.checklist[0].entries.some((entry) => entry.status === 'verified'), true);
  assert.equal(checklist.checklist[0].entries.filter((entry) => entry.skipped === true).every((entry) => entry.status === 'skipped'), true);
  assert.equal(checklist.checklist[0].entries.some((entry) => entry.reason === 'filtered by --only'), true);
});

test('shipping docs verifier can keep JSON stdout while still writing a checklist artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-checklist-json-'));
  const checklistPath = path.join(root, 'shipping-docs-checklist.md');
  const result = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--format',
    'json',
    '--checklist-md',
    checklistPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseCommandJson(result, 'stdout', 'verify-shipping-docs --format json --checklist-md');
  assert.equal(payload.ok, true);
  assert.equal(payload.command, `npm run verify:shipping-docs -- --only discord-report-flat-api --format json --checklist-md ${checklistPath}`);
  assert.equal(payload.label, 'shipping docs verification');
  assert.match(payload.catalogPath, /verification-catalog\.json$/);
  assert.equal(payload.only, 'discord-report-flat-api');
  assert.equal(payload.flatRoots, null);
  assert.equal(fs.existsSync(checklistPath), true);
  const checklist = fs.readFileSync(checklistPath, 'utf8');
  assert.match(checklist, /^- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --format json --checklist-md /m);
  assert.match(checklist, /^- label: shipping docs verification/m);
  assert.match(checklist, /^- catalog: .*verification-catalog\.json/m);
  assert.match(checklist, /^- sample filter: discord-report-flat-api/m);
  assert.match(checklist, /^- flat roots: default repository shipping docs/m);
  assert.match(checklist, /- \[x\] Example catalog verified 1 example\(s\)/);
  assert.match(checklist, /- entries:/);
  assert.match(checklist, /discord-report-flat-api\.md \(discord-report-flat-api\): verified/);
  assert.match(checklist, /- \[x\] Flat report summary sweep \d+ file\(s\), 0 legacy hit\(s\)/);
  assert.doesNotMatch(checklist, /- matches:/);
});

test('shipping docs verifier can emit a checklist-ready markdown report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-md-'));
  const reportPath = path.join(root, 'shipping-docs-report.md');
  const result = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--report-md',
    reportPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# shipping docs verification/);
  assert.match(result.stdout, /- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --report-md /);
  assert.match(result.stdout, /^- label: shipping docs verification/m);
  assert.match(result.stdout, /^- catalog: .*verification-catalog\.json/m);
  assert.match(result.stdout, /^- sample filter: discord-report-flat-api/m);
  assert.match(result.stdout, /^- flat roots: default repository shipping docs/m);
  assert.match(result.stdout, /## Acceptance checklist/);
  assert.match(result.stdout, /- \[x\] Example catalog verified 1 example\(s\)/);
  assert.match(result.stdout, /- \[x\] Flat report summary sweep \d+ file\(s\), 0 legacy hit\(s\)/);
  assert.match(result.stdout, /## Example catalog/);
  assert.match(result.stdout, /## Flat report summary sweep/);
  assert.equal(fs.existsSync(reportPath), true);
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /# shipping docs verification/);
  assert.match(report, /- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --report-md /);
  assert.match(report, /^- label: shipping docs verification/m);
  assert.match(report, /^- catalog: .*verification-catalog\.json/m);
  assert.match(report, /^- sample filter: discord-report-flat-api/m);
  assert.match(report, /^- flat roots: default repository shipping docs/m);
  assert.match(report, /## Acceptance checklist/);
  assert.match(report, /- ok: true/);
  assert.match(report, /- \[x\] Example catalog verified 1 example\(s\)/);
  assert.match(report, /- \[x\] Flat report summary sweep \d+ file\(s\), 0 legacy hit\(s\)/);
  assert.match(report, /- verified entries:/);
  assert.match(report, /discord-report-flat-api\.md \(discord-report-flat-api\)/);
  assert.match(report, /- legacy hits: 0/);
});

test('shipping docs verifier can keep JSON stdout while still writing a checklist report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-json-'));
  const reportPath = path.join(root, 'shipping-docs-report.md');
  const result = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--format',
    'json',
    '--report-md',
    reportPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseCommandJson(result, 'stdout', 'verify-shipping-docs --format json --report-md');
  assert.equal(payload.ok, true);
  assert.equal(payload.command, `npm run verify:shipping-docs -- --only discord-report-flat-api --format json --report-md ${reportPath}`);
  assert.equal(payload.label, 'shipping docs verification');
  assert.match(payload.catalogPath, /verification-catalog\.json$/);
  assert.equal(payload.only, 'discord-report-flat-api');
  assert.equal(payload.flatRoots, null);
  assert.equal(fs.existsSync(reportPath), true);
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /# shipping docs verification/);
  assert.match(report, /- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --format json --report-md /);
  assert.match(report, /^- label: shipping docs verification/m);
  assert.match(report, /^- catalog: .*verification-catalog\.json/m);
  assert.match(report, /^- sample filter: discord-report-flat-api/m);
  assert.match(report, /^- flat roots: default repository shipping docs/m);
  assert.match(report, /## Acceptance checklist/);
  assert.match(report, /- ok: true/);
  assert.match(report, /- \[x\] Example catalog verified 1 example\(s\)/);
  assert.match(report, /- \[x\] Flat report summary sweep \d+ file\(s\), 0 legacy hit\(s\)/);
  assert.match(report, /- verified entries:/);
  assert.match(report, /discord-report-flat-api\.md \(discord-report-flat-api\)/);
});

test('shipping docs verifier creates missing parent directories for checklist and report artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-artifacts-'));
  const nestedDir = path.join(root, 'nested', 'artifacts');
  const reportPath = path.join(nestedDir, 'shipping-docs-report.md');
  const checklistPath = path.join(nestedDir, 'shipping-docs-checklist.md');

  const reportResult = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--report-md',
    reportPath,
  ]);
  assert.equal(reportResult.status, 0, reportResult.stderr);
  assert.equal(fs.existsSync(reportPath), true);
  assert.equal(fs.existsSync(nestedDir), true);

  const checklistResult = runNodeScript(verifier, [
    '--only',
    'discord-report-flat-api',
    '--checklist-md',
    checklistPath,
  ]);
  assert.equal(checklistResult.status, 0, checklistResult.stderr);
  assert.equal(fs.existsSync(checklistPath), true);
  assert.equal(fs.existsSync(nestedDir), true);
  const checklist = fs.readFileSync(checklistPath, 'utf8');
  assert.match(checklist, /^- command: `npm run verify:shipping-docs -- --only discord-report-flat-api --checklist-md /m);
  assert.match(checklist, /^- label: shipping docs verification/m);
  assert.match(checklist, /^- catalog: .*verification-catalog\.json/m);
});

test('shipping docs verifier accepts a custom catalog path and reports example catalog failures', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-shipping-docs-catalog-'));
  const catalogPath = path.join(root, 'verification-catalog.json');
  const catalog = JSON.parse(fs.readFileSync(path.join(slideToolRoot, 'examples', 'verification-catalog.json'), 'utf8'));
  const tweakedCatalog = catalog.map((entry) => (
    entry.name === 'discord-report-flat-api'
      ? { ...entry, expectedSlides: entry.expectedSlides + 1 }
      : entry
  ));
  fs.writeFileSync(catalogPath, `${JSON.stringify(tweakedCatalog, null, 2)}\n`, 'utf8');

  const result = runNodeScript(verifier, [
    '--catalog',
    catalogPath,
    '--only',
    'discord-report-flat-api',
    '--format',
    'md',
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /## Example catalog/);
  assert.match(result.stdout, /discord-report-flat-api\.md slides/);
  assert.match(result.stdout, /expected 7/);
  const jsonResult = runNodeScript(verifier, [
    '--catalog',
    catalogPath,
    '--only',
    'discord-report-flat-api',
    '--format',
    'json',
  ]);
  assert.notEqual(jsonResult.status, 0);
  const payload = parseCommandJson(jsonResult, 'stdout', 'verify-shipping-docs --catalog');
  assert.equal(payload.ok, false);
  assert.equal(payload.exampleCatalog.ok, false);
  assert.equal(payload.only, 'discord-report-flat-api');
  assert.equal(payload.label, 'shipping docs verification');
  assert.match(payload.catalogPath, /verification-catalog\.json$/);
  assert.match(payload.exampleCatalog.errors.join('\n'), /slides 6 != expected 7/);
});
