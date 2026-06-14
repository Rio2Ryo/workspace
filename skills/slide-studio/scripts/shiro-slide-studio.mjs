#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deliveryManifestAttachmentPathSummary,
  deliveryManifestFormatIdentityChecks,
  deliveryManifestQaLines,
  deliveryManifestSummarizeIdentityChecks,
} from '../../../slide-tool/scripts/lib/delivery-manifest-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspace = path.resolve(__dirname, '..', '..', '..');
const script = path.join(workspace, 'slide-tool', 'scripts', 'studio.mjs');
const reportVerifier = path.join(workspace, 'slide-tool', 'scripts', 'verify-discord-report.mjs');
const rawArgs = process.argv.slice(2);
const noVerify = rawArgs.includes('--no-verify');
const callerCwd = process.cwd();
const args = normalizePathArgs(rawArgs.filter((arg) => arg !== '--no-verify'), callerCwd);
if (noVerify) {
  console.error('[slide-studio] verification skipped by explicit --no-verify');
} else if (!args.includes('--verify')) {
  args.push('--verify');
}

const result = spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8',
  cwd: workspace,
});

if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.status ?? 1);
}

const generated = parseJson(result.stdout);
if (!generated?.discordReport) {
  if (result.stdout) process.stdout.write(result.stdout);
  console.error('[slide-studio] generated output did not include discordReport; cannot verify report readiness');
  process.exit(1);
}

const reportCheck = spawnSync(process.execPath, [reportVerifier, generated.discordReport], {
  encoding: 'utf8',
  cwd: workspace,
});
if (reportCheck.status !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  console.error('[slide-studio] discord report is not ready for posting');
  if (reportCheck.stdout) process.stderr.write(reportCheck.stdout);
  if (reportCheck.stderr) process.stderr.write(reportCheck.stderr);
  process.exit(reportCheck.status ?? 1);
}

const reportReady = parseJson(reportCheck.stdout);
const discordReady = {
  ok: reportReady?.ok === true,
  message: reportReady?.summary?.message || null,
  deliveryReadiness: generated.deliveryReadiness || null,
  attachments: reportReady?.summary?.attachments || null,
  warnings: reportReady?.warnings || [],
};
discordReady.deliveryMessage = buildDeliveryMessage(reportReady?.summary, discordReady.warnings, generated.deliveryReadiness, generated);
discordReady.deliveryMessagePath = path.join(path.dirname(generated.discordReport), 'delivery-message.md');
fs.writeFileSync(discordReady.deliveryMessagePath, `${discordReady.deliveryMessage}\n`, 'utf8');
discordReady.deliveryManifest = buildDeliveryManifest(reportReady?.summary, discordReady.warnings, generated.deliveryReadiness, generated);
discordReady.deliveryManifestPath = path.join(path.dirname(generated.discordReport), 'delivery-manifest.json');
fs.writeFileSync(discordReady.deliveryManifestPath, `${JSON.stringify(discordReady.deliveryManifest, null, 2)}\n`, 'utf8');
registerDeliveryAuditFiles(reportReady?.summary?.acceptanceManifest?.path, [
  discordReady.deliveryManifestPath,
  generated.discordReport,
  discordReady.deliveryMessagePath,
]);
const deliveryCheck = spawnSync(process.execPath, [
  reportVerifier,
  generated.discordReport,
  '--delivery-message',
  discordReady.deliveryMessagePath,
  '--delivery-manifest',
  discordReady.deliveryManifestPath,
], {
  encoding: 'utf8',
  cwd: workspace,
});
if (deliveryCheck.status !== 0) {
  console.error('[slide-studio] delivery message is not ready for posting');
  if (deliveryCheck.stdout) process.stderr.write(deliveryCheck.stdout);
  if (deliveryCheck.stderr) process.stderr.write(deliveryCheck.stderr);
  process.exit(deliveryCheck.status ?? 1);
}
const deliveryReady = parseJson(deliveryCheck.stdout);
discordReady.identityChecks = deliveryReady?.summary?.identityChecks || null;
const deliveryMessageIdentityChecks = deliveryManifestSummarizeIdentityChecks(discordReady.identityChecks, {
  names: ['report', 'deliveryMessage'],
});
discordReady.deliveryMessage = buildDeliveryMessage(
  reportReady?.summary,
  discordReady.warnings,
  generated.deliveryReadiness,
  generated,
  deliveryMessageIdentityChecks,
);
fs.writeFileSync(discordReady.deliveryMessagePath, `${discordReady.deliveryMessage}\n`, 'utf8');
discordReady.deliveryManifest = buildDeliveryManifest(reportReady?.summary, discordReady.warnings, generated.deliveryReadiness, generated, discordReady.identityChecks);
fs.writeFileSync(discordReady.deliveryManifestPath, `${JSON.stringify(discordReady.deliveryManifest, null, 2)}\n`, 'utf8');
const finalDeliveryCheck = spawnSync(process.execPath, [
  reportVerifier,
  generated.discordReport,
  '--delivery-message',
  discordReady.deliveryMessagePath,
  '--delivery-manifest',
  discordReady.deliveryManifestPath,
], {
  encoding: 'utf8',
  cwd: workspace,
});
if (finalDeliveryCheck.status !== 0) {
  console.error('[slide-studio] final delivery message is not ready for posting');
  if (finalDeliveryCheck.stdout) process.stderr.write(finalDeliveryCheck.stdout);
  if (finalDeliveryCheck.stderr) process.stderr.write(finalDeliveryCheck.stderr);
  process.exit(finalDeliveryCheck.status ?? 1);
}
discordReady.deliveryMessageVerified = true;
discordReady.deliveryManifestVerified = true;
process.stdout.write(JSON.stringify({
  ...generated,
  discordReady,
}, null, 2));
process.stdout.write('\n');
process.exit(0);

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildDeliveryMessage(summary, warnings = [], deliveryReadiness = null, generated = null, identityChecks = null) {
  const title = summary?.title || 'slide deck';
  const artifact = generated?.acceptance?.artifact || null;
  const { deliverablePaths, auditPaths } = deliveryAttachmentPaths(summary);
  const qaLines = deliveryManifestQaLines(summary, { deliveryReadiness, identityChecks, allowVerificationFallback: true });
  const lines = [
    `納品準備OK: ${title}`,
    summary?.message ? `検証: ${summary.message}` : '検証: ready',
    '',
    'Artifact:',
    `- name: ${artifact?.name || ''}`,
    `- type: ${artifact?.type || ''}`,
    `- dir: ${artifact?.dir || ''}`,
    `- basename: ${artifact?.basename || ''}`,
    '',
    'QA:',
    ...qaLines.map((line) => `- ${line}`),
    '',
    '添付ファイル:',
    ...deliverablePaths.map((filePath) => `- ${path.basename(filePath)} (${filePath})`),
  ];
  if (auditPaths.length) {
    lines.push('', '監査ファイル:', ...auditPaths.map((filePath) => `- ${path.basename(filePath)} (${filePath})`));
  }
  if (warnings.length) {
    lines.push('', '注意:', ...warnings.map((warning) => `- ${warning}`));
  }
  return lines.join('\n');
}

