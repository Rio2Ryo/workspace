import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(new URL('../', import.meta.url).pathname);
const cli = parseArgs(process.argv.slice(2));
const exampleVerifier = path.join(repoRoot, 'scripts', 'verify-example-catalog.mjs');
const flatVerifier = path.join(repoRoot, 'scripts', 'verify-flat-report-summary.mjs');

const exampleResult = runNodeScript(exampleVerifier, buildExampleVerifierArgs(cli));
const flatResult = runNodeScript(flatVerifier, buildFlatVerifierArgs(cli));

const examplePayload = parseJsonFromResult(exampleResult, 'verify-example-catalog');
const flatPayload = parseJsonFromResult(flatResult, 'verify-flat-report-summary');
const summary = {
  ok: exampleResult.status === 0 && flatResult.status === 0,
  label: cli.label,
  command: buildCommandLine(process.argv.slice(2)),
  catalogPath: cli.catalogPath ?? path.join('examples', 'verification-catalog.json'),
  only: cli.only,
  flatRoots: cli.flatRoots.length ? cli.flatRoots : null,
  exampleCatalog: examplePayload,
  flatReportSummary: flatPayload,
  errors: [
    ...collectErrors('verify-example-catalog', exampleResult, examplePayload),
    ...collectErrors('verify-flat-report-summary', flatResult, flatPayload),
  ],
};

if (cli.reportMdPath) {
  ensureParentDirectory(cli.reportMdPath);
  fs.writeFileSync(cli.reportMdPath, `${buildMarkdownReport(summary)}\n`, 'utf8');
}
if (cli.checklistMdPath) {
  ensureParentDirectory(cli.checklistMdPath);
  fs.writeFileSync(cli.checklistMdPath, `${buildChecklistReport(summary)}\n`, 'utf8');
}
if (cli.checklistJsonPath) {
  ensureParentDirectory(cli.checklistJsonPath);
  fs.writeFileSync(cli.checklistJsonPath, `${JSON.stringify(buildChecklistJson(summary), null, 2)}\n`, 'utf8');
}

const effectiveFormat = cli.format ?? (cli.reportMdPath ? 'md' : cli.checklistMdPath ? 'checklist' : 'json');
if (effectiveFormat === 'md') {
  console.log(buildMarkdownReport(summary));
} else if (effectiveFormat === 'checklist') {
  console.log(buildChecklistReport(summary));
} else {
  console.log(JSON.stringify(summary, null, 2));
}

process.exit(summary.ok ? 0 : 1);

function parseArgs(args) {
  const parsed = {
    catalogPath: null,
    only: null,
    flatRoots: [],
    format: null,
    label: 'shipping docs verification',
    checklistMdPath: null,
    checklistJsonPath: null,
    reportMdPath: null,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--only') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--only requires a comma-separated list of names or file names');
      }
      parsed.only = value;
      i += 1;
      continue;
    }
    if (arg === '--catalog') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--catalog requires a path');
      }
      parsed.catalogPath = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === '--flat-root') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--flat-root requires a path');
      }
      parsed.flatRoots.push(value);
      i += 1;
      continue;
    }
    if (arg === '--format') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--format requires a value');
      }
      if (!['json', 'md', 'checklist'].includes(value)) {
        throw new Error(`unsupported format: ${value}`);
      }
      parsed.format = value;
      i += 1;
      continue;
    }
    if (arg === '--label') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--label requires a label string');
      }
      parsed.label = value;
      i += 1;
      continue;
    }
    if (arg === '--report-md') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--report-md requires a path');
      }
      parsed.reportMdPath = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === '--checklist-md') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--checklist-md requires a path');
      }
      parsed.checklistMdPath = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === '--checklist-json') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--checklist-json requires a path');
      }
      parsed.checklistJsonPath = path.resolve(value);
      i += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return parsed;
}

function buildExampleVerifierArgs(cliOptions) {
  const args = [];
  if (cliOptions.catalogPath) {
    args.push('--catalog', cliOptions.catalogPath);
  }
  if (cliOptions.only) {
    args.push('--only', cliOptions.only);
  }
  return args;
}

function buildFlatVerifierArgs(cliOptions) {
  const args = [];
  for (const root of cliOptions.flatRoots) {
    args.push('--root', root);
  }
  return args;
}

