import fs from 'node:fs';
import path from 'node:path';

function deliveryManifestCloneSummary(summary) {
  if (!summary) return summary;
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(summary);
  return JSON.parse(JSON.stringify(summary));
}

export function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function duplicateDeliveryManifestArrayValues(manifest, field, options = {}) {
  if (!Array.isArray(manifest?.[field])) return [];
  const allowed = Array.isArray(options.allowedValues) ? new Set(options.allowedValues) : null;
  return duplicateValues(
    manifest[field]
      .filter((value) => typeof value === 'string')
      .filter((value) => !allowed || allowed.has(value)),
  );
}

export function deliveryManifestStringArrayValidationErrors(manifest, options = {}) {
  const label = options.label || 'delivery manifest';
  const suffix = options.suffix || '';
  const errors = [];
  for (const field of ['qaLines', 'deliverablePaths', 'auditPaths']) {
    if (!Array.isArray(manifest?.[field])) {
      errors.push(`${label} ${field} must be an array${suffix}`);
      continue;
    }
    if (manifest[field].some((value) => typeof value !== 'string' || value.trim() === '')) {
      errors.push(`${label} ${field} must contain only non-empty strings${suffix}`);
    }
  }
  return errors;
}

export function deliveryManifestIdentityChecksValidationErrors(identityChecks, options = {}) {
  const label = options.label || 'delivery manifest';
  const suffix = options.suffix || '';
  const errors = [];
  if (!identityChecks || typeof identityChecks !== 'object' || Array.isArray(identityChecks)) {
    errors.push(`${label} identityChecks must be an object when provided${suffix}`);
    return errors;
  }
  const allowedNames = new Set(['report', 'deliveryMessage', 'deliveryManifest']);
  for (const name of Object.keys(identityChecks)) {
    if (!allowedNames.has(name)) {
      errors.push(`${label} identityChecks.${name} is not supported${suffix}`);
    }
  }
  for (const name of allowedNames) {
    if (identityChecks[name] === undefined) continue;
    const entry = identityChecks[name];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label} identityChecks.${name} must be an object${suffix}`);
      continue;
    }
    if (typeof entry.matched !== 'boolean') {
      errors.push(`${label} identityChecks.${name}.matched must be a boolean${suffix}`);
    }
    if (!Array.isArray(entry.mismatches)) {
      errors.push(`${label} identityChecks.${name}.mismatches must be an array${suffix}`);
    } else if (entry.mismatches.some((value) => typeof value !== 'string')) {
      errors.push(`${label} identityChecks.${name}.mismatches must contain only strings${suffix}`);
    }
  }
  return errors;
}

export function deliveryManifestArrayItemLabel(field) {
  if (field === 'qaLines') return 'QA line';
  if (field === 'deliverablePaths') return 'deliverable path';
  if (field === 'auditPaths') return 'audit path';
  return field.slice(0, -1);
}

export function deliveryManifestExpectedDeliverablePaths(artifact) {
  if (artifact?.type !== 'deck') return [];
  const base = path.join(artifact.dir, artifact.basename);
  return [
    `${base}.editable.pptx`,
    `${base}.preview.html`,
    `${base}.outline.json`,
    `${base}.image-prompts.md`,
  ];
}

export function deliveryManifestExpectedAuditPaths(artifact) {
  if (artifact?.type !== 'deck') return [];
  return [path.join(artifact.dir, `${artifact.basename}.acceptance.manifest.json`)];
}

export function deliveryManifestExpectedAuditFiles(artifact) {
  if (artifact?.type !== 'deck') return [];
  return [
    path.join(artifact.dir, 'delivery-manifest.json'),
    path.join(artifact.dir, 'discord-report.md'),
    path.join(artifact.dir, 'delivery-message.md'),
  ];
}

export function deliveryManifestAuditFileSetErrors(artifact) {
  const expected = artifact?.auditFiles !== undefined ? deliveryManifestExpectedAuditFiles(artifact) : [];
  if (!expected.length) return [];
  if (normalizePathList(artifact.auditFiles).join('\n') === normalizePathList(expected).join('\n')) return [];
  return [`artifact policy failed: ${artifact.name} auditFiles mismatch: expected ${formatPathList(expected)} / actual ${formatPathList(artifact.auditFiles || [])}`];
}

export function deliveryManifestMissingReferencedPaths(manifest, field, fileExists) {
  if (!Array.isArray(manifest?.[field])) return [];
  return manifest[field]
    .filter((value) => typeof value === 'string' && value.trim() !== '')
    .filter((filePath) => !fileExists(filePath));
}

export function deliveryManifestAuditValidationErrors(manifest, artifact, options = {}) {
  const auditFile = options.auditFile || 'delivery-manifest.json';
  const label = options.label || `artifact policy failed: ${artifact.name} delivery manifest`;
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [`${label} must be an object: ${auditFile}`];
  }
  if (manifest.schemaVersion !== 1) errors.push(`${label} schemaVersion must be 1: ${auditFile}`);
  for (const field of ['title', 'readyHeader', 'verificationHeader']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
      errors.push(`${label} ${field} must be a non-empty string: ${auditFile}`);
    }
  }
  if (manifest.artifactName !== undefined && manifest.artifactName !== artifact.name) {
    errors.push(`${label} artifactName mismatch: expected ${artifact.name} / actual ${manifest.artifactName}`);
  }
  if (manifest.artifactType !== undefined && manifest.artifactType !== artifact.type) {
    errors.push(`${label} artifactType mismatch: expected ${artifact.type} / actual ${manifest.artifactType}`);
  }
  if (manifest.artifactDir !== undefined && path.normalize(String(manifest.artifactDir)) !== path.normalize(artifact.dir)) {
    errors.push(`${label} artifactDir mismatch: expected ${artifact.dir} / actual ${manifest.artifactDir}`);
  }
  if (manifest.basename !== undefined && manifest.basename !== artifact.basename) {
    errors.push(`${label} basename mismatch: expected ${artifact.basename} / actual ${manifest.basename}`);
  }

  errors.push(...deliveryManifestStringArrayValidationErrors(manifest, { label, suffix: `: ${auditFile}` }));
  for (const field of ['qaLines', 'deliverablePaths', 'auditPaths']) {
    if (!Array.isArray(manifest[field])) continue;
    for (const value of duplicateDeliveryManifestArrayValues(manifest, field)) {
      errors.push(`${label} duplicate ${deliveryManifestArrayItemLabel(field)}: ${value}`);
    }
  }
  if (manifest.identityChecks !== undefined) {
    errors.push(...deliveryManifestIdentityChecksValidationErrors(manifest.identityChecks, { label, suffix: `: ${auditFile}` }));
  }

  for (const filePath of options.missingDeliverablePaths || []) {
    errors.push(`${label} deliverable file is missing or empty: ${filePath}`);
  }
  const expectedDeliverablePaths = deliveryManifestExpectedDeliverablePaths(artifact);
  if (Array.isArray(manifest.deliverablePaths) && expectedDeliverablePaths.length && normalizePathList(manifest.deliverablePaths).join('\n') !== normalizePathList(expectedDeliverablePaths).join('\n')) {
    errors.push(`${label} deliverablePaths mismatch: expected ${formatPathList(expectedDeliverablePaths)} / actual ${formatPathList(manifest.deliverablePaths)}`);
  }

  for (const filePath of options.missingAuditPaths || []) {
    errors.push(`${label} audit file is missing or empty: ${filePath}`);
  }
  const expectedAuditPaths = deliveryManifestExpectedAuditPaths(artifact);
  if (Array.isArray(manifest.auditPaths) && expectedAuditPaths.length && normalizePathList(manifest.auditPaths).join('\n') !== normalizePathList(expectedAuditPaths).join('\n')) {
    errors.push(`${label} auditPaths mismatch: expected ${formatPathList(expectedAuditPaths)} / actual ${formatPathList(manifest.auditPaths)}`);
  }

  if (manifest.warnings !== undefined) {
    if (!Array.isArray(manifest.warnings) || manifest.warnings.some((value) => typeof value !== 'string' || value.trim() === '')) {
      errors.push(`${label} warnings must be an array of non-empty strings when provided: ${auditFile}`);
    }
  }
  return errors;
}

export function deliveryManifestDiscordReportAuditMessages(run = {}) {
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout || run.stderr);
  } catch {
    parsed = null;
  }
  const messages = [
    ...(Array.isArray(parsed?.errors) ? parsed.errors : []),
    run.stderr?.trim(),
  ].filter(Boolean).map(String).filter((message) => message.trim() !== '');
  return messages.length ? messages : [`exit ${run.status}`];
}

export function deliveryManifestExpectedArtifactPaths(artifacts = []) {
  return artifacts.flatMap((artifact) => {
    if (artifact?.type === 'deck') return deliveryManifestExpectedDeliverablePaths(artifact);
    if (artifact?.type === 'onepager') {
      return [
        path.join(artifact.dir, `${artifact.basename}.html`),
        path.join(artifact.dir, `${artifact.basename}.svg`),
      ];
    }
    return [];
  });
}

function normalizePathList(values) {
  return [...(values || [])].map((value) => path.normalize(String(value))).sort();
}

function formatPathList(values) {
  return normalizePathList(values).join(', ') || 'none';
}

export function deliveryManifestResolveReportPath(filePath, baseDir) {
  if (!filePath) return filePath;
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
  return path.normalize(resolved);
}

export function deliveryManifestAttachmentPathSummary(attachments = {}) {
  const deliverablePaths = [
    ...(attachments.required || []),
    ...(attachments.optional || []),
  ]
    .filter((attachment) => attachment?.attachable)
    .map((attachment) => attachment.path);
  const auditPaths = (attachments.audit || [])
    .filter((attachment) => attachment?.attachable)
    .map((attachment) => attachment.path);
  return {
    deliverablePaths,
    auditPaths,
    postablePaths: [...deliverablePaths, ...auditPaths],
  };
}

export function deliveryManifestBuildDeliveryMessage({
  summary,
  warnings = [],
  deliveryReadiness = null,
  generated = null,
  identityChecks = null,
} = {}) {
  const title = summary?.title || 'slide deck';
  const artifact = generated?.acceptance?.artifact || null;
  const { deliverablePaths, auditPaths } = deliveryManifestAttachmentPathSummary(summary?.attachments || {});
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

export function deliveryManifestBuildFinalManifest({
  summary,
  warnings = [],
  deliveryReadiness = null,
  generated = null,
  identityChecks = null,
} = {}) {
  const artifact = generated?.acceptance?.artifact || null;
  const { deliverablePaths, auditPaths } = deliveryManifestAttachmentPathSummary(summary?.attachments || {});
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

export function deliveryManifestRegisterAuditFiles(acceptanceManifestPath, auditFiles = []) {
  if (!acceptanceManifestPath) throw new Error('acceptance manifest is missing; cannot register delivery audit files');
  if (!Array.isArray(auditFiles) || auditFiles.length === 0) throw new Error('audit files are required');
  const manifest = JSON.parse(fs.readFileSync(acceptanceManifestPath, 'utf8'));
  const artifactDir = path.dirname(auditFiles[0]);
  const artifact = (manifest.artifacts || []).find((entry) => path.resolve(entry.dir) === path.resolve(artifactDir));
  if (!artifact) throw new Error('acceptance manifest has no artifact matching delivery audit directory');
  const existing = Array.isArray(artifact.auditFiles) ? artifact.auditFiles : [];
  artifact.auditFiles = [...new Set([...existing, ...auditFiles])];
  fs.writeFileSync(acceptanceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export function deliveryManifestAttachmentDetail(type, artifact) {
  const attachable = Boolean(artifact?.path && artifact.exists && artifact.bytes > 0);
  return {
    type,
    path: artifact?.path || null,
    bytes: artifact?.bytes || 0,
    attachable,
  };
}

export function deliveryManifestAttachmentSummary(policy, artifactDetails, acceptanceManifest) {
  const required = policy.required.map((type) => deliveryManifestAttachmentDetail(type, artifactDetails[type]));
  const optional = policy.optional.map((type) => deliveryManifestAttachmentDetail(type, artifactDetails[type]));
  const audit = [
    deliveryManifestAttachmentDetail('manifest', acceptanceManifest?.path ? {
      path: acceptanceManifest.path,
      exists: acceptanceManifest.exists,
      bytes: acceptanceManifest.exists ? fs.statSync(acceptanceManifest.path).size : 0,
    } : null),
  ];
  const attachmentPaths = deliveryManifestAttachmentPathSummary({ required, optional, audit });
  return {
    required,
    optional,
    audit,
    ...attachmentPaths,
  };
}

export function deliveryManifestExpectedDeliveryMessageArtifact(summary, deliveryMessagePath) {
  const artifacts = summary?.acceptanceManifest?.artifacts || [];
  if (artifacts.length !== 1) return null;
  const artifact = artifacts[0];
  const auditFiles = Array.isArray(artifact.auditFiles) ? artifact.auditFiles : [];
  const normalizedDeliveryMessage = deliveryManifestNormalizeFilePath(deliveryMessagePath);
  if (!auditFiles.some((auditFile) => deliveryManifestNormalizeFilePath(auditFile) === normalizedDeliveryMessage)) return null;
  return artifact;
}

export function deliveryManifestReportArtifactValidation(summary, manifest) {
  const expectedArtifactPaths = new Set((manifest?.expectedArtifactPaths || []).map((filePath) => deliveryManifestNormalizeFilePath(filePath)));
  const reportArtifacts = summary?.artifacts || [];
  const reportArtifactCoverageErrors = [];
  for (const artifactPath of reportArtifacts) {
    if (!expectedArtifactPaths.has(deliveryManifestNormalizeFilePath(artifactPath))) {
      reportArtifactCoverageErrors.push(`report artifact is not covered by acceptance manifest: ${artifactPath}`);
    }
  }
  const identityErrors = [];
  if (manifest?.artifacts?.length === 1) {
    const expectedArtifact = manifest.artifacts[0];
    const identity = summary?.reportArtifactIdentity || {};
    const check = deliveryManifestArtifactIdentityCheck(deliveryManifestIdentityFromArtifact(expectedArtifact), identity);
    for (const mismatch of check.mismatches) {
      identityErrors.push(`report artifact ${mismatch.field} mismatch: expected ${mismatch.expected} / actual ${mismatch.actual ?? 'missing'}`);
    }
  }
  return {
    reportArtifactCoverageErrors,
    identityErrors,
  };
}

export function deliveryManifestAcceptanceArtifactValidationSummary(summary, artifacts = [], expectedArtifactPaths = []) {
  let nextSummary = summary;
  let identityCheck = null;
  const validation = {
    reportArtifactCoverageErrors: [],
    identityErrors: [],
  };
  if (artifacts.length) {
    nextSummary = deliveryManifestMergeIdentityCheck(nextSummary, 'deliveryManifest', deliveryManifestArtifactIdentityCheck(
      deliveryManifestIdentityFromArtifact(artifacts[0]),
      nextSummary?.reportArtifactIdentity,
    ));
    if (artifacts.length === 1) {
      nextSummary = deliveryManifestMergeIdentityCheck(nextSummary, 'report', deliveryManifestArtifactIdentityCheck(
        deliveryManifestIdentityFromArtifact(artifacts[0]),
        nextSummary.reportArtifactIdentity,
      ));
      identityCheck = nextSummary.identityChecks.report;
    }
    const reportValidation = deliveryManifestReportArtifactValidation(nextSummary, {
      artifacts,
      expectedArtifactPaths,
    });
    validation.reportArtifactCoverageErrors = reportValidation.reportArtifactCoverageErrors;
    validation.identityErrors = reportValidation.identityErrors;
  }
  return {
    summary: nextSummary,
    identityCheck,
    validation,
    errors: [
      ...validation.reportArtifactCoverageErrors,
      ...validation.identityErrors,
    ],
  };
}

export function deliveryManifestValidateArtifact(type, artifact, prefix = '') {
  if (!artifact?.path) return `${prefix}${type} artifact is missing from report`;
  if (!artifact.exists) return `${prefix}${type} artifact file is missing: ${artifact.path}`;
  if (artifact.bytes <= 0) return `${prefix}${type} artifact file is empty: ${artifact.path}`;
  return null;
}

export function deliveryManifestClassifyArtifacts(artifacts) {
  return {
    html: artifacts.find((artifact) => artifact.endsWith('.preview.html') || artifact.endsWith('.html')) || null,
    pptx: artifacts.find((artifact) => artifact.endsWith('.editable.pptx') || artifact.endsWith('.pptx')) || null,
    outline: artifacts.find((artifact) => artifact.endsWith('.outline.json')) || null,
    prompts: artifacts.find((artifact) => artifact.endsWith('.image-prompts.md') || artifact.endsWith('.image-prompts.json')) || null,
  };
}

export function deliveryManifestArtifactDetail(artifactPath) {
  if (!artifactPath) return { path: null, exists: false, bytes: 0 };
  try {
    const stat = fs.statSync(artifactPath);
    return { path: artifactPath, exists: stat.isFile(), bytes: stat.isFile() ? stat.size : 0 };
  } catch {
    return { path: artifactPath, exists: false, bytes: 0 };
  }
}

export function deliveryManifestIdentityFromArtifact(artifact = {}) {
  return {
    name: artifact?.name,
    type: artifact?.type,
    dir: artifact?.dir,
    basename: artifact?.basename,
  };
}

export function deliveryManifestArtifactIdentityCheck(expectedIdentity = {}, actualIdentity = {}) {
  const expected = {
    name: expectedIdentity.name ?? null,
    type: expectedIdentity.type ?? null,
    dir: expectedIdentity.dir ?? null,
    basename: expectedIdentity.basename ?? null,
  };
  const actual = {
    name: actualIdentity.name ?? null,
    type: actualIdentity.type ?? null,
    dir: actualIdentity.dir ?? null,
    basename: actualIdentity.basename ?? null,
  };
  const mismatches = [];
  for (const field of ['name', 'type', 'dir', 'basename']) {
    const expectedValue = field === 'dir' && expected[field] ? path.normalize(expected[field]) : expected[field];
    const actualValue = field === 'dir' && actual[field] ? path.normalize(actual[field]) : actual[field];
    if (expectedValue !== actualValue) {
      mismatches.push({ field, expected: expected[field], actual: actual[field] });
    }
  }
  return { expected, actual, matched: mismatches.length === 0, mismatches };
}

export function deliveryManifestReportIdentityChecks(acceptance, fallbackDir, fallbackBasename) {
  if (!acceptance?.artifact) return null;
  const expected = deliveryManifestIdentityFromArtifact(acceptance.artifact);
  const actual = {
    name: acceptance.artifact.name,
    type: acceptance.artifact.type,
    dir: acceptance.artifact.dir || fallbackDir,
    basename: acceptance.artifact.basename || fallbackBasename,
  };
  return { report: deliveryManifestArtifactIdentityCheck(expected, actual) };
}

export function deliveryManifestArtifactSectionLines(artifact, fallbackDir, fallbackBasename) {
  return [
    'Artifact:',
    `- name: ${artifact?.name || ''}`,
    `- type: ${artifact?.type || ''}`,
    `- dir: ${artifact?.dir || fallbackDir}`,
    `- basename: ${artifact?.basename || fallbackBasename}`,
  ];
}

export function deliveryManifestPromptsMarkdownPath(promptsPath) {
  return String(promptsPath || '').replace(/\.json$/, '.md');
}

export function deliveryManifestDeliverableArtifactLines({ htmlPath, pptxPath, outlinePath, promptsPath }) {
  return [
    '作成物:',
    `- \`${htmlPath}\``,
    `- \`${pptxPath}\``,
    `- \`${outlinePath}\``,
    `- \`${deliveryManifestPromptsMarkdownPath(promptsPath)}\``,
  ];
}

