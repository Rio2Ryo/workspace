import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slideToolExample, slideToolRoot, workspaceRoot } from './test-paths.mjs';
import { unusedNamedImports } from './import-contract-utils.mjs';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';

const wrapper = path.join(workspaceRoot, 'skills', 'slide-studio', 'scripts', 'shiro-slide-studio.mjs');
const studioScript = path.join(slideToolRoot, 'scripts', 'studio.mjs');

function runWrapper(args, options = {}) {
  return runNodeScript(wrapper, args, options);
}

function parseWrapperOutput(result) {
  return parseCommandJson(result, 'stdout', 'slide-studio-wrapper');
}

test('studio uses shared delivery manifest identity helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestReportIdentityChecks/);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestArtifactIdentityCheck,/m);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestIdentityFromArtifact,/m);
  assert.doesNotMatch(studioSource, /function buildIdentityChecks/);
  assert.doesNotMatch(studioSource, /deliveryManifestFormatIdentityChecks/);
  assert.match(helperSource, /deliveryManifestFormatIdentityChecks/);
  assert.match(helperSource, /export function deliveryManifestReportIdentityChecks/);
  assert.doesNotMatch(studioSource, /function artifactIdentityCheck\(/);
  assert.doesNotMatch(studioSource, /function formatIdentityChecks\(/);
});

test('studio does not keep stale delivery manifest imports', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  assert.deepEqual(unusedNamedImports(studioSource, './lib/delivery-manifest-utils.mjs'), []);
});

test('slide-studio wrapper uses shared attachment path helper', () => {
  const source = fs.readFileSync(wrapper, 'utf8');

  assert.match(source, /deliveryManifestAttachmentPathSummary/);
  assert.doesNotMatch(source, /const deliverablePaths = summary\?\.attachments\?\.deliverablePaths/);
  assert.doesNotMatch(source, /deliverablePaths: summary\?\.attachments\?\.deliverablePaths/);
});

test('studio and verifier use shared outline schema helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const verifierSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'verify.mjs'), 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'outline-schema-utils.mjs'), 'utf8');

  assert.match(studioSource, /outlineSchemaInvalidJsonMessage/);
  assert.match(studioSource, /outlineSchemaRawJsonErrors/);
  assert.doesNotMatch(studioSource, /function validateRawJsonOutline/);
  assert.match(verifierSource, /outlineSchemaDeckArtifactErrors/);
  assert.match(verifierSource, /outlineSchemaImagePromptErrors/);
  assert.doesNotMatch(verifierSource, /function outlineSchemaErrors/);
  assert.match(helperSource, /export function outlineSchemaRawJsonErrors/);
  assert.match(helperSource, /export function outlineSchemaDeckArtifactErrors/);
  assert.match(helperSource, /export function outlineSchemaImagePromptErrors/);
});

test('verifier uses shared HTML verification helpers', () => {
  const verifierSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'verify.mjs'), 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'html-verify-utils.mjs'), 'utf8');

  assert.match(verifierSource, /htmlSlideVisibilityErrors/);
  assert.match(verifierSource, /htmlSlideClippingRiskErrors/);
  assert.match(verifierSource, /htmlVisibleText/);
  assert.doesNotMatch(verifierSource, /function htmlSlideVisibilityErrors/);
  assert.doesNotMatch(verifierSource, /function htmlSlideClippingRiskErrors/);
  assert.doesNotMatch(verifierSource, /function visibleText/);
  assert.match(helperSource, /export function htmlSlideVisibilityErrors/);
  assert.match(helperSource, /export function htmlSlideClippingRiskErrors/);
  assert.match(helperSource, /export function htmlVisibleText/);
});

test('verifier uses shared PPTX inspection helpers', () => {
  const verifierSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'verify.mjs'), 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'pptx-inspection-utils.mjs'), 'utf8');

  assert.match(verifierSource, /pptxInspectWithDiagnostics/);
  assert.match(verifierSource, /pptxFormatObjectDiagnostics/);
  assert.match(verifierSource, /pptxFormatHiddenTextDiagnostics/);
  assert.doesNotMatch(verifierSource, /function inspectPptx\(/);
  assert.doesNotMatch(verifierSource, /function countPowerPointImages/);
  assert.doesNotMatch(verifierSource, /function readZipEntries/);
  assert.doesNotMatch(verifierSource, /function extractDrawingText/);
  assert.match(helperSource, /export function pptxInspectWithDiagnostics/);
  assert.match(helperSource, /export function pptxCountPowerPointImages/);
  assert.match(helperSource, /export function pptxExtractDrawingText/);
});

