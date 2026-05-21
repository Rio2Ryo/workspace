import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function runNodeScript(script, args = [], options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-tool-cli-json-'));
  const stdoutPath = path.join(tempDir, 'stdout.txt');
  const stderrPath = path.join(tempDir, 'stderr.txt');
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');
  try {
    const result = spawnSync(process.execPath, [script, ...args], {
      ...options,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', stdoutFd, stderrFd],
    });
    return {
      ...result,
      stdout: fs.readFileSync(stdoutPath, 'utf8'),
      stderr: fs.readFileSync(stderrPath, 'utf8'),
    };
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
}

export function parseCommandJson(result, streamName = 'stdout', label = 'command') {
  const text = result[streamName] || '';
  try {
    return JSON.parse(text);
  } catch (error) {
    assert.fail([
      `${label} ${streamName} was not parseable JSON: ${error.message}`,
      `status: ${result.status}`,
      `stdout bytes: ${Buffer.byteLength(result.stdout || '', 'utf8')}`,
      `stderr bytes: ${Buffer.byteLength(result.stderr || '', 'utf8')}`,
      `stdout tail: ${(result.stdout || '').slice(-1000)}`,
      `stderr tail: ${(result.stderr || '').slice(-1000)}`,
    ].join('\n'));
  }
}