export function deliveryManifestStudioOutputSummary({
  inputPath,
  outlinePath,
  htmlPath,
  pptxPath,
  promptsPath,
  promptsMarkdownPath,
  screenshotPath,
  screenshot,
  visualQa = null,
  deliveryReadiness = null,
  identityChecks = null,
  discordReport = null,
  slides = 0,
  verification = null,
  acceptance = null,
}) {
  const nextVisualQa = deliveryManifestCloneNestedSnapshot(visualQa);
  const nextDeliveryReadiness = deliveryManifestCloneDeliveryReadinessSnapshot(deliveryReadiness);
  const nextIdentityChecks = deliveryManifestCloneNestedSnapshot(identityChecks);
  const nextVerification = deliveryManifestCloneNestedSnapshot(verification);
  const nextAcceptance = deliveryManifestCloneNestedSnapshot(acceptance);
  return {
    input: path.resolve(inputPath),
    outline: outlinePath,
    html: htmlPath,
    pptx: pptxPath,
    imagePrompts: promptsPath,
    imagePromptsMarkdown: promptsMarkdownPath,
    screenshot: screenshot?.ok ? screenshotPath : null,
    visualQa: nextVisualQa,
    deliveryReadiness: nextDeliveryReadiness,
    identityChecks: nextIdentityChecks,
    discordReport,
    slides,
    verification: nextVerification,
    acceptance: nextAcceptance,
  };
}

export function deliveryManifestStudioErrorMessages(error) {
  const message = String(error?.message || error || 'Unknown error');
  return message
    .split(/\r?\n/)
    .map((line) => line.replace(/^-\s+/, '').trim())
    .filter(Boolean);
}

export function deliveryManifestStudioErrorSummary(error) {
  return {
    ok: false,
    source: 'studio',
    errors: deliveryManifestStudioErrorMessages(error),
  };
}

export function deliveryManifestStudioCaughtErrorSummary(error) {
  return error?.verify || deliveryManifestStudioErrorSummary(error);
}

export function deliveryManifestDiscordReportContext({
  inputPath,
  outDir,
  name,
  outline,
  htmlPath,
  pptxPath,
  outlinePath,
  promptsPath,
  screenshotPath,
  screenshot,
  verification,
  acceptance,
  deliveryReadiness,
  identityChecks,
  visualQa = null,
}) {
  const resolvedVisualQa = visualQa || deliveryManifestSummarizeVisualQa(screenshot, screenshotPath, verification);
  return {
    inputPath,
    outDir,
    name,
    outline,
    htmlPath,
    pptxPath,
    outlinePath,
    promptsPath,
    screenshotPath,
    screenshot,
    verification,
    acceptance,
    deliveryReadiness,
    identityChecks,
    reportPath: path.join(outDir, 'discord-report.md'),
    visualQa: resolvedVisualQa,
    verificationQaLines: deliveryManifestVerificationQaLines(verification, resolvedVisualQa),
  };
}

export function deliveryManifestDiscordReportLines(context, { workspaceRoot, rootDir }) {
  const {
    inputPath,
    outDir,
    name,
    outline,
    htmlPath,
    pptxPath,
    outlinePath,
    promptsPath,
    screenshotPath,
    screenshot,
    verification,
    acceptance,
    deliveryReadiness,
    identityChecks,
    verificationQaLines,
  } = context;
  const lines = [
    ...deliveryManifestDeliverableArtifactLines({ htmlPath, pptxPath, outlinePath, promptsPath }),
    '',
    ...deliveryManifestArtifactSectionLines(acceptance?.artifact, outDir, name),
    '',
    ...deliveryManifestVerificationResultLines({
      verification,
      verificationQaLines,
      screenshot,
      screenshotPath,
    }),
    '',
    ...deliveryManifestAcceptanceChecklistLines({
      acceptance,
      deliveryReadiness,
      identityChecks,
      verificationQaLines,
      outDir,
      name,
    }),
    '',
    ...deliveryManifestUsageCommandLines({ workspaceRoot, rootDir, inputPath, outDir, name }),
    '',
    ...deliveryManifestFollowUpPromptLines(outline.title),
    '',
  ];
  return lines;
}

export function deliveryManifestWriteDiscordReport(context, roots) {
  const lines = deliveryManifestDiscordReportLines(context, roots);
  const textLines = lines.at(-1) === '' ? lines.slice(0, -1) : lines;
  fs.writeFileSync(context.reportPath, `${textLines.join('\n')}\n`, 'utf8');
  return context.reportPath;
}

export function deliveryManifestUsageCommandLines({ workspaceRoot, rootDir, inputPath, outDir, name }) {
  return deliveryManifestUsageCommandLinesContext({ workspaceRoot, rootDir, inputPath, outDir, name });
}

export function deliveryManifestUsageCommandLinesContext({ workspaceRoot, rootDir, inputPath, outDir, name }) {
  const slideStudioScript = path.join(workspaceRoot, 'skills', 'slide-studio', 'scripts', 'shiro-slide-studio.mjs');
  const verifyScript = path.join(rootDir, 'scripts', 'verify.mjs');
  const manifestPolicyScript = path.join(rootDir, 'scripts', 'suggest-manifest-policy.mjs');
  const acceptanceManifestPath = path.join(outDir, `${name}.acceptance.manifest.json`);
  return [
    '使い方:',
    '```bash',
    `node ${shellQuote(slideStudioScript)} --input ${shellQuote(inputPath)} --out ${shellQuote(outDir)} --name ${shellQuote(name)} --verify`,
    `node ${shellQuote(verifyScript)} ${shellQuote(outDir)} ${shellQuote(name)}`,
    `node ${shellQuote(manifestPolicyScript)} ${shellQuote(outDir)} ${shellQuote(name)} --format markdown`,
    `node ${shellQuote(manifestPolicyScript)} ${shellQuote(outDir)} ${shellQuote(name)} --update-manifest ${shellQuote(acceptanceManifestPath)} --verify-manifest --format markdown`,
    '```',
  ];
}

export function deliveryManifestFollowUpPromptLines(title) {
  return deliveryManifestFollowUpPromptLinesContext(title);
}

export function deliveryManifestFollowUpPromptLinesContext(title) {
  const deckTitle = String(title || '').trim() || 'Untitled Deck';
  return [
    '次に試す依頼例:',
    '```text',
    `この資料「${deckTitle}」を、相手と目的に合わせてトーン調整して。HTML previewとeditable PPTXを再生成し、検証レポートも付けて。`,
    '```',
  ];
}

export function deliveryManifestAcceptanceChecklistLines({
  acceptance,
  deliveryReadiness,
  identityChecks = null,
  verificationQaLines = [],
  outDir,
  name,
}) {
  return deliveryManifestAcceptanceChecklistLinesContext({
    acceptance,
    deliveryReadiness,
    identityChecks,
    verificationQaLines,
    outDir,
    name,
  });
}

export function deliveryManifestAcceptanceChecklistLinesContext({
  acceptance,
  deliveryReadiness,
  identityChecks = null,
  verificationQaLines = [],
  outDir,
  name,
}) {
  const lines = ['納品前チェック:'];
  if (acceptance) {
    lines.push(`- status: ${acceptance.ok ? 'ready' : 'blocked'}`);
    lines.push(`- ok: ${acceptance.ok ? 'true' : 'false'}`);
    lines.push(...deliveryManifestAcceptanceChecklistQaLines({
      acceptance,
      deliveryReadiness,
      identityChecks,
      verificationQaLines,
      outDir,
      name,
    }).map((line) => `- ${line}`));
    if (!acceptance.ok && acceptance.manifestVerification?.error) {
      lines.push(`- error: ${acceptance.manifestVerification.error}`);
    }
    return lines;
  }

  lines.push('- status: blocked');
  lines.push(`- ${deliveryManifestFormatDeliveryReadinessLine(deliveryReadiness)}`);
  lines.push(`- ${deliveryManifestFormatDeliveryReasonsLine(deliveryReadiness)}`);
  lines.push('- 納品不可: `--verify`でacceptance manifest生成とverify-artifacts確認まで実行してください。');
  return lines;
}

export function deliveryManifestAcceptanceChecklistQaLines({
  acceptance,
  deliveryReadiness,
  identityChecks = null,
  verificationQaLines = [],
  outDir,
  name,
}) {
  return deliveryManifestAcceptanceChecklistQaLinesContext({
    acceptance,
    deliveryReadiness,
    identityChecks,
    verificationQaLines,
    outDir,
    name,
  });
}

export function deliveryManifestAcceptanceChecklistQaLinesContext({
  acceptance,
  deliveryReadiness,
  identityChecks = null,
  verificationQaLines = [],
  outDir,
  name,
}) {
  const sharedSummary = deliveryManifestAcceptanceChecklistQaSummary({ acceptance, outDir, name });
  const sharedQaLines = deliveryManifestQaLines(sharedSummary, { deliveryReadiness, identityChecks });
  const manifestIndex = sharedQaLines.findIndex((line) => line.startsWith('manifest: '));
  const lines = [
    ...sharedQaLines.slice(0, manifestIndex + 1),
    `artifact policy: ${acceptance.manifestUpdate?.action || 'not updated'}`,
    `manifest verification: ${acceptance.manifestVerification?.ok ? 'ok' : 'failed'}`,
    ...sharedQaLines.slice(manifestIndex + 1),
  ];
  lines.push(...verificationQaLines);
  return lines;
}

export function deliveryManifestAcceptanceChecklistQaSummary({ acceptance, outDir, name }) {
  return deliveryManifestAcceptanceChecklistQaSummaryContext({ acceptance, outDir, name });
}

export function deliveryManifestAcceptanceChecklistQaSummaryContext({ acceptance, outDir, name }) {
  const summary = {
    acceptanceManifest: {
      line: `manifest: ${acceptance.manifestUpdate?.path || path.join(outDir, `${name}.acceptance.manifest.json`)}`,
      scopeLine: `manifest verification scope: ${acceptance.manifestVerification?.scope || 'workspace'}`,
    },
  };
  summary.checkedArtifacts = deliveryManifestFormatCheckedArtifactsLineContext(
    acceptance.manifestVerification?.result?.checked,
  );
  if (Array.isArray(acceptance.manifestVerification?.result?.checkedArtifactTypes)) {
    summary.checkedArtifactTypes = deliveryManifestFormatCheckedArtifactTypesLineContext(
      acceptance.manifestVerification.result.checkedArtifactTypes,
    );
  } else {
    summary.checkedArtifactTypes = deliveryManifestFormatCheckedArtifactTypesLineContext();
  }
  return summary;
}

export function deliveryManifestVerificationResultLines({
  verification,
  verificationQaLines = [],
  screenshot,
  screenshotPath,
}) {
  return deliveryManifestVerificationResultLinesContext({
    verification,
    verificationQaLines,
    screenshot,
    screenshotPath,
  });
}

export function deliveryManifestVerificationResultLinesContext({
  verification,
  verificationQaLines = [],
  screenshot,
  screenshotPath,
}) {
  return deliveryManifestVerificationResultContext({
    verification,
    verificationQaLines,
    screenshot,
    screenshotPath,
  }).lines;
}