test('verifier uses shared screenshot QA helpers', () => {
  const verifierSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'verify.mjs'), 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'screenshot-utils.mjs'), 'utf8');

  assert.match(verifierSource, /screenshotInspectOptional/);
  assert.doesNotMatch(verifierSource, /function inspectOptionalScreenshot/);
  assert.doesNotMatch(verifierSource, /function pngPixelDiversity/);
  assert.doesNotMatch(verifierSource, /function parsePng/);
  assert.match(helperSource, /export function screenshotInspectOptional/);
  assert.match(helperSource, /export function screenshotPixelDiversity/);
});

test('verifier uses shared deck verification payload helper', () => {
  const verifierSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'verify.mjs'), 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(verifierSource, /deliveryManifestDeckVerificationPayload/);
  assert.doesNotMatch(verifierSource, /console\.error\(JSON\.stringify\(\{\n\s+\.\.\.result,\n\s+ok: false,/);
  assert.doesNotMatch(verifierSource, /const result = \{\n\s+ok: true,/);
  assert.match(helperSource, /export function deliveryManifestDeckVerificationPayload/);
});

test('onepager verifier uses shared verification payload helper', () => {
  const verifierSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'verify-onepager.mjs'), 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(verifierSource, /deliveryManifestOnepagerVerificationPayload/);
  assert.doesNotMatch(verifierSource, /const result = \{\n\s+ok,/);
  assert.doesNotMatch(verifierSource, /html: htmlPath/);
  assert.match(helperSource, /export function deliveryManifestOnepagerVerificationPayload/);
});

test('studio uses shared verification QA line helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestWriteDiscordReport/);
  assert.doesNotMatch(studioSource, /PPTX images: \$\{verification\.imageCount\}/);
  assert.doesNotMatch(studioSource, /PPTX special elements: \$\{verification\.specialElementCount\}/);
  assert.doesNotMatch(studioSource, /PPTX hidden text: \$\{verification\.hiddenTextCount/);
  assert.match(helperSource, /export function deliveryManifestVerificationQaLines/);
});

test('studio uses shared artifact section helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestWriteDiscordReport/);
  assert.doesNotMatch(studioSource, /`- name: \$\{acceptance\?\.artifact\?\.name/);
  assert.doesNotMatch(studioSource, /`- type: \$\{acceptance\?\.artifact\?\.type/);
  assert.doesNotMatch(studioSource, /`- basename: \$\{acceptance\?\.artifact\?\.basename/);
  assert.match(helperSource, /export function deliveryManifestArtifactSectionLines/);
});

test('studio uses shared usage command helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestWriteDiscordReport/);
  assert.doesNotMatch(studioSource, /function shellQuote/);
  assert.doesNotMatch(studioSource, /shiro-slide-studio\.mjs'?\)\} --input/);
  assert.doesNotMatch(studioSource, /suggest-manifest-policy\.mjs'?\)\} \$\{shellQuote\(outDir\)\}/);
  assert.match(helperSource, /export function deliveryManifestUsageCommandLines/);
});

test('studio uses shared follow-up prompt helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestWriteDiscordReport/);
  assert.doesNotMatch(studioSource, /次に試す依頼例:/);
  assert.doesNotMatch(studioSource, /トーン調整して。HTML previewとeditable PPTXを再生成/);
  assert.match(helperSource, /export function deliveryManifestFollowUpPromptLines/);
});

test('studio uses shared acceptance checklist helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestWriteDiscordReport/);
  assert.doesNotMatch(studioSource, /lines\.push\('納品前チェック:'\)/);
  assert.doesNotMatch(studioSource, /manifest verification scope: \$\{acceptance\.manifestVerification/);
  assert.doesNotMatch(studioSource, /acceptance manifest生成とverify-artifacts確認/);
  assert.match(helperSource, /export function deliveryManifestAcceptanceChecklistLines/);
  assert.match(helperSource, /export function deliveryManifestAcceptanceChecklistQaLines/);
  assert.match(helperSource, /export function deliveryManifestAcceptanceChecklistQaSummary/);
  assert.match(helperSource, /export function deliveryManifestAcceptanceArtifactValidationSummary/);
  assert.match(helperSource, /export function deliveryManifestApplyDiscordReportAcceptanceManifest/);
  assert.match(helperSource, /export function deliveryManifestAcceptanceManifestReadErrors/);
  assert.match(helperSource, /export function deliveryManifestAcceptanceVerificationReportErrors/);
  assert.match(helperSource, /export function deliveryManifestDeliveryMessageAttachmentSummary/);
  assert.match(helperSource, /export function deliveryManifestDeliveryMessageArtifactIdentitySummary/);
  assert.match(helperSource, /export function deliveryManifestDeliveryMessageReportSummary/);
  assert.match(helperSource, /export function deliveryManifestDeliveryMessageReadErrors/);
  assert.match(helperSource, /export function deliveryManifestDeliveryMessageStatusQaSummary/);
  assert.match(helperSource, /export function deliveryManifestDeliveryMessageValidationSummary/);
  assert.match(helperSource, /export function deliveryManifestDiscordReportAcceptanceGateErrors/);
  assert.match(helperSource, /export function deliveryManifestDiscordReportAcceptanceValidation/);
  assert.match(helperSource, /export function deliveryManifestDiscordReportAttachmentValidation/);
  assert.match(helperSource, /export function deliveryManifestDiscordReportBaseValidation/);
  assert.match(helperSource, /export function deliveryManifestDiscordReportMediaQaErrors/);
  assert.match(helperSource, /export function deliveryManifestDiscordReportSectionStatusErrors/);
  assert.match(helperSource, /export function deliveryManifestDiscordReportValidationSummary/);
  assert.match(helperSource, /export function deliveryManifestExpectedDeliveryMessageQa/);
  assert.match(helperSource, /export function deliveryManifestExpectedManifestQa/);
  assert.match(helperSource, /export function deliveryManifestFinalManifestReadErrors/);
  assert.match(helperSource, /export function deliveryManifestFinalManifestValidationSummary/);
  assert.match(helperSource, /export function deliveryManifestExpectedManifestReportErrors/);
  assert.match(helperSource, /export function deliveryManifestExpectedManifestReportSummary/);
  assert.match(helperSource, /deliveryManifestAcceptanceChecklistQaLines\(\{\n\s+acceptance,/);
  assert.match(helperSource, /deliveryManifestAcceptanceChecklistQaSummary\(\{ acceptance, outDir, name \}\)/);
  assert.match(helperSource, /deliveryManifestAcceptanceArtifactValidationSummary\(summary, output\.acceptanceManifest\.artifacts/);
  assert.match(helperSource, /deliveryManifestAcceptanceArtifactValidationSummary\(nextSummary, output\.deliveryManifest\.artifacts/);
  assert.match(helperSource, /deliveryManifestApplyDiscordReportAcceptanceManifest\(summary, summary\?\.acceptanceManifest\?\.path/);
  assert.match(helperSource, /deliveryManifestAcceptanceManifestReadErrors\(manifestPath/);
  assert.match(helperSource, /deliveryManifestAcceptanceVerificationReportErrors\(summary, output\.acceptanceManifest\.verification\)/);
  assert.match(helperSource, /deliveryManifestQaLines\(sharedSummary, \{ deliveryReadiness, identityChecks \}\)/);
  assert.match(helperSource, /deliveryManifestDeliveryMessageAttachmentSummary\(summary, text\)/);
  assert.match(helperSource, /deliveryManifestDeliveryMessageArtifactIdentitySummary\(summary, text, deliveryMessagePath\)/);
  assert.match(helperSource, /deliveryManifestDeliveryMessageReportSummary\(summary, text, deliveryMessagePath/);
  assert.match(helperSource, /deliveryManifestDeliveryMessageReadErrors\(deliveryMessagePath/);
  assert.match(helperSource, /deliveryManifestDeliveryMessageStatusQaSummary\(summary, text\)/);
  assert.match(helperSource, /deliveryManifestDeliveryMessageValidationSummary\(summary, text, deliveryMessagePath\)/);
  assert.match(helperSource, /deliveryManifestDiscordReportAcceptanceGateErrors\(summary, sections\)/);
  assert.match(helperSource, /deliveryManifestDiscordReportAcceptanceValidation\(nextSummary, sections, errors\)/);
  assert.match(helperSource, /deliveryManifestDiscordReportAttachmentValidation\(summary\)/);
  assert.match(helperSource, /deliveryManifestDiscordReportBaseValidation\(nextSummary, sections, cliErrors\)/);
  assert.match(helperSource, /deliveryManifestDiscordReportValidationSummary\(summary, sections, cliErrors\)/);
  assert.match(helperSource, /deliveryManifestDiscordReportMediaQaErrors\(summary, sections\)/);
  assert.match(helperSource, /deliveryManifestDiscordReportSectionStatusErrors\(sections\)/);
  assert.match(helperSource, /deliveryManifestExpectedDeliveryMessageQa\(summary, text\)/);
  assert.match(helperSource, /deliveryManifestExpectedManifestQa\(summary, parsed\)/);
  assert.match(helperSource, /deliveryManifestFinalManifestReadErrors\(manifestPath/);
  assert.match(helperSource, /deliveryManifestFinalManifestValidationSummary\(summary, parsed, manifestPath\)/);
  assert.match(helperSource, /deliveryManifestExpectedManifestReportErrors\(manifestReport\)/);
  assert.match(helperSource, /deliveryManifestExpectedManifestReportSummary\(nextSummary, parsed\)/);
});

test('studio uses shared verification result helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestWriteDiscordReport/);
  assert.doesNotMatch(studioSource, /'検証結果:'/);
  assert.doesNotMatch(studioSource, /slides: outline \$\{verification\.outlineSlides\}/);
  assert.doesNotMatch(studioSource, /outline\/HTML\/PPTX\/image prompts一致/);
  assert.match(helperSource, /export function deliveryManifestVerificationResultLines/);
});

test('studio uses shared deliverable artifact list helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestWriteDiscordReport/);
  assert.doesNotMatch(studioSource, /'作成物:'/);
  assert.doesNotMatch(studioSource, /promptsPath\.replace\(/);
  assert.match(helperSource, /export function deliveryManifestDeliverableArtifactLines/);
});

test('studio uses shared output summary helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestStudioOutputSummary/);
  assert.doesNotMatch(studioSource, /console\.log\(JSON\.stringify\(\{/);
  assert.doesNotMatch(studioSource, /screenshot: screenshot\.ok \? screenshotPath : null/);
  assert.match(helperSource, /export function deliveryManifestStudioOutputSummary/);
});

test('studio uses shared error message helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.doesNotMatch(studioSource, /deliveryManifestStudioErrorMessages/);
  assert.doesNotMatch(studioSource, /function errorToMessages/);
  assert.doesNotMatch(studioSource, /replace\(\/^-\s\+\//);
  assert.match(helperSource, /export function deliveryManifestStudioErrorMessages/);
  assert.match(helperSource, /deliveryManifestStudioErrorMessages\(error\)/);
});

test('studio uses shared error summary helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.doesNotMatch(studioSource, /deliveryManifestStudioErrorSummary/);
  assert.doesNotMatch(studioSource, /source: 'studio'/);
  assert.doesNotMatch(studioSource, /ok: false,\n\s+source:/);
  assert.match(helperSource, /export function deliveryManifestStudioErrorSummary/);
  assert.match(helperSource, /deliveryManifestStudioErrorSummary\(error\)/);
});

test('studio uses shared caught error routing helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestStudioCaughtErrorSummary/);
  assert.doesNotMatch(studioSource, /if \(error\.verify\)/);
  assert.doesNotMatch(studioSource, /JSON\.stringify\(error\.verify/);
  assert.match(helperSource, /export function deliveryManifestStudioCaughtErrorSummary/);
});

test('studio uses shared discord report context helpers', () => {
  const studioSource = fs.readFileSync(studioScript, 'utf8');
  const helperSource = fs.readFileSync(path.join(slideToolRoot, 'scripts', 'lib', 'delivery-manifest-utils.mjs'), 'utf8');

  assert.match(studioSource, /deliveryManifestDiscordReportContext/);
  assert.match(studioSource, /deliveryManifestWriteDiscordReport/);
  assert.doesNotMatch(studioSource, /function writeDiscordReport/);
  assert.doesNotMatch(studioSource, /fs\.writeFileSync\(reportPath/);
  assert.doesNotMatch(studioSource, /function writeDiscordReport\(\{ inputPath, outDir, name, outline, htmlPath/);
  assert.doesNotMatch(studioSource, /const visualQa = deliveryManifestSummarizeVisualQa\(screenshot, screenshotPath, verification\);\n\s+const verificationQaLines/);
  assert.doesNotMatch(studioSource, /lines\.push\(\.\.\.deliveryManifestVerificationResultLines/);
  assert.doesNotMatch(studioSource, /lines\.push\(\.\.\.deliveryManifestAcceptanceChecklistLines/);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestAcceptanceChecklistLines,/m);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestArtifactSectionLines,/m);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestDeliverableArtifactLines,/m);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestFollowUpPromptLines,/m);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestUsageCommandLines,/m);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestVerificationQaLines,/m);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestVerificationResultLines,/m);
  assert.doesNotMatch(studioSource, /^\s*deliveryManifestDiscordReportLines,/m);
  assert.match(helperSource, /export function deliveryManifestDiscordReportContext/);
  assert.match(helperSource, /export function deliveryManifestDiscordReportLines/);
  assert.match(helperSource, /export function deliveryManifestWriteDiscordReport/);
});

test('slide-studio wrapper verifies generated decks by default', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-studio-wrapper-test-'));
  const out = path.join(dir, 'out');
  const result = runWrapper([
    slideToolExample('ai-slide-workflow.md'),
    '--out',
    out,
    '--name',
    'sample',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const generated = parseWrapperOutput(result);
  assert.equal(generated.verification.ok, true);
  assert.equal(generated.verification.outlineSlides, 7);
  assert.equal(generated.verification.pptxSlides, 7);
  assert.equal(generated.discordReady.ok, true);
  assert.deepEqual(generated.discordReady.deliveryReadiness, generated.deliveryReadiness);
  assert.deepEqual(generated.discordReady.deliveryReadiness.reasons, []);
  assert.deepEqual(generated.discordReady.attachments.required.map((attachment) => attachment.type), ['pptx', 'html']);
  assert.deepEqual(generated.discordReady.attachments.optional.map((attachment) => attachment.type), ['outline', 'prompts']);
  assert.deepEqual(generated.discordReady.attachments.deliverablePaths, [
    generated.pptx,
    generated.html,
    generated.outline,
    generated.imagePromptsMarkdown,
  ]);
  assert.deepEqual(generated.discordReady.attachments.auditPaths, [
    path.join(out, 'sample.acceptance.manifest.json'),
  ]);
  assert.deepEqual(generated.discordReady.attachments.postablePaths, [
    generated.pptx,
    generated.html,
    generated.outline,
    generated.imagePromptsMarkdown,
    path.join(out, 'sample.acceptance.manifest.json'),
  ]);
  assert.match(generated.discordReady.deliveryMessage, /納品準備OK: AIでスライドを作る最新ワークフロー/);
  assert.match(generated.discordReady.deliveryMessage, /Artifact:/);
  assert.match(generated.discordReady.deliveryMessage, /- name: sample deck/);
  assert.match(generated.discordReady.deliveryMessage, /- type: deck/);
  assert.match(generated.discordReady.deliveryMessage, new RegExp(`- dir: ${out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(generated.discordReady.deliveryMessage, /- basename: sample/);
  assert.match(generated.discordReady.deliveryMessage, /QA:/);
  assert.match(generated.discordReady.deliveryMessage, /delivery readiness: ready/);
  assert.match(generated.discordReady.deliveryMessage, /reasons: none/);
  assert.match(generated.discordReady.deliveryMessage, /manifest: .*sample\.acceptance\.manifest\.json/);
  assert.match(generated.discordReady.deliveryMessage, /manifest verification scope: manifest-only/);
  assert.match(generated.discordReady.deliveryMessage, /checked artifacts: 1/);
  assert.match(generated.discordReady.deliveryMessage, /checked artifact types: deck/);
  assert.match(generated.discordReady.deliveryMessage, /identity checks: report ready \/ deliveryMessage ready/);
  assert.match(generated.discordReady.deliveryMessage, /visual QA: ready/);
  assert.match(generated.discordReady.deliveryMessage, /PPTX images: 0 \(none\)/);
  assert.match(generated.discordReady.deliveryMessage, /PPTX special elements: 0 \(none\)/);
  assert.match(generated.discordReady.deliveryMessage, /PPTX hidden text: 0/);
  assert.match(generated.discordReady.deliveryMessage, /添付ファイル:/);
  assert.match(generated.discordReady.deliveryMessage, /sample\.editable\.pptx/);
  assert.match(generated.discordReady.deliveryMessage, /sample\.preview\.html/);
  assert.match(generated.discordReady.deliveryMessage, /sample\.outline\.json/);
  assert.match(generated.discordReady.deliveryMessage, /sample\.image-prompts\.md/);
  assert.match(generated.discordReady.deliveryMessage, /監査ファイル:/);
  assert.match(generated.discordReady.deliveryMessage, /sample\.acceptance\.manifest\.json/);
  assert.equal(generated.discordReady.deliveryMessagePath, path.join(out, 'delivery-message.md'));
  assert.equal(generated.discordReady.deliveryMessageVerified, true);
  assert.equal(generated.discordReady.identityChecks.report.matched, true);
  assert.equal(generated.discordReady.identityChecks.deliveryMessage.matched, true);
  assert.equal(generated.discordReady.identityChecks.deliveryManifest.matched, true);
  assert.equal(fs.readFileSync(generated.discordReady.deliveryMessagePath, 'utf8'), `${generated.discordReady.deliveryMessage}\n`);
  assert.equal(generated.discordReady.deliveryManifestPath, path.join(out, 'delivery-manifest.json'));
  assert.equal(generated.discordReady.deliveryManifestVerified, true);
  const deliveryManifest = JSON.parse(fs.readFileSync(generated.discordReady.deliveryManifestPath, 'utf8'));
  assert.equal(deliveryManifest.schemaVersion, 1);
  assert.equal(deliveryManifest.title, generated.verification.title || 'AIでスライドを作る最新ワークフロー');
  assert.equal(deliveryManifest.artifactName, generated.acceptance.artifact.name);
  assert.equal(deliveryManifest.artifactType, generated.acceptance.artifact.type);
  assert.equal(deliveryManifest.artifactDir, generated.acceptance.artifact.dir);
  assert.equal(deliveryManifest.basename, generated.acceptance.artifact.basename);
  assert.deepEqual(deliveryManifest.identityChecks, {
    report: { matched: true, mismatches: [] },
    deliveryMessage: { matched: true, mismatches: [] },
    deliveryManifest: { matched: true, mismatches: [] },
  });
  assert.deepEqual(deliveryManifest.deliverablePaths, generated.discordReady.attachments.deliverablePaths);
  assert.deepEqual(deliveryManifest.auditPaths, generated.discordReady.attachments.auditPaths);
  assert.deepEqual(deliveryManifest.qaLines, [
    'delivery readiness: ready',
    'reasons: none',
    `manifest: ${path.join(out, 'sample.acceptance.manifest.json')}`,
    'manifest verification scope: manifest-only',
    'checked artifacts: 1',
    'checked artifact types: deck',
    'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
    `visual QA: ready / source: ${generated.visualQa.source} / ${generated.visualQa.width}x${generated.visualQa.height} / uniqueSampledColors: ${generated.visualQa.uniqueSampledColors}`,
    'PPTX images: 0 (none)',
    'PPTX special elements: 0 (none)',
    'PPTX hidden text: 0',
  ]);
  const acceptanceManifest = JSON.parse(fs.readFileSync(path.join(out, 'sample.acceptance.manifest.json'), 'utf8'));
  assert.deepEqual(acceptanceManifest.artifacts[0].auditFiles, [
    generated.discordReady.deliveryManifestPath,
    generated.discordReport,
    generated.discordReady.deliveryMessagePath,
  ]);
  assert.equal(fs.existsSync(generated.imagePrompts), true);
  assert.equal(fs.existsSync(generated.imagePromptsMarkdown), true);
});

test('slide-studio wrapper blocks explicit no-verify reports from posting', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-studio-wrapper-no-verify-test-'));
  const out = path.join(dir, 'out');
  const result = runWrapper([
    slideToolExample('ai-slide-workflow.md'),
    '--out',
    out,
    '--name',
    'sample',
    '--no-verify',
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verification skipped by explicit --no-verify/);
  assert.match(result.stderr, /discord report is not ready for posting/);
  assert.match(result.stderr, /verification status is blocked/);
  assert.match(result.stderr, /acceptance status is blocked/);
  const generated = parseWrapperOutput(result);
  assert.equal(generated.verification, null);
  assert.equal(generated.acceptance, null);
  const report = fs.readFileSync(generated.discordReport, 'utf8');
  assert.match(report, /検証結果:/);
  assert.match(report, /- status: blocked/);
  assert.match(report, /納品不可: `--verify`/);
  assert.match(report, /納品前チェック:/);
});

test('slide-studio wrapper works from outside the workspace cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-studio-wrapper-cwd-test-'));
  const out = path.join(dir, 'out');
  const result = runWrapper([
    slideToolExample('ai-slide-workflow.md'),
    '--out',
    out,
    '--name',
    'sample',
  ], { cwd: os.tmpdir() });

  assert.equal(result.status, 0, result.stderr);
  const generated = parseWrapperOutput(result);
  assert.equal(generated.verification.ok, true);
  assert.equal(generated.verification.outlineSlides, 7);
  assert.equal(generated.verification.pptxSlides, 7);
});

test('slide-studio wrapper resolves relative out paths from the caller cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-studio-wrapper-relative-out-test-'));
  const outName = 'relative-out';
  const result = runWrapper([
    slideToolExample('ai-slide-workflow.md'),
    '--out',
    outName,
    '--name',
    'sample',
  ], { cwd: dir });

  assert.equal(result.status, 0, result.stderr);
  const generated = parseWrapperOutput(result);
  const realDir = fs.realpathSync(dir);
  assert.equal(generated.verification.ok, true);
  assert.equal(generated.outline, path.join(realDir, outName, 'sample.outline.json'));
  assert.equal(fs.existsSync(path.join(realDir, outName, 'sample.editable.pptx')), true);
});

