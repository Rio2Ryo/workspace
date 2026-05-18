import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const appPath = new URL('src/App.tsx', `${root}/`)
const docs = [
  'docs/QA.md',
  'docs/QA_RESULT.md',
  'docs/MANUAL_TEST_CHECKLIST.md',
]

const forbiddenDocPatterns = [
  {
    pattern: /localStorage|top3-favorites-items/i,
    message: 'QA docs must not describe the removed localStorage persistence path',
  },
  {
    pattern: /自然文|parseNaturalInput|parseQuickInput|parseSlashInput/,
    message: 'QA docs must not describe unsupported natural-language or legacy slash parsing',
  },
]

test('current implementation uses API-backed structured form, not legacy localStorage or natural parsing', async () => {
  const appSource = await readFile(appPath, 'utf8')

  assert.match(appSource, /api<[^>]+>\('\/api\/items'/, 'App should load items from /api/items')
  assert.match(appSource, /JSON\.stringify\(draft\)/, 'App should save the structured draft form')
  assert.doesNotMatch(appSource, /localStorage\.(getItem|setItem)/, 'App should not persist through localStorage')
  assert.doesNotMatch(appSource, /parseNaturalInput|parseQuickInput|parseSlashInput/, 'App should not advertise legacy free-form parsers')
})

test('QA manuals and QA result docs match the current implementation contract', async () => {
  for (const relativePath of docs) {
    const markdown = await readFile(new URL(relativePath, `${root}/`), 'utf8')

    assert.match(markdown, /\/api\/items/, `${relativePath} should name the current API persistence path`)
    assert.match(markdown, /構造化フォーム|個別フォーム|タグ.+順位.+店舗名.+メモ/s, `${relativePath} should describe the structured form UI`)

    for (const { pattern, message } of forbiddenDocPatterns) {
      assert.doesNotMatch(markdown, pattern, `${relativePath}: ${message}`)
    }
  }
})
