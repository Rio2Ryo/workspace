import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';
import { slideToolRoot } from './test-paths.mjs';

const verifier = path.join(slideToolRoot, 'scripts', 'verify-flat-report-summary.mjs');

test('flat report summary verifier passes on the shipped repository docs', () => {
  const result = runNodeScript(verifier, []);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary');
  assert.equal(payload.ok, true);
  assert.equal(payload.legacyHits, 0);
  assert.equal(payload.matches.length, 0);
  assert.equal(payload.roots.includes('README.md'), true);
  assert.equal(payload.roots.includes('DESIGN.md'), true);
});

test('flat report summary verifier discovers new root markdown docs automatically', () => {
  const tempDoc = path.join(slideToolRoot, 'TEMP-flat-report-summary.md');
  try {
    fs.writeFileSync(tempDoc, '# temp\n\n```yaml\nreportSummary: {\n  summary: {}\n}\n```\n', 'utf8');
    const result = runNodeScript(verifier, []);
    assert.notEqual(result.status, 0);
    const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary temp root');
    assert.equal(payload.ok, false);
    assert.equal(payload.legacyHits > 0, true);
    assert.equal(payload.matches.some((match) => path.basename(match.file) === 'TEMP-flat-report-summary.md'), true);
  } finally {
    if (fs.existsSync(tempDoc)) {
      fs.unlinkSync(tempDoc);
    }
  }
});

test('flat report summary verifier detects legacy nested reportSummary inside shell fenced markdown', () => {
  const tempDoc = path.join(slideToolRoot, 'TEMP-flat-report-summary-shell.md');
  try {
    fs.writeFileSync(tempDoc, '# temp\n\n```bash\nreportSummary: {\n  summary: {}\n}\n```\n', 'utf8');
    const result = runNodeScript(verifier, []);
    assert.notEqual(result.status, 0);
    const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary shell fence');
    assert.equal(payload.ok, false);
    assert.equal(payload.legacyHits > 0, true);
    assert.equal(payload.matches.some((match) => path.basename(match.file) === 'TEMP-flat-report-summary-shell.md'), true);
  } finally {
    if (fs.existsSync(tempDoc)) {
      fs.unlinkSync(tempDoc);
    }
  }
});

test('flat report summary verifier detects legacy nested reportSummary inside js fenced markdown', () => {
  const tempDoc = path.join(slideToolRoot, 'TEMP-flat-report-summary-js.md');
  try {
    fs.writeFileSync(tempDoc, '# temp\n\n```js\nconst payload = { reportSummary: { summary: {} } };\n```\n', 'utf8');
    const result = runNodeScript(verifier, []);
    assert.notEqual(result.status, 0);
    const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary js fence');
    assert.equal(payload.ok, false);
    assert.equal(payload.legacyHits > 0, true);
    assert.equal(payload.matches.some((match) => path.basename(match.file) === 'TEMP-flat-report-summary-js.md'), true);
  } finally {
    if (fs.existsSync(tempDoc)) {
      fs.unlinkSync(tempDoc);
    }
  }
});

test('flat report summary verifier detects legacy nested reportSummary inside indented markdown code blocks', () => {
  const tempDoc = path.join(slideToolRoot, 'TEMP-flat-report-summary-indented.md');
  try {
    fs.writeFileSync(tempDoc, '# temp\n\n    const payload = { reportSummary: { summary: {} } };\n', 'utf8');
    const result = runNodeScript(verifier, []);
    assert.notEqual(result.status, 0);
    const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary indented block');
    assert.equal(payload.ok, false);
    assert.equal(payload.legacyHits > 0, true);
    assert.equal(payload.matches.some((match) => path.basename(match.file) === 'TEMP-flat-report-summary-indented.md'), true);
  } finally {
    if (fs.existsSync(tempDoc)) {
      fs.unlinkSync(tempDoc);
    }
  }
});

test('flat report summary verifier discovers new root yaml docs automatically', () => {
  const tempDoc = path.join(slideToolRoot, 'TEMP-flat-report-summary.yaml');
  try {
    fs.writeFileSync(tempDoc, 'reportSummary:\n  summary: {}\n', 'utf8');
    const result = runNodeScript(verifier, []);
    assert.notEqual(result.status, 0);
    const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary temp yaml root');
    assert.equal(payload.ok, false);
    assert.equal(payload.legacyHits > 0, true);
    assert.equal(payload.matches.some((match) => path.basename(match.file) === 'TEMP-flat-report-summary.yaml'), true);
  } finally {
    if (fs.existsSync(tempDoc)) {
      fs.unlinkSync(tempDoc);
    }
  }
});

