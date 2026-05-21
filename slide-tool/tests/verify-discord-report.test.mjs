import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slideToolExample, slideToolRoot, workspaceRoot } from './test-paths.mjs';
import { unusedNamedImports } from './import-contract-utils.mjs';
import {
  assertVerifyDiscordReportOutputContext,
} from './summary-contract-utils.mjs';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';

const studio = path.join(slideToolRoot, 'scripts', 'studio.mjs');
const wrapper = path.join(workspaceRoot, 'skills', 'slide-studio', 'scripts', 'shiro-slide-studio.mjs');
const script = path.join(slideToolRoot, 'scripts', 'verify-discord-report.mjs');
const sampleInput = slideToolExample('ai-slide-workflow.md');

function runStudio(args, options = {}) {
  return runNodeScript(studio, args, options);
}

function parseStudioOutput(result) {
  return parseCommandJson(result, 'stdout', 'studio');
}

function runWrapper(args, options = {}) {
  return runNodeScript(wrapper, args, options);
}

function writeOutline(input) {
  fs.writeFileSync(input, JSON.stringify({
    title: 'Report Status',
    slides: [{ title: 'Report Status', speakerNotes: 'status guard' }],
  }));
}

function generateVerifiedStudioReport(prefix, options = {}) {
  const {
    inputPath = sampleInput,
    name = 'deck',
    outName = 'out',
    writeDefaultOutline = false,
  } = options;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const input = inputPath ?? path.join(dir, 'brief.json');
  const out = path.join(dir, outName);
  if (writeDefaultOutline) {
    writeOutline(input);
  }
  const generated = runStudio([
    '--input',
    input,
    '--out',
    out,
    '--name',
    name,
    '--verify',
  ]);
  assert.equal(generated.status, 0, generated.stderr);
  const generatedJson = parseStudioOutput(generated);
  return {
    dir,
    input,
    out,
    generatedJson,
    reportPath: generatedJson.discordReport,
  };
}

function generateReadyWrapperReport(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const out = path.join(dir, 'out');
  const generated = runWrapper([
    sampleInput,
    '--out',
    out,
    '--name',
    'deck',
  ]);
  assert.equal(generated.status, 0, generated.stderr);
  const generatedJson = {
    discordReport: path.join(out, 'discord-report.md'),
    discordReady: {
      deliveryMessagePath: path.join(out, 'delivery-message.md'),
      deliveryManifestPath: path.join(out, 'delivery-manifest.json'),
    },
  };
  return {
    dir,
    out,
    generatedJson,
    wrapperStdout: generated.stdout,
  };
}

function runVerifyDiscordReadyPaths(generatedJson) {
  return runVerifyDiscordReport([
    generatedJson.discordReport,
    '--delivery-message',
    generatedJson.discordReady.deliveryMessagePath,
    '--delivery-manifest',
    generatedJson.discordReady.deliveryManifestPath,
  ]);
}

function runVerifyDiscordReport(args, options = {}) {
  return runNodeScript(script, args, options);
}

function parseVerifyDiscordReport(result) {
  return parseCommandJson(result, 'stdout', 'verify-discord-report');
}

function verifiedReportSummary(reportPath) {
  const reportCheck = runVerifyDiscordReport([reportPath]);
  assert.equal(reportCheck.status, 0, reportCheck.stdout + reportCheck.stderr);
  return parseVerifyDiscordReport(reportCheck).summary;
}

function generateVerifiedStudioReportWithSummary(prefix) {
  const generated = generateVerifiedStudioReport(prefix, {
    inputPath: null,
    writeDefaultOutline: true,
  });
  return {
    ...generated,
    summary: verifiedReportSummary(generated.reportPath),
  };
}

function generateVerifiedStudioReportPair(prefix, names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const input = path.join(dir, 'brief.json');
  writeOutline(input);
  const reports = Object.fromEntries(names.map((name) => {
    const generated = generateVerifiedStudioReport(prefix, {
      inputPath: input,
      name,
      outName: `${name}-out`,
    });
    return [name, generated];
  }));
  return {
    dir,
    input,
    reports,
  };
}

function generateUnverifiedStudioReport(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const input = path.join(dir, 'brief.json');
  const out = path.join(dir, 'out');
  writeOutline(input);
  const generated = runStudio([
    '--input',
    input,
    '--out',
    out,
    '--name',
    'deck',
  ]);
  assert.equal(generated.status, 0, generated.stderr);
  const generatedJson = parseStudioOutput(generated);
  return {
    dir,
    input,
    out,
    generatedJson,
    reportPath: generatedJson.discordReport,
  };
}

