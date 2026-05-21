import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCommandJson, runNodeScript } from './cli-json-utils.mjs';
import { slideToolScript } from './test-paths.mjs';

const script = slideToolScript('verify-onepager.mjs');
const required = ['課題', '解決', '入力例', '主要機能', '次アクション'];

function makeFixture(name, html, svg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-onepager-test-'));
  fs.writeFileSync(path.join(dir, `${name}.html`), html);
  fs.writeFileSync(path.join(dir, `${name}.svg`), svg);
  return dir;
}

function runVerifier(dir, name) {
  return runNodeScript(script, [dir, name]);
}

function parseVerifierOutput(result) {
  return parseCommandJson(result, 'stdout', 'verify-onepager');
}

function parseVerifierError(result) {
  return parseCommandJson(result, 'stderr', 'verify-onepager');
}

test('verify-onepager passes when required terms are visible text', () => {
  const body = required.map((term) => `<section><h2>${term}</h2></section>`).join('');
  const svgText = required.map((term, index) => `<text x="0" y="${20 + index * 20}">${term}</text>`).join('');
  const dir = makeFixture(
    'good',
    `<!doctype html><html><body>${body}</body></html>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="120">${svgText}</svg>`,
  );

  const result = runVerifier(dir, 'good');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parseVerifierOutput(result).ok, true);
});

test('verify-onepager fails when required terms only appear in comments', () => {
  const hiddenTerms = required.join(' ');
  const dir = makeFixture(
    'bad',
    `<!doctype html><html><body><!-- ${hiddenTerms} --><main>No required visible text</main></body></html>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><!-- ${hiddenTerms} --><rect width="100" height="100"/></svg>`,
  );

  const result = runVerifier(dir, 'bad');
  assert.notEqual(result.status, 0);
  const output = parseVerifierError(result);
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /visible text missing term/);
});

test('verify-onepager reports malformed SVG errors as structured JSON', () => {
  const body = required.join(' ');
  const dir = makeFixture(
    'bad-svg',
    `<!doctype html><html><body>${body}</body></html>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><text>${body}</text>`,
  );

  const result = runVerifier(dir, 'bad-svg');
  assert.notEqual(result.status, 0);
  const output = parseVerifierError(result);
  assert.equal(output.ok, false);
  assert.match(output.errors.join('\n'), /SVG root\/open-close check failed/);
  assert.match(output.errors.join('\n'), /xmllint failed/);
});