test('flat report summary verifier detects legacy nested reportSummary inside yaml list items', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-yaml-list-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const legacyDoc = path.join(root, 'docs', 'legacy-report.yaml');
  fs.writeFileSync(legacyDoc, 'items:\n  - reportSummary:\n      summary: {}\n', 'utf8');

  const result = runNodeScript(verifier, ['--root', root]);
  assert.notEqual(result.status, 0);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary yaml list item');
  assert.equal(payload.ok, false);
  assert.equal(payload.legacyHits, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(path.basename(payload.matches[0].file), 'legacy-report.yaml');
  assert.equal(payload.matches[0].line, 2);
  assert.match(payload.matches[0].text, /reportSummary\s*:/);
});

test('flat report summary verifier discovers new root yml docs automatically', () => {
  const tempDoc = path.join(slideToolRoot, 'TEMP-flat-report-summary.yml');
  try {
    fs.writeFileSync(tempDoc, 'reportSummary:\n  summary: {}\n', 'utf8');
    const result = runNodeScript(verifier, []);
    assert.notEqual(result.status, 0);
    const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary temp yml root');
    assert.equal(payload.ok, false);
    assert.equal(payload.legacyHits > 0, true);
    assert.equal(payload.matches.some((match) => path.basename(match.file) === 'TEMP-flat-report-summary.yml'), true);
  } finally {
    if (fs.existsSync(tempDoc)) {
      fs.unlinkSync(tempDoc);
    }
  }
});

test('flat report summary verifier discovers new root json docs automatically', () => {
  const tempDoc = path.join(slideToolRoot, 'TEMP-flat-report-summary.json');
  try {
    fs.writeFileSync(tempDoc, '{"reportSummary": {"summary": {}}}\n', 'utf8');
    const result = runNodeScript(verifier, []);
    assert.notEqual(result.status, 0);
    const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary temp json root');
    assert.equal(payload.ok, false);
    assert.equal(payload.legacyHits > 0, true);
    assert.equal(payload.matches.some((match) => path.basename(match.file) === 'TEMP-flat-report-summary.json'), true);
  } finally {
    if (fs.existsSync(tempDoc)) {
      fs.unlinkSync(tempDoc);
    }
  }
});

test('flat report summary verifier discovers legacy nested reportSummary usage under codex memories root', () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-home-'));
  const memoryRoot = path.join(tempHome, '.codex', 'memories');
  const tempDoc = path.join(memoryRoot, 'legacy-memory.md');
  fs.mkdirSync(memoryRoot, { recursive: true });
  try {
    fs.writeFileSync(tempDoc, '# memory\n\n```yaml\nreportSummary:\n  summary: {}\n```\n', 'utf8');
    const result = runNodeScript(verifier, [], { env: { HOME: tempHome } });
    assert.notEqual(result.status, 0);
    const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary codex memories root');
    assert.equal(payload.ok, false);
    assert.equal(payload.legacyHits > 0, true);
    assert.equal(payload.matches.some((match) => path.basename(match.file) === 'legacy-memory.md'), true);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test('flat report summary verifier rejects legacy nested reportSummary usage in markdown', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const legacyDoc = path.join(root, 'docs', 'legacy-report.md');
  const cleanDoc = path.join(root, 'docs', 'flat-report.md');
  fs.writeFileSync(legacyDoc, '# legacy\n\n```yaml\nreportSummary:\n  summary: {}\n```\n', 'utf8');
  fs.writeFileSync(cleanDoc, '# flat\n\nreportSummaryBundle: true\nreportSummaryContext: true\n', 'utf8');

  const result = runNodeScript(verifier, ['--root', root]);
  assert.notEqual(result.status, 0);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary --root');
  assert.equal(payload.ok, false);
  assert.equal(payload.legacyHits, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(path.basename(payload.matches[0].file), 'legacy-report.md');
  assert.equal(payload.matches[0].line, 4);
  assert.match(payload.matches[0].text, /reportSummary\s*:/);
});

test('flat report summary verifier rejects legacy nested reportSummary usage in json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-json-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const legacyDoc = path.join(root, 'docs', 'legacy-report.json');
  fs.writeFileSync(legacyDoc, '{"reportSummary": {"summary": {}}}\n', 'utf8');

  const result = runNodeScript(verifier, ['--root', root]);
  assert.notEqual(result.status, 0);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary --root json');
  assert.equal(payload.ok, false);
  assert.equal(payload.legacyHits, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(path.basename(payload.matches[0].file), 'legacy-report.json');
  assert.equal(payload.matches[0].line, 1);
  assert.match(payload.matches[0].text, /"reportSummary"\s*:/);
});

test('flat report summary verifier ignores string values that merely mention reportSummary in json and yaml', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-string-values-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'string-value.json'), '{"note":"reportSummary: should stay a string"}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'docs', 'string-value.yaml'), 'note: "reportSummary: should stay a string"\n', 'utf8');

  const result = runNodeScript(verifier, ['--root', root]);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary string values');
  assert.equal(payload.ok, true);
  assert.equal(payload.legacyHits, 0);
  assert.equal(payload.matches.length, 0);
});