test('verify-discord-report passes ready reports generated with --verify', () => {
  const { out, reportPath } = generateVerifiedStudioReport('verify-discord-report-ready-test-');

  const result = runVerifyDiscordReport([reportPath]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, true);
  assert.deepEqual(output.sections, { verification: 'ready', acceptance: 'ready' });
  assertVerifyDiscordReportOutputContext(output);
  const summary = output.summary;
  assert.equal(summary.postable, true);
  assert.match(summary.message, /投稿OK: AIでスライドを作る最新ワークフロー \/ slides 7 \/ acceptance ready/);
  assert.deepEqual(summary.slides, { outline: 7, html: 7, pptx: 7 });
  assert.equal(summary.checkedArtifacts.count, 1);
  assert.equal(summary.artifacts.some((artifact) => artifact.endsWith('deck.editable.pptx')), true);
  assert.equal(summary.artifactsByType.html.endsWith('deck.preview.html'), true);
  assert.equal(summary.artifactsByType.pptx.endsWith('deck.editable.pptx'), true);
  assert.equal(summary.artifactsByType.outline.endsWith('deck.outline.json'), true);
  assert.equal(summary.artifactsByType.prompts.endsWith('deck.image-prompts.md'), true);
  assert.equal(summary.artifactDetails.pptx.exists, true);
  assert.equal(summary.artifactDetails.pptx.bytes > 0, true);
  assert.equal(summary.artifactDetails.html.exists, true);
  assert.deepEqual(summary.reportArtifactIdentity, {
    name: 'deck deck',
    type: 'deck',
    dir: out,
    basename: 'deck',
  });
  assert.deepEqual(summary.identityChecks.report, {
    expected: {
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
    },
    actual: {
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
    },
    matched: true,
    mismatches: [],
  });
  assert.equal(summary.acceptanceManifest.scope, 'manifest-only');
  assert.equal(summary.acceptanceManifest.scopeLine, 'manifest verification scope: manifest-only');
  assert.equal(summary.acceptanceManifest.verification.scope, 'manifest-only');
  assert.deepEqual(summary.attachmentPolicy.required, ['pptx', 'html']);
  assert.deepEqual(summary.attachmentPolicy.optional, ['outline', 'prompts']);
  assert.deepEqual(summary.attachmentPolicy.audit, ['manifest']);
  assert.equal(summary.attachmentPolicy.requiredReady, true);
  assert.deepEqual(summary.pptxInternalQa.acceptance.hiddenText, {
    status: 'present',
    count: 0,
    line: 'PPTX hidden text: 0',
  });
  assert.deepEqual(summary.attachments.required.map((attachment) => attachment.type), ['pptx', 'html']);
  assert.deepEqual(summary.attachments.optional.map((attachment) => attachment.type), ['outline', 'prompts']);
  assert.deepEqual(summary.attachments.audit.map((attachment) => attachment.type), ['manifest']);
  assert.equal(summary.attachments.required.every((attachment) => attachment.attachable), true);
  assert.equal(summary.attachments.required.every((attachment) => attachment.bytes > 0), true);
  assert.equal(summary.attachments.required[0].path.endsWith('deck.editable.pptx'), true);
  assert.equal(summary.attachments.required[1].path.endsWith('deck.preview.html'), true);
  assert.deepEqual(summary.attachments.postablePaths, [
    summary.attachments.required[0].path,
    summary.attachments.required[1].path,
    summary.attachments.optional[0].path,
    summary.attachments.optional[1].path,
    summary.attachments.audit[0].path,
  ]);
});

test('verify-discord-report exposes identity checks for delivery message and manifest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-discord-report-identity-summary-test-'));
  const out = path.join(dir, 'out');
  const generated = runWrapper([
    sampleInput,
    '--out',
    out,
    '--name',
    'deck',
  ]);
  assert.equal(generated.status, 0, generated.stderr);
  const generatedJson = {
    discordReport: path.join(out, 'discord-report.md'),
    discordReady: {
      deliveryMessagePath: path.join(out, 'delivery-message.md'),
      deliveryManifestPath: path.join(out, 'delivery-manifest.json'),
    },
  };

  const result = runVerifyDiscordReport([
    generatedJson.discordReport,
    '--delivery-message',
    generatedJson.discordReady.deliveryMessagePath,
    '--delivery-manifest',
    generatedJson.discordReady.deliveryManifestPath,
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, true);
  assert.equal(output.summary.identityChecks.report.matched, true);
  assert.equal(output.summary.identityChecks.deliveryMessage.matched, true);
  assert.equal(output.summary.identityChecks.deliveryManifest.matched, true);
  assert.deepEqual(output.summary.identityChecks.deliveryMessage.mismatches, []);
  assert.deepEqual(output.summary.identityChecks.deliveryManifest.mismatches, []);
  assert.equal(output.summary.deliveryMessage.qaOrderMatched, true);
  assert.equal(output.summary.deliveryMessage.qaMatched, true);
  assert.equal(output.summary.deliveryMessage.qaDiff.firstMismatch, null);
  assert.deepEqual(output.summary.deliveryMessage.qaDiff.allowedUnexpectedLinePolicies, [{
    name: 'identityChecks',
    exactLines: [output.summary.deliveryMessage.expectedIdentityQaLine],
    pattern: null,
    reason: 'validated separately against delivery manifest identityChecks',
  }]);
  assert.equal(output.summary.deliveryMessage.expectedIdentityQaLine, 'identity checks: report ready / deliveryMessage ready');
  assert.deepEqual(output.summary.deliveryManifest.actual.identityChecks, {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: true, mismatches: [] },
    deliveryManifest: { matched: true, mismatches: [] },
  });
  assert.equal(output.summary.deliveryManifest.checks.identityChecksMatched, true);
  assert.equal(
    output.summary.deliveryMessage.actualQaLines.includes('identity checks: report ready / deliveryMessage ready'),
    true,
  );
});

test('verify-discord-report fails when final delivery manifest omits identity checks', () => {
  const { generatedJson } = generateReadyWrapperReport('verify-discord-report-missing-manifest-identity-test-');
  const manifest = JSON.parse(fs.readFileSync(generatedJson.discordReady.deliveryManifestPath, 'utf8'));
  delete manifest.identityChecks;
  manifest.qaLines = manifest.qaLines.filter((line) => !line.startsWith('identity checks:'));
  fs.writeFileSync(generatedJson.discordReady.deliveryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = runVerifyDiscordReadyPaths(generatedJson);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.deliveryManifest.checks.identityChecksRequired, true);
  assert.equal(output.summary.deliveryManifest.checks.identityChecksMatched, false);
  assert.match(output.errors.join('\n'), /delivery manifest identityChecks missing/);
});

