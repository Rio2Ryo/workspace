import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slideToolOut } from './test-paths.mjs';
import { createDeliveryManifestDeckFixture } from './delivery-manifest-fixtures.mjs';
import {
  assertRootOnlyDiscordReportSummaryBundle,
  createCanonicalDiscordReportSummaryBundle,
} from './summary-contract-utils.mjs';

import {
  deliveryManifestArtifactDetail,
  deliveryManifestDeliverableArtifactLines,
  deliveryManifestDiscordReportContext,
  deliveryManifestDiscordReportLines,
  deliveryManifestDiscordReportAcceptanceGateErrors,
  deliveryManifestDiscordReportAuditMessages,
  deliveryManifestDiscordReportAcceptanceValidation,
  deliveryManifestDiscordReportAcceptanceValidationContext,
  deliveryManifestDiscordReportAttachmentValidation,
  deliveryManifestDiscordReportBaseValidation,
  deliveryManifestDiscordReportBaseValidationContext,
  deliveryManifestDiscordReportMediaQaErrors,
  deliveryManifestDiscordReportSectionStatusErrors,
  deliveryManifestDiscordReportValidationSummary,
  deliveryManifestDiscordReportValidationContext,
  deliveryManifestDiscordReportVerificationPayload,
  deliveryManifestDiscordReportVerificationPayloadContext,
  deliveryManifestArtifactsVerificationPayload,
  deliveryManifestArtifactsVerificationPayloadContext,
  deliveryManifestDeckVerificationPayload,
  deliveryManifestDeckVerificationPayloadContext,
  deliveryManifestOnepagerVerificationPayload,
  deliveryManifestOnepagerVerificationPayloadContext,
  deliveryManifestReportIdentityChecks,
  deliveryManifestPolicySuggestionMarkdown,
  deliveryManifestPolicySuggestionMarkdownLines,
  deliveryManifestPolicySuggestionOutput,
  deliveryManifestPolicySuggestionOutputContext,
  deliveryManifestPolicySuggestionText,
  deliveryManifestFollowUpPromptLinesContext,
  deliveryManifestUsageCommandLinesContext,
  deliveryManifestWriteDiscordReport,
  deliveryManifestStudioOutputSummary,
  deliveryManifestStudioErrorSummary,
  deliveryManifestStudioErrorMessages,
  deliveryManifestStudioCaughtErrorSummary,
  deliveryManifestArtifactSectionLines,
  deliveryManifestArtifactIdentityCheck,
  deliveryManifestAcceptanceChecklistLines,
  deliveryManifestAcceptanceChecklistLinesContext,
  deliveryManifestAcceptanceChecklistQaLines,
  deliveryManifestAcceptanceChecklistQaLinesContext,
  deliveryManifestAcceptanceChecklistQaSummary,
  deliveryManifestAcceptanceChecklistQaSummaryContext,
  deliveryManifestAcceptanceArtifactValidationSummary,
  deliveryManifestApplyDiscordReportAcceptanceManifest,
  deliveryManifestAcceptanceManifestReadErrors,
  deliveryManifestAcceptanceVerificationReportErrors,
  deliveryManifestAttachmentPathSummary,
  deliveryManifestAttachmentDetail,
  deliveryManifestAttachmentSummary,
  deliveryManifestDeliveryMessageAttachmentErrors,
  deliveryManifestAuditFileSetErrors,
  deliveryManifestAuditValidationErrors,
  deliveryManifestDeliveryMessageAttachmentSummary,
  deliveryManifestDeliveryMessageArtifactIdentityErrors,
  deliveryManifestDeliveryMessageArtifactIdentitySummary,
  deliveryManifestDeliveryMessagePayload,
  deliveryManifestDeliveryMessageReportErrors,
  deliveryManifestDeliveryMessageQaErrors,
  deliveryManifestDeliveryMessageReportSummary,
  deliveryManifestDeliveryMessageReadErrors,
  deliveryManifestDeliveryMessageStatusQaSummary,
  deliveryManifestDeliveryMessageValidationContext,
  deliveryManifestDeliveryMessageValidationSummary,
  deliveryManifestArrayItemLabel,
  deliveryManifestClassifyArtifacts,
  deliveryManifestExpectedDeliveryMessageArtifact,
  deliveryManifestArraysEqual,
  deliveryManifestExpectedAuditFiles,
  deliveryManifestExpectedArtifactPaths,
  deliveryManifestExpectedAuditPaths,
  deliveryManifestExpectedDeliverablePaths,
  deliveryManifestExpectedDeliveryMessageQa,
  deliveryManifestExpectedIdentityQaLine,
  deliveryManifestExpectedIdentityQaLineContext,
  deliveryManifestExpectedManifestQa,
  deliveryManifestFinalManifestReadErrors,
  deliveryManifestExpectedManifestReportErrors,
  deliveryManifestExpectedManifestReportSummary,
  deliveryManifestFinalManifestValidationContext,
  deliveryManifestFinalManifestValidationSummary,
  deliveryManifestFormatBreakdown,
  deliveryManifestFormatBreakdownContext,
  deliveryManifestFormatBreakdownLine,
  deliveryManifestFormatBreakdownLineContext,
  deliveryManifestFormatCheckedArtifactTypes,
  deliveryManifestFormatCheckedArtifactTypesContext,
  deliveryManifestFormatCheckedArtifactTypesLine,
  deliveryManifestFormatCheckedArtifactTypesLineContext,
  deliveryManifestFormatCheckedArtifactsLine,
  deliveryManifestFormatCheckedArtifactsLineContext,
  deliveryManifestFormatDeliveryReasons,
  deliveryManifestFormatDeliveryReasonsContext,
  deliveryManifestFormatDeliveryReadinessLine,
  deliveryManifestFormatDeliveryReadinessLineContext,
  deliveryManifestFormatDeliveryReasonsLine,
  deliveryManifestFormatDeliveryReasonsLineContext,
  deliveryManifestFormatVisualQaLine,
  deliveryManifestFormatVisualQaLineContext,
  deliveryManifestFormatVisualQaContext,
  deliveryManifestFormatVisualQa,
  deliveryManifestFormatIdentityChecks,
  deliveryManifestFormatIdentityChecksContext,
  deliveryManifestFormatIdentityChecksLine,
  deliveryManifestFormatIdentityChecksLineContext,
  deliveryManifestFollowUpPromptLines,
  deliveryManifestVerificationResultLinesContext,
  deliveryManifestVerificationResultLines,
  deliveryManifestVerificationResultContext,
  deliveryManifestVerificationQaContext,
  deliveryManifestVerificationQaLines,
  deliveryManifestVerificationQaLinesContext,
  deliveryManifestUsageCommandLines,
  deliveryManifestHasIdentityQaLine,
  deliveryManifestIdentityFromArtifact,
  deliveryManifestIdentityChecksValidationErrors,
  deliveryManifestIdentityQaPolicies,
  deliveryManifestJsonEqual,
  deliveryManifestNormalizeFilePath,
  deliveryManifestNormalizeList,
  deliveryManifestQaLineDiff,
  deliveryManifestQaLines,
  deliveryManifestQaLinesContext,
  deliveryManifestReportSection,
  deliveryManifestResolveReportPath,
  deliveryManifestReadAcceptanceManifestArtifacts,
  deliveryManifestSummarizeDiscordReportVisualQa,
  deliveryManifestSummarizeAcceptanceManifest,
  deliveryManifestReportArtifactValidation,
  deliveryManifestSummarizeAcceptanceManifestVerification,
  deliveryManifestSummarizeDiscordReport,
  deliveryManifestSummarizeDiscordReportContext,
  deliveryManifestFinalizeDiscordReport,
  deliveryManifestFinalizeDiscordReportContext,
  deliveryManifestSummarizeDeliveryReadinessContext,
  deliveryManifestApplyDiscordReportValidation,
  deliveryManifestApplyDiscordReportValidationContext,
  deliveryManifestApplyDiscordReportValidations,
  deliveryManifestApplyDiscordReportValidationsContext,
  deliveryManifestBuildDiscordReportValidation,
  deliveryManifestBuildDeliveryMessage,
  deliveryManifestBuildFinalManifest,
  deliveryManifestCollectDiscordReportValidations,
  deliveryManifestCollectDiscordReportValidationsContext,
  deliveryManifestValidateDiscordReportValidations,
  deliveryManifestValidateDiscordReportValidationsContext,
  deliveryManifestValidateDiscordReportValidationsInOrder,
  deliveryManifestMergeDiscordReportValidation,
  deliveryManifestMergeDiscordReportValidationContext,
  deliveryManifestMergeIdentityCheck,
  deliveryManifestMergeIdentityCheckContext,
  deliveryManifestSummarizeDeliveryMessage,
  deliveryManifestValidateAcceptanceManifest,
  deliveryManifestValidateDiscordReport,
  deliveryManifestValidateDiscordReportContext,
  deliveryManifestRegisterAuditFiles,
  deliveryManifestMissingReferencedPaths,
  deliveryManifestSectionAcceptanceManifest,
  deliveryManifestSectionBullets,
  deliveryManifestSectionCheckedArtifactTypes,
  deliveryManifestSectionDeliveryReadiness,
  deliveryManifestSectionKeyValues,
  deliveryManifestSectionStatus,
  deliveryManifestSectionPptxInternalQa,
  deliveryManifestSectionVisualQa,
  deliveryManifestStringArrayValidationErrors,
  deliveryManifestSummarizeDeliveryReadiness,
  deliveryManifestSummarizeVisualQa,
  deliveryManifestSummarizeIdentityChecks,
  deliveryManifestSummarizeIdentityChecksContext,
  deliveryManifestValidateArtifact,
  deliveryManifestVerificationError,
  duplicateDeliveryManifestArrayValues,
} from '../scripts/lib/delivery-manifest-utils.mjs';

test('delivery manifest utilities report duplicate string values by field', () => {
  const manifest = {
    qaLines: ['delivery readiness: ready', 'identity checks: ready', 'identity checks: ready'],
    deliverablePaths: ['/tmp/deck.pptx', '/tmp/deck.html', '/tmp/deck.pptx'],
    auditPaths: ['/tmp/manifest.json', '/tmp/manifest.json'],
  };

  assert.equal(deliveryManifestArrayItemLabel('qaLines'), 'QA line');
  assert.equal(deliveryManifestArrayItemLabel('deliverablePaths'), 'deliverable path');
  assert.equal(deliveryManifestArrayItemLabel('auditPaths'), 'audit path');
  assert.deepEqual(duplicateDeliveryManifestArrayValues(manifest, 'qaLines'), ['identity checks: ready']);
  assert.deepEqual(duplicateDeliveryManifestArrayValues(manifest, 'deliverablePaths'), ['/tmp/deck.pptx']);
  assert.deepEqual(duplicateDeliveryManifestArrayValues(manifest, 'auditPaths'), ['/tmp/manifest.json']);
});

test('delivery manifest utilities can scope duplicate QA checks to auditable expected lines', () => {
  const manifest = {
    qaLines: [
      'unknown: extra',
      'unknown: extra',
      'delivery readiness: ready',
      'delivery readiness: ready',
    ],
  };

  assert.deepEqual(
    duplicateDeliveryManifestArrayValues(manifest, 'qaLines', { allowedValues: ['delivery readiness: ready'] }),
    ['delivery readiness: ready'],
  );
});

test('delivery manifest utilities validate string array fields with caller labels', () => {
  const manifest = {
    qaLines: 'not-array',
    deliverablePaths: ['deck.pptx', ''],
    auditPaths: ['manifest.json', 42],
  };

  assert.deepEqual(deliveryManifestStringArrayValidationErrors(manifest, {
    label: 'delivery manifest',
    suffix: ': delivery-manifest.json',
  }), [
    'delivery manifest qaLines must be an array: delivery-manifest.json',
    'delivery manifest deliverablePaths must contain only non-empty strings: delivery-manifest.json',
    'delivery manifest auditPaths must contain only non-empty strings: delivery-manifest.json',
  ]);
});

test('delivery manifest utilities validate audit manifest content without verifier CLI', () => {
  const artifact = {
    name: 'deck',
    type: 'deck',
    dir: path.join(path.sep, 'tmp', 'deck'),
    basename: 'deck',
  };
  const manifest = {
    schemaVersion: 2,
    title: '',
    artifactName: 'other',
    artifactType: 'onepager',
    artifactDir: path.join(path.sep, 'tmp', 'other'),
    basename: 'other',
    readyHeader: '',
    verificationHeader: '',
    qaLines: ['ready', 'ready'],
    deliverablePaths: ['missing.pptx', 'missing.pptx'],
    auditPaths: ['missing.json', 'missing.json'],
    identityChecks: { report: { matched: 'yes', mismatches: 'none' } },
    warnings: [''],
  };

  const errors = deliveryManifestAuditValidationErrors(manifest, artifact, {
    auditFile: 'delivery-manifest.json',
    missingDeliverablePaths: ['missing.pptx'],
    missingAuditPaths: ['missing.json'],
  });

  const joined = errors.join('\n');
  assert.match(joined, /schemaVersion must be 1/);
  assert.match(joined, /title must be a non-empty string/);
  assert.match(joined, /artifactName mismatch: expected deck \/ actual other/);
  assert.match(joined, /artifactType mismatch: expected deck \/ actual onepager/);
  assert.match(joined, /artifactDir mismatch/);
  assert.match(joined, /basename mismatch: expected deck \/ actual other/);
  assert.match(joined, /duplicate QA line: ready/);
  assert.match(joined, /duplicate deliverable path: missing\.pptx/);
  assert.match(joined, /duplicate audit path: missing\.json/);
  assert.match(joined, /identityChecks\.report\.matched must be a boolean/);
  assert.match(joined, /deliverable file is missing or empty: missing\.pptx/);
  assert.match(joined, /audit file is missing or empty: missing\.json/);
  assert.match(joined, /warnings must be an array of non-empty strings/);
});

test('delivery manifest utilities summarize discord report audit command failures', () => {
  assert.deepEqual(deliveryManifestDiscordReportAuditMessages({
    status: 1,
    stdout: JSON.stringify({ errors: ['missing visual QA', 'missing delivery readiness'] }),
    stderr: 'stack trace',
  }), ['missing visual QA', 'missing delivery readiness', 'stack trace']);

  assert.deepEqual(deliveryManifestDiscordReportAuditMessages({
    status: 2,
    stdout: 'not-json',
    stderr: '',
  }), ['exit 2']);
});

test('delivery manifest utilities validate registered audit file sets without verifier CLI', () => {
  const artifact = {
    name: 'deck',
    type: 'deck',
    dir: path.join(path.sep, 'tmp', 'deck'),
    basename: 'deck',
    auditFiles: [
      path.join(path.sep, 'tmp', 'deck', 'discord-report.md'),
      path.join(path.sep, 'tmp', 'deck', 'delivery-manifest.json'),
    ],
  };

  assert.deepEqual(deliveryManifestAuditFileSetErrors(artifact), [
    `artifact policy failed: deck auditFiles mismatch: expected ${path.join(path.sep, 'tmp', 'deck', 'delivery-manifest.json')}, ${path.join(path.sep, 'tmp', 'deck', 'delivery-message.md')}, ${path.join(path.sep, 'tmp', 'deck', 'discord-report.md')} / actual ${path.join(path.sep, 'tmp', 'deck', 'delivery-manifest.json')}, ${path.join(path.sep, 'tmp', 'deck', 'discord-report.md')}`,
  ]);

  assert.deepEqual(deliveryManifestAuditFileSetErrors({
    ...artifact,
    auditFiles: [
      path.join(path.sep, 'tmp', 'deck', 'delivery-message.md'),
      path.join(path.sep, 'tmp', 'deck', 'discord-report.md'),
      path.join(path.sep, 'tmp', 'deck', 'delivery-manifest.json'),
    ],
  }), []);
});

test('delivery manifest utilities select missing referenced paths with injected existence checks', () => {
  const manifest = {
    deliverablePaths: ['ready.pptx', 'missing.html', '', 42, 'missing.outline.json'],
    auditPaths: ['ready.audit.json', 'missing.audit.json'],
  };
  const exists = (filePath) => filePath.startsWith('ready.');

  assert.deepEqual(deliveryManifestMissingReferencedPaths(manifest, 'deliverablePaths', exists), [
    'missing.html',
    'missing.outline.json',
  ]);
  assert.deepEqual(deliveryManifestMissingReferencedPaths(manifest, 'auditPaths', exists), [
    'missing.audit.json',
  ]);
  assert.deepEqual(deliveryManifestMissingReferencedPaths({ deliverablePaths: 'not-array' }, 'deliverablePaths', exists), []);
});

test('delivery manifest utilities validate identityChecks schema with caller labels', () => {
  const identityChecks = {
    report: { matched: 'yes', mismatches: 'none' },
    deliveryMessage: ['not-object'],
    unknown: { matched: true, mismatches: [] },
  };

  assert.deepEqual(deliveryManifestIdentityChecksValidationErrors(identityChecks, {
    label: 'delivery manifest',
    suffix: ': delivery-manifest.json',
  }), [
    'delivery manifest identityChecks.unknown is not supported: delivery-manifest.json',
    'delivery manifest identityChecks.report.matched must be a boolean: delivery-manifest.json',
    'delivery manifest identityChecks.report.mismatches must be an array: delivery-manifest.json',
    'delivery manifest identityChecks.deliveryMessage must be an object: delivery-manifest.json',
  ]);
});

test('delivery manifest utilities generate expected deck paths from artifact identity', () => {
  const artifact = { type: 'deck', dir: '/tmp/slides/out', basename: 'sample' };

  assert.deepEqual(deliveryManifestExpectedDeliverablePaths(artifact), [
    '/tmp/slides/out/sample.editable.pptx',
    '/tmp/slides/out/sample.preview.html',
    '/tmp/slides/out/sample.outline.json',
    '/tmp/slides/out/sample.image-prompts.md',
  ]);
  assert.deepEqual(deliveryManifestExpectedAuditPaths(artifact), [
    '/tmp/slides/out/sample.acceptance.manifest.json',
  ]);
  assert.deepEqual(deliveryManifestExpectedAuditFiles(artifact), [
    '/tmp/slides/out/delivery-manifest.json',
    '/tmp/slides/out/discord-report.md',
    '/tmp/slides/out/delivery-message.md',
  ]);
});

test('delivery manifest utilities generate expected artifact paths from manifest artifacts', () => {
  assert.deepEqual(deliveryManifestExpectedArtifactPaths([
    { type: 'deck', dir: '/tmp/slides/deck', basename: 'sample' },
    { type: 'onepager', dir: '/tmp/slides/onepager', basename: 'brief' },
    { type: 'unknown', dir: '/tmp/slides/unknown', basename: 'skip' },
  ]), [
    '/tmp/slides/deck/sample.editable.pptx',
    '/tmp/slides/deck/sample.preview.html',
    '/tmp/slides/deck/sample.outline.json',
    '/tmp/slides/deck/sample.image-prompts.md',
    '/tmp/slides/onepager/brief.html',
    '/tmp/slides/onepager/brief.svg',
  ]);
});

test('delivery manifest utilities build artifact identity section lines with fallbacks', () => {
  assert.deepEqual(deliveryManifestArtifactSectionLines({
    name: 'sample deck',
    type: 'deck',
    dir: '/tmp/out',
    basename: 'sample',
  }, '/tmp/fallback', 'fallback'), [
    'Artifact:',
    '- name: sample deck',
    '- type: deck',
    '- dir: /tmp/out',
    '- basename: sample',
  ]);

  assert.deepEqual(deliveryManifestArtifactSectionLines(null, '/tmp/fallback', 'fallback'), [
    'Artifact:',
    '- name: ',
    '- type: ',
    '- dir: /tmp/fallback',
    '- basename: fallback',
  ]);
});

test('delivery manifest utilities build deliverable artifact lines with markdown prompts', () => {
  assert.deepEqual(deliveryManifestDeliverableArtifactLines({
    htmlPath: '/tmp/out/deck.preview.html',
    pptxPath: '/tmp/out/deck.editable.pptx',
    outlinePath: '/tmp/out/deck.outline.json',
    promptsPath: '/tmp/out/deck.image-prompts.json',
  }), [
    '作成物:',
    '- `/tmp/out/deck.preview.html`',
    '- `/tmp/out/deck.editable.pptx`',
    '- `/tmp/out/deck.outline.json`',
    '- `/tmp/out/deck.image-prompts.md`',
  ]);
});

test('delivery manifest utilities build studio output summaries with normalized paths', () => {
  const visualQa = { ok: true };
  const deliveryReadiness = { ok: true, reasons: [] };
  const identityChecks = { report: { matched: true } };
  const verification = { ok: true };
  const acceptance = { ok: true };
  const summary = deliveryManifestStudioOutputSummary({
    inputPath: '/tmp/input.md',
    outlinePath: '/tmp/out/deck.outline.json',
    htmlPath: '/tmp/out/deck.preview.html',
    pptxPath: '/tmp/out/deck.editable.pptx',
    promptsPath: '/tmp/out/deck.image-prompts.json',
    promptsMarkdownPath: '/tmp/out/deck.image-prompts.md',
    screenshotPath: '/tmp/out/deck.preview.png',
    screenshot: { ok: true },
    visualQa,
    deliveryReadiness,
    identityChecks,
    discordReport: '/tmp/out/discord-report.md',
    slides: 7,
    verification,
    acceptance,
  });
  assert.deepEqual(summary, {
    input: '/tmp/input.md',
    outline: '/tmp/out/deck.outline.json',
    html: '/tmp/out/deck.preview.html',
    pptx: '/tmp/out/deck.editable.pptx',
    imagePrompts: '/tmp/out/deck.image-prompts.json',
    imagePromptsMarkdown: '/tmp/out/deck.image-prompts.md',
    screenshot: '/tmp/out/deck.preview.png',
    visualQa: { ok: true },
    deliveryReadiness: { ok: true, reasons: [] },
    identityChecks: { report: { matched: true } },
    discordReport: '/tmp/out/discord-report.md',
    slides: 7,
    verification: { ok: true },
    acceptance: { ok: true },
  });
  visualQa.ok = false;
  deliveryReadiness.reasons.push('mutated');
  identityChecks.report.matched = false;
  verification.ok = false;
  acceptance.ok = false;
  assert.equal(summary.visualQa.ok, true);
  assert.deepEqual(summary.deliveryReadiness.reasons, []);
  assert.equal(summary.identityChecks.report.matched, true);
  assert.equal(summary.verification.ok, true);
  assert.equal(summary.acceptance.ok, true);

  assert.equal(deliveryManifestStudioOutputSummary({
    inputPath: '/tmp/input.md',
    outlinePath: '/tmp/out/deck.outline.json',
    htmlPath: '/tmp/out/deck.preview.html',
    pptxPath: '/tmp/out/deck.editable.pptx',
    promptsPath: '/tmp/out/deck.image-prompts.json',
    promptsMarkdownPath: '/tmp/out/deck.image-prompts.md',
    screenshotPath: '/tmp/out/deck.preview.png',
    screenshot: { ok: false },
    slides: 0,
  }).screenshot, null);
});

test('delivery manifest utilities build discord report contexts with derived QA lines', () => {
  const context = deliveryManifestDiscordReportContext({
    inputPath: '/tmp/input.md',
    outDir: '/tmp/out',
    name: 'deck',
    outline: { title: 'Deck Title' },
    htmlPath: '/tmp/out/deck.preview.html',
    pptxPath: '/tmp/out/deck.editable.pptx',
    outlinePath: '/tmp/out/deck.outline.json',
    promptsPath: '/tmp/out/deck.image-prompts.json',
    screenshotPath: '/tmp/out/deck.preview.png',
    screenshot: { ok: true, source: 'screenshot', width: 1280, height: 720, uniqueSampledColors: 42 },
    verification: {
      ok: true,
      screenshot: {
        width: 1280,
        height: 720,
        bytes: 12345,
        uniqueSampledColors: 42,
      },
      imageCount: 0,
      imageBreakdown: {},
      specialElementCount: 0,
      specialElementBreakdown: {},
      hiddenTextCount: 0,
    },
    acceptance: { artifact: { name: 'deck', type: 'deck', dir: '/tmp/out', basename: 'deck' } },
    deliveryReadiness: { ok: true, reasons: [] },
    identityChecks: { report: { matched: true } },
  });

  assert.equal(context.reportPath, '/tmp/out/discord-report.md');
  assert.equal(context.visualQa.status, 'ready');
  assert.equal(context.visualQa.source, 'screenshot');
  assert.deepEqual(context.verificationQaLines, [
    'PPTX images: 0 (none)',
    'PPTX special elements: 0 (none)',
    'PPTX hidden text: 0',
    'visual QA: ready / source: screenshot / 1280x720 / uniqueSampledColors: 42',
  ]);
  assert.equal(context.outline.title, 'Deck Title');
});

test('delivery manifest utilities build report identity checks from acceptance artifacts', () => {
  assert.equal(deliveryManifestReportIdentityChecks(null, '/tmp/out', 'deck'), null);
  assert.equal(deliveryManifestReportIdentityChecks({}, '/tmp/out', 'deck'), null);

  const exact = deliveryManifestReportIdentityChecks({
    artifact: {
      name: 'Deck Name',
      type: 'deck',
      dir: '/tmp/out',
      basename: 'deck',
    },
  }, '/tmp/other', 'other');
  assert.equal(exact.report.matched, true);
  assert.deepEqual(exact.report.mismatches, []);
  assert.deepEqual(exact.report.expected, exact.report.actual);

  const fallback = deliveryManifestReportIdentityChecks({
    artifact: {
      name: 'Deck Name',
      type: 'deck',
      dir: '/tmp/out',
    },
  }, '/tmp/out', 'deck');
  assert.equal(fallback.report.matched, false);
  assert.deepEqual(fallback.report.mismatches, [
    { field: 'basename', expected: null, actual: 'deck' },
  ]);
  assert.equal(fallback.report.actual.basename, 'deck');
});

