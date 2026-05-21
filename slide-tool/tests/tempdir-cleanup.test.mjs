import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { slideToolRoot } from './test-paths.mjs';
import { slideToolTempdirPrefixes } from './tempdir-cleanup.mjs';

const preload = path.join(slideToolRoot, 'tests', 'tempdir-cleanup.mjs');
const testsDir = path.join(slideToolRoot, 'tests');

test('tempdir cleanup contract covers known slide-tool test prefixes', () => {
  for (const prefix of [
    'studio-',
    'verify-',
    'verify-discord-report-',
    'verify-artifacts-',
    'suggest-manifest-policy-',
    'slide-studio-wrapper-',
    'slide-example-',
    'delivery-manifest-',
    'screenshot-utils-test-',
  ]) {
    assert.ok(
      slideToolTempdirPrefixes.some((allowedPrefix) => prefix.startsWith(allowedPrefix)),
      `${prefix} should be covered by tempdir cleanup`,
    );
  }
});

test('tempdir cleanup is wired into every test file that creates temp directories', () => {
  const missingCleanup = fs.readdirSync(testsDir)
    .filter((file) => file.endsWith('.test.mjs'))
    .filter((file) => {
      const source = fs.readFileSync(path.join(testsDir, file), 'utf8');
      const createsTempdir = /mkdtempSync\s*\(|os\.tmpdir\s*\(/.test(source);
      const hasCleanupImport = /['"]\.\/(?:test-paths|tempdir-cleanup)\.mjs['"]/.test(source);
      return createsTempdir && !hasCleanupImport;
    });

  assert.deepEqual(missingCleanup, []);
});

test('tempdir cleanup removes tracked slide-tool tempdirs after the test process exits', () => {
  const result = spawnSync(process.execPath, [
    '--import',
    preload,
    '--input-type=module',
    '--eval',
    `
      import fs from 'node:fs';
      import os from 'node:os';
      import path from 'node:path';
      const tracked = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-cleanup-contract-'));
      const untracked = fs.mkdtempSync(path.join(os.tmpdir(), 'untracked-cleanup-contract-'));
      fs.writeFileSync(path.join(tracked, 'artifact.txt'), 'tracked');
      fs.writeFileSync(path.join(untracked, 'artifact.txt'), 'untracked');
      console.log(JSON.stringify({ tracked, untracked }));
    `,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { tracked, untracked } = JSON.parse(result.stdout.trim());

  assert.equal(fs.existsSync(tracked), false);
  assert.equal(fs.existsSync(untracked), true);
  fs.rmSync(untracked, { recursive: true, force: true });
});

test('tempdir cleanup can be disabled for artifact debugging', () => {
  const result = spawnSync(process.execPath, [
    '--import',
    preload,
    '--input-type=module',
    '--eval',
    `
      import fs from 'node:fs';
      import os from 'node:os';
      import path from 'node:path';
      const tracked = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cleanup-keep-contract-'));
      fs.writeFileSync(path.join(tracked, 'artifact.txt'), 'tracked');
      console.log(JSON.stringify({ tracked }));
    `,
  ], {
    encoding: 'utf8',
    env: { ...process.env, SLIDE_TOOL_KEEP_TEST_TMP: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const { tracked } = JSON.parse(result.stdout.trim());

  assert.equal(fs.existsSync(tracked), true);
  fs.rmSync(tracked, { recursive: true, force: true });
});
