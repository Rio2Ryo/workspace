import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const conceptCopyPath = new URL('../docs/CONCEPT_COPY.md', import.meta.url)

const extractSection = (markdown, heading) => {
  const startMarker = `### ${heading}`
  const start = markdown.indexOf(startMarker)
  assert.notEqual(start, -1, `missing section: ${startMarker}`)
  const afterStart = start + startMarker.length
  const next = markdown.indexOf('\n### ', afterStart)
  return markdown.slice(afterStart, next === -1 ? markdown.length : next).trim()
}

test('README introduction copy matches the current API-backed form UI', async () => {
  const markdown = await readFile(conceptCopyPath, 'utf8')
  const readmeIntro = extractSection(markdown, 'README導入案')

  assert.doesNotMatch(readmeIntro, /localStorage/i, 'current app persists through /api/items, not localStorage')
  assert.doesNotMatch(readmeIntro, /自然文/, 'current app does not parse free-form natural-language input')
  assert.match(readmeIntro, /\/api\/items/, 'copy should name the current API-backed persistence path')
  assert.match(readmeIntro, /タグ.+順位.+店舗名.+メモ/, 'copy should describe the current structured form fields')
})
