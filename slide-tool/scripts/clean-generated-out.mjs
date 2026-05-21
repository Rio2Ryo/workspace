import fs from 'node:fs';
import path from 'node:path';

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    source: 'clean-generated-out',
    errors: [error.message],
  }, null, 2));
  process.exit(2);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = cleanGeneratedOut(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

export function cleanGeneratedOut({
  outDir = path.resolve('out'),
  patterns = ['suggest-policy-*'],
  keep = 20,
  maxEntries = 50,
  deleteFiles = false,
} = {}) {
  if (!Number.isInteger(keep) || keep < 0) throw new Error('--keep must be a non-negative integer');
  if (!Number.isInteger(maxEntries) || maxEntries < 0) throw new Error('--max-entries must be a non-negative integer');
  const resolvedOutDir = path.resolve(outDir);
  const normalizedPatterns = patterns.map(validatePattern);
  if (!fs.existsSync(resolvedOutDir)) {
    return { ok: true, outDir: resolvedOutDir, deleted: [], candidates: [], kept: [], dryRun: !deleteFiles };
  }
  const entries = fs.readdirSync(resolvedOutDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(resolvedOutDir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        mtimeMs: stat.mtimeMs,
        bytes: directorySize(fullPath),
      };
    })
    .filter((entry) => normalizedPatterns.some((pattern) => pattern.regex.test(entry.name)))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name));

  const kept = entries.slice(0, keep);
  const candidates = entries.slice(keep);
  const deleted = [];
  if (deleteFiles) {
    for (const entry of candidates) {
      fs.rmSync(entry.path, { recursive: true, force: true });
      deleted.push(entry);
    }
  }

  return {
    ok: true,
    outDir: resolvedOutDir,
    patterns: normalizedPatterns.map((pattern) => pattern.value),
    keep,
    dryRun: !deleteFiles,
    keptCount: kept.length,
    candidateCount: candidates.length,
    deletedCount: deleted.length,
    kept: kept.slice(0, maxEntries).map(summarizeEntry),
    candidates: candidates.slice(0, maxEntries).map(summarizeEntry),
    deleted: deleted.slice(0, maxEntries).map(summarizeEntry),
    reclaimableBytes: candidates.reduce((total, entry) => total + entry.bytes, 0),
    maxEntries,
  };
}

function parseArgs(args) {
  const options = {
    outDir: path.resolve('out'),
    patterns: [],
    keep: 20,
    maxEntries: 50,
    deleteFiles: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--out-dir') {
      if (!hasOptionValue(args, index)) throw new Error('--out-dir requires a directory');
      options.outDir = args[index + 1];
      index += 1;
      continue;
    }
    if (value === '--pattern') {
      if (!hasOptionValue(args, index)) throw new Error('--pattern requires a value');
      options.patterns.push(args[index + 1]);
      index += 1;
      continue;
    }
    if (value === '--keep') {
      if (!hasOptionValue(args, index)) throw new Error('--keep requires a number');
      options.keep = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (value === '--max-entries') {
      if (!hasOptionValue(args, index)) throw new Error('--max-entries requires a number');
      options.maxEntries = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (value === '--delete') {
      options.deleteFiles = true;
      continue;
    }
    if (value === '--dry-run') {
      options.deleteFiles = false;
      continue;
    }
    throw new Error(`unknown option: ${value}`);
  }
  if (options.patterns.length === 0) options.patterns = ['suggest-policy-*'];
  return options;
}

function hasOptionValue(args, index) {
  return typeof args[index + 1] === 'string' && args[index + 1] !== '' && !args[index + 1].startsWith('--');
}

function validatePattern(value) {
  if (!/^[A-Za-z0-9._-]+\*$/.test(value)) {
    throw new Error(`unsafe cleanup pattern: ${value}`);
  }
  return {
    value,
    regex: new RegExp(`^${escapeRegex(value).replace(/\\\*/g, '.*')}$`),
  };
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}

function summarizeEntry(entry) {
  return {
    name: entry.name,
    path: entry.path,
    bytes: entry.bytes,
    mtimeMs: entry.mtimeMs,
  };
}

function directorySize(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}
