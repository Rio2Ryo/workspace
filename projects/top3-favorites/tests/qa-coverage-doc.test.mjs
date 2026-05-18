import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const coverageDocPath = new URL('../docs/AUTOMATED_QA_COVERAGE.md', import.meta.url)
const testsDir = new URL('./', import.meta.url)
const repoRoot = new URL('../', import.meta.url)

async function collectE2ESpecPaths(dirUrl, relBase = 'tests') {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const out = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue

    if (entry.isDirectory()) {
      const childUrl = new URL(`${entry.name}/`, dirUrl)
      const childBase = `${relBase}/${entry.name}`
      out.push(...(await collectE2ESpecPaths(childUrl, childBase)))
      continue
    }

    if (entry.name.endsWith('.e2e.spec.ts')) {
      out.push(`${relBase}/${entry.name}`)
    }
  }

  return out
}

test('coverage doc describes recursive E2E coverage scope', async () => {
  const doc = await readFile(coverageDocPath, 'utf8')
  assert.match(
    doc,
    /tests\/\*\*\/\*\.e2e\.spec\.ts/,
    'docs should describe recursive E2E scope as tests/**/*.e2e.spec.ts',
  )
})

test('automated QA coverage doc references every E2E spec', async () => {
  const [doc, e2eSpecs] = await Promise.all([
    readFile(coverageDocPath, 'utf8'),
    collectE2ESpecPaths(testsDir),
  ])

  const sortedSpecs = e2eSpecs.sort((a, b) => a.localeCompare(b, 'en'))
  assert.ok(sortedSpecs.length > 0, 'expected at least one E2E spec to document')

  const missing = sortedSpecs.filter((spec) => !doc.includes(spec))
  assert.deepEqual(missing, [], `Missing E2E specs in docs/AUTOMATED_QA_COVERAGE.md:\n${missing.join('\n')}`)
})

test('automated QA coverage doc does not include non-existent E2E paths', async () => {
  const doc = await readFile(coverageDocPath, 'utf8')
  const listed = Array.from(new Set(doc.match(/tests\/[\w./-]+\.e2e\.spec\.ts/g) ?? [])).sort((a, b) =>
    a.localeCompare(b, 'en'),
  )

  const missingOnDisk = []
  for (const spec of listed) {
    const specUrl = new URL(spec, repoRoot)
    try {
      const st = await stat(specUrl)
      if (!st.isFile()) missingOnDisk.push(spec)
    } catch {
      missingOnDisk.push(spec)
    }
  }

  assert.deepEqual(
    missingOnDisk,
    [],
    `docs/AUTOMATED_QA_COVERAGE.md contains non-existent E2E paths:\n${missingOnDisk.join('\n')}`,
  )
})
