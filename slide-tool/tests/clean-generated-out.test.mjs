import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slideToolScript } from './test-paths.mjs';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';

const script = slideToolScript('clean-generated-out.mjs');

test('clean-generated-out dry-run reports old scratch outputs without deleting them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-tool-clean-generated-out-'));
  const outDir = path.join(root, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const oldA = makeDir(outDir, 'suggest-policy-old-a', 1000);
  const oldB = makeDir(outDir, 'suggest-policy-old-b', 2000);
  const kept = makeDir(outDir, 'suggest-policy-new', 3000);
  const registered = makeDir(outDir, 'ai-slide-workflow', 500);

  const result = runNodeScript(script, ['--out-dir', outDir, '--keep', '1']);
  assert.equal(result.status, 0, result.stderr);
  const output = parseCommandJson(result, 'stdout', 'clean-generated-out');
  assert.equal(output.ok, true);
  assert.equal(output.dryRun, true);
  assert.equal(output.keptCount, 1);
  assert.equal(output.candidateCount, 2);
  assert.equal(output.deletedCount, 0);
  assert.deepEqual(output.kept.map((entry) => entry.name), ['suggest-policy-new']);
  assert.deepEqual(output.candidates.map((entry) => entry.name), ['suggest-policy-old-b', 'suggest-policy-old-a']);
  assert.deepEqual(output.deleted, []);
  assert.equal(fs.existsSync(oldA), true);
  assert.equal(fs.existsSync(oldB), true);
  assert.equal(fs.existsSync(kept), true);
  assert.equal(fs.existsSync(registered), true);
});

test('clean-generated-out deletes only matching scratch outputs when explicitly requested', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-tool-clean-generated-out-'));
  const outDir = path.join(root, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const old = makeDir(outDir, 'suggest-policy-old', 1000);
  const kept = makeDir(outDir, 'suggest-policy-new', 2000);
  const registered = makeDir(outDir, 'kataomoi-org-showcase', 500);

  const result = runNodeScript(script, ['--out-dir', outDir, '--keep', '1', '--delete']);
  assert.equal(result.status, 0, result.stderr);
  const output = parseCommandJson(result, 'stdout', 'clean-generated-out');
  assert.equal(output.ok, true);
  assert.equal(output.dryRun, false);
  assert.equal(output.keptCount, 1);
  assert.equal(output.candidateCount, 1);
  assert.equal(output.deletedCount, 1);
  assert.deepEqual(output.deleted.map((entry) => entry.name), ['suggest-policy-old']);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(kept), true);
  assert.equal(fs.existsSync(registered), true);
});

test('clean-generated-out rejects broad or nested cleanup patterns', () => {
  const result = runNodeScript(script, ['--pattern', '*', '--keep', '0']);
  assert.notEqual(result.status, 0);
  const output = parseCommandJson(result, 'stderr', 'clean-generated-out');
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /unsafe cleanup pattern/);
});

test('clean-generated-out caps listed entries while preserving total counts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-tool-clean-generated-out-'));
  const outDir = path.join(root, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  makeDir(outDir, 'suggest-policy-new', 4000);
  makeDir(outDir, 'suggest-policy-old-a', 3000);
  makeDir(outDir, 'suggest-policy-old-b', 2000);
  makeDir(outDir, 'suggest-policy-old-c', 1000);

  const result = runNodeScript(script, ['--out-dir', outDir, '--keep', '1', '--max-entries', '2']);
  assert.equal(result.status, 0, result.stderr);
  const output = parseCommandJson(result, 'stdout', 'clean-generated-out');
  assert.equal(output.keptCount, 1);
  assert.equal(output.candidateCount, 3);
  assert.equal(output.candidates.length, 2);
  assert.deepEqual(output.candidates.map((entry) => entry.name), ['suggest-policy-old-a', 'suggest-policy-old-b']);
});

function makeDir(outDir, name, mtimeMs) {
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'artifact.txt'), name);
  const time = new Date(mtimeMs);
  fs.utimesSync(path.join(dir, 'artifact.txt'), time, time);
  fs.utimesSync(dir, time, time);
  return dir;
}
