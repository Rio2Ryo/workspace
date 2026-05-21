import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  artifactManifestValidationErrors,
  artifactManifestVerificationPolicyErrors,
  normalizeArtifactManifestDir,
} from './lib/artifact-manifest-utils.mjs';
import {
  deliveryManifestAuditFileSetErrors,
  deliveryManifestAuditValidationErrors,
  deliveryManifestArtifactsVerificationPayload,
  deliveryManifestDiscordReportAuditMessages,
  deliveryManifestMissingReferencedPaths,
} from './lib/delivery-manifest-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const manifestPath = process.env.SLIDE_TOOL_ARTIFACT_MANIFEST || path.join(rootDir, 'artifacts.manifest.json');
const manifestRootDir = path.dirname(manifestPath);
const manifestOnly = process.env.SLIDE_TOOL_ARTIFACT_SCOPE === 'manifest-only';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const manifestValidationErrors = artifactManifestValidationErrors(manifest, { manifestRootDir });
if (manifestValidationErrors.length) {
  const payload = deliveryManifestArtifactsVerificationPayload({
    manifestPath,
    checked: 0,
    manifestErrors: manifestValidationErrors,
    results: [],
  });
  console.log(JSON.stringify(payload, null, 2));
  process.exit(1);
}

const checks = manifest.artifacts.map((artifact) => ({
  name: artifact.name,
  type: artifact.type,
  dir: artifact.dir,
  basename: artifact.basename,
  artifact,
  ...checkForArtifact(artifact),
}));

const results = [];
const errors = [];

if (!manifestOnly) {
  for (const unregistered of unregisteredArtifactDirs(manifest.artifacts, manifest.ignoreDirs || [], manifestRootDir)) {
    errors.push(`unregistered artifact output dir: ${unregistered}`);
  }
}

for (const check of checks) {
  const [cmd, ...args] = check.command;
  const run = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...(check.env || {}) } });
  let parsed = null;
  try {
    parsed = JSON.parse(run.status === 0 ? run.stdout : run.stderr);
  } catch {
    parsed = null;
  }
  const policyErrors = run.status === 0 ? artifactPolicyErrors(check.artifact, parsed) : [];
  results.push({
    name: check.name,
    type: check.type,
    dir: check.dir,
    basename: check.basename,
    ok: run.status === 0 && policyErrors.length === 0,
    command: check.command.join(' '),
    result: parsed || run.stdout.trim(),
    error: [parsed?.errors?.join('\n') || (!parsed ? run.stderr.trim() : ''), ...policyErrors].filter(Boolean).join('\n'),
  });
}

const failed = results.filter((result) => !result.ok);
const payload = deliveryManifestArtifactsVerificationPayload({
  manifestPath,
  checkedArtifactTypes: [...new Set(results.map((result) => result.type))],
  manifestErrors: errors,
  results,
});
console.log(JSON.stringify(payload, null, 2));

if (failed.length || errors.length) process.exit(1);

function checkForArtifact(artifact) {
  if (artifact.type === 'deck') {
    const env = {};
    if (artifact.maxPptxImages !== undefined) env.SLIDE_TOOL_MAX_PPTX_IMAGES = String(artifact.maxPptxImages);
    if (artifact.maxPptxSpecialElements !== undefined) env.SLIDE_TOOL_MAX_PPTX_SPECIAL_ELEMENTS = String(artifact.maxPptxSpecialElements);
    return { command: ['node', path.join(rootDir, 'scripts', 'verify.mjs'), artifact.dir, artifact.basename], env };
  }
  if (artifact.type === 'onepager') {
    return {
      command: ['node', path.join(rootDir, 'scripts', 'verify-onepager.mjs'), artifact.dir, artifact.basename, ...(artifact.requiredTerms || [])],
      env: {},
    };
  }
  throw new Error(`unknown artifact type: ${artifact.type}`);
}