test('flat report summary verifier scans standalone yaml files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-yaml-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const legacyDoc = path.join(root, 'docs', 'legacy-report.yaml');
  fs.writeFileSync(legacyDoc, 'reportSummary:\n  summary: {}\n', 'utf8');

  const result = runNodeScript(verifier, ['--root', root]);
  assert.notEqual(result.status, 0);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary --root yaml');
  assert.equal(payload.ok, false);
  assert.equal(payload.legacyHits, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(path.basename(payload.matches[0].file), 'legacy-report.yaml');
  assert.equal(payload.matches[0].line, 1);
  assert.match(payload.matches[0].text, /reportSummary\s*:/);
});

test('flat report summary verifier can emit a markdown report for checklist reuse', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-md-'));
  const reportPath = path.join(root, 'flat-report-summary.md');
  fs.writeFileSync(path.join(root, 'notes.md'), '# notes\n\nreportSummaryBundle: true\n', 'utf8');

  const result = runNodeScript(verifier, [
    '--root',
    root,
    '--format',
    'md',
    '--report-md',
    reportPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# flat report summary sweep/);
  assert.match(result.stdout, /- ok: true/);
  assert.match(result.stdout, /- legacy hits: 0/);
  assert.equal(fs.existsSync(reportPath), true);
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /# flat report summary sweep/);
  assert.match(report, /- ok: true/);
  assert.match(report, /- legacy hits: 0/);
  assert.match(report, /- none/);
});

test('flat report summary verifier ignores prose mentions outside fenced code blocks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-prose-'));
  fs.writeFileSync(
    path.join(root, 'note.md'),
    '# notes\n\nThe legacy reportSummary block should not come back.\n\nStill flat: reportSummaryBundle and reportSummaryContext.\n',
    'utf8',
  );

  const result = runNodeScript(verifier, ['--root', root]);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary prose');
  assert.equal(payload.ok, true);
  assert.equal(payload.legacyHits, 0);
  assert.equal(payload.matches.length, 0);
});

test('flat report summary verifier detects legacy nested reportSummary inside markdown html comments', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-html-comment-'));
  fs.writeFileSync(
    path.join(root, 'comment.md'),
    '# notes\n\n<!-- legacy reportSummary: { summary: {} } -->\n',
    'utf8',
  );

  const result = runNodeScript(verifier, ['--root', root]);
  assert.notEqual(result.status, 0);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary html comment');
  assert.equal(payload.ok, false);
  assert.equal(payload.legacyHits, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(path.basename(payload.matches[0].file), 'comment.md');
  assert.equal(payload.matches[0].line, 3);
  assert.match(payload.matches[0].text, /reportSummary\s*:/);
});

test('flat report summary verifier detects legacy nested reportSummary inside markdown raw html code blocks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-html-code-'));
  fs.writeFileSync(
    path.join(root, 'raw-html.md'),
    '# notes\n\n<pre><code>\nreportSummary:\n  summary: {}\n</code></pre>\n',
    'utf8',
  );

  const result = runNodeScript(verifier, ['--root', root]);
  assert.notEqual(result.status, 0);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary html code block');
  assert.equal(payload.ok, false);
  assert.equal(payload.legacyHits, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(path.basename(payload.matches[0].file), 'raw-html.md');
  assert.equal(payload.matches[0].line, 4);
  assert.match(payload.matches[0].text, /reportSummary\s*:/);
});

test('flat report summary verifier detects legacy nested reportSummary inside split markdown raw html code blocks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-html-split-'));
  fs.writeFileSync(
    path.join(root, 'split-raw-html.md'),
    '# notes\n\n<pre>\n<code>\nreportSummary:\n  summary: {}\n</code>\n</pre>\n',
    'utf8',
  );

  const result = runNodeScript(verifier, ['--root', root]);
  assert.notEqual(result.status, 0);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary split html code block');
  assert.equal(payload.ok, false);
  assert.equal(payload.legacyHits, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(path.basename(payload.matches[0].file), 'split-raw-html.md');
  assert.equal(payload.matches[0].line, 5);
  assert.match(payload.matches[0].text, /reportSummary\s*:/);
});

test('flat report summary verifier detects legacy nested reportSummary inside markdown blockquotes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-flat-report-blockquote-'));
  fs.writeFileSync(
    path.join(root, 'quote.md'),
    '# notes\n\n> reportSummary:\n>   summary: {}\n',
    'utf8',
  );

  const result = runNodeScript(verifier, ['--root', root]);
  assert.notEqual(result.status, 0);
  const payload = parseCommandJson(result, 'stdout', 'verify-flat-report-summary blockquote');
  assert.equal(payload.ok, false);
  assert.equal(payload.legacyHits, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(path.basename(payload.matches[0].file), 'quote.md');
  assert.equal(payload.matches[0].line, 3);
  assert.match(payload.matches[0].text, /reportSummary\s*:/);
});
