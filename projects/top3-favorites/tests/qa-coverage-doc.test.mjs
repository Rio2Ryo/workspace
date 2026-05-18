import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const coverageDocPath = new URL('../docs/AUTOMATED_QA_COVERAGE.md', import.meta.url)
const testsDir = new URL('./', import.meta.url)

test('automated QA coverage doc references every E2E spec', async () => {
  const [doc, entries] = await Promise.all([
    readFile(coverageDocPath, 'utf8'),
    readdir(testsDir),
  ])

  const e2eSpecs = entries
    .filter((name) => name.endsWith('.e2e.spec.ts'))
    .map((name) => `tests/${name}`)
    .sort((a, b) => a.localeCompare(b, 'en'))

  assert.ok(e2eSpecs.length > 0, 'expected at least one E2E spec to document')

  const missing = e2eSpecs.filter((spec) => !doc.includes(spec))
  assert.deepEqual(missing, [], `Missing E2E specs in docs/AUTOMATED_QA_COVERAGE.md:\n${missing.join('\n')}`)
})
