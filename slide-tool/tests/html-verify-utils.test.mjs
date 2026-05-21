import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  htmlSlideClippingRiskErrors,
  htmlSlideCount,
  htmlSlideVisibilityErrors,
  htmlVisibleText,
} from '../scripts/lib/html-verify-utils.mjs';

test('HTML verification utilities extract visible text and count slides', () => {
  const html = '<!doctype html><html><head><style>.x{display:none}</style><script>hidden()</script></head><body><!-- hidden --><section class="slide"><h1>A&amp;B</h1><p>Visible&nbsp;text</p></section></body></html>';
  assert.equal(htmlVisibleText(html), 'A&B Visible text');
  assert.equal(htmlSlideCount(html), 1);
});

test('HTML verification utilities detect hidden slides and core text', () => {
  assert.deepEqual(htmlSlideVisibilityErrors(`
    <style>
      .slide { display: none; }
      h1, .claim { color: transparent; }
    </style>
    <section class="slide" style="opacity:0"><h1 style="font-size:0">Hidden</h1></section>
  `), [
    'HTML slide visibility check failed: .slide CSS rule hides rendered slides',
    'HTML slide visibility check failed: CSS rule hides core slide text elements',
    'HTML slide visibility check failed: inline style hides a rendered slide',
    'HTML slide visibility check failed: inline style hides core slide text elements',
  ]);
});

test('HTML verification utilities detect clipping risk from slide overflow', () => {
  const longToken = 'https://example.com/' + 'a'.repeat(80);
  assert.deepEqual(htmlSlideClippingRiskErrors(`
    <style>.slide { overflow: hidden; }</style>
    <section class="slide"><p>${longToken}</p></section>
  `), [
    'HTML clipping risk: .slide uses overflow:hidden and <p> contains long text likely to be clipped',
  ]);
});
