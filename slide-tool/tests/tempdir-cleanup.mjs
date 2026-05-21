import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const trackedDirs = new Set();
const originalMkdtempSync = fs.mkdtempSync.bind(fs);

export const slideToolTempdirPrefixes = Object.freeze([
  'delivery-',
  'delivery-final-artifacts-',
  'delivery-manifest-',
  'example-catalog-',
  'slide-tool-clean-generated-out-',
  'screenshot-utils-test-',
  'slide-example-',
  'slide-studio-wrapper-',
  'slide-tool-',
  'studio-',
  'suggest-manifest-policy-',
  'verify-',
]);

function isSlideToolTestTempPrefix(prefix) {
  const tmpRoot = path.resolve(os.tmpdir());
  const resolvedPrefix = path.resolve(prefix);
  if (!resolvedPrefix.startsWith(`${tmpRoot}${path.sep}`)) return false;
  const basename = path.basename(prefix);
  return slideToolTempdirPrefixes.some((allowedPrefix) => basename.startsWith(allowedPrefix));
}

function cleanupTrackedDirs() {
  if (process.env.SLIDE_TOOL_KEEP_TEST_TMP === '1') return;
  for (const dir of trackedDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  trackedDirs.clear();
}

fs.mkdtempSync = function mkdtempSyncWithSlideToolCleanup(prefix, options) {
  const dir = originalMkdtempSync(prefix, options);
  if (typeof prefix === 'string' && isSlideToolTestTempPrefix(prefix)) {
    trackedDirs.add(dir);
  }
  return dir;
};

process.once('exit', cleanupTrackedDirs);