function unregisteredArtifactDirs(artifacts, ignoreDirs, baseDir) {
  const registered = new Set(artifacts.map((artifact) => normalizeArtifactManifestDir(artifact.dir, baseDir)));
  const outDir = path.join(baseDir, 'out');
  if (!fs.existsSync(outDir)) return [];
  return fs.readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(outDir, entry.name))
    .filter((dir) => looksLikeVerifiableArtifact(dir))
    .filter((dir) => !isIgnoredDir(dir, ignoreDirs, baseDir))
    .filter((dir) => !registered.has(path.normalize(dir)));
}

function isIgnoredDir(dir, ignoreDirs, baseDir) {
  const normalizedDir = path.normalize(dir);
  return ignoreDirs.some((ignoreDir) => {
    const normalizedIgnore = normalizeArtifactManifestDir(ignoreDir, baseDir);
    if (normalizedIgnore.endsWith('*')) return normalizedDir.startsWith(normalizedIgnore.slice(0, -1));
    return normalizedDir === normalizedIgnore;
  });
}

function looksLikeVerifiableArtifact(dir) {
  const files = fs.readdirSync(dir);
  return files.some((file) => file.endsWith('.outline.json') || file.endsWith('.editable.pptx') || file.endsWith('.preview.html') || file.endsWith('.svg'));
}

function artifactPolicyErrors(artifact, parsedResult) {
  const errors = [];
  errors.push(...deliveryManifestAuditFileSetErrors(artifact));
  for (const auditFile of artifact.auditFiles || []) {
    if (!fileExistsAndNonEmpty(auditFile)) {
      errors.push(`artifact policy failed: ${artifact.name} audit file is missing or empty: ${auditFile}`);
      continue;
    }
    errors.push(...auditFileContentErrors(artifact, auditFile));
  }
  errors.push(...artifactManifestVerificationPolicyErrors(artifact, parsedResult));
  return errors;
}

function fileExistsAndNonEmpty(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function auditFileContentErrors(artifact, auditFile) {
  const errors = [];
  if (path.basename(auditFile) === 'discord-report.md') return discordReportAuditErrors(artifact, auditFile);
  if (path.basename(auditFile) !== 'delivery-manifest.json') return errors;
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
  } catch (error) {
    return [`artifact policy failed: ${artifact.name} delivery manifest is unreadable: ${auditFile}: ${error.message}`];
  }
  const missingDeliverablePaths = deliveryManifestMissingReferencedPaths(parsed, 'deliverablePaths', fileExistsAndNonEmpty);
  const missingAuditPaths = deliveryManifestMissingReferencedPaths(parsed, 'auditPaths', fileExistsAndNonEmpty);
  errors.push(...deliveryManifestAuditValidationErrors(parsed, artifact, {
    auditFile,
    missingDeliverablePaths,
    missingAuditPaths,
  }));
  return errors;
}

function discordReportAuditErrors(artifact, reportPath) {
  if (process.env.SLIDE_TOOL_SKIP_DISCORD_REPORT_AUDIT === '1') return [];
  const deliveryManifestPath = path.join(artifact.dir, 'delivery-manifest.json');
  const deliveryMessagePath = path.join(artifact.dir, 'delivery-message.md');
  const args = [path.join(rootDir, 'scripts', 'verify-discord-report.mjs'), reportPath];
  if (fileExistsAndNonEmpty(deliveryMessagePath)) args.push('--delivery-message', deliveryMessagePath);
  if (fileExistsAndNonEmpty(deliveryManifestPath)) args.push('--delivery-manifest', deliveryManifestPath);
  const run = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_SKIP_DISCORD_REPORT_AUDIT: '1' },
  });
  if (run.status === 0) return [];
  const messages = deliveryManifestDiscordReportAuditMessages(run).join('\n');
  return [`artifact policy failed: ${artifact.name} discord report audit failed: ${reportPath}: ${messages}`];
}
