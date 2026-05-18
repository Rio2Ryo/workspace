import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import test from 'node:test'
import { contractMessage, missingItemsMessage } from './qa-contract-message.mjs'

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

test('[Docs-Scope] coverage doc describes recursive E2E coverage scope', async () => {
  const doc = await readFile(coverageDocPath, 'utf8')
  assert.match(
    doc,
    /tests\/\*\*\/\*\.e2e\.spec\.ts/,
    contractMessage({ scope: 'Docs-Scope', rule: 'recursive E2E scope notation', expected: 'tests/**/*.e2e.spec.ts', fix: 'update docs/AUTOMATED_QA_COVERAGE.md scope notation' }),
  )
})

test('[Docs-Structure] coverage doc includes import preview category headings (1:1 with directory structure)', async () => {
  const doc = await readFile(coverageDocPath, 'utf8')
  const headings = [
    '#### import preview / direction',
    '#### import preview / live',
    '#### import preview / tags',
    '#### import preview / terms',
    '#### import preview / naming',
    '#### import preview / summary',
  ]

  for (const heading of headings) {
    assert.ok(doc.includes(heading), contractMessage({ scope: 'Docs-Structure', rule: 'import preview heading exists', expected: heading, fix: 'add missing heading in docs/AUTOMATED_QA_COVERAGE.md import preview section' }))
  }
})

test('[Docs-Completeness] automated QA coverage doc references every E2E spec', async () => {
  const [doc, e2eSpecs] = await Promise.all([
    readFile(coverageDocPath, 'utf8'),
    collectE2ESpecPaths(testsDir),
  ])

  const sortedSpecs = e2eSpecs.sort((a, b) => a.localeCompare(b, 'en'))
  assert.ok(sortedSpecs.length > 0, contractMessage({ scope: 'Docs-Completeness', rule: 'at least one E2E spec discovered', expected: 'non-empty tests/**/*.e2e.spec.ts set', fix: 'ensure E2E specs exist and collection logic points to tests/' }))

  const missing = sortedSpecs.filter((spec) => !doc.includes(spec))
  assert.deepEqual(
    missing,
    [],
    missingItemsMessage({
      scope: 'Docs-Completeness',
      rule: 'all E2E specs are documented in AUTOMATED_QA_COVERAGE',
      fix: 'add missing tests/**/*.e2e.spec.ts entries to docs/AUTOMATED_QA_COVERAGE.md',
      items: missing,
    }),
  )
})

test('[Docs-Integrity] automated QA coverage doc does not include non-existent E2E paths', async () => {
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
    missingItemsMessage({
      scope: 'Docs-Integrity',
      rule: 'all documented E2E paths exist on disk',
      fix: 'remove or correct stale test paths in docs/AUTOMATED_QA_COVERAGE.md',
      items: missingOnDisk,
    }),
  )
})
