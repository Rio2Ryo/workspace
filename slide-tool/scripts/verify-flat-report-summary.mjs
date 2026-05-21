import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(new URL('../', import.meta.url).pathname);
const cli = parseArgs(process.argv.slice(2));
const defaultRoots = collectDefaultRoots(repoRoot);
const defaultMemoryRoot = path.join(os.homedir(), '.codex', 'memories');
if (fs.existsSync(defaultMemoryRoot)) {
  defaultRoots.push(defaultMemoryRoot);
}
const roots = cli.roots.length > 0
  ? cli.roots.map((root) => path.resolve(repoRoot, root))
  : defaultRoots;

const summary = {
  ok: true,
  roots: cli.roots.length > 0 ? [...cli.roots] : defaultRoots.map((root) => path.relative(repoRoot, root)),
  scannedFiles: 0,
  legacyHits: 0,
  matches: [],
};

for (const root of roots) {
  if (!fs.existsSync(root)) {
    summary.matches.push({
      file: path.relative(repoRoot, root),
      reason: 'missing root',
    });
    summary.ok = false;
    continue;
  }
  scanPath(root, summary);
}

if (summary.matches.length > 0) {
  summary.ok = false;
}

const markdown = buildMarkdownReport(summary);
if (cli.reportMdPath) {
  fs.writeFileSync(cli.reportMdPath, `${markdown}\n`, 'utf8');
}
if (cli.format === 'md') {
  console.log(markdown);
} else {
  console.log(JSON.stringify(summary, null, 2));
}
process.exit(summary.ok ? 0 : 1);

function parseArgs(args) {
  const parsed = {
    roots: [],
    format: 'json',
    reportMdPath: null,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--root') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--root requires a path');
      }
      parsed.roots.push(value);
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
    throw new Error(`unknown option: ${arg}`);
  }
  return parsed;
}

function collectDefaultRoots(repoRootPath) {
  const roots = [];
  const entries = fs.readdirSync(repoRootPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /(\.md|\.json|\.ya?ml)$/u.test(entry.name))
    .map((entry) => path.join(repoRootPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
  roots.push(...entries);
  roots.push(path.join(repoRootPath, 'examples'));
  roots.push(path.join(repoRootPath, 'references'));
  return roots;
}

function scanPath(targetPath, summary) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'tmp' || entry.name === 'generated') {
        continue;
      }
      scanPath(path.join(targetPath, entry.name), summary);
    }
    return;
  }
  if (!/(\.md|\.json|\.ya?ml)$/u.test(targetPath)) {
    return;
  }
  summary.scannedFiles += 1;
  const text = fs.readFileSync(targetPath, 'utf8');
  if (targetPath.endsWith('.json') || targetPath.endsWith('.yaml') || targetPath.endsWith('.yml')) {
    scanLines(text.split(/\r?\n/), targetPath, summary, 1);
    return;
  }
  if (targetPath.endsWith('.md')) {
    scanMarkdownFences(text, targetPath, summary);
    return;
  }
}

function scanLines(lines, targetPath, summary, lineOffset = 0) {
  lines.forEach((line, index) => {
    const legacyPattern = /(?:^|[,{[]\s*|\s*-\s*)(?:["'])?reportSummary(?:["'])?\s*:/gu;
    for (const match of line.matchAll(legacyPattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (line[start - 1] === '`' || line[end] === '`') {
        continue;
      }
      summary.legacyHits += 1;
      summary.matches.push({
        file: path.relative(repoRoot, targetPath),
        line: index + lineOffset,
        text: line.trim(),
        reason: 'legacy nested reportSummary usage',
      });
      return;
    }
  });
}

function scanMarkdownFences(text, targetPath, summary) {
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let fenceLang = '';
  let fenceLines = [];
  let fenceLineNumbers = [];

  const flushFence = () => {
    if (!inFence) {
      return;
    }
    scanLines(fenceLines, targetPath, summary, fenceLineNumbers[0] ?? 1);
    inFence = false;
    fenceLang = '';
    fenceLines = [];
    fenceLineNumbers = [];
  };

  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^(\s*)(```|~~~)([^`]*)$/u);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceLang = fenceMatch[3].trim().toLowerCase();
        fenceLines = [];
        fenceLineNumbers = [];
        return;
      }
      flushFence();
      return;
    }
    if (inFence) {
      fenceLines.push(line);
      fenceLineNumbers.push(index + 1);
    }
  });
  flushFence();
  scanMarkdownIndentedBlocks(lines, targetPath, summary);
  scanMarkdownBlockquotes(lines, targetPath, summary);
  scanMarkdownHtmlComments(lines, targetPath, summary);
  scanMarkdownHtmlCodeBlocks(lines, targetPath, summary);
}