test('verify-discord-report reports duplicate identity QA lines in delivery manifest', () => {
  const { generatedJson } = generateReadyWrapperReport('verify-discord-report-duplicate-manifest-identity-qa-test-');
  const manifest = JSON.parse(fs.readFileSync(generatedJson.discordReady.deliveryManifestPath, 'utf8'));
  const identityLine = 'identity checks: report ready / deliveryMessage ready / deliveryManifest ready';
  const insertAt = manifest.qaLines.indexOf(identityLine);
  manifest.qaLines.splice(insertAt, 0, identityLine);
  fs.writeFileSync(generatedJson.discordReady.deliveryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = runVerifyDiscordReadyPaths(generatedJson);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.deepEqual(output.summary.deliveryManifest.duplicateQaLines, [identityLine]);
  assert.match(output.errors.join('\n'), /delivery manifest duplicate QA line: identity checks: report ready \/ deliveryMessage ready \/ deliveryManifest ready/);
});

test('verify-discord-report reports duplicate delivery manifest attachment paths', () => {
  const { generatedJson } = generateReadyWrapperReport('verify-discord-report-duplicate-manifest-attachment-paths-test-');
  const manifest = JSON.parse(fs.readFileSync(generatedJson.discordReady.deliveryManifestPath, 'utf8'));
  const duplicateDeliverablePath = manifest.deliverablePaths[0];
  const duplicateAuditPath = manifest.auditPaths[0];
  manifest.deliverablePaths.splice(1, 0, duplicateDeliverablePath);
  manifest.auditPaths.splice(1, 0, duplicateAuditPath);
  fs.writeFileSync(generatedJson.discordReady.deliveryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = runVerifyDiscordReadyPaths(generatedJson);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.deepEqual(output.summary.deliveryManifest.duplicateDeliverablePaths, [duplicateDeliverablePath]);
  assert.deepEqual(output.summary.deliveryManifest.duplicateAuditPaths, [duplicateAuditPath]);
  assert.equal(output.errors.includes(`delivery manifest duplicate deliverable path: ${duplicateDeliverablePath}`), true);
  assert.equal(output.errors.includes(`delivery manifest duplicate audit path: ${duplicateAuditPath}`), true);
});

test('verify-discord-report reports delivery manifest array schema errors', () => {
  const { generatedJson } = generateReadyWrapperReport('verify-discord-report-delivery-manifest-array-schema-test-');
  const manifest = JSON.parse(fs.readFileSync(generatedJson.discordReady.deliveryManifestPath, 'utf8'));
  manifest.qaLines = 'not-array';
  manifest.deliverablePaths = [manifest.deliverablePaths[0], ''];
  manifest.auditPaths = [manifest.auditPaths[0], 42];
  fs.writeFileSync(generatedJson.discordReady.deliveryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = runVerifyDiscordReadyPaths(generatedJson);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.errors.includes('delivery manifest qaLines must be an array'), true);
  assert.equal(output.errors.includes('delivery manifest deliverablePaths must contain only non-empty strings'), true);
  assert.equal(output.errors.includes('delivery manifest auditPaths must contain only non-empty strings'), true);
});

test('verify-discord-report reports delivery manifest identityChecks schema errors', () => {
  const { generatedJson } = generateReadyWrapperReport('verify-discord-report-delivery-manifest-identity-schema-test-');
  const manifest = JSON.parse(fs.readFileSync(generatedJson.discordReady.deliveryManifestPath, 'utf8'));
  manifest.identityChecks.report = { matched: 'yes', mismatches: 'none' };
  manifest.identityChecks.deliveryMessage = ['not-object'];
  manifest.identityChecks.unknown = { matched: true, mismatches: [] };
  fs.writeFileSync(generatedJson.discordReady.deliveryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = runVerifyDiscordReadyPaths(generatedJson);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.errors.includes('delivery manifest identityChecks.unknown is not supported'), true);
  assert.equal(output.errors.includes('delivery manifest identityChecks.report.matched must be a boolean'), true);
  assert.equal(output.errors.includes('delivery manifest identityChecks.report.mismatches must be an array'), true);
  assert.equal(output.errors.includes('delivery manifest identityChecks.deliveryMessage must be an object'), true);
});

test('verify-discord-report resolves relative report paths from the report directory', () => {
  const { out, reportPath } = generateVerifiedStudioReport('verify-discord-report-relative-path-test-');
  let report = fs.readFileSync(reportPath, 'utf8');
  report = report
    .replace(
      /納品前チェック:\n- status: blocked\n- ok: false\n- delivery readiness: blocked\n- reasons: acceptance not ready\n/,
      '納品前チェック:\n- status: ready\n- ok: true\n- delivery readiness: ready\n- reasons: none\n',
    )
    .replace(/^- manifest verification: failed$/m, '- manifest verification: ok')
    .replace(/^- error: .+$/m, '');
  for (const basename of [
    'deck.editable.pptx',
    'deck.preview.html',
    'deck.outline.json',
    'deck.image-prompts.md',
    'deck.acceptance.manifest.json',
  ]) {
    report = report.replaceAll(path.join(out, basename), basename);
  }
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath], { cwd: workspaceRoot });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, true);
  assertVerifyDiscordReportOutputContext(output);
  assert.equal(output.summary.acceptanceManifest.path, path.join(out, 'deck.acceptance.manifest.json'));
  assert.equal(output.summary.artifactsByType.pptx, path.join(out, 'deck.editable.pptx'));
  assert.equal(output.summary.artifactsByType.html, path.join(out, 'deck.preview.html'));
});