test('delivery manifest utilities build discord report lines from shared context', () => {
  const context = deliveryManifestDiscordReportContext({
    inputPath: '/tmp/input.md',
    outDir: '/tmp/out',
    name: 'deck',
    outline: { title: 'Deck Title' },
    htmlPath: '/tmp/out/deck.preview.html',
    pptxPath: '/tmp/out/deck.editable.pptx',
    outlinePath: '/tmp/out/deck.outline.json',
    promptsPath: '/tmp/out/deck.image-prompts.json',
    screenshotPath: '/tmp/out/deck.preview.png',
    screenshot: { ok: true, source: 'screenshot' },
    verification: {
      ok: true,
      outlineSlides: 3,
      htmlSlides: 3,
      pptxSlides: 3,
      promptCount: 3,
      notesCount: 3,
      screenshot: {
        width: 1280,
        height: 720,
        bytes: 12345,
        uniqueSampledColors: 42,
      },
      imageCount: 0,
      imageBreakdown: {},
      specialElementCount: 0,
      specialElementBreakdown: {},
      hiddenTextCount: 0,
    },
    acceptance: {
      ok: true,
      artifact: { name: 'deck', type: 'deck', dir: '/tmp/out', basename: 'deck' },
      manifestUpdate: { path: '/tmp/out/deck.acceptance.manifest.json', action: 'updated' },
      manifestVerification: { ok: true, scope: 'manifest-only', result: { checked: 1, checkedArtifactTypes: ['deck'] } },
    },
    deliveryReadiness: { ok: true, reasons: [] },
    identityChecks: { report: { matched: true, mismatches: [] } },
  });

  const lines = deliveryManifestDiscordReportLines(context, {
    workspaceRoot: '/workspace',
    rootDir: '/workspace/slide-tool',
  });

  assert.equal(lines[0], '作成物:');
  assert.ok(lines.includes('Artifact:'));
  assert.ok(lines.includes('検証結果:'));
  assert.ok(lines.includes('納品前チェック:'));
  assert.ok(lines.includes('使い方:'));
  assert.ok(lines.includes('次に試す依頼例:'));
  assert.ok(lines.includes('この資料「Deck Title」を、相手と目的に合わせてトーン調整して。HTML previewとeditable PPTXを再生成し、検証レポートも付けて。'));
  assert.deepEqual(lines.slice(-1), ['']);
});

test('delivery manifest utilities build verify-discord-report JSON payloads', () => {
  const summary = {
    title: 'Deck Title',
    postable: true,
    nested: { value: 1 },
  };
  const payload = deliveryManifestDiscordReportVerificationPayload({
    ok: true,
    reportPath: '/tmp/out/discord-report.md',
    sections: { verification: 'ready', acceptance: 'ready' },
    summary,
    errors: [],
    warnings: ['optional prompts missing'],
  });

  assert.deepEqual(payload, {
    ok: true,
    report: '/tmp/out/discord-report.md',
    sections: { verification: 'ready', acceptance: 'ready' },
    summary,
    errors: [],
    warnings: ['optional prompts missing'],
  });
  payload.summary.nested.value = 2;
  assert.equal(summary.nested.value, 1);

  assert.deepEqual(deliveryManifestDiscordReportVerificationPayload({
    ok: false,
    reportPath: null,
    sections: null,
    errors: ['usage'],
  }), {
    ok: false,
    report: null,
    sections: null,
    summary: null,
    errors: ['usage'],
    warnings: [],
  });
});

test('delivery manifest utilities centralize discord report verification payload context', () => {
  const summary = {
    title: 'Deck Title',
    postable: true,
    nested: { value: 1 },
  };
  const context = deliveryManifestDiscordReportVerificationPayloadContext({
    ok: true,
    reportPath: '/tmp/out/discord-report.md',
    sections: { verification: 'ready', acceptance: 'ready' },
    summary,
    errors: [],
    warnings: ['optional prompts missing'],
  });
  const wrapped = deliveryManifestDiscordReportVerificationPayload({
    ok: true,
    reportPath: '/tmp/out/discord-report.md',
    sections: { verification: 'ready', acceptance: 'ready' },
    summary,
    errors: [],
    warnings: ['optional prompts missing'],
  });

  assert.deepEqual(context, wrapped);
  context.summary.nested.value = 2;
  assert.equal(summary.nested.value, 1);
});

test('delivery manifest utilities build manifest policy suggestion output and markdown', () => {
  const artifact = {
    name: 'deck deck',
    type: 'deck',
    dir: '/tmp/out/deck',
    basename: 'deck',
    minSlides: 2,
    maxSlides: 2,
    requiredSlideTitles: ['Cover', 'Chart'],
    maxPptxImages: 1,
    allowedPptxImageSlides: [1],
    maxPptxSpecialElements: 1,
    allowedPptxSpecialElementSlides: [2],
    allowedPptxSpecialElementTypes: ['chart'],
  };
  const output = deliveryManifestPolicySuggestionOutput({
    artifact,
    manifestUpdate: { action: 'added', path: '/tmp/manifest.json', index: 0 },
    manifestVerification: { ok: true },
    diagnostics: { imageSlides: [1] },
    warnings: ['template image policy warning'],
  });
  const context = deliveryManifestPolicySuggestionOutputContext({
    artifact,
    manifestUpdate: { action: 'added', path: '/tmp/manifest.json', index: 0 },
    manifestVerification: { ok: true },
    diagnostics: { imageSlides: [1] },
    warnings: ['template image policy warning'],
  });

  assert.equal(output.ok, true);
  assert.deepEqual(output, context);
  context.artifact.name = 'mutated';
  context.manifestUpdate.action = 'changed';
  context.manifestVerification.ok = false;
  context.diagnostics.imageSlides.push(2);
  context.warnings.push('mutated warning');
  assert.equal(artifact.name, 'deck deck');
  assert.equal(output.artifact.name, 'deck deck');
  assert.equal(output.manifestUpdate.action, 'added');
  assert.equal(output.manifestVerification.ok, true);
  assert.deepEqual(output.diagnostics, { imageSlides: [1] });
  assert.deepEqual(output.warnings, ['template image policy warning']);

  const markdown = deliveryManifestPolicySuggestionMarkdown(output);
  const markdownLines = deliveryManifestPolicySuggestionMarkdownLines(output);
  assert.deepEqual(markdownLines, markdown.trimEnd().split('\n'));
  assert.match(markdown, /^### Slide artifact policy: deck deck/m);
  assert.match(markdown, /- type: deck/);
  assert.match(markdown, /- slides: 2\.\.2/);
  assert.match(markdown, /- allowedPptxImageSlides: 1/);
  assert.match(markdown, /- allowedPptxSpecialElementTypes: chart/);
  assert.match(markdown, /- manifestUpdate: added \/tmp\/manifest\.json#0/);
  assert.match(markdown, /- manifestVerification: ok/);
  assert.match(markdown, /- warnings: template image policy warning/);
  assert.equal(markdown.endsWith('\n'), true);
  markdownLines[0] = 'mutated';
  assert.equal(markdown.startsWith('### Slide artifact policy: deck deck'), true);

  const jsonText = deliveryManifestPolicySuggestionText(output, 'json');
  assert.deepEqual(JSON.parse(jsonText), output);
  assert.equal(deliveryManifestPolicySuggestionText(output, 'markdown'), markdown);
});

test('delivery manifest utilities build artifact verification payloads', () => {
  const results = [
    {
      name: 'deck',
      type: 'deck',
      dir: '/tmp/out/deck',
      basename: 'deck',
      ok: true,
      command: 'node verify.mjs /tmp/out/deck deck',
      result: { ok: true },
      error: '',
    },
  ];
  const payload = deliveryManifestArtifactsVerificationPayload({
    manifestPath: '/tmp/artifacts.manifest.json',
    results,
    manifestErrors: [],
    checkedArtifactTypes: ['deck'],
  });

  assert.deepEqual(payload, {
    ok: true,
    manifest: '/tmp/artifacts.manifest.json',
    checked: 1,
    checkedArtifactTypes: ['deck'],
    manifestErrors: [],
    results,
  });
  payload.results[0].result.ok = false;
  assert.equal(results[0].result.ok, true);

  assert.deepEqual(deliveryManifestArtifactsVerificationPayload({
    manifestPath: '/tmp/broken.manifest.json',
    checked: 0,
    manifestErrors: ['artifacts must be an array'],
    results: [],
  }), {
    ok: false,
    manifest: '/tmp/broken.manifest.json',
    checked: 0,
    manifestErrors: ['artifacts must be an array'],
    results: [],
  });
});

test('delivery manifest utilities centralize artifact verification payload context', () => {
  const results = [
    {
      name: 'deck',
      type: 'deck',
      dir: '/tmp/out/deck',
      basename: 'deck',
      ok: true,
      command: 'node verify.mjs /tmp/out/deck deck',
      result: { ok: true },
      error: '',
    },
  ];
  const context = deliveryManifestArtifactsVerificationPayloadContext({
    manifestPath: '/tmp/artifacts.manifest.json',
    results,
    manifestErrors: [],
    checkedArtifactTypes: ['deck'],
  });
  const wrapped = deliveryManifestArtifactsVerificationPayload({
    manifestPath: '/tmp/artifacts.manifest.json',
    results,
    manifestErrors: [],
    checkedArtifactTypes: ['deck'],
  });

  assert.deepEqual(context, wrapped);
  context.results[0].result.ok = false;
  assert.equal(results[0].result.ok, true);
});

test('delivery manifest utilities build deck verification payloads', () => {
  const success = deliveryManifestDeckVerificationPayload({
    outlineSlides: 2,
    slideTitles: ['Cover', 'Body'],
    htmlSlides: 2,
    pptxSlides: 2,
    promptCount: 2,
    errors: [],
  });
  assert.deepEqual(success, {
    ok: true,
    outlineSlides: 2,
    slideTitles: ['Cover', 'Body'],
    htmlSlides: 2,
    pptxSlides: 2,
    promptCount: 2,
    errors: [],
  });

  const paths = { pptx: '/tmp/out/deck.editable.pptx' };
  const failure = deliveryManifestDeckVerificationPayload({
    ok: false,
    paths,
    outlineSlides: 2,
    slideTitles: ['Cover', 'Body'],
    errors: ['PPTX slide count 1 != outline 2'],
  });
  assert.deepEqual(failure, {
    ok: false,
    outlineSlides: 2,
    slideTitles: ['Cover', 'Body'],
    paths,
    errors: ['PPTX slide count 1 != outline 2'],
  });
  failure.paths.pptx = '/tmp/changed.pptx';
  failure.slideTitles.push('Mutated');
  assert.equal(paths.pptx, '/tmp/out/deck.editable.pptx');
  assert.deepEqual(success.slideTitles, ['Cover', 'Body']);
});

test('delivery manifest utilities centralize deck verification payload context', () => {
  const paths = { pptx: '/tmp/out/deck.editable.pptx' };
  const context = deliveryManifestDeckVerificationPayloadContext({
    ok: false,
    paths,
    outlineSlides: 2,
    slideTitles: ['Cover', 'Body'],
    errors: ['PPTX slide count 1 != outline 2'],
  });
  const wrapped = deliveryManifestDeckVerificationPayload({
    ok: false,
    paths,
    outlineSlides: 2,
    slideTitles: ['Cover', 'Body'],
    errors: ['PPTX slide count 1 != outline 2'],
  });

  assert.deepEqual(context, wrapped);
  context.paths.pptx = '/tmp/changed.pptx';
  context.slideTitles.push('Mutated');
  assert.equal(paths.pptx, '/tmp/out/deck.editable.pptx');
});

test('delivery manifest utilities build onepager verification payloads', () => {
  const required = ['課題', '解決'];
  const success = deliveryManifestOnepagerVerificationPayload({
    ok: true,
    htmlPath: '/tmp/out/page.html',
    svgPath: '/tmp/out/page.svg',
    htmlBytes: 120,
    svgBytes: 80,
    required,
    errors: [],
  });
  assert.deepEqual(success, {
    ok: true,
    html: '/tmp/out/page.html',
    svg: '/tmp/out/page.svg',
    htmlBytes: 120,
    svgBytes: 80,
    required: ['課題', '解決'],
    errors: [],
  });

  const failure = deliveryManifestOnepagerVerificationPayload({
    ok: false,
    htmlPath: '/tmp/out/missing.html',
    svgPath: '/tmp/out/missing.svg',
    htmlBytes: 0,
    svgBytes: 0,
    required,
    errors: ['missing HTML: /tmp/out/missing.html'],
  });
  assert.equal(failure.ok, false);
  failure.required.push('mutated');
  assert.deepEqual(required, ['課題', '解決']);
});

test('delivery manifest utilities centralize onepager verification payload context', () => {
  const required = ['課題', '解決'];
  const context = deliveryManifestOnepagerVerificationPayloadContext({
    ok: true,
    htmlPath: '/tmp/out/page.html',
    svgPath: '/tmp/out/page.svg',
    htmlBytes: 120,
    svgBytes: 80,
    required,
    errors: [],
  });
  const wrapped = deliveryManifestOnepagerVerificationPayload({
    ok: true,
    htmlPath: '/tmp/out/page.html',
    svgPath: '/tmp/out/page.svg',
    htmlBytes: 120,
    svgBytes: 80,
    required,
    errors: [],
  });

  assert.deepEqual(context, wrapped);
  context.required.push('mutated');
  assert.deepEqual(required, ['課題', '解決']);
});

test('delivery manifest utilities write discord report files with trailing newline', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-tool-discord-report-'));
  const context = deliveryManifestDiscordReportContext({
    inputPath: path.join(tmp, 'input.md'),
    outDir: tmp,
    name: 'deck',
    outline: { title: 'Deck Title' },
    htmlPath: path.join(tmp, 'deck.preview.html'),
    pptxPath: path.join(tmp, 'deck.editable.pptx'),
    outlinePath: path.join(tmp, 'deck.outline.json'),
    promptsPath: path.join(tmp, 'deck.image-prompts.json'),
    screenshotPath: path.join(tmp, 'deck.preview.png'),
    screenshot: { ok: false, source: 'none' },
    verification: null,
    acceptance: null,
    deliveryReadiness: { ok: false, reasons: ['verification not ready'] },
    identityChecks: null,
  });

  const reportPath = deliveryManifestWriteDiscordReport(context, {
    workspaceRoot: '/workspace',
    rootDir: '/workspace/slide-tool',
  });
  const text = fs.readFileSync(reportPath, 'utf8');

  assert.equal(reportPath, path.join(tmp, 'discord-report.md'));
  assert.ok(text.startsWith('作成物:\n'));
  assert.ok(text.includes('納品不可: `--verify`でoutline/HTML/PPTX/image prompts一致とPPTX内部を検証してください。'));
  assert.equal(text.endsWith('\n'), true);
  assert.equal(text.endsWith('\n\n'), false);
});

test('delivery manifest utilities format studio error messages from multiline errors', () => {
  assert.deepEqual(deliveryManifestStudioErrorMessages(new Error('Invalid outline:\n- title is required\n- slides must contain at least one slide')), [
    'Invalid outline:',
    'title is required',
    'slides must contain at least one slide',
  ]);
  assert.deepEqual(deliveryManifestStudioErrorMessages('plain failure'), ['plain failure']);
  assert.deepEqual(deliveryManifestStudioErrorMessages(null), ['Unknown error']);
});

test('delivery manifest utilities build studio error summaries', () => {
  assert.deepEqual(deliveryManifestStudioErrorSummary(new Error('Invalid outline:\n- title is required')), {
    ok: false,
    source: 'studio',
    errors: ['Invalid outline:', 'title is required'],
  });
});

test('delivery manifest utilities route caught studio errors by verify payload', () => {
  const verifyError = new Error('verification failed');
  verifyError.verify = { ok: false, source: 'verify', errors: ['bad deck'] };
  assert.deepEqual(deliveryManifestStudioCaughtErrorSummary(verifyError), verifyError.verify);
  assert.deepEqual(deliveryManifestStudioCaughtErrorSummary(new Error('plain failure')), {
    ok: false,
    source: 'studio',
    errors: ['plain failure'],
  });
});

test('delivery manifest utilities build shell-safe usage command lines', () => {
  const context = deliveryManifestUsageCommandLinesContext({
    workspaceRoot: '/tmp/work space',
    rootDir: '/tmp/work space/slide-tool',
    inputPath: "/tmp/work space/brief's deck.json",
    outDir: '/tmp/work space/out dir',
    name: 'deck name',
  });
  const lines = deliveryManifestUsageCommandLines({
    workspaceRoot: '/tmp/work space',
    rootDir: '/tmp/work space/slide-tool',
    inputPath: "/tmp/work space/brief's deck.json",
    outDir: '/tmp/work space/out dir',
    name: 'deck name',
  });
  assert.deepEqual(lines, context);
  context[2] = 'mutated';
  assert.match(lines[2], /--input/);
  assert.deepEqual(lines, [
    '使い方:',
    '```bash',
    "node '/tmp/work space/skills/slide-studio/scripts/shiro-slide-studio.mjs' --input '/tmp/work space/brief'\\''s deck.json' --out '/tmp/work space/out dir' --name 'deck name' --verify",
    "node '/tmp/work space/slide-tool/scripts/verify.mjs' '/tmp/work space/out dir' 'deck name'",
    "node '/tmp/work space/slide-tool/scripts/suggest-manifest-policy.mjs' '/tmp/work space/out dir' 'deck name' --format markdown",
    "node '/tmp/work space/slide-tool/scripts/suggest-manifest-policy.mjs' '/tmp/work space/out dir' 'deck name' --update-manifest '/tmp/work space/out dir/deck name.acceptance.manifest.json' --verify-manifest --format markdown",
    '```',
  ]);
});

test('delivery manifest utilities build follow-up prompt lines from the deck title', () => {
  const context = deliveryManifestFollowUpPromptLinesContext('AI Slide Workflow');
  const lines = deliveryManifestFollowUpPromptLines('AI Slide Workflow');
  assert.deepEqual(lines, context);
  context[1] = 'mutated';
  assert.deepEqual(lines, [
    '次に試す依頼例:',
    '```text',
    'この資料「AI Slide Workflow」を、相手と目的に合わせてトーン調整して。HTML previewとeditable PPTXを再生成し、検証レポートも付けて。',
    '```',
  ]);

  assert.deepEqual(deliveryManifestFollowUpPromptLines(''), [
    '次に試す依頼例:',
    '```text',
    'この資料「Untitled Deck」を、相手と目的に合わせてトーン調整して。HTML previewとeditable PPTXを再生成し、検証レポートも付けて。',
    '```',
  ]);
});

test('delivery manifest utilities build acceptance checklist lines for verified and blocked runs', () => {
  const acceptance = {
    ok: true,
    manifestUpdate: { path: '/tmp/out/deck.acceptance.manifest.json', action: 'added' },
    manifestVerification: {
      ok: true,
      scope: 'manifest-only',
      result: { checked: 1, checkedArtifactTypes: ['deck'] },
    },
  };
  const deliveryReadiness = { ok: true, reasons: [] };
  const identityChecks = {
    report: { matched: true },
    deliveryMessage: { matched: true },
    deliveryManifest: { matched: true },
  };
  const summary = deliveryManifestAcceptanceChecklistQaSummary({
    acceptance,
    outDir: '/tmp/out',
    name: 'deck',
  });
  const summaryContext = deliveryManifestAcceptanceChecklistQaSummaryContext({
    acceptance,
    outDir: '/tmp/out',
    name: 'deck',
  });
  assert.deepEqual(summary, summaryContext);
  summaryContext.checkedArtifacts = 99;
  assert.equal(summary.checkedArtifacts.count, 1);
  assert.deepEqual(summary, {
    acceptanceManifest: {
      line: 'manifest: /tmp/out/deck.acceptance.manifest.json',
      scopeLine: 'manifest verification scope: manifest-only',
    },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    checkedArtifactTypes: {
      status: 'present',
      types: ['deck'],
      text: 'deck',
      line: 'checked artifact types: deck',
    },
  });
  const checkedArtifactsLineContext = deliveryManifestFormatCheckedArtifactsLineContext(1);
  assert.deepEqual(checkedArtifactsLineContext, {
    status: 'present',
    count: 1,
    line: 'checked artifacts: 1',
  });
  assert.equal(deliveryManifestFormatCheckedArtifactsLine(1), 'checked artifacts: 1');
  assert.equal(deliveryManifestFormatCheckedArtifactsLine(), 'checked artifacts: missing');

  const qaLines = deliveryManifestAcceptanceChecklistQaLines({
    acceptance,
    deliveryReadiness,
    identityChecks,
    verificationQaLines: ['PPTX images: 0 (none)'],
    outDir: '/tmp/out',
    name: 'deck',
  });
  const qaLinesContext = deliveryManifestAcceptanceChecklistQaLinesContext({
    acceptance,
    deliveryReadiness,
    identityChecks,
    verificationQaLines: ['PPTX images: 0 (none)'],
    outDir: '/tmp/out',
    name: 'deck',
  });
  assert.deepEqual(qaLines, qaLinesContext);
  qaLinesContext[0] = 'mutated';
  assert.equal(qaLines[0], 'delivery readiness: ready');
  assert.deepEqual(qaLines, [
    'delivery readiness: ready',
    'reasons: none',
    'manifest: /tmp/out/deck.acceptance.manifest.json',
    'artifact policy: added',
    'manifest verification: ok',
    'manifest verification scope: manifest-only',
    'checked artifacts: 1',
    'checked artifact types: deck',
    'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    'PPTX images: 0 (none)',
  ]);

  const checklistLines = deliveryManifestAcceptanceChecklistLines({
    acceptance,
    deliveryReadiness,
    identityChecks,
    verificationQaLines: ['PPTX images: 0 (none)'],
    outDir: '/tmp/out',
    name: 'deck',
  });
  const checklistContext = deliveryManifestAcceptanceChecklistLinesContext({
    acceptance,
    deliveryReadiness,
    identityChecks,
    verificationQaLines: ['PPTX images: 0 (none)'],
    outDir: '/tmp/out',
    name: 'deck',
  });
  assert.deepEqual(checklistLines, checklistContext);
  checklistContext[1] = 'mutated';
  assert.equal(checklistLines[1], '- status: ready');
  assert.deepEqual(checklistLines, [
    '納品前チェック:',
    '- status: ready',
    '- ok: true',
    '- delivery readiness: ready',
    '- reasons: none',
    '- manifest: /tmp/out/deck.acceptance.manifest.json',
    '- artifact policy: added',
    '- manifest verification: ok',
    '- manifest verification scope: manifest-only',
    '- checked artifacts: 1',
    '- checked artifact types: deck',
    '- identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    '- PPTX images: 0 (none)',
  ]);

  assert.deepEqual(deliveryManifestAcceptanceChecklistLines({
    acceptance: null,
    deliveryReadiness: { ok: false, reasons: ['verification not ready'] },
    verificationQaLines: ['PPTX images: 0 (none)'],
    outDir: '/tmp/out',
    name: 'deck',
  }), [
    '納品前チェック:',
    '- status: blocked',
    '- delivery readiness: blocked',
    '- reasons: verification not ready',
    '- 納品不可: `--verify`でacceptance manifest生成とverify-artifacts確認まで実行してください。',
  ]);

  const missingVerificationCounts = {
    ok: true,
    manifestUpdate: { path: '/tmp/out/deck.acceptance.manifest.json', action: 'added' },
    manifestVerification: {
      ok: true,
      scope: 'manifest-only',
      result: { ok: true },
    },
  };
  assert.deepEqual(deliveryManifestAcceptanceChecklistQaSummary({
    acceptance: missingVerificationCounts,
    outDir: '/tmp/out',
    name: 'deck',
  }), {
    acceptanceManifest: {
      line: 'manifest: /tmp/out/deck.acceptance.manifest.json',
      scopeLine: 'manifest verification scope: manifest-only',
    },
    checkedArtifacts: {
      status: 'missing',
      count: null,
      line: 'checked artifacts: missing',
    },
    checkedArtifactTypes: {
      status: 'missing',
      types: [],
      text: 'none',
      line: 'checked artifact types: missing',
    },
  });
  assert.deepEqual(deliveryManifestAcceptanceChecklistQaLines({
    acceptance: missingVerificationCounts,
    deliveryReadiness,
    identityChecks,
    outDir: '/tmp/out',
    name: 'deck',
  }), [
    'delivery readiness: ready',
    'reasons: none',
    'manifest: /tmp/out/deck.acceptance.manifest.json',
    'artifact policy: added',
    'manifest verification: ok',
    'manifest verification scope: manifest-only',
    'checked artifacts: missing',
    'checked artifact types: missing',
    'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
  ]);
});

test('delivery manifest utilities build verification result lines for verified and skipped runs', () => {
  const lines = deliveryManifestVerificationResultLines({
    verification: {
      ok: true,
      outlineSlides: 7,
      htmlSlides: 7,
      pptxSlides: 7,
      promptCount: 7,
      notesCount: 7,
    },
    verificationQaLines: ['PPTX images: 0 (none)', 'visual QA: ok'],
    screenshot: { ok: true },
    screenshotPath: '/tmp/out/deck.png',
  });
  const contextLines = deliveryManifestVerificationResultLinesContext({
    verification: {
      ok: true,
      outlineSlides: 7,
      htmlSlides: 7,
      pptxSlides: 7,
      promptCount: 7,
      notesCount: 7,
    },
    verificationQaLines: ['PPTX images: 0 (none)', 'visual QA: ok'],
    screenshot: { ok: true },
    screenshotPath: '/tmp/out/deck.png',
  });
  assert.deepEqual(lines, contextLines);
  contextLines[1] = 'mutated';
  assert.equal(lines[1], '- status: ready');
  assert.deepEqual(lines, [
    '検証結果:',
    '- status: ready',
    '- ok: true',
    '- slides: outline 7 / HTML 7 / PPTX 7',
    '- image prompts: 7',
    '- notes: 7',
    '- PPTX images: 0 (none)',
    '- visual QA: ok',
    '- screenshot: /tmp/out/deck.png',
  ]);

  assert.deepEqual(deliveryManifestVerificationResultLines({
    verification: null,
    verificationQaLines: ['PPTX images: 0 (none)'],
    screenshot: null,
    screenshotPath: '/tmp/out/deck.png',
  }), [
    '検証結果:',
    '- status: blocked',
    '- 納品不可: `--verify`でoutline/HTML/PPTX/image prompts一致とPPTX内部を検証してください。',
    '- screenshot: not generated',
  ]);
});

test('delivery manifest utilities build verification result context from clones', () => {
  const verification = {
    ok: false,
    outlineSlides: 5,
    htmlSlides: 4,
    pptxSlides: 5,
    promptCount: 5,
    notesCount: 0,
  };
  const verificationQaLines = ['PPTX images: 1 (picture:1)', 'visual QA: blocked'];
  const screenshot = { ok: false, source: 'chrome' };
  const context = deliveryManifestVerificationResultContext({
    verification,
    verificationQaLines,
    screenshot,
    screenshotPath: '/tmp/out/deck.png',
  });
  assert.deepEqual(context, {
    verification: {
      ok: false,
      outlineSlides: 5,
      htmlSlides: 4,
      pptxSlides: 5,
      promptCount: 5,
      notesCount: 0,
    },
    verificationQaLines: ['PPTX images: 1 (picture:1)', 'visual QA: blocked'],
    screenshot: { ok: false, source: 'chrome' },
    screenshotPath: null,
    status: 'blocked',
    ok: false,
    okLine: '- ok: false',
    slidesLine: '- slides: outline 5 / HTML 4 / PPTX 5',
    imagePromptsLine: '- image prompts: 5',
    notesLine: '- notes: 0',
    screenshotLine: '- screenshot: not generated',
    lines: [
      '検証結果:',
      '- status: blocked',
      '- ok: false',
      '- slides: outline 5 / HTML 4 / PPTX 5',
      '- image prompts: 5',
      '- notes: 0',
      '- PPTX images: 1 (picture:1)',
      '- visual QA: blocked',
      '- screenshot: not generated',
    ],
  });
  context.verification.outlineSlides = 99;
  context.verificationQaLines[0] = 'mutated';
  context.screenshot.source = 'mutated';
  assert.deepEqual(deliveryManifestVerificationResultContext({
    verification: {
      ok: false,
      outlineSlides: 5,
      htmlSlides: 4,
      pptxSlides: 5,
      promptCount: 5,
      notesCount: 0,
    },
      verificationQaLines: ['PPTX images: 1 (picture:1)', 'visual QA: blocked'],
      screenshot: { ok: false, source: 'chrome' },
      screenshotPath: '/tmp/out/deck.png',
  }).lines, context.lines);
});

test('delivery manifest utilities summarize attachable delivery and audit paths', () => {
  assert.deepEqual(deliveryManifestAttachmentPathSummary({
    required: [
      { type: 'pptx', path: '/tmp/deck.pptx', attachable: true },
      { type: 'html', path: '/tmp/deck.html', attachable: false },
    ],
    optional: [
      { type: 'outline', path: '/tmp/deck.outline.json', attachable: true },
      { type: 'prompts', path: null, attachable: false },
    ],
    audit: [
      { type: 'manifest', path: '/tmp/deck.acceptance.manifest.json', attachable: true },
    ],
  }), {
    deliverablePaths: ['/tmp/deck.pptx', '/tmp/deck.outline.json'],
    auditPaths: ['/tmp/deck.acceptance.manifest.json'],
    postablePaths: ['/tmp/deck.pptx', '/tmp/deck.outline.json', '/tmp/deck.acceptance.manifest.json'],
  });
});

test('delivery manifest utilities build final delivery artifacts and register audit files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-final-artifacts-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  const deliveryManifestPath = path.join(out, 'delivery-manifest.json');
  const reportPath = path.join(out, 'discord-report.md');
  const deliveryMessagePath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
    }],
  }, null, 2));
  const summary = {
    title: 'Deck Title',
    message: 'ready for Discord delivery',
    attachments: {
      required: [
        { type: 'pptx', path: path.join(out, 'deck.editable.pptx'), bytes: 120, attachable: true },
        { type: 'html', path: path.join(out, 'deck.preview.html'), bytes: 90, attachable: true },
      ],
      optional: [
        { type: 'outline', path: path.join(out, 'deck.outline.json'), bytes: 80, attachable: true },
      ],
      audit: [
        { type: 'manifest', path: manifestPath, bytes: 70, attachable: true },
      ],
    },
    acceptanceManifest: {
      line: `manifest: ${manifestPath}`,
      scopeLine: 'manifest verification scope: manifest-only',
    },
      checkedArtifacts: {
        status: 'present',
        count: 1,
        line: 'checked artifacts: 1',
        checkedArtifacts: {
          status: 'present',
          count: 1,
          line: 'checked artifacts: 1',
        },
      },
    checkedArtifactTypes: { line: 'checked artifact types: deck', types: ['deck'] },
    visualQa: {
      acceptance: { line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 4' },
    },
    pptxInternalQa: {
      acceptance: {
        images: { line: 'PPTX images: 0 (none)' },
        specialElements: { line: 'PPTX special elements: 0 (none)' },
        hiddenText: { line: 'PPTX hidden text: 0' },
      },
    },
  };
  const generated = {
    acceptance: {
      artifact: {
        name: 'deck deck',
        type: 'deck',
        dir: out,
        basename: 'deck',
      },
    },
    deliveryReadiness: { ok: true, reasons: [] },
  };
  const identityChecks = {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: true, mismatches: [] },
    deliveryManifest: { matched: true, mismatches: [] },
  };

  const message = deliveryManifestBuildDeliveryMessage({
    summary,
    generated,
    deliveryReadiness: generated.deliveryReadiness,
    identityChecks,
  });
  assert.match(message, /納品準備OK: Deck Title/);
  assert.match(message, /Artifact:\n- name: deck deck/);
  assert.match(message, /QA:[\s\S]*- delivery readiness: ready/);
  assert.match(message, /identity checks: report ready \/ deliveryMessage ready \/ deliveryManifest ready/);
  assert.match(message, /添付ファイル:[\s\S]*deck\.editable\.pptx/);
  assert.match(message, /監査ファイル:[\s\S]*deck\.acceptance\.manifest\.json/);

  const manifest = deliveryManifestBuildFinalManifest({
    summary,
    generated,
    deliveryReadiness: generated.deliveryReadiness,
    identityChecks,
  });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.artifactName, 'deck deck');
  assert.deepEqual(manifest.identityChecks, identityChecks);
  assert.deepEqual(manifest.deliverablePaths, [
    path.join(out, 'deck.editable.pptx'),
    path.join(out, 'deck.preview.html'),
    path.join(out, 'deck.outline.json'),
  ]);
  assert.deepEqual(manifest.auditPaths, [manifestPath]);

  assert.throws(
    () => deliveryManifestRegisterAuditFiles(manifestPath, []),
    /audit files are required/,
  );
  const updated = deliveryManifestRegisterAuditFiles(manifestPath, [
    deliveryManifestPath,
    reportPath,
    deliveryMessagePath,
    reportPath,
  ]);
  assert.deepEqual(updated.artifacts[0].auditFiles, [
    deliveryManifestPath,
    reportPath,
    deliveryMessagePath,
  ]);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).artifacts[0].auditFiles, updated.artifacts[0].auditFiles);
});