export function deliveryManifestVerificationResultContext({
  verification,
  verificationQaLines = [],
  screenshot,
  screenshotPath,
}) {
  const lines = ['検証結果:'];
  const nextVerification = verification ? deliveryManifestCloneSummary(verification) : null;
  const nextVerificationQaLines = Array.isArray(verificationQaLines) ? [...verificationQaLines] : [];
  const nextScreenshot = screenshot ? deliveryManifestCloneSummary(screenshot) : null;
  if (verification) {
    const status = verification.ok ? 'ready' : 'blocked';
    const okLine = `- ok: ${verification.ok ? 'true' : 'false'}`;
    const slidesLine = `- slides: outline ${verification.outlineSlides} / HTML ${verification.htmlSlides} / PPTX ${verification.pptxSlides}`;
    const imagePromptsLine = `- image prompts: ${verification.promptCount}`;
    const notesLine = `- notes: ${verification.notesCount}`;
    const verificationQa = nextVerificationQaLines.map((line) => `- ${line}`);
    lines.push(`- status: ${status}`);
    lines.push(okLine);
    lines.push(slidesLine);
    lines.push(imagePromptsLine);
    lines.push(notesLine);
    lines.push(...verificationQa);
    const screenshotLine = `- screenshot: ${screenshot?.ok ? screenshotPath : 'not generated'}`;
    lines.push(screenshotLine);
    return {
      verification: nextVerification,
      verificationQaLines: nextVerificationQaLines,
      screenshot: nextScreenshot,
      screenshotPath: screenshot?.ok ? screenshotPath : null,
      status,
      ok: verification.ok === true,
      okLine,
      slidesLine,
      imagePromptsLine,
      notesLine,
      screenshotLine,
      lines,
    };
  } else {
    const status = 'blocked';
    const blockedLine = '- 納品不可: `--verify`でoutline/HTML/PPTX/image prompts一致とPPTX内部を検証してください。';
    lines.push('- status: blocked');
    lines.push(blockedLine);
    const screenshotLine = `- screenshot: ${screenshot?.ok ? screenshotPath : 'not generated'}`;
    lines.push(screenshotLine);
    return {
      verification: nextVerification,
      verificationQaLines: nextVerificationQaLines,
      screenshot: nextScreenshot,
      screenshotPath: screenshot?.ok ? screenshotPath : null,
      status,
      ok: false,
      blockedLine,
      screenshotLine,
      lines,
    };
  }
}

export function deliveryManifestQaLines(summary, options = {}) {
  return deliveryManifestQaLinesContext(summary, options).lines;
}

export function deliveryManifestQaLinesContext(summary, options = {}) {
  const nextSummary = deliveryManifestCloneSummary(summary);
  const deliveryReadiness = options.deliveryReadiness || null;
  const identityChecks = options.identityChecks || null;
  const allowVerificationFallback = options.allowVerificationFallback === true;
  const visualQaLine = nextSummary?.visualQa?.acceptance?.line
    || (allowVerificationFallback ? nextSummary?.visualQa?.verification?.line : null);
  const pptxImagesLine = nextSummary?.pptxInternalQa?.acceptance?.images?.line
    || (allowVerificationFallback ? nextSummary?.pptxInternalQa?.verification?.images?.line : null);
  const pptxSpecialLine = nextSummary?.pptxInternalQa?.acceptance?.specialElements?.line
    || (allowVerificationFallback ? nextSummary?.pptxInternalQa?.verification?.specialElements?.line : null);
  const pptxHiddenTextLine = nextSummary?.pptxInternalQa?.acceptance?.hiddenText?.line
    || (allowVerificationFallback ? nextSummary?.pptxInternalQa?.verification?.hiddenText?.line : null);
  const nextIdentityChecks = identityChecks || null;
  const identityChecksContext = nextIdentityChecks
    ? deliveryManifestFormatIdentityChecksLineContext(nextIdentityChecks)
    : null;
  const {
    deliveryReadiness: nextDeliveryReadiness,
    checkedArtifactTypes: nextCheckedArtifactTypes,
    checkedArtifacts: nextCheckedArtifacts,
  } = deliveryManifestNormalizeDiscordReportSummarySnapshot(nextSummary, { deliveryReadiness });
  const nextSummaryCanonical = {
    ...nextSummary,
  };
  if (nextDeliveryReadiness) {
    nextSummaryCanonical.deliveryReadiness = deliveryManifestCloneDeliveryReadinessSnapshot(nextDeliveryReadiness);
  }
  if (nextCheckedArtifactTypes) {
    nextSummaryCanonical.checkedArtifactTypes = deliveryManifestCloneCheckedArtifactTypesSnapshot(nextCheckedArtifactTypes);
  }
  if (nextCheckedArtifacts) {
    nextSummaryCanonical.checkedArtifacts = deliveryManifestCloneCheckedArtifactsSnapshot(nextCheckedArtifacts);
  }
  const lines = [];
  if (nextDeliveryReadiness) {
    if (nextDeliveryReadiness.line) lines.push(nextDeliveryReadiness.line);
    if (nextDeliveryReadiness.reasonsLine) lines.push(nextDeliveryReadiness.reasonsLine);
  } else {
    if (nextSummaryCanonical?.deliveryReadiness?.line) lines.push(nextSummaryCanonical.deliveryReadiness.line);
    if (nextSummaryCanonical?.deliveryReadiness?.reasonsLine) lines.push(nextSummaryCanonical.deliveryReadiness.reasonsLine);
  }
  if (nextSummaryCanonical?.acceptanceManifest?.line) lines.push(nextSummaryCanonical.acceptanceManifest.line);
  if (nextSummaryCanonical?.acceptanceManifest?.scopeLine) lines.push(nextSummaryCanonical.acceptanceManifest.scopeLine);
  if (nextSummaryCanonical?.checkedArtifacts?.line) lines.push(nextSummaryCanonical.checkedArtifacts.line);
  else if (Number.isInteger(nextSummaryCanonical?.checkedArtifacts)) lines.push(deliveryManifestFormatCheckedArtifactsLineContext(nextSummaryCanonical.checkedArtifacts).line);
  else if (nextSummaryCanonical?.checkedArtifactsLine) lines.push(nextSummaryCanonical.checkedArtifactsLine);
  if (nextCheckedArtifactTypes?.line) lines.push(nextCheckedArtifactTypes.line);
  else if (Array.isArray(nextCheckedArtifactTypes?.types)) {
    lines.push(deliveryManifestFormatCheckedArtifactTypesLineContext(nextCheckedArtifactTypes.types).line);
  }
  if (identityChecksContext?.text) lines.push(identityChecksContext.text);
  if (visualQaLine) lines.push(`visual QA: ${visualQaLine}`);
  if (pptxImagesLine) lines.push(pptxImagesLine);
  if (pptxSpecialLine) lines.push(pptxSpecialLine);
  if (pptxHiddenTextLine) lines.push(pptxHiddenTextLine);
  const nextLines = lines.length ? lines : ['visual QA: missing', 'PPTX images: missing', 'PPTX special elements: missing', 'PPTX hidden text: missing'];
  return {
    summary: nextSummaryCanonical,
    deliveryReadiness: nextDeliveryReadiness,
    checkedArtifactTypes: deliveryManifestCloneCheckedArtifactTypesSnapshot(nextCheckedArtifactTypes),
    identityChecks: identityChecksContext
      ? {
          order: [...identityChecksContext.identityChecks.order],
          parts: [...identityChecksContext.identityChecks.parts],
          text: identityChecksContext.identityChecks.text,
          line: identityChecksContext.identityChecks.line,
        }
      : null,
    checkedArtifacts: deliveryManifestCloneCheckedArtifactsSnapshot(
      nextSummary?.checkedArtifacts?.line
        ? nextSummary.checkedArtifacts
        : Number.isInteger(nextSummary?.checkedArtifacts)
          ? deliveryManifestFormatCheckedArtifactsLineContext(nextSummary.checkedArtifacts)
          : nextSummary?.checkedArtifactsLine
            ? {
                count: null,
                line: nextSummary.checkedArtifactsLine,
                checkedArtifacts: {
                  count: null,
                  line: nextSummary.checkedArtifactsLine,
                },
              }
            : null,
    ),
    checkedArtifactTypesLine: nextCheckedArtifactTypes?.line || null,
    identityChecksLine: identityChecksContext?.line || null,
    visualQaLine: visualQaLine || null,
    pptxImagesLine: pptxImagesLine || null,
    pptxSpecialLine: pptxSpecialLine || null,
    pptxHiddenTextLine: pptxHiddenTextLine || null,
    lines: nextLines,
  };
}

export function deliveryManifestFormatDeliveryReasons(deliveryReadiness) {
  return deliveryManifestFormatDeliveryReasonsContext(deliveryReadiness).text;
}

export function deliveryManifestFormatDeliveryReasonsContext(deliveryReadiness) {
  const reasons = Array.isArray(deliveryReadiness?.reasons) ? [...deliveryReadiness.reasons] : [];
  const text = reasons.length ? reasons.join('; ') : 'none';
  return {
    reasons,
    text,
    line: `reasons: ${text}`,
  };
}

export function deliveryManifestFormatDeliveryReadinessLine(deliveryReadiness) {
  return deliveryManifestFormatDeliveryReadinessLineContext(deliveryReadiness).line;
}

export function deliveryManifestFormatDeliveryReadinessLineContext(deliveryReadiness) {
  const ok = deliveryReadiness?.ok === true;
  const line = `delivery readiness: ${ok ? 'ready' : 'blocked'}`;
  return {
    ok,
    line,
  };
}
export function deliveryManifestFormatDeliveryReasonsLine(deliveryReadiness) {
  return deliveryManifestFormatDeliveryReasonsLineContext(deliveryReadiness).line;
}

export function deliveryManifestFormatDeliveryReasonsLineContext(deliveryReadiness) {
  const reasons = deliveryManifestFormatDeliveryReasonsContext(deliveryReadiness);
  return {
    reasons: [...reasons.reasons],
    line: reasons.line,
  };
}

export function deliveryManifestFormatBreakdown(counts = {}) {
  return deliveryManifestFormatBreakdownContext(counts).text;
}

export function deliveryManifestFormatBreakdownContext(counts = {}) {
  const nextCounts = deliveryManifestCloneSummary(counts);
  const details = Object.entries(nextCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => `${key}:${count}`);
  const text = details.length ? details.join(', ') : 'none';
  return {
    counts: { ...nextCounts },
    details: [...details],
    text,
    line: text,
  };
}

export function deliveryManifestFormatBreakdownLine(counts = {}) {
  return deliveryManifestFormatBreakdownLineContext(counts).line;
}

export function deliveryManifestFormatBreakdownLineContext(counts = {}) {
  const nextBreakdown = deliveryManifestFormatBreakdownContext(counts);
  return {
    breakdown: {
      counts: { ...nextBreakdown.counts },
      details: [...nextBreakdown.details],
      text: nextBreakdown.text,
      line: nextBreakdown.line,
    },
    line: nextBreakdown.line,
  };
}

export function deliveryManifestVerificationQaLines(verification, visualQa) {
  return deliveryManifestVerificationQaLinesContext(verification, visualQa);
}

export function deliveryManifestVerificationQaLinesContext(verification, visualQa) {
  return deliveryManifestVerificationQaContext(verification, visualQa).lines;
}

export function deliveryManifestVerificationQaContext(verification, visualQa) {
  if (!verification) {
    return {
      verification: null,
      pptxImages: null,
      pptxSpecialElements: null,
      pptxHiddenText: null,
      visualQa: null,
      lines: [],
    };
  }
  const nextVerification = deliveryManifestCloneSummary(verification);
  const nextPptxImages = deliveryManifestFormatPptxImagesLineContext(nextVerification);
  const nextPptxSpecialElements = deliveryManifestFormatPptxSpecialElementsLineContext(nextVerification);
  const nextPptxHiddenText = deliveryManifestFormatPptxHiddenTextLineContext(nextVerification);
  const nextVisualQa = deliveryManifestCloneSummary(visualQa);
  const nextVisualQaLine = deliveryManifestFormatVisualQaLineContext(visualQa);
  return {
    verification: nextVerification,
    pptxImages: nextPptxImages,
    pptxSpecialElements: nextPptxSpecialElements,
    pptxHiddenText: nextPptxHiddenText,
    visualQa: nextVisualQa ? {
      ...nextVisualQa,
      line: nextVisualQaLine.line,
    } : null,
    lines: [
      nextPptxImages.line,
      nextPptxSpecialElements.line,
      nextPptxHiddenText.line,
      nextVisualQaLine.line,
    ],
  };
}

export function deliveryManifestFormatCheckedArtifactTypes(types = []) {
  return deliveryManifestFormatCheckedArtifactTypesContext(types).text;
}

export function deliveryManifestFormatCheckedArtifactTypesContext(types = []) {
  const nextTypes = Array.isArray(types) ? [...types] : [];
  const text = nextTypes.length ? nextTypes.join(', ') : 'none';
  return {
    types: nextTypes,
    text,
    line: nextTypes.length ? 'checked artifact types: ' + text : 'checked artifact types: missing',
  };
}

export function deliveryManifestFormatCheckedArtifactTypesLine(types = []) {
  return deliveryManifestFormatCheckedArtifactTypesLineContext(types).line;
}

export function deliveryManifestFormatCheckedArtifactTypesLineContext(types = []) {
  const nextTypes = deliveryManifestFormatCheckedArtifactTypesContext(types);
  return {
    status: nextTypes.types.length ? 'present' : 'missing',
    types: [...nextTypes.types],
    text: nextTypes.text,
    line: nextTypes.line,
  };
}

export function deliveryManifestFormatCheckedArtifactsLine(types = []) {
  return deliveryManifestFormatCheckedArtifactsLineContext(types).line;
}

export function deliveryManifestFormatCheckedArtifactsLineContext(count) {
  const nextCount = Number.isInteger(count) ? count : null;
  const line = nextCount !== null ? `checked artifacts: ${nextCount}` : 'checked artifacts: missing';
  return {
    status: nextCount !== null ? 'present' : 'missing',
    count: nextCount,
    line,
  };
}
export function deliveryManifestNormalizeList(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value).trim()).filter(Boolean).sort();
}

export function deliveryManifestArraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function deliveryManifestJsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function deliveryManifestVerificationError(parsed, run = {}) {
  const messages = [
    ...((parsed?.manifestErrors || []).filter(Boolean)),
    ...((parsed?.results || []).filter((result) => !result.ok).map((result) => result.error).filter(Boolean)),
    run.stderr?.trim(),
  ].filter(Boolean);
  return messages.join('\n');
}

export function deliveryManifestSummarizeAcceptanceManifestVerification(run = {}, parsed = null, scope = 'manifest-only') {
  return {
    ok: run.status === 0 && Boolean(parsed?.ok),
    status: run.status ?? null,
    checked: parsed?.checked ?? null,
    checkedArtifactTypes: parsed?.checkedArtifactTypes || [],
    scope,
    error: deliveryManifestVerificationError(parsed, run),
  };
}

export function deliveryManifestSummarizeAcceptanceManifestVerificationFromManifest(manifest = {}) {
  const errors = [];
  if (!Array.isArray(manifest?.artifacts)) errors.push('manifest.artifacts must be an array');
  if (manifest?.ignoreDirs !== undefined && !Array.isArray(manifest.ignoreDirs)) {
    errors.push('manifest.ignoreDirs must be an array when provided');
  }
  if (errors.length) {
    return {
      ok: false,
      status: 1,
      checked: 0,
      checkedArtifactTypes: [],
      scope: 'manifest-only',
      error: errors.join('\n'),
    };
  }
  return {
    ok: true,
    status: 0,
    checked: manifest.artifacts.length,
    checkedArtifactTypes: [...new Set(manifest.artifacts.map((artifact) => artifact?.type).filter(Boolean))],
    scope: 'manifest-only',
    error: '',
  };
}