test('verify-discord-report fails when a referenced artifact file is missing', () => {
  const { out, reportPath } = generateVerifiedStudioReport('verify-discord-report-missing-artifact-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  fs.unlinkSync(path.join(out, 'deck.editable.pptx'));

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.postable, false);
  assert.equal(output.summary.artifactDetails.pptx.exists, false);
  assert.equal(output.summary.attachmentPolicy.requiredReady, false);
  assert.match(output.errors.join('\n'), /pptx artifact file is missing/);
  assert.match(output.errors.join('\n'), /required attachments are not ready: pptx, html/);
});

test('verify-discord-report warns but passes when an optional artifact file is missing', () => {
  const { out, reportPath } = generateVerifiedStudioReport('verify-discord-report-optional-artifact-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  fs.unlinkSync(path.join(out, 'deck.image-prompts.md'));

  const result = runVerifyDiscordReport([reportPath]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, true);
  assert.equal(output.summary.postable, true);
  assert.equal(output.summary.attachmentPolicy.requiredReady, true);
  assert.equal(output.summary.artifactDetails.prompts.exists, false);
  assert.deepEqual(output.summary.attachments.postablePaths, [
    output.summary.attachments.required[0].path,
    output.summary.attachments.required[1].path,
    output.summary.attachments.optional[0].path,
    output.summary.attachments.audit[0].path,
  ]);
  assert.equal(output.summary.attachments.optional[1].type, 'prompts');
  assert.equal(output.summary.attachments.optional[1].attachable, false);
  assert.deepEqual(output.errors, []);
  assert.match(output.warnings.join('\n'), /optional prompts artifact file is missing/);
});

test('verify-discord-report fails when referenced acceptance manifest is missing', () => {
  const { out, reportPath } = generateVerifiedStudioReport('verify-discord-report-missing-manifest-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  fs.unlinkSync(manifestPath);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.acceptanceManifest.path, manifestPath);
  assert.equal(output.summary.acceptanceManifest.exists, false);
  assert.match(output.errors.join('\n'), /acceptance manifest file is missing/);
});

test('verify-discord-report fails when report checked artifact summary differs from manifest verification', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-manifest-summary-mismatch-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .replace('- checked artifacts: 1', '- checked artifacts: 2')
    .replace('- checked artifact types: deck', '- checked artifact types: onepager');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.checkedArtifacts.count, 2);
  assert.equal(output.summary.acceptanceManifest.verification.checked, 1);
  assert.deepEqual(output.summary.checkedArtifactTypes.types, ['onepager']);
  assert.deepEqual(output.summary.acceptanceManifest.verification.checkedArtifactTypes, ['deck']);
  assert.match(output.errors.join('\n'), /checked artifacts mismatch: report 2 != manifest 1/);
  assert.match(output.errors.join('\n'), /checked artifact types mismatch: report onepager != manifest deck/);
});

test('verify-discord-report delegates checked artifact type formatting to shared helpers', () => {
  const verifierSource = fs.readFileSync(script, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');
  assert.match(verifierSource, /deliveryManifestSectionStatus/);
  assert.match(verifierSource, /deliveryManifestValidateDiscordReportValidations/);
  assert.match(verifierSource, /deliveryManifestValidateDiscordReport/);
  assert.match(verifierSource, /deliveryManifestDiscordReportVerificationPayload/);
  assert.match(helperSource, /checked artifact types mismatch: report \$\{deliveryManifestFormatCheckedArtifactTypes\(reportTypes\)\} != manifest \$\{deliveryManifestFormatCheckedArtifactTypes\(manifestTypes\)\}/);
  assert.match(helperSource, /function deliveryManifestFormatCheckedArtifactTypes/);
  assert.doesNotMatch(verifierSource, /deliveryManifestFormatCheckedArtifactTypes/);
  assert.match(verifierSource, /deliveryManifestSummarizeDiscordReport/);
  assert.match(helperSource, /function deliveryManifestValidateAcceptanceManifest/);
  assert.match(helperSource, /function deliveryManifestSummarizeDiscordReport/);
  assert.match(helperSource, /function deliveryManifestValidateDiscordReport/);
  assert.match(helperSource, /function deliveryManifestDiscordReportVerificationPayload/);
  assert.match(helperSource, /function deliveryManifestSummarizeDeliveryMessage/);
  assert.match(helperSource, /function deliveryManifestAttachmentSummary/);
  assert.match(helperSource, /function deliveryManifestSectionCheckedArtifactTypes/);
  assert.match(helperSource, /function deliveryManifestReportArtifactValidation/);
  assert.doesNotMatch(verifierSource, /function formatList/);
  assert.doesNotMatch(verifierSource, /function artifactDetail/);
  assert.doesNotMatch(verifierSource, /function classifyArtifacts/);
  assert.doesNotMatch(verifierSource, /function attachmentSummary/);
  assert.doesNotMatch(verifierSource, /function reportSummary/);
  assert.doesNotMatch(verifierSource, /function normalizeList/);
  assert.doesNotMatch(verifierSource, /function arraysEqual/);
  assert.doesNotMatch(verifierSource, /function jsonEqual/);
  assert.doesNotMatch(verifierSource, /function manifestVerificationError/);
  assert.doesNotMatch(verifierSource, /function normalizeFilePath/);
  assert.doesNotMatch(verifierSource, /function reportSection/);
  assert.doesNotMatch(verifierSource, /function sectionBullets/);
  assert.doesNotMatch(verifierSource, /function sectionKeyValues/);
  assert.doesNotMatch(verifierSource, /function sectionStatus/);
  assert.doesNotMatch(verifierSource, /function sectionVisualQa/);
  assert.doesNotMatch(verifierSource, /function sectionPptxInternalQa/);
  assert.doesNotMatch(verifierSource, /function sectionAcceptanceManifest/);
  assert.doesNotMatch(verifierSource, /function sectionPptxLine/);
  assert.doesNotMatch(verifierSource, /function sectionPptxHiddenTextLine/);
  assert.doesNotMatch(verifierSource, /function sectionDeliveryReadiness/);
  assert.doesNotMatch(verifierSource, /function sectionCheckedArtifactTypes/);
  assert.doesNotMatch(verifierSource, /function validateReportArtifactsAgainstManifest/);
  assert.doesNotMatch(verifierSource, /function validateReportArtifactIdentityAgainstManifest/);
  assert.doesNotMatch(verifierSource, /function validateDeliveryMessage/);
  assert.doesNotMatch(verifierSource, /function validateAcceptanceManifest/);
  assert.doesNotMatch(verifierSource, /function validateArtifact/);
  assert.doesNotMatch(verifierSource, /function readAcceptanceManifestArtifacts/);
  assert.doesNotMatch(verifierSource, /function summarizeAcceptanceManifestVerification/);
  assert.doesNotMatch(verifierSource, /function emit\(/);
  assert.doesNotMatch(verifierSource, /function seedDeliveryManifestIdentityCheck/);
  assert.doesNotMatch(verifierSource, /const validationResults = \[\]/);
  assert.doesNotMatch(verifierSource, /validationResults\.push\(/);
  assert.doesNotMatch(verifierSource, /deliveryManifestCollectDiscordReportValidations/);
  assert.doesNotMatch(verifierSource, /deliveryManifestApplyDiscordReportValidations/);
});

test('verify-discord-report does not keep stale delivery manifest imports', () => {
  const verifierSource = fs.readFileSync(script, 'utf8');
  assert.deepEqual(unusedNamedImports(verifierSource, './lib/delivery-manifest-utils.mjs'), []);
});

test('verify-discord-report fails when report artifact identity differs from manifest', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-artifact-identity-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .replace('- basename: deck', '- basename: other-deck');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /report artifact basename mismatch/);
});

test('verify-discord-report fails when report attachments do not belong to acceptance manifest artifacts', () => {
  const { reports } = generateVerifiedStudioReportPair('verify-discord-report-manifest-attachment-mismatch-test-', ['deck', 'other']);
  const reportPath = reports.deck.reportPath;
  const otherManifestPath = path.join(reports.other.out, 'other.acceptance.manifest.json');
  const report = fs.readFileSync(reportPath, 'utf8')
    .replace(/^- manifest: .+$/m, `- manifest: ${otherManifestPath}`);
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.acceptanceManifest.path, otherManifestPath);
  assert.match(output.errors.join('\n'), /report artifact is not covered by acceptance manifest/);
  assert.match(output.errors.join('\n'), /deck\.editable\.pptx/);
});

