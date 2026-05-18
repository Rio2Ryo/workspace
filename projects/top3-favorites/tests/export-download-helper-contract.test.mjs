import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const exportSpecs = [
  'tests/export-download-roundtrip.e2e.spec.ts',
  'tests/import-export.e2e.spec.ts',
]

function relativePath(url) {
  return url.pathname.replace(root.pathname, '')
}

test('[E2E-Helper][export-artifact] export download specs parse artifacts through shared helper', async () => {
  const offenders = []

  for (const spec of exportSpecs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    if (!source.includes("from './e2e-helpers'") || !/parseDownloadedJsonFile[<(]/.test(source)) {
      offenders.push(relativePath(specUrl))
    }
    if (/readFile\([^\n]*(download|exported)Path/.test(source) || /JSON\.parse\([^\n]*(raw|exportedText)/.test(source)) {
      offenders.push(`${relativePath(specUrl)}: direct download parse`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `export download specs should use parseDownloadedJsonFile() so filename, path, read, and JSON parse assertions stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][export-artifact] parseDownloadedJsonFile helper owns filename/path/read/parse checks', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function parseDownloadedJsonFile/, 'tests/e2e-helpers.ts should export parseDownloadedJsonFile')
  assert.match(source, /download\.suggestedFilename\(\)[\s\S]*top3-favorites-\\d\{4\}/, 'helper should validate the Top3 export filename contract')
  assert.match(source, /download\.path\(\)/, 'helper should assert the downloaded artifact path exists')
  assert.match(source, /readFile\([^\n]*utf-8/, 'helper should read the downloaded JSON artifact')
  assert.match(source, /JSON\.parse\(/, 'helper should parse the downloaded JSON artifact')
}
)