export function deliveryManifestAcceptanceVerificationReportErrors(summary = {}, verification = {}) {
  const errors = [];
  if (!verification.ok) {
    errors.push(`acceptance manifest verification failed: ${verification.error || `exit ${verification.status}`}`);
  }
  const {
    checkedArtifacts,
    checkedArtifactTypes,
  } = deliveryManifestNormalizeDiscordReportSummarySnapshot(summary);
  const checkedArtifactsCount = Number.isInteger(checkedArtifacts?.count) ? checkedArtifacts.count : null;
  if (verification.ok && Number.isInteger(checkedArtifactsCount) && verification.checked !== checkedArtifactsCount) {
    errors.push(`checked artifacts mismatch: report ${checkedArtifactsCount} != manifest ${verification.checked}`);
  }
  if (verification.ok && checkedArtifactTypes?.status === 'present') {
    const reportTypes = deliveryManifestNormalizeList(checkedArtifactTypes.types);
    const manifestTypes = deliveryManifestNormalizeList(verification.checkedArtifactTypes);
    if (reportTypes.join(',') !== manifestTypes.join(',')) {
      errors.push(`checked artifact types mismatch: report ${deliveryManifestFormatCheckedArtifactTypes(reportTypes)} != manifest ${deliveryManifestFormatCheckedArtifactTypes(manifestTypes)}`);
    }
  }
  const acceptanceManifest = deliveryManifestCloneSummary(summary?.acceptanceManifest);
  if (acceptanceManifest?.scope && acceptanceManifest.scope !== verification.scope) {
    errors.push(`acceptance manifest verification scope mismatch: report ${acceptanceManifest.scope} != actual ${verification.scope}`);
  }
  return errors;
}

export function deliveryManifestNormalizeFilePath(filePath) {
  return path.normalize(path.resolve(filePath));
}

export function deliveryManifestReportSection(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const next = text.slice(start + heading.length).match(/\n[^\n]+:\n/);
  const end = next ? start + heading.length + next.index : text.length;
  return text.slice(start, end);
}

export function deliveryManifestSectionStatus(text, heading) {
  const section = deliveryManifestReportSection(text, heading);
  if (!section) return null;
  return section.match(/^- status:\s*(\S+)/m)?.[1] || null;
}

export function deliveryManifestSectionBullets(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];
  const bullets = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[^\s].+:\s*$/.test(line)) break;
    const bullet = line.match(/^- (.+)$/);
    if (bullet) bullets.push(bullet[1]);
  }
  return bullets;
}

export function deliveryManifestSectionKeyValues(text, heading) {
  const values = {};
  for (const bullet of deliveryManifestSectionBullets(text, heading)) {
    const match = bullet.match(/^([^:]+):\s*(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

export function deliveryManifestSectionVisualQa(text, heading) {
  const section = deliveryManifestReportSection(text, heading);
  const line = section.match(/^- visual QA:\s*(.+)$/m)?.[1] || null;
  if (!line) {
    return {
      status: 'missing',
      source: 'none',
      width: null,
      height: null,
      uniqueSampledColors: null,
      line: null,
    };
  }
  const match = line.match(/^(.+?)\s*\/\s*source:\s*([^\s/]+)(?:\s*\/\s*(\d+)x(\d+))?\s*\/\s*uniqueSampledColors:\s*(n\/a|[^\s/]+)$/);
  const status = match?.[1]?.trim() || line.split('/')[0].trim();
  const source = match?.[2]?.trim() || 'unknown';
  const width = match?.[3] ? Number(match[3]) : null;
  const height = match?.[4] ? Number(match[4]) : null;
  const unique = match?.[5] || line.match(/uniqueSampledColors:\s*(n\/a|[^\s/]+)/)?.[1] || null;
  return {
    status,
    source,
    width,
    height,
    uniqueSampledColors: unique && unique !== 'n/a' ? Number(unique) : null,
    line,
  };
}

export function deliveryManifestSectionPptxInternalQa(text, heading) {
  const section = deliveryManifestReportSection(text, heading);
  return {
    images: deliveryManifestSectionPptxLine(section, 'PPTX images'),
    specialElements: deliveryManifestSectionPptxLine(section, 'PPTX special elements'),
    hiddenText: deliveryManifestSectionPptxHiddenTextLine(section),
  };
}

export function deliveryManifestSectionCheckedArtifactTypes(text, heading) {
  const section = deliveryManifestReportSection(text, heading);
  const match = section.match(/^- checked artifact types:\s*(.+)$/m);
  if (!match) return { status: 'missing', types: [], line: null };
  if (match[1].trim() === 'missing') {
    return {
      status: 'missing',
      types: [],
      line: match[0].replace(/^- /, ''),
    };
  }
  const types = match[1]
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean)
    .filter((type) => type !== 'none');
  return {
    status: 'present',
    types,
    line: match[0].replace(/^- /, ''),
  };
}

export function deliveryManifestSectionAcceptanceManifest(text, heading, baseDir) {
  const section = deliveryManifestReportSection(text, heading);
  const match = section.match(/^- manifest:\s*(.+)$/m);
  const scopeMatch = section.match(/^- manifest verification scope:\s*(.+)$/m);
  const manifestPath = match?.[1]?.trim() ? deliveryManifestResolveReportPath(match[1].trim(), baseDir) : null;
  const scope = scopeMatch?.[1]?.trim() || null;
  return {
    status: manifestPath ? 'present' : 'missing',
    path: manifestPath,
    exists: manifestPath ? fs.existsSync(manifestPath) : false,
    scopeStatus: scope ? 'present' : 'missing',
    scope,
    artifacts: [],
    expectedArtifactPaths: [],
    line: match ? match[0].replace(/^- /, '') : null,
    scopeLine: scopeMatch ? scopeMatch[0].replace(/^- /, '') : null,
  };
}

export function deliveryManifestReadAcceptanceManifestArtifacts(manifestPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const artifacts = Array.isArray(parsed?.artifacts) ? parsed.artifacts : [];
    return {
      artifacts,
      expectedArtifactPaths: deliveryManifestExpectedArtifactPaths(artifacts),
      error: null,
    };
  } catch (error) {
    return {
      artifacts: [],
      expectedArtifactPaths: [],
      error: error.message,
    };
  }
}

export function deliveryManifestAcceptanceManifestReadErrors(manifestPath, details = {}) {
  if (!manifestPath) return ['acceptance manifest path is missing'];
  if (details.fileError) return [`acceptance manifest file is missing: ${manifestPath}`];
  if (details.readError) return [`acceptance manifest is unreadable: ${manifestPath}: ${details.readError}`];
  return [];
}

export function deliveryManifestFinalManifestReadErrors(manifestPath, details = {}) {
  if (details.fileError) return [`delivery manifest missing or unreadable: ${manifestPath}`];
  if (details.readError) return [`acceptance manifest is unreadable: ${manifestPath}: ${details.readError}`];
  return [];
}

export function deliveryManifestDeliveryMessageReadErrors(deliveryMessagePath, details = {}) {
  if (details.fileError) return [`delivery message missing or unreadable: ${deliveryMessagePath}`];
  return [];
}

export function deliveryManifestSummarizeAcceptanceManifest(summary, manifestPath, options = {}) {
  const output = {
    acceptanceManifest: {
      path: manifestPath,
      exists: false,
      artifacts: [],
      expectedArtifactPaths: [],
      verification: null,
      error: null,
    },
    identityCheck: null,
    errors: [],
  };

  if (!manifestPath) {
    output.errors.push(...deliveryManifestAcceptanceManifestReadErrors(manifestPath));
    return output;
  }

  let parsedManifest = null;
  try {
    parsedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    output.errors.push(...deliveryManifestAcceptanceManifestReadErrors(manifestPath, { fileError: error.message }));
    output.acceptanceManifest.error = error.message;
    return output;
  }

  const read = options.read || deliveryManifestReadAcceptanceManifestArtifacts(manifestPath);
  output.acceptanceManifest.exists = true;
  output.acceptanceManifest.artifacts = read.artifacts;
  output.acceptanceManifest.expectedArtifactPaths = read.expectedArtifactPaths;
  output.acceptanceManifest.error = read.error;
  if (read.error) {
    output.errors.push(...deliveryManifestAcceptanceManifestReadErrors(manifestPath, { readError: read.error }));
  }

  let verification = null;
  if (options.run || options.parsed) {
    const run = options.run || { status: 0, stderr: '' };
    const parsed = options.parsed ?? null;
    verification = deliveryManifestSummarizeAcceptanceManifestVerification(run, parsed);
  } else {
    verification = deliveryManifestSummarizeAcceptanceManifestVerificationFromManifest(parsedManifest);
  }
  output.acceptanceManifest.verification = verification;
  output.errors.push(...deliveryManifestAcceptanceVerificationReportErrors(summary, output.acceptanceManifest.verification));

  const artifactValidation = deliveryManifestAcceptanceArtifactValidationSummary(summary, output.acceptanceManifest.artifacts, output.acceptanceManifest.expectedArtifactPaths);
  summary = artifactValidation.summary;
  output.identityCheck = artifactValidation.identityCheck;
  output.errors.push(...artifactValidation.errors);

  return output;
}

export function deliveryManifestSummarizeDeliveryMessage(summary, deliveryMessagePath) {
  const output = {
    deliveryMessage: {
      path: deliveryMessagePath,
      exists: false,
      attachmentsMatched: false,
      missingAttachments: summary?.attachments?.postablePaths || [],
      error: null,
    },
    identityCheck: null,
    errors: [],
  };

  let text = '';
  try {
    text = fs.readFileSync(deliveryMessagePath, 'utf8');
  } catch (error) {
    output.deliveryMessage.error = error.message;
    output.errors.push(...deliveryManifestDeliveryMessageReadErrors(deliveryMessagePath, { fileError: error.message }));
    return output;
  }

  const validation = deliveryManifestDeliveryMessageValidationSummary(summary, text, deliveryMessagePath);
  output.deliveryMessage = validation.deliveryMessage;
  output.identityCheck = validation.identityCheck;
  output.errors.push(...validation.errors);

  return output;
}

export function deliveryManifestDeliveryMessageValidationSummary(summary, text, deliveryMessagePath) {
  const validationContext = deliveryManifestDeliveryMessageValidationContext(summary, text, deliveryMessagePath);
  const reportSummary = deliveryManifestDeliveryMessageReportSummary(
    validationContext.summary,
    text,
    deliveryMessagePath,
    { artifactIdentitySummary: validationContext.artifactIdentitySummary },
  );
  return {
    summary: validationContext.summary,
    deliveryMessage: reportSummary.deliveryMessage,
    identityCheck: validationContext.identityCheck,
    errors: reportSummary.errors,
  };
}

export function deliveryManifestDeliveryMessageValidationContext(summary, text, deliveryMessagePath) {
  let nextSummary = deliveryManifestCloneSummary(summary);
  let identityCheck = null;
  const artifactIdentitySummary = deliveryManifestDeliveryMessageArtifactIdentitySummary(nextSummary, text, deliveryMessagePath);
  if (artifactIdentitySummary.identityCheck) {
    identityCheck = artifactIdentitySummary.identityCheck;
    nextSummary = deliveryManifestMergeIdentityCheck(nextSummary, 'deliveryMessage', identityCheck);
  }
  return {
    summary: nextSummary,
    identityCheck,
    artifactIdentitySummary,
  };
}

export function deliveryManifestValidateAcceptanceManifest(summary, manifestPath) {
  const output = {
    deliveryManifest: {
      path: manifestPath,
      exists: false,
      artifacts: [],
      expectedArtifactPaths: [],
      bytes: 0,
      checks: null,
      duplicateQaLines: [],
      duplicateDeliverablePaths: [],
      duplicateAuditPaths: [],
      expected: null,
      actual: null,
      error: null,
    },
    identityCheck: null,
    errors: [],
  };

  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    output.errors.push(...deliveryManifestFinalManifestReadErrors(manifestPath, { fileError: error.message }));
    output.deliveryManifest.error = error.message;
    return output;
  }

  const validation = deliveryManifestFinalManifestValidationSummary(summary, parsed, manifestPath);
  output.deliveryManifest = validation.deliveryManifest;
  output.identityCheck = validation.identityCheck;
  output.errors.push(...validation.errors);

  return output;
}

export function deliveryManifestFinalManifestValidationSummary(summary, parsed, manifestPath) {
  const validationContext = deliveryManifestFinalManifestValidationContext(summary, parsed, manifestPath);
  return {
    summary: validationContext.summary,
    deliveryManifest: validationContext.deliveryManifest,
    identityCheck: validationContext.identityCheck,
    errors: validationContext.errors,
  };
}

export function deliveryManifestFinalManifestValidationContext(summary, parsed, manifestPath) {
  let nextSummary = deliveryManifestCloneSummary(summary);
  const output = {
    summary: nextSummary,
    deliveryManifest: {
      path: manifestPath,
      exists: false,
      artifacts: [],
      expectedArtifactPaths: [],
      bytes: 0,
      checks: null,
      duplicateQaLines: [],
      duplicateDeliverablePaths: [],
      duplicateAuditPaths: [],
      expected: null,
      actual: null,
      error: null,
    },
    identityCheck: null,
    errors: [],
  };

  const read = deliveryManifestReadAcceptanceManifestArtifacts(manifestPath);
  output.deliveryManifest.artifacts = read.artifacts;
  output.deliveryManifest.expectedArtifactPaths = read.expectedArtifactPaths;
  output.deliveryManifest.error = read.error;
  if (read.error) {
    output.errors.push(...deliveryManifestFinalManifestReadErrors(manifestPath, { readError: read.error }));
  }

  const initialExpected = deliveryManifestExpectedManifestReportSummary(nextSummary, parsed).expected;
  nextSummary = deliveryManifestMergeIdentityCheck(nextSummary, 'deliveryManifest', deliveryManifestArtifactIdentityCheck(
    {
      name: initialExpected.artifactName,
      type: initialExpected.artifactType,
      dir: initialExpected.artifactDir,
      basename: initialExpected.basename,
    },
    {
      name: parsed.artifactName,
      type: parsed.artifactType,
      dir: parsed.artifactDir,
      basename: parsed.basename,
    },
  ));
  output.summary = nextSummary;
  output.identityCheck = nextSummary.identityChecks?.deliveryManifest || null;
  const manifestReport = deliveryManifestExpectedManifestReportSummary(nextSummary, parsed);
  output.deliveryManifest.exists = true;
  output.deliveryManifest.bytes = Buffer.byteLength(JSON.stringify(parsed));
  output.deliveryManifest.expected = manifestReport.expected;
  output.deliveryManifest.actual = manifestReport.actual;

  output.errors.push(...deliveryManifestStringArrayValidationErrors(parsed));
  if (parsed.identityChecks !== undefined) {
    output.errors.push(...deliveryManifestIdentityChecksValidationErrors(parsed.identityChecks));
  }

  output.deliveryManifest.checks = manifestReport.checks;
  output.deliveryManifest.duplicateQaLines = manifestReport.duplicateQaLines;
  output.deliveryManifest.duplicateDeliverablePaths = manifestReport.duplicateDeliverablePaths;
  output.deliveryManifest.duplicateAuditPaths = manifestReport.duplicateAuditPaths;

  const artifactValidation = deliveryManifestAcceptanceArtifactValidationSummary(nextSummary, output.deliveryManifest.artifacts, output.deliveryManifest.expectedArtifactPaths);
  output.summary = artifactValidation.summary;
  if (artifactValidation.identityCheck) output.identityCheck = artifactValidation.identityCheck;
  output.errors.push(...artifactValidation.errors);

  output.errors.push(...deliveryManifestExpectedManifestReportErrors(manifestReport));

  return output;
}

export function deliveryManifestSummarizeDiscordReport(text, sections, baseDir) {
  return deliveryManifestSummarizeDiscordReportContext(text, sections, baseDir);
}

export function deliveryManifestSummarizeDiscordReportContext(text, sections, baseDir) {
  const artifacts = [...text.matchAll(/^- `([^`]+)`/gm)].map((match) => deliveryManifestResolveReportPath(match[1], baseDir));
  const artifactsByType = deliveryManifestClassifyArtifacts(artifacts);
  const artifactDetails = Object.fromEntries(
    Object.entries(artifactsByType).map(([type, artifact]) => [type, deliveryManifestArtifactDetail(artifact)]),
  );
  const visualQa = deliveryManifestSummarizeDiscordReportVisualQa(text);
  const pptxInternalQa = {
    verification: deliveryManifestSectionPptxInternalQa(text, '検証結果:'),
    acceptance: deliveryManifestSectionPptxInternalQa(text, '納品前チェック:'),
  };
  const deliveryReadiness = {
    ...deliveryManifestSectionDeliveryReadiness(text, '納品前チェック:'),
    visualQaSource: visualQa.acceptance?.source || visualQa.verification?.source || 'none',
    visualQaWidth: visualQa.acceptance?.width ?? visualQa.verification?.width ?? null,
    visualQaHeight: visualQa.acceptance?.height ?? visualQa.verification?.height ?? null,
    visualQaUniqueSampledColors: visualQa.acceptance?.uniqueSampledColors
      ?? visualQa.verification?.uniqueSampledColors
      ?? null,
  };
  const checkedArtifactTypes = deliveryManifestSectionCheckedArtifactTypes(text, '納品前チェック:');
  const acceptanceManifest = deliveryManifestSectionAcceptanceManifest(text, '納品前チェック:', baseDir);
  const reportArtifactIdentity = deliveryManifestSectionKeyValues(text, 'Artifact:');
  const attachmentPolicy = {
    required: ['pptx', 'html'],
    optional: ['outline', 'prompts'],
    audit: ['manifest'],
    requiredReady: ['pptx', 'html'].every((type) => artifactDetails[type]?.exists && artifactDetails[type]?.bytes > 0),
  };
  const attachments = deliveryManifestAttachmentSummary(attachmentPolicy, artifactDetails, acceptanceManifest);
  const slideMatch = text.match(/^- slides:\s*outline\s+(\d+)\s*\/\s*HTML\s+(\d+)\s*\/\s*PPTX\s+(\d+)/m);
  const checkedMatch = text.match(/^- checked artifacts:\s*(\d+)/m);
  const titleMatch = text.match(/この資料「([^」]+)」/);
  const ready = sections.verification === 'ready' && sections.acceptance === 'ready';
  const nextDeliveryReadiness = deliveryManifestNormalizeDeliveryReadinessSnapshot(deliveryReadiness);
  const nextCheckedArtifactTypes = deliveryManifestNormalizeCheckedArtifactTypesSnapshot(checkedArtifactTypes);
  const nextCheckedArtifacts = deliveryManifestNormalizeCheckedArtifactsSnapshot(
    checkedMatch ? deliveryManifestFormatCheckedArtifactsLineContext(Number(checkedMatch[1])) : null,
  );
  return {
    postable: ready,
    message: ready
      ? `投稿OK: ${titleMatch?.[1] || 'slide deck'} / slides ${slideMatch?.[1] || '?'} / acceptance ${sections.acceptance}`
      : `投稿不可: verification ${sections.verification || 'missing'} / acceptance ${sections.acceptance || 'missing'}`,
    title: titleMatch?.[1] || null,
    slides: slideMatch ? {
      outline: Number(slideMatch[1]),
      html: Number(slideMatch[2]),
      pptx: Number(slideMatch[3]),
    } : null,
    artifacts,
    artifactsByType,
    artifactDetails,
    attachmentPolicy,
    attachments,
    visualQa,
    pptxInternalQa,
    summary: deliveryManifestDiscordReportSummaryContext({
      deliveryReadiness: nextDeliveryReadiness,
      checkedArtifactTypes: nextCheckedArtifactTypes,
      checkedArtifacts: nextCheckedArtifacts,
    }),
    deliveryReadiness: deliveryManifestCloneDeliveryReadinessSnapshot(nextDeliveryReadiness),
    checkedArtifactTypes: deliveryManifestCloneCheckedArtifactTypesSnapshot(nextCheckedArtifactTypes),
    checkedArtifacts: deliveryManifestCloneCheckedArtifactsSnapshot(nextCheckedArtifacts),
    reportArtifactIdentity,
    acceptanceManifest,
  };
}

export function deliveryManifestSummarizeDiscordReportVisualQa(text) {
  const verification = deliveryManifestSectionVisualQa(text, '検証結果:');
  const acceptance = deliveryManifestSectionVisualQa(text, '納品前チェック:');
  const resolved = acceptance || verification || null;
  return {
    verification,
    acceptance,
    source: resolved?.source || 'none',
    width: resolved?.width ?? null,
    height: resolved?.height ?? null,
    uniqueSampledColors: resolved?.uniqueSampledColors ?? null,
  };
}

export function deliveryManifestFinalizeDiscordReport(summary, errors = []) {
  return deliveryManifestFinalizeDiscordReportContext(summary, errors);
}

export function deliveryManifestFinalizeDiscordReportContext(summary, errors = []) {
  if (!summary) return null;
  if (!errors.length) return deliveryManifestCloneSummary(summary);
  return {
    ...deliveryManifestCloneSummary(summary),
    postable: false,
    message: `投稿不可: ${errors[0]}`,
  };
}

export function deliveryManifestDiscordReportVerificationPayload({
  ok,
  reportPath,
  sections,
  summary = null,
  errors = [],
  warnings = [],
}) {
  return deliveryManifestDiscordReportVerificationPayloadContext({
    ok,
    reportPath,
    sections,
    summary,
    errors,
    warnings,
  });
}

export function deliveryManifestDiscordReportVerificationPayloadContext({
  ok,
  reportPath,
  sections,
  summary = null,
  errors = [],
  warnings = [],
}) {
  return {
    ok,
    report: reportPath,
    sections,
    summary: deliveryManifestCloneSummary(summary),
    errors: [...errors],
    warnings: [...warnings],
  };
}

export function deliveryManifestArtifactsVerificationPayload({
  manifestPath,
  checked = null,
  checkedArtifactTypes = null,
  manifestErrors = [],
  results = [],
}) {
  return deliveryManifestArtifactsVerificationPayloadContext({
    manifestPath,
    checked,
    checkedArtifactTypes,
    manifestErrors,
    results,
  });
}

export function deliveryManifestArtifactsVerificationPayloadContext({
  manifestPath,
  checked = null,
  checkedArtifactTypes = null,
  manifestErrors = [],
  results = [],
}) {
  const output = {
    ok: results.every((result) => result.ok) && manifestErrors.length === 0,
    manifest: manifestPath,
    checked: checked ?? results.length,
  };
  if (checkedArtifactTypes) {
    output.checkedArtifactTypes = [...checkedArtifactTypes];
  }
  output.manifestErrors = [...manifestErrors];
  output.results = deliveryManifestCloneSummary(results);
  return output;
}

export function deliveryManifestDeckVerificationPayload({
  ok = true,
  paths = null,
  errors = [],
  ...diagnostics
}) {
  return deliveryManifestDeckVerificationPayloadContext({
    ok,
    paths,
    errors,
    ...diagnostics,
  });
}

export function deliveryManifestDeckVerificationPayloadContext({
  ok = true,
  paths = null,
  errors = [],
  ...diagnostics
}) {
  const output = {
    ok,
    ...deliveryManifestCloneSummary(diagnostics),
  };
  if (!ok && paths) output.paths = deliveryManifestCloneSummary(paths);
  output.errors = [...errors];
  return output;
}

export function deliveryManifestOnepagerVerificationPayload({
  ok,
  htmlPath,
  svgPath,
  htmlBytes = 0,
  svgBytes = 0,
  required = [],
  errors = [],
}) {
  return deliveryManifestOnepagerVerificationPayloadContext({
    ok,
    htmlPath,
    svgPath,
    htmlBytes,
    svgBytes,
    required,
    errors,
  });
}

export function deliveryManifestOnepagerVerificationPayloadContext({
  ok,
  htmlPath,
  svgPath,
  htmlBytes = 0,
  svgBytes = 0,
  required = [],
  errors = [],
}) {
  return {
    ok,
    html: htmlPath,
    svg: svgPath,
    htmlBytes,
    svgBytes,
    required: [...required],
    errors: [...errors],
  };
}

export function deliveryManifestPolicySuggestionOutput({
  artifact,
  manifestUpdate = null,
  manifestVerification = null,
  diagnostics = {},
  warnings = [],
}) {
  return deliveryManifestPolicySuggestionOutputContext({
    artifact,
    manifestUpdate,
    manifestVerification,
    diagnostics,
    warnings,
  });
}

export function deliveryManifestPolicySuggestionOutputContext({
  artifact,
  manifestUpdate = null,
  manifestVerification = null,
  diagnostics = {},
  warnings = [],
}) {
  return {
    ok: manifestVerification ? Boolean(manifestVerification.ok) : true,
    artifact: deliveryManifestCloneSummary(artifact),
    manifestUpdate: deliveryManifestCloneSummary(manifestUpdate),
    manifestVerification: deliveryManifestCloneSummary(manifestVerification),
    diagnostics: deliveryManifestCloneSummary(diagnostics),
    warnings: [...warnings],
  };
}

export function deliveryManifestPolicySuggestionMarkdown(output) {
  return `${deliveryManifestPolicySuggestionMarkdownLines(output).join('\n')}\n`;
}

export function deliveryManifestPolicySuggestionMarkdownLines(output) {
  const suggestion = deliveryManifestCloneSummary(output);
  const lines = [
    `### Slide artifact policy: ${suggestion.artifact.name}`,
    '',
    `- ok: ${suggestion.ok ? 'true' : 'false'}`,
    `- type: ${suggestion.artifact.type}`,
    `- dir: ${suggestion.artifact.dir}`,
    `- basename: ${suggestion.artifact.basename}`,
  ];

  if (suggestion.artifact.type === 'deck') {
    lines.push(`- slides: ${suggestion.artifact.minSlides}..${suggestion.artifact.maxSlides}`);
    lines.push(`- requiredSlideTitles: ${deliveryManifestFormatList(suggestion.artifact.requiredSlideTitles)}`);
    lines.push(`- maxPptxImages: ${suggestion.artifact.maxPptxImages ?? 0}`);
    lines.push(`- allowedPptxImageSlides: ${deliveryManifestFormatList(suggestion.artifact.allowedPptxImageSlides || [])}`);
    lines.push(`- maxPptxSpecialElements: ${suggestion.artifact.maxPptxSpecialElements ?? 0}`);
    lines.push(`- allowedPptxSpecialElementSlides: ${deliveryManifestFormatList(suggestion.artifact.allowedPptxSpecialElementSlides || [])}`);
    lines.push(`- allowedPptxSpecialElementTypes: ${deliveryManifestFormatList(suggestion.artifact.allowedPptxSpecialElementTypes || [])}`);
  } else {
    lines.push(`- requiredTerms: ${deliveryManifestFormatList(suggestion.artifact.requiredTerms || [])}`);
    lines.push(`- htmlBytes: ${suggestion.diagnostics.htmlBytes}`);
    lines.push(`- svgBytes: ${suggestion.diagnostics.svgBytes}`);
  }

  if (suggestion.manifestUpdate) {
    lines.push(`- manifestUpdate: ${suggestion.manifestUpdate.action} ${suggestion.manifestUpdate.path}#${suggestion.manifestUpdate.index}`);
  }
  if (suggestion.manifestVerification) {
    lines.push(`- manifestVerification: ${suggestion.manifestVerification.ok ? 'ok' : 'failed'}`);
  }
  if (suggestion.warnings.length) {
    lines.push(`- warnings: ${suggestion.warnings.join(' / ')}`);
  }

  return lines;
}