test('verify-discord-report fails when delivery message does not mention current attachments', () => {
  const { out, reportPath } = generateVerifiedStudioReport('verify-discord-report-stale-delivery-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const deliveryPath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(deliveryPath, [
    '納品準備OK: old deck',
    '添付ファイル:',
    '- old.editable.pptx (/tmp/old.editable.pptx)',
    '',
  ].join('\n'));

  const result = runVerifyDiscordReport([reportPath, '--delivery-message', deliveryPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /delivery message missing attachment path/);
  assert.equal(output.summary.deliveryMessage.attachmentsMatched, false);
});

test('verify-discord-report fails when delivery message is missing delivery readiness QA lines', () => {
  const { out, reportPath } = generateVerifiedStudioReport('verify-discord-report-delivery-readiness-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const deliveryPath = path.join(out, 'delivery-message.md');
  const reportCheck = runVerifyDiscordReport([reportPath]);
  assert.equal(reportCheck.status, 0, reportCheck.stdout + reportCheck.stderr);
  const summary = parseVerifyDiscordReport(reportCheck).summary;
  fs.writeFileSync(deliveryPath, [
    `納品準備OK: ${summary.title}`,
    `検証: ${summary.message}`,
    '',
    'QA:',
    `- visual QA: ${summary.visualQa.acceptance.line}`,
    `- ${summary.pptxInternalQa.acceptance.images.line}`,
    `- ${summary.pptxInternalQa.acceptance.specialElements.line}`,
    `- ${summary.pptxInternalQa.acceptance.hiddenText.line}`,
    '',
    '添付ファイル:',
    ...summary.attachments.postablePaths.map((filePath) => `- ${path.basename(filePath)} (${filePath})`),
    '',
  ].join('\n'));

  const result = runVerifyDiscordReport([reportPath, '--delivery-message', deliveryPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.deliveryMessage.qaMatched, false);
  assert.deepEqual(output.summary.deliveryMessage.missingQaLines, [
    'delivery readiness: ready',
    'reasons: none',
    `manifest: ${summary.acceptanceManifest.path}`,
    'manifest verification scope: manifest-only',
    'checked artifacts: 1',
    'checked artifact types: deck',
  ]);
  assert.match(output.errors.join('\n'), /delivery message missing QA line: delivery readiness: ready/);
  assert.match(output.errors.join('\n'), /delivery message missing QA line: reasons: none/);
  assert.match(output.errors.join('\n'), /delivery message missing QA line: manifest: /);
  assert.match(output.errors.join('\n'), /delivery message missing QA line: manifest verification scope: manifest-only/);
  assert.match(output.errors.join('\n'), /delivery message missing QA line: checked artifacts: 1/);
  assert.match(output.errors.join('\n'), /delivery message missing QA line: checked artifact types: deck/);
});

test('verify-discord-report fails when delivery message includes unknown QA lines', () => {
  const { generatedJson } = generateReadyWrapperReport('verify-discord-report-unknown-qa-line-test-');
  const deliveryMessage = fs.readFileSync(generatedJson.discordReady.deliveryMessagePath, 'utf8')
    .replace('QA:\n', 'QA:\n- unverified external claim: ready\n');
  fs.writeFileSync(generatedJson.discordReady.deliveryMessagePath, deliveryMessage);

  const result = runVerifyDiscordReadyPaths(generatedJson);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.deepEqual(output.summary.deliveryMessage.qaDiff.unexpectedLines, ['unverified external claim: ready']);
  assert.deepEqual(output.summary.deliveryMessage.qaDiff.allowedUnexpectedLines, [
    'identity checks: report ready / deliveryMessage ready',
  ]);
  assert.match(output.errors.join('\n'), /delivery message unexpected QA line: unverified external claim: ready/);
});

test('verify-discord-report fails when delivery message identity QA line is not exact', () => {
  const { generatedJson } = generateReadyWrapperReport('verify-discord-report-inexact-identity-qa-test-');
  const deliveryMessage = fs.readFileSync(generatedJson.discordReady.deliveryMessagePath, 'utf8')
    .replace(
      'identity checks: report ready / deliveryMessage ready',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest skipped',
    );
  fs.writeFileSync(generatedJson.discordReady.deliveryMessagePath, deliveryMessage);

  const result = runVerifyDiscordReadyPaths(generatedJson);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.deepEqual(output.summary.deliveryMessage.qaDiff.unexpectedLines, [
    'identity checks: report ready / deliveryMessage ready / deliveryManifest skipped',
  ]);
  assert.deepEqual(output.summary.deliveryMessage.qaDiff.allowedUnexpectedLines, []);
  assert.match(output.errors.join('\n'), /delivery message unexpected QA line: identity checks: report ready \/ deliveryMessage ready \/ deliveryManifest skipped/);
});

test('verify-discord-report fails when delivery message identity QA line is duplicated', () => {
  const { generatedJson } = generateReadyWrapperReport('verify-discord-report-duplicate-identity-qa-test-');
  const identityLine = 'identity checks: report ready / deliveryMessage ready';
  const deliveryMessage = fs.readFileSync(generatedJson.discordReady.deliveryMessagePath, 'utf8')
    .replace(identityLine, `${identityLine}\n- ${identityLine}`);
  fs.writeFileSync(generatedJson.discordReady.deliveryMessagePath, deliveryMessage);

  const result = runVerifyDiscordReadyPaths(generatedJson);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.deepEqual(output.summary.deliveryMessage.duplicateQaLines, [identityLine]);
  assert.match(output.errors.join('\n'), /delivery message duplicate QA line: identity checks: report ready \/ deliveryMessage ready/);
});

test('verify-discord-report fails when delivery message QA lines are duplicated or out of order', () => {
  const { out, reportPath, summary } = generateVerifiedStudioReportWithSummary('verify-discord-report-delivery-qa-order-test-');
  const deliveryPath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(deliveryPath, [
    `納品準備OK: ${summary.title}`,
    `検証: ${summary.message}`,
    '',
    'QA:',
    `- visual QA: ${summary.visualQa.acceptance.line}`,
    `- ${summary.pptxInternalQa.acceptance.images.line}`,
    '- delivery readiness: ready',
    '- reasons: none',
    '- reasons: none',
    `- manifest: ${summary.acceptanceManifest.path}`,
    `- ${summary.acceptanceManifest.scopeLine}`,
    '- checked artifacts: 1',
    `- ${summary.checkedArtifactTypes.line}`,
    `- ${summary.pptxInternalQa.acceptance.specialElements.line}`,
    `- ${summary.pptxInternalQa.acceptance.hiddenText.line}`,
    '',
    '添付ファイル:',
    ...summary.attachments.postablePaths.map((filePath) => `- ${path.basename(filePath)} (${filePath})`),
    '',
  ].join('\n'));

  const result = runVerifyDiscordReport([reportPath, '--delivery-message', deliveryPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.deliveryMessage.qaOrderMatched, false);
  assert.deepEqual(output.summary.deliveryMessage.qaDiff.firstMismatch, {
    index: 0,
    expected: 'delivery readiness: ready',
    actual: `visual QA: ${summary.visualQa.acceptance.line}`,
  });
  assert.deepEqual(output.summary.deliveryMessage.duplicateQaLines, ['reasons: none']);
  assert.match(output.errors.join('\n'), /delivery message QA lines are out of order/);
  assert.match(output.errors.join('\n'), /delivery message duplicate QA line: reasons: none/);
});

test('verify-discord-report fails when delivery message has QA lines without a QA section', () => {
  const { out, reportPath, summary } = generateVerifiedStudioReportWithSummary('verify-discord-report-delivery-qa-section-test-');
  const deliveryPath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(deliveryPath, [
    `納品準備OK: ${summary.title}`,
    `検証: ${summary.message}`,
    `- visual QA: ${summary.visualQa.acceptance.line}`,
    `- ${summary.pptxInternalQa.acceptance.images.line}`,
    `- ${summary.pptxInternalQa.acceptance.specialElements.line}`,
    '',
    '添付ファイル:',
    ...summary.attachments.postablePaths.map((filePath) => `- ${path.basename(filePath)} (${filePath})`),
    '',
  ].join('\n'));

  const result = runVerifyDiscordReport([reportPath, '--delivery-message', deliveryPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.deliveryMessage.qaSectionPresent, false);
  assert.match(output.errors.join('\n'), /delivery message missing QA section/);
});

test('verify-discord-report fails when delivery message has attachments without an attachment section', () => {
  const { out, reportPath, summary } = generateVerifiedStudioReportWithSummary('verify-discord-report-delivery-attachment-section-test-');
  const deliveryPath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(deliveryPath, [
    `納品準備OK: ${summary.title}`,
    `検証: ${summary.message}`,
    '',
    'QA:',
    `- visual QA: ${summary.visualQa.acceptance.line}`,
    `- ${summary.pptxInternalQa.acceptance.images.line}`,
    `- ${summary.pptxInternalQa.acceptance.specialElements.line}`,
    '',
    ...summary.attachments.postablePaths.map((filePath) => `- ${path.basename(filePath)} (${filePath})`),
    '',
  ].join('\n'));

  const result = runVerifyDiscordReport([reportPath, '--delivery-message', deliveryPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.deliveryMessage.attachmentSectionPresent, false);
  assert.equal(output.summary.deliveryMessage.auditSectionPresent, false);
  assert.match(output.errors.join('\n'), /delivery message missing attachment section/);
  assert.match(output.errors.join('\n'), /delivery message missing audit attachment section/);
});

test('verify-discord-report fails when audit attachments are listed as deliverables', () => {
  const { out, reportPath, summary } = generateVerifiedStudioReportWithSummary('verify-discord-report-delivery-audit-section-test-');
  const deliveryPath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(deliveryPath, [
    `納品準備OK: ${summary.title}`,
    `検証: ${summary.message}`,
    '',
    'QA:',
    `- ${summary.deliveryReadiness.line}`,
    `- ${summary.deliveryReadiness.reasonsLine}`,
    `- ${summary.acceptanceManifest.line}`,
    `- ${summary.acceptanceManifest.scopeLine}`,
    `- checked artifacts: ${summary.checkedArtifacts.count}`,
    `- ${summary.checkedArtifactTypes.line}`,
    `- visual QA: ${summary.visualQa.acceptance.line}`,
    `- ${summary.pptxInternalQa.acceptance.images.line}`,
    `- ${summary.pptxInternalQa.acceptance.specialElements.line}`,
    `- ${summary.pptxInternalQa.acceptance.hiddenText.line}`,
    '',
    '添付ファイル:',
    ...summary.attachments.postablePaths.map((filePath) => `- ${path.basename(filePath)} (${filePath})`),
    '',
    '監査ファイル:',
    '',
  ].join('\n'));

  const result = runVerifyDiscordReport([reportPath, '--delivery-message', deliveryPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /delivery message missing audit attachment path/);
});

test('verify-discord-report fails when delivery manifest classifies audit attachments as deliverables', () => {
  const { out, reportPath, summary } = generateVerifiedStudioReportWithSummary('verify-discord-report-delivery-manifest-audit-test-');
  const manifestPath = path.join(out, 'delivery-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: summary.title,
    readyHeader: `納品準備OK: ${summary.title}`,
    verificationHeader: `検証: ${summary.message}`,
    qaLines: [
      summary.deliveryReadiness.line,
      summary.deliveryReadiness.reasonsLine,
      summary.acceptanceManifest.line,
      summary.acceptanceManifest.scopeLine,
      `checked artifacts: ${summary.checkedArtifacts.count}`,
      summary.checkedArtifactTypes.line,
      `visual QA: ${summary.visualQa.acceptance.line}`,
      summary.pptxInternalQa.acceptance.images.line,
      summary.pptxInternalQa.acceptance.specialElements.line,
      summary.pptxInternalQa.acceptance.hiddenText.line,
    ],
    deliverablePaths: summary.attachments.postablePaths,
    auditPaths: [],
  }, null, 2));

  const result = runVerifyDiscordReport([reportPath, '--delivery-manifest', manifestPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /delivery manifest deliverablePaths mismatch/);
  assert.match(output.errors.join('\n'), /delivery manifest auditPaths mismatch/);
});

test('verify-discord-report fails when delivery manifest artifact identity differs from report', () => {
  const { out, reportPath, summary } = generateVerifiedStudioReportWithSummary('verify-discord-report-delivery-manifest-identity-test-');
  const manifestPath = path.join(out, 'delivery-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: summary.title,
    artifactName: summary.reportArtifactIdentity.name,
    artifactType: summary.reportArtifactIdentity.type,
    artifactDir: summary.reportArtifactIdentity.dir,
    basename: 'other-deck',
    readyHeader: `納品準備OK: ${summary.title}`,
    verificationHeader: `検証: ${summary.message}`,
    qaLines: [
      summary.deliveryReadiness.line,
      summary.deliveryReadiness.reasonsLine,
      summary.acceptanceManifest.line,
      summary.acceptanceManifest.scopeLine,
      `checked artifacts: ${summary.checkedArtifacts.count}`,
      summary.checkedArtifactTypes.line,
      `visual QA: ${summary.visualQa.acceptance.line}`,
      summary.pptxInternalQa.acceptance.images.line,
      summary.pptxInternalQa.acceptance.specialElements.line,
      summary.pptxInternalQa.acceptance.hiddenText.line,
    ],
    deliverablePaths: summary.attachments.deliverablePaths,
    auditPaths: summary.attachments.auditPaths,
  }, null, 2));

  const result = runVerifyDiscordReport([reportPath, '--delivery-manifest', manifestPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /delivery manifest basename mismatch/);
});

test('verify-discord-report fails when delivery message is missing summary headers', () => {
  const { out, reportPath, summary } = generateVerifiedStudioReportWithSummary('verify-discord-report-delivery-summary-headers-test-');
  const deliveryPath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(deliveryPath, [
    'QA:',
    `- visual QA: ${summary.visualQa.acceptance.line}`,
    `- ${summary.pptxInternalQa.acceptance.images.line}`,
    `- ${summary.pptxInternalQa.acceptance.specialElements.line}`,
    '',
    '添付ファイル:',
    ...summary.attachments.postablePaths.map((filePath) => `- ${path.basename(filePath)} (${filePath})`),
    '',
  ].join('\n'));

  const result = runVerifyDiscordReport([reportPath, '--delivery-message', deliveryPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.deliveryMessage.readyHeaderPresent, false);
  assert.equal(output.summary.deliveryMessage.verificationHeaderPresent, false);
  assert.match(output.errors.join('\n'), /delivery message missing ready header/);
  assert.match(output.errors.join('\n'), /delivery message missing verification header/);
});

test('verify-discord-report fails when visual QA is explicitly blocked', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-visual-blocked-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8').replace(
    /^- visual QA: .*$/m,
    '- visual QA: blocked / uniqueSampledColors: 1',
  );
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.postable, false);
  assert.equal(output.summary.visualQa.verification.status, 'blocked');
  assert.match(output.errors.join('\n'), /visual QA status is blocked/);
});

test('verify-discord-report fails when ready report is missing visual QA lines', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-visual-missing-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('- visual QA:'))
    .join('\n');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.postable, false);
  assert.equal(output.summary.visualQa.verification.status, 'missing');
  assert.match(output.errors.join('\n'), /visual QA status is missing/);
});

