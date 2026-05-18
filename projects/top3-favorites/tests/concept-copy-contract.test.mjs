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

const extractTopLevelSection = (markdown, heading) => {
  const startMarker = `## ${heading}`
  const start = markdown.indexOf(startMarker)
  assert.notEqual(start, -1, `missing section: ${startMarker}`)
  const afterStart = start + startMarker.length
  const next = markdown.indexOf('\n## ', afterStart)
  return markdown.slice(afterStart, next === -1 ? markdown.length : next).trim()
}

const assertCurrentFormCopy = (section, label) => {
  assert.doesNotMatch(section, /localStorage/i, `${label}: current app persists through /api/items, not localStorage`)
  assert.doesNotMatch(section, /自然文|1つの入力欄|1入力欄|1行で(?:書けば|入力するだけ|残せば)/, `${label}: current app does not parse free-form one-line input`)
  assert.match(section, /\/api\/items/, `${label}: copy should name the current API-backed persistence path`)
  assert.match(section, /タグ.+順位.+店舗名.+メモ/s, `${label}: copy should describe the current structured form fields`)
}

test('README introduction copy matches the current API-backed form UI', async () => {
  const markdown = await readFile(conceptCopyPath, 'utf8')
  const readmeIntro = extractSection(markdown, 'README導入案')

  assertCurrentFormCopy(readmeIntro, 'README introduction')
})

test('user-facing concept copy does not advertise unsupported one-line input', async () => {
  const markdown = await readFile(conceptCopyPath, 'utf8')
  const sections = [
    ['毎日使いたくなる入力体験', extractSection(markdown, '基本方針')],
    ['オンボーディング文言', extractSection(markdown, '初回表示案')],
    ['入力欄の補助文言', extractSection(markdown, '入力欄の補助文言')],
    ['README / LP向け短文', extractSection(markdown, '短文版')],
    ['LPヒーロー案', extractSection(markdown, 'LPヒーロー案')],
    ['そのまま使える最短コピー', extractTopLevelSection(markdown, 'そのまま使える最短コピー')],
  ]

  for (const [label, section] of sections) {
    assertCurrentFormCopy(section, label)
  }
})