export function deliveryManifestPolicySuggestionText(output, format = 'json') {
  return format === 'markdown'
    ? deliveryManifestPolicySuggestionMarkdown(output)
    : JSON.stringify(output, null, 2);
}

function deliveryManifestFormatList(values = []) {
  return values.length ? values.join(', ') : 'none';
}

export function deliveryManifestMergeIdentityCheck(summary, kind, identityCheck) {
  return deliveryManifestMergeIdentityCheckContext(summary, kind, identityCheck).summary;
}

export function deliveryManifestMergeIdentityCheckContext(summary, kind, identityCheck) {
  if (!summary || !identityCheck) return { summary };
  const nextSummary = deliveryManifestCloneSummary(summary);
  nextSummary.identityChecks ||= {};
  nextSummary.identityChecks[kind] = deliveryManifestCloneSummary(identityCheck);
  return { summary: nextSummary };
}

export function deliveryManifestMergeDiscordReportValidation(summary, validationResult, kind) {
  return deliveryManifestMergeDiscordReportValidationContext(summary, validationResult, kind);
}

export function deliveryManifestMergeDiscordReportValidationContext(summary, validationResult, kind) {
  const nextSummary = deliveryManifestCloneSummary(summary);
  const errors = [...(validationResult?.errors || [])];
  if (!nextSummary || !validationResult) return { summary: nextSummary, errors };
  if (kind === 'deliveryMessage') {
    nextSummary.deliveryMessage = deliveryManifestCloneSummary(validationResult.deliveryMessage);
    if (validationResult.identityCheck) {
      nextSummary.identityChecks ||= {};
      nextSummary.identityChecks.deliveryMessage = deliveryManifestCloneSummary(validationResult.identityCheck);
    }
  } else if (kind === 'deliveryManifest') {
    nextSummary.deliveryManifest = deliveryManifestCloneSummary(validationResult.deliveryManifest);
    if (validationResult.identityCheck) {
      nextSummary.identityChecks ||= {};
      nextSummary.identityChecks.deliveryManifest = deliveryManifestCloneSummary(validationResult.identityCheck);
    }
  }
  return { summary: nextSummary, errors };
}

export function deliveryManifestApplyDiscordReportValidation(summary, validationResult, kind, errors = []) {
  return deliveryManifestApplyDiscordReportValidationContext(summary, validationResult, kind, errors);
}

export function deliveryManifestApplyDiscordReportValidationContext(summary, validationResult, kind, errors = []) {
  const merged = deliveryManifestMergeDiscordReportValidation(summary, validationResult, kind);
  return {
    summary: merged.summary,
    errors: [
      ...(Array.isArray(errors) ? errors : []),
      ...merged.errors,
    ],
  };
}

export function deliveryManifestApplyDiscordReportValidations(summary, validationResults = [], errors = []) {
  return deliveryManifestApplyDiscordReportValidationsContext(summary, validationResults, errors);
}

export function deliveryManifestApplyDiscordReportValidationsContext(summary, validationResults = [], errors = []) {
  let nextSummary = summary;
  const nextErrors = [...(Array.isArray(errors) ? errors : [])];
  const appliedResults = [];
  for (const item of validationResults) {
    const kind = item?.kind;
    const validationResult = item?.validationResult;
    if (!kind || !validationResult) continue;
    const merged = deliveryManifestApplyDiscordReportValidationContext(nextSummary, validationResult, kind, nextErrors);
    nextSummary = merged.summary;
    nextErrors.length = 0;
    nextErrors.push(...merged.errors);
    appliedResults.push({
      kind,
      validationResult,
    });
  }
  return {
    summary: nextSummary,
    errors: nextErrors,
    validationResults: appliedResults,
  };
}

export function deliveryManifestCollectDiscordReportValidations(summary, cli = {}, options = {}) {
  const validationContext = deliveryManifestCollectDiscordReportValidationsContext(summary, cli, options);
  return validationContext.validationResults;
}

export function deliveryManifestCollectDiscordReportValidationsContext(summary, cli = {}, options = {}) {
  const order = Array.isArray(options.order) && options.order.length
    ? options.order
    : ['deliveryManifest', 'deliveryMessage'];
  const collectors = {
    deliveryManifest: () => cli.deliveryManifestPath ? {
      kind: 'deliveryManifest',
      validationResult: deliveryManifestValidateAcceptanceManifest(summary, cli.deliveryManifestPath),
    } : null,
    deliveryMessage: () => cli.deliveryMessagePath ? {
      kind: 'deliveryMessage',
      validationResult: deliveryManifestSummarizeDeliveryMessage(summary, cli.deliveryMessagePath),
    } : null,
  };
  const validationResults = [];
  for (const kind of order) {
    const item = collectors[kind]?.();
    if (item) validationResults.push(item);
  }
  return {
    validationResults,
  };
}

