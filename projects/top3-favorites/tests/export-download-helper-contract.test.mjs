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

test('[E2E-Helper][export-artifact] export download specs use shared download and parse helpers', async () => {
  const offenders = []

  for (const spec of exportSpecs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    if (!source.includes("from './e2e-helpers'") || !/parseDownloadedJsonFile[<(]/.test(source) || !/downloadJsonExport\(/.test(source)) {
      offenders.push(relativePath(specUrl))
    }
    if (/readFile\([^\n]*(download|exported)Path/.test(source) || /JSON\.parse\([^\n]*(raw|exportedText)/.test(source)) {
      offenders.push(`${relativePath(specUrl)}: direct download parse`)
    }
    if (/waitForEvent\(['"]download['"]\)/.test(source) || /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]JSONエクスポート['"]\s*\}\)\.click\(\)/.test(source)) {
      offenders.push(`${relativePath(specUrl)}: direct export download mechanics`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `export download specs should use downloadJsonExport() + parseDownloadedJsonFile() so button name, event wiring, filename, path, read, and JSON parse assertions stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][export-artifact] helper owns export button/event download mechanics', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function downloadJsonExport/, 'tests/e2e-helpers.ts should export downloadJsonExport')
  assert.match(source, /page\.waitForEvent\(['"]download['"]\)/, 'downloadJsonExport should wait for the Playwright download event')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]JSONエクスポート['"]\s*\}\)\.click\(\)/, 'downloadJsonExport should own the JSON export button accessible name')
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
