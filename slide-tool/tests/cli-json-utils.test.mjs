import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommandJson } from './cli-json-utils.mjs';

test('CLI JSON utilities parse selected command output streams', () => {
  const result = {
    status: 0,
    stdout: '{"ok":true,"source":"stdout"}',
    stderr: '{"ok":false,"source":"stderr"}',
  };

  assert.deepEqual(parseCommandJson(result, 'stdout'), { ok: true, source: 'stdout' });
  assert.deepEqual(parseCommandJson(result, 'stderr'), { ok: false, source: 'stderr' });
});

test('CLI JSON utilities report command diagnostics when JSON parsing fails', () => {
  const result = {
    status: 1,
    stdout: '{"ok":',
    stderr: 'structured error was truncated',
  };

  assert.throws(
    () => parseCommandJson(result, 'stdout', 'sample-command'),
    (error) => {
      assert.match(error.message, /sample-command stdout was not parseable JSON/);
      assert.match(error.message, /status: 1/);
      assert.match(error.message, /stdout bytes: 6/);
      assert.match(error.message, /stderr bytes: 30/);
      assert.match(error.message, /stdout tail: \{"ok":/);
      assert.match(error.message, /stderr tail: structured error was truncated/);
      return true;
    },
  );
});