export function deliveryManifestBuildDiscordReportValidation(summary, cli = {}, kind) {
  if (kind === 'deliveryMessage' && cli.deliveryMessagePath) {
    return {
      kind,
      validationResult: deliveryManifestSummarizeDeliveryMessage(summary, cli.deliveryMessagePath),
    };
  }
  if (kind === 'deliveryManifest' && cli.deliveryManifestPath) {
    return {
      kind,
      validationResult: deliveryManifestValidateAcceptanceManifest(summary, cli.deliveryManifestPath),
    };
  }
  return null;
}

export function deliveryManifestValidateDiscordReportValidationsInOrder(summary, cli = {}, errors = [], order = ['deliveryMessage', 'deliveryManifest']) {
  return deliveryManifestValidateDiscordReportValidationsContext(summary, cli, errors, order);
}

export function deliveryManifestValidateDiscordReportValidations(summary, cli = {}, errors = []) {
  return deliveryManifestValidateDiscordReportValidationsInOrder(summary, cli, errors);
}

export function deliveryManifestValidateDiscordReportValidationsContext(summary, cli = {}, errors = [], order = ['deliveryMessage', 'deliveryManifest']) {
  let nextSummary = summary;
  let nextErrors = [...(Array.isArray(errors) ? errors : [])];
  const validationResults = [];
  for (const kind of order) {
    const validation = deliveryManifestBuildDiscordReportValidation(nextSummary, cli, kind);
    if (!validation) continue;
    validationResults.push(validation);
    const merged = deliveryManifestApplyDiscordReportValidation(
      nextSummary,
      validation.validationResult,
      validation.kind,
      nextErrors,
    );
    nextSummary = merged.summary;
    nextErrors = merged.errors;
  }
  return {
    summary: nextSummary,
    errors: nextErrors,
    validationResults,
  };
}

export function deliveryManifestDiscordReportSectionStatusErrors(sections = {}) {
  const errors = [];
  if (!sections.verification) errors.push('検証結果 section is missing status');
  if (!sections.acceptance) errors.push('納品前チェック section is missing status');
  for (const [name, status] of Object.entries(sections)) {
    if (status && !['ready', 'blocked'].includes(status)) errors.push(`${name} status is unsupported: ${status}`);
    if (status === 'blocked') errors.push(`${name} status is blocked`);
  }
  return errors;
}

export function deliveryManifestDiscordReportMediaQaErrors(summary = {}, sections = {}) {
  const errors = [];
  for (const [name, visualQa] of Object.entries(summary?.visualQa || {})) {
    if (visualQa?.status === 'blocked') errors.push(`${name} visual QA status is blocked`);
    if (sections[name] === 'ready' && visualQa?.status === 'missing') errors.push(`${name} visual QA status is missing`);
  }
  for (const [name, pptxQa] of Object.entries(summary?.pptxInternalQa || {})) {
    if (sections[name] === 'ready' && pptxQa?.images?.status === 'missing') errors.push(`${name} PPTX images status is missing`);
    if (sections[name] === 'ready' && pptxQa?.specialElements?.status === 'missing') errors.push(`${name} PPTX special elements status is missing`);
    if (sections[name] === 'ready' && pptxQa?.hiddenText?.status === 'missing') errors.push(`${name} PPTX hidden text status is missing`);
    if (sections[name] === 'ready' && Number(pptxQa?.images?.count || 0) > 0) errors.push(`${name} PPTX images count is nonzero: ${pptxQa.images.count}`);
    if (sections[name] === 'ready' && Number(pptxQa?.specialElements?.count || 0) > 0) errors.push(`${name} PPTX special elements count is nonzero: ${pptxQa.specialElements.count}`);
    if (sections[name] === 'ready' && Number(pptxQa?.hiddenText?.count || 0) > 0) errors.push(`${name} PPTX hidden text count is nonzero: ${pptxQa.hiddenText.count}`);
  }
  return errors;
}

export function deliveryManifestDiscordReportAcceptanceGateErrors(summary = {}, sections = {}) {
  if (sections.acceptance !== 'ready') return [];
  const errors = [];
  const {
    deliveryReadiness,
    checkedArtifactTypes,
    checkedArtifacts,
  } = deliveryManifestNormalizeDiscordReportSummarySnapshot(summary);
  const acceptanceManifest = summary?.acceptanceManifest || null;
  if (!deliveryReadiness) {
    errors.push('acceptance delivery readiness status is missing');
    errors.push('acceptance delivery readiness reasons are missing');
  } else {
    if (deliveryReadiness.status === 'missing') {
      errors.push('acceptance delivery readiness status is missing');
      if (!deliveryReadiness.reasonsLine) errors.push('acceptance delivery readiness reasons are missing');
    } else {
      if (!deliveryReadiness.ok) errors.push('acceptance delivery readiness is blocked');
      if (!deliveryReadiness.reasonsLine) errors.push('acceptance delivery readiness reasons are missing');
    }
  }
  const checkedArtifactsCount = Number.isInteger(checkedArtifacts?.count) ? checkedArtifacts.count : null;
  if (!Number.isInteger(checkedArtifactsCount)) errors.push('acceptance checked artifacts count is missing');
  if (checkedArtifactTypes?.status === 'missing') errors.push('acceptance checked artifact types are missing');
  if (acceptanceManifest?.scopeStatus === 'missing') errors.push('acceptance manifest verification scope is missing');
  return errors;
}

export function deliveryManifestDiscordReportAttachmentValidation(summary = {}) {
  const errors = [];
  const warnings = [];
  const policy = summary?.attachmentPolicy;
  if (!policy) return { errors, warnings };
  for (const type of policy.required || []) {
    const error = deliveryManifestValidateArtifact(type, summary?.artifactDetails?.[type]);
    if (error) errors.push(error);
  }
  for (const type of policy.optional || []) {
    const warning = deliveryManifestValidateArtifact(type, summary?.artifactDetails?.[type], 'optional ');
    if (warning) warnings.push(warning);
  }
  if (!policy.requiredReady) {
    errors.push(`required attachments are not ready: ${(policy.required || []).join(', ')}`);
  }
  return { errors, warnings };
}

export function deliveryManifestDiscordReportBaseValidation(summary = {}, sections = {}, cliErrors = []) {
  const validationContext = deliveryManifestDiscordReportBaseValidationContext(summary, sections, cliErrors);
  return {
    errors: validationContext.errors,
    warnings: validationContext.warnings,
  };
}

export function deliveryManifestDiscordReportBaseValidationContext(summary = {}, sections = {}, cliErrors = []) {
  const attachmentValidation = deliveryManifestDiscordReportAttachmentValidation(summary);
  const sectionStatusErrors = deliveryManifestDiscordReportSectionStatusErrors(sections);
  const mediaQaErrors = deliveryManifestDiscordReportMediaQaErrors(summary, sections);
  return {
    attachmentValidation,
    sectionStatusErrors,
    mediaQaErrors,
    errors: [
      ...(Array.isArray(cliErrors) ? cliErrors : []),
      ...sectionStatusErrors,
      ...attachmentValidation.errors,
      ...mediaQaErrors,
    ],
    warnings: [
      ...attachmentValidation.warnings,
    ],
  };
}

export function deliveryManifestApplyDiscordReportAcceptanceManifest(summary, manifestPath, errors = []) {
  const nextSummary = deliveryManifestCloneSummary(summary);
  const nextErrors = [...(Array.isArray(errors) ? errors : [])];
  if (!nextSummary) return { summary: nextSummary, errors: nextErrors };
  const acceptanceManifest = deliveryManifestSummarizeAcceptanceManifest(nextSummary, manifestPath);
  nextSummary.acceptanceManifest = {
    ...nextSummary.acceptanceManifest,
    ...deliveryManifestCloneSummary(acceptanceManifest.acceptanceManifest),
  };
  if (acceptanceManifest.identityCheck) {
    nextSummary.identityChecks ||= {};
    nextSummary.identityChecks.report = deliveryManifestCloneSummary(acceptanceManifest.identityCheck);
  }
  nextErrors.push(...acceptanceManifest.errors);
  return {
    summary: nextSummary,
    errors: nextErrors,
  };
}

export function deliveryManifestDiscordReportAcceptanceValidation(summary, sections = {}, errors = []) {
  return deliveryManifestDiscordReportAcceptanceValidationContext(summary, sections, errors);
}

export function deliveryManifestDiscordReportAcceptanceValidationContext(summary, sections = {}, errors = []) {
  if (sections.acceptance !== 'ready') {
    return {
      summary,
      errors: [...(Array.isArray(errors) ? errors : [])],
    };
  }
  const nextErrors = [
    ...(Array.isArray(errors) ? errors : []),
    ...deliveryManifestDiscordReportAcceptanceGateErrors(summary, sections),
  ];
  return deliveryManifestApplyDiscordReportAcceptanceManifest(summary, summary?.acceptanceManifest?.path, nextErrors);
}

export function deliveryManifestDiscordReportValidationSummary(summary, sections = {}, cliErrors = []) {
  const validationContext = deliveryManifestDiscordReportValidationContext(summary, sections, cliErrors);
  return validationContext;
}

export function deliveryManifestDiscordReportValidationContext(summary, sections = {}, cliErrors = []) {
  let nextSummary = deliveryManifestCloneSummary(summary);
  const baseValidation = deliveryManifestDiscordReportBaseValidation(nextSummary, sections, cliErrors);
  const errors = [...baseValidation.errors];
  const warnings = [...baseValidation.warnings];
  const acceptanceValidation = deliveryManifestDiscordReportAcceptanceValidation(nextSummary, sections, errors);
  nextSummary = acceptanceValidation.summary;
  errors.length = 0;
  errors.push(...acceptanceValidation.errors);
  return { summary: nextSummary, errors, warnings };
}

export function deliveryManifestValidateDiscordReport(summary, sections = {}, cliErrors = []) {
  return deliveryManifestValidateDiscordReportContext(summary, sections, cliErrors);
}

export function deliveryManifestValidateDiscordReportContext(summary, sections = {}, cliErrors = []) {
  return deliveryManifestDiscordReportValidationSummary(summary, sections, cliErrors);
}

export function deliveryManifestSectionDeliveryReadiness(text, heading) {
  const section = deliveryManifestReportSection(text, heading);
  const readiness = section.match(/^- delivery readiness:\s*(\S+)/m);
  const reasons = section.match(/^- reasons:\s*(.+)$/m);
  if (!readiness && !reasons) {
    return {
      status: 'missing',
      ok: false,
      reasons: ['missing'],
      line: null,
      reasonsLine: null,
    };
  }
  const status = readiness?.[1] || 'missing';
  const reasonText = reasons?.[1]?.trim() || '';
  return {
    status,
    ok: status === 'ready',
    reasons: reasonText && reasonText !== 'none'
      ? reasonText.split(';').map((reason) => reason.trim()).filter(Boolean)
      : [],
    line: readiness ? readiness[0].replace(/^- /, '') : null,
    reasonsLine: reasons ? reasons[0].replace(/^- /, '') : null,
  };
}

function deliveryManifestSectionPptxLine(section, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = section.match(new RegExp(`^- ${escaped}:\\s*(\\d+)\\s*\\(([^)]*)\\)`, 'm'));
  if (!line) return { status: 'missing', count: null, breakdown: null, line: null };
  return {
    status: 'present',
    count: Number(line[1]),
    breakdown: line[2],
    line: line[0].replace(/^- /, ''),
  };
}

function deliveryManifestSectionPptxHiddenTextLine(section) {
  const line = section.match(/^- PPTX hidden text:\s*(\d+)/m);
  if (!line) return { status: 'missing', count: null, line: null };
  return {
    status: 'present',
    count: Number(line[1]),
    line: line[0].replace(/^- /, ''),
  };
}

export function deliveryManifestSummarizeVisualQa(screenshotGenerated, screenshotPath, verification) {
  const screenshot = verification?.screenshot || null;
  const source = typeof screenshotGenerated === 'object' ? screenshotGenerated.source : screenshotGenerated ? 'chrome' : 'none';
  const generated = typeof screenshotGenerated === 'object' ? screenshotGenerated.ok : Boolean(screenshotGenerated);
  return {
    status: screenshot ? 'ready' : generated ? 'blocked' : 'not generated',
    source,
    screenshot: generated ? screenshotPath : null,
    width: screenshot?.width || null,
    height: screenshot?.height || null,
    bytes: screenshot?.bytes || null,
    uniqueSampledColors: screenshot?.uniqueSampledColors ?? null,
  };
}

export function deliveryManifestFormatVisualQa(visualQa) {
  return deliveryManifestFormatVisualQaContext(visualQa).text;
}

export function deliveryManifestFormatVisualQaContext(visualQa) {
  const nextVisualQa = deliveryManifestCloneSummary(visualQa);
  if (nextVisualQa.status !== 'ready') {
    const text = `${nextVisualQa.status} / source: ${nextVisualQa.source || 'unknown'} / uniqueSampledColors: n/a`;
    return {
      visualQa: { ...nextVisualQa },
      text,
      line: text,
    };
  }
  const dimensions = Number.isFinite(nextVisualQa.width) && Number.isFinite(nextVisualQa.height)
    ? `${nextVisualQa.width}x${nextVisualQa.height} / `
    : '';
  const text = `ready / source: ${nextVisualQa.source || 'unknown'} / ${dimensions}uniqueSampledColors: ${nextVisualQa.uniqueSampledColors}`;
  return {
    visualQa: { ...nextVisualQa },
    text,
    line: text,
  };
}

export function deliveryManifestFormatVisualQaLine(visualQa) {
  return deliveryManifestFormatVisualQaLineContext(visualQa).line;
}

export function deliveryManifestFormatVisualQaLineContext(visualQa) {
  if (typeof visualQa?.line === 'string') {
    return {
      visualQa: { ...deliveryManifestCloneSummary(visualQa) },
      line: visualQa.line,
    };
  }
  const nextVisualQa = deliveryManifestFormatVisualQaContext(visualQa);
  return {
    visualQa: { ...nextVisualQa.visualQa },
    line: `visual QA: ${nextVisualQa.text}`,
  };
}

export function deliveryManifestSummarizeDeliveryReadiness(verification, acceptance, visualQa) {
  return deliveryManifestSummarizeDeliveryReadinessContext(verification, acceptance, visualQa);
}

function deliveryManifestBuildDeliveryReadinessSnapshot({
  verificationStatus,
  acceptanceStatus,
  visualQaStatus,
  visualQaSource,
  visualQaWidth,
  visualQaHeight,
  visualQaUniqueSampledColors,
  pptxImages,
  pptxSpecialElements,
  pptxHiddenText,
  reasons,
}) {
  const ok = verificationStatus === 'ready'
    && acceptanceStatus === 'ready'
    && visualQaStatus === 'ready'
    && pptxImages === 0
    && pptxSpecialElements === 0
    && pptxHiddenText === 0;
  const line = deliveryManifestFormatDeliveryReadinessLineContext({ ok }).line;
  const reasonsLine = deliveryManifestFormatDeliveryReasonsLineContext({ reasons }).line;
  return {
    ok,
    verification: verificationStatus,
    acceptance: acceptanceStatus,
    visualQa: visualQaStatus,
    visualQaSource,
    visualQaWidth,
    visualQaHeight,
    visualQaUniqueSampledColors,
    pptxImages,
    pptxSpecialElements,
    pptxHiddenText,
    line,
    reasonsLine,
    reasons: [...reasons],
    message: ok ? 'ready for Discord delivery' : 'blocked before Discord delivery',
  };
}

function deliveryManifestNormalizeDeliveryReadinessSnapshot(deliveryReadiness) {
  if (!deliveryReadiness) return null;
  const reasons = Array.isArray(deliveryReadiness.reasons) ? [...deliveryReadiness.reasons] : [];
  const ok = deliveryReadiness.ok === true || deliveryReadiness.status === 'ready';
  return {
    ...deliveryReadiness,
    ok,
    reasons: [...reasons],
    line: deliveryReadiness.line
      || deliveryManifestFormatDeliveryReadinessLineContext({ ok }).line,
    reasonsLine: deliveryReadiness.reasonsLine
      || deliveryManifestFormatDeliveryReasonsLineContext({ reasons }).line,
  };
}