test('verify-discord-report fails when ready acceptance is missing PPTX internal QA lines', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-pptx-qa-missing-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .replace(/(納品前チェック:\n[\s\S]*?)- PPTX images: .*\n/g, '$1')
    .replace(/(納品前チェック:\n[\s\S]*?)- PPTX special elements: .*\n/g, '$1')
    .replace(/(納品前チェック:\n[\s\S]*?)- PPTX hidden text: .*\n/g, '$1');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.postable, false);
  assert.equal(output.summary.pptxInternalQa.acceptance.images.status, 'missing');
  assert.equal(output.summary.pptxInternalQa.acceptance.specialElements.status, 'missing');
  assert.equal(output.summary.pptxInternalQa.acceptance.hiddenText.status, 'missing');
  assert.match(output.errors.join('\n'), /acceptance PPTX images status is missing/);
  assert.match(output.errors.join('\n'), /acceptance PPTX special elements status is missing/);
  assert.match(output.errors.join('\n'), /acceptance PPTX hidden text status is missing/);
});

test('verify-discord-report fails when ready report has nonzero PPTX hidden text', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-hidden-text-nonzero-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .replace(/PPTX hidden text: 0/g, 'PPTX hidden text: 2');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.pptxInternalQa.acceptance.hiddenText.count, 2);
  assert.match(output.errors.join('\n'), /acceptance PPTX hidden text count is nonzero: 2/);
});