test('delivery manifest utilities build attachment details and summaries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-attachment-summary-test-'));
  const manifest = path.join(dir, 'deck.acceptance.manifest.json');
  fs.writeFileSync(manifest, '{"ok":true}');
  const artifactDetails = {
    pptx: { path: '/tmp/deck.pptx', exists: true, bytes: 42 },
    html: { path: '/tmp/deck.html', exists: false, bytes: 0 },
    outline: { path: '/tmp/deck.outline.json', exists: true, bytes: 7 },
  };

  assert.deepEqual(deliveryManifestAttachmentDetail('pptx', {
    path: '/tmp/deck.pptx',
    exists: true,
    bytes: 42,
  }), {
    type: 'pptx',
    path: '/tmp/deck.pptx',
    bytes: 42,
    attachable: true,
  });
  assert.deepEqual(deliveryManifestAttachmentDetail('html', null), {
    type: 'html',
    path: null,
    bytes: 0,
    attachable: false,
  });
  assert.deepEqual(deliveryManifestAttachmentSummary({
    required: ['pptx', 'html'],
    optional: ['outline'],
    audit: ['manifest'],
  }, artifactDetails, {
    path: manifest,
    exists: true,
    bytes: fs.statSync(manifest).size,
  }), {
    required: [
      { type: 'pptx', path: '/tmp/deck.pptx', bytes: 42, attachable: true },
      { type: 'html', path: '/tmp/deck.html', bytes: 0, attachable: false },
    ],
    optional: [
      { type: 'outline', path: '/tmp/deck.outline.json', bytes: 7, attachable: true },
    ],
    audit: [
      { type: 'manifest', path: manifest, bytes: fs.statSync(manifest).size, attachable: true },
    ],
    deliverablePaths: ['/tmp/deck.pptx', '/tmp/deck.outline.json'],
    auditPaths: [manifest],
    postablePaths: ['/tmp/deck.pptx', '/tmp/deck.outline.json', manifest],
  });
});

test('delivery manifest utilities classify report artifacts and inspect file details', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-artifact-detail-test-'));
  const html = path.join(dir, 'deck.preview.html');
  const pptx = path.join(dir, 'deck.editable.pptx');
  const outline = path.join(dir, 'deck.outline.json');
  const prompts = path.join(dir, 'deck.image-prompts.md');
  fs.writeFileSync(html, '<html>preview</html>');
  fs.writeFileSync(pptx, 'pptx-bytes');
  fs.writeFileSync(outline, '{}');
  fs.writeFileSync(prompts, 'prompts');

  assert.deepEqual(deliveryManifestClassifyArtifacts([
    prompts,
    outline,
    html,
    pptx,
    path.join(dir, 'ignored.txt'),
  ]), {
    html,
    pptx,
    outline,
    prompts,
  });
  assert.deepEqual(deliveryManifestArtifactDetail(html), {
    path: html,
    exists: true,
    bytes: fs.statSync(html).size,
  });
  assert.deepEqual(deliveryManifestArtifactDetail(path.join(dir, 'missing.preview.html')), {
    path: path.join(dir, 'missing.preview.html'),
    exists: false,
    bytes: 0,
  });
  assert.deepEqual(deliveryManifestArtifactDetail(null), { path: null, exists: false, bytes: 0 });
});

test('delivery manifest utilities compare artifact identity with normalized dirs', () => {
  const expected = deliveryManifestIdentityFromArtifact({
    name: 'Sample Deck',
    type: 'deck',
    dir: '/tmp/slides/out/../out',
    basename: 'sample',
  });
  const actual = {
    name: 'Sample Deck',
    type: 'deck',
    dir: '/tmp/slides/out',
    basename: 'sample-v2',
  };

  assert.deepEqual(deliveryManifestArtifactIdentityCheck(expected, actual), {
    expected: {
      name: 'Sample Deck',
      type: 'deck',
      dir: '/tmp/slides/out/../out',
      basename: 'sample',
    },
    actual: {
      name: 'Sample Deck',
      type: 'deck',
      dir: '/tmp/slides/out',
      basename: 'sample-v2',
    },
    matched: false,
    mismatches: [
      { field: 'basename', expected: 'sample', actual: 'sample-v2' },
    ],
  });
});

test('delivery manifest utilities parse acceptance manifest section', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-acceptance-manifest-test-'));
  const manifestPath = path.join(dir, 'deck.acceptance.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ artifacts: [{ path: 'deck.editable.pptx' }] }, null, 2));

  assert.deepEqual(deliveryManifestSectionAcceptanceManifest(`
## 納品前チェック:
- manifest: deck.acceptance.manifest.json
- manifest verification scope: manifest-only
`, '## 納品前チェック:', dir), {
    status: 'present',
    path: manifestPath,
    exists: true,
    scopeStatus: 'present',
    scope: 'manifest-only',
    artifacts: [],
    expectedArtifactPaths: [],
    line: 'manifest: deck.acceptance.manifest.json',
    scopeLine: 'manifest verification scope: manifest-only',
  });

  assert.deepEqual(deliveryManifestSectionAcceptanceManifest(`
## 納品前チェック:
`, '## 納品前チェック:', dir), {
    status: 'missing',
    path: null,
    exists: false,
    scopeStatus: 'missing',
    scope: null,
    artifacts: [],
    expectedArtifactPaths: [],
    line: null,
    scopeLine: null,
  });
});

test('delivery manifest utilities resolve report paths from the report directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-resolve-report-path-test-'));
  assert.equal(deliveryManifestResolveReportPath('artifact/deck.preview.html', dir), path.normalize(path.join(dir, 'artifact/deck.preview.html')));
  assert.equal(deliveryManifestResolveReportPath(path.join(dir, 'artifact/deck.preview.html'), dir), path.normalize(path.join(dir, 'artifact/deck.preview.html')));
  assert.equal(deliveryManifestResolveReportPath(null, dir), null);
});

test('delivery manifest utilities select delivery message artifacts from acceptance manifests', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-expected-delivery-message-artifact-test-'));
  const deliveryMessagePath = path.join(dir, 'delivery-message.md');
  fs.writeFileSync(deliveryMessagePath, '# delivery');
  const otherMessagePath = path.join(dir, 'other-delivery-message.md');
  fs.writeFileSync(otherMessagePath, '# other delivery');

  assert.equal(deliveryManifestExpectedDeliveryMessageArtifact({
    acceptanceManifest: {
      artifacts: [{
        name: 'deck',
        type: 'deck',
        dir,
        basename: 'deck',
        auditFiles: [deliveryMessagePath, path.join(dir, 'discord-report.md')],
      }],
    },
  }, otherMessagePath), null);
  assert.deepEqual(deliveryManifestExpectedDeliveryMessageArtifact({
    acceptanceManifest: {
      artifacts: [{
        name: 'deck',
        type: 'deck',
        dir,
        basename: 'deck',
        auditFiles: [deliveryMessagePath, path.join(dir, 'discord-report.md')],
      }],
    },
  }, path.join(dir, 'delivery-message.md')), {
    name: 'deck',
    type: 'deck',
    dir,
    basename: 'deck',
    auditFiles: [deliveryMessagePath, path.join(dir, 'discord-report.md')],
  });
  assert.equal(deliveryManifestExpectedDeliveryMessageArtifact({
    acceptanceManifest: {
      artifacts: [{
        name: 'deck',
        type: 'deck',
        dir,
        basename: 'deck',
        auditFiles: [path.join(dir, 'discord-report.md')],
      }],
    },
  }, deliveryMessagePath), null);
});

test('delivery manifest utilities validate report artifacts and identity against acceptance manifests', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-report-artifact-validation-test-'));
  const pptx = path.join(dir, 'deck.editable.pptx');
  const html = path.join(dir, 'deck.preview.html');
  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');

  assert.deepEqual(deliveryManifestReportArtifactValidation({
    artifacts: [pptx, html, path.join(dir, 'unexpected.txt')],
    reportArtifactIdentity: {
      name: 'Report Status',
      type: 'deck',
      dir,
      basename: 'deck',
    },
  }, {
    artifacts: [{
      name: 'Report Status',
      type: 'deck',
      dir,
      basename: 'deck',
    }],
    expectedArtifactPaths: [pptx, html],
  }), {
    reportArtifactCoverageErrors: ['report artifact is not covered by acceptance manifest: ' + path.join(dir, 'unexpected.txt')],
    identityErrors: [],
  });

  assert.deepEqual(deliveryManifestReportArtifactValidation({
    artifacts: [pptx, html],
    reportArtifactIdentity: {
      name: 'Report Status',
      type: 'deck',
      dir,
      basename: 'other',
    },
  }, {
    artifacts: [{
      name: 'Report Status',
      type: 'deck',
      dir,
      basename: 'deck',
    }],
    expectedArtifactPaths: [pptx, html],
  }), {
    reportArtifactCoverageErrors: [],
    identityErrors: ['report artifact basename mismatch: expected deck / actual other'],
  });
});

test('delivery manifest utilities centralize acceptance artifact validation summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-artifact-validation-summary-'));
  const expected = path.join(dir, 'deck.editable.pptx');
  const unexpected = path.join(dir, 'unexpected.txt');
  const summary = {
    artifacts: [expected, unexpected],
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir,
      basename: 'other',
    },
    identityChecks: {
      deliveryMessage: { matched: true, mismatches: [] },
    },
  };
  const artifacts = [{
    name: 'deck deck',
    type: 'deck',
    dir,
    basename: 'deck',
  }];

  const validation = deliveryManifestAcceptanceArtifactValidationSummary(summary, artifacts, [expected]);
  assert.notStrictEqual(validation.summary, summary);
  assert.deepEqual(validation.identityCheck, {
    expected: {
      name: 'deck deck',
      type: 'deck',
      dir,
      basename: 'deck',
    },
    actual: {
      name: 'deck deck',
      type: 'deck',
      dir,
      basename: 'other',
    },
    matched: false,
    mismatches: [{
      field: 'basename',
      expected: 'deck',
      actual: 'other',
    }],
  });
  assert.deepEqual(validation.validation.reportArtifactCoverageErrors, [
    `report artifact is not covered by acceptance manifest: ${unexpected}`,
  ]);
  assert.deepEqual(validation.validation.identityErrors, [
    'report artifact basename mismatch: expected deck / actual other',
  ]);
  assert.deepEqual(validation.errors, [
    `report artifact is not covered by acceptance manifest: ${unexpected}`,
    'report artifact basename mismatch: expected deck / actual other',
  ]);
  assert.equal(validation.summary.identityChecks.deliveryManifest.matched, false);
  assert.equal(validation.summary.identityChecks.report.matched, false);
  assert.equal(summary.identityChecks.deliveryManifest, undefined);
  assert.equal(summary.identityChecks.report, undefined);
});