function deliveryManifestNormalizeCheckedArtifactTypesSnapshot(checkedArtifactTypes) {
  if (!checkedArtifactTypes) return null;
  const types = Array.isArray(checkedArtifactTypes.types) ? [...checkedArtifactTypes.types] : [];
  const status = types.length > 0 ? 'present' : 'missing';
  return {
    ...checkedArtifactTypes,
    status,
    types,
    line: checkedArtifactTypes.line
      || deliveryManifestFormatCheckedArtifactTypesLineContext(types).line,
  };
}

function deliveryManifestNormalizeCheckedArtifactsSnapshot(checkedArtifacts) {
  if (!checkedArtifacts) return null;
  const count = Number.isInteger(checkedArtifacts)
    ? checkedArtifacts
    : Number.isInteger(checkedArtifacts.count)
      ? checkedArtifacts.count
      : null;
  const status = count !== null ? 'present' : 'missing';
  const line = checkedArtifacts.line
    || deliveryManifestFormatCheckedArtifactsLineContext(count).line;
  return {
    ...checkedArtifacts,
    status,
    count,
    line,
  };
}

function deliveryManifestCloneCheckedArtifactTypesSnapshot(checkedArtifactTypes) {
  if (!checkedArtifactTypes) return null;
  const types = Array.isArray(checkedArtifactTypes.types) ? [...checkedArtifactTypes.types] : [];
  return {
    ...checkedArtifactTypes,
    types,
  };
}

function deliveryManifestCloneCheckedArtifactsSnapshot(checkedArtifacts) {
  if (!checkedArtifacts) return null;
  const count = Number.isInteger(checkedArtifacts.count) ? checkedArtifacts.count : null;
  const status = count !== null ? 'present' : 'missing';
  const line = checkedArtifacts.line
    || (count !== null ? `checked artifacts: ${count}` : 'checked artifacts: missing');
  return {
    ...checkedArtifacts,
    status,
    count,
    line,
  };
}

function deliveryManifestCloneNestedSnapshot(snapshot) {
  if (!snapshot) return snapshot;
  return deliveryManifestCloneSummary(snapshot);
}

function deliveryManifestDiscordReportSummaryContext({
  deliveryReadiness = null,
  checkedArtifactTypes = null,
  checkedArtifacts = null,
}) {
  const nextDeliveryReadiness = deliveryManifestCloneDeliveryReadinessSnapshot(deliveryReadiness);
  const nextCheckedArtifactTypes = deliveryManifestCloneCheckedArtifactTypesSnapshot(checkedArtifactTypes);
  const nextCheckedArtifacts = deliveryManifestCloneCheckedArtifactsSnapshot(checkedArtifacts);
  return {
    deliveryReadiness: nextDeliveryReadiness,
    checkedArtifactTypes: nextCheckedArtifactTypes,
    checkedArtifacts: nextCheckedArtifacts,
  };
}

function deliveryManifestCloneDeliveryReadinessSnapshot(deliveryReadiness) {
  if (!deliveryReadiness) return null;
  const reasons = Array.isArray(deliveryReadiness.reasons) ? [...deliveryReadiness.reasons] : [];
  return {
    ...deliveryReadiness,
    reasons: [...reasons],
  };
}

function deliveryManifestNormalizeDiscordReportSummarySnapshot(summary = {}, { deliveryReadiness = null } = {}) {
  const deliveryReadinessSource = deliveryReadiness || summary?.deliveryReadiness || null;
  const checkedArtifactTypesSource = summary?.checkedArtifactTypes || null;
  const checkedArtifactsSource = summary?.checkedArtifacts || null;
  return {
    deliveryReadiness: deliveryManifestNormalizeDeliveryReadinessSnapshot(deliveryReadinessSource),
    checkedArtifactTypes: deliveryManifestNormalizeCheckedArtifactTypesSnapshot(checkedArtifactTypesSource),
    checkedArtifacts: deliveryManifestNormalizeCheckedArtifactsSnapshot(checkedArtifactsSource),
  };
}

export function deliveryManifestSummarizeDeliveryReadinessContext(verification, acceptance, visualQa) {
  const nextVerification = deliveryManifestCloneSummary(verification);
  const nextAcceptance = deliveryManifestCloneSummary(acceptance);
  const nextVisualQa = deliveryManifestCloneSummary(visualQa);
  const verificationStatus = nextVerification?.ok ? 'ready' : 'blocked';
  const acceptanceStatus = nextAcceptance?.ok ? 'ready' : 'blocked';
  const visualQaStatus = nextVisualQa?.status || 'missing';
  const visualQaSource = nextVisualQa?.source || 'none';
  const visualQaWidth = Number.isFinite(nextVisualQa?.width) ? nextVisualQa.width : null;
  const visualQaHeight = Number.isFinite(nextVisualQa?.height) ? nextVisualQa.height : null;
  const visualQaUniqueSampledColors = Number.isFinite(nextVisualQa?.uniqueSampledColors)
    ? nextVisualQa.uniqueSampledColors
    : null;
  const pptxImages = Number(nextVerification?.imageCount ?? 0);
  const pptxSpecialElements = Number(nextVerification?.specialElementCount ?? 0);
  const pptxHiddenText = Number(nextVerification?.hiddenTextCount ?? 0);
  const reasons = [];
  if (verificationStatus !== 'ready') reasons.push('verification not ready');
  if (acceptanceStatus !== 'ready') reasons.push('acceptance not ready');
  if (visualQaStatus !== 'ready') reasons.push(`visual QA not ready: ${visualQaStatus}`);
  if (pptxImages > 0) reasons.push(`PPTX images present: ${pptxImages}`);
  if (pptxSpecialElements > 0) reasons.push(`PPTX special elements present: ${pptxSpecialElements}`);
  if (pptxHiddenText > 0) reasons.push(`PPTX hidden text present: ${pptxHiddenText}`);
  const nextDeliveryReadiness = deliveryManifestBuildDeliveryReadinessSnapshot({
    verificationStatus,
    acceptanceStatus,
    visualQaStatus,
    visualQaSource,
    visualQaWidth,
    visualQaHeight,
    visualQaUniqueSampledColors,
    pptxImages,
    pptxSpecialElements,
    pptxHiddenText,
    reasons,
  });
  return {
    ...nextDeliveryReadiness,
  };
}

export function deliveryManifestFormatIdentityChecks(identityChecks) {
  return deliveryManifestFormatIdentityChecksContext(identityChecks).text;
}

export function deliveryManifestFormatIdentityChecksContext(identityChecks) {
  const order = ['report', 'deliveryMessage', 'deliveryManifest'];
  const parts = order
    .filter((name) => identityChecks?.[name])
    .map((name) => `${name} ${identityChecks[name].matched ? 'ready' : 'blocked'}`);
  const text = parts.length ? parts.join(' / ') : 'missing';
  return {
    identityChecks: deliveryManifestCloneSummary(identityChecks),
    order,
    parts: [...parts],
    text,
    line: `identity checks: ${text}`,
  };
}

export function deliveryManifestFormatPptxImagesLineContext(verification) {
  const nextVerification = deliveryManifestCloneSummary(verification);
  const breakdown = deliveryManifestFormatBreakdownLineContext(nextVerification.imageBreakdown);
  return {
    imageCount: nextVerification.imageCount ?? 0,
    imageBreakdown: breakdown.breakdown,
    line: `PPTX images: ${nextVerification.imageCount} (${breakdown.line})`,
  };
}

export function deliveryManifestFormatPptxSpecialElementsLineContext(verification) {
  const nextVerification = deliveryManifestCloneSummary(verification);
  const breakdown = deliveryManifestFormatBreakdownLineContext(nextVerification.specialElementBreakdown);
  return {
    specialElementCount: nextVerification.specialElementCount ?? 0,
    specialElementBreakdown: breakdown.breakdown,
    line: `PPTX special elements: ${nextVerification.specialElementCount} (${breakdown.line})`,
  };
}

export function deliveryManifestFormatPptxHiddenTextLineContext(verification) {
  const nextVerification = deliveryManifestCloneSummary(verification);
  return {
    hiddenTextCount: nextVerification.hiddenTextCount ?? 0,
    line: `PPTX hidden text: ${nextVerification.hiddenTextCount ?? 0}`,
  };
}

export function deliveryManifestFormatIdentityChecksLine(identityChecks) {
  return deliveryManifestFormatIdentityChecksLineContext(identityChecks).line;
}

export function deliveryManifestFormatIdentityChecksLineContext(identityChecks) {
  if (!identityChecks) {
    return {
      identityChecks: null,
      text: null,
      line: null,
    };
  }
  const summarizedIdentityChecks = deliveryManifestFormatIdentityChecksContext(identityChecks);
  return {
    identityChecks: summarizedIdentityChecks
      ? {
        identityChecks: { ...summarizedIdentityChecks.identityChecks },
        order: [...summarizedIdentityChecks.order],
        parts: [...summarizedIdentityChecks.parts],
        text: summarizedIdentityChecks.text,
        line: summarizedIdentityChecks.line,
      }
      : null,
    text: summarizedIdentityChecks?.line || null,
    line: summarizedIdentityChecks?.line || null,
  };
}

