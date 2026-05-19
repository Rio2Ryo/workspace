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

function sourceImportsSearchSectionHelper(source) {
  return /import \{[^}]*searchSection(?:\s+as\s+searchSectionLocator)?[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectSearchSection(source) {
  return /locator\(['"]section\.card['"]\)\.filter\(\{\s*has:\s*page\.getByRole\(['"]heading['"],\s*\{\s*name:\s*['"]探す['"]\s*\}\)\s*\}\)/.test(source)
}

test('[E2E-Helper][search-section] E2E specs locate the search section through shared helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesSearchSectionHelper = /(?:searchSection|searchSectionLocator)\(/.test(source)
    const usesDirectSearchSection = sourceUsesDirectSearchSection(source)

    if (usesDirectSearchSection) {
      offenders.push(`${relativePath(specUrl)}: direct search section locator`)
    }
    if (usesSearchSectionHelper && !sourceImportsSearchSectionHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use searchSection(page) so the 探す section locator and heading contract stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][search-section] helper owns search section heading mechanics', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function searchSection\(page: Page\): Locator/, 'tests/e2e-helpers.ts should export searchSection')
  assert.match(source, /page\.locator\(['"]section\.card['"]\)\.filter\(\{\s*has:\s*page\.getByRole\(['"]heading['"],\s*\{\s*name:\s*['"]探す['"]\s*\}\)\s*\}\)/, 'searchSection should own the 探す section heading locator')
})