function runNodeScript(scriptPath, args) {
  return spawnSync(process.execPath, ['--import', './tests/tempdir-cleanup.mjs', scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1',
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function ensureParentDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function parseJsonFromResult(result, label) {
  if (result.status !== 0 && !result.stdout) {
    return {
      ok: false,
      raw: result.stderr || `${label} failed without JSON output`,
    };
  }
  try {
    const trimmed = String(result.stdout || '').trim();
    if (!trimmed) {
      return {
        ok: false,
        raw: `${label} did not emit JSON`,
      };
    }
    const lines = trimmed.split(/\r?\n/);
    const jsonStart = lines.findIndex((line) => line.trim().startsWith('{') || line.trim().startsWith('['));
    if (jsonStart === -1) {
      return {
        ok: false,
        raw: `${label} did not emit JSON`,
      };
    }
    return JSON.parse(lines.slice(jsonStart).join('\n'));
  } catch (error) {
    return {
      ok: false,
      raw: `${label} JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function collectErrors(label, result, payload) {
  const errors = [];
  if (payload?.ok !== true) {
    errors.push(`${label} reported ok=false`);
  }
  if (result.status !== 0) {
    errors.push(result.stderr || `${label} failed`);
  }
  if (payload?.raw) {
    errors.push(payload.raw);
  }
  return errors;
}


function buildChecklistReport(summary) {
  const lines = [];
  if (summary.command) {
    lines.push(`- command: \`${summary.command}\``);
  }
  lines.push(`- label: ${summary.label}`);
  lines.push(`- catalog: ${summary.catalogPath}`);
  lines.push(`- sample filter: ${summary.only ?? 'all examples'}`);
  lines.push(`- flat roots: ${summary.flatRoots?.length ? summary.flatRoots.join(', ') : 'default repository shipping docs'}`);
  const catalogChecklist = summary.exampleCatalog?.ok ? 'x' : ' ';
  const flatChecklist = summary.flatReportSummary?.ok ? 'x' : ' ';
  lines.push(`- [${catalogChecklist}] Example catalog ${summary.exampleCatalog?.ok ? `verified ${summary.exampleCatalog?.verified ?? 0} example(s)` : `${(summary.exampleCatalog?.errors ?? []).length} example error(s)`}`);
  if ((summary.exampleCatalog?.entries ?? []).length > 0) {
    lines.push('  - entries:');
    for (const entry of summary.exampleCatalog.entries) {
      const status = entry.skipped === true ? 'skipped' : entry.ok === true ? 'verified' : 'blocked';
      lines.push(`    - ${entry.file} (${entry.name}): ${status}`);
      if (entry.reason) {
        lines.push(`      - reason: ${entry.reason}`);
      }
    }
  }
  lines.push(`- [${flatChecklist}] Flat report summary sweep ${summary.flatReportSummary?.ok ? `${summary.flatReportSummary?.scannedFiles ?? 0} file(s), ${summary.flatReportSummary?.legacyHits ?? 0} legacy hit(s)` : `${summary.flatReportSummary?.legacyHits ?? 0} legacy hit(s)`}`);
  if ((summary.flatReportSummary?.matches ?? []).length > 0) {
    lines.push('  - matches:');
    for (const match of summary.flatReportSummary.matches) {
      lines.push(`    - ${match.file}${match.line ? `:${match.line}` : ''}`);
      lines.push(`      - reason: ${match.reason}`);
      if (match.text) {
        lines.push(`      - text: ${match.text}`);
      }
    }
  }
  return lines.join('\n');
}

function buildChecklistJson(summary) {
  return {
    ok: summary.ok,
    label: summary.label,
    command: summary.command,
    catalogPath: summary.catalogPath,
    only: summary.only,
    flatRoots: summary.flatRoots,
    checklist: [
      {
        id: 'example-catalog',
        ok: summary.exampleCatalog?.ok === true,
        title: 'Example catalog',
        summary: summary.exampleCatalog?.ok
          ? `verified ${summary.exampleCatalog?.verified ?? 0} example(s)`
          : `${(summary.exampleCatalog?.errors ?? []).length} example error(s)`,
        entries: (summary.exampleCatalog?.entries ?? []).map((entry) => ({
          file: entry.file,
          name: entry.name,
          status: entry.skipped === true ? 'skipped' : entry.ok === true ? 'verified' : 'blocked',
          reason: entry.reason ?? null,
        })),
      },
      {
        id: 'flat-report-summary',
        ok: summary.flatReportSummary?.ok === true,
        title: 'Flat report summary sweep',
        summary: summary.flatReportSummary?.ok
          ? `${summary.flatReportSummary?.scannedFiles ?? 0} file(s), ${summary.flatReportSummary?.legacyHits ?? 0} legacy hit(s)`
          : `${summary.flatReportSummary?.legacyHits ?? 0} legacy hit(s)`,
        matches: (summary.flatReportSummary?.matches ?? []).map((match) => ({
          file: match.file,
          line: match.line ?? null,
          reason: match.reason,
          text: match.text ?? null,
        })),
      },
    ],
    errors: summary.errors,
  };
}

function buildMarkdownReport(summary) {
  const lines = [];
  lines.push(`# ${summary.label}`);
  lines.push('');
  lines.push(`- ok: ${summary.ok ? 'true' : 'false'}`);
  if (summary.command) {
    lines.push(`- command: \`${summary.command}\``);
  }
  lines.push(`- label: ${summary.label}`);
  lines.push(`- catalog: ${summary.catalogPath}`);
  lines.push(`- sample filter: ${summary.only ?? 'all examples'}`);
  lines.push(`- flat roots: ${summary.flatRoots?.length ? summary.flatRoots.join(', ') : 'default repository shipping docs'}`);
  lines.push('');
  lines.push('## Acceptance checklist');
  lines.push('');
  const catalogChecklist = summary.exampleCatalog?.ok ? 'x' : ' ';
  const flatChecklist = summary.flatReportSummary?.ok ? 'x' : ' ';
  const catalogSummary = summary.exampleCatalog?.ok
    ? `verified ${summary.exampleCatalog?.verified ?? 0} example(s)`
    : `${(summary.exampleCatalog?.errors ?? []).length} example error(s)`;
  const flatSummary = summary.flatReportSummary?.ok
    ? `${summary.flatReportSummary?.scannedFiles ?? 0} file(s), ${summary.flatReportSummary?.legacyHits ?? 0} legacy hit(s)`
    : `${summary.flatReportSummary?.legacyHits ?? 0} legacy hit(s)`;
  lines.push(`- [${catalogChecklist}] Example catalog ${catalogSummary}`);
  lines.push(`- [${flatChecklist}] Flat report summary sweep ${flatSummary}`);
  lines.push('');
  lines.push('## Example catalog');
  lines.push('');
  lines.push(`- ok: ${summary.exampleCatalog?.ok ? 'true' : 'false'}`);
  lines.push(`- verified: ${summary.exampleCatalog?.verified ?? 0}`);
  lines.push(`- skipped: ${summary.exampleCatalog?.skipped ?? 0}`);
  lines.push(`- manual: ${summary.exampleCatalog?.manual ?? 0}`);
  lines.push(`- errors: ${(summary.exampleCatalog?.errors ?? []).length}`);
  const verifiedEntries = (summary.exampleCatalog?.entries ?? []).filter((entry) => entry.ok === true && entry.skipped !== true);
  const skippedEntries = (summary.exampleCatalog?.entries ?? []).filter((entry) => entry.skipped === true);
  if (verifiedEntries.length > 0) {
    lines.push('- verified entries:');
    for (const entry of verifiedEntries) {
      lines.push(`  - ${entry.file} (${entry.name})`);
    }
  }
  if (skippedEntries.length > 0) {
    lines.push('- skipped entries:');
    for (const entry of skippedEntries) {
      lines.push(`  - ${entry.file} (${entry.name})`);
    }
  }
  if ((summary.exampleCatalog?.errors ?? []).length > 0) {
    lines.push('- details:');
    for (const error of summary.exampleCatalog.errors) {
      lines.push(`  - ${error}`);
    }
  }
  lines.push('');
  lines.push('## Flat report summary sweep');
  lines.push('');
  lines.push(`- ok: ${summary.flatReportSummary?.ok ? 'true' : 'false'}`);
  lines.push(`- scanned files: ${summary.flatReportSummary?.scannedFiles ?? 0}`);
  lines.push(`- legacy hits: ${summary.flatReportSummary?.legacyHits ?? 0}`);
  lines.push(`- roots: ${(summary.flatReportSummary?.roots ?? []).join(', ')}`);
  if ((summary.flatReportSummary?.matches ?? []).length > 0) {
    lines.push('- matches:');
    for (const match of summary.flatReportSummary.matches) {
      lines.push(`  - ${match.file}${match.line ? `:${match.line}` : ''}`);
      lines.push(`    - reason: ${match.reason}`);
      if (match.text) {
        lines.push(`    - text: ${match.text}`);
      }
    }
  }
  lines.push('');
  lines.push('## Errors');
  lines.push('');
  if (!summary.errors.length) {
    lines.push('- none');
  } else {
    for (const error of summary.errors) {
      lines.push(`- ${error}`);
    }
  }
  return lines.join('\n');
}

function buildCommandLine(args) {
  if (!args.length) {
    return 'npm run verify:shipping-docs';
  }
  return `npm run verify:shipping-docs -- ${args.map((arg) => shellQuote(arg)).join(' ')}`;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./=-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}