test('verify-discord-report fails when ready report has nonzero PPTX images or special elements', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-pptx-nonzero-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .replace(/PPTX images: 0 \(none\)/g, 'PPTX images: 1 (picture:1)')
    .replace(/PPTX special elements: 0 \(none\)/g, 'PPTX special elements: 1 (chart:1)');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.pptxInternalQa.acceptance.images.count, 1);
  assert.equal(output.summary.pptxInternalQa.acceptance.specialElements.count, 1);
  assert.match(output.errors.join('\n'), /acceptance PPTX images count is nonzero: 1/);
  assert.match(output.errors.join('\n'), /acceptance PPTX special elements count is nonzero: 1/);
});

test('verify-discord-report fails when ready acceptance is missing delivery readiness lines', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-readiness-missing-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('- delivery readiness:') && !line.startsWith('- reasons:'))
    .join('\n');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.postable, false);
  assert.equal(output.summary.deliveryReadiness.status, 'missing');
  assert.match(output.errors.join('\n'), /acceptance delivery readiness status is missing/);
});

test('verify-discord-report fails when ready acceptance is missing checked artifact type lines', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-artifact-types-missing-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('- checked artifact types:'))
    .join('\n');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.postable, false);
  assert.equal(output.summary.checkedArtifactTypes.status, 'missing');
  assert.match(output.errors.join('\n'), /acceptance checked artifact types are missing/);
});

