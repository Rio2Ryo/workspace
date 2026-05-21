import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(new URL('../', import.meta.url).pathname);
const examplesDir = path.join(repoRoot, 'examples');
const catalogPath = path.join(examplesDir, 'verification-catalog.json');
const studioScript = path.join(repoRoot, 'scripts', 'studio.mjs');
const verifyScript = path.join(repoRoot, 'scripts', 'verify.mjs');
const discordReportVerifierScript = path.join(repoRoot, 'scripts', 'verify-discord-report.mjs');

const cli = parseArgs(process.argv.slice(2));
const catalog = readCatalog(cli.catalogPath);

const summary = {
  ok: true,
  examplesDir,
  catalogPath: cli.catalogPath,
  label: cli.label,
  verified: 0,
  manual: 0,
  skipped: 0,
  errors: [],
  entries: [],
};

for (const entry of catalog) {
  if (cli.only.size > 0 && !cli.only.has(entry.name) && !cli.only.has(entry.file)) {
    summary.skipped += 1;
    summary.entries.push({
      file: entry.file,
      name: entry.name,
      status: 'skipped',
      skipped: true,
      expectedSlides: entry.expectedSlides ?? null,
      reason: 'filtered by --only',
    });
    continue;
  }

  if (entry.status === 'manual') {
    summary.manual += 1;
    summary.entries.push({
      file: entry.file,
      name: entry.name,
      status: entry.status,
      skipped: true,
      expectedSlides: entry.expectedSlides ?? null,
      reason: entry.reason,
    });
    continue;
  }

  if (cli.verifiedOnly === false) {
    // fall through; current catalog only ships verified examples, but keep the
    // switch so the command can be tightened later without changing the shape.
  }

  summary.verified += 1;
  const entrySummary = verifyEntry(entry, examplesDir);
  summary.entries.push(entrySummary);
  if (!entrySummary.ok) {
    summary.ok = false;
    summary.errors.push(...entrySummary.errors);
  }
}

if (summary.errors.length > 0) {
  summary.ok = false;
}

const markdownReport = buildMarkdownReport(summary);
if (cli.reportMdPath) {
  fs.writeFileSync(cli.reportMdPath, `${markdownReport}\n`, 'utf8');
}
if (cli.format === 'md') {
  console.log(markdownReport);
} else {
  console.log(JSON.stringify(summary, null, 2));
}
process.exit(summary.ok ? 0 : 1);

function parseArgs(args) {
const parsed = {
  catalogPath,
  label: 'example verification catalog',
  format: 'json',
  verifiedOnly: true,
  only: new Set(),
  reportMdPath: null,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--catalog') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--catalog requires a path');
      }
      parsed.catalogPath = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === '--all') {
      parsed.verifiedOnly = false;
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
    if (arg === '--format') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--format requires a value');
      }
      if (!['json', 'md'].includes(value)) {
        throw new Error(`unsupported format: ${value}`);
      }
      parsed.format = value;
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
    if (arg === '--only') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--only requires a comma-separated list of names or file names');
      }
      for (const item of value.split(',').map((part) => part.trim()).filter(Boolean)) {
        parsed.only.add(item);
      }
      i += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return parsed;
}

function readCatalog(catalogFile) {
  return JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
}

