import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { slideToolRoot } from './test-paths.mjs';

const referencesDir = path.join(slideToolRoot, 'references');

function readReference(name) {
  return fs.readFileSync(path.join(referencesDir, name), 'utf8');
}

test('reference workflow requires verified sample generation before delivery', () => {
  const workflow = readReference('shiro-slide-studio-workflow.md');

  assert.match(workflow, /studio\.mjs[\s\S]*--verify/);
  assert.match(workflow, /verify-discord-report\.mjs/);
  assert.match(workflow, /delivery-message\.md/);
});

test('acceptance checklist template requires delivery QA evidence lines', () => {
  const checklist = readReference('acceptance-checklist-template.md');

  for (const required of [
    'acceptance manifest',
    'delivery readiness: ready',
    'reasons: none',
    'manifest verification: ok',
    'manifest verification scope: manifest-only',
    'checked artifacts:',
    'checked artifact types:',
    'identity checks: report ready',
    'visual QA:',
    'PPTX images: 0 (none)',
    'PPTX special elements: 0 (none)',
    'PPTX hidden text: 0',
    'verify-discord-report.mjs',
    'verify:shipping-docs',
  ]) {
    assert.match(checklist, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('discord intake template captures verification and delivery gates', () => {
  const intake = readReference('discord-intake-template.md');

  for (const required of [
    'verification:',
    'runStudioVerify: true',
    'acceptanceManifest: true',
    'verifyDiscordReport: true',
    'verifyFlatReportSummary: true',
    'verifyShippingDocs: true',
    'reportSummaryBundle: true',
    'reportSummaryContext: true',
    'deliveryMessage: true',
    'deliveryManifest: true',
    'delivery readiness: ready',
    'checked artifact types:',
    'visual QA:',
    'PPTX images: 0 (none)',
    '--verify',
    'verify-discord-report.mjs',
    'verifyFlatReportSummary: true',
    'verifyShippingDocs: true',
    'reportSummaryBundle: true',
    'reportSummaryContext: true',
  ]) {
    assert.match(intake, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(intake, /reportSummary:\s*\{/);
});

test('conversion guide is linked and carries delivery verification gates', () => {
  const workflow = readReference('shiro-slide-studio-workflow.md');
  const checklist = readReference('acceptance-checklist-template.md');
  const conversion = readReference('html-svg-to-pptx.md');

  assert.match(workflow, /html-svg-to-pptx\.md/);
  assert.match(checklist, /html-svg-to-pptx\.md/);

  for (const required of [
    'xmllint --noout',
    '--screenshot=out.png',
    'pptxgenjs',
    'verify-onepager.mjs',
    'acceptance-checklist-template.md',
    'verify-discord-report.mjs',
    'verify:shipping-docs',
    'delivery readiness: ready',
    'reportSummaryBundle',
    'reportSummaryContext',
    'PPTX images:',
  ]) {
    assert.match(conversion, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(workflow, /reportSummary:\s*\{/);
  assert.doesNotMatch(checklist, /reportSummary:\s*\{/);
  assert.doesNotMatch(conversion, /reportSummary:\s*\{/);
});

test('README documents flat reportSummary bundle and context expectations without legacy phrasing', () => {
  const readme = fs.readFileSync(path.join(slideToolRoot, 'README.md'), 'utf8');

  for (const required of [
    'reportSummaryBundle',
    'reportSummaryContext',
    'verify:shipping-docs',
    'flat',
    'assertStudioDiscordReadyOutputContext',
    'discord-report-flat-api',
  ]) {
    assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(readme, /reportSummary:\s*\{/);
  assert.doesNotMatch(readme, /legacy reportSummary/i);
});

test('new flat reportSummary sample is referenced by the example catalog', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(slideToolRoot, 'examples', 'verification-catalog.json'), 'utf8'));
  const entry = catalog.find((item) => item.file === 'discord-report-flat-api.md');
  assert.equal(entry?.status, 'verified');
  assert.equal(entry?.expectedSlides, 6);
  assert.equal(entry?.name, 'discord-report-flat-api');
});

test('discord report flat API example contains a copyable flat usage snippet without legacy phrasing', () => {
  const example = fs.readFileSync(path.join(slideToolRoot, 'examples', 'discord-report-flat-api.md'), 'utf8');
  for (const required of [
    'createCanonicalDiscordReadyOutput',
    'createCanonicalDiscordReportSummaryBundle',
    'createCanonicalStudioDiscordReportContext',
    'reportSummaryBundle',
    'reportSummaryContext',
  ]) {
    assert.match(example, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(example, /reportSummary:\s*\{/);
  assert.doesNotMatch(example, /旧ネスト|legacy reportSummary/i);
});