function buildDeliveryManifest(summary, warnings = [], deliveryReadiness = null, generated = null, identityChecks = null) {
  const artifact = generated?.acceptance?.artifact || null;
  const { deliverablePaths, auditPaths } = deliveryAttachmentPaths(summary);
  const manifest = {
    schemaVersion: 1,
    title: summary?.title || null,
    artifactName: artifact?.name || null,
    artifactType: artifact?.type || null,
    artifactDir: artifact?.dir || null,
    basename: artifact?.basename || null,
    readyHeader: `納品準備OK: ${summary?.title || 'slide deck'}`,
    verificationHeader: summary?.message ? `検証: ${summary.message}` : '検証: ready',
    qaLines: deliveryManifestQaLines(summary, { deliveryReadiness, identityChecks, allowVerificationFallback: true }),
    deliverablePaths,
    auditPaths,
    warnings,
  };
  const identitySummary = deliveryManifestSummarizeIdentityChecks(identityChecks);
  if (identitySummary) manifest.identityChecks = identitySummary;
  return manifest;
}

function deliveryAttachmentPaths(summary) {
  return deliveryManifestAttachmentPathSummary(summary?.attachments || {});
}

function registerDeliveryAuditFiles(acceptanceManifestPath, auditFiles) {
  if (!acceptanceManifestPath) {
    console.error('[slide-studio] acceptance manifest is missing; cannot register delivery audit files');
    process.exit(1);
  }
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(acceptanceManifestPath, 'utf8'));
  } catch (error) {
    console.error(`[slide-studio] acceptance manifest is unreadable; cannot register delivery audit files: ${error.message}`);
    process.exit(1);
  }
  const artifactDir = path.dirname(auditFiles[0]);
  const artifact = (manifest.artifacts || []).find((entry) => path.resolve(entry.dir) === path.resolve(artifactDir));
  if (!artifact) {
    console.error('[slide-studio] acceptance manifest has no artifact matching delivery audit directory');
    process.exit(1);
  }
  const existing = Array.isArray(artifact.auditFiles) ? artifact.auditFiles : [];
  artifact.auditFiles = [...new Set([...existing, ...auditFiles])];
  fs.writeFileSync(acceptanceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function formatIdentityChecks(identityChecks) {
  return deliveryManifestFormatIdentityChecks(identityChecks);
}

function normalizePathArgs(args, baseDir) {
  const normalized = [...args];
  let positionalInputSeen = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--out') {
      const value = normalized[i + 1];
      if (value && !path.isAbsolute(value)) normalized[i + 1] = path.resolve(baseDir, value);
      i += 1;
      continue;
    }
    if (arg === '--input') {
      const value = normalized[i + 1];
      if (value && !path.isAbsolute(value)) normalized[i + 1] = resolveInputPath(value, baseDir);
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      if (['--name'].includes(arg)) i += 1;
      continue;
    }
    if (!positionalInputSeen && !path.isAbsolute(arg)) normalized[i] = resolveInputPath(arg, baseDir);
    positionalInputSeen = true;
  }
  return normalized;
}

function resolveInputPath(value, baseDir) {
  const callerPath = path.resolve(baseDir, value);
  if (fs.existsSync(callerPath)) return callerPath;
  return value;
}
