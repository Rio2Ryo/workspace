import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import './tempdir-cleanup.mjs';

import {
  screenshotInspectOptional,
  screenshotPixelDiversity,
} from '../scripts/lib/screenshot-utils.mjs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

test('screenshot utilities report missing and corrupt optional PNGs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-utils-test-'));
  const missing = path.join(dir, 'missing.png');
  assert.deepEqual(screenshotInspectOptional(missing), { present: false, errors: [] });

  const corrupt = path.join(dir, 'corrupt.png');
  fs.writeFileSync(corrupt, 'not a png');
  const info = screenshotInspectOptional(corrupt);
  assert.equal(info.present, true);
  assert.equal(info.bytes, 9);
  assert.match(info.errors.join('\n'), /PNG too small or truncated/);
});

test('screenshot utilities detect blank and colorful PNG pixel diversity', () => {
  const blank = solidPng(800, 450, [255, 255, 255, 255]);
  assert.equal(screenshotPixelDiversity(blank, 800, 450), 1);

  const colorful = stripedPng(800, 450, [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
  ]);
  assert.equal(screenshotPixelDiversity(colorful, 800, 450), 4);
});

test('screenshot utilities return structured screenshot QA diagnostics', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-utils-test-'));
  const blank = path.join(dir, 'blank.png');
  fs.writeFileSync(blank, solidPng(800, 450, [255, 255, 255, 255]));

  const info = screenshotInspectOptional(blank);
  assert.equal(info.present, true);
  assert.equal(info.width, 800);
  assert.equal(info.height, 450);
  assert.equal(info.uniqueSampledColors, 1);
  assert.match(info.errors.join('\n'), /pixel diversity too low/);
});

function solidPng(width, height, color) {
  return stripedPng(width, height, [color]);
}

function stripedPng(width, height, colors) {
  const scanlines = [];
  const stripeWidth = Math.max(1, Math.floor(width / colors.length));
  for (let y = 0; y < height; y += 1) {
    const scanline = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const color = colors[Math.min(colors.length - 1, Math.floor(x / stripeWidth))];
      scanline[1 + x * 4] = color[0];
      scanline[1 + x * 4 + 1] = color[1];
      scanline[1 + x * 4 + 2] = color[2];
      scanline[1 + x * 4 + 3] = color[3];
    }
    scanlines.push(scanline);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.concat([
      uint32be(width),
      uint32be(height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(scanlines))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([
    uint32be(data.length),
    typeBuffer,
    data,
    uint32be(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
}

function uint32be(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