test('delivery manifest utilities generate ordered delivery QA lines', () => {
  const summary = {
    acceptanceManifest: {
      line: 'manifest: /tmp/deck.acceptance.manifest.json',
      scopeLine: 'manifest verification scope: manifest-only',
    },
    checkedArtifacts: 1,
    checkedArtifactTypes: { types: ['deck'] },
    visualQa: {
      acceptance: { line: 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42' },
      verification: { line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 8' },
    },
    pptxInternalQa: {
      acceptance: {
        images: { line: 'PPTX images: 0 (none)' },
        specialElements: { line: 'PPTX special elements: 0 (none)' },
        hiddenText: { line: 'PPTX hidden text: 0' },
      },
    },
  };
  const identityChecks = {
    report: { matched: true },
    deliveryMessage: { matched: false },
    deliveryManifest: { matched: true },
  };

  assert.deepEqual(deliveryManifestQaLines(summary, {
    deliveryReadiness: { ok: false, reasons: ['visual QA not ready'] },
    identityChecks,
    allowVerificationFallback: true,
  }), [
    'delivery readiness: blocked',
    'reasons: visual QA not ready',
    'manifest: /tmp/deck.acceptance.manifest.json',
    'manifest verification scope: manifest-only',
    'checked artifacts: 1',
    'checked artifact types: deck',
    'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    'visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
    'PPTX images: 0 (none)',
    'PPTX special elements: 0 (none)',
    'PPTX hidden text: 0',
  ]);
});

test('delivery manifest utilities generate ordered delivery QA lines from context data', () => {
  const summary = {
    acceptanceManifest: {
      line: 'manifest: /tmp/deck.acceptance.manifest.json',
      scopeLine: 'manifest verification scope: manifest-only',
    },
    checkedArtifacts: 1,
    checkedArtifactTypes: { types: ['deck'] },
    visualQa: {
      acceptance: { line: 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42' },
      verification: { line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 8' },
    },
    pptxInternalQa: {
      acceptance: {
        images: { line: 'PPTX images: 0 (none)' },
        specialElements: { line: 'PPTX special elements: 0 (none)' },
        hiddenText: { line: 'PPTX hidden text: 0' },
      },
    },
  };
  const identityChecks = {
    report: { matched: true },
    deliveryMessage: { matched: false },
    deliveryManifest: { matched: true },
  };
  const expectedLines = [
    'delivery readiness: blocked',
    'reasons: visual QA not ready',
    'manifest: /tmp/deck.acceptance.manifest.json',
    'manifest verification scope: manifest-only',
    'checked artifacts: 1',
    'checked artifact types: deck',
    'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    'visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
    'PPTX images: 0 (none)',
    'PPTX special elements: 0 (none)',
    'PPTX hidden text: 0',
  ];

  const context = deliveryManifestQaLinesContext(summary, {
    deliveryReadiness: { ok: false, reasons: ['visual QA not ready'] },
    identityChecks,
    allowVerificationFallback: true,
  });

  assert.deepEqual(context, {
    summary: {
      acceptanceManifest: {
        line: 'manifest: /tmp/deck.acceptance.manifest.json',
        scopeLine: 'manifest verification scope: manifest-only',
      },
      checkedArtifacts: {
        count: 1,
        line: 'checked artifacts: 1',
        status: 'present',
      },
      checkedArtifactTypes: {
        status: 'present',
        types: ['deck'],
        line: 'checked artifact types: deck',
      },
      deliveryReadiness: {
        ok: false,
        reasons: ['visual QA not ready'],
        line: 'delivery readiness: blocked',
        reasonsLine: 'reasons: visual QA not ready',
      },
      visualQa: {
        acceptance: { line: 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42' },
        verification: { line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 8' },
      },
      pptxInternalQa: {
        acceptance: {
          images: { line: 'PPTX images: 0 (none)' },
          specialElements: { line: 'PPTX special elements: 0 (none)' },
          hiddenText: { line: 'PPTX hidden text: 0' },
        },
      },
    },
    deliveryReadiness: {
      ok: false,
      reasons: ['visual QA not ready'],
      line: 'delivery readiness: blocked',
      reasonsLine: 'reasons: visual QA not ready',
    },
    identityChecks: {
      order: ['report', 'deliveryMessage', 'deliveryManifest'],
      parts: ['report ready', 'deliveryMessage blocked', 'deliveryManifest ready'],
      text: 'report ready / deliveryMessage blocked / deliveryManifest ready',
      line: 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    checkedArtifactTypes: {
      status: 'present',
      types: ['deck'],
      line: 'checked artifact types: deck',
    },
    checkedArtifactTypesLine: 'checked artifact types: deck',
    identityChecksLine: 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    visualQaLine: 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
    pptxImagesLine: 'PPTX images: 0 (none)',
    pptxSpecialLine: 'PPTX special elements: 0 (none)',
    pptxHiddenTextLine: 'PPTX hidden text: 0',
    lines: expectedLines,
  });
  context.lines[6] = 'identity checks: mutated';
  assert.deepEqual(summary.checkedArtifactTypes, { types: ['deck'] });
  context.lines[1] = 'reasons: mutated';
  assert.deepEqual(deliveryManifestQaLines(summary, {
    deliveryReadiness: { ok: false, reasons: ['visual QA not ready'] },
    identityChecks,
    allowVerificationFallback: true,
  }), expectedLines);

  const structuredReadiness = deliveryManifestSummarizeDeliveryReadinessContext(
    { ok: true, imageCount: 0, specialElementCount: 0, hiddenTextCount: 0 },
    { ok: true },
    { status: 'ready', source: 'chrome', width: 1280, height: 900, uniqueSampledColors: 42 },
  );
  const structuredContext = deliveryManifestQaLinesContext(summary, {
    deliveryReadiness: structuredReadiness,
    identityChecks,
    allowVerificationFallback: true,
  });
  assert.equal(structuredContext.deliveryReadiness.ok, true);
  assert.equal(structuredContext.deliveryReadiness.verification, 'ready');
  assert.equal(structuredContext.deliveryReadiness.acceptance, 'ready');
  assert.equal(structuredContext.deliveryReadiness.visualQa, 'ready');
  assert.equal(structuredContext.deliveryReadiness.line, 'delivery readiness: ready');
  assert.equal(structuredContext.deliveryReadiness.reasonsLine, 'reasons: none');
  assert.deepEqual(structuredContext.deliveryReadiness.reasons, []);
  assert.notStrictEqual(structuredContext.deliveryReadiness, structuredReadiness);
  assert.notStrictEqual(structuredContext.deliveryReadiness.reasons, structuredReadiness.reasons);

  const legacyNestedCheckedArtifactTypesSummary = {
    ...summary,
    checkedArtifactTypes: {
      status: 'missing',
      types: [],
      checkedArtifactTypes: {
        types: ['deck'],
      },
    },
  };
  assert.deepEqual(deliveryManifestQaLinesContext(legacyNestedCheckedArtifactTypesSummary, {
    deliveryReadiness: structuredReadiness,
    identityChecks,
    allowVerificationFallback: true,
  }).lines, [
    'delivery readiness: ready',
    'reasons: none',
    'manifest: /tmp/deck.acceptance.manifest.json',
    'manifest verification scope: manifest-only',
    'checked artifacts: 1',
    'checked artifact types: missing',
    'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    'visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
    'PPTX images: 0 (none)',
    'PPTX special elements: 0 (none)',
    'PPTX hidden text: 0',
  ]);
  assert.equal(deliveryManifestQaLinesContext(legacyNestedCheckedArtifactTypesSummary, {
    deliveryReadiness: structuredReadiness,
    identityChecks,
    allowVerificationFallback: true,
  }).checkedArtifactTypes.status, 'missing');

  const emptyCheckedArtifactTypesSummary = {
    ...summary,
    checkedArtifactTypes: {
      status: 'present',
      types: [],
    },
  };
  const emptyCheckedArtifactTypesContext = deliveryManifestQaLinesContext(emptyCheckedArtifactTypesSummary, {
    deliveryReadiness: structuredReadiness,
    identityChecks,
    allowVerificationFallback: true,
  });
  assert.equal(emptyCheckedArtifactTypesContext.checkedArtifactTypes.status, 'missing');
  assert.equal(emptyCheckedArtifactTypesContext.checkedArtifactTypes.line, 'checked artifact types: missing');
  assert.deepEqual(emptyCheckedArtifactTypesContext.lines, [
    'delivery readiness: ready',
    'reasons: none',
    'manifest: /tmp/deck.acceptance.manifest.json',
    'manifest verification scope: manifest-only',
    'checked artifacts: 1',
    'checked artifact types: missing',
    'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    'visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
    'PPTX images: 0 (none)',
    'PPTX special elements: 0 (none)',
    'PPTX hidden text: 0',
  ]);
});

test('delivery manifest utilities generate verification QA lines from verifier output', () => {
  const verification = {
    imageCount: 2,
    imageBreakdown: { picture: 1, embeddedBlip: 1, background: 0 },
    specialElementCount: 1,
    specialElementBreakdown: { chart: 1, ole: 0 },
    hiddenTextCount: 3,
  };
  const visualQa = {
    status: 'blocked',
    source: 'chrome',
    uniqueSampledColors: null,
  };
  const expected = [
    'PPTX images: 2 (picture:1, embeddedBlip:1)',
    'PPTX special elements: 1 (chart:1)',
    'PPTX hidden text: 3',
    'visual QA: blocked / source: chrome / uniqueSampledColors: n/a',
  ];
  const context = deliveryManifestVerificationQaLinesContext(verification, visualQa);
  assert.deepEqual(context, expected);
  context[0] = 'mutated';
  assert.deepEqual(deliveryManifestVerificationQaLines(verification, visualQa), expected);
  verification.imageBreakdown.picture = 99;
  visualQa.source = 'mutated';
  assert.deepEqual(deliveryManifestVerificationQaLinesContext({
    imageCount: 2,
    imageBreakdown: { picture: 1, embeddedBlip: 1, background: 0 },
    specialElementCount: 1,
    specialElementBreakdown: { chart: 1, ole: 0 },
    hiddenTextCount: 3,
  }, {
    status: 'blocked',
    source: 'chrome',
    uniqueSampledColors: null,
  }), expected);
});

test('delivery manifest utilities build verification QA context from clones', () => {
  const verification = {
    imageCount: 2,
    imageBreakdown: { picture: 1, embeddedBlip: 1, background: 0 },
    specialElementCount: 1,
    specialElementBreakdown: { chart: 1, ole: 0 },
    hiddenTextCount: 3,
  };
  const visualQa = {
    status: 'blocked',
    source: 'chrome',
    uniqueSampledColors: null,
  };
  const context = deliveryManifestVerificationQaContext(verification, visualQa);
  assert.deepEqual(context, {
    verification: {
      imageCount: 2,
      imageBreakdown: { picture: 1, embeddedBlip: 1, background: 0 },
      specialElementCount: 1,
      specialElementBreakdown: { chart: 1, ole: 0 },
      hiddenTextCount: 3,
    },
    pptxImages: {
      imageCount: 2,
      imageBreakdown: {
        counts: { picture: 1, embeddedBlip: 1, background: 0 },
        details: ['picture:1', 'embeddedBlip:1'],
        text: 'picture:1, embeddedBlip:1',
        line: 'picture:1, embeddedBlip:1',
      },
      line: 'PPTX images: 2 (picture:1, embeddedBlip:1)',
    },
    pptxSpecialElements: {
      specialElementCount: 1,
      specialElementBreakdown: {
        counts: { chart: 1, ole: 0 },
        details: ['chart:1'],
        text: 'chart:1',
        line: 'chart:1',
      },
      line: 'PPTX special elements: 1 (chart:1)',
    },
    pptxHiddenText: {
      hiddenTextCount: 3,
      line: 'PPTX hidden text: 3',
    },
    visualQa: {
      line: 'visual QA: blocked / source: chrome / uniqueSampledColors: n/a',
      status: 'blocked',
      source: 'chrome',
      uniqueSampledColors: null,
    },
    lines: [
      'PPTX images: 2 (picture:1, embeddedBlip:1)',
      'PPTX special elements: 1 (chart:1)',
      'PPTX hidden text: 3',
      'visual QA: blocked / source: chrome / uniqueSampledColors: n/a',
    ],
  });
  context.verification.imageCount = 99;
  context.pptxImages.imageCount = 88;
  context.visualQa.source = 'mutated';
  assert.deepEqual(deliveryManifestVerificationQaContext({
    imageCount: 2,
    imageBreakdown: { picture: 1, embeddedBlip: 1, background: 0 },
    specialElementCount: 1,
    specialElementBreakdown: { chart: 1, ole: 0 },
    hiddenTextCount: 3,
  }, {
    status: 'blocked',
    source: 'chrome',
    uniqueSampledColors: null,
  }).lines, [
    'PPTX images: 2 (picture:1, embeddedBlip:1)',
    'PPTX special elements: 1 (chart:1)',
    'PPTX hidden text: 3',
    'visual QA: blocked / source: chrome / uniqueSampledColors: n/a',
  ]);
});

test('delivery manifest utilities format delivery readiness reasons', () => {
  assert.equal(deliveryManifestFormatDeliveryReasons({ reasons: [] }), 'none');
  assert.equal(deliveryManifestFormatDeliveryReasons(null), 'none');
  const context = deliveryManifestFormatDeliveryReasonsContext({
    reasons: [
      'verification not ready',
      'visual QA not ready: blocked',
      'PPTX hidden text present: 2',
    ],
  });
  assert.deepEqual(context, {
    reasons: [
      'verification not ready',
      'visual QA not ready: blocked',
      'PPTX hidden text present: 2',
    ],
    text: 'verification not ready; visual QA not ready: blocked; PPTX hidden text present: 2',
    line: 'reasons: verification not ready; visual QA not ready: blocked; PPTX hidden text present: 2',
  });
  context.reasons[0] = 'mutated';
  assert.equal(deliveryManifestFormatDeliveryReasons({
    reasons: [
      'verification not ready',
      'visual QA not ready: blocked',
      'PPTX hidden text present: 2',
    ],
  }), 'verification not ready; visual QA not ready: blocked; PPTX hidden text present: 2');
});

test('delivery manifest utilities format delivery readiness and reasons lines via context', () => {
  const readinessLine = deliveryManifestFormatDeliveryReadinessLineContext({ ok: true });
  const reasonsLine = deliveryManifestFormatDeliveryReasonsLineContext({
    reasons: ['verification not ready', 'acceptance not ready'],
  });
  assert.deepEqual(readinessLine, {
    ok: true,
    line: 'delivery readiness: ready',
  });
  assert.deepEqual(reasonsLine, {
    reasons: ['verification not ready', 'acceptance not ready'],
    line: 'reasons: verification not ready; acceptance not ready',
  });
  readinessLine.ok = false;
  reasonsLine.reasons[0] = 'mutated';
  assert.equal(deliveryManifestFormatDeliveryReadinessLine({ ok: true }), 'delivery readiness: ready');
  assert.equal(deliveryManifestFormatDeliveryReadinessLine(), 'delivery readiness: blocked');
  assert.equal(deliveryManifestFormatDeliveryReasonsLine({
    reasons: ['verification not ready', 'acceptance not ready'],
  }), 'reasons: verification not ready; acceptance not ready');
  assert.equal(deliveryManifestFormatDeliveryReasonsLine(), 'reasons: none');
});

test('delivery manifest utilities format visual QA from cloned context data', () => {
  const visualQa = {
    status: 'ready',
    source: 'chrome',
    width: 1280,
    height: 900,
    uniqueSampledColors: 42,
  };
  const context = deliveryManifestFormatVisualQaContext(visualQa);
  assert.deepEqual(context, {
    visualQa: {
      status: 'ready',
      source: 'chrome',
      width: 1280,
      height: 900,
      uniqueSampledColors: 42,
    },
    text: 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
    line: 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
  });
  context.text = 'mutated';
  assert.equal(deliveryManifestFormatVisualQa(visualQa), 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42');
  visualQa.source = 'changed';
  assert.equal(deliveryManifestFormatVisualQaContext({
    status: 'ready',
    source: 'chrome',
    width: 1280,
    height: 900,
    uniqueSampledColors: 42,
  }).text, 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42');
});

test('delivery manifest utilities format PPTX internal QA breakdowns', () => {
  const breakdown = deliveryManifestFormatBreakdownContext({ picture: 2, background: 0, embeddedBlip: 1 });
  assert.deepEqual(breakdown, {
    counts: { picture: 2, background: 0, embeddedBlip: 1 },
    details: ['picture:2', 'embeddedBlip:1'],
    text: 'picture:2, embeddedBlip:1',
    line: 'picture:2, embeddedBlip:1',
  });
  breakdown.counts.picture = 99;
  breakdown.details[0] = 'mutated';
  assert.equal(deliveryManifestFormatBreakdown({ picture: 2, background: 0, embeddedBlip: 1 }), 'picture:2, embeddedBlip:1');
  assert.equal(deliveryManifestFormatBreakdown({ picture: 0, background: 0 }), 'none');
  assert.equal(deliveryManifestFormatBreakdown(null), 'none');
});

test('delivery manifest utilities format PPTX internal QA breakdown lines via context', () => {
  const context = deliveryManifestFormatBreakdownLineContext({ picture: 2, background: 0, embeddedBlip: 1 });
  assert.deepEqual(context, {
    breakdown: {
      counts: { picture: 2, background: 0, embeddedBlip: 1 },
      details: ['picture:2', 'embeddedBlip:1'],
      text: 'picture:2, embeddedBlip:1',
      line: 'picture:2, embeddedBlip:1',
    },
    line: 'picture:2, embeddedBlip:1',
  });
  context.breakdown.counts.picture = 99;
  context.breakdown.details[0] = 'mutated';
  assert.equal(deliveryManifestFormatBreakdownLine({ picture: 2, background: 0, embeddedBlip: 1 }), 'picture:2, embeddedBlip:1');
  assert.equal(deliveryManifestFormatBreakdownLine({}), 'none');
});

test('delivery manifest utilities format checked artifact types', () => {
  const context = deliveryManifestFormatCheckedArtifactTypesContext(['deck', 'onepager']);
  assert.deepEqual(context, {
    types: ['deck', 'onepager'],
    text: 'deck, onepager',
    line: 'checked artifact types: deck, onepager',
  });
  context.types[0] = 'mutated';
  assert.equal(deliveryManifestFormatCheckedArtifactTypes(['deck', 'onepager']), 'deck, onepager');
  assert.equal(deliveryManifestFormatCheckedArtifactTypes([]), 'none');
  assert.equal(deliveryManifestFormatCheckedArtifactTypes(null), 'none');
});

test('delivery manifest utilities format checked artifact types line via context', () => {
  const types = ['deck', 'onepager'];
  const context = deliveryManifestFormatCheckedArtifactTypesLineContext(types);
  assert.deepEqual(context, {
    status: 'present',
    types: ['deck', 'onepager'],
    text: 'deck, onepager',
    line: 'checked artifact types: deck, onepager',
  });
  context.types[0] = 'mutated-again';
  assert.notStrictEqual(context.types, types);
  assert.deepEqual(types, ['deck', 'onepager']);
  assert.equal(deliveryManifestFormatCheckedArtifactTypesLine(['deck', 'onepager']), 'checked artifact types: deck, onepager');
  assert.equal(deliveryManifestFormatCheckedArtifactTypesLine(), 'checked artifact types: missing');
});

test('delivery manifest utilities format identity checks', () => {
  const identityChecks = {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: false, mismatches: ['missing attachment line'] },
    deliveryManifest: { matched: true, mismatches: [] },
  };
  const context = deliveryManifestFormatIdentityChecksContext(identityChecks);
  assert.deepEqual(context, {
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: false, mismatches: ['missing attachment line'] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    order: ['report', 'deliveryMessage', 'deliveryManifest'],
    parts: ['report ready', 'deliveryMessage blocked', 'deliveryManifest ready'],
    text: 'report ready / deliveryMessage blocked / deliveryManifest ready',
    line: 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
  });
  context.parts[0] = 'mutated';
  assert.equal(deliveryManifestFormatIdentityChecks(identityChecks), 'report ready / deliveryMessage blocked / deliveryManifest ready');
  assert.equal(deliveryManifestFormatIdentityChecks(null), 'missing');
});

test('delivery manifest utilities normalize comparison lists', () => {
  assert.deepEqual(deliveryManifestNormalizeList([' onepager ', '', 'deck', null, 'deck']), ['deck', 'deck', 'null', 'onepager']);
  assert.deepEqual(deliveryManifestNormalizeList([]), []);
  assert.deepEqual(deliveryManifestNormalizeList(null), []);
});

test('delivery manifest utilities compare arrays and JSON exactly', () => {
  assert.equal(deliveryManifestArraysEqual(['a', 'b'], ['a', 'b']), true);
  assert.equal(deliveryManifestArraysEqual(['b', 'a'], ['a', 'b']), false);
  assert.equal(deliveryManifestArraysEqual(['a'], ['a', 'b']), false);
  assert.equal(deliveryManifestArraysEqual(['a'], 'a'), false);
  assert.equal(deliveryManifestJsonEqual({ matched: true, values: ['deck'] }, { matched: true, values: ['deck'] }), true);
  assert.equal(deliveryManifestJsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), false);
});

test('delivery manifest utilities summarize manifest verification errors', () => {
  assert.equal(deliveryManifestVerificationError({
    manifestErrors: ['missing artifact', ''],
    results: [
      { ok: false, error: 'deck title mismatch' },
      { ok: true, error: 'ignored' },
      { ok: false, error: '' },
    ],
  }, { stderr: 'stderr detail\n' }), [
    'missing artifact',
    'deck title mismatch',
    'stderr detail',
  ].join('\n'));
  assert.equal(deliveryManifestVerificationError(null, { stderr: '' }), '');
});

test('delivery manifest utilities normalize file paths for coverage checks', () => {
  assert.equal(
    deliveryManifestNormalizeFilePath('slide-tool/out/../out/deck.editable.pptx'),
    path.normalize(path.resolve('slide-tool/out/deck.editable.pptx')),
  );
});

test('delivery manifest utilities validate report artifacts uniformly', () => {
  const deck = path.join(os.tmpdir(), `deck-${Date.now()}.pptx`);
  fs.writeFileSync(deck, 'pptx');

  assert.equal(deliveryManifestValidateArtifact('pptx', null), 'pptx artifact is missing from report');
  assert.equal(deliveryManifestValidateArtifact('html', { path: '/tmp/missing.html', exists: false, bytes: 0 }), 'html artifact file is missing: /tmp/missing.html');
  assert.equal(deliveryManifestValidateArtifact('outline', { path: '/tmp/outline.json', exists: true, bytes: 0 }), 'outline artifact file is empty: /tmp/outline.json');
  assert.equal(deliveryManifestValidateArtifact('pptx', { path: deck, exists: true, bytes: 4 }), null);
});

test('delivery manifest utilities read acceptance manifest artifacts and surface parse errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-read-'));
  const manifestPath = path.join(dir, 'acceptance.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [
      { type: 'deck', dir, basename: 'deck' },
      { type: 'onepager', dir, basename: 'summary' },
    ],
  }));

  assert.deepEqual(deliveryManifestReadAcceptanceManifestArtifacts(manifestPath), {
    artifacts: [
      { type: 'deck', dir, basename: 'deck' },
      { type: 'onepager', dir, basename: 'summary' },
    ],
    expectedArtifactPaths: [
      path.join(dir, 'deck.editable.pptx'),
      path.join(dir, 'deck.preview.html'),
      path.join(dir, 'deck.outline.json'),
      path.join(dir, 'deck.image-prompts.md'),
      path.join(dir, 'summary.html'),
      path.join(dir, 'summary.svg'),
    ],
    error: null,
  });

  const unreadable = deliveryManifestReadAcceptanceManifestArtifacts(path.join(dir, 'missing.json'));
  assert.deepEqual(unreadable.artifacts, []);
  assert.deepEqual(unreadable.expectedArtifactPaths, []);
  assert.equal(typeof unreadable.error, 'string');
  assert.match(unreadable.error, /ENOENT/);
});

test('delivery manifest utilities centralize acceptance manifest read errors', () => {
  const manifestPath = '/tmp/out/deck.acceptance.manifest.json';
  assert.deepEqual(deliveryManifestAcceptanceManifestReadErrors(null), [
    'acceptance manifest path is missing',
  ]);
  assert.deepEqual(deliveryManifestAcceptanceManifestReadErrors(manifestPath, { fileError: 'ENOENT' }), [
    `acceptance manifest file is missing: ${manifestPath}`,
  ]);
  assert.deepEqual(deliveryManifestAcceptanceManifestReadErrors(manifestPath, { readError: 'Unexpected token' }), [
    `acceptance manifest is unreadable: ${manifestPath}: Unexpected token`,
  ]);
  assert.deepEqual(deliveryManifestAcceptanceManifestReadErrors(manifestPath), []);
});

test('delivery manifest utilities centralize final delivery manifest read errors', () => {
  const manifestPath = '/tmp/out/delivery-manifest.json';
  assert.deepEqual(deliveryManifestFinalManifestReadErrors(manifestPath, { fileError: 'ENOENT' }), [
    `delivery manifest missing or unreadable: ${manifestPath}`,
  ]);
  assert.deepEqual(deliveryManifestFinalManifestReadErrors(manifestPath, { readError: 'Unexpected token' }), [
    `acceptance manifest is unreadable: ${manifestPath}: Unexpected token`,
  ]);
  assert.deepEqual(deliveryManifestFinalManifestReadErrors(manifestPath), []);
});

test('delivery manifest utilities summarize acceptance manifest verification results', () => {
  assert.deepEqual(deliveryManifestSummarizeAcceptanceManifestVerification({
    status: 0,
    stderr: '',
  }, {
    ok: true,
    checked: 2,
    checkedArtifactTypes: ['deck'],
  }), {
    ok: true,
    status: 0,
    checked: 2,
    checkedArtifactTypes: ['deck'],
    scope: 'manifest-only',
    error: '',
  });

  assert.deepEqual(deliveryManifestSummarizeAcceptanceManifestVerification({
    status: 3,
    stderr: 'stderr detail\n',
  }, {
    ok: false,
    manifestErrors: ['missing manifest'],
    results: [{ ok: false, error: 'bad artifact' }],
  }, 'report-scope'), {
    ok: false,
    status: 3,
    checked: null,
    checkedArtifactTypes: [],
    scope: 'report-scope',
    error: [
      'missing manifest',
      'bad artifact',
      'stderr detail',
    ].join('\n'),
  });
});

test('delivery manifest utilities centralize acceptance verification report errors', () => {
  const summary = {
    checkedArtifacts: {
      checkedArtifacts: {
        count: 3,
        line: 'checked artifacts: 3',
      },
      count: 3,
      line: 'checked artifacts: 3',
    },
    checkedArtifactTypes: { status: 'present', types: ['deck', 'onepager'] },
    acceptanceManifest: { scope: 'report-scope' },
  };

  assert.deepEqual(deliveryManifestAcceptanceVerificationReportErrors(summary, {
    ok: false,
    status: 7,
    checked: 1,
    checkedArtifactTypes: ['deck'],
    scope: 'manifest-only',
    error: 'manifest failed',
  }), [
    'acceptance manifest verification failed: manifest failed',
    'acceptance manifest verification scope mismatch: report report-scope != actual manifest-only',
  ]);

  assert.deepEqual(deliveryManifestAcceptanceVerificationReportErrors(summary, {
    ok: true,
    status: 0,
    checked: 1,
    checkedArtifactTypes: ['deck'],
    scope: 'manifest-only',
    error: '',
  }), [
    'checked artifacts mismatch: report 3 != manifest 1',
    'checked artifact types mismatch: report deck, onepager != manifest deck',
    'acceptance manifest verification scope mismatch: report report-scope != actual manifest-only',
  ]);
});

test('delivery manifest utilities summarize acceptance manifest validation from manifest path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-acceptance-summary-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const pptx = path.join(out, 'deck.editable.pptx');
  const html = path.join(out, 'deck.preview.html');
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  const deliveryMessagePath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Report Status',
    artifactName: 'deck deck',
    artifactType: 'deck',
    artifactDir: out,
    basename: 'deck',
    readyHeader: '納品準備OK: Report Status',
    verificationHeader: '検証: ready for Discord delivery',
    qaLines: [
      'delivery readiness: ready',
      'reasons: none',
      `manifest: ${manifestPath}`,
      'manifest verification scope: manifest-only',
      'checked artifacts: 1',
      'checked artifact types: deck',
      'identity checks: deliveryMessage ready',
      'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      'PPTX images: 0 (none)',
      'PPTX special elements: 0 (none)',
      'PPTX hidden text: 0',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: [pptx, html],
    auditPaths: [manifestPath, deliveryMessagePath],
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [path.join(out, 'delivery-message.md')],
    }],
  }));

  const summary = {
    title: 'Report Status',
    message: 'ready for Discord delivery',
    acceptanceManifest: {
      path: manifestPath,
      exists: true,
      line: `manifest: ${manifestPath}`,
      scopeStatus: 'present',
      scopeLine: 'manifest verification scope: manifest-only',
      scope: 'manifest-only',
      verification: {
        ok: true,
        status: 0,
        checked: 1,
        checkedArtifactTypes: ['deck'],
        scope: 'manifest-only',
        error: '',
      },
    },
    deliveryReadiness: {
      ok: true,
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
      reasons: [],
    },
    acceptanceManifest: {
      path: manifestPath,
      exists: true,
      line: `manifest: ${manifestPath}`,
      scopeStatus: 'present',
      scopeLine: 'manifest verification scope: manifest-only',
      scope: 'manifest-only',
      verification: {
        ok: true,
        status: 0,
        checked: 1,
        checkedArtifactTypes: ['deck'],
        scope: 'manifest-only',
        error: '',
      },
    },
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
    },
    checkedArtifacts: 1,
    checkedArtifactTypes: { status: 'present', types: ['deck'] },
    acceptanceManifest: {
      scope: 'manifest-only',
      line: `manifest: ${manifestPath}`,
      scopeLine: 'manifest verification scope: manifest-only',
      verification: {
        ok: true,
        status: 0,
        checked: 1,
        checkedArtifactTypes: ['deck'],
        scope: 'manifest-only',
        error: '',
      },
    },
    deliveryReadiness: {
      ok: true,
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
      reasons: [],
    },
    visualQa: {
      acceptance: { line: 'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42' },
    },
    pptxInternalQa: {
      acceptance: {
        images: { line: 'PPTX images: 0 (none)' },
        specialElements: { line: 'PPTX special elements: 0 (none)' },
        hiddenText: { line: 'PPTX hidden text: 0' },
      },
    },
    attachments: {
      deliverablePaths: [pptx, html],
      auditPaths: [manifestPath, deliveryMessagePath],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
    },
  };
  const output = deliveryManifestSummarizeAcceptanceManifest(summary, manifestPath, {
    run: { status: 0, stderr: '' },
    parsed: { ok: true, checked: 1, checkedArtifactTypes: ['deck'] },
  });

  assert.deepEqual(output, {
    acceptanceManifest: {
      path: manifestPath,
      exists: true,
      artifacts: [{
        name: 'deck deck',
        type: 'deck',
        dir: out,
        basename: 'deck',
        auditFiles: [path.join(out, 'delivery-message.md')],
      }],
      expectedArtifactPaths: [
        path.join(out, 'deck.editable.pptx'),
        path.join(out, 'deck.preview.html'),
        path.join(out, 'deck.outline.json'),
        path.join(out, 'deck.image-prompts.md'),
      ],
      verification: {
        ok: true,
        status: 0,
        checked: 1,
        checkedArtifactTypes: ['deck'],
        scope: 'manifest-only',
        error: '',
      },
      error: null,
    },
    identityCheck: {
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
    },
    errors: [],
  });
  assert.deepEqual(summary.identityChecks, {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: true, mismatches: [] },
  });

  assert.deepEqual(deliveryManifestSummarizeAcceptanceManifest(summary, null), {
    acceptanceManifest: {
      path: null,
      exists: false,
      artifacts: [],
      expectedArtifactPaths: [],
      verification: null,
      error: null,
    },
    identityCheck: null,
    errors: ['acceptance manifest path is missing'],
  });
});

test('delivery manifest utilities summarize discord report from text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-discord-report-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const pptx = path.join(out, 'deck.editable.pptx');
  const html = path.join(out, 'deck.preview.html');
  const outline = path.join(out, 'deck.outline.json');
  const prompts = path.join(out, 'deck.image-prompts.md');
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  const deliveryMessagePath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');
  fs.writeFileSync(outline, '{}');
  fs.writeFileSync(prompts, '# prompts');
  fs.writeFileSync(deliveryMessagePath, 'delivery message');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Report Status',
    artifactName: 'deck deck',
    artifactType: 'deck',
    artifactDir: out,
    basename: 'deck',
    readyHeader: '納品準備OK: Report Status',
    verificationHeader: '検証: ready for Discord delivery',
    qaLines: [
      'delivery readiness: ready',
      'reasons: none',
      `manifest: ${manifestPath}`,
      'manifest verification scope: manifest-only',
      'checked artifacts: 1',
      'checked artifact types: deck',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
      'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      'PPTX images: 0 (none)',
      'PPTX special elements: 0 (none)',
      'PPTX hidden text: 0',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: [pptx, html],
    auditPaths: [manifestPath, deliveryMessagePath],
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryMessagePath],
    }],
  }, null, 2));

  const text = [
    'この資料「Report Status」は、Discord へ投稿可能です。',
    '生成アーティファクト:',
    `- \`${pptx}\``,
    `- \`${html}\``,
    `- \`${outline}\``,
    `- \`${prompts}\``,
    `- \`${manifestPath}\``,
    '',
    '検証結果:',
    '- status: ready',
    '- ok: true',
    '- delivery readiness: ready',
    '- reasons: none',
    `- manifest: ${manifestPath}`,
    '- manifest verification scope: manifest-only',
    '- checked artifacts: 1',
    '- checked artifact types: deck',
    '- identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    '- visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
    '- PPTX images: 0 (none)',
    '- PPTX special elements: 0 (none)',
    '- PPTX hidden text: 0',
    '',
    '納品前チェック:',
    '- status: ready',
    '- ok: true',
    '- delivery readiness: ready',
    '- reasons: none',
    `- manifest: ${manifestPath}`,
    '- manifest verification scope: manifest-only',
    '- checked artifacts: 1',
    '- checked artifact types: deck',
    '- identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    '- visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
    '- PPTX images: 0 (none)',
    '- PPTX special elements: 0 (none)',
    '- PPTX hidden text: 0',
    '',
    'Artifact:',
    '- name: deck deck',
    '- type: deck',
    `- dir: ${out}`,
    '- basename: deck',
    '',
    '添付ファイル:',
    `- deck.editable.pptx (${pptx})`,
    `- deck.preview.html (${html})`,
    `- deck.outline.json (${outline})`,
    `- deck.image-prompts.md (${prompts})`,
    `- deck.acceptance.manifest.json (${manifestPath})`,
    '',
    '監査ファイル:',
    `- deck.acceptance.manifest.json (${manifestPath})`,
    '',
  ].join('\n');

  const summary = deliveryManifestSummarizeDiscordReport(text, { verification: 'ready', acceptance: 'ready' }, out);
  assert.equal(summary.postable, true);
  assert.equal(summary.title, 'Report Status');
  assert.equal(summary.checkedArtifacts.count, 1);
  assert.equal(summary.artifactsByType.pptx, pptx);
  assert.equal(summary.artifactsByType.html, html);
  assert.equal(summary.artifactsByType.outline, outline);
  assert.equal(summary.artifactsByType.prompts, prompts);
  assert.equal(summary.reportArtifactIdentity.basename, 'deck');
  assert.equal(summary.attachmentPolicy.requiredReady, true);
  assert.equal(summary.acceptanceManifest.path, manifestPath);
  assert.equal(summary.acceptanceManifest.scope, 'manifest-only');
  assert.equal(summary.deliveryReadiness.ok, true);
  assert.equal(summary.deliveryReadiness.line, 'delivery readiness: ready');
  assert.equal(summary.deliveryReadiness.visualQaSource, 'fallback');
  assert.equal(summary.deliveryReadiness.visualQaWidth, 1280);
  assert.equal(summary.deliveryReadiness.visualQaHeight, 900);
  assert.equal(summary.deliveryReadiness.visualQaUniqueSampledColors, 42);
  assert.deepEqual(summary.deliveryReadiness.reasons, []);
  assert.deepEqual(summary.checkedArtifacts, {
    status: 'present',
    count: 1,
    line: 'checked artifacts: 1',
  });
  assert.deepEqual(summary.checkedArtifactTypes.types, ['deck']);
  assert.deepEqual(summary.checkedArtifactTypes.types, ['deck']);
  assert.equal(summary.visualQa.acceptance.line, 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42');
  assert.equal(summary.visualQa.acceptance.source, 'fallback');
  assert.equal(summary.visualQa.acceptance.width, 1280);
  assert.equal(summary.visualQa.acceptance.height, 900);
  assert.equal(summary.visualQa.acceptance.uniqueSampledColors, 42);
  assert.equal(summary.pptxInternalQa.acceptance.hiddenText.line, 'PPTX hidden text: 0');
  assert.deepEqual(summary.attachments.postablePaths, [pptx, html, outline, prompts, manifestPath]);
});