function verifyEntry(entry, examplesRoot) {
  const input = path.join(examplesRoot, entry.file);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `slide-example-${entry.name}-`));
  const env = { ...process.env, SLIDE_TOOL_DISABLE_CHROME_SCREENSHOT: '1' };
  const studio = runNodeScript(studioScript, [input, '--out', out, '--name', entry.name, '--verify'], env);
  const entrySummary = {
    file: entry.file,
    name: entry.name,
    status: entry.status,
    expectedSlides: entry.expectedSlides,
    ok: studio.status === 0,
    errors: [],
    commands: {
      studio: `node slide-tool/scripts/studio.mjs slide-tool/examples/${entry.file} --out <out-dir> --name ${entry.name} --verify`,
      verify: `node slide-tool/scripts/verify.mjs <out-dir> ${entry.name}`,
      report: `node slide-tool/scripts/verify-discord-report.mjs <out-dir>/discord-report.md --delivery-message <out-dir>/delivery-message.md --delivery-manifest <out-dir>/${entry.name}.acceptance.manifest.json`,
    },
  };

  if (studio.status !== 0) {
    entrySummary.errors.push(studio.stderr || `studio failed for ${entry.file}`);
    return entrySummary;
  }

  const generated = parseCommandJson(studio.stdout, `studio ${entry.file}`);
  if (generated.slides !== entry.expectedSlides) {
    entrySummary.errors.push(`${entry.file} slides ${generated.slides} != expected ${entry.expectedSlides}`);
  }
  if (generated.verification?.ok !== true) {
    entrySummary.errors.push(`${entry.file} verification was not ok`);
  }
  if (generated.acceptance?.ok !== true) {
    entrySummary.errors.push(`${entry.file} acceptance was not ok`);
  }
  if (generated.acceptance?.manifestVerification?.ok !== true) {
    entrySummary.errors.push(`${entry.file} manifest verification was not ok`);
  }
  if (generated.acceptance?.manifestVerification?.result?.checked !== 1) {
    entrySummary.errors.push(`${entry.file} manifest verification checked != 1`);
  }
  if (generated.deliveryReadiness?.ok !== true) {
    entrySummary.errors.push(`${entry.file} delivery readiness was not ok`);
  }

  const verify = runNodeScript(verifyScript, [out, entry.name], env);
  if (verify.status !== 0) {
    entrySummary.errors.push(verify.stderr || `verify failed for ${entry.file}`);
  } else {
    const verifyPayload = parseCommandJson(verify.stdout, `verify ${entry.file}`);
    if (verifyPayload.ok !== true) {
      entrySummary.errors.push(`${entry.file} verify payload was not ok`);
    }
  }

  const report = runNodeScript(discordReportVerifierScript, [
    generated.discordReport,
    '--delivery-message',
    path.join(out, 'delivery-message.md'),
    '--delivery-manifest',
    path.join(out, 'delivery-manifest.json'),
  ], env);
  if (report.status !== 0) {
    entrySummary.errors.push(report.stderr || `verify-discord-report failed for ${entry.file}`);
  } else {
    const reportPayload = parseCommandJson(report.stdout, `verify-discord-report ${entry.file}`);
    if (reportPayload.ok !== true) {
      entrySummary.errors.push(`${entry.file} discord report payload was not ok`);
    }
  }

  entrySummary.ok = entrySummary.errors.length === 0;
  return entrySummary;
}

function runNodeScript(scriptPath, args, env) {
  const result = spawnSync(process.execPath, ['--import', './tests/tempdir-cleanup.mjs', scriptPath, ...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

function parseCommandJson(text, label) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error(`${label} did not emit JSON`);
  }
  const lines = trimmed.split(/\r?\n/);
  const jsonStart = lines.findIndex((line) => line.trim().startsWith('{') || line.trim().startsWith('['));
  if (jsonStart === -1) {
    throw new Error(`${label} did not emit JSON`);
  }
  return JSON.parse(lines.slice(jsonStart).join('\n'));
}

function buildMarkdownReport(summary) {
  const lines = [];
  lines.push(`# ${summary.label}`);
  lines.push('');
  lines.push(`- ok: ${summary.ok ? 'true' : 'false'}`);
  lines.push(`- verified: ${summary.verified}`);
  lines.push(`- manual: ${summary.manual}`);
  lines.push(`- skipped: ${summary.skipped}`);
  lines.push(`- catalog: ${summary.catalogPath}`);
  lines.push(`- examples: ${summary.examplesDir}`);
  lines.push('');
  lines.push('## Entries');
  lines.push('');
  for (const entry of summary.entries) {
    const state = entry.skipped ? 'skipped' : (entry.ok ? 'ok' : 'failed');
    lines.push(`- ${entry.name} (${entry.file}): ${state}${entry.expectedSlides ? ` · expected slides: ${entry.expectedSlides}` : ''}`);
    if (entry.reason) {
      lines.push(`  - reason: ${entry.reason}`);
    }
    if (entry.commands) {
      lines.push(`  - studio: ${entry.commands.studio}`);
      lines.push(`  - verify: ${entry.commands.verify}`);
      lines.push(`  - report: ${entry.commands.report}`);
    }
    if (Array.isArray(entry.errors) && entry.errors.length > 0) {
      for (const error of entry.errors) {
        lines.push(`  - error: ${error}`);
      }
    }
  }
  if (summary.errors.length > 0) {
    lines.push('');
    lines.push('## Errors');
    lines.push('');
    for (const error of summary.errors) {
      lines.push(`- ${error}`);
    }
  }
  return lines.join('\n');
}