function shellQuote(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:=+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

export function deliveryManifestSummarizeIdentityChecks(identityChecks, options = {}) {
  return deliveryManifestSummarizeIdentityChecksContext(identityChecks, options);
}

export function deliveryManifestSummarizeIdentityChecksContext(identityChecks, options = {}) {
  if (!identityChecks) return null;
  const names = Array.isArray(options.names) && options.names.length
    ? options.names
    : ['report', 'deliveryMessage', 'deliveryManifest'];
  const summary = {};
  for (const name of names) {
    if (!identityChecks[name]) continue;
    summary[name] = {
      matched: identityChecks[name].matched === true,
      mismatches: Array.isArray(identityChecks[name].mismatches) ? identityChecks[name].mismatches : [],
    };
  }
  return Object.keys(summary).length ? summary : null;
}

export function deliveryManifestExpectedIdentityQaLine(summary, options = {}) {
  return deliveryManifestExpectedIdentityQaLineContext(summary, options)?.line || null;
}

export function deliveryManifestExpectedIdentityQaLineContext(summary, options = {}) {
  const identityChecks = deliveryManifestSummarizeIdentityChecksContext(summary?.identityChecks, options);
  if (!identityChecks) return null;
  const nextIdentityQaLine = deliveryManifestFormatIdentityChecksLineContext(identityChecks);
  return {
    identityChecks: nextIdentityQaLine.identityChecks
      ? {
        order: [...nextIdentityQaLine.identityChecks.order],
        parts: [...nextIdentityQaLine.identityChecks.parts],
        text: nextIdentityQaLine.identityChecks.text,
        line: nextIdentityQaLine.identityChecks.line,
      }
      : null,
    line: nextIdentityQaLine.line,
  };
}

export function deliveryManifestExpectedDeliveryMessageQa(summary, text) {
  const expectedQaLines = deliveryManifestQaLines(summary);
  const actualQaLines = deliveryManifestSectionBullets(text, 'QA:');
  const missingQaLines = expectedQaLines.filter((line) => !text.includes(line));
  const qaOrderMatched = missingQaLines.length === 0
    && deliveryManifestOrderedSubsequenceMatched(expectedQaLines, actualQaLines);
  const expectedIdentityQaLine = deliveryManifestExpectedIdentityQaLine(summary, {
    names: ['report', 'deliveryMessage'],
  });
  const allowedUnexpectedLinePolicies = deliveryManifestIdentityQaPolicies(expectedIdentityQaLine);
  const qaDiff = deliveryManifestQaLineDiff(expectedQaLines, actualQaLines, allowedUnexpectedLinePolicies);
  const auditableQaLines = new Set([...expectedQaLines, ...qaDiff.allowedUnexpectedLines]);
  const duplicateQaLines = duplicateValues(actualQaLines.filter((line) => auditableQaLines.has(line)));
  return {
    expectedQaLines,
    actualQaLines,
    missingQaLines,
    qaOrderMatched,
    expectedIdentityQaLine,
    allowedUnexpectedLinePolicies,
    qaDiff,
    duplicateQaLines,
    qaMatched: missingQaLines.length === 0
      && qaOrderMatched
      && duplicateQaLines.length === 0
      && qaDiff.unexpectedLines.length === 0,
  };
}

export function deliveryManifestDeliveryMessageAttachmentSummary(summary, text) {
  const attachmentBullets = deliveryManifestSectionBullets(text, '添付ファイル:');
  const auditAttachmentBullets = deliveryManifestSectionBullets(text, '監査ファイル:');
  const missingDeliverableAttachments = (summary?.attachments?.deliverablePaths || [])
    .filter((attachmentPath) => !attachmentBullets.some((line) => line.includes(attachmentPath) && line.includes(path.basename(attachmentPath))));
  const missingAuditAttachments = (summary?.attachments?.auditPaths || [])
    .filter((attachmentPath) => !auditAttachmentBullets.some((line) => line.includes(attachmentPath) && line.includes(path.basename(attachmentPath))));
  const wrongSectionAuditAttachments = (summary?.attachments?.auditPaths || [])
    .filter((attachmentPath) => attachmentBullets.some((line) => line.includes(attachmentPath) || line.includes(path.basename(attachmentPath))));
  const missingAttachments = [...missingDeliverableAttachments, ...missingAuditAttachments];
  const attachmentSectionPresent = /^添付ファイル:\s*$/m.test(text);
  const auditSectionPresent = /^監査ファイル:\s*$/m.test(text);
  const errors = deliveryManifestDeliveryMessageAttachmentErrors(summary, {
    missingDeliverableAttachments,
    missingAuditAttachments,
    wrongSectionAuditAttachments,
  }, {
    attachmentSectionPresent,
    auditSectionPresent,
  });
  return {
    attachmentSectionPresent,
    auditSectionPresent,
    attachmentsMatched: missingAttachments.length === 0,
    missingAttachments,
    missingDeliverableAttachments,
    missingAuditAttachments,
    wrongSectionAuditAttachments,
    errors,
  };
}

export function deliveryManifestDeliveryMessageAttachmentErrors(summary, attachmentSummary, options = {}) {
  const attachmentSectionPresent = options.attachmentSectionPresent === true;
  const auditSectionPresent = options.auditSectionPresent === true;
  const errors = [
    ...(attachmentSummary?.missingDeliverableAttachments || [])
      .map((attachmentPath) => `delivery message missing attachment path: ${attachmentPath}`),
    ...(attachmentSummary?.missingAuditAttachments || [])
      .map((attachmentPath) => `delivery message missing audit attachment path: ${attachmentPath}`),
    ...(attachmentSummary?.wrongSectionAuditAttachments || [])
      .map((attachmentPath) => `delivery message audit attachment is listed as deliverable: ${attachmentPath}`),
  ];
  if (!attachmentSectionPresent && (summary?.attachments?.postablePaths || []).length > 0) {
    errors.push('delivery message missing attachment section');
  }
  if (!auditSectionPresent && (summary?.attachments?.audit || []).some((attachment) => attachment.attachable)) {
    errors.push('delivery message missing audit attachment section');
  }
  return errors;
}

export function deliveryManifestDeliveryMessageArtifactIdentitySummary(summary, text, deliveryMessagePath) {
  const expectedArtifact = deliveryManifestExpectedDeliveryMessageArtifact(summary, deliveryMessagePath);
  const artifactIdentity = deliveryManifestSectionKeyValues(text, 'Artifact:');
  const artifactIdentityRequired = Boolean(expectedArtifact);
  const artifactSectionPresent = /^Artifact:\s*$/m.test(text);
  const identityCheck = artifactIdentityRequired
    ? deliveryManifestArtifactIdentityCheck(deliveryManifestIdentityFromArtifact(expectedArtifact), artifactIdentity)
    : null;
  const errors = deliveryManifestDeliveryMessageArtifactIdentityErrors(identityCheck, {
    artifactIdentityRequired,
    artifactSectionPresent,
  });
  return {
    artifactSectionPresent,
    artifactIdentityRequired,
    artifactIdentity,
    expectedArtifact,
    identityCheck,
    errors,
  };
}

export function deliveryManifestDeliveryMessageArtifactIdentityErrors(identityCheck, options = {}) {
  const artifactIdentityRequired = options.artifactIdentityRequired === true;
  const artifactSectionPresent = options.artifactSectionPresent === true;
  const errors = [];
  if (artifactIdentityRequired && !artifactSectionPresent) {
    errors.push('delivery message missing artifact identity section');
  }
  for (const mismatch of identityCheck?.mismatches || []) {
    errors.push(`delivery message artifact ${mismatch.field} mismatch: expected ${mismatch.expected} / actual ${mismatch.actual ?? 'missing'}`);
  }
  return errors;
}

export function deliveryManifestDeliveryMessageReportSummary(summary, text, deliveryMessagePath, options = {}) {
  const artifactIdentitySummary = options.artifactIdentitySummary
    || deliveryManifestDeliveryMessageArtifactIdentitySummary(summary, text, deliveryMessagePath);
  const attachmentSummary = options.attachmentSummary
    || deliveryManifestDeliveryMessageAttachmentSummary(summary, text);
  const statusQaSummary = options.statusQaSummary
    || deliveryManifestDeliveryMessageStatusQaSummary(summary, text);
  return {
    deliveryMessage: deliveryManifestDeliveryMessagePayload({
      summary,
      text,
      deliveryMessagePath,
      artifactIdentitySummary,
      attachmentSummary,
      statusQaSummary,
    }),
    errors: deliveryManifestDeliveryMessageReportErrors({
      attachmentSummary,
      statusQaSummary,
      artifactIdentitySummary,
    }),
    artifactIdentitySummary,
    attachmentSummary,
    statusQaSummary,
  };
}

export function deliveryManifestDeliveryMessagePayload({
  summary = null,
  text = '',
  deliveryMessagePath = null,
  artifactIdentitySummary = null,
  attachmentSummary = null,
  statusQaSummary = null,
} = {}) {
  const resolvedArtifactIdentitySummary = artifactIdentitySummary
    || deliveryManifestDeliveryMessageArtifactIdentitySummary(summary, text, deliveryMessagePath);
  const resolvedAttachmentSummary = attachmentSummary
    || deliveryManifestDeliveryMessageAttachmentSummary(summary, text);
  const resolvedStatusQaSummary = statusQaSummary
    || deliveryManifestDeliveryMessageStatusQaSummary(summary, text);
  const expectedQa = resolvedStatusQaSummary.expectedQa;
  return {
    path: deliveryMessagePath,
    exists: true,
    bytes: Buffer.byteLength(text),
    readyHeaderPresent: resolvedStatusQaSummary.readyHeaderPresent,
    verificationHeaderPresent: resolvedStatusQaSummary.verificationHeaderPresent,
    artifactSectionPresent: resolvedArtifactIdentitySummary.artifactSectionPresent,
    artifactIdentity: resolvedArtifactIdentitySummary.artifactIdentity,
    expectedArtifact: resolvedArtifactIdentitySummary.expectedArtifact,
    attachmentSectionPresent: resolvedAttachmentSummary.attachmentSectionPresent,
    auditSectionPresent: resolvedAttachmentSummary.auditSectionPresent,
    attachmentsMatched: resolvedAttachmentSummary.attachmentsMatched,
    missingAttachments: resolvedAttachmentSummary.missingAttachments,
    missingDeliverableAttachments: resolvedAttachmentSummary.missingDeliverableAttachments,
    missingAuditAttachments: resolvedAttachmentSummary.missingAuditAttachments,
    wrongSectionAuditAttachments: resolvedAttachmentSummary.wrongSectionAuditAttachments,
    qaSectionPresent: resolvedStatusQaSummary.qaSectionPresent,
    expectedQaLines: expectedQa.expectedQaLines,
    actualQaLines: expectedQa.actualQaLines,
    qaDiff: expectedQa.qaDiff,
    expectedIdentityQaLine: expectedQa.expectedIdentityQaLine,
    qaOrderMatched: expectedQa.qaOrderMatched,
    duplicateQaLines: expectedQa.duplicateQaLines,
    qaMatched: expectedQa.qaMatched,
    missingQaLines: expectedQa.missingQaLines,
  };
}

export function deliveryManifestDeliveryMessageReportErrors({
  attachmentSummary = {},
  statusQaSummary = {},
  artifactIdentitySummary = {},
} = {}) {
  return [
    ...(attachmentSummary.errors || []),
    ...(statusQaSummary.headerErrors || []),
    ...(artifactIdentitySummary.errors || []),
    ...(statusQaSummary.qaErrors || []),
  ];
}

export function deliveryManifestDeliveryMessageStatusQaSummary(summary, text) {
  const expectedQa = deliveryManifestExpectedDeliveryMessageQa(summary, text);
  const readyHeaderPresent = /^納品準備OK:\s*\S+/m.test(text);
  const verificationHeaderPresent = /^検証:\s*\S+/m.test(text);
  const qaSectionPresent = /^QA:\s*$/m.test(text);
  const headerErrors = [];
  if (!readyHeaderPresent) {
    headerErrors.push('delivery message missing ready header');
  }
  if (!verificationHeaderPresent) {
    headerErrors.push('delivery message missing verification header');
  }
  const qaErrors = deliveryManifestDeliveryMessageQaErrors(expectedQa, { qaSectionPresent });
  return {
    readyHeaderPresent,
    verificationHeaderPresent,
    qaSectionPresent,
    expectedQa,
    headerErrors,
    qaErrors,
    errors: [...headerErrors, ...qaErrors],
  };
}

export function deliveryManifestDeliveryMessageQaErrors(expectedQa, options = {}) {
  const qaSectionPresent = options.qaSectionPresent === true;
  const qaErrors = [];
  for (const line of expectedQa.missingQaLines) {
    qaErrors.push(`delivery message missing QA line: ${line}`);
  }
  if (qaSectionPresent && expectedQa.missingQaLines.length === 0 && !expectedQa.qaOrderMatched) {
    qaErrors.push('delivery message QA lines are out of order');
  }
  for (const line of expectedQa.duplicateQaLines) {
    qaErrors.push(`delivery message duplicate QA line: ${line}`);
  }
  for (const line of expectedQa.qaDiff.unexpectedLines) {
    qaErrors.push(`delivery message unexpected QA line: ${line}`);
  }
  if (!qaSectionPresent && expectedQa.expectedQaLines.length > 0) {
    qaErrors.push('delivery message missing QA section');
  }
  return qaErrors;
}

export function deliveryManifestIdentityQaPolicies(expectedIdentityQaLine) {
  return [{
    name: 'identityChecks',
    exactLines: expectedIdentityQaLine ? [expectedIdentityQaLine] : [],
    reason: 'validated separately against delivery manifest identityChecks',
  }];
}

export function deliveryManifestHasIdentityQaLine(summary) {
  return (summary?.deliveryMessage?.actualQaLines || [])
    .some((line) => line.startsWith('identity checks:'));
}

export function deliveryManifestExpectedManifestQa(summary, parsedManifest = {}) {
  const identityChecks = deliveryManifestSummarizeIdentityChecks(summary?.identityChecks);
  const identityChecksRequired = parsedManifest?.identityChecks !== undefined || deliveryManifestHasIdentityQaLine(summary);
  return {
    identityChecksRequired,
    identityChecks,
    qaLines: deliveryManifestQaLines(summary, { identityChecks: identityChecksRequired ? identityChecks : null }),
  };
}

export function deliveryManifestExpectedManifestReportSummary(summary, parsed = {}) {
  const expected = {
    schemaVersion: 1,
    title: summary?.title || null,
    artifactName: summary?.reportArtifactIdentity?.name || null,
    artifactType: summary?.reportArtifactIdentity?.type || null,
    artifactDir: summary?.reportArtifactIdentity?.dir || null,
    basename: summary?.reportArtifactIdentity?.basename || null,
    readyHeader: `納品準備OK: ${summary?.title || 'slide deck'}`,
    verificationHeader: summary?.message ? `検証: ${summary.message}` : '検証: ready',
    qaLines: null,
    identityChecks: null,
    deliverablePaths: summary?.attachments?.deliverablePaths || [],
    auditPaths: summary?.attachments?.auditPaths || [],
  };
  const expectedManifestQa = deliveryManifestExpectedManifestQa(summary, parsed);
  expected.identityChecks = expectedManifestQa.identityChecks;
  expected.qaLines = expectedManifestQa.qaLines;
  const actual = {
    schemaVersion: parsed.schemaVersion ?? null,
    title: parsed.title ?? null,
    artifactName: parsed.artifactName ?? null,
    artifactType: parsed.artifactType ?? null,
    artifactDir: parsed.artifactDir ?? null,
    basename: parsed.basename ?? null,
    readyHeader: parsed.readyHeader ?? null,
    verificationHeader: parsed.verificationHeader ?? null,
    qaLines: Array.isArray(parsed.qaLines) ? parsed.qaLines : null,
    identityChecks: parsed.identityChecks ?? null,
    deliverablePaths: Array.isArray(parsed.deliverablePaths) ? parsed.deliverablePaths : null,
    auditPaths: Array.isArray(parsed.auditPaths) ? parsed.auditPaths : null,
  };
  const duplicateQaLines = duplicateDeliveryManifestArrayValues(parsed, 'qaLines', { allowedValues: expected.qaLines });
  const duplicateDeliverablePaths = duplicateDeliveryManifestArrayValues(parsed, 'deliverablePaths');
  const duplicateAuditPaths = duplicateDeliveryManifestArrayValues(parsed, 'auditPaths');
  const checks = {
    schemaVersionMatched: parsed.schemaVersion === expected.schemaVersion,
    titleMatched: parsed.title === expected.title,
    artifactNameMatched: parsed.artifactName === expected.artifactName,
    artifactTypeMatched: parsed.artifactType === expected.artifactType,
    artifactDirMatched: path.normalize(String(parsed.artifactDir || '')) === path.normalize(String(expected.artifactDir || '')),
    basenameMatched: parsed.basename === expected.basename,
    readyHeaderMatched: parsed.readyHeader === expected.readyHeader,
    verificationHeaderMatched: parsed.verificationHeader === expected.verificationHeader,
    qaLinesMatched: deliveryManifestArraysEqual(parsed.qaLines, expected.qaLines),
    qaLinesUnique: duplicateQaLines.length === 0,
    deliverablePathsUnique: duplicateDeliverablePaths.length === 0,
    auditPathsUnique: duplicateAuditPaths.length === 0,
    identityChecksRequired: expectedManifestQa.identityChecksRequired,
    identityChecksPresent: parsed.identityChecks !== undefined,
    identityChecksMatched: expectedManifestQa.identityChecksRequired
      ? deliveryManifestJsonEqual(parsed.identityChecks, expected.identityChecks)
      : parsed.identityChecks === undefined || deliveryManifestJsonEqual(parsed.identityChecks, expected.identityChecks),
    deliverablePathsMatched: deliveryManifestArraysEqual(parsed.deliverablePaths, expected.deliverablePaths),
    auditPathsMatched: deliveryManifestArraysEqual(parsed.auditPaths, expected.auditPaths),
  };
  return {
    expected,
    actual,
    checks,
    duplicateQaLines,
    duplicateDeliverablePaths,
    duplicateAuditPaths,
  };
}

export function deliveryManifestExpectedManifestReportErrors(manifestReport = {}) {
  const checks = manifestReport.checks || {};
  const errors = [];
  if (!checks.schemaVersionMatched) errors.push('delivery manifest schemaVersion mismatch');
  if (!checks.titleMatched) errors.push('delivery manifest title mismatch');
  if (!checks.artifactNameMatched) errors.push('delivery manifest artifactName mismatch');
  if (!checks.artifactTypeMatched) errors.push('delivery manifest artifactType mismatch');
  if (!checks.artifactDirMatched) errors.push('delivery manifest artifactDir mismatch');
  if (!checks.basenameMatched) errors.push('delivery manifest basename mismatch');
  if (!checks.readyHeaderMatched) errors.push('delivery manifest readyHeader mismatch');
  if (!checks.verificationHeaderMatched) errors.push('delivery manifest verificationHeader mismatch');
  if (!checks.qaLinesMatched) errors.push('delivery manifest qaLines mismatch');
  for (const line of manifestReport.duplicateQaLines || []) {
    errors.push(`delivery manifest duplicate QA line: ${line}`);
  }
  if (checks.identityChecksRequired && !checks.identityChecksPresent) errors.push('delivery manifest identityChecks missing');
  if (!checks.identityChecksMatched) errors.push('delivery manifest identityChecks mismatch');
  if (!checks.deliverablePathsMatched) errors.push('delivery manifest deliverablePaths mismatch');
  for (const filePath of manifestReport.duplicateDeliverablePaths || []) {
    errors.push(`delivery manifest duplicate deliverable path: ${filePath}`);
  }
  if (!checks.auditPathsMatched) errors.push('delivery manifest auditPaths mismatch');
  for (const filePath of manifestReport.duplicateAuditPaths || []) {
    errors.push(`delivery manifest duplicate audit path: ${filePath}`);
  }
  return errors;
}

export function deliveryManifestQaLineDiff(expectedLines, actualLines, allowedUnexpectedLinePolicies = []) {
  const maxLength = Math.max(expectedLines.length, actualLines.length);
  const missingLines = expectedLines.filter((line) => !actualLines.includes(line));
  const extraLines = actualLines.filter((line) => !expectedLines.includes(line));
  const allowedUnexpectedLines = extraLines.filter((line) => deliveryManifestAllowedUnexpectedQaLine(line, allowedUnexpectedLinePolicies));
  const unexpectedLines = extraLines.filter((line) => !deliveryManifestAllowedUnexpectedQaLine(line, allowedUnexpectedLinePolicies));
  const orderMatched = missingLines.length === 0 && deliveryManifestOrderedSubsequenceMatched(expectedLines, actualLines);
  let firstMismatch = null;
  if (!orderMatched) {
    for (let index = 0; index < maxLength; index += 1) {
      if (expectedLines[index] !== actualLines[index]) {
        firstMismatch = {
          index,
          expected: expectedLines[index] ?? null,
          actual: actualLines[index] ?? null,
        };
        break;
      }
    }
  }
  return {
    expectedCount: expectedLines.length,
    actualCount: actualLines.length,
    missingLines,
    allowedUnexpectedLines,
    allowedUnexpectedLinePolicies: allowedUnexpectedLinePolicies.map((policy) => ({
      name: policy.name,
      exactLines: policy.exactLines || [],
      pattern: policy.pattern?.source || null,
      reason: policy.reason,
    })),
    unexpectedLines,
    firstMismatch,
  };
}

function deliveryManifestAllowedUnexpectedQaLine(line, policies) {
  return policies.some((policy) => {
    if (Array.isArray(policy.exactLines) && policy.exactLines.includes(line)) return true;
    return policy.pattern ? policy.pattern.test(line) : false;
  });
}

export function deliveryManifestOrderedSubsequenceMatched(expectedLines, actualLines) {
  let actualIndex = 0;
  for (const expectedLine of expectedLines) {
    while (actualIndex < actualLines.length && actualLines[actualIndex] !== expectedLine) {
      actualIndex += 1;
    }
    if (actualIndex >= actualLines.length) return false;
    actualIndex += 1;
  }
  return true;
}