test('slide-studio wrapper resolves relative positional input from the caller cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-studio-wrapper-relative-input-test-'));
  fs.writeFileSync(path.join(dir, 'brief.json'), JSON.stringify({
    title: 'Local Brief',
    slides: [{ title: 'Local Brief', speakerNotes: 'caller cwd input should work' }],
  }));

  const result = runWrapper([
    'brief.json',
    '--out',
    'out',
    '--name',
    'local',
  ], { cwd: dir });

  assert.equal(result.status, 0, result.stderr);
  const generated = parseWrapperOutput(result);
  const realDir = fs.realpathSync(dir);
  assert.equal(generated.input, path.join(realDir, 'brief.json'));
  assert.equal(generated.verification.ok, true);
  assert.equal(fs.existsSync(path.join(realDir, 'out', 'local.editable.pptx')), true);
});

test('slide-studio wrapper resolves explicit --input from the caller cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-studio-wrapper-explicit-input-test-'));
  fs.writeFileSync(path.join(dir, 'brief.json'), JSON.stringify({
    title: 'Explicit Local Brief',
    slides: [{ title: 'Explicit Local Brief', speakerNotes: 'explicit caller cwd input should work' }],
  }));

  const result = runWrapper([
    '--input',
    'brief.json',
    '--out',
    'out',
    '--name',
    'local',
  ], { cwd: dir });

  assert.equal(result.status, 0, result.stderr);
  const generated = parseWrapperOutput(result);
  const realDir = fs.realpathSync(dir);
  assert.equal(generated.input, path.join(realDir, 'brief.json'));
  assert.equal(generated.verification.ok, true);
  assert.equal(fs.existsSync(path.join(realDir, 'out', 'local.editable.pptx')), true);
});
