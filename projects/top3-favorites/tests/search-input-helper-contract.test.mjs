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

function sourceImportsSearchInputHelper(source) {
  return /import \{[^}]*searchInput[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectSearchInput(source) {
  return /getByPlaceholder\(['"]例: カフェラテ \/ 柏の葉 \/ Solito['"]\)|getByRole\(['"]textbox['"],\s*\{\s*name:\s*['"]Top3検索['"]\s*\}\)/.test(source)
}

test('[E2E-Helper][search-input] E2E specs locate search input through shared helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesSearchInputHelper = /searchInput\(/.test(source)
    const usesDirectSearchInput = sourceUsesDirectSearchInput(source)

    if (usesDirectSearchInput) {
      offenders.push(`${relativePath(specUrl)}: direct search input locator`)
    }
    if (usesSearchInputHelper && !sourceImportsSearchInputHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use searchInput(page) so the Top3検索 accessible-name and placeholder contract stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][search-input] helper owns accessible search input mechanics', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function searchInput\(page: Page\): Locator/, 'tests/e2e-helpers.ts should export searchInput')
  assert.match(source, /page\.getByRole\(['"]textbox['"],\s*\{\s*name:\s*['"]Top3検索['"]\s*\}\)/, 'searchInput should prefer the accessible textbox name over placeholder text')
})