test('delivery manifest utilities centralize discord report summary context', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-discord-report-context-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const pptx = path.join(out, 'deck.editable.pptx');
  const html = path.join(out, 'deck.preview.html');
  const outline = path.join(out, 'deck.outline.json');
  const prompts = path.join(out, 'deck.image-prompts.md');
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  const deliveryMessagePath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');
  fs.writeFileSync(outline, '{}');
  fs.writeFileSync(prompts, '# prompts');
  fs.writeFileSync(deliveryMessagePath, 'delivery message');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Report Status',
    artifactName: 'deck deck',
    artifactType: 'deck',
    artifactDir: out,
    basename: 'deck',
    readyHeader: '納品準備OK: Report Status',
    verificationHeader: '検証: ready for Discord delivery',
    qaLines: [
      'delivery readiness: ready',
      'reasons: none',
      `manifest: ${manifestPath}`,
      'manifest verification scope: manifest-only',
      'checked artifacts: 1',
      'checked artifact types: deck',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
      'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      'PPTX images: 0 (none)',
      'PPTX special elements: 0 (none)',
      'PPTX hidden text: 0',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: [pptx, html],
    auditPaths: [manifestPath, deliveryMessagePath],
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryMessagePath],
    }],
  }, null, 2));

  const text = [
    'この資料「Report Status」は、Discord へ投稿可能です。',
    '生成アーティファクト:',
    `- \`${pptx}\``,
    `- \`${html}\``,
    `- \`${outline}\``,
    `- \`${prompts}\``,
    `- \`${manifestPath}\``,
    '',
    '検証結果:',
    '- status: ready',
    '- ok: true',
    '- delivery readiness: ready',
    '- reasons: none',
    `- manifest: ${manifestPath}`,
    '- manifest verification scope: manifest-only',
    '- checked artifacts: 1',
    '- checked artifact types: deck',
    '- identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    '- visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
    '- PPTX images: 0 (none)',
    '- PPTX special elements: 0 (none)',
    '- PPTX hidden text: 0',
    '',
    '納品前チェック:',
    '- status: ready',
    '- ok: true',
    '- delivery readiness: ready',
    '- reasons: none',
    `- manifest: ${manifestPath}`,
    '- manifest verification scope: manifest-only',
    '- checked artifacts: 1',
    '- checked artifact types: deck',
    '- identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    '- visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
    '- PPTX images: 0 (none)',
    '- PPTX special elements: 0 (none)',
    '- PPTX hidden text: 0',
    '',
    'Artifact:',
    '- name: deck deck',
    '- type: deck',
    `- dir: ${out}`,
    '- basename: deck',
    '',
    '添付ファイル:',
    `- deck.editable.pptx (${pptx})`,
    `- deck.preview.html (${html})`,
    `- deck.outline.json (${outline})`,
    `- deck.image-prompts.md (${prompts})`,
    `- deck.acceptance.manifest.json (${manifestPath})`,
    '',
    '監査ファイル:',
    `- deck.acceptance.manifest.json (${manifestPath})`,
    '',
  ].join('\n');

  const output = deliveryManifestSummarizeDiscordReportContext(text, { verification: 'ready', acceptance: 'ready' }, out);
  const wrapped = deliveryManifestSummarizeDiscordReport(text, { verification: 'ready', acceptance: 'ready' }, out);
  assert.equal(output.postable, true);
  assert.equal(output.title, 'Report Status');
  assert.equal(output.acceptanceManifest.path, manifestPath);
  assert.equal(output.attachments.postablePaths.includes(manifestPath), true);
  assert.deepEqual(output, wrapped);
  assertRootOnlyDiscordReportSummaryBundle(
    output.summary,
    createCanonicalDiscordReportSummaryBundle({
      deliveryReadiness: {
        visualQaUniqueSampledColors: 42,
      },
    }),
  );
});

test('delivery manifest utilities validate discord report summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-discord-report-validation-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const pptx = path.join(out, 'deck.editable.pptx');
  const html = path.join(out, 'deck.preview.html');
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Report Status',
    artifactName: 'deck deck',
    artifactType: 'deck',
    artifactDir: out,
    basename: 'deck',
    readyHeader: '納品準備OK: Report Status',
    verificationHeader: '検証: ready for Discord delivery',
    qaLines: [
      'delivery readiness: ready',
      'reasons: none',
      `manifest: ${manifestPath}`,
      'manifest verification scope: manifest-only',
      'checked artifacts: 1',
      'checked artifact types: deck',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
      'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      'PPTX images: 0 (none)',
      'PPTX special elements: 0 (none)',
      'PPTX hidden text: 0',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: [pptx, html],
    auditPaths: [manifestPath],
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [manifestPath],
    }],
  }, null, 2));

  const summary = {
    title: 'Report Status',
    message: 'ready for Discord delivery',
    acceptanceManifest: {
      path: manifestPath,
      exists: true,
      line: `manifest: ${manifestPath}`,
      scopeStatus: 'present',
      scopeLine: 'manifest verification scope: manifest-only',
      scope: 'manifest-only',
      verification: {
        ok: true,
        status: 0,
        checked: 1,
        checkedArtifactTypes: ['deck'],
        scope: 'manifest-only',
        error: '',
      },
    },
    deliveryReadiness: {
      ok: true,
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
      reasons: [],
    },
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
    },
    checkedArtifacts: 1,
    checkedArtifactTypes: {
      status: 'present',
      types: ['deck'],
      line: 'checked artifact types: deck',
    },
    attachments: {
      deliverablePaths: [pptx, html],
      auditPaths: [manifestPath],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
    },
    visualQa: {
      acceptance: {
        line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
        source: 'fallback',
        width: 1280,
        height: 900,
        uniqueSampledColors: 42,
      },
    },
    pptxInternalQa: {
      acceptance: {
        images: { line: 'PPTX images: 0 (none)' },
        specialElements: { line: 'PPTX special elements: 0 (none)' },
        hiddenText: { line: 'PPTX hidden text: 0' },
      },
    },
  };
  const output = deliveryManifestValidateDiscordReport(summary, {
    verification: 'ready',
    acceptance: 'ready',
  }, []);
  assert.deepEqual(output.errors, []);
  assert.deepEqual(output.warnings, []);
});

test('delivery manifest utilities centralize discord report section status errors', () => {
  assert.deepEqual(deliveryManifestDiscordReportSectionStatusErrors({
    verification: 'blocked',
    acceptance: 'draft',
  }), [
    'verification status is blocked',
    'acceptance status is unsupported: draft',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportSectionStatusErrors({
    verification: 'ready',
    acceptance: 'ready',
  }), []);

  assert.deepEqual(deliveryManifestDiscordReportSectionStatusErrors({}), [
    '検証結果 section is missing status',
    '納品前チェック section is missing status',
  ]);
});

test('delivery manifest utilities centralize discord report media QA errors', () => {
  const sections = { verification: 'ready', acceptance: 'ready' };
  assert.deepEqual(deliveryManifestDiscordReportMediaQaErrors({
    visualQa: {
      verification: { status: 'blocked' },
      acceptance: { status: 'missing' },
    },
    pptxInternalQa: {
      verification: {
        images: { status: 'present', count: 2 },
        specialElements: { status: 'present', count: 1 },
        hiddenText: { status: 'present', count: 3 },
      },
      acceptance: {
        images: { status: 'missing', count: 0 },
        specialElements: { status: 'missing', count: 0 },
        hiddenText: { status: 'missing', count: 0 },
      },
    },
  }, sections), [
    'verification visual QA status is blocked',
    'acceptance visual QA status is missing',
    'verification PPTX images count is nonzero: 2',
    'verification PPTX special elements count is nonzero: 1',
    'verification PPTX hidden text count is nonzero: 3',
    'acceptance PPTX images status is missing',
    'acceptance PPTX special elements status is missing',
    'acceptance PPTX hidden text status is missing',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportMediaQaErrors({
    visualQa: {
      acceptance: { status: 'present' },
    },
    pptxInternalQa: {
      acceptance: {
        images: { status: 'present', count: 0 },
        specialElements: { status: 'present', count: 0 },
        hiddenText: { status: 'present', count: 0 },
      },
    },
  }, { acceptance: 'ready' }), []);
});

test('delivery manifest utilities centralize discord report acceptance gate errors', () => {
  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({
    deliveryReadiness: { status: 'missing', reasonsLine: null },
    checkedArtifacts: null,
    checkedArtifactTypes: { status: 'missing' },
    acceptanceManifest: { scopeStatus: 'missing' },
  }, { acceptance: 'ready' }), [
    'acceptance delivery readiness status is missing',
    'acceptance checked artifacts count is missing',
    'acceptance checked artifact types are missing',
    'acceptance manifest verification scope is missing',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({
    deliveryReadiness: { status: 'ready', reasonsLine: 'reasons: none' },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    checkedArtifactTypes: { status: 'present' },
    acceptanceManifest: { scopeStatus: 'present' },
  }, { acceptance: 'ready' }), [
    'acceptance checked artifact types are missing',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({
    deliveryReadiness: {
      deliveryReadiness: {
        ok: false,
        reasonsLine: 'reasons: verification not ready',
        reasons: ['verification not ready'],
      },
    },
    checkedArtifacts: 1,
    checkedArtifactTypes: { status: 'present', types: ['deck'], line: 'checked artifact types: deck' },
    acceptanceManifest: { scopeStatus: 'present' },
  }, { acceptance: 'ready' }), [
    'acceptance delivery readiness is blocked',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({
    deliveryReadiness: {
      ok: false,
      reasonsLine: 'reasons: verification not ready',
      reasons: ['verification not ready'],
      line: 'delivery readiness: blocked',
    },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    checkedArtifactTypes: { status: 'present', types: ['deck'], line: 'checked artifact types: deck' },
    acceptanceManifest: { scopeStatus: 'present' },
  }, { acceptance: 'ready' }), [
      'acceptance delivery readiness is blocked',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({
    deliveryReadiness: {
      deliveryReadiness: {
        ok: true,
        reasonsLine: 'reasons: none',
        reasons: [],
      },
    },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    checkedArtifactTypes: {
      checkedArtifactTypes: {
        types: ['deck'],
        line: 'checked artifact types: deck',
      },
    },
    acceptanceManifest: { scopeStatus: 'present' },
  }, { acceptance: 'ready' }), [
    'acceptance delivery readiness is blocked',
    'acceptance checked artifact types are missing',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({
    deliveryReadiness: {
      status: 'ready',
      ok: true,
      reasonsLine: 'reasons: none',
      reasons: [],
    },
    checkedArtifacts: {
      checkedArtifacts: {
        count: 1,
        line: 'checked artifacts: 1',
      },
    },
    checkedArtifactTypes: { status: 'present', types: ['deck'], line: 'checked artifact types: deck' },
    acceptanceManifest: { scopeStatus: 'present' },
  }, { acceptance: 'ready' }), [
    'acceptance checked artifacts count is missing',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({
    deliveryReadiness: {
      deliveryReadiness: {
        ok: true,
        reasonsLine: 'reasons: none',
        reasons: [],
      },
    },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    checkedArtifactTypes: { status: 'present', types: [] },
    acceptanceManifest: { scopeStatus: 'present' },
  }, { acceptance: 'ready' }), [
    'acceptance delivery readiness is blocked',
    'acceptance checked artifact types are missing',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({
    deliveryReadiness: {
      deliveryReadiness: {
        ok: true,
        reasonsLine: 'reasons: none',
        reasons: [],
      },
    },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    checkedArtifactTypes: { status: 'present', types: [] },
    acceptanceManifest: { scopeStatus: 'present' },
  }, { acceptance: 'ready' }), [
    'acceptance delivery readiness is blocked',
    'acceptance checked artifact types are missing',
  ]);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceGateErrors({}, { acceptance: 'blocked' }), []);
});

test('delivery manifest utilities centralize discord report attachment validation', () => {
  assert.deepEqual(deliveryManifestDiscordReportAttachmentValidation({
    attachmentPolicy: {
      required: ['pptx', 'html'],
      optional: ['svg'],
      requiredReady: false,
    },
    artifactDetails: {
      pptx: { path: '/tmp/deck.pptx', exists: false, bytes: 0 },
      html: { path: '/tmp/deck.html', exists: true, bytes: 4 },
      svg: { path: '/tmp/deck.svg', exists: true, bytes: 0 },
    },
  }), {
    errors: [
      'pptx artifact file is missing: /tmp/deck.pptx',
      'required attachments are not ready: pptx, html',
    ],
    warnings: [
      'optional svg artifact file is empty: /tmp/deck.svg',
    ],
  });

  assert.deepEqual(deliveryManifestDiscordReportAttachmentValidation({
    attachmentPolicy: {
      required: ['pptx'],
      optional: [],
      requiredReady: true,
    },
    artifactDetails: {
      pptx: { path: '/tmp/deck.pptx', exists: true, bytes: 4 },
    },
  }), { errors: [], warnings: [] });

  assert.deepEqual(deliveryManifestDiscordReportAttachmentValidation({}), { errors: [], warnings: [] });
});

test('delivery manifest utilities centralize discord report base validation pipeline', () => {
  assert.deepEqual(deliveryManifestDiscordReportBaseValidation({
    attachmentPolicy: {
      required: ['pptx'],
      optional: ['svg'],
      requiredReady: false,
    },
    artifactDetails: {
      pptx: { path: '/tmp/deck.pptx', exists: false, bytes: 0 },
      svg: { path: '/tmp/deck.svg', exists: true, bytes: 0 },
    },
    visualQa: {
      acceptance: { status: 'missing' },
    },
    pptxInternalQa: {
      acceptance: {
        images: { status: 'missing', count: 0 },
        specialElements: { status: 'missing', count: 0 },
        hiddenText: { status: 'missing', count: 0 },
      },
    },
  }, { verification: 'blocked', acceptance: 'ready' }, ['cli error']), {
    errors: [
      'cli error',
      'verification status is blocked',
      'pptx artifact file is missing: /tmp/deck.pptx',
      'required attachments are not ready: pptx',
      'acceptance visual QA status is missing',
      'acceptance PPTX images status is missing',
      'acceptance PPTX special elements status is missing',
      'acceptance PPTX hidden text status is missing',
    ],
    warnings: [
      'optional svg artifact file is empty: /tmp/deck.svg',
    ],
  });

  assert.deepEqual(deliveryManifestDiscordReportBaseValidation({}, {}, []), {
    errors: [
      '検証結果 section is missing status',
      '納品前チェック section is missing status',
    ],
    warnings: [],
  });
});

test('delivery manifest utilities centralize discord report base validation context', () => {
  const output = deliveryManifestDiscordReportBaseValidationContext({
    attachmentPolicy: {
      required: ['pptx'],
      optional: ['svg'],
      requiredReady: false,
    },
    artifactDetails: {
      pptx: { path: '/tmp/deck.pptx', exists: false, bytes: 0 },
      svg: { path: '/tmp/deck.svg', exists: true, bytes: 0 },
    },
    visualQa: {
      acceptance: { status: 'missing' },
    },
    pptxInternalQa: {
      acceptance: {
        images: { status: 'missing', count: 0 },
        specialElements: { status: 'missing', count: 0 },
        hiddenText: { status: 'missing', count: 0 },
      },
    },
  }, { verification: 'blocked', acceptance: 'ready' }, ['cli error']);

  assert.deepEqual(output.sectionStatusErrors, ['verification status is blocked']);
  assert.equal(output.attachmentValidation.errors[0], 'pptx artifact file is missing: /tmp/deck.pptx');
  assert.equal(output.attachmentValidation.warnings[0], 'optional svg artifact file is empty: /tmp/deck.svg');
  assert.equal(output.mediaQaErrors[0], 'acceptance visual QA status is missing');
  assert.deepEqual(output.errors, [
    'cli error',
    'verification status is blocked',
    'pptx artifact file is missing: /tmp/deck.pptx',
    'required attachments are not ready: pptx',
    'acceptance visual QA status is missing',
    'acceptance PPTX images status is missing',
    'acceptance PPTX special elements status is missing',
    'acceptance PPTX hidden text status is missing',
  ]);
  assert.deepEqual(output.warnings, [
    'optional svg artifact file is empty: /tmp/deck.svg',
  ]);
});

test('delivery manifest utilities centralize discord report acceptance validation', () => {
  const summary = {
    deliveryReadiness: { status: 'missing', reasonsLine: null },
    checkedArtifacts: null,
    checkedArtifactTypes: { status: 'missing' },
    acceptanceManifest: { scopeStatus: 'missing' },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };
  const applied = deliveryManifestDiscordReportAcceptanceValidation(summary, { acceptance: 'ready' }, ['preflight error']);
  assert.deepEqual(applied.errors, [
    'preflight error',
    'acceptance delivery readiness status is missing',
    'acceptance checked artifacts count is missing',
    'acceptance checked artifact types are missing',
    'acceptance manifest verification scope is missing',
    'acceptance manifest path is missing',
  ]);
  assert.equal(applied.summary.acceptanceManifest.exists, false);
  applied.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceValidation(summary, { acceptance: 'blocked' }, ['preflight error']), {
    summary,
    errors: ['preflight error'],
  });
});

test('delivery manifest utilities centralize discord report acceptance validation context', () => {
  const summary = {
    deliveryReadiness: { status: 'missing', reasonsLine: null },
    checkedArtifacts: null,
    checkedArtifactTypes: { status: 'missing' },
    acceptanceManifest: { scopeStatus: 'missing' },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };

  const output = deliveryManifestDiscordReportAcceptanceValidationContext(summary, { acceptance: 'ready' }, ['preflight error']);
  assert.deepEqual(output.errors, [
    'preflight error',
    'acceptance delivery readiness status is missing',
    'acceptance checked artifacts count is missing',
    'acceptance checked artifact types are missing',
    'acceptance manifest verification scope is missing',
    'acceptance manifest path is missing',
  ]);
  assert.equal(output.summary.acceptanceManifest.exists, false);
  output.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);

  assert.deepEqual(deliveryManifestDiscordReportAcceptanceValidationContext(summary, { acceptance: 'blocked' }, ['preflight error']), {
    summary,
    errors: ['preflight error'],
  });
});

test('delivery manifest utilities centralize discord report validation summary', () => {
  const summary = {
    attachmentPolicy: {
      required: ['pptx'],
      optional: ['svg'],
      requiredReady: false,
    },
    artifactDetails: {
      pptx: { path: '/tmp/deck.pptx', exists: false, bytes: 0 },
      svg: { path: '/tmp/deck.svg', exists: true, bytes: 0 },
    },
    deliveryReadiness: { status: 'missing', reasonsLine: null },
    checkedArtifacts: null,
    checkedArtifactTypes: { status: 'missing' },
    acceptanceManifest: { scopeStatus: 'missing' },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };

  const output = deliveryManifestDiscordReportValidationSummary(summary, { verification: 'ready', acceptance: 'ready' }, ['cli error']);
  assert.deepEqual(output.errors, [
    'cli error',
    'pptx artifact file is missing: /tmp/deck.pptx',
    'required attachments are not ready: pptx',
    'acceptance delivery readiness status is missing',
    'acceptance checked artifacts count is missing',
    'acceptance checked artifact types are missing',
    'acceptance manifest verification scope is missing',
    'acceptance manifest path is missing',
  ]);
  assert.deepEqual(output.warnings, [
    'optional svg artifact file is empty: /tmp/deck.svg',
  ]);
  assert.equal(output.summary.acceptanceManifest.exists, false);
  output.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities centralize discord report validation context', () => {
  const summary = {
    attachmentPolicy: {
      required: ['pptx'],
      optional: ['svg'],
      requiredReady: false,
    },
    artifactDetails: {
      pptx: { path: '/tmp/deck.pptx', exists: false, bytes: 0 },
      svg: { path: '/tmp/deck.svg', exists: true, bytes: 0 },
    },
    deliveryReadiness: { status: 'missing', reasonsLine: null },
    checkedArtifacts: null,
    checkedArtifactTypes: { status: 'missing' },
    acceptanceManifest: { scopeStatus: 'missing' },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };

  const output = deliveryManifestDiscordReportValidationContext(summary, { verification: 'ready', acceptance: 'ready' }, ['cli error']);
  assert.deepEqual(output.errors, [
    'cli error',
    'pptx artifact file is missing: /tmp/deck.pptx',
    'required attachments are not ready: pptx',
    'acceptance delivery readiness status is missing',
    'acceptance checked artifacts count is missing',
    'acceptance checked artifact types are missing',
    'acceptance manifest verification scope is missing',
    'acceptance manifest path is missing',
  ]);
  assert.deepEqual(output.warnings, [
    'optional svg artifact file is empty: /tmp/deck.svg',
  ]);
  assert.equal(output.summary.acceptanceManifest.exists, false);
  output.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities apply discord report acceptance manifest without mutating summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-apply-acceptance-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const pptx = path.join(out, 'deck.editable.pptx');
  const html = path.join(out, 'deck.preview.html');
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Report Status',
    artifactName: 'deck deck',
    artifactType: 'deck',
    artifactDir: out,
    basename: 'deck',
    readyHeader: '納品準備OK: Report Status',
    verificationHeader: '検証: ready for Discord delivery',
    qaLines: [
      'delivery readiness: ready',
      'reasons: none',
      `manifest: ${manifestPath}`,
      'manifest verification scope: manifest-only',
      'checked artifacts: 1',
      'checked artifact types: deck',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
      'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      'PPTX images: 0 (none)',
      'PPTX special elements: 0 (none)',
      'PPTX hidden text: 0',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: [pptx, html],
    auditPaths: [manifestPath],
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [manifestPath],
    }],
  }, null, 2));

  const summary = {
    title: 'Report Status',
    acceptanceManifest: {
      path: manifestPath,
      scopeStatus: 'present',
    },
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
    },
      checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    checkedArtifactTypes: {
      status: 'present',
      types: ['deck'],
      line: 'checked artifact types: deck',
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
    },
  };

  const applied = deliveryManifestApplyDiscordReportAcceptanceManifest(summary, manifestPath, ['preflight error']);
  assert.equal(applied.summary.acceptanceManifest.exists, true);
  assert.equal(applied.summary.acceptanceManifest.artifacts.length, 1);
  assert.deepEqual(applied.summary.identityChecks.report.mismatches, []);
  assert.deepEqual(applied.errors, ['preflight error']);
  applied.summary.acceptanceManifest.artifacts[0].basename = 'mutated';
  applied.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.acceptanceManifest, {
    path: manifestPath,
    scopeStatus: 'present',
  });
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities finalize discord report status from validation errors', () => {
  const readySummary = {
    postable: true,
    message: '投稿OK: Report Status / slides 1 / acceptance ready',
    title: 'Report Status',
    visualQa: {
      acceptance: {
        source: 'fallback',
        width: 1280,
        height: 900,
        uniqueSampledColors: 42,
      },
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };
  assert.deepEqual(deliveryManifestFinalizeDiscordReport(readySummary, []), readySummary);

  const blockedSummary = deliveryManifestFinalizeDiscordReport(readySummary, [
    'verification status is blocked',
    'acceptance status is blocked',
  ]);
  assert.equal(blockedSummary.postable, false);
  assert.equal(blockedSummary.message, '投稿不可: verification status is blocked');
  assert.equal(blockedSummary.title, 'Report Status');
  blockedSummary.visualQa.acceptance.width = 640;
  blockedSummary.identityChecks.report.mismatches.push('mutated');
  assert.equal(readySummary.postable, true);
  assert.equal(readySummary.message, '投稿OK: Report Status / slides 1 / acceptance ready');
  assert.equal(readySummary.visualQa.acceptance.width, 1280);
  assert.deepEqual(readySummary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities centralize discord report finalization context', () => {
  const readySummary = {
    postable: true,
    message: '投稿OK: Report Status / slides 1 / acceptance ready',
    title: 'Report Status',
    visualQa: {
      acceptance: {
        source: 'fallback',
        width: 1280,
        height: 900,
        uniqueSampledColors: 42,
      },
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };

  const output = deliveryManifestFinalizeDiscordReportContext(readySummary, ['verification status is blocked']);
  assert.equal(output.postable, false);
  assert.equal(output.message, '投稿不可: verification status is blocked');
  assert.notStrictEqual(output, readySummary);
  assert.notStrictEqual(output.visualQa, readySummary.visualQa);
  assert.notStrictEqual(output.identityChecks, readySummary.identityChecks);
  assert.equal(deliveryManifestFinalizeDiscordReportContext(null, []), null);
});

test('delivery manifest utilities merge discord report validation results by kind', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/delivery-message.md'],
      auditPaths: ['/tmp/delivery-manifest.json'],
    },
  };
  const deliveryMessage = {
    deliveryMessage: { path: '/tmp/delivery-message.md', exists: true },
    identityCheck: { matched: true, mismatches: [] },
    errors: ['delivery message missing attachment section'],
  };
  const acceptanceManifest = {
    deliveryManifest: { path: '/tmp/deck.acceptance.manifest.json', exists: true },
    identityCheck: { matched: false, mismatches: ['basename mismatch'] },
    errors: ['delivery manifest basename mismatch'],
  };

  const mergedMessage = deliveryManifestMergeDiscordReportValidation(summary, deliveryMessage, 'deliveryMessage');
  assert.equal(mergedMessage.summary.deliveryMessage.path, '/tmp/delivery-message.md');
  assert.equal(mergedMessage.summary.identityChecks.deliveryMessage.matched, true);
  assert.deepEqual(mergedMessage.errors, ['delivery message missing attachment section']);
  assert.equal(summary.identityChecks.deliveryMessage, undefined);

  const mergedManifest = deliveryManifestMergeDiscordReportValidation(mergedMessage.summary, acceptanceManifest, 'deliveryManifest');
  assert.equal(mergedManifest.summary.deliveryManifest.path, '/tmp/deck.acceptance.manifest.json');
  assert.equal(mergedManifest.summary.identityChecks.deliveryManifest.matched, false);
  assert.deepEqual(mergedManifest.errors, ['delivery manifest basename mismatch']);
  assert.equal(summary.identityChecks.report.matched, true);
});

test('delivery manifest utilities centralize discord report validation merge context', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/delivery-message.md'],
      auditPaths: ['/tmp/delivery-manifest.json'],
    },
  };
  const validationResult = {
    deliveryMessage: { path: '/tmp/delivery-message.md', exists: true },
    identityCheck: { matched: true, mismatches: [] },
    errors: ['delivery message missing attachment section'],
  };

  const output = deliveryManifestMergeDiscordReportValidationContext(summary, validationResult, 'deliveryMessage');
  assert.equal(output.summary.deliveryMessage.path, '/tmp/delivery-message.md');
  assert.equal(output.summary.identityChecks.deliveryMessage.matched, true);
  assert.deepEqual(output.errors, ['delivery message missing attachment section']);
  assert.notStrictEqual(output.summary, summary);
  assert.notStrictEqual(output.summary.identityChecks, summary.identityChecks);
});

