import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(new URL(`${entry.name}/`, dirUrl))))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(relativePath(new URL(entry.name, dirUrl)))
    }
  }

  return specs.sort()
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function sourceImportsSearchClearHelper(source) {
  return /import \{[^}]*clearSearchTagFilter[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectSearchClear(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]クリア['"]\s*\}\)\.(?:click|toBeVisible|toHaveCount|toBeDisabled|not\.toBeVisible)\(/.test(source)
}

test('[E2E-Helper][search-clear] E2E specs clear search tags through shared helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesSearchClearHelper = /clearSearchTagFilter\(/.test(source)
    const usesDirectSearchClear = sourceUsesDirectSearchClear(source)

    if (usesDirectSearchClear) {
      offenders.push(`${relativePath(specUrl)}: direct search clear button interaction`)
    }
    if (usesSearchClearHelper && !sourceImportsSearchClearHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use clearSearchTagFilter() so the search clear button accessible name stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][search-clear] helper owns search clear button mechanics', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function clearSearchTagFilter/, 'tests/e2e-helpers.ts should export clearSearchTagFilter')
  assert.match(source, /const clearButton = searchSection\.getByRole\(['"]button['"],\s*\{\s*name:\s*['"]クリア['"]\s*\}\)/, 'clearSearchTagFilter should own the clear button accessible name')
  assert.match(source, /clearButton\.click\(\)/, 'clearSearchTagFilter should own the clear button click')
})