function scanMarkdownIndentedBlocks(lines, targetPath, summary) {
  let blockLines = [];
  let blockLineNumbers = [];

  const flushBlock = () => {
    if (blockLines.length === 0) {
      return;
    }
    scanLines(blockLines, targetPath, summary, blockLineNumbers[0] ?? 1);
    blockLines = [];
    blockLineNumbers = [];
  };

  lines.forEach((line, index) => {
    if (/^(?: {4}|\t)/u.test(line)) {
      blockLines.push(line.replace(/^(?: {4}|\t)/u, ''));
      blockLineNumbers.push(index + 1);
      return;
    }
    flushBlock();
  });
  flushBlock();
}

function scanMarkdownBlockquotes(lines, targetPath, summary) {
  lines.forEach((line, index) => {
    if (!/^\s*>\s*/u.test(line)) {
      return;
    }
    const stripped = line.replace(/^\s*>\s?/u, '');
    scanLines([stripped], targetPath, summary, index + 1);
  });
}

function scanMarkdownHtmlComments(lines, targetPath, summary) {
  let commentLines = [];
  let commentLineNumbers = [];
  let inComment = false;
  const legacyPattern = /(?:^|[^A-Za-z0-9_])(?:["'])?reportSummary(?:["'])?\s*:/u;

  const flushComment = () => {
    if (commentLines.length === 0) {
      return;
    }
    commentLines.forEach((line, index) => {
      if (!legacyPattern.test(line)) {
        return;
      }
      summary.legacyHits += 1;
      summary.matches.push({
        file: path.relative(repoRoot, targetPath),
        line: commentLineNumbers[index] ?? commentLineNumbers[0] ?? 1,
        text: line.trim(),
        reason: 'legacy nested reportSummary usage',
      });
    });
    commentLines = [];
    commentLineNumbers = [];
  };

  lines.forEach((line, index) => {
    const hasOpen = line.includes('<!--');
    const hasClose = line.includes('-->');

    if (!inComment && hasOpen) {
      inComment = true;
    }

    if (inComment) {
      commentLines.push(line.replace(/.*?<!--/u, '').replace(/-->.*/u, ''));
      commentLineNumbers.push(index + 1);
    }

    if (inComment && hasClose) {
      inComment = false;
      flushComment();
    }
  });

  flushComment();
}

function scanMarkdownHtmlCodeBlocks(lines, targetPath, summary) {
  let inPre = false;
  let inCode = false;
  let codeBlockLines = [];
  let codeBlockLineNumbers = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length === 0) {
      return;
    }
    scanLines(codeBlockLines, targetPath, summary, codeBlockLineNumbers[0] ?? 1);
    codeBlockLines = [];
    codeBlockLineNumbers = [];
  };

  const pushCodeText = (text, lineNumber) => {
    if (text.trim().length === 0) {
      return;
    }
    codeBlockLines.push(text);
    codeBlockLineNumbers.push(lineNumber);
  };

  lines.forEach((line, index) => {
    let cursor = 0;
    while (cursor < line.length) {
      if (!inPre) {
        const preOpenMatch = line.slice(cursor).match(/<pre\b[^>]*>/iu);
        if (!preOpenMatch) {
          break;
        }
        cursor += (preOpenMatch.index ?? 0) + preOpenMatch[0].length;
        inPre = true;
        continue;
      }

      if (!inCode) {
        const preCloseMatch = line.slice(cursor).match(/<\/pre>/iu);
        const codeOpenMatch = line.slice(cursor).match(/<code\b[^>]*>/iu);

        if (codeOpenMatch && (!preCloseMatch || (codeOpenMatch.index ?? 0) < (preCloseMatch.index ?? 0))) {
          cursor += (codeOpenMatch.index ?? 0) + codeOpenMatch[0].length;
          inCode = true;
          continue;
        }

        if (preCloseMatch) {
          cursor += (preCloseMatch.index ?? 0) + preCloseMatch[0].length;
          inPre = false;
          continue;
        }

        break;
      }

      const codeCloseMatch = line.slice(cursor).match(/<\/code>/iu);
      if (codeCloseMatch) {
        const beforeClose = line.slice(cursor, cursor + (codeCloseMatch.index ?? 0));
        pushCodeText(beforeClose, index + 1);
        flushCodeBlock();
        inCode = false;
        cursor += (codeCloseMatch.index ?? 0) + codeCloseMatch[0].length;
        continue;
      }

      pushCodeText(line.slice(cursor), index + 1);
      break;
    }
  });

  flushCodeBlock();
}

function buildMarkdownReport(summary) {
  const lines = [];
  lines.push('# flat report summary sweep');
  lines.push('');
  lines.push(`- ok: ${summary.ok ? 'true' : 'false'}`);
  lines.push(`- scanned files: ${summary.scannedFiles}`);
  lines.push(`- legacy hits: ${summary.legacyHits}`);
  lines.push(`- roots: ${summary.roots.join(', ')}`);
  lines.push('');
  lines.push('## Matches');
  lines.push('');
  if (summary.matches.length === 0) {
    lines.push('- none');
  } else {
    for (const match of summary.matches) {
      lines.push(`- ${match.file}${match.line ? `:${match.line}` : ''}`);
      lines.push(`  - reason: ${match.reason}`);
      if (match.text) {
        lines.push(`  - text: ${match.text}`);
      }
    }
  }
  return lines.join('\n');
}