test('delivery manifest utilities merge identity checks without mutating the original summary', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/deck.pptx'],
    },
  };

  const merged = deliveryManifestMergeIdentityCheck(summary, 'deliveryMessage', { matched: true, mismatches: [] });
  assert.notStrictEqual(merged, summary);
  assert.notStrictEqual(merged.identityChecks, summary.identityChecks);
  assert.deepEqual(merged.identityChecks, {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: true, mismatches: [] },
  });
  assert.deepEqual(summary.identityChecks, {
    report: { matched: true, mismatches: [] },
  });
  assert.deepEqual(summary.attachments, {
    deliverablePaths: ['/tmp/deck.pptx'],
  });
  assert.equal(deliveryManifestMergeIdentityCheck(null, 'report', { matched: true, mismatches: [] }), null);
  assert.equal(deliveryManifestMergeIdentityCheck(summary, 'report', null), summary);
});

test('delivery manifest utilities centralize identity check merge context', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/deck.pptx'],
    },
  };

  const output = deliveryManifestMergeIdentityCheckContext(summary, 'deliveryMessage', { matched: true, mismatches: [] });
  assert.notStrictEqual(output.summary, summary);
  assert.notStrictEqual(output.summary.identityChecks, summary.identityChecks);
  assert.deepEqual(output.summary.identityChecks, {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: true, mismatches: [] },
  });
  assert.deepEqual(summary.identityChecks, {
    report: { matched: true, mismatches: [] },
  });
  assert.equal(deliveryManifestMergeIdentityCheckContext(null, 'report', { matched: true, mismatches: [] }).summary, null);
  assert.equal(deliveryManifestMergeIdentityCheckContext(summary, 'report', null).summary, summary);
});

test('delivery manifest utilities apply discord report validation without mutating the original summary', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/delivery-message.md'],
      auditPaths: ['/tmp/delivery-manifest.json'],
    },
  };
  const validationResult = {
    deliveryMessage: {
      path: '/tmp/delivery-message.md',
      exists: true,
    },
    identityCheck: { matched: true, mismatches: [] },
    errors: ['delivery message missing attachment section'],
  };

  const applied = deliveryManifestApplyDiscordReportValidation(summary, validationResult, 'deliveryMessage');
  assert.notStrictEqual(applied.summary, summary);
  assert.notStrictEqual(applied.summary.identityChecks, summary.identityChecks);
  assert.notStrictEqual(applied.summary.attachments, summary.attachments);
  assert.equal(applied.summary.deliveryMessage.path, '/tmp/delivery-message.md');
  assert.equal(applied.summary.identityChecks.report.matched, true);
  assert.equal(applied.summary.identityChecks.deliveryMessage.matched, true);
  applied.summary.attachments.deliverablePaths.push('/tmp/extra.pptx');
  applied.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(applied.errors, ['delivery message missing attachment section']);
  assert.equal(summary.deliveryMessage, undefined);
  assert.equal(summary.identityChecks.deliveryMessage, undefined);
  assert.deepEqual(summary.attachments, {
    deliverablePaths: ['/tmp/delivery-message.md'],
    auditPaths: ['/tmp/delivery-manifest.json'],
  });
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities apply discord report validations in order without mutating the original summary', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/delivery-message.md'],
      auditPaths: ['/tmp/delivery-manifest.json'],
    },
  };
  const validationResults = [
    {
      kind: 'deliveryMessage',
      validationResult: {
        deliveryMessage: {
          path: '/tmp/delivery-message.md',
          exists: true,
        },
        identityCheck: { matched: true, mismatches: [] },
        errors: ['delivery message missing attachment section'],
      },
    },
    {
      kind: 'deliveryManifest',
      validationResult: {
        deliveryManifest: {
          path: '/tmp/delivery-manifest.json',
          exists: true,
        },
        identityCheck: { matched: false, mismatches: ['basename mismatch'] },
        errors: ['delivery manifest basename mismatch'],
      },
    },
  ];

  const applied = deliveryManifestApplyDiscordReportValidations(summary, validationResults, ['cli error']);
  assert.notStrictEqual(applied.summary, summary);
  assert.notStrictEqual(applied.summary.identityChecks, summary.identityChecks);
  assert.equal(applied.summary.deliveryMessage.path, '/tmp/delivery-message.md');
  assert.equal(applied.summary.deliveryManifest.path, '/tmp/delivery-manifest.json');
  assert.deepEqual(applied.summary.identityChecks.deliveryMessage, { matched: true, mismatches: [] });
  assert.deepEqual(applied.summary.identityChecks.deliveryManifest, { matched: false, mismatches: ['basename mismatch'] });
  assert.deepEqual(applied.errors, [
    'cli error',
    'delivery message missing attachment section',
    'delivery manifest basename mismatch',
  ]);
  applied.summary.identityChecks.deliveryMessage.mismatches.push('mutated');
  applied.summary.deliveryMessage.path = '/tmp/changed.md';
  assert.deepEqual(summary.identityChecks, {
    report: { matched: true, mismatches: [] },
  });
  assert.deepEqual(summary.attachments, {
    deliverablePaths: ['/tmp/delivery-message.md'],
    auditPaths: ['/tmp/delivery-manifest.json'],
  });
  assert.equal(deliveryManifestApplyDiscordReportValidations(null, validationResults, ['cli error']).summary, null);
  assert.deepEqual(deliveryManifestApplyDiscordReportValidations(summary, [], ['cli error']).errors, ['cli error']);
});

test('delivery manifest utilities centralize discord report validation application context', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/delivery-message.md'],
      auditPaths: ['/tmp/delivery-manifest.json'],
    },
  };
  const validationResults = [
    {
      kind: 'deliveryMessage',
      validationResult: {
        deliveryMessage: {
          path: '/tmp/delivery-message.md',
          exists: true,
        },
        identityCheck: { matched: true, mismatches: [] },
        errors: ['delivery message missing attachment section'],
      },
    },
    {
      kind: 'deliveryManifest',
      validationResult: {
        deliveryManifest: {
          path: '/tmp/delivery-manifest.json',
          exists: true,
        },
        identityCheck: { matched: false, mismatches: ['basename mismatch'] },
        errors: ['delivery manifest basename mismatch'],
      },
    },
  ];

  const output = deliveryManifestApplyDiscordReportValidationsContext(summary, validationResults, ['cli error']);
  assert.deepEqual(output.validationResults.map((item) => item.kind), ['deliveryMessage', 'deliveryManifest']);
  assert.equal(output.summary.deliveryMessage.path, '/tmp/delivery-message.md');
  assert.equal(output.summary.deliveryManifest.path, '/tmp/delivery-manifest.json');
  assert.deepEqual(output.errors, [
    'cli error',
    'delivery message missing attachment section',
    'delivery manifest basename mismatch',
  ]);
  assert.notStrictEqual(output.summary, summary);
  assert.notStrictEqual(output.summary.identityChecks, summary.identityChecks);
});

test('delivery manifest utilities collect discord report validations with acceptance manifest before delivery message', () => {
  const summary = {
    title: 'Report Status',
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: '/tmp/out',
      basename: 'deck',
    },
  };
  const cli = {
    deliveryMessagePath: '/tmp/out/delivery-message.md',
    deliveryManifestPath: '/tmp/out/deck.acceptance.manifest.json',
  };

  const collected = deliveryManifestCollectDiscordReportValidations(summary, cli);
  assert.deepEqual(collected.map((item) => item.kind), ['deliveryManifest', 'deliveryMessage']);
  assert.equal(collected[0].validationResult.deliveryManifest.path, '/tmp/out/deck.acceptance.manifest.json');
  assert.equal(collected[1].validationResult.deliveryMessage.path, '/tmp/out/delivery-message.md');
  assert.deepEqual(
    deliveryManifestCollectDiscordReportValidations(summary, cli, {
      order: ['deliveryMessage', 'deliveryManifest'],
    }).map((item) => item.kind),
    ['deliveryMessage', 'deliveryManifest'],
  );
  assert.deepEqual(
    deliveryManifestCollectDiscordReportValidations(summary, cli, {
      order: ['unknown', 'deliveryMessage'],
    }).map((item) => item.kind),
    ['deliveryMessage'],
  );
  assert.equal(deliveryManifestCollectDiscordReportValidations(summary, { deliveryMessagePath: cli.deliveryMessagePath }).length, 1);
  assert.equal(deliveryManifestCollectDiscordReportValidations(summary, { deliveryManifestPath: cli.deliveryManifestPath }).length, 1);
  assert.equal(deliveryManifestBuildDiscordReportValidation(summary, cli, 'deliveryMessage').kind, 'deliveryMessage');
  assert.equal(deliveryManifestBuildDiscordReportValidation(summary, cli, 'deliveryManifest').kind, 'deliveryManifest');
  assert.equal(deliveryManifestBuildDiscordReportValidation(summary, cli, 'unknown'), null);
});

test('delivery manifest utilities centralize discord report validation collection context', () => {
  const summary = {
    title: 'Report Status',
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: '/tmp/out',
      basename: 'deck',
    },
  };
  const cli = {
    deliveryMessagePath: '/tmp/out/delivery-message.md',
    deliveryManifestPath: '/tmp/out/deck.acceptance.manifest.json',
  };

  const output = deliveryManifestCollectDiscordReportValidationsContext(summary, cli);
  assert.deepEqual(output.validationResults.map((item) => item.kind), ['deliveryManifest', 'deliveryMessage']);
  assert.equal(output.validationResults[0].validationResult.deliveryManifest.path, cli.deliveryManifestPath);
  assert.equal(output.validationResults[1].validationResult.deliveryMessage.path, cli.deliveryMessagePath);

  const reordered = deliveryManifestCollectDiscordReportValidationsContext(summary, cli, {
    order: ['deliveryMessage', 'deliveryManifest'],
  });
  assert.deepEqual(reordered.validationResults.map((item) => item.kind), ['deliveryMessage', 'deliveryManifest']);
});

test('delivery manifest utilities validate discord report validations in dependency-safe order without mutating the original summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-validate-discord-report-validations-test-'));
  const out = path.join(dir, 'out');
  const deliveryMessagePath = path.join(out, 'delivery-message.md');
  const deliveryManifestPath = path.join(out, 'deck.acceptance.manifest.json');
  const pptx = path.join(out, 'deck.editable.pptx');
  const html = path.join(out, 'deck.preview.html');
  const outline = path.join(out, 'deck.outline.json');
  const prompts = path.join(out, 'deck.image-prompts.md');
  fs.mkdirSync(out, { recursive: true });
  for (const filePath of [deliveryMessagePath, deliveryManifestPath, pptx, html, outline, prompts]) {
    fs.writeFileSync(filePath, 'fixture');
  }
  const reportText = [
    'この資料「Report Status」を納品します。',
    '',
    '生成アーティファクト:',
    `- \`${pptx}\``,
    `- \`${html}\``,
    `- \`${outline}\``,
    `- \`${prompts}\``,
    '',
    '検証結果:',
    '- status: ready',
    '- ok: true',
    '- delivery readiness: ready',
    '- reasons: none',
    `- manifest: ${deliveryManifestPath}`,
    '- manifest verification scope: manifest-only',
    '- checked artifacts: 1',
    '- checked artifact types: deck',
    '- identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    '- visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 4',
    '- PPTX images: 0 (none)',
    '- PPTX special elements: 0 (none)',
    '- PPTX hidden text: 0',
    '',
    '納品前チェック:',
    '- status: ready',
    '- ok: true',
    '- delivery readiness: ready',
    '- reasons: none',
    `- manifest: ${deliveryManifestPath}`,
    '- manifest verification scope: manifest-only',
    '- checked artifacts: 1',
    '- checked artifact types: deck',
    '- identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    '- visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 4',
    '- PPTX images: 0 (none)',
    '- PPTX special elements: 0 (none)',
    '- PPTX hidden text: 0',
    '',
    'Artifact:',
    '- name: deck deck',
    '- type: deck',
    `- dir: ${out}`,
    '- basename: deck',
    '',
    '添付ファイル:',
    `- deck.editable.pptx (${pptx})`,
    `- deck.preview.html (${html})`,
    `- deck.outline.json (${outline})`,
    `- deck.image-prompts.md (${prompts})`,
    `- deck.acceptance.manifest.json (${deliveryManifestPath})`,
    '',
    '監査ファイル:',
    `- deck.acceptance.manifest.json (${deliveryManifestPath})`,
    '',
  ].join('\n');
  const summary = deliveryManifestSummarizeDiscordReport(reportText, {
    verification: 'ready',
    acceptance: 'ready',
  }, out);
  summary.identityChecks ||= {};
  summary.identityChecks.report ||= { matched: true, mismatches: [] };
  summary.acceptanceManifest = {
    ...summary.acceptanceManifest,
    artifacts: [
      {
        ...summary.reportArtifactIdentity,
        auditFiles: [deliveryMessagePath],
      },
    ],
    expectedArtifactPaths: [pptx, html, outline, prompts, deliveryManifestPath],
  };
  summary.attachments = {
    ...summary.attachments,
    deliverablePaths: [pptx, html, outline, prompts],
    auditPaths: [deliveryManifestPath],
    postablePaths: [pptx, html, outline, prompts, deliveryManifestPath],
  };
  summary.checkedArtifacts = {
    count: 1,
    line: 'checked artifacts: 1',
  };
  summary.checkedArtifactTypes = {
    status: 'present',
    types: ['deck'],
    line: 'checked artifact types: deck',
  };
  const deliveryMessageSummary = deliveryManifestMergeIdentityCheck(
    summary,
    'deliveryMessage',
    { matched: true, mismatches: [] },
  );
  const manifestIdentityChecks = {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: true, mismatches: [] },
    deliveryManifest: { matched: true, mismatches: [] },
  };
  const manifestJson = {
    schemaVersion: 1,
    title: 'Report Status',
    artifactName: deliveryMessageSummary.reportArtifactIdentity.name,
    artifactType: deliveryMessageSummary.reportArtifactIdentity.type,
    artifactDir: out,
    basename: deliveryMessageSummary.reportArtifactIdentity.basename,
    readyHeader: `納品準備OK: ${deliveryMessageSummary.title}`,
    verificationHeader: `検証: ${deliveryMessageSummary.message}`,
    qaLines: deliveryManifestQaLines(deliveryMessageSummary, { identityChecks: manifestIdentityChecks }),
    identityChecks: {
      ...manifestIdentityChecks,
    },
    deliverablePaths: [pptx, html, outline, prompts],
    auditPaths: [deliveryManifestPath],
    artifacts: [
      {
        name: deliveryMessageSummary.reportArtifactIdentity.name,
        type: deliveryMessageSummary.reportArtifactIdentity.type,
        dir: out,
        basename: deliveryMessageSummary.reportArtifactIdentity.basename,
        auditFiles: [deliveryMessagePath],
      },
    ],
  };
  fs.writeFileSync(deliveryManifestPath, JSON.stringify(manifestJson, null, 2));
  fs.writeFileSync(deliveryMessagePath, [
    '納品準備OK: Report Status',
    '検証: 投稿OK: Report Status / slides 1 / acceptance ready',
    '',
    'Artifact:',
    `- name: ${deliveryMessageSummary.reportArtifactIdentity.name}`,
    `- type: ${deliveryMessageSummary.reportArtifactIdentity.type}`,
    `- dir: ${out}`,
    `- basename: ${deliveryMessageSummary.reportArtifactIdentity.basename}`,
    '',
    'QA:',
    ...deliveryManifestQaLines(summary).map((line) => `- ${line}`),
    '',
    '添付ファイル:',
    `- ${path.basename(pptx)} (${pptx})`,
    `- ${path.basename(html)} (${html})`,
    `- ${path.basename(outline)} (${outline})`,
    `- ${path.basename(prompts)} (${prompts})`,
    '',
    '監査ファイル:',
    `- ${path.basename(deliveryManifestPath)} (${deliveryManifestPath})`,
    '',
  ].join('\n'));
  const cli = {
    deliveryMessagePath,
    deliveryManifestPath,
  };
  const originalSummary = JSON.parse(JSON.stringify(summary));

  const applied = deliveryManifestValidateDiscordReportValidations(summary, cli, ['cli error']);
  const explicitlyOrdered = deliveryManifestValidateDiscordReportValidationsInOrder(summary, cli, ['cli error'], ['deliveryMessage', 'deliveryManifest']);
  assert.deepEqual(explicitlyOrdered.errors, applied.errors);
  assert.deepEqual(explicitlyOrdered.summary.deliveryManifest, applied.summary.deliveryManifest);
  assert.deepEqual(explicitlyOrdered.summary.deliveryMessage, applied.summary.deliveryMessage);
  assert.notStrictEqual(applied.summary, summary);
  assert.notStrictEqual(applied.summary.identityChecks, summary.identityChecks);
  assert.equal(applied.summary.deliveryMessage.path, deliveryMessagePath);
  assert.equal(applied.summary.deliveryManifest.path, deliveryManifestPath);
  assert.equal(applied.summary.identityChecks.deliveryMessage.matched, true);
  assert.deepEqual(applied.summary.identityChecks.deliveryMessage.mismatches, []);
  assert.equal(applied.summary.identityChecks.deliveryManifest.matched, true);
  assert.deepEqual(applied.summary.identityChecks.deliveryManifest.mismatches, []);
  assert.deepEqual(applied.errors, ['cli error']);
  applied.summary.identityChecks.deliveryMessage.mismatches.push('mutated');
  applied.summary.deliveryMessage.path = '/tmp/changed.md';
  assert.deepEqual(summary, originalSummary);
});

test('delivery manifest utilities centralize discord report validation application context for a single validation', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/delivery-message.md'],
      auditPaths: ['/tmp/delivery-manifest.json'],
    },
  };
  const validationResult = {
    deliveryManifest: {
      path: '/tmp/deck.acceptance.manifest.json',
      exists: true,
    },
    identityCheck: { matched: false, mismatches: ['basename mismatch'] },
    errors: ['delivery manifest basename mismatch'],
  };

  const output = deliveryManifestApplyDiscordReportValidationContext(summary, validationResult, 'deliveryManifest', ['cli error']);
  assert.equal(output.summary.deliveryManifest.path, '/tmp/deck.acceptance.manifest.json');
  assert.deepEqual(output.errors, ['cli error', 'delivery manifest basename mismatch']);
  assert.notStrictEqual(output.summary, summary);
  assert.notStrictEqual(output.summary.identityChecks, summary.identityChecks);
});

test('delivery manifest utilities centralize discord report validation order context', () => {
  const summary = {
    title: 'Report Status',
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: '/tmp/out',
      basename: 'deck',
    },
    attachments: {
      deliverablePaths: ['/tmp/out/delivery-message.md'],
      auditPaths: ['/tmp/out/deck.acceptance.manifest.json'],
      postablePaths: ['/tmp/out/delivery-message.md', '/tmp/out/deck.acceptance.manifest.json'],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    acceptanceManifest: {
      path: '/tmp/out/deck.acceptance.manifest.json',
    },
  };
  const cli = {
    deliveryMessagePath: '/tmp/out/delivery-message.md',
    deliveryManifestPath: '/tmp/out/deck.acceptance.manifest.json',
  };

  const output = deliveryManifestValidateDiscordReportValidationsContext(summary, cli, ['cli error']);
  assert.equal(output.validationResults.length, 2);
  assert.deepEqual(output.validationResults.map((item) => item.kind), ['deliveryMessage', 'deliveryManifest']);
  assert.equal(output.validationResults[0].validationResult.deliveryMessage.path, cli.deliveryMessagePath);
  assert.equal(output.validationResults[1].validationResult.deliveryManifest.path, cli.deliveryManifestPath);
  assert.equal(output.summary.identityChecks.report.mismatches.length, 0);
  assert.equal(output.errors[0], 'cli error');
});

test('delivery manifest utilities apply acceptance manifest validation without mutating the original summary', () => {
  const summary = {
    title: 'Report Status',
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    attachments: {
      deliverablePaths: ['/tmp/delivery-message.md'],
      auditPaths: ['/tmp/delivery-manifest.json'],
    },
  };
  const validationResult = {
    deliveryManifest: {
      path: '/tmp/deck.acceptance.manifest.json',
      exists: true,
    },
    identityCheck: { matched: false, mismatches: ['basename mismatch'] },
    errors: ['delivery manifest basename mismatch'],
  };

  const applied = deliveryManifestApplyDiscordReportValidation(summary, validationResult, 'deliveryManifest');
  assert.notStrictEqual(applied.summary, summary);
  assert.notStrictEqual(applied.summary.identityChecks, summary.identityChecks);
  assert.notStrictEqual(applied.summary.attachments, summary.attachments);
  assert.equal(applied.summary.deliveryManifest.path, '/tmp/deck.acceptance.manifest.json');
  assert.equal(applied.summary.identityChecks.report.matched, true);
  assert.equal(applied.summary.identityChecks.deliveryManifest.matched, false);
  applied.summary.attachments.deliverablePaths.push('/tmp/extra.pptx');
  applied.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(applied.errors, ['delivery manifest basename mismatch']);
  assert.equal(summary.deliveryManifest, undefined);
  assert.equal(summary.identityChecks.deliveryManifest, undefined);
  assert.deepEqual(summary.attachments, {
    deliverablePaths: ['/tmp/delivery-message.md'],
    auditPaths: ['/tmp/delivery-manifest.json'],
  });
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities validate acceptance manifest from path', () => {
  const { out, manifestPath, pptx, summary } = createDeliveryManifestDeckFixture({
    prefix: 'delivery-manifest-validate-acceptance-',
  });

  const output = deliveryManifestValidateAcceptanceManifest(summary, manifestPath);
  assert.equal(output.deliveryManifest.path, manifestPath);
  assert.equal(output.deliveryManifest.exists, true);
  assert.equal(output.deliveryManifest.artifacts.length, 1);
  assert.equal(output.deliveryManifest.expectedArtifactPaths.includes(pptx), true);
  assert.equal(output.deliveryManifest.checks.identityChecksMatched, true);
  assert.equal(output.deliveryManifest.checks.qaLinesMatched, true);
  assert.equal(output.deliveryManifest.checks.auditPathsMatched, true);
  assert.deepEqual(output.identityCheck, {
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
  assert.deepEqual(output.errors, []);
});

test('delivery manifest fixture builder creates a coherent verified deck manifest', () => {
  const { out, pptx, html, manifestPath, deliveryMessagePath, parsed, summary } = createDeliveryManifestDeckFixture({
    prefix: 'delivery-manifest-fixture-contract-',
  });

  assert.equal(fs.existsSync(pptx), true);
  assert.equal(fs.existsSync(html), true);
  assert.equal(fs.existsSync(manifestPath), true);
  assert.equal(parsed.artifactDir, out);
  assert.deepEqual(parsed.deliverablePaths, [pptx, html]);
  assert.deepEqual(parsed.auditPaths, [manifestPath, deliveryMessagePath]);
  assert.deepEqual(summary.attachments, {
    deliverablePaths: [pptx, html],
    auditPaths: [manifestPath, deliveryMessagePath],
  });
  assert.deepEqual(summary.identityChecks.report, { matched: true, mismatches: [] });
  assert.equal(summary.acceptanceManifest.line, `manifest: ${manifestPath}`);
});

test('delivery manifest fixture builder can include auxiliary deliverables and audit files', () => {
  const { pptx, html, outline, prompts, reportPath, deliveryMessagePath, parsed, summary } = createDeliveryManifestDeckFixture({
    prefix: 'delivery-manifest-fixture-auxiliary-contract-',
    includeAuxiliaryDeliverables: true,
    writeAuditFiles: true,
  });

  assert.deepEqual(parsed.deliverablePaths, [pptx, html, outline, prompts]);
  assert.deepEqual(summary.attachments.deliverablePaths, [pptx, html, outline, prompts]);
  assert.equal(fs.existsSync(outline), true);
  assert.equal(fs.existsSync(prompts), true);
  assert.equal(fs.existsSync(reportPath), true);
  assert.equal(fs.existsSync(deliveryMessagePath), true);
});

test('delivery manifest utilities centralize final manifest validation summary', () => {
  const { manifestPath, parsed, summary } = createDeliveryManifestDeckFixture({
    prefix: 'delivery-manifest-final-validation-',
  });

  const output = deliveryManifestFinalManifestValidationSummary(summary, parsed, manifestPath);
  assert.equal(output.deliveryManifest.exists, true);
  assert.equal(output.deliveryManifest.artifacts.length, 1);
  assert.equal(output.deliveryManifest.checks.identityChecksMatched, true);
  assert.equal(output.identityCheck.matched, true);
  assert.deepEqual(output.errors, []);
  output.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities centralize final manifest validation context', () => {
  const { manifestPath, parsed, summary } = createDeliveryManifestDeckFixture({
    prefix: 'delivery-manifest-final-context-',
  });

  const output = deliveryManifestFinalManifestValidationContext(summary, parsed, manifestPath);
  assert.equal(output.deliveryManifest.exists, true);
  assert.equal(output.deliveryManifest.artifacts.length, 1);
  assert.equal(output.deliveryManifest.checks.identityChecksMatched, true);
  assert.equal(output.identityCheck.matched, true);
  assert.deepEqual(output.errors, []);
  output.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities centralize expected manifest report summary', () => {
  const summary = {
    title: 'Report Status',
    message: 'ready for Discord delivery',
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: '/tmp/out',
      basename: 'deck',
    },
    attachments: {
      deliverablePaths: ['/tmp/out/deck.editable.pptx'],
      auditPaths: ['/tmp/out/deck.acceptance.manifest.json'],
    },
    deliveryReadiness: {
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: false, mismatches: ['basename mismatch'] },
    },
    deliveryMessage: {
      actualQaLines: ['identity checks: report ready / deliveryMessage ready / deliveryManifest blocked'],
    },
  };
  const parsed = {
    schemaVersion: 2,
    title: 'Wrong Status',
    artifactName: 'deck deck',
    artifactType: 'deck',
    artifactDir: '/tmp/out',
    basename: 'deck',
    readyHeader: '納品準備OK: Wrong Status',
    verificationHeader: '検証: ready for Discord delivery',
    qaLines: [
      'delivery readiness: ready',
      'delivery readiness: ready',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest blocked',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: ['/tmp/out/deck.editable.pptx', '/tmp/out/deck.editable.pptx'],
    auditPaths: ['/tmp/out/deck.acceptance.manifest.json'],
  };

  const report = deliveryManifestExpectedManifestReportSummary(summary, parsed);
  assert.equal(report.expected.schemaVersion, 1);
  assert.equal(report.expected.title, 'Report Status');
  assert.equal(report.actual.schemaVersion, 2);
  assert.equal(report.actual.title, 'Wrong Status');
  assert.equal(report.checks.schemaVersionMatched, false);
  assert.equal(report.checks.titleMatched, false);
  assert.equal(report.checks.identityChecksRequired, true);
  assert.equal(report.checks.identityChecksMatched, false);
  assert.deepEqual(report.duplicateQaLines, ['delivery readiness: ready']);
  assert.deepEqual(report.duplicateDeliverablePaths, ['/tmp/out/deck.editable.pptx']);
  assert.deepEqual(report.duplicateAuditPaths, []);
});

test('delivery manifest utilities centralize expected manifest report errors', () => {
  const report = {
    checks: {
      schemaVersionMatched: false,
      titleMatched: false,
      artifactNameMatched: true,
      artifactTypeMatched: true,
      artifactDirMatched: true,
      basenameMatched: true,
      readyHeaderMatched: true,
      verificationHeaderMatched: true,
      qaLinesMatched: false,
      identityChecksRequired: true,
      identityChecksPresent: false,
      identityChecksMatched: false,
      deliverablePathsMatched: false,
      auditPathsMatched: true,
    },
    duplicateQaLines: ['delivery readiness: ready'],
    duplicateDeliverablePaths: ['/tmp/out/deck.editable.pptx'],
    duplicateAuditPaths: [],
  };

  assert.deepEqual(deliveryManifestExpectedManifestReportErrors(report), [
    'delivery manifest schemaVersion mismatch',
    'delivery manifest title mismatch',
    'delivery manifest qaLines mismatch',
    'delivery manifest duplicate QA line: delivery readiness: ready',
    'delivery manifest identityChecks missing',
    'delivery manifest identityChecks mismatch',
    'delivery manifest deliverablePaths mismatch',
    'delivery manifest duplicate deliverable path: /tmp/out/deck.editable.pptx',
  ]);
});

test('delivery manifest utilities validate discord report without mutating the original summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-validate-discord-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Report Status',
    artifactName: 'deck deck',
    artifactType: 'deck',
    artifactDir: out,
    basename: 'deck',
    readyHeader: '納品準備OK: Report Status',
    verificationHeader: '検証: ready for Discord delivery',
    qaLines: [
      'delivery readiness: ready',
      'reasons: none',
      `manifest: ${manifestPath}`,
      'manifest verification scope: manifest-only',
      'checked artifacts: 1',
      'checked artifact types: deck',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
      'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      'PPTX images: 0 (none)',
      'PPTX special elements: 0 (none)',
      'PPTX hidden text: 0',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: [path.join(out, 'deck.editable.pptx'), path.join(out, 'deck.preview.html')],
    auditPaths: [manifestPath, path.join(out, 'delivery-message.md')],
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [path.join(out, 'delivery-message.md')],
    }],
  }));
  fs.writeFileSync(path.join(out, 'deck.editable.pptx'), 'pptx');
  fs.writeFileSync(path.join(out, 'deck.preview.html'), 'html');
  fs.writeFileSync(path.join(out, 'deck.outline.json'), '{}');
  fs.writeFileSync(path.join(out, 'delivery-message.md'), 'delivery message');
  const summary = {
    title: 'Report Status',
    attachmentPolicy: {
      required: ['pptx', 'html'],
      optional: ['outline'],
      requiredReady: true,
    },
    artifactDetails: {
      pptx: { path: '/tmp/deck.pptx', exists: true, bytes: 12 },
      html: { path: '/tmp/preview.html', exists: true, bytes: 8 },
      outline: { path: path.join(out, 'deck.outline.json'), exists: true, bytes: 2 },
    },
    visualQa: {
      acceptance: {
        status: 'present',
        source: 'fallback',
        width: 1280,
        height: 900,
        uniqueSampledColors: 42,
        line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      },
    },
    pptxInternalQa: {
      acceptance: {
        images: { status: 'present', count: 0, line: 'PPTX images: 0 (none)' },
        specialElements: { status: 'present', count: 0, line: 'PPTX special elements: 0 (none)' },
        hiddenText: { status: 'present', count: 0, line: 'PPTX hidden text: 0' },
      },
    },
    deliveryReadiness: {
      status: 'ready',
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
      reasons: [],
    },
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
    },
    acceptanceManifest: {
      status: 'present',
      path: manifestPath,
      scope: 'manifest-only',
      line: 'acceptance manifest: present',
      scopeLine: 'acceptance manifest scope: manifest-only',
      verification: {
        ok: true,
        status: 0,
        scope: 'manifest-only',
        checked: 1,
        checkedArtifactTypes: ['deck'],
      },
    },
    checkedArtifacts: 1,
    checkedArtifactTypes: {
      status: 'present',
      types: ['deck'],
      line: 'checked artifact types: deck',
    },
    attachments: {
      deliverablePaths: [path.join(out, 'deck.editable.pptx'), path.join(out, 'deck.preview.html')],
      auditPaths: [manifestPath],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };
  const snapshot = JSON.parse(JSON.stringify(summary));
  const output = deliveryManifestValidateDiscordReport(summary, {
    verification: 'ready',
    acceptance: 'ready',
  }, []);
  output.summary.visualQa.acceptance.width = 640;
  output.summary.visualQa.acceptance.uniqueSampledColors = 7;
  output.summary.pptxInternalQa.acceptance.images.line = 'mutated';
  output.summary.identityChecks.report.mismatches.push('mutated');
  output.summary.attachments.deliverablePaths.push('/tmp/new.pptx');
  assert.deepEqual(output.errors, []);
  assert.deepEqual(output.warnings, []);
  assert.equal(summary.visualQa.acceptance.width, 1280);
  assert.equal(summary.visualQa.acceptance.uniqueSampledColors, 42);
  assert.equal(summary.pptxInternalQa.acceptance.images.line, 'PPTX images: 0 (none)');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
  assert.deepEqual(summary.attachments.deliverablePaths, [path.join(out, 'deck.editable.pptx'), path.join(out, 'deck.preview.html')]);
  assert.deepEqual(summary, snapshot);
});

