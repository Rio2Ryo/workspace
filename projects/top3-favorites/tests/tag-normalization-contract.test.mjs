import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { normalizeTagKey, normalizeTagText } from '../src/shared/tag-normalization.mjs'

const sourceContracts = [
  ['src/App.tsx', /from '\.\/shared\/tag-normalization\.mjs'/],
  ['api/items.ts', /from '\.\.\/src\/shared\/tag-normalization\.mjs'/],
  ['scripts/preview-local.mjs', /from '\.\.\/src\/shared\/tag-normalization\.mjs'/],
]

test('[App][import-normalization] tag normalization text/key handles full-width spaces and characters consistently', () => {
  assert.equal(normalizeTagText('  Ｃａｆｅ　　ラテ  '), 'Cafe ラテ')
  assert.equal(normalizeTagKey('  Ｃａｆｅ　　ラテ  '), 'cafe ラテ')
})

test('[App][config-quality] UI API and local preview import tag normalization from the shared contract', async () => {
  for (const [path, importPattern] of sourceContracts) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(source, importPattern, `${path} should import the shared tag normalization helpers`)
    assert.doesNotMatch(
      source,
      /function normalizeTagText\s*\(/,
      `${path} should not carry a local normalizeTagText implementation`,
    )
  }
})
