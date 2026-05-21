import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import './tempdir-cleanup.mjs';
import { buildShowcase, assertPublicBundle } from '../scripts/build-showcase.mjs';

function makeFixture(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'demo.preview.html'), '<!doctype html><title>Demo</title>');
  fs.writeFileSync(path.join(dir, 'demo.preview.png'), 'png');
  fs.writeFileSync(path.join(dir, 'demo.editable.pptx'), 'pptx');
  fs.writeFileSync(path.join(dir, 'demo.image-prompts.md'), '# prompts\n');
  fs.writeFileSync(path.join(dir, 'demo.outline.json'), JSON.stringify({
    title: 'Demo Deck',
    slides: [
      { title: 'Cover', claim: 'Start from intent' },
      { title: 'Ship', claim: 'Publish the bundle' },
    ],
  }));
  fs.writeFileSync(path.join(dir, 'delivery-manifest.json'), JSON.stringify({
    title: 'Demo Deck',
    readyHeader: '納品準備OK: Demo Deck',
    verificationHeader: '検証: ready / slides 2',
    qaLines: [
      'delivery readiness: ready',
      `manifest: ${dir}/demo.acceptance.manifest.json`,
      'visual QA: ready / source: chrome',
    ],
    warnings: [],
  }));
}

test('buildShowcase creates a static portal without leaking local paths', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-tool-showcase-'));
  const workOut = path.join(temp, 'work');
  const dist = path.join(temp, 'dist');
  makeFixture(workOut);

  const manifest = buildShowcase({ workOut, dist, name: 'demo', skipStudio: true });

  assert.equal(manifest.title, 'Demo Deck');
  assert.equal(manifest.slideCount, 2);
  assert.ok(fs.existsSync(path.join(dist, 'index.html')));
  assert.ok(fs.existsSync(path.join(dist, 'assets', 'demo.editable.pptx')));
  assert.ok(fs.existsSync(path.join(dist, 'showcase-manifest.json')));
  assertPublicBundle(dist);

  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /Slide Tool\s*<br \/>Delivery Portal/);
  assert.doesNotMatch(html, /\/Users\/|\.openclaw|workspace\/slide-tool\/out/);
});