test('verify-discord-report fails when ready acceptance is missing checked artifact count', () => {
  const { reportPath } = generateVerifiedStudioReport('verify-discord-report-artifact-count-missing-test-', {
    inputPath: null,
    writeDefaultOutline: true,
  });
  const report = fs.readFileSync(reportPath, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('- checked artifacts:'))
    .join('\n');
  fs.writeFileSync(reportPath, report);

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.equal(output.summary.checkedArtifacts, null);
  assert.match(output.errors.join('\n'), /acceptance checked artifacts count is missing/);
});

test('verify-discord-report blocks reports generated without --verify', () => {
  const { reportPath } = generateUnverifiedStudioReport('verify-discord-report-blocked-test-');

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.deepEqual(output.sections, { verification: 'blocked', acceptance: 'blocked' });
  assert.equal(output.summary.postable, false);
  assert.match(output.summary.message, /投稿不可: verification status is blocked/);
  assert.match(output.errors.join('\n'), /verification status is blocked/);
  assert.match(output.errors.join('\n'), /acceptance status is blocked/);
});

test('verify-discord-report fails when status fields are missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-discord-report-missing-test-'));
  const reportPath = path.join(dir, 'discord-report.md');
  fs.writeFileSync(reportPath, [
    '検証結果:',
    '- ok: true',
    '',
    '納品前チェック:',
    '- ok: true',
    '',
  ].join('\n'));

  const result = runVerifyDiscordReport([reportPath]);
  assert.notEqual(result.status, 0);
  const output = parseVerifyDiscordReport(result);
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /検証結果 section is missing status/);
  assert.match(output.errors.join('\n'), /納品前チェック section is missing status/);
});