test('delivery manifest utilities centralize discord report validation entrypoint context', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-discord-report-entrypoint-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const pptx = path.join(out, 'deck.editable.pptx');
  const html = path.join(out, 'deck.preview.html');
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: 'Report Status',
    artifactName: 'deck deck',
    artifactType: 'deck',
    artifactDir: out,
    basename: 'deck',
    readyHeader: '納品準備OK: Report Status',
    verificationHeader: '検証: ready for Discord delivery',
    qaLines: [
      'delivery readiness: ready',
      'reasons: none',
      `manifest: ${manifestPath}`,
      'manifest verification scope: manifest-only',
      'checked artifacts: 1',
      'checked artifact types: deck',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
      'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      'PPTX images: 0 (none)',
      'PPTX special elements: 0 (none)',
      'PPTX hidden text: 0',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: [pptx, html],
    auditPaths: [manifestPath],
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [],
    }],
  }, null, 2));
  const summary = {
    attachmentPolicy: {
      required: ['pptx'],
      optional: ['svg'],
      requiredReady: false,
    },
    artifactDetails: {
      pptx: { path: pptx, exists: true, bytes: 4 },
      html: { path: html, exists: true, bytes: 4 },
    },
    deliveryReadiness: { status: 'ready', reasonsLine: 'reasons: none' },
    checkedArtifacts: 1,
    checkedArtifactTypes: { status: 'present', types: ['deck'] },
    acceptanceManifest: { scopeStatus: 'present', path: manifestPath },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };

  const wrapped = deliveryManifestValidateDiscordReport(summary, {
    verification: 'ready',
    acceptance: 'ready',
  }, []);
  const context = deliveryManifestValidateDiscordReportContext(summary, {
    verification: 'ready',
    acceptance: 'ready',
  }, []);

  assert.deepEqual(context, wrapped);
  assert.equal(context.summary.deliveryManifest, undefined);
});

test('delivery manifest utilities summarize delivery messages and validation errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-message-summary-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const pptx = path.join(out, 'deck.editable.pptx');
  const html = path.join(out, 'deck.preview.html');
  const manifestPath = path.join(out, 'deck.acceptance.manifest.json');
  const deliveryMessagePath = path.join(out, 'delivery-message.md');
  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifacts: [{
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
      auditFiles: [deliveryMessagePath],
    }],
  }));

  const summary = {
    title: 'Report Status',
    message: 'ready for Discord delivery',
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: out,
      basename: 'deck',
    },
    deliveryReadiness: { ok: true, line: 'delivery readiness: ready', reasonsLine: 'reasons: none', reasons: [] },
    checkedArtifacts: 1,
    checkedArtifactTypes: { status: 'present', types: ['deck'], line: 'checked artifact types: deck' },
    identityChecks: {
      deliveryMessage: {
        matched: true,
        mismatches: [],
      },
    },
    visualQa: {
      acceptance: { line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42' },
    },
    pptxInternalQa: {
      acceptance: {
        images: { status: 'present', count: 0, breakdown: 'none', line: 'PPTX images: 0 (none)' },
        specialElements: { status: 'present', count: 0, breakdown: 'none', line: 'PPTX special elements: 0 (none)' },
        hiddenText: { status: 'present', count: 0, line: 'PPTX hidden text: 0' },
      },
    },
    attachments: {
      deliverablePaths: [pptx, html],
      auditPaths: [manifestPath],
      audit: [{ attachable: true }],
      postablePaths: [pptx, html, manifestPath],
    },
    acceptanceManifest: {
      path: manifestPath,
      exists: true,
      line: `manifest: ${manifestPath}`,
      scope: 'manifest-only',
      scopeLine: 'manifest verification scope: manifest-only',
      artifacts: [{
        name: 'deck deck',
        type: 'deck',
        dir: out,
        basename: 'deck',
        auditFiles: [deliveryMessagePath],
      }],
      expectedArtifactPaths: [],
    },
  };
  const text = [
    '納品準備OK: Report Status',
    '検証: ready',
    'Artifact:',
    '- name: deck deck',
    '- type: deck',
    `- dir: ${out}`,
    '- basename: deck',
    '',
    '添付ファイル:',
    `- deck.editable.pptx (${pptx})`,
    `- deck.preview.html (${html})`,
    '',
    '監査ファイル:',
    `- delivery-manifest.json (${manifestPath})`,
    '',
    'QA:',
    '- delivery readiness: ready',
    '- reasons: none',
    `- manifest: ${manifestPath}`,
    '- manifest verification scope: manifest-only',
    '- checked artifacts: 1',
    '- checked artifact types: deck',
    '- identity checks: deliveryMessage ready',
    '- visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
    '- PPTX images: 0 (none)',
    '- PPTX special elements: 0 (none)',
    '- PPTX hidden text: 0',
  ].join('\n');
  fs.writeFileSync(deliveryMessagePath, text);

  assert.deepEqual(deliveryManifestSummarizeDeliveryMessage(summary, deliveryMessagePath), {
    deliveryMessage: {
      path: deliveryMessagePath,
      exists: true,
      bytes: Buffer.byteLength(text),
      readyHeaderPresent: true,
      verificationHeaderPresent: true,
      artifactSectionPresent: true,
      artifactIdentity: {
        name: 'deck deck',
        type: 'deck',
        dir: out,
        basename: 'deck',
      },
      expectedArtifact: {
        name: 'deck deck',
        type: 'deck',
        dir: out,
        basename: 'deck',
        auditFiles: [deliveryMessagePath],
      },
      attachmentSectionPresent: true,
      auditSectionPresent: true,
      attachmentsMatched: true,
      missingAttachments: [],
      missingDeliverableAttachments: [],
      missingAuditAttachments: [],
      wrongSectionAuditAttachments: [],
      qaSectionPresent: true,
      expectedQaLines: [
        'delivery readiness: ready',
        'reasons: none',
        `manifest: ${manifestPath}`,
        'manifest verification scope: manifest-only',
        'checked artifacts: 1',
        'checked artifact types: deck',
        'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
        'PPTX images: 0 (none)',
        'PPTX special elements: 0 (none)',
        'PPTX hidden text: 0',
      ],
      actualQaLines: [
        'delivery readiness: ready',
        'reasons: none',
        `manifest: ${manifestPath}`,
        'manifest verification scope: manifest-only',
        'checked artifacts: 1',
        'checked artifact types: deck',
        'identity checks: deliveryMessage ready',
        'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
        'PPTX images: 0 (none)',
        'PPTX special elements: 0 (none)',
        'PPTX hidden text: 0',
      ],
      qaDiff: {
        expectedCount: 10,
        actualCount: 11,
        missingLines: [],
        allowedUnexpectedLines: ['identity checks: deliveryMessage ready'],
        allowedUnexpectedLinePolicies: [
          {
            name: 'identityChecks',
            exactLines: ['identity checks: deliveryMessage ready'],
            pattern: null,
            reason: 'validated separately against delivery manifest identityChecks',
          },
        ],
        unexpectedLines: [],
        firstMismatch: null,
      },
      expectedIdentityQaLine: 'identity checks: deliveryMessage ready',
      qaOrderMatched: true,
      duplicateQaLines: [],
      qaMatched: true,
      missingQaLines: [],
    },
    identityCheck: {
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
    },
    errors: [],
  });

  const missing = deliveryManifestSummarizeDeliveryMessage(summary, path.join(out, 'missing.md'));
  assert.equal(missing.deliveryMessage.exists, false);
  assert.match(missing.errors.join('\n'), /delivery message missing or unreadable/);
});

test('delivery manifest utilities centralize delivery message read errors', () => {
  const deliveryMessagePath = '/tmp/out/delivery-message.md';
  assert.deepEqual(deliveryManifestDeliveryMessageReadErrors(deliveryMessagePath, { fileError: 'ENOENT' }), [
    `delivery message missing or unreadable: ${deliveryMessagePath}`,
  ]);
  assert.deepEqual(deliveryManifestDeliveryMessageReadErrors(deliveryMessagePath), []);
});

test('delivery manifest utilities centralize delivery message attachment checks', () => {
  const summary = {
    attachments: {
      deliverablePaths: ['/tmp/deck.editable.pptx', '/tmp/deck.preview.html'],
      auditPaths: ['/tmp/deck.acceptance.manifest.json'],
      audit: [{ attachable: true }],
      postablePaths: ['/tmp/deck.editable.pptx', '/tmp/deck.preview.html'],
    },
  };
  const text = [
    '添付ファイル:',
    '- deck.editable.pptx (/tmp/deck.editable.pptx)',
    '- deck.acceptance.manifest.json (/tmp/deck.acceptance.manifest.json)',
    '',
    '監査ファイル:',
  ].join('\n');

  assert.deepEqual(deliveryManifestDeliveryMessageAttachmentSummary(summary, text), {
    attachmentSectionPresent: true,
    auditSectionPresent: true,
    attachmentsMatched: false,
    missingAttachments: ['/tmp/deck.preview.html', '/tmp/deck.acceptance.manifest.json'],
    missingDeliverableAttachments: ['/tmp/deck.preview.html'],
    missingAuditAttachments: ['/tmp/deck.acceptance.manifest.json'],
    wrongSectionAuditAttachments: ['/tmp/deck.acceptance.manifest.json'],
    errors: [
      'delivery message missing attachment path: /tmp/deck.preview.html',
      'delivery message missing audit attachment path: /tmp/deck.acceptance.manifest.json',
      'delivery message audit attachment is listed as deliverable: /tmp/deck.acceptance.manifest.json',
    ],
  });

  assert.deepEqual(deliveryManifestDeliveryMessageAttachmentSummary(summary, ''), {
    attachmentSectionPresent: false,
    auditSectionPresent: false,
    attachmentsMatched: false,
    missingAttachments: [
      '/tmp/deck.editable.pptx',
      '/tmp/deck.preview.html',
      '/tmp/deck.acceptance.manifest.json',
    ],
    missingDeliverableAttachments: ['/tmp/deck.editable.pptx', '/tmp/deck.preview.html'],
    missingAuditAttachments: ['/tmp/deck.acceptance.manifest.json'],
    wrongSectionAuditAttachments: [],
    errors: [
      'delivery message missing attachment path: /tmp/deck.editable.pptx',
      'delivery message missing attachment path: /tmp/deck.preview.html',
      'delivery message missing audit attachment path: /tmp/deck.acceptance.manifest.json',
      'delivery message missing attachment section',
      'delivery message missing audit attachment section',
    ],
  });
});

test('delivery manifest utilities format delivery message attachment errors', () => {
  const summary = {
    attachments: {
      postablePaths: ['/tmp/deck.editable.pptx'],
      audit: [{ attachable: true }],
    },
  };
  const attachmentSummary = {
    missingDeliverableAttachments: ['/tmp/deck.preview.html'],
    missingAuditAttachments: ['/tmp/deck.acceptance.manifest.json'],
    wrongSectionAuditAttachments: ['/tmp/deck.acceptance.manifest.json'],
  };

  assert.deepEqual(deliveryManifestDeliveryMessageAttachmentErrors(summary, attachmentSummary, {
    attachmentSectionPresent: true,
    auditSectionPresent: true,
  }), [
    'delivery message missing attachment path: /tmp/deck.preview.html',
    'delivery message missing audit attachment path: /tmp/deck.acceptance.manifest.json',
    'delivery message audit attachment is listed as deliverable: /tmp/deck.acceptance.manifest.json',
  ]);

  assert.deepEqual(deliveryManifestDeliveryMessageAttachmentErrors(summary, attachmentSummary, {
    attachmentSectionPresent: false,
    auditSectionPresent: false,
  }), [
    'delivery message missing attachment path: /tmp/deck.preview.html',
    'delivery message missing audit attachment path: /tmp/deck.acceptance.manifest.json',
    'delivery message audit attachment is listed as deliverable: /tmp/deck.acceptance.manifest.json',
    'delivery message missing attachment section',
    'delivery message missing audit attachment section',
  ]);
});

test('delivery manifest utilities centralize delivery message artifact identity checks', () => {
  const deliveryMessagePath = '/tmp/out/delivery-message.md';
  const summary = {
    acceptanceManifest: {
      artifacts: [{
        name: 'deck deck',
        type: 'deck',
        dir: '/tmp/out',
        basename: 'deck',
        auditFiles: [deliveryMessagePath],
      }],
    },
  };
  const text = [
    'Artifact:',
    '- name: deck deck',
    '- type: onepager',
    '- dir: /tmp/out',
  ].join('\n');

  assert.deepEqual(deliveryManifestDeliveryMessageArtifactIdentitySummary(summary, text, deliveryMessagePath), {
    artifactSectionPresent: true,
    artifactIdentityRequired: true,
    artifactIdentity: {
      name: 'deck deck',
      type: 'onepager',
      dir: '/tmp/out',
    },
    expectedArtifact: {
      name: 'deck deck',
      type: 'deck',
      dir: '/tmp/out',
      basename: 'deck',
      auditFiles: [deliveryMessagePath],
    },
    identityCheck: {
      expected: {
        name: 'deck deck',
        type: 'deck',
        dir: '/tmp/out',
        basename: 'deck',
      },
      actual: {
        name: 'deck deck',
        type: 'onepager',
        dir: '/tmp/out',
        basename: null,
      },
      matched: false,
      mismatches: [
        { field: 'type', expected: 'deck', actual: 'onepager' },
        { field: 'basename', expected: 'deck', actual: null },
      ],
    },
    errors: [
      'delivery message artifact type mismatch: expected deck / actual onepager',
      'delivery message artifact basename mismatch: expected deck / actual missing',
    ],
  });

  const missingSection = deliveryManifestDeliveryMessageArtifactIdentitySummary(summary, '', deliveryMessagePath);
  assert.equal(missingSection.artifactSectionPresent, false);
  assert.equal(missingSection.artifactIdentityRequired, true);
  assert.deepEqual(missingSection.errors, [
    'delivery message missing artifact identity section',
    'delivery message artifact name mismatch: expected deck deck / actual missing',
    'delivery message artifact type mismatch: expected deck / actual missing',
    'delivery message artifact dir mismatch: expected /tmp/out / actual missing',
    'delivery message artifact basename mismatch: expected deck / actual missing',
  ]);

  assert.deepEqual(deliveryManifestDeliveryMessageArtifactIdentitySummary({}, text, deliveryMessagePath), {
    artifactSectionPresent: true,
    artifactIdentityRequired: false,
    artifactIdentity: {
      name: 'deck deck',
      type: 'onepager',
      dir: '/tmp/out',
    },
    expectedArtifact: null,
    identityCheck: null,
    errors: [],
  });
});

test('delivery manifest utilities format delivery message artifact identity errors', () => {
  const identityCheck = {
    mismatches: [
      { field: 'type', expected: 'deck', actual: 'onepager' },
      { field: 'basename', expected: 'deck', actual: null },
    ],
  };

  assert.deepEqual(deliveryManifestDeliveryMessageArtifactIdentityErrors(identityCheck, {
    artifactIdentityRequired: true,
    artifactSectionPresent: true,
  }), [
    'delivery message artifact type mismatch: expected deck / actual onepager',
    'delivery message artifact basename mismatch: expected deck / actual missing',
  ]);

  assert.deepEqual(deliveryManifestDeliveryMessageArtifactIdentityErrors(identityCheck, {
    artifactIdentityRequired: true,
    artifactSectionPresent: false,
  }), [
    'delivery message missing artifact identity section',
    'delivery message artifact type mismatch: expected deck / actual onepager',
    'delivery message artifact basename mismatch: expected deck / actual missing',
  ]);

  assert.deepEqual(deliveryManifestDeliveryMessageArtifactIdentityErrors(null, {
    artifactIdentityRequired: false,
    artifactSectionPresent: false,
  }), []);
});

test('delivery manifest utilities centralize delivery message header and QA errors', () => {
  const summary = {
    deliveryReadiness: {
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
    },
  };
  const outOfOrderText = [
    'QA:',
    '- reasons: none',
    '- delivery readiness: ready',
    '- delivery readiness: ready',
    '- unverified external claim: ready',
  ].join('\n');

  const outOfOrder = deliveryManifestDeliveryMessageStatusQaSummary(summary, outOfOrderText);
  assert.equal(outOfOrder.readyHeaderPresent, false);
  assert.equal(outOfOrder.verificationHeaderPresent, false);
  assert.equal(outOfOrder.qaSectionPresent, true);
  assert.deepEqual(outOfOrder.headerErrors, [
    'delivery message missing ready header',
    'delivery message missing verification header',
  ]);
  assert.deepEqual(outOfOrder.qaErrors, [
    'delivery message QA lines are out of order',
    'delivery message duplicate QA line: delivery readiness: ready',
    'delivery message unexpected QA line: unverified external claim: ready',
  ]);
  assert.deepEqual(outOfOrder.errors, [...outOfOrder.headerErrors, ...outOfOrder.qaErrors]);
  assert.equal(outOfOrder.expectedQa.qaMatched, false);

  const missingSection = deliveryManifestDeliveryMessageStatusQaSummary(summary, [
    '納品準備OK: Report Status',
    '検証: ready',
  ].join('\n'));
  assert.equal(missingSection.readyHeaderPresent, true);
  assert.equal(missingSection.verificationHeaderPresent, true);
  assert.equal(missingSection.qaSectionPresent, false);
  assert.deepEqual(missingSection.headerErrors, []);
  assert.deepEqual(missingSection.qaErrors, [
    'delivery message missing QA line: delivery readiness: ready',
    'delivery message missing QA line: reasons: none',
    'delivery message missing QA section',
  ]);
});

test('delivery manifest utilities centralize delivery message report assembly', () => {
  const deliveryMessagePath = '/tmp/out/delivery-message.md';
  const text = [
    '納品準備OK: Report Status',
    '検証: ready',
    'Artifact:',
    '- name: deck deck',
    '- type: deck',
    '- dir: /tmp/out',
    '- basename: deck',
    '',
    '添付ファイル:',
    '- deck.editable.pptx (/tmp/out/deck.editable.pptx)',
    '',
    'QA:',
    '- delivery readiness: ready',
    '- reasons: none',
  ].join('\n');
  const summary = {
    deliveryReadiness: {
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
    },
    attachments: {
      deliverablePaths: ['/tmp/out/deck.editable.pptx'],
      auditPaths: [],
      postablePaths: ['/tmp/out/deck.editable.pptx'],
    },
    acceptanceManifest: {
      artifacts: [{
        name: 'deck deck',
        type: 'deck',
        dir: '/tmp/out',
        basename: 'deck',
        auditFiles: [deliveryMessagePath],
      }],
    },
  };

  const report = deliveryManifestDeliveryMessageReportSummary(summary, text, deliveryMessagePath);
  assert.equal(report.deliveryMessage.path, deliveryMessagePath);
  assert.equal(report.deliveryMessage.exists, true);
  assert.equal(report.deliveryMessage.bytes, Buffer.byteLength(text));
  assert.equal(report.deliveryMessage.readyHeaderPresent, true);
  assert.equal(report.deliveryMessage.verificationHeaderPresent, true);
  assert.equal(report.deliveryMessage.artifactSectionPresent, true);
  assert.deepEqual(report.deliveryMessage.artifactIdentity, {
    name: 'deck deck',
    type: 'deck',
    dir: '/tmp/out',
    basename: 'deck',
  });
  assert.equal(report.deliveryMessage.attachmentSectionPresent, true);
  assert.equal(report.deliveryMessage.attachmentsMatched, true);
  assert.equal(report.deliveryMessage.qaSectionPresent, true);
  assert.deepEqual(report.deliveryMessage.expectedQaLines, ['delivery readiness: ready', 'reasons: none']);
  assert.deepEqual(report.deliveryMessage.actualQaLines, ['delivery readiness: ready', 'reasons: none']);
  assert.equal(report.deliveryMessage.qaMatched, true);
  assert.deepEqual(report.deliveryMessage.missingQaLines, []);
  assert.equal(report.attachmentSummary.attachmentsMatched, true);
  assert.equal(report.statusQaSummary.expectedQa.qaMatched, true);
  assert.equal(report.artifactIdentitySummary.identityCheck.matched, true);

  const broken = deliveryManifestDeliveryMessageReportSummary(summary, [
    'QA:',
    '- reasons: none',
    '- delivery readiness: ready',
    '- delivery readiness: ready',
    '- unknown: ready',
  ].join('\n'), deliveryMessagePath);
  assert.deepEqual(broken.errors, [
    'delivery message missing attachment path: /tmp/out/deck.editable.pptx',
    'delivery message missing attachment section',
    'delivery message missing ready header',
    'delivery message missing verification header',
    'delivery message missing artifact identity section',
    'delivery message artifact name mismatch: expected deck deck / actual missing',
    'delivery message artifact type mismatch: expected deck / actual missing',
    'delivery message artifact dir mismatch: expected /tmp/out / actual missing',
    'delivery message artifact basename mismatch: expected deck / actual missing',
    'delivery message QA lines are out of order',
    'delivery message duplicate QA line: delivery readiness: ready',
    'delivery message unexpected QA line: unknown: ready',
  ]);
});

test('delivery manifest utilities aggregate delivery message report errors in diagnostic order', () => {
  assert.deepEqual(deliveryManifestDeliveryMessageReportErrors({
    attachmentSummary: { errors: ['attachment missing'] },
    statusQaSummary: {
      headerErrors: ['ready header missing'],
      qaErrors: ['qa line missing'],
    },
    artifactIdentitySummary: { errors: ['artifact type mismatch'] },
  }), [
    'attachment missing',
    'ready header missing',
    'artifact type mismatch',
    'qa line missing',
  ]);

  assert.deepEqual(deliveryManifestDeliveryMessageReportErrors({}), []);
});

