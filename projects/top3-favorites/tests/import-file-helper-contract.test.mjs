import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const validationSpecs = [
  'tests/import-fail-closed-matrix.e2e.spec.ts',
  'tests/import-validation-error-details.e2e.spec.ts',
  'tests/import-validation-trimmed-fields.e2e.spec.ts',
]

function relativePath(url) {
  return url.pathname.replace(root.pathname, '')
}

test('[E2E-Helper][import-file] validation specs upload JSON through shared helper', async () => {
  const offenders = []

  for (const spec of validationSpecs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    if (!source.includes("from './e2e-helpers'") || !/uploadJsonImportFile\(/.test(source)) {
      offenders.push(relativePath(specUrl))
    }
    if (/locator\('input\[type="file"\]\[accept\*="json"\]'\)|\.setInputFiles\(/.test(source)) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import validation specs should use uploadJsonImportFile() so file input selector, mime type, and JSON/string buffer creation stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] uploadJsonImportFile helper owns selector/mime/buffer mechanics', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function uploadJsonImportFile/, 'tests/e2e-helpers.ts should export uploadJsonImportFile')
  assert.match(source, /input\[type="file"\]\[accept\*="json"\]/, 'helper should own the JSON file input selector')
  assert.match(source, /mimeType: 'application\/json'/, 'helper should own the import JSON mime type')
  assert.match(source, /typeof body === 'string' \? body : JSON\.stringify\(body\)/, 'helper should support both raw invalid JSON strings and serializable JSON bodies')
  assert.match(source, /Buffer\.from\([^\n]*'utf-8'\)/, 'helper should create the UTF-8 upload buffer')
})