test('delivery manifest utilities build delivery message payload from shared summaries', () => {
  const artifactIdentitySummary = {
    artifactSectionPresent: true,
    artifactIdentity: { name: 'deck deck', type: 'deck', dir: '/tmp/out' },
    expectedArtifact: { name: 'deck deck', type: 'deck', dir: '/tmp/out', basename: 'deck' },
    errors: ['artifact type mismatch'],
  };
  const attachmentSummary = {
    attachmentSectionPresent: true,
    auditSectionPresent: false,
    attachmentsMatched: false,
    missingAttachments: ['/tmp/out/deck.preview.html'],
    missingDeliverableAttachments: ['/tmp/out/deck.preview.html'],
    missingAuditAttachments: [],
    wrongSectionAuditAttachments: [],
    errors: ['attachment missing'],
  };
  const statusQaSummary = {
    readyHeaderPresent: true,
    verificationHeaderPresent: true,
    qaSectionPresent: true,
    expectedQa: {
      expectedQaLines: ['delivery readiness: ready'],
      actualQaLines: ['delivery readiness: ready'],
      qaDiff: { unexpectedLines: [] },
      expectedIdentityQaLine: null,
      qaOrderMatched: true,
      duplicateQaLines: [],
      qaMatched: true,
      missingQaLines: [],
    },
    headerErrors: ['ready header missing'],
    qaErrors: ['qa line missing'],
  };

  assert.deepEqual(deliveryManifestDeliveryMessagePayload({
    text: '納品準備OK: Report Status\n検証: ready',
    deliveryMessagePath: '/tmp/out/delivery-message.md',
    artifactIdentitySummary,
    attachmentSummary,
    statusQaSummary,
  }), {
    path: '/tmp/out/delivery-message.md',
    exists: true,
    bytes: Buffer.byteLength('納品準備OK: Report Status\n検証: ready'),
    readyHeaderPresent: true,
    verificationHeaderPresent: true,
    artifactSectionPresent: true,
    artifactIdentity: { name: 'deck deck', type: 'deck', dir: '/tmp/out' },
    expectedArtifact: { name: 'deck deck', type: 'deck', dir: '/tmp/out', basename: 'deck' },
    attachmentSectionPresent: true,
    auditSectionPresent: false,
    attachmentsMatched: false,
    missingAttachments: ['/tmp/out/deck.preview.html'],
    missingDeliverableAttachments: ['/tmp/out/deck.preview.html'],
    missingAuditAttachments: [],
    wrongSectionAuditAttachments: [],
    qaSectionPresent: true,
    expectedQaLines: ['delivery readiness: ready'],
    actualQaLines: ['delivery readiness: ready'],
    qaDiff: { unexpectedLines: [] },
    expectedIdentityQaLine: null,
    qaOrderMatched: true,
    duplicateQaLines: [],
    qaMatched: true,
    missingQaLines: [],
  });
});

test('delivery manifest utilities centralize delivery message validation summary', () => {
  const deliveryMessagePath = '/tmp/out/delivery-message.md';
  const text = [
    '納品準備OK: Report Status',
    '検証: ready',
    'Artifact:',
    '- name: deck deck',
    '- type: deck',
    '- dir: /tmp/out',
    '- basename: deck',
    '',
    '添付ファイル:',
    '- deck.editable.pptx (/tmp/out/deck.editable.pptx)',
    '',
    'QA:',
    '- delivery readiness: ready',
    '- reasons: none',
  ].join('\n');
  const summary = {
    deliveryReadiness: {
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
    },
    attachments: {
      deliverablePaths: ['/tmp/out/deck.editable.pptx'],
      auditPaths: [],
      postablePaths: ['/tmp/out/deck.editable.pptx'],
    },
    acceptanceManifest: {
      artifacts: [{
        name: 'deck deck',
        type: 'deck',
        dir: '/tmp/out',
        basename: 'deck',
        auditFiles: [deliveryMessagePath],
      }],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };

  const output = deliveryManifestDeliveryMessageValidationSummary(summary, text, deliveryMessagePath);
  assert.equal(output.deliveryMessage.path, deliveryMessagePath);
  assert.equal(output.deliveryMessage.exists, true);
  assert.equal(output.deliveryMessage.attachmentsMatched, true);
  assert.equal(output.deliveryMessage.qaMatched, true);
  assert.equal(output.identityCheck.matched, true);
  assert.deepEqual(output.errors, []);

  output.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities centralize delivery message validation context', () => {
  const deliveryMessagePath = '/tmp/out/delivery-message.md';
  const text = [
    '納品準備OK: Report Status',
    '検証: ready',
    'Artifact:',
    '- name: deck deck',
    '- type: deck',
    '- dir: /tmp/out',
    '- basename: deck',
    '',
    '添付ファイル:',
    '- deck.editable.pptx (/tmp/out/deck.editable.pptx)',
    '',
    'QA:',
    '- delivery readiness: ready',
    '- reasons: none',
  ].join('\n');
  const summary = {
    deliveryReadiness: {
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
    },
    attachments: {
      deliverablePaths: ['/tmp/out/deck.editable.pptx'],
      auditPaths: [],
      postablePaths: ['/tmp/out/deck.editable.pptx'],
    },
    acceptanceManifest: {
      artifacts: [{
        name: 'deck deck',
        type: 'deck',
        dir: '/tmp/out',
        basename: 'deck',
        auditFiles: [deliveryMessagePath],
      }],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
  };

  const output = deliveryManifestDeliveryMessageValidationContext(summary, text, deliveryMessagePath);
  assert.notEqual(output.summary, summary);
  assert.equal(output.identityCheck?.matched, true);
  assert.equal(output.artifactIdentitySummary.identityCheck?.matched, true);
  output.summary.identityChecks.report.mismatches.push('mutated');
  assert.deepEqual(summary.identityChecks.report.mismatches, []);
});

test('delivery manifest utilities parse report sections and statuses', () => {
  const report = [
    '検証結果:',
    '- status: ready',
    '- visual QA: ready',
    '',
    '納品前チェック:',
    '- status: blocked',
    '- delivery readiness: blocked',
    '',
    'Artifact:',
    '- basename: deck',
  ].join('\n');
  assert.equal(deliveryManifestSectionStatus(report, '検証結果:'), 'ready');
  assert.equal(deliveryManifestSectionStatus(report, '納品前チェック:'), 'blocked');
  assert.equal(deliveryManifestSectionStatus(report, 'Missing:'), null);
  assert.equal(deliveryManifestReportSection(report, '検証結果:').includes('納品前チェック:'), false);
  assert.equal(deliveryManifestReportSection(report, 'Artifact:').trim().endsWith('- basename: deck'), true);
});

test('delivery manifest utilities parse section bullets and key values', () => {
  const report = [
    'Artifact:',
    '- name: Sample Deck',
    '- type: deck',
    '- basename: sample',
    '',
    '添付ファイル:',
    '- deck.editable.pptx (/tmp/deck.editable.pptx)',
    '- deck.preview.html (/tmp/deck.preview.html)',
    '',
    'QA:',
    '- delivery readiness: ready',
    '- reasons: none',
  ].join('\n');

  assert.deepEqual(deliveryManifestSectionKeyValues(report, 'Artifact:'), {
    name: 'Sample Deck',
    type: 'deck',
    basename: 'sample',
  });
  assert.deepEqual(deliveryManifestSectionBullets(report, '添付ファイル:'), [
    'deck.editable.pptx (/tmp/deck.editable.pptx)',
    'deck.preview.html (/tmp/deck.preview.html)',
  ]);
  assert.deepEqual(deliveryManifestSectionBullets(report, 'Missing:'), []);
  assert.deepEqual(deliveryManifestSectionKeyValues(report, 'Missing:'), {});
});

test('delivery manifest utilities parse visual and PPTX internal QA lines', () => {
  const report = [
    '検証結果:',
    '- visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
    '- PPTX images: 0 (none)',
    '- PPTX special elements: 2 (oleObject:1, media:1)',
    '- PPTX hidden text: 0',
    '',
    '納品前チェック:',
    '- visual QA: blocked / source: none / uniqueSampledColors: n/a',
  ].join('\n');
  assert.deepEqual(deliveryManifestSectionVisualQa(report, '検証結果:'), {
    status: 'ready',
    source: 'chrome',
    width: 1280,
    height: 900,
    uniqueSampledColors: 42,
    line: 'ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
  });
  assert.deepEqual(deliveryManifestSectionVisualQa(report, '納品前チェック:'), {
    status: 'blocked',
    source: 'none',
    width: null,
    height: null,
    uniqueSampledColors: null,
    line: 'blocked / source: none / uniqueSampledColors: n/a',
  });
  assert.equal(
    deliveryManifestFormatVisualQa(deliveryManifestSectionVisualQa(report, '検証結果:')),
    'ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
  );
  assert.deepEqual(deliveryManifestSectionPptxInternalQa(report, '検証結果:'), {
    images: { status: 'present', count: 0, breakdown: 'none', line: 'PPTX images: 0 (none)' },
    specialElements: { status: 'present', count: 2, breakdown: 'oleObject:1, media:1', line: 'PPTX special elements: 2 (oleObject:1, media:1)' },
    hiddenText: { status: 'present', count: 0, line: 'PPTX hidden text: 0' },
  });
  assert.deepEqual(deliveryManifestSectionPptxInternalQa(report, '納品前チェック:').images, {
    status: 'missing',
    count: null,
    breakdown: null,
    line: null,
  });
});

test('delivery manifest utilities parse delivery readiness and checked artifact types', () => {
  const report = [
    '納品前チェック:',
    '- delivery readiness: blocked',
    '- reasons: visual QA blocked; PPTX images nonzero',
    '- checked artifact types: deck, onepager, none',
    '',
    'Artifact:',
    '- basename: deck',
  ].join('\n');
  assert.deepEqual(deliveryManifestSectionDeliveryReadiness(report, '納品前チェック:'), {
    status: 'blocked',
    ok: false,
    reasons: ['visual QA blocked', 'PPTX images nonzero'],
    line: 'delivery readiness: blocked',
    reasonsLine: 'reasons: visual QA blocked; PPTX images nonzero',
  });
  assert.deepEqual(deliveryManifestSectionCheckedArtifactTypes(report, '納品前チェック:'), {
    status: 'present',
    types: ['deck', 'onepager'],
    line: 'checked artifact types: deck, onepager, none',
  });
  assert.deepEqual(deliveryManifestSectionDeliveryReadiness('', '納品前チェック:'), {
    status: 'missing',
    ok: false,
    reasons: ['missing'],
    line: null,
    reasonsLine: null,
  });
  assert.deepEqual(deliveryManifestSectionCheckedArtifactTypes('', '納品前チェック:'), {
    status: 'missing',
    types: [],
    line: null,
  });
});

test('delivery manifest utilities generate checked artifact types QA line from types', () => {
  assert.deepEqual(deliveryManifestQaLines({
    checkedArtifacts: 2,
    checkedArtifactTypes: { types: ['deck', 'onepager'] },
  }), [
    'checked artifacts: 2',
    'checked artifact types: deck, onepager',
  ]);
});

test('delivery manifest utilities summarize and format visual QA', () => {
  const ready = deliveryManifestSummarizeVisualQa(
    { ok: true, source: 'fallback' },
    '/tmp/deck.png',
    {
      screenshot: {
        width: 1280,
        height: 900,
        bytes: 12345,
        uniqueSampledColors: 42,
      },
    },
  );

  assert.deepEqual(ready, {
    status: 'ready',
    source: 'fallback',
    screenshot: '/tmp/deck.png',
    width: 1280,
    height: 900,
    bytes: 12345,
    uniqueSampledColors: 42,
  });
  assert.equal(
    deliveryManifestFormatVisualQa(ready),
    'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
  );

  const blocked = deliveryManifestSummarizeVisualQa({ ok: true, source: 'chrome' }, '/tmp/deck.png', {});
  assert.deepEqual(blocked, {
    status: 'blocked',
    source: 'chrome',
    screenshot: '/tmp/deck.png',
    width: null,
    height: null,
    bytes: null,
    uniqueSampledColors: null,
  });
  assert.equal(deliveryManifestFormatVisualQa(blocked), 'blocked / source: chrome / uniqueSampledColors: n/a');
  assert.equal(
    deliveryManifestFormatVisualQa(deliveryManifestSummarizeVisualQa(false, '/tmp/deck.png', null)),
    'not generated / source: none / uniqueSampledColors: n/a',
  );
});

test('delivery manifest utilities format visual QA line via context', () => {
  const context = deliveryManifestFormatVisualQaLineContext({
    status: 'ready',
    source: 'chrome',
    width: 1280,
    height: 900,
    uniqueSampledColors: 42,
  });
  assert.deepEqual(context, {
    visualQa: {
      status: 'ready',
      source: 'chrome',
      width: 1280,
      height: 900,
      uniqueSampledColors: 42,
    },
    line: 'visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
  });
  context.visualQa.source = 'mutated';
  assert.equal(deliveryManifestFormatVisualQaLine({
    status: 'ready',
    source: 'chrome',
    width: 1280,
    height: 900,
    uniqueSampledColors: 42,
  }), 'visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42');
  assert.equal(deliveryManifestFormatVisualQaLineContext({ line: 'visual QA: ready' }).line, 'visual QA: ready');
});

test('delivery manifest utilities summarize discord report visual QA by acceptance precedence', () => {
  const report = [
    '検証結果:',
    '- visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 31',
    '納品前チェック:',
    '- visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
  ].join('\n');

  assert.deepEqual(deliveryManifestSummarizeDiscordReportVisualQa(report), {
    verification: {
      status: 'ready',
      source: 'chrome',
      width: 1280,
      height: 900,
      uniqueSampledColors: 31,
      line: 'ready / source: chrome / 1280x900 / uniqueSampledColors: 31',
    },
    acceptance: {
      status: 'ready',
      source: 'fallback',
      width: 1280,
      height: 900,
      uniqueSampledColors: 42,
      line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
    },
    source: 'fallback',
    width: 1280,
    height: 900,
    uniqueSampledColors: 42,
  });
});

test('delivery manifest utilities summarize delivery readiness gates', () => {
  const ready = deliveryManifestSummarizeDeliveryReadinessContext(
    { ok: true, imageCount: 0, specialElementCount: 0, hiddenTextCount: 0 },
    { ok: true },
    { status: 'ready' },
  );
  assert.deepEqual(ready, {
    ok: true,
    verification: 'ready',
    acceptance: 'ready',
    visualQa: 'ready',
    visualQaSource: 'none',
    visualQaWidth: null,
    visualQaHeight: null,
    visualQaUniqueSampledColors: null,
    pptxImages: 0,
    pptxSpecialElements: 0,
    pptxHiddenText: 0,
    line: 'delivery readiness: ready',
    reasonsLine: 'reasons: none',
    reasons: [],
    message: 'ready for Discord delivery',
  });
  ready.reasons.push('mutated');
  assert.deepEqual(deliveryManifestSummarizeDeliveryReadiness(
    { ok: true, imageCount: 0, specialElementCount: 0, hiddenTextCount: 0 },
    { ok: true },
    { status: 'ready' },
  ), {
    ok: true,
    verification: 'ready',
    acceptance: 'ready',
    visualQa: 'ready',
    visualQaSource: 'none',
    visualQaWidth: null,
    visualQaHeight: null,
    visualQaUniqueSampledColors: null,
    pptxImages: 0,
    pptxSpecialElements: 0,
    pptxHiddenText: 0,
    line: 'delivery readiness: ready',
    reasonsLine: 'reasons: none',
    reasons: [],
    message: 'ready for Discord delivery',
  });

  assert.deepEqual(deliveryManifestSummarizeDeliveryReadinessContext(
    { ok: false, imageCount: 2, specialElementCount: 1, hiddenTextCount: 3 },
    { ok: false },
    { status: 'blocked' },
  ), {
    ok: false,
    verification: 'blocked',
    acceptance: 'blocked',
    visualQa: 'blocked',
    visualQaSource: 'none',
    visualQaWidth: null,
    visualQaHeight: null,
    visualQaUniqueSampledColors: null,
    pptxImages: 2,
    pptxSpecialElements: 1,
    pptxHiddenText: 3,
    line: 'delivery readiness: blocked',
    reasonsLine: 'reasons: verification not ready; acceptance not ready; visual QA not ready: blocked; PPTX images present: 2; PPTX special elements present: 1; PPTX hidden text present: 3',
    reasons: [
      'verification not ready',
      'acceptance not ready',
      'visual QA not ready: blocked',
      'PPTX images present: 2',
      'PPTX special elements present: 1',
      'PPTX hidden text present: 3',
    ],
    message: 'blocked before Discord delivery',
  });
});

test('delivery manifest utilities summarize identity checks schema', () => {
  const context = deliveryManifestSummarizeIdentityChecksContext({
    report: { matched: true, mismatches: ['ignored?'] },
    deliveryMessage: { matched: false, mismatches: ['basename mismatch'] },
    deliveryManifest: { matched: 'yes', mismatches: 'not-array' },
    extra: { matched: false, mismatches: ['ignored'] },
  });
  assert.deepEqual(context, {
    report: { matched: true, mismatches: ['ignored?'] },
    deliveryMessage: { matched: false, mismatches: ['basename mismatch'] },
    deliveryManifest: { matched: false, mismatches: [] },
  });
  context.report.mismatches[0] = 'mutated';
  assert.deepEqual(deliveryManifestSummarizeIdentityChecks({
    report: { matched: true, mismatches: ['ignored?'] },
    deliveryMessage: { matched: false, mismatches: ['basename mismatch'] },
    deliveryManifest: { matched: 'yes', mismatches: 'not-array' },
    extra: { matched: false, mismatches: ['ignored'] },
  }), {
    report: { matched: true, mismatches: ['ignored?'] },
    deliveryMessage: { matched: false, mismatches: ['basename mismatch'] },
    deliveryManifest: { matched: false, mismatches: [] },
  });
  assert.equal(deliveryManifestSummarizeIdentityChecks(null), null);
});

test('delivery manifest utilities format identity checks line via context', () => {
  const identityChecks = {
    report: { matched: true, mismatches: ['ignored?'] },
    deliveryMessage: { matched: false, mismatches: ['basename mismatch'] },
    deliveryManifest: { matched: true, mismatches: [] },
  };
  const context = deliveryManifestFormatIdentityChecksLineContext(identityChecks);
  assert.deepEqual(context, {
    identityChecks: {
      identityChecks: {
        report: { matched: true, mismatches: ['ignored?'] },
        deliveryMessage: { matched: false, mismatches: ['basename mismatch'] },
        deliveryManifest: { matched: true, mismatches: [] },
      },
      order: ['report', 'deliveryMessage', 'deliveryManifest'],
      parts: ['report ready', 'deliveryMessage blocked', 'deliveryManifest ready'],
      text: 'report ready / deliveryMessage blocked / deliveryManifest ready',
      line: 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    },
    text: 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    line: 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
  });
  context.identityChecks.parts[0] = 'mutated';
  assert.equal(deliveryManifestFormatIdentityChecksLine(identityChecks), 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready');
  assert.equal(
    deliveryManifestFormatIdentityChecksLineContext(null).line,
    null,
  );
});

test('delivery manifest utilities build identity QA line policies', () => {
  const summary = {
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: false, mismatches: ['basename mismatch'] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliveryMessage: {
      actualQaLines: [
        'delivery readiness: ready',
        'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
      ],
    },
  };

  const expectedLine = deliveryManifestExpectedIdentityQaLine(summary);
  assert.equal(expectedLine, 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready');
  assert.equal(
    deliveryManifestExpectedIdentityQaLine(summary, { names: ['report', 'deliveryMessage'] }),
    'identity checks: report ready / deliveryMessage blocked',
  );
  assert.equal(deliveryManifestHasIdentityQaLine(summary), true);
  assert.deepEqual(deliveryManifestIdentityQaPolicies(expectedLine), [{
    name: 'identityChecks',
    exactLines: [expectedLine],
    reason: 'validated separately against delivery manifest identityChecks',
  }]);
  assert.deepEqual(deliveryManifestIdentityQaPolicies(null), [{
    name: 'identityChecks',
    exactLines: [],
    reason: 'validated separately against delivery manifest identityChecks',
  }]);
});

test('delivery manifest utilities build expected identity QA line via context', () => {
  const summary = {
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: false, mismatches: ['basename mismatch'] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
  };
  const context = deliveryManifestExpectedIdentityQaLineContext(summary);
  assert.deepEqual(context, {
    identityChecks: {
      order: ['report', 'deliveryMessage', 'deliveryManifest'],
      parts: ['report ready', 'deliveryMessage blocked', 'deliveryManifest ready'],
      text: 'report ready / deliveryMessage blocked / deliveryManifest ready',
      line: 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
    },
    line: 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready',
  });
  context.identityChecks.parts[0] = 'mutated';
  assert.equal(deliveryManifestExpectedIdentityQaLine(summary), 'identity checks: report ready / deliveryMessage blocked / deliveryManifest ready');
  assert.equal(deliveryManifestExpectedIdentityQaLineContext(null), null);
});

test('delivery manifest utilities centralize expected manifest QA lines', () => {
  const summary = {
    deliveryReadiness: {
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
    },
    acceptanceManifest: {
      line: 'manifest: /tmp/deck.acceptance.manifest.json',
      scopeLine: 'manifest verification scope: manifest-only',
    },
    checkedArtifacts: 2,
    checkedArtifactTypes: {
      line: 'checked artifact types: deck, html',
      types: ['deck', 'html'],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: false, mismatches: ['basename mismatch'] },
    },
    deliveryMessage: {
      actualQaLines: [
        'delivery readiness: ready',
        'identity checks: report ready / deliveryMessage ready / deliveryManifest blocked',
      ],
    },
  };

  const expected = deliveryManifestExpectedManifestQa(summary, {});
  assert.equal(expected.identityChecksRequired, true);
  assert.deepEqual(expected.identityChecks, {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: true, mismatches: [] },
    deliveryManifest: { matched: false, mismatches: ['basename mismatch'] },
  });
  assert.deepEqual(expected.qaLines, deliveryManifestQaLines(summary, { identityChecks: expected.identityChecks }));

  const withoutIdentityLine = {
    ...summary,
    deliveryMessage: { actualQaLines: ['delivery readiness: ready'] },
  };
  assert.equal(deliveryManifestExpectedManifestQa(withoutIdentityLine, {}).identityChecksRequired, false);
  assert.deepEqual(
    deliveryManifestExpectedManifestQa(withoutIdentityLine, {}).qaLines,
    deliveryManifestQaLines(withoutIdentityLine, { identityChecks: null }),
  );
  assert.equal(deliveryManifestExpectedManifestQa(withoutIdentityLine, { identityChecks: {} }).identityChecksRequired, true);
});

test('delivery manifest utilities centralize expected delivery message QA comparison', () => {
  const summary = {
    deliveryReadiness: {
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
    },
  };
  const text = [
    'QA:',
    '- delivery readiness: ready',
    '- reasons: none',
    '- identity checks: report ready / deliveryMessage ready',
  ].join('\n');

  const expected = deliveryManifestExpectedDeliveryMessageQa(summary, text);
  assert.deepEqual(expected.expectedQaLines, deliveryManifestQaLines(summary));
  assert.deepEqual(expected.actualQaLines, [
    'delivery readiness: ready',
    'reasons: none',
    'identity checks: report ready / deliveryMessage ready',
  ]);
  assert.equal(expected.expectedIdentityQaLine, 'identity checks: report ready / deliveryMessage ready');
  assert.equal(expected.qaMatched, true);
  assert.deepEqual(expected.duplicateQaLines, []);
  assert.deepEqual(expected.qaDiff.unexpectedLines, []);

  const duplicated = deliveryManifestExpectedDeliveryMessageQa(summary, `${text}\n- delivery readiness: ready`);
  assert.equal(duplicated.qaMatched, false);
  assert.deepEqual(duplicated.duplicateQaLines, ['delivery readiness: ready']);
});

test('delivery manifest utilities format delivery message QA diff errors', () => {
  const expectedQa = {
    expectedQaLines: ['delivery readiness: ready', 'reasons: none'],
    missingQaLines: ['reasons: none'],
    qaOrderMatched: false,
    duplicateQaLines: ['delivery readiness: ready'],
    qaDiff: {
      unexpectedLines: ['unverified external claim: ready'],
    },
  };

  assert.deepEqual(deliveryManifestDeliveryMessageQaErrors(expectedQa, { qaSectionPresent: true }), [
    'delivery message missing QA line: reasons: none',
    'delivery message duplicate QA line: delivery readiness: ready',
    'delivery message unexpected QA line: unverified external claim: ready',
  ]);
  assert.deepEqual(deliveryManifestDeliveryMessageQaErrors({
    ...expectedQa,
    missingQaLines: [],
  }, { qaSectionPresent: true }), [
    'delivery message QA lines are out of order',
    'delivery message duplicate QA line: delivery readiness: ready',
    'delivery message unexpected QA line: unverified external claim: ready',
  ]);
  assert.deepEqual(deliveryManifestDeliveryMessageQaErrors(expectedQa, { qaSectionPresent: false }), [
    'delivery message missing QA line: reasons: none',
    'delivery message duplicate QA line: delivery readiness: ready',
    'delivery message unexpected QA line: unverified external claim: ready',
    'delivery message missing QA section',
  ]);
});

test('delivery manifest utilities diff delivery QA lines with allowed identity policy', () => {
  const expectedLines = [
    'delivery readiness: ready',
    'visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
    'PPTX hidden text: 0',
  ];
  const actualLines = [
    'delivery readiness: ready',
    'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    'PPTX hidden text: 0',
    'unverified external claim: ready',
  ];
  const expectedIdentityQaLine = 'identity checks: report ready / deliveryMessage ready / deliveryManifest ready';

  assert.deepEqual(deliveryManifestQaLineDiff(
    expectedLines,
    actualLines,
    deliveryManifestIdentityQaPolicies(expectedIdentityQaLine),
  ), {
    expectedCount: 3,
    actualCount: 4,
    missingLines: ['visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42'],
    allowedUnexpectedLines: [expectedIdentityQaLine],
    allowedUnexpectedLinePolicies: [{
      name: 'identityChecks',
      exactLines: [expectedIdentityQaLine],
      pattern: null,
      reason: 'validated separately against delivery manifest identityChecks',
    }],
    unexpectedLines: ['unverified external claim: ready'],
    firstMismatch: {
      index: 1,
      expected: 'visual QA: ready / source: chrome / 1280x900 / uniqueSampledColors: 42',
      actual: expectedIdentityQaLine,
    },
  });
});
